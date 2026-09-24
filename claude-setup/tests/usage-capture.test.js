'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers');
const usage = require('../usage');

const hookScript = path.join(repositoryRoot, 'claude-setup', 'hooks', 'usage-capture.js');
const cli = path.join(repositoryRoot, 'bin', 'buaflow.js');

function project(t, { consent = true } = {}) {
  const parent = temporaryProject('buaflow-capture-');
  const root = path.join(parent, 'demo');
  const home = path.join(parent, 'home');
  fs.mkdirSync(root);
  fs.mkdirSync(home);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Test Owner');
  git('config', 'user.email', 'owner@example.test');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  if (consent !== null) writeJson(usage.consentFile(root), { schemaVersion: '1.0', enabled: consent, project: 'demo', decidedBy: 'Test Owner', decidedAt: '2026-09-24' });
  t.after(() => cleanup(parent));
  const env = { HOME: home, USERPROFILE: home };
  const hook = (input) => runNode(hookScript, { cwd: root, env, input: { cwd: root, session_id: 's-1', ...input } });
  const start = (input = {}) => hook({ hook_event_name: 'SessionStart', source: 'startup', ...input });
  const put = (rel, text, input = {}) => {
    write(path.join(root, rel), text);
    return hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, rel) }, ...input });
  };
  const events = () => {
    const dir = usage.eventsDir(root);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean).map(JSON.parse));
  };
  return { root, home, env, git, hook, start, put, events };
}

const task = ({ id = 'T-001', status = 'todo', extra = '' } = {}) => [
  '---', `id: ${id}`, 'title: demo', 'type: feat', `status: ${status}`, 'estimate: 1', 'started: 2026-09-20', 'closed: 2026-09-24', 'commit: abc1234', extra, '---', '',
  '## ทำอะไร', 'demo', '', '## Acceptance Criteria', '- [ ] **AC-1** Given a When b Then c', '- [x] **AC-2** second', '', '## ขอบเขต', '- x', '',
].join('\n');

const plan = (approvedBy) => ['---', 'task: T-001', 'created: 2026-09-24', `approved_by: ${approvedBy}`, '---', '', '# Plan: demo', ''].join('\n');

function assertValid(events) {
  for (const event of events) assert.deepEqual(usage.validateEvent(event), [], JSON.stringify(event));
}

test('AC-2 without consent, or with consent off, the hook writes nothing at all', (t) => {
  for (const consent of [null, false]) {
    const p = project(t, { consent });
    assert.equal(p.start().stdout, '', 'no notice for an unanswered or declined project');
    const r = p.put('docs/backlog/tasks/T-001-demo.md', task());
    assert.equal(r.status, 0);
    assert.equal(p.hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
    assert.equal(fs.existsSync(usage.usageDir(p.root)), false, `consent ${consent}`);
  }
});

test('AC-5 an opted-in session opens with one line saying so and how to switch it off', (t) => {
  const p = project(t);
  const r = p.start();
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /เก็บข้อมูลการใช้งาน Buaflow/);
  assert.match(out.systemMessage, /enabled: false/);
  assert.equal(out.systemMessage.split('\n').length, 1);
});

test('an unreadable consent file records nothing and says so at session start', (t) => {
  const p = project(t, { consent: null });
  write(usage.consentFile(p.root), '{ not json');
  const r = p.start();
  assert.match(JSON.parse(r.stdout).systemMessage, /อ่านไม่ได้/);
  p.put('docs/intents/I-001-x.md', '# intent\n');
  assert.equal(fs.existsSync(usage.usageDir(p.root)), false);
});

test('AC-6 a new intent is recorded once with its content', (t) => {
  const p = project(t);
  p.start();
  p.put('docs/intents/I-001-x.md', '# Intent: faster checkout\n');
  p.put('docs/intents/I-001-x.md', '# Intent: faster checkout\n\nmore\n');
  const events = p.events();
  assert.deepEqual(events.map((e) => e.type), ['intent.opened']);
  assert.equal(events[0].data.path, 'docs/intents/I-001-x.md');
  assert.match(events[0].data.content, /faster checkout/);
  assert.equal(events[0].sessionId, 's-1');
  assertValid(events);
});

