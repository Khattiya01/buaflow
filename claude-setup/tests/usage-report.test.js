'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers');
const report = require('../usage-report');
const { parse } = require('../../bin/buaflow');

const hookScript = path.join(repositoryRoot, 'claude-setup', 'hooks', 'usage-capture.js');
const cli = path.join(repositoryRoot, 'bin', 'buaflow.js');
const NOW = new Date('2026-09-24T12:00:00.000Z');

let serial = 0;
function ev(fields) {
  serial++;
  return {
    schemaVersion: '1.0',
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    type: 'check.result',
    at: `2026-09-${String(10 + (serial % 10)).padStart(2, '0')}T0${serial % 10}:00:00.000Z`,
    project: 'alpha',
    task: 'T-1',
    model: 'unknown',
    kitVersion: '3.13.0',
    commit: 'abc1234',
    sessionId: null,
    machine: 'm1',
    data: {},
    ...fields,
  };
}

const lines = (events) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;

// alpha: T-1 (opus) fails once, moves back once (and a teammate's clone reconciles the same move), is fixed by T-2.
//        T-3 (sonnet) fails once. T-4 has only the same reconciled move from two clones.
// beta:  readiness from an older audit and a newer snapshot.
function fixture(t) {
  const base = temporaryProject('buaflow-report-');
  t.after(() => cleanup(base));
  const store = path.join(base, 'store');
  const home = path.join(base, 'home');
  writeJson(path.join(home, '.buaflow', 'usage.json'), { schemaVersion: '1.0', store, machine: 'm1', lastReviewAt: null });
  const opus = 'claude-opus-5-5';
  const sonnet = 'claude-sonnet-5';
  const failT1 = ev({ at: '2026-09-11T10:00:00.000Z', model: opus, data: { verdict: 'fail', findings: ['must-fix: x'], level: 'medium' } });
  const m1 = [
    ev({ type: 'intent.opened', task: null, at: '2026-09-10T08:00:00.000Z', model: opus, data: { path: 'docs/intents/I-001-x.md', content: '# intent' } }),
    ev({ type: 'task.created', at: '2026-09-10T09:00:00.000Z', model: opus, data: { path: 'docs/backlog/tasks/T-1.md', acceptance: ['AC-1'], estimate: '1', fixes: null, content: '---\nid: T-1\nintent: docs/intents/I-001-x.md\n---\n' } }),
    failT1,
    ev({ at: '2026-09-12T10:00:00.000Z', model: opus, data: { verdict: 'pass', findings: [], level: 'medium' } }),
    ev({ type: 'task.status', at: '2026-09-11T09:00:00.000Z', model: opus, data: { from: 'todo', to: 'in-progress' } }),
    ev({ type: 'task.status', at: '2026-09-11T11:00:00.000Z', model: opus, data: { from: 'review', to: 'in-progress' } }),
    ev({ type: 'task.done', at: '2026-09-13T10:00:00.000Z', model: opus, data: { commit: 'def5678', started: '2026-09-10', closed: '2026-09-13', sessions: 2 } }),
    ev({ type: 'task.created', task: 'T-2', at: '2026-09-14T09:00:00.000Z', model: sonnet, data: { fixes: 'T-1', acceptance: [], content: '' } }),
    ev({ task: 'T-2', at: '2026-09-14T10:00:00.000Z', model: sonnet, data: { verdict: 'pass', findings: [], level: 'low' } }),
    ev({ task: 'T-3', at: '2026-09-15T10:00:00.000Z', model: sonnet, data: { verdict: 'fail', findings: [], level: 'low' } }),
    ev({ type: 'task.status', task: 'T-4', at: '2026-09-16T10:00:00.000Z', data: { from: 'review', to: 'in-progress', source: 'reconcile' } }),
    { ...ev({ at: '2026-09-17T10:00:00.000Z' }), schemaVersion: '9.0' },
  ];
  const m2 = [
    failT1, // a sync that died after appending, before saving its offset: the same line again
    ev({ type: 'task.status', at: '2026-09-11T12:00:00.000Z', machine: 'm2', data: { from: 'review', to: 'in-progress', source: 'reconcile' } }),
    ev({ type: 'task.status', task: 'T-4', at: '2026-09-16T11:00:00.000Z', machine: 'm2', data: { from: 'review', to: 'in-progress', source: 'reconcile' } }),
  ];
  const beta = [
    ev({ type: 'verifier.audit', project: 'beta', task: null, at: '2026-09-10T10:00:00.000Z', data: { level: 'R3', ok: false, executed: true, counts: { confirmed: 1, refuted: 1, unverifiable: 0 }, verdicts: [], generatedAt: '2026-09-01T00:00:00.000Z' } }),
    ev({ type: 'readiness.snapshot', project: 'beta', task: null, at: '2026-09-20T10:00:00.000Z', data: { level: 'R2', generatedAt: '2026-09-15T00:00:00.000Z', manifestCommit: 'x', outcome: 'pass', passed: 9, required: 9 } }),
  ];
  write(path.join(store, 'events', 'alpha', 'm1', '2026-09-10.jsonl'), lines(m1));
  write(path.join(store, 'events', 'alpha', 'm2', '2026-09-11.jsonl'), lines(m2));
  write(path.join(store, 'events', 'beta', 'm1', '2026-09-10.jsonl'), lines(beta));
  const env = { HOME: home, USERPROFILE: home };
  const run = (fn) => {
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    Object.assign(process.env, env);
    try { return fn(); } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  };
  const machine = () => JSON.parse(fs.readFileSync(path.join(home, '.buaflow', 'usage.json'), 'utf8'));
  return { base, store, home, env, run, machine };
}

