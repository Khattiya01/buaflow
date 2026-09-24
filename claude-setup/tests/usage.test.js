'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers');
const usage = require('../usage');
const { parse } = require('../../bin/buaflow');

const cli = path.join(repositoryRoot, 'bin', 'buaflow.js');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function gitProject(name = 'Demo App') {
  const parent = temporaryProject('buaflow-usage-');
  const root = path.join(parent, name);
  fs.mkdirSync(root);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Test Owner');
  git('config', 'user.email', 'owner@example.test');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  return { root, parent, git };
}

// Machine config lives in the home directory; point it somewhere disposable for every test.
function isolatedHome(t) {
  const home = temporaryProject('buaflow-home-');
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    cleanup(home);
  });
  return home;
}

function events(root) {
  const dir = usage.eventsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean).map(JSON.parse));
}

test('AC-1 consent --enable records the answer with who, when and the project name', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  const result = usage.runCommand(root, ['consent', '--enable']);
  assert.equal(result.code, 0);
  const consent = readJson(usage.consentFile(root));
  assert.equal(consent.enabled, true);
  assert.equal(consent.project, 'demo-app');
  assert.equal(consent.decidedBy, 'Test Owner');
  assert.match(consent.decidedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(usage.validateConsent(consent), []);
});

test('AC-1 project name comes from the origin remote when there is one', (t) => {
  isolatedHome(t);
  const { root, parent, git } = gitProject();
  t.after(() => cleanup(parent));
  git('remote', 'add', 'origin', 'git@github.com:acme/Bluepeak_Hub.git');
  usage.runCommand(root, ['consent', '--enable']);
  assert.equal(readJson(usage.consentFile(root)).project, 'bluepeak_hub');
});

test('consent refuses outside a git repository and needs exactly one flag', (t) => {
  isolatedHome(t);
  const dir = temporaryProject();
  t.after(() => cleanup(dir));
  assert.equal(usage.runCommand(dir, ['consent', '--enable']).code, 1);
  assert.equal(fs.existsSync(usage.consentFile(dir)), false);
  assert.equal(usage.runCommand(dir, ['consent']).code, 2);
  assert.equal(usage.runCommand(dir, ['consent', '--enable', '--disable']).code, 2);
});

test('AC-2 without consent, record writes nothing at all', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  const result = usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'fail']);
  assert.equal(result.code, 0);
  assert.equal(result.data.recorded, false);
  assert.equal(result.data.reason, 'unset');
  assert.equal(fs.existsSync(path.join(root, '.buaflow')), false);
});

test('AC-2 a disabled or unreadable consent file records nothing', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--disable']);
  assert.equal(usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'pass']).data.recorded, false);
  write(usage.consentFile(root), '{ not json');
  const result = usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'pass']);
  assert.equal(result.data.reason, 'invalid');
  assert.equal(fs.existsSync(usage.usageDir(root)), false);
  const status = usage.runCommand(root, ['status']);
  assert.equal(status.data.consent, 'invalid');
  assert.match(status.warnings.join(' '), /nothing is recorded/);
});

test('AC-2 a consent file with enabled as a string is not treated as enabled', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  writeJson(usage.consentFile(root), { schemaVersion: '1.0', enabled: 'yes', project: 'x', decidedBy: 'a', decidedAt: '2026-09-24' });
  assert.equal(usage.readConsent(root).state, 'invalid');
});

test('AC-4 switching off stops recording from the next event and keeps what was recorded', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--enable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'fail']);
  assert.equal(events(root).length, 1);
  usage.runCommand(root, ['consent', '--disable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'pass']);
  assert.equal(events(root).length, 1);
  assert.equal(readJson(usage.consentFile(root)).project, 'demo-app', 'switching off keeps the project name');
});