test('AC-7 a plan counts as approved only when approved_by names someone', (t) => {
  const p = project(t);
  p.start();
  p.put('docs/plans/T-001.md', plan('<ใครอนุมัติ>'));
  assert.deepEqual(p.events(), []);
  p.put('docs/plans/T-001.md', plan('Test Owner'));
  p.put('docs/plans/T-001.md', `${plan('Test Owner')}\nedited\n`);
  const events = p.events();
  assert.deepEqual(events.map((e) => e.type), ['plan.approved']);
  assert.equal(events[0].task, 'T-001');
  assert.equal(events[0].data.approvedBy, 'Test Owner');
  assert.match(events[0].data.content, /# Plan: demo/);
});

test('AC-8 a new task carries its acceptance criteria, estimate and fixes link', (t) => {
  const p = project(t);
  p.start();
  p.put('docs/backlog/tasks/T-004-fix.md', task({ id: 'T-004', extra: 'fixes: T-003' }));
  const [event] = p.events();
  assert.equal(event.type, 'task.created');
  assert.equal(event.task, 'T-004');
  assert.deepEqual(event.data.acceptance, ['**AC-1** Given a When b Then c', '**AC-2** second']);
  assert.equal(event.data.estimate, '1');
  assert.equal(event.data.fixes, 'T-003');
  assertValid([event]);
});

test('AC-9 status changes are recorded forward and backward, and ones made outside a session are reconciled', (t) => {
  const p = project(t);
  p.start();
  const rel = 'docs/backlog/tasks/T-001-demo.md';
  p.put(rel, task({ status: 'todo' }));
  p.put(rel, task({ status: 'in-progress' }));
  p.put(rel, task({ status: 'review' }));
  p.put(rel, task({ status: 'in-progress' }));
  const moves = p.events().filter((e) => e.type === 'task.status').map((e) => `${e.data.from}>${e.data.to}`);
  assert.deepEqual(moves, ['todo>in-progress', 'in-progress>review', 'review>in-progress']);

  write(path.join(p.root, rel), task({ status: 'review' })); // an editor, or a pull — no hook sees it
  p.start({ session_id: 's-2' });
  const reconciled = p.events().at(-1);
  assert.equal(reconciled.type, 'task.status');
  assert.deepEqual(reconciled.data, { from: 'in-progress', to: 'review', source: 'reconcile' });
  assert.equal(reconciled.sessionId, null);
  assert.equal(reconciled.model, 'unknown');
  p.start({ session_id: 's-3' });
  assert.equal(p.events().length, 5, 'nothing changed, nothing new');
});

test('AC-12 moving to done records task.done with commit, dates and the sessions that worked on it', (t) => {
  const p = project(t);
  p.start();
  const rel = 'docs/backlog/tasks/T-001-demo.md';
  p.put(rel, task({ status: 'in-progress' }));
  p.put(rel, task({ status: 'review' }), { session_id: 's-2' });
  p.put(rel, task({ status: 'done' }), { session_id: 's-2' });
  const events = p.events();
  assert.deepEqual(events.slice(-2).map((e) => e.type), ['task.status', 'task.done']);
  assert.deepEqual(events.at(-1).data, { commit: 'abc1234', started: '2026-09-20', closed: '2026-09-24', sessions: 2 });
  assertValid(events);
});

test('template placeholders are recorded as null, never as values', (t) => {
  const p = project(t);
  p.start();
  const rel = 'docs/backlog/tasks/T-001-demo.md';
  p.put(rel, task({ status: 'review' }).replace('commit: abc1234', 'commit: <hash บน main>').replace('closed: 2026-09-24', 'closed: YYYY-MM-DD'));
  p.put(rel, task({ status: 'done' }).replace('commit: abc1234', 'commit: <hash บน main>').replace('closed: 2026-09-24', 'closed: YYYY-MM-DD'));
  const done = p.events().at(-1);
  assert.equal(done.data.commit, null);
  assert.equal(done.data.closed, null);
});

test('AC-15 a task that keeps the template\'s fixes: line unedited records fixes as null, not as a link', (t) => {
  const p = project(t);
  p.start();
  const line = fs.readFileSync(path.join(repositoryRoot, 'templates', 'task.tpl.md'), 'utf8').match(/^fixes:.*$/m)[0];
  p.put('docs/backlog/tasks/T-001-demo.md', task({ extra: line }));
  assert.equal(p.events()[0].data.fixes, null);
});

test('AC-23 session start records where readiness stands on first contact and again only when readiness.json changes', (t) => {
  const p = project(t);
  const { controlsFor, validateManifest } = require('../readiness.js');
  const manifest = (generatedAt) => {
    const controls = {};
    for (const id of controlsFor('R0')) controls[id] = { status: 'pass', evidence: [{ type: 'command', value: `check ${id}` }] };
    return { schemaVersion: '1.0', project: 'demo', profile: 'test', targetLevel: 'R0', commit: 'WORKTREE', generatedAt, controls };
  };
  const file = path.join(p.root, 'docs', 'evidence', 'readiness.json');
  const snapshots = () => p.events().filter((e) => e.type === 'readiness.snapshot');

  p.start();
  assert.deepEqual(snapshots(), [], 'no readiness.json, nothing to say');
  writeJson(file, manifest('2026-09-20T00:00:00.000Z'));
  p.start();
  p.start();
  assert.equal(snapshots().length, 1, 'unchanged since the last look');
  const expected = validateManifest(manifest('2026-09-20T00:00:00.000Z'), { root: p.root });
  assert.deepEqual(snapshots()[0].data, { level: 'R0', generatedAt: '2026-09-20T00:00:00.000Z', manifestCommit: 'WORKTREE', outcome: expected.outcome, passed: expected.passed, required: expected.required });
  assert.equal(snapshots()[0].model, 'unknown');

  write(file, JSON.stringify(manifest('2026-09-20T00:00:00.000Z'))); // a formatter squeezes it onto one line
  p.start();
  assert.equal(snapshots().length, 1, 'the same content laid out differently is not a new state');

  writeJson(file, manifest('2026-09-24T00:00:00.000Z'));
  p.start();
  assert.equal(snapshots().at(-1).data.generatedAt, '2026-09-24T00:00:00.000Z');
  write(file, '{ not json');
  p.start();
  assert.equal(snapshots().at(-1).data.outcome, 'unreadable');
  assertValid(snapshots());
});

test('AC-23 a project that already has readiness.json when it opts in is recorded on first contact', (t) => {
  const p = project(t);
  writeJson(path.join(p.root, 'docs', 'evidence', 'readiness.json'), { schemaVersion: '1.0', targetLevel: 'R1', generatedAt: '2026-09-01T00:00:00.000Z', controls: {} });
  p.start();
  const [snapshot] = p.events().filter((e) => e.type === 'readiness.snapshot');
  assert.equal(snapshot.data.level, 'R1');
  assert.equal(snapshot.data.outcome, 'fail', 'a manifest missing its controls is recorded as it stands, not skipped');
});

test('AC-4 switching consent off stops recording and keeps what was already recorded', (t) => {
  const p = project(t);
  p.start();
  p.put('docs/intents/I-001-x.md', '# one\n');
  const before = fs.readdirSync(usage.eventsDir(p.root));
  writeJson(usage.consentFile(p.root), { schemaVersion: '1.0', enabled: false, project: 'demo', decidedBy: 'Test Owner', decidedAt: '2026-09-24' });
  p.put('docs/intents/I-002-y.md', '# two\n');
  assert.equal(p.events().length, 1);
  assert.deepEqual(fs.readdirSync(usage.eventsDir(p.root)), before);
});

test('first contact: an old project does not replay its history, and the file being written is judged by its committed version', (t) => {
  const p = project(t);
  write(path.join(p.root, 'docs/backlog/tasks/T-001-old.md'), task({ id: 'T-001', status: 'todo' }));
  write(path.join(p.root, 'docs/backlog/tasks/T-002-old.md'), task({ id: 'T-002', status: 'done' }));
  write(path.join(p.root, 'docs/intents/I-001-old.md'), '# old\n');
  p.git('add', '-A');
  p.git('commit', '-q', '-m', 'history');
  // Consent was just given mid-session: no SessionStart has run yet.
  p.put('docs/backlog/tasks/T-001-old.md', task({ id: 'T-001', status: 'in-progress' }));
  p.put('docs/intents/I-002-new.md', '# new\n');
  assert.deepEqual(p.events().map((e) => `${e.type}:${e.task ?? e.data.path}`), ['task.status:T-001', 'intent.opened:docs/intents/I-002-new.md']);
  p.start();
  assert.equal(p.events().length, 2, 'the baseline is not re-reported by reconcile');
});

test('AC-14 the model comes from the hook input or the transcript tail, otherwise unknown', (t) => {
  const p = project(t);
  const transcript = path.join(p.root, '..', 'transcript.jsonl');
  write(transcript, `${JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5', content: [] } })}\n`);
  p.start({ model: 'claude-opus-5-5' });
  p.put('docs/intents/I-001-a.md', '# a\n', { transcript_path: transcript });
  p.put('docs/intents/I-002-b.md', '# b\n', { transcript_path: path.join(p.root, 'missing.jsonl') });
  assert.deepEqual(p.events().map((e) => e.model), ['claude-sonnet-5', 'unknown']);
  assert.equal(usage.readState(p.root).marker.model, 'unknown');
});

test('PreToolUse Bash refreshes the marker, so buaflow usage record check knows the model', (t) => {
  const p = project(t);
  const transcript = path.join(p.root, '..', 'transcript.jsonl');
  write(transcript, `${JSON.stringify({ message: { model: 'claude-fable-5-1' } })}\n`);
  assert.equal(p.hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'buaflow usage record check' }, transcript_path: transcript }).stdout, '');
  const r = runNode(cli, { cwd: p.root, env: p.env, args: ['usage', 'record', 'check', '--task', 'T-001', '--verdict', 'pass', '--json'] });
  assert.equal(r.status, 0, r.stderr);
  const [event] = p.events();
  assert.equal(event.model, 'claude-fable-5-1');
  assert.equal(event.sessionId, 's-1');
  assert.deepEqual(usage.readState(p.root).sessions['T-001'], ['s-1']);
});