test('AC-22 by model: fail rate, tasks moved backward and tasks fixed later, with each task under the model most of its events name', (t) => {
  const f = fixture(t);
  const r = f.run(() => report.report({ now: NOW, pull: false }));
  assert.equal(r.code, 0, r.errors.join());
  const row = (model) => r.data.models.find((m) => m.model === model);
  assert.deepEqual(row('claude-opus-5-5'), { model: 'claude-opus-5-5', tasks: 1, checks: 2, fails: 1, mustFix: 1, mustFixTasks: 1, backwardTasks: 1, fixedTasks: 1, failRate: 0.5 });
  assert.deepEqual(row('claude-sonnet-5'), { model: 'claude-sonnet-5', tasks: 2, checks: 2, fails: 1, mustFix: 0, mustFixTasks: 0, backwardTasks: 0, fixedTasks: 0, failRate: 0.5 });
  assert.deepEqual(row('unknown'), { model: 'unknown', tasks: 1, checks: 0, fails: 0, mustFix: 0, mustFixTasks: 0, backwardTasks: 1, fixedTasks: 0, failRate: null });
  assert.match(r.data.text, /\| claude-opus-5-5 \| 1 \| 50% \(1\/2\) \| 1 \| 1 \| 1 \| 1 \|/);
});

test('AC-23 by project: the newer of audit and snapshot, and the evidence age in days', (t) => {
  const f = fixture(t);
  const r = f.run(() => report.report({ now: NOW, pull: false }));
  const beta = r.data.projects.find((p) => p.project === 'beta');
  assert.deepEqual(beta, { project: 'beta', level: 'R2', outcome: 'pass', source: 'readiness.snapshot', evidenceAgeDays: 9, lastEventAt: '2026-09-20T10:00:00.000Z' });
  const alpha = r.data.projects.find((p) => p.project === 'alpha');
  assert.equal(alpha.level, null, 'no readiness recorded is shown as unknown, not guessed');
});

test('AC-25 and AC-19: an unknown schema version is skipped and counted, a repeated id is counted once', (t) => {
  const f = fixture(t);
  const r = f.run(() => report.report({ now: NOW, pull: false }));
  assert.equal(r.data.counts.skipped, 1);
  assert.equal(r.data.counts.duplicates, 1);
  assert.match(r.data.text, /skipped 1 with an unknown schema version/);
  assert.match(r.summary, /skipped 1/);
});

