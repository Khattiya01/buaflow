'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validateComposition, validateProfileFit } = require('../pack-composition.js');
const { repositoryRoot, runNode } = require('./helpers.js');

const packsDir = path.join(repositoryRoot, 'packs');
const profilesDir = path.join(__dirname, 'fixtures', 'profiles');

function pack(overrides = {}) {
  return {
    schemaVersion: '2.0',
    id: 'fixture',
    kind: 'capability',
    name: 'Fixture',
    version: '1.0.0',
    inputs: [],
    setup: [{ id: 'install', command: 'npm install fixture', description: 'placeholder' }],
    requiredArtifacts: [{ path: 'fixture.txt', description: 'placeholder' }],
    compatibility: { requiresPacks: [], conflictsWithPacks: [], profiles: [] },
    verification: [{ id: 'check', command: 'true', description: 'placeholder' }],
    operationalEvidence: [{ control: 'build', evidence: 'Fixture pack always produces a successful build.' }],
    ...overrides,
  };
}

test('validateComposition accepts an empty set', () => {
  assert.deepEqual(validateComposition([]), { ok: true, errors: [], warnings: [], packIds: [] });
});

test('validateComposition accepts packs with no cross-references', () => {
  const a = pack({ id: 'a' });
  const b = pack({ id: 'b', requiredArtifacts: [{ path: 'other.txt', description: 'placeholder' }] });
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
  const b = pack({ id: 'b', requiredArtifacts: [{ path: 'other.txt', description: 'placeholder' }] });
  const result = validateComposition([a, b]);
  assert.equal(result.ok, true);
});

test('validateComposition fails when two packs in the set declare each other as conflicts', () => {
  const a = pack({ id: 'a', compatibility: { requiresPacks: [], conflictsWithPacks: ['b'], profiles: [] } });
  const b = pack({ id: 'b', requiredArtifacts: [{ path: 'other.txt', description: 'placeholder' }] });
  const result = validateComposition([a, b]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /a: conflicts with "b", which is also in this set/);
});

test('two packs asserting the same path warn, but do not fail the composition', () => {
  // v1 treated this as an overwrite conflict, because a pack claimed to GENERATE its files.
  // v2 artifacts are existence assertions, and two packs needing the same file to exist are
  // usually both simply right — so the genuine question (whose recipe decides its contents)
  // is surfaced, and a legitimate composition is no longer failed over it.
  const a = pack({ id: 'a' });
  const b = pack({ id: 'b' });
  const result = validateComposition([a, b]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /"fixture.txt" is asserted by "a" and "b"/);
});

function loadFixture(dir, id) {
  return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
}

test('validateProfileFit flags a pack that proves a control the profile calls not-applicable', () => {
  const contentProfile = loadFixture(profilesDir, 'content');
  const authRbac = loadFixture(packsDir, 'auth-rbac');
  const result = validateProfileFit(contentProfile, [authRbac]);
  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /profile "content" marks "access-control" as not-applicable, but pack "auth-rbac" declares operationalEvidence for it/
  );
});

test('validateProfileFit passes when no pack contradicts a not-applicable control', () => {
  const contentProfile = loadFixture(profilesDir, 'content');
  const storage = loadFixture(packsDir, 'storage');
  const notification = loadFixture(packsDir, 'notification');
  const result = validateProfileFit(contentProfile, [storage, notification]);
  assert.equal(result.ok, true);
});

test('validateProfileFit passes for a profile with no not-applicable controls', () => {
  const saasProfile = loadFixture(profilesDir, 'saas');
  const db = loadFixture(packsDir, 'db');
  const result = validateProfileFit(saasProfile, [db]);
  assert.equal(result.ok, true);
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
  // The declared conflict is what fails the composition now; the shared prisma/schema.prisma
  // is reported alongside it as a warning rather than as a second, redundant error.
  assert.match(result.stdout, /warn: "prisma\/schema\.prisma" is asserted by "db" and "nextjs-postgres"/);
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

test('CLI --profile fails when auth-rbac contradicts the content profile', () => {
  const result = run([
    '--dir', path.relative(repositoryRoot, packsDir),
    '--ids', 'auth-rbac',
    '--profile', path.relative(repositoryRoot, path.join(profilesDir, 'content.json')),
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /against profile "content"/);
  assert.match(result.stdout, /marks "access-control" as not-applicable/);
});

test('CLI --profile passes when the chosen packs do not contradict the profile', () => {
  const result = run([
    '--dir', path.relative(repositoryRoot, packsDir),
    '--ids', 'storage,notification',
    '--profile', path.relative(repositoryRoot, path.join(profilesDir, 'content.json')),
    '--json',
  ]);
  assert.equal(result.status, 0, result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.profile, 'content');
});

test('CLI fails cleanly when --profile points at a missing file', () => {
  const result = run(['--dir', path.relative(repositoryRoot, packsDir), '--ids', 'auth-rbac', '--profile', 'no-such-profile.json']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no such profile file/);
});