test('a session that has cd-ed into a subfolder still records against the project root', (t) => {
  const p = project(t);
  const sub = path.join(p.root, 'frontend', 'src');
  fs.mkdirSync(sub, { recursive: true });
  const inSub = (input) => runNode(hookScript, { cwd: sub, env: p.env, input: { cwd: sub, session_id: 's-1', ...input } });
  assert.match(JSON.parse(inSub({ hook_event_name: 'SessionStart' }).stdout).systemMessage, /เก็บข้อมูลการใช้งาน/);
  write(path.join(p.root, 'docs/intents/I-001-a.md'), '# a\n');
  inSub({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(p.root, 'docs/intents/I-001-a.md') } });
  write(path.join(p.root, 'docs/intents/I-002-b.md'), '# b\n');
  inSub({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '../../docs/intents/I-002-b.md' } });
  assert.deepEqual(p.events().map((e) => e.data.path), ['docs/intents/I-001-a.md', 'docs/intents/I-002-b.md']);
  assert.equal(fs.existsSync(path.join(sub, '.buaflow')), false);
});

test('a nested repository inside an opted-in project does not hide the project, and neither does /check from a subfolder', (t) => {
  const p = project(t);
  const nested = path.join(p.root, 'vendor', 'lib');
  fs.mkdirSync(nested, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: nested });
  write(path.join(p.root, 'docs/intents/I-001-a.md'), '# a\n');
  runNode(hookScript, { cwd: nested, env: p.env, input: { cwd: nested, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(p.root, 'docs/intents/I-001-a.md') } } });
  const r = runNode(cli, { cwd: nested, env: p.env, args: ['usage', 'record', 'check', '--task', 'T-001', '--verdict', 'fail', '--json'] });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(p.events().map((e) => e.type), ['intent.opened', 'check.result']);
  assert.equal(fs.existsSync(path.join(nested, '.buaflow')), false);
});