test('AC-26 tasks worth a look: ranked by score, a move reconciled in two clones counted once, each with a command that parses', (t) => {
  const f = fixture(t);
  const r = f.run(() => report.report({ now: NOW, pull: false }));
  assert.deepEqual(r.data.watch.map((w) => [w.key, w.score]), [['alpha/T-1', 5], ['alpha/T-3', 1], ['alpha/T-4', 1]]);
  assert.deepEqual(r.data.watch[0], { key: 'alpha/T-1', model: 'claude-opus-5-5', score: 5, mustFix: 1, fails: 1, backward: 1, fixedBy: ['alpha/T-2'] });
  for (const w of r.data.watch) {
    const command = r.data.text.match(new RegExp(`\`(buaflow usage eval-draft --task ${w.key})\``))[1];
    const parsed = parse(command.split(' ').slice(1));
    assert.equal(parsed.command, 'usage');
    assert.deepEqual(parsed.options.args, ['eval-draft', '--task', w.key]);
  }
});

test('report writes --out, filters --since, and records when the review happened', (t) => {
  const f = fixture(t);
  const out = path.join(f.base, 'reports', 'r.md');
  const r = f.run(() => report.report({ now: NOW, pull: false, out }));
  assert.equal(r.data.text, undefined);
  assert.match(fs.readFileSync(out, 'utf8'), /^# Buaflow usage report — 2026-09-24/);
  assert.equal(f.machine().lastReviewAt, NOW.toISOString());
  const since = f.run(() => report.report({ now: NOW, pull: false, since: '2026-09-15' }));
  assert.deepEqual(since.data.watch.map((w) => w.key), ['alpha/T-3', 'alpha/T-4']);
});

test('the CLI prints the report as Markdown and keeps it in --json', (t) => {
  const f = fixture(t);
  const plain = runNode(cli, { cwd: f.base, env: f.env, args: ['usage', 'report'] });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /^buaflow usage: OK — /m);
  assert.match(plain.stdout, /## Tasks worth a look/);
  assert.doesNotMatch(plain.stdout, /^ {2}text:/m, 'printed once, as text, not again as a data field');
  const json = JSON.parse(runNode(cli, { cwd: f.base, env: f.env, args: ['usage', 'report', '--json'] }).stdout);
  assert.match(json.text, /## By model/);
});

test('AC-24 show: one task from its intent to done, in time order; an unknown task exits 1', (t) => {
  const f = fixture(t);
  const r = f.run(() => report.show('alpha/T-1', { pull: false }));
  assert.equal(r.code, 0);
  const types = r.data.events.map((e) => e.type);
  assert.equal(types[0], 'intent.opened');
  assert.equal(types.at(-1), 'task.done');
  const times = r.data.events.map((e) => e.at);
  assert.deepEqual(times, [...times].sort());
  assert.match(r.data.text, /review → in-progress \(outside a session\)/);
  assert.equal(f.run(() => report.show('alpha/T-99', { pull: false })).code, 1);
  const cliMissing = runNode(cli, { cwd: f.base, env: f.env, args: ['usage', 'show', 'alpha/T-99', '--json'] });
  assert.equal(cliMissing.status, 1);
});

test('AC-27 opening the Buaflow repository says how many events arrived since the last review; any other repository says nothing', (t) => {
  const f = fixture(t);
  const repo = path.join(f.base, 'buaflow');
  writeJson(path.join(repo, 'package.json'), { name: 'buaflow' });
  writeJson(path.join(repo, 'development', 'state.json'), {});
  const other = path.join(f.base, 'other');
  writeJson(path.join(other, 'package.json'), { name: 'shop' });

  const start = (root) => runNode(hookScript, { cwd: root, env: f.env, input: { cwd: root, hook_event_name: 'SessionStart', session_id: 's' } });
  // 11 usable lines from m1 (one is schema 9.0), 2 from m2 (one repeats an id), 2 from beta
  const first = JSON.parse(start(repo).stdout).systemMessage;
  assert.match(first, /มี event ใหม่ 15 รายการ/);
  assert.match(first, /ยังไม่เคย review/);
  assert.equal(start(other).stdout, '');

  // A review on 09-15 that saw the 11 events there were then.
  writeJson(path.join(f.home, '.buaflow', 'usage.json'), { ...f.machine(), lastReviewAt: '2026-09-15T00:00:00.000Z', reviewedEvents: 11 });
  assert.match(JSON.parse(start(repo).stdout).systemMessage, /มี event ใหม่ 4 รายการในที่เก็บกลางตั้งแต่ review ล่าสุด \(2026-09-15\)/);
  f.run(() => report.report({ now: NOW, pull: false }));
  assert.equal(start(repo).stdout, '', 'nothing new since this review');
});

// A laptop that was offline syncs a week late: its events are older than the review but arrived after it.
test('AC-27 counts by arrival: an event recorded before the review but pulled after it is still new', (t) => {
  const f = fixture(t);
  const repo = path.join(f.base, 'buaflow');
  writeJson(path.join(repo, 'package.json'), { name: 'buaflow' });
  writeJson(path.join(repo, 'development', 'state.json'), {});
  f.run(() => report.report({ now: NOW, pull: false }));
  assert.equal(f.machine().reviewedEvents, 15);
  const late = ev({ project: 'gamma', task: 'T-9', at: '2026-09-01T00:00:00.000Z', machine: 'laptop' });
  write(path.join(f.store, 'events', 'gamma', 'laptop', '2026-09-01.jsonl'), lines([late]));
  const out = runNode(hookScript, { cwd: repo, env: f.env, input: { cwd: repo, hook_event_name: 'SessionStart', session_id: 's' } });
  assert.match(JSON.parse(out.stdout).systemMessage, /มี event ใหม่ 1 รายการ.*\(2026-09-24\)/);
});

test('report and show from a project say they run from the kit instead of failing on a missing module', (t) => {
  const f = fixture(t);
  const project = path.join(f.base, 'project');
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  for (const name of ['usage.js', 'convergence.js']) fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', name), path.join(project, '.claude', name));
  for (const args of [['report'], ['show', 'alpha/T-1']]) {
    const r = runNode(path.join(project, '.claude', 'usage.js'), { cwd: project, env: f.env, args: [...args, '--json'] });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr, '');
    assert.match(JSON.parse(r.stdout).summary, /runs from the Buaflow kit/);
  }
});

// A throwaway Buaflow repository: the skills a draft points at, and cases up to EV-005 already taken.
function buaflowRepo(f) {
  const repo = path.join(f.base, 'buaflow-repo');
  writeJson(path.join(repo, 'package.json'), { name: 'buaflow' });
  writeJson(path.join(repo, 'development', 'state.json'), {});
  for (const skill of ['check', 'plan', 'task']) write(path.join(repo, 'core', 'skills', `${skill}.md`), `# ${skill}\n`);
  writeJson(path.join(repo, 'claude-setup', 'evals', 'EV-005.json'), {});
  return repo;
}

test('AC-21 eval-draft turns a real task into a case the harness accepts, pointing back at where it came from', (t) => {
  const f = fixture(t);
  const repo = buaflowRepo(f);
  const r = f.run(() => report.evalDraft(repo, 'alpha/T-1', { pull: false, author: 'Case Author' }));
  assert.equal(r.code, 0, r.errors.join('\n'));
  const draft = JSON.parse(fs.readFileSync(r.data.file, 'utf8'));
  assert.equal(path.relative(f.store, r.data.file).split(path.sep).join('/'), 'evals/drafts/EV-006.json');
  assert.deepEqual(require('../eval-harness.js').validateCase(draft, { root: repo, expectedId: 'EV-006' }), { ok: true, errors: [] });
  assert.equal(draft.origin, 'observed-failure');
  assert.equal(draft.observedIn, 'alpha/T-1');
  assert.equal(draft.authoredBy, 'Case Author');
  assert.match(draft.prompt, /# intent/, 'the prompt starts from the intent the task names');
  assert.deepEqual(draft.criteria.map((c) => [c.id, c.kind]), [['C1', 'must-happen'], ['C2', 'must-not-happen']]);
  assert.match(draft.criteria[0].statement, /AC-1/);
  assert.match(draft.criteria[1].statement, /must-fix: x/, 'what /check found becomes what must not happen again');
  assert.deepEqual(draft.tests, ['core/skills/check.md', 'core/skills/plan.md'], 'failed /check and fixed later → check; moved back → plan');
  assert.ok(draft.setup.some((s) => s.includes('buaflow usage show alpha/T-1')));
  assert.equal(draft.passWhen.minScore, 0.8);
  assert.match(draft._, /แก้ prompt และ criteria/);
  const second = f.run(() => report.evalDraft(repo, 'alpha/T-1', { pull: false }));
  assert.equal(second.data.id, 'EV-007', 'a second draft never overwrites the first');
});

test('eval-draft on a task with no AC and no failed /check leaves plain placeholders to fill in', (t) => {
  const f = fixture(t);
  const repo = buaflowRepo(f);
  const r = f.run(() => report.evalDraft(repo, 'alpha/T-2', { pull: false }));
  assert.equal(r.code, 0, r.errors.join('\n'));
  const statements = r.data.draft.criteria.map((c) => c.statement);
  assert.ok(statements.every((s) => s.startsWith('<แก้ก่อนใช้')));
  assert.deepEqual(r.data.draft.tests, ['core/skills/task.md']);
});

test('eval-draft says why it cannot draft: an unknown task, or a place that is not the Buaflow repository', (t) => {
  const f = fixture(t);
  const repo = buaflowRepo(f);
  assert.equal(f.run(() => report.evalDraft(repo, 'alpha/T-99', { pull: false })).code, 1);
  const elsewhere = f.run(() => report.evalDraft(f.base, 'alpha/T-1', { pull: false }));
  assert.equal(elsewhere.code, 1);
  assert.match(elsewhere.summary, /Buaflow repository/);
});

test('AC-26 the eval-draft command a report prints runs as printed', (t) => {
  const f = fixture(t);
  const repo = buaflowRepo(f);
  const text = f.run(() => report.report({ now: NOW, pull: false })).data.text;
  const command = text.match(/`(buaflow usage eval-draft --task alpha\/T-1)`/)[1];
  const r = runNode(cli, { cwd: repo, env: f.env, args: [...command.split(' ').slice(1), '--json'] });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).data.id, 'EV-006');
});

