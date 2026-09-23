'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validatePack } = require('../pack.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const packsDir = path.join(__dirname, 'fixtures', 'packs');
const packFile = (name) => path.join(packsDir, `${name}.json`);
const pack = (name) => JSON.parse(fs.readFileSync(packFile(name), 'utf8'));

function minimalPack(overrides = {}) {
  return {
    schemaVersion: '1.0',
    id: 'fixture-pack',
    kind: 'stack',
    name: 'Fixture pack',
    version: '1.0.0',
    inputs: [],
    generatedArtifacts: [{ path: 'fixture.txt', description: 'Placeholder generated file.' }],
    compatibility: { requiresPacks: [], conflictsWithPacks: [], profiles: [] },
    verification: [{ id: 'check', command: 'true', description: 'Always-passing placeholder command.' }],
    upgrade: [],
    operationalEvidence: [{ control: 'build', evidence: 'Fixture pack always produces a successful build.' }],
    ...overrides,
  };
}

test('validatePack accepts a well-formed pack', () => {
  const result = validatePack(minimalPack());
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('validatePack rejects an unknown operationalEvidence control', () => {
  const result = validatePack(minimalPack({ operationalEvidence: [{ control: 'not-a-real-control', evidence: 'X'.repeat(25) }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unknown control "not-a-real-control"/);
});

test('validatePack requires options on an enum input', () => {
  const result = validatePack(minimalPack({ inputs: [{ name: 'orm', type: 'enum', required: true, description: 'ORM choice.' }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /enum inputs must declare a non-empty options array/);
});

test('validatePack rejects a non-semver version', () => {
  const result = validatePack(minimalPack({ version: '1.0' }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /version must be a full semver string/);
});

test('validatePack rejects a generated artifact path that escapes the project', () => {
  const result = validatePack(minimalPack({ generatedArtifacts: [{ path: '../outside.txt', description: 'Escapes the project root.' }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must be relative and stay inside/);
});

test('validatePack requires at least one generated artifact, verification step and operational evidence item', () => {
  const result = validatePack(minimalPack({ generatedArtifacts: [], verification: [], operationalEvidence: [] }));
  assert.equal(result.ok, false);
  const joined = result.errors.join('\n');
  assert.match(joined, /generatedArtifacts must be a non-empty array/);
  assert.match(joined, /verification must be a non-empty array/);
  assert.match(joined, /operationalEvidence must be a non-empty array/);
});

test('validatePack rejects a pack that requires itself', () => {
  const result = validatePack(minimalPack({ compatibility: { requiresPacks: ['fixture-pack'], conflictsWithPacks: [], profiles: [] } }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /requiresPacks cannot include the pack's own id/);
});

test('validatePack rejects an upgrade step whose from and to are identical', () => {
  const result = validatePack(minimalPack({ upgrade: [{ from: '1.0.0', to: '1.0.0', breaking: false, steps: ['noop'] }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /from and to must differ/);
});

const CORE_CAPABILITY_PACKS = ['nextjs-postgres', 'auth-rbac', 'db', 'storage', 'notification', 'background-jobs', 'audit-log'];

test('every core pack fixture (PP-002 + PP-007) passes validation', () => {
  for (const name of CORE_CAPABILITY_PACKS) {
    const result = validatePack(pack(name), { expectedId: name });
    assert.equal(result.ok, true, `${name}: ${result.errors.join('; ')}`);
  }
});

test('the two fixture packs contribute evidence to different readiness controls', () => {
  const controlsFor = (name) => pack(name).operationalEvidence.map((e) => e.control);
  assert.deepEqual(controlsFor('nextjs-postgres').sort(), ['database-migration', 'deployment-package', 'persistence']);
  assert.deepEqual(controlsFor('auth-rbac'), ['access-control']);
  assert.equal(pack('nextjs-postgres').kind, 'stack');
  assert.equal(pack('auth-rbac').kind, 'capability');
  assert.deepEqual(pack('auth-rbac').compatibility.requiresPacks, ['nextjs-postgres']);
});

test('the standalone db pack conflicts with nextjs-postgres, which already bundles persistence', () => {
  assert.deepEqual(pack('db').compatibility.conflictsWithPacks, ['nextjs-postgres']);
  assert.deepEqual(pack('nextjs-postgres').compatibility.conflictsWithPacks, ['db']);
});

test('background-jobs and audit-log leave requiresPacks empty (v1 has no capability-based dependency)', () => {
  // They need *some* persistence-providing pack (nextjs-postgres or db), but requiresPacks v1 is
  // identity-based, not capability-based — see templates/pack.tpl.json's note on this limitation.
  assert.deepEqual(pack('background-jobs').compatibility.requiresPacks, []);
  assert.deepEqual(pack('audit-log').compatibility.requiresPacks, []);
});

function run(args, cwd = repositoryRoot) {
  return runNode(path.join(repositoryRoot, 'claude-setup', 'pack.js'), { cwd, args });
}

test('--file validates a single pack and exits 0', () => {
  const result = run(['--file', path.relative(repositoryRoot, packFile('nextjs-postgres'))]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pack: 1 pack\(s\) valid/);
});

test('--dir validates every pack in the fixtures directory', () => {
  const result = run(['--dir', path.relative(repositoryRoot, packsDir), '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.results.length, 9); // nextjs-postgres, react-fastapi-postgres, expo-fastapi-postgres-sync, auth-rbac, db, storage, notification, background-jobs, audit-log
  assert.ok(parsed.results.every((r) => r.ok));
});

test('--dir fails a pack whose id does not match its own filename', () => {
  const root = temporaryProject('buaflow-pack-');
  try {
    writeJson(path.join(root, 'packs', 'renamed.json'), minimalPack({ id: 'fixture-pack' }));
    const result = run(['--dir', 'packs'], root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /does not match filename "renamed\.json"/);
  } finally {
    cleanup(root);
  }
});

test('fails on malformed JSON', () => {
  const root = temporaryProject('buaflow-pack-');
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'broken.json'), '{ not json');
    const result = run(['--file', 'broken.json'], root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /cannot read\/parse/);
  } finally {
    cleanup(root);
  }
});