test('a consent-shaped file outside any repository (the machine config in ~/.buaflow) is never taken for consent', (t) => {
  const p = project(t, { consent: null });
  // The project lives under a folder that has .buaflow/usage.json, as a project under the home directory does.
  writeJson(path.join(p.root, '..', '.buaflow', 'usage.json'), { schemaVersion: '1.0', store: 'D:/elsewhere', machine: 'm', lastReviewAt: null });
  assert.equal(p.start().stdout, '');
  assert.equal(usage.projectRoot(path.join(p.root, 'docs')), p.root);
});

test('a Bash hook running beside a Write hook cannot overwrite what the Write saw: it only touches the marker', (t) => {
  const p = project(t);
  p.start();
  p.put('docs/backlog/tasks/T-001-demo.md', task({ status: 'todo' }));
  const state = fs.readFileSync(usage.stateFile(p.root), 'utf8');
  const markerBefore = fs.readFileSync(usage.markerFile(p.root), 'utf8');
  p.hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 's-9' });
  p.hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(p.root, 'src/app.js') }, session_id: 's-9' });
  assert.equal(fs.readFileSync(usage.stateFile(p.root), 'utf8'), state, 'state.json is written only by SessionStart and watched writes');
  assert.notEqual(fs.readFileSync(usage.markerFile(p.root), 'utf8'), markerBefore);
  assert.equal(usage.readState(p.root).marker.sessionId, 's-9');
  assert.doesNotMatch(JSON.stringify(JSON.parse(state)), /"marker"/);
  assert.deepEqual(fs.readdirSync(usage.usageDir(p.root)).filter((name) => name.endsWith('.tmp')), []);
});