test('eval-draft runs from anywhere inside the Buaflow repository, not only its root', (t) => {
  const f = fixture(t);
  const repo = buaflowRepo(f);
  const sub = path.join(repo, 'claude-setup');
  const r = runNode(cli, { cwd: sub, env: f.env, args: ['usage', 'eval-draft', '--task', 'alpha/T-1', '--json'] });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).data.id, 'EV-006', 'numbered after the cases at the repository root, not the subfolder');
});

test('a task with a very long AC list still gets something that must not happen, so the draft stays valid', (t) => {
  const f = fixture(t);
  const repo = buaflowRepo(f);
  const long = ev({ type: 'task.created', project: 'alpha', task: 'T-50', at: '2026-09-18T10:00:00.000Z', data: { acceptance: Array.from({ length: 120 }, (_, i) => `AC-${i + 1} something observable`), content: '' } });
  write(path.join(f.store, 'events', 'alpha', 'm1', '2026-09-18.jsonl'), lines([long]));
  const r = f.run(() => report.evalDraft(repo, 'alpha/T-50', { pull: false }));
  assert.equal(r.code, 0, r.errors.join('\n'));
  const kinds = r.data.draft.criteria.map((c) => c.kind);
  assert.equal(kinds.length, 99);
  assert.equal(kinds.at(-1), 'must-not-happen');
});

