'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers');
const usage = require('../usage');
const { parse } = require('../../bin/buaflow');

const hookScript = path.join(repositoryRoot, 'claude-setup', 'hooks', 'usage-capture.js');

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

// machine config lives under the home directory; every call below runs as one machine
function asMachine(home, run) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try { return run(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function identity(dir) {
  git(dir, 'config', 'user.name', 'Test Owner');
  git(dir, 'config', 'user.email', 'owner@example.test');
}

// A private store (bare repo), a clone of it per machine, and one opted-in project per machine.
function world(t) {
  const base = temporaryProject('buaflow-sync-');
  t.after(() => cleanup(base));
  const bare = path.join(base, 'store.git');
  git(base, 'init', '--bare', '-q', '-b', 'main', bare);
  const seed = path.join(base, 'seed');
  git(base, 'clone', '-q', bare, seed);
  identity(seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  write(path.join(seed, 'README.md'), '# usage store\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'init');
  git(seed, 'push', '-q', '-u', 'origin', 'main');

  const machine = (name) => {
    const home = path.join(base, `home-${name}`);
    const store = path.join(base, `store-${name}`);
    const root = path.join(base, `project-${name}`);
    fs.mkdirSync(home);
    git(base, 'clone', '-q', bare, store);
    identity(store);
    fs.mkdirSync(root);
    git(root, 'init', '-q');
    identity(root);
    git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
    writeJson(usage.consentFile(root), { schemaVersion: '1.0', enabled: true, project: 'demo', decidedBy: 'Test Owner', decidedAt: '2026-09-24' });
    const run = (fn) => asMachine(home, fn);
    const cmd = (...args) => run(() => usage.runCommand(root, args));
    const record = (n, task = 'T-001') => run(() => {
      for (let i = 0; i < n; i++) usage.record(root, { type: 'check.result', task, data: { verdict: 'pass', findings: [], level: null } });
    });
    return { name, home, store, root, run, cmd, record };
  };

  // Every line the store holds for a project, read from what was pushed, not from any clone.
  const pushed = (project = 'demo') => {
    const files = git(base, '--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main', `events/${project}`).stdout.split('\n').filter(Boolean);
    return files.flatMap((file) => git(base, '--git-dir', bare, 'show', `main:${file}`).stdout.split('\n').filter(Boolean).map((line) => ({ file, event: JSON.parse(line) })));
  };
  return { base, bare, machine, pushed };
}

function localEvents(root) {
  const dir = usage.eventsDir(root);
  return fs.readdirSync(dir).flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean));
}

test('usage setup records the store for this machine only when it is a git work tree, and keeps lastReviewAt', (t) => {
  const w = world(t);
  const a = w.machine('a');
  const bad = a.cmd('setup', '--store', path.join(w.base, 'nowhere'));
  assert.equal(bad.code, 1);
  assert.equal(fs.existsSync(path.join(a.home, '.buaflow', 'usage.json')), false);

  writeJson(path.join(a.home, '.buaflow', 'usage.json'), { schemaVersion: '1.0', store: 'old', machine: 'old-name', lastReviewAt: '2026-09-01' });
  const ok = a.cmd('setup', '--store', path.join(a.store, 'events', '..'), '--machine', 'Dev Laptop #1');
  assert.equal(ok.code, 0, ok.errors.join());
  const config = JSON.parse(fs.readFileSync(path.join(a.home, '.buaflow', 'usage.json'), 'utf8'));
  assert.equal(config.store, path.resolve(a.store));
  assert.equal(config.machine, 'dev-laptop-1');
  assert.equal(config.lastReviewAt, '2026-09-01');
  assert.equal(a.cmd('setup').code, 2, 'setup without --store is an input error');
});

test('AC-16 sync sends every unsynced event to events/<project>/<machine>/<date>.jsonl in the store', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  a.record(3);
  const r = a.cmd('sync');
  assert.equal(r.code, 0, `${r.summary} ${r.errors}`);
  assert.equal(r.data.synced, 3);
  const lines = w.pushed();
  assert.equal(lines.length, 3);
  const day = fs.readdirSync(usage.eventsDir(a.root))[0];
  assert.ok(lines.every((l) => l.file === `events/demo/m-a/${day}`));
  assert.equal(a.run(() => usage.pendingEvents(a.root)), 0);
  assert.equal(git(a.store, 'status', '--porcelain').stdout, '', 'nothing is left uncommitted in the clone');
});

test('AC-19 syncing again sends nothing twice, and two machines write two files that never collide', (t) => {
  const w = world(t);
  const a = w.machine('a');
  const b = w.machine('b');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  b.cmd('setup', '--store', b.store, '--machine', 'm-b');
  a.record(2);
  a.cmd('sync');
  assert.equal(a.cmd('sync').data.synced, 0);
  b.record(2, 'T-002');
  assert.equal(b.cmd('sync').code, 0, 'b pulls a\'s commit before pushing its own');
  a.record(1);
  assert.equal(a.cmd('sync').code, 0);
  const lines = w.pushed();
  assert.equal(lines.length, 5);
  assert.equal(new Set(lines.map((l) => l.event.id)).size, 5);
  assert.deepEqual([...new Set(lines.map((l) => l.file.split('/')[2]))].sort(), ['m-a', 'm-b']);
});

test('AC-17 a push that fails keeps every event and the next sync delivers it', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  git(a.store, 'remote', 'set-url', 'origin', path.join(w.base, 'gone.git'));
  a.record(2);
  const failed = a.cmd('sync');
  assert.equal(failed.code, 3);
  assert.equal(failed.data.pushed, false);
  assert.equal(localEvents(a.root).length, 2, 'nothing is removed from the project');
  assert.equal(w.pushed().length, 0);

  git(a.store, 'remote', 'set-url', 'origin', w.bare);
  const retried = a.cmd('sync');
  assert.equal(retried.code, 0, 'the commit left in the clone goes out even with nothing new');
  assert.equal(w.pushed().length, 2);
});