test('AC-20 recorded events never show up in the project\'s git status', (t) => {
  const p = project(t);
  p.start();
  p.put('docs/intents/I-001-x.md', '# x\n');
  assert.ok(p.events().length);
  const porcelain = p.git('status', '--porcelain', '--untracked-files=all').stdout;
  assert.doesNotMatch(porcelain, /\.buaflow\/usage\//);
});

test('security: paths outside the three folders or outside the project are never recorded, and secrets are redacted', (t) => {
  const p = project(t);
  p.start();
  write(path.join(p.root, '..', '.env'), 'TOKEN=AKIAABCDEFGHIJKLMNOP\n');
  for (const file of ['../.env', path.join(p.root, '..', '.env'), 'docs/intents/../../.env', 'src/app.md', 'docs/intents/sub/I-9.md']) {
    assert.equal(p.hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file } }).status, 0);
  }
  assert.deepEqual(p.events(), []);
  p.put('docs/intents/I-001-x.md', '# key AKIAABCDEFGHIJKLMNOP\n');
  const [event] = p.events();
  assert.doesNotMatch(event.data.content, /AKIA/);
  assert.match(event.data.content, /\[REDACTED\]/);
});

test('the hook never fails the session: bad input, a broken state file and a missing project all exit 0 quietly', (t) => {
  const p = project(t);
  const garbage = spawnSync(process.execPath, [hookScript], { cwd: p.root, input: 'not json', encoding: 'utf8', env: { ...process.env, ...p.env } });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stderr, '');
  write(usage.stateFile(p.root), '{ broken');
  assert.equal(p.put('docs/intents/I-001-x.md', '# x\n').status, 0);
  const missing = runNode(hookScript, { cwd: p.root, env: p.env, input: { hook_event_name: 'SessionStart', cwd: path.join(p.root, 'nope') } });
  assert.equal(missing.status, 0);
  assert.equal(missing.stderr, '');
});

test('the commit read from .git matches git itself: loose ref, packed refs and a worktree', (t) => {
  const p = project(t);
  const expected = () => p.git('rev-parse', '--short=7', 'HEAD').stdout.trim();
  assert.equal(usage.headCommit(p.root), expected());
  p.git('pack-refs', '--all');
  assert.equal(usage.headCommit(p.root), expected());
  const tree = path.join(p.root, '..', 'wt');
  p.git('worktree', 'add', '-q', '-b', 'side', tree);
  write(path.join(tree, 'x.txt'), 'x');
  spawnSync('git', ['add', '-A'], { cwd: tree });
  spawnSync('git', ['commit', '-q', '-m', 'side'], { cwd: tree });
  assert.equal(usage.headCommit(tree), spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: tree, encoding: 'utf8' }).stdout.trim());
  assert.notEqual(usage.headCommit(tree), usage.headCommit(p.root));
});

test('NF the hook stays inside its time budget (median of 5, over a bare node start)', (t) => {
  // Each run is paired with a bare `node -e ""` right beside it: under a loaded test suite starting node alone
  // swings past 150 ms, which says nothing about the hook. What is budgeted is what the hook adds on top.
  const elapsed = (run) => {
    const started = process.hrtime.bigint();
    run();
    return Number(process.hrtime.bigint() - started) / 1e6;
  };
  const bare = () => spawnSync(process.execPath, ['-e', ''], { input: '{}' });
  const overhead = (run) => {
    const diffs = [];
    for (let i = 0; i < 5; i++) diffs.push(elapsed(() => run(i)) - elapsed(bare));
    return diffs.sort((a, b) => a - b)[2];
  };
  const on = project(t);
  on.start();
  const recording = overhead((i) => on.put('docs/backlog/tasks/T-001-demo.md', task({ status: ['todo', 'in-progress', 'review', 'in-progress', 'review'][i] })));
  const off = project(t, { consent: null });
  const idle = overhead(() => off.hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }));
  assert.ok(recording < 200, `recording added ${recording.toFixed(0)} ms over node itself`);
  assert.ok(idle < 50, `no consent added ${idle.toFixed(0)} ms over node itself`);
});