// A store of its own, so a test can add events without moving the numbers the shared fixture asserts.
function smallStore(t, events) {
  const base = temporaryProject('buaflow-report-small-');
  t.after(() => cleanup(base));
  const store = path.join(base, 'store');
  const home = path.join(base, 'home');
  writeJson(path.join(home, '.buaflow', 'usage.json'), { schemaVersion: '1.0', store, machine: 'm1', lastReviewAt: null });
  write(path.join(store, 'events', 'alpha', 'm1', '2026-09-20.jsonl'), lines(events));
  return () => {
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    Object.assign(process.env, { HOME: home, USERPROFILE: home });
    try { return report.report({ now: NOW, pull: false }); } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  };
}

test('a reconciled move a later reconcile puts straight back is the worktree moving, not a task going backwards', (t) => {
  const run = smallStore(t, [
    // T-1: /done set it, then a branch checked out without the merge showed review again, then the pull put it back.
    ev({ type: 'task.status', task: 'T-1', at: '2026-09-20T10:00:00.000Z', data: { from: 'review', to: 'done' } }),
    ev({ type: 'task.status', task: 'T-1', at: '2026-09-20T10:05:00.000Z', data: { from: 'done', to: 'review', source: 'reconcile' } }),
    ev({ type: 'task.status', task: 'T-1', at: '2026-09-20T11:00:00.000Z', data: { from: 'review', to: 'done', source: 'reconcile' } }),
    // T-2: reconciled back and never returned — somebody really did send it back.
    ev({ type: 'task.status', task: 'T-2', at: '2026-09-20T10:05:00.000Z', data: { from: 'review', to: 'todo', source: 'reconcile' } }),
  ]);
  const r = run();
  assert.deepEqual(r.data.watch.map((w) => [w.key, w.backward]), [['alpha/T-2', 1]]);
});