test('AC-10 record check stores the verdict and findings from a JSON file or plain lines', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--enable']);
  const json = path.join(parent, 'findings.json');
  writeJson(json, ['missing test for AC-2', { file: 'a.js', note: 'unused import' }]);
  const text = path.join(parent, 'findings.txt');
  write(text, 'first finding\n\n second finding \n');
  usage.runCommand(root, ['record', 'check', '--task', 'T-007', '--verdict', 'fail', '--findings', json, '--level', 'medium']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-007', '--verdict', 'pass', '--findings', text]);
  const [first, second] = events(root);
  assert.equal(first.type, 'check.result');
  assert.equal(first.task, 'T-007');
  assert.deepEqual(first.data, { verdict: 'fail', findings: ['missing test for AC-2', { file: 'a.js', note: 'unused import' }], level: 'medium' });
  assert.deepEqual(second.data.findings, ['first finding', 'second finding']);
});

test('AC-10 record check rejects bad input with exit 2 and never fails on its own errors', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  assert.equal(usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'maybe']).code, 2);
  assert.equal(usage.runCommand(root, ['record', 'check', '--verdict', 'pass']).code, 2);
  assert.equal(usage.runCommand(root, ['record', 'intent', '--task', 'T-1', '--verdict', 'pass']).code, 2);
  usage.runCommand(root, ['consent', '--enable']);
  const missing = usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'pass', '--findings', path.join(parent, 'nope.json')]);
  assert.equal(missing.code, 0);
  assert.equal(missing.data.recorded, false);
});

test('AC-10 through the CLI, findings can come from stdin', (t) => {
  const home = isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--enable']);
  const result = spawnSync(process.execPath, [cli, 'usage', 'record', 'check', '--task', 'T-9', '--verdict', 'fail', '--findings', '-', '--root', root, '--json'], {
    input: '["from stdin"]', encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).data.recorded, true);
  assert.deepEqual(events(root)[0].data.findings, ['from stdin']);
});

test('AC-13 every event carries all fields and matches the schema contract', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--enable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'pass']);
  const [event] = events(root);
  assert.deepEqual(usage.validateEvent(event), []);
  assert.deepEqual(Object.keys(event).sort(), [...usage.EVENT_FIELDS].sort());
  assert.equal(event.project, 'demo-app');
  assert.equal(event.kitVersion, readJson(path.join(repositoryRoot, 'package.json')).version);
  assert.match(event.commit, /^[0-9a-f]{7,}$/);
  assert.equal(typeof event.machine, 'string');

  const schema = readJson(path.join(repositoryRoot, 'schemas', 'usage-event.schema.json'));
  assert.deepEqual([...schema.required].sort(), [...usage.EVENT_FIELDS].sort());
  assert.deepEqual([...schema.properties.type.enum].sort(), [...usage.EVENT_TYPES].sort());
  assert.deepEqual(usage.validateEvent(readJson(path.join(repositoryRoot, 'templates', 'usage-event.tpl.json'))), []);
  const consentSchema = readJson(path.join(repositoryRoot, 'schemas', 'usage-consent.schema.json'));
  assert.deepEqual(Object.keys(consentSchema.properties).sort(), ['$schema', '_', 'decidedAt', 'decidedBy', 'enabled', 'project', 'schemaVersion']);
});

test('AC-13 the machine name comes from the machine config when it is set', (t) => {
  const home = isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  writeJson(path.join(home, '.buaflow', 'usage.json'), { schemaVersion: '1.0', store: null, machine: 'build-box-1', lastReviewAt: null });
  usage.runCommand(root, ['consent', '--enable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-001', '--verdict', 'pass']);
  assert.equal(events(root)[0].machine, 'build-box-1');
});

test('AC-14 the model comes from a fresh marker, otherwise it is unknown', () => {
  const now = Date.parse('2026-09-24T10:00:00Z');
  const marker = (secondsAgo) => ({ marker: { sessionId: 's-1', model: 'claude-opus-5-5', at: new Date(now - secondsAgo * 1000).toISOString() } });
  assert.deepEqual(usage.markerModel(marker(5), now), { model: 'claude-opus-5-5', sessionId: 's-1' });
  assert.deepEqual(usage.markerModel(marker(61), now), { model: 'unknown', sessionId: null });
  assert.deepEqual(usage.markerModel(marker(-30), now), { model: 'unknown', sessionId: null });
  assert.deepEqual(usage.markerModel({}, now), { model: 'unknown', sessionId: null });
  assert.deepEqual(usage.markerModel({ marker: { sessionId: 's', model: null, at: new Date(now).toISOString() } }, now), { model: 'unknown', sessionId: null });
});