test('a commit that fails in the store leaves nothing behind, and the events go out once it works', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  const hook = path.join(a.store, '.git', 'hooks', 'pre-commit');
  write(hook, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(hook, 0o755);
  a.record(2);
  const failed = a.cmd('sync');
  assert.equal(failed.code, 3);
  assert.equal(git(a.store, 'status', '--porcelain', '--untracked-files=all').stdout, '');
  assert.equal(a.run(() => usage.pendingEvents(a.root)), 2);

  fs.rmSync(hook);
  assert.equal(a.cmd('sync').code, 0);
  assert.equal(w.pushed().length, 2, 'sent exactly once');
});

// Two machines under one name write the same file; the one whose push failed then pulls into a conflict.
test('a pull that conflicts never leaves the store mid-rebase, and nothing is committed or lost until it is sorted out', (t) => {
  const w = world(t);
  const a = w.machine('a');
  const b = w.machine('b');
  a.cmd('setup', '--store', a.store, '--machine', 'same');
  b.cmd('setup', '--store', b.store, '--machine', 'same');
  git(b.store, 'remote', 'set-url', 'origin', path.join(w.base, 'gone.git'));
  b.record(1);
  assert.equal(b.cmd('sync').code, 3, 'b commits locally, cannot push');
  a.record(1);
  assert.equal(a.cmd('sync').code, 0);
  git(b.store, 'remote', 'set-url', 'origin', w.bare);
  // A store that keeps no reflog must not hide which rebase is sync's own.
  git(b.store, 'config', 'core.logAllRefUpdates', 'false');
  fs.rmSync(path.join(b.store, '.git', 'logs'), { recursive: true, force: true });
  b.record(1);
  const pendingBefore = b.run(() => usage.pendingEvents(b.root));

  const conflicted = b.cmd('sync');
  assert.equal(conflicted.code, 3);
  assert.match(conflicted.errors.join(), /needs attention|rebase|detached/);
  const gitDir = git(b.store, 'rev-parse', '--absolute-git-dir').stdout.trim();
  assert.equal(fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply')), false, 'the rebase was aborted');
  assert.equal(git(b.store, 'symbolic-ref', '-q', 'HEAD').status, 0, 'back on a branch');
  assert.equal(b.run(() => usage.pendingEvents(b.root)), pendingBefore, 'no offset moved');
  assert.equal(localEvents(b.root).length, 2, 'every event is still in the project');
});

test('a conflict someone is resolving in the store is left exactly as it is', (t) => {
  const w = world(t);
  const a = w.machine('a');
  const b = w.machine('b');
  a.cmd('setup', '--store', a.store, '--machine', 'same');
  b.cmd('setup', '--store', b.store, '--machine', 'same');
  git(b.store, 'remote', 'set-url', 'origin', path.join(w.base, 'gone.git'));
  b.record(1);
  b.cmd('sync');
  a.record(1);
  a.cmd('sync');
  git(b.store, 'remote', 'set-url', 'origin', w.bare);
  // The person follows the message: pull --rebase by hand, and is now in the middle of resolving it.
  assert.notEqual(git(b.store, 'pull', '--rebase', '--quiet').status, 0);
  const gitDir = git(b.store, 'rev-parse', '--absolute-git-dir').stdout.trim();
  assert.ok(fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply')));
  const status = git(b.store, 'status', '--porcelain').stdout;

  b.record(1);
  const r = b.cmd('sync');
  assert.equal(r.code, 3);
  assert.match(r.errors.join(), /a rebase is in progress/);
  assert.ok(fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply')), 'their rebase is still there');
  assert.equal(git(b.store, 'status', '--porcelain').stdout, status, 'their working tree is untouched');
  git(b.store, 'rebase', '--abort');
});

test('a store left on a detached HEAD gets nothing appended or committed', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  git(a.store, 'checkout', '-q', '--detach');
  a.record(1);
  const r = a.cmd('sync');
  assert.equal(r.code, 3);
  assert.match(r.errors.join(), /detached/);
  assert.equal(git(a.store, 'status', '--porcelain', '--untracked-files=all').stdout, '');
  assert.equal(a.run(() => usage.pendingEvents(a.root)), 1);
});

test('AC-2 a project that has not said yes, or said no, is never synced', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  a.record(1);
  writeJson(usage.consentFile(a.root), { schemaVersion: '1.0', enabled: false, project: 'demo', decidedBy: 'Test Owner', decidedAt: '2026-09-24' });
  assert.equal(a.cmd('sync').data.synced, 0);
  fs.rmSync(usage.consentFile(a.root));
  assert.equal(a.cmd('sync').data.synced, 0);
  assert.equal(w.pushed().length, 0);
  assert.equal(git(a.store, 'log', '--oneline').stdout.split('\n').filter(Boolean).length, 1);
});

test('a line still being written is left for the next round', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  a.record(1);
  const file = path.join(usage.eventsDir(a.root), fs.readdirSync(usage.eventsDir(a.root))[0]);
  const half = JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), id: '00000000-0000-4000-8000-000000000000' });
  fs.appendFileSync(file, half.slice(0, 20));
  assert.equal(a.cmd('sync').data.synced, 1);
  fs.appendFileSync(file, `${half.slice(20)}\n`);
  assert.equal(a.cmd('sync').data.synced, 1);
  assert.deepEqual(w.pushed().map((l) => typeof l.event.id), ['string', 'string']);
});