test('an event recorded twice at the same moment counts once, and the report says how many it dropped', (t) => {
  const twice = (fields) => [ev(fields), ev(fields)];
  const run = smallStore(t, [
    ...twice({ task: 'T-1', at: '2026-09-20T10:00:00.000Z', data: { verdict: 'fail', findings: ['must-fix: a'], level: 'high' } }),
    // The same verdict and findings an hour later is a second round, not a repeat.
    ev({ task: 'T-1', at: '2026-09-20T11:00:00.000Z', data: { verdict: 'fail', findings: ['must-fix: a'], level: 'high' } }),
  ]);
  const r = run();
  assert.equal(r.data.counts.repeats, 1);
  assert.equal(r.data.counts.events, 2);
  assert.deepEqual(r.data.models[0].fails, 2, 'the repeat is gone, the real second round is not');
  assert.match(r.data.text, /1 repeat\(s\) of an event already recorded/);
});

test('a must-fix counts whether or not the round that found it could still be merged', (t) => {
  const run = smallStore(t, [
    // Found three, fixed them all, merged: the verdict passes and the three still count.
    ev({ task: 'T-1', at: '2026-09-20T10:00:00.000Z', data: { verdict: 'pass', findings: ['must-fix: a — fixed', 'must-fix: b — fixed', 'should-fix: c'], level: 'high' } }),
    ev({ task: 'T-2', at: '2026-09-20T11:00:00.000Z', data: { verdict: 'pass', findings: ['should-fix: d'], level: 'high' } }),
  ]);
  const r = run();
  assert.deepEqual(r.data.watch.map((w) => [w.key, w.mustFix, w.score]), [['alpha/T-1', 2, 2]], 'a round with only should-fix is not worth a look');
  assert.equal(r.data.models[0].mustFixTasks, 1);
});