test('AC-14 record check uses the marker the hook left and falls back to unknown', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--enable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'pass']);
  usage.writeMarker(root, { sessionId: 'sess-42', model: 'claude-sonnet-5', at: new Date().toISOString() });
  usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'pass']);
  const [before, after] = events(root);
  assert.equal(before.model, 'unknown');
  assert.equal(before.sessionId, null);
  assert.equal(after.model, 'claude-sonnet-5');
  assert.equal(after.sessionId, 'sess-42');
});

test('AC-14 the model is read from the tail of a transcript, last assistant wins', (t) => {
  const dir = temporaryProject();
  t.after(() => cleanup(dir));
  const transcript = path.join(dir, 't.jsonl');
  const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(70 * 1024) } });
  write(transcript, [
    JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-4-5-20251001' } }),
    filler,
    JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5' } }),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5[1m]' } }),
  ].join('\n'));
  assert.equal(usage.modelFromTranscript(transcript), 'claude-opus-5-5[1m]');
  write(transcript, JSON.stringify({ type: 'user', message: { content: 'no model here' } }));
  assert.equal(usage.modelFromTranscript(transcript), null);
  assert.equal(usage.modelFromTranscript(path.join(dir, 'missing.jsonl')), null);
  assert.equal(usage.modelFromTranscript(null), null);
});

test('AC-20 recorded events never show up in the project git status', (t) => {
  isolatedHome(t);
  const { root, parent, git } = gitProject();
  t.after(() => cleanup(parent));
  usage.runCommand(root, ['consent', '--enable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'fail']);
  usage.writeState(root, usage.readState(root));
  const lines = git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean);
  assert.deepEqual(lines, ['?? .buaflow/usage.json']);
});

test('NF security: obvious secrets are redacted before an event is written', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
  assert.equal(usage.redact(`aws AKIAABCDEFGHIJKLMNOP end`), 'aws [REDACTED] end');
  assert.equal(usage.redact(key), '[REDACTED]');
  assert.equal(usage.redact(`token ghp_${'a'.repeat(36)}`), 'token [REDACTED]');
  assert.deepEqual(usage.redact({ list: [`sk-${'b'.repeat(24)}`], n: 3 }), { list: ['[REDACTED]'], n: 3 });
  usage.runCommand(root, ['consent', '--enable']);
  const findings = path.join(parent, 'f.json');
  writeJson(findings, [`leaked AKIAABCDEFGHIJKLMNOP in config`]);
  usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'fail', '--findings', findings]);
  assert.deepEqual(events(root)[0].data.findings, ['leaked [REDACTED] in config']);
});

test('NF security: project names cannot escape their folder in the store', () => {
  assert.equal(usage.sanitizeName('../../etc'), 'etc');
  assert.equal(usage.sanitizeName('My Project!'), 'my-project-');
  assert.equal(usage.sanitizeName(''), 'project');
  assert.match(usage.sanitizeName('x'.repeat(200)), /^x{64}$/);
});

test('status reports consent, pending events and a missing store', (t) => {
  isolatedHome(t);
  const { root, parent } = gitProject();
  t.after(() => cleanup(parent));
  assert.equal(usage.runCommand(root, ['status']).data.consent, 'unset');
  usage.runCommand(root, ['consent', '--enable']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'pass']);
  usage.runCommand(root, ['record', 'check', '--task', 'T-1', '--verdict', 'pass']);
  const result = usage.runCommand(root, ['status']);
  assert.equal(result.data.pending, 2);
  assert.equal(result.data.store, null);
  assert.match(result.warnings.join(' '), /buaflow usage setup --store/);
});

test('the CLI routes usage flags to usage.js and keeps shared options', () => {
  const parsed = parse(['usage', 'record', 'check', '--task', 'T-1', '--verdict', 'pass', '--json', '--root', repositoryRoot]);
  assert.equal(parsed.command, 'usage');
  assert.equal(parsed.options.json, true);
  assert.deepEqual(parsed.options.args, ['record', 'check', '--task', 'T-1', '--verdict', 'pass']);
  const result = runNode(cli, { args: ['usage', 'status', '--json'] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).command, 'usage');
});
