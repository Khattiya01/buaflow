'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateCoverage } = require('../requirement-coverage.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const NOW = new Date('2026-09-23T12:00:00.000Z');

function record(requirements) {
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    generatedAt: '2026-09-23T00:00:00.000Z',
    requirements,
  };
}

function proven(id = 'REQ-001') {
  return {
    id,
    statement: 'The thing this fixture claims to do',
    source: 'fixture acceptance criteria',
    proof: [{ type: 'command', value: 'npm test' }],
  };
}

function excepted(id = 'REQ-002', overrides = {}) {
  return {
    id,
    statement: 'The thing this fixture cannot yet prove',
    source: 'fixture acceptance criteria',
    exception: {
      owner: 'a named human',
      reason: 'accepted deliberately for a reason long enough to be a real sentence',
      risk: 'medium',
      acceptedOn: '2026-09-01',
      expiresOn: '2026-12-01',
      ...overrides,
    },
  };
}

test('a requirement is covered by proof or by an exception, and both are counted', () => {
  const result = evaluateCoverage(record([proven(), excepted()]), { now: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.totals.total, 2);
  assert.equal(result.totals.proven, 1);
  assert.equal(result.totals.excepted, 1);
  assert.equal(result.totals.byRisk.medium, 1);
  assert.equal(result.soonestExpiry.id, 'REQ-002');
});

test('a requirement with neither proof nor an exception fails', () => {
  const bare = { id: 'REQ-003', statement: 'Nobody answers for this', source: 'fixture' };
  const result = evaluateCoverage(record([bare]), { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.totals.uncovered, 1);
  assert.match(result.errors.join('\n'), /REQ-003: neither proof nor an approved exception/);
});

test('a requirement carrying both proof and an exception fails, because one of them is untrue', () => {
  const both = { ...proven('REQ-004'), exception: excepted('REQ-004').exception };
  const result = evaluateCoverage(record([both]), { now: NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /has both proof and an exception/);
});

test('an expired exception fails rather than ageing into silence', () => {
  const stale = excepted('REQ-005', { acceptedOn: '2026-01-01', expiresOn: '2026-06-01' });
  const result = evaluateCoverage(record([stale]), { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.totals.expired, 1);
  assert.equal(result.totals.excepted, 0);
  assert.match(result.errors.join('\n'), /expired on 2026-06-01 \(114 days ago\)/);
  assert.match(result.errors.join('\n'), /a named human/);
});

test('an exception expiring today is still live', () => {
  const edge = excepted('REQ-006', { acceptedOn: '2026-09-01', expiresOn: '2026-09-23' });
  const result = evaluateCoverage(record([edge]), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.requirements[0].daysRemaining, 0);
});

test('every field of an exception is required, and a vague reason is not a reason', () => {
  const thin = {
    id: 'REQ-007',
    statement: 'Something that was waived carelessly',
    source: 'fixture',
    exception: { owner: '', reason: 'later', risk: 'catastrophic', acceptedOn: 'soon', expiresOn: '' },
  };
  const joined = evaluateCoverage(record([thin]), { now: NOW }).errors.join('\n');
  assert.match(joined, /requires an owner/);
  assert.match(joined, /reason of at least 20 characters/);
  assert.match(joined, /risk must be one of/);
  assert.match(joined, /acceptedOn must be a YYYY-MM-DD date/);
  assert.match(joined, /expiresOn must be a YYYY-MM-DD date/);
});

test('an exception that expires before it was accepted is rejected', () => {
  const backwards = excepted('REQ-008', { acceptedOn: '2026-09-01', expiresOn: '2026-08-01' });
  const result = evaluateCoverage(record([backwards]), { now: NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must be after acceptedOn/);
});

// The loophole this closes: an expiry the record sets for itself can be set to 2099, which is
// the same failure evidence-freshness avoids by letting the verifier supply the window.
test('the verifier can cap how long a risk may be accepted for', () => {
  const forever = excepted('REQ-009', { acceptedOn: '2026-09-01', expiresOn: '2099-01-01' });
  const unjudged = evaluateCoverage(record([forever]), { now: NOW });
  assert.equal(unjudged.ok, true);
  assert.match(unjudged.warnings.join('\n'), /no --max-window-days was supplied/);

  const judged = evaluateCoverage(record([forever]), { now: NOW, maxWindowDays: 90 });
  assert.equal(judged.ok, false);
  assert.match(judged.errors.join('\n'), /past the 90-day limit supplied by the verifier/);
  // ยาวเกินกำหนดไม่ได้แปลว่าผิดรูป — มันยังเป็น exception ที่ยังไม่หมดอายุ และรายงานต้องพูดแบบนั้น
  assert.equal(judged.totals.excepted, 1);
  assert.equal(judged.totals.uncovered, 0);
});

test('an exception that is both over the window and lapsed is still reported as expired', () => {
  const both = excepted('REQ-009', { acceptedOn: '2020-01-01', expiresOn: '2021-01-01' });
  const result = evaluateCoverage(record([both]), { now: NOW, maxWindowDays: 90 });
  assert.equal(result.ok, false);
  assert.equal(result.totals.expired, 1);
  assert.equal(result.totals.uncovered, 0);
  const joined = result.errors.join('\n');
  assert.match(joined, /past the 90-day limit/);
  assert.match(joined, /exception expired on 2021-01-01/);
});

test('manual evidence alone is not proof — it is an exception nobody wrote down', () => {
  const hand = {
    id: 'REQ-010',
    statement: 'Checked by eye during a session that no longer exists',
    source: 'fixture',
    proof: [{ type: 'manual', value: 'observed the rows in psql' }],
  };
  const result = evaluateCoverage(record([hand]), { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.totals.proven, 0);
  assert.match(result.errors.join('\n'), /manual evidence only, which is not reproducible/);
});

test('manual evidence beside reproducible evidence is allowed', () => {
  const mixed = {
    id: 'REQ-011',
    statement: 'Proven by a command and annotated by a human',
    source: 'fixture',
    proof: [
      { type: 'command', value: 'npm test' },
      { type: 'manual', value: 'also eyeballed' },
    ],
  };
  const result = evaluateCoverage(record([mixed]), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.totals.proven, 1);
});

test('file evidence must exist inside the project, using the same rules as the readiness manifest', () => {
  const directory = temporaryProject();
  try {
    write(path.join(directory, 'tests', 'real.test.js'), '// a real file\n');
    const present = {
      id: 'REQ-012',
      statement: 'Proven by a file that is really there',
      source: 'fixture',
      proof: [{ type: 'file', value: 'tests/real.test.js' }],
    };
    const absent = {
      id: 'REQ-013',
      statement: 'Proven by a file that is not there',
      source: 'fixture',
      proof: [{ type: 'file', value: 'tests/imaginary.test.js' }],
    };
    const result = evaluateCoverage(record([present, absent]), { now: NOW, root: directory });
    assert.equal(result.ok, false);
    assert.equal(result.totals.proven, 1);
    assert.match(result.errors.join('\n'), /REQ-013.*file does not exist/s);
  } finally {
    cleanup(directory);
  }
});

test('duplicate requirement ids are rejected', () => {
  const result = evaluateCoverage(record([proven('REQ-014'), proven('REQ-014')]), { now: NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /REQ-014: duplicate requirement id/);
});

test('the CLI exits 0 on a covered record and 1 on an expired exception', () => {
  const directory = temporaryProject();
  try {
    const file = path.join(directory, 'docs', 'evidence', 'requirement-coverage.json');
    writeJson(file, record([proven(), excepted('REQ-002', { acceptedOn: '2026-09-01', expiresOn: '2099-01-01' })]));
    const script = path.join(repositoryRoot, 'claude-setup', 'requirement-coverage.js');

    const pass = runNode(script, { args: ['--root', directory, '--file', 'docs/evidence/requirement-coverage.json'], cwd: directory });
    assert.equal(pass.status, 0);
    assert.match(pass.stdout, /PASS \(2 requirements — 1 proven, 1 excepted, 0 expired, 0 uncovered\)/);

    writeJson(file, record([proven(), excepted('REQ-002', { acceptedOn: '2020-01-01', expiresOn: '2020-06-01' })]));
    const fail = runNode(script, { args: ['--root', directory, '--file', 'docs/evidence/requirement-coverage.json'], cwd: directory });
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /FAIL/);
    assert.match(fail.stdout, /exception expired on 2020-06-01/);
  } finally {
    cleanup(directory);
  }
});

test('the CLI reports bad input as exit 2, not as a coverage failure', () => {
  const script = path.join(repositoryRoot, 'claude-setup', 'requirement-coverage.js');
  const missing = runNode(script, { args: ['--file', 'docs/evidence/nothing-here.json'] });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read/);

  const unknown = runNode(script, { args: ['--nonsense'] });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown argument/);
});

// Every reference app's own record is the working example of this contract; a broken one here
// means the kit ships a rule its own apps do not keep.
test('each reference app answers for every requirement it accepted', () => {
  const apps = ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync'];
  for (const app of apps) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const file = path.join(root, 'docs', 'evidence', 'requirement-coverage.json');
    assert.ok(fs.existsSync(file), `${app} is missing docs/evidence/requirement-coverage.json`);
    const result = evaluateCoverage(JSON.parse(fs.readFileSync(file, 'utf8')), { root, maxWindowDays: 90 });
    assert.deepEqual(result.errors, [], `${app}: ${result.errors.join('; ')}`);
    assert.ok(result.totals.excepted > 0, `${app} records no exceptions, so it proves nothing about this contract`);
  }
});
