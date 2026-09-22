'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { validateComposition } = require('../pack-composition.js');
const { repositoryRoot, runNode } = require('./helpers.js');

const packsDir = path.join(__dirname, 'fixtures', 'packs');

function pack(overrides = {}) {
  return {
    schemaVersion: '1.0',
    id: 'fixture',
    kind: 'capability',
    name: 'Fixture',
    version: '1.0.0',
    inputs: [],
    generatedArtifacts: [{ path: 'fixture.txt', description: 'placeholder' }],
    compatibility: { requiresPacks: [], conflictsWithPacks: [], profiles: [] },
    verification: [{ id: 'check', command: 'true', description: 'placeholder' }],
    upgrade: [],
    operationalEvidence: [{ control: 'build', evidence: 'Fixture pack always produces a successful build.' }],
    ...overrides,
  };
}

test('validateComposition accepts an empty set', () => {
  assert.deepEqual(validateComposition([]), { ok: true, errors: [], packIds: [] });
});

test('validateComposition accepts packs with no cross-references', () => {
  const a = pack({ id: 'a' });
  const b = pack({ id: 'b', generatedArtifacts: [{ path: 'other.txt', description: 'placeholder' }] });
  const result = validateComposition([a, b]);
  assert.equal(result.ok, true);
});

test('validateComposition fails when a requiresPacks dependency is missing from the set', () => {
  const a = pack({ id: 'a', compatibility: { requiresPacks: ['missing'], conflictsWithPacks: [], profiles: [] } });
  const result = validateComposition([a]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /a: requires "missing", which is not in this set/);
});

test('validateComposition passes when a requiresPacks dependency is present', () => {
  const a = pack({ id: 'a', compatibility: { requiresPacks: ['b'], conflictsWithPacks: [], profiles: [] } });
  const b = pack({ id: 'b', generatedArtifacts: [{ path: 'other.txt', description: 'placeholder' }] });
  const result = validateComposition([a, b]);
  assert.equal(result.ok, true);
});

test('validateComposition fails when two packs in the set declare each other as conflicts', () => {
  const a = pack({ id: 'a', compatibility: { requiresPacks: [], conflictsWithPacks: ['b'], profiles: [] } });
  const b = pack({ id: 'b', generatedArtifacts: [{ path: 'other.txt', description: 'placeholder' }] });
  const result = validateComposition([a, b]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /a: conflicts with "b", which is also in this set/);
});

test('validateComposition fails when two packs generate the same file path, even if undeclared', () => {
  const a = pack({ id: 'a' }); // generates fixture.txt
  const b = pack({ id: 'b' }); // also generates fixture.txt by default
  const result = validateComposition([a, b]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /generatedArtifacts path "fixture.txt" is written by both "a" and "b"/);
});

function run(args) {
  return runNode(path.join(repositoryRoot, 'claude-setup', 'pack-composition.js'), { args });
}

test('CLI: the realistic nextjs-postgres + capability packs subset composes cleanly', () => {
  const result = run([
    '--dir', path.relative(repositoryRoot, packsDir),
    '--ids', 'nextjs-postgres,auth-rbac,storage,notification,background-jobs,audit-log',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /6 pack\(s\) compose without conflict/);
});

test('CLI: nextjs-postgres and the standalone db pack conflict', () => {
  const result = run(['--dir', path.relative(repositoryRoot, packsDir), '--ids', 'nextjs-postgres,db']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /conflicts with "db"/);
  assert.match(result.stdout, /generatedArtifacts path "prisma\/schema\.prisma" is written by both/);
});

test('CLI --json emits a machine-readable result', () => {
  const result = run(['--dir', path.relative(repositoryRoot, packsDir), '--ids', 'nextjs-postgres,auth-rbac', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.packIds.sort(), ['auth-rbac', 'nextjs-postgres']);
});

test('CLI fails cleanly on an unknown pack id', () => {
  const result = run(['--dir', path.relative(repositoryRoot, packsDir), '--ids', 'does-not-exist']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no such pack file/);
});