test('a sync already running is left alone, and a lock left by a dead sync does not block forever', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  a.record(1);
  const lock = path.join(a.store, '.git', 'buaflow-usage.lock');
  write(lock, '12345');
  const busy = a.cmd('sync');
  assert.equal(busy.data.locked, true);
  assert.equal(w.pushed().length, 0);
  const old = new Date(Date.now() - usage.LOCK_STALE_MS - 1000);
  fs.utimesSync(lock, old, old);
  assert.equal(a.cmd('sync').data.synced, 1);
  assert.equal(fs.existsSync(lock), false);
});

test('AC-18 without a store the session start line says how to set one up and how many events wait', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.record(2);
  const r = a.cmd('sync');
  assert.equal(r.code, 0);
  assert.deepEqual(r.warnings, ['buaflow usage setup --store <path to your clone>']);
  const out = runNode(hookScript, { cwd: a.root, env: { HOME: a.home, USERPROFILE: a.home }, input: { cwd: a.root, hook_event_name: 'SessionStart', session_id: 's' } });
  const line = JSON.parse(out.stdout).systemMessage;
  assert.equal(line.split('\n').length, 1);
  assert.match(line, /buaflow usage setup --store/);
  assert.match(line, /ค้าง sync 2 event/);
  assert.equal(localEvents(a.root).length, 2);
});

test('every command a warning or the session line names actually parses (carried from EV-011.1)', (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.record(1);
  const texts = [a.cmd('status').warnings.join(' '), a.run(() => usage.sessionNotice('enabled', a.root)), usage.sessionNotice('invalid', a.root)];
  // A command ends where the plain-ASCII run ends: Thai prose or a · separator follows it.
  const commands = texts.join(' · ').match(/buaflow usage [A-Za-z0-9<>\-. /]+/g);
  assert.ok(commands.length >= 3, commands.join(' | '));
  for (const command of commands) {
    const argv = command.trim().replace(/<[^>]+>/g, 'X').split(/\s+/).slice(1);
    const parsed = parse(argv);
    assert.equal(parsed.command, 'usage', command);
    assert.doesNotThrow(() => usage.parseArgs(parsed.options.args), command);
  }
});

test('SessionEnd returns at once and the sync it starts finishes on its own', async (t) => {
  const w = world(t);
  const a = w.machine('a');
  a.cmd('setup', '--store', a.store, '--machine', 'm-a');
  a.record(2);
  const marker = fs.existsSync(usage.markerFile(a.root)) ? fs.readFileSync(usage.markerFile(a.root), 'utf8') : null;
  const started = Date.now();
  const r = runNode(hookScript, { cwd: a.root, env: { HOME: a.home, USERPROFILE: a.home }, input: { cwd: a.root, hook_event_name: 'SessionEnd', session_id: 's-ending' } });
  assert.equal(r.status, 0);
  assert.ok(Date.now() - started < 1000, `SessionEnd took ${Date.now() - started} ms`);
  const lock = path.join(a.store, '.git', 'buaflow-usage.lock');
  for (let i = 0; i < 150 && (w.pushed().length < 2 || fs.existsSync(lock)); i++) await new Promise((done) => setTimeout(done, 100));
  assert.equal(w.pushed().length, 2);
  assert.equal(fs.existsSync(usage.markerFile(a.root)) ? fs.readFileSync(usage.markerFile(a.root), 'utf8') : null, marker, 'an ending session leaves the marker alone');
});
