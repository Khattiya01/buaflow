'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { controlsFor, validateManifest } = require('../readiness.js');

function manifest(level = 'R0') {
  const controls = {};
  for (const id of controlsFor(level)) {
    controls[id] = {
      status: 'pass',
      evidence: [{ type: 'command', value: `verify ${id}` }],
    };
  }
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    profile: 'test-profile',
    targetLevel: level,
    commit: level === 'R3' || level === 'R4' ? '0123456789abcdef' : 'WORKTREE',
    generatedAt: '2026-09-22T12:00:00.000Z',
    controls,
  };
}

test('R0 passes with its three required controls', () => {
  const result = validateManifest(manifest('R0'));
  assert.equal(result.ok, true);
  assert.equal(result.passed, 3);
  assert.deepEqual(result.errors, []);
});

test('missing inherited control fails R3', () => {
  const value = manifest('R3');
  delete value.controls.verification;
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /verification: required control is missing/);
});

test('conditional control accepts not-applicable with a concrete rationale', () => {
  const value = manifest('R2');
  value.controls.persistence = {
    status: 'not-applicable',
    evidence: [],
    rationale: 'This static site has no runtime data store or mutable user data.',
  };
  const result = validateManifest(value);
  assert.equal(result.ok, true);
});

test('non-conditional control rejects not-applicable', () => {
  const value = manifest('R1');
  value.controls.build = {
    status: 'not-applicable',
    evidence: [],
    rationale: 'The team does not currently run a build for this application.',
  };
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /build: not-applicable is not allowed/);
});

test('machine-verifiable control rejects manual-only evidence', () => {
  const value = manifest('R1');
  value.controls.verification.evidence = [{ type: 'manual', value: 'Reviewer says the checks passed' }];
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /manual evidence alone cannot satisfy/);
});

test('file evidence must exist under the project root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buaflow-readiness-'));
  try {
    const value = manifest('R0');
    value.controls['primary-flow'].evidence = [{ type: 'file', value: 'reports/flow.json' }];
    const missing = validateManifest(value, { root });
    assert.equal(missing.ok, false);
    assert.match(missing.errors.join('\n'), /file does not exist/);

    fs.mkdirSync(path.join(root, 'reports'));
    fs.writeFileSync(path.join(root, 'reports', 'flow.json'), '{}');
    const present = validateManifest(value, { root });
    assert.equal(present.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R3 requires an immutable hexadecimal commit identity', () => {
  const value = manifest('R3');
  value.commit = 'WORKTREE';
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /R3\+ requires commit/);
});

