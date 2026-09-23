'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validatePack } = require('../pack.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const packsDir = path.join(repositoryRoot, 'packs');
const packFile = (name) => path.join(packsDir, `${name}.json`);
const pack = (name) => JSON.parse(fs.readFileSync(packFile(name), 'utf8'));

function minimalPack(overrides = {}) {
  return {
    schemaVersion: '2.0',
    id: 'fixture-pack',
    kind: 'stack',
    name: 'Fixture pack',
    version: '1.0.0',
    inputs: [],
    setup: [{ id: 'scaffold', command: 'npx create-fixture-app@latest .', description: 'Placeholder scaffolding command.' }],
    requiredArtifacts: [{ path: 'fixture.txt', description: 'Placeholder required file.' }],
    compatibility: { requiresPacks: [], conflictsWithPacks: [], profiles: [] },
    verification: [{ id: 'check', command: 'true', description: 'Always-passing placeholder command.' }],
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

test('validatePack rejects a required artifact path that escapes the project', () => {
  const result = validatePack(minimalPack({ requiredArtifacts: [{ path: '../outside.txt', description: 'Escapes the project root.' }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must be relative and stay inside/);
});

test('validatePack requires at least one setup step, required artifact, verification step and operational evidence item', () => {
  const result = validatePack(minimalPack({ setup: [], requiredArtifacts: [], verification: [], operationalEvidence: [] }));
  assert.equal(result.ok, false);
  const joined = result.errors.join('\n');
  assert.match(joined, /setup must be a non-empty array/);
  assert.match(joined, /requiredArtifacts must be a non-empty array/);
  assert.match(joined, /verification must be a non-empty array/);
  assert.match(joined, /operationalEvidence must be a non-empty array/);
});

test('validatePack rejects a pack that requires itself', () => {
  const result = validatePack(minimalPack({ compatibility: { requiresPacks: ['fixture-pack'], conflictsWithPacks: [], profiles: [] } }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /requiresPacks cannot include the pack's own id/);
});

test('validatePack rejects a leftover v1 upgrade ledger instead of ignoring it', () => {
  // Silently accepting the field would let a pack keep a section nothing reads, which is
  // how upgrade[] stayed empty in all nine packs for its entire life.
  const result = validatePack(minimalPack({ upgrade: [{ from: '1.0.0', to: '2.0.0', breaking: false, steps: ['noop'] }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /upgrade was removed in pack v2/);
});

test('validatePack tells a v1 pack how to get to v2 rather than just refusing it', () => {
  const result = validatePack({ ...minimalPack(), schemaVersion: '1.0' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /migrate it with scripts\/migrate-artifact\.js/);
});

test('validatePack rejects a scaffolding command pinned to a version', () => {
  // The rule that keeps a pack from aging into a snapshot of the year it was written.
  const result = validatePack(minimalPack({
    setup: [{ id: 'scaffold', command: 'npx create-next-app@16.3.5 myapp', description: 'Pinned scaffolder.' }],
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /pins "create-next-app@16\.3\.5"/);
});

test('validatePack accepts an unpinned scaffolder and a pinned application dependency', () => {
  // Only the launcher's own tool token is judged: an app's dependencies SHOULD be pinned.
  const result = validatePack(minimalPack({
    setup: [
      { id: 'scaffold', command: 'npx --yes create-next-app@latest myapp --typescript', description: 'Unpinned scaffolder.' },
      { id: 'deps', command: 'npm install react@19.2.8', description: 'A pinned application dependency, which is fine.' },
    ],
  }));
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('validatePack rejects a duplicate requiredArtifacts path', () => {
  const result = validatePack(minimalPack({
    requiredArtifacts: [
      { path: 'fixture.txt', description: 'First claim.' },
      { path: 'fixture.txt', description: 'Second claim of the same path.' },
    ],
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate path "fixture.txt"/);
});

test('implementedBy binds a pack to a real reference app, and fails when it drifts', () => {
  const bound = pack('nextjs-postgres');
  assert.equal(
    validatePack(bound, { expectedId: bound.id, repoRoot: repositoryRoot }).ok,
    true,
    'the shipped pack must match the app it names'
  );

  const drifted = JSON.parse(JSON.stringify(bound));
  drifted.requiredArtifacts.push({ path: '.claude/stack.json', description: 'A path the reference app does not have.' });
  const result = validatePack(drifted, { expectedId: bound.id, repoRoot: repositoryRoot });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /"\.claude\/stack\.json" is asserted by this pack but does not exist in reference-apps\/nextjs-postgres-crud/);

  const missingApp = JSON.parse(JSON.stringify(bound));
  missingApp.implementedBy = 'reference-apps/does-not-exist';
  const gone = validatePack(missingApp, { expectedId: bound.id, repoRoot: repositoryRoot });
  assert.equal(gone.ok, false);
  assert.match(gone.errors.join('\n'), /no such directory in this repository/);
});

test('the binding check is skipped when no repository root is supplied', () => {
  // An adopter validating a pack inside their own project has no Buaflow repo to bind to,
  // and must not be failed for it.
  const bound = pack('nextjs-postgres');
  assert.equal(validatePack(bound, { expectedId: bound.id }).ok, true);
});


test('the set of packs no reference app proves is pinned, so it can only change on purpose', () => {
  // Every pack in the catalogue is now bound to a reference app, and this list is how it stays
  // that way: a new pack with no implementedBy fails here until someone writes down that it is
  // unproven, which is a decision rather than an oversight. Four packs were dropped in D-014
  // precisely because nothing proved them — binding auth-rbac had shown what an unproven recipe
  // is worth, by revealing it installed two dependencies the real implementation avoids.
  const unbound = fs.readdirSync(packsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => pack(name.replace(/\.json$/, '')))
    .filter((value) => !value.implementedBy)
    .map((value) => value.id)
    .sort();

  assert.deepEqual(
    unbound,
    [],
    'a pack gained or lost a reference-app binding; update this list and packs/README.md together'
  );
});

test('every bound pack really matches the app it names', () => {
  // validatePack does this when given a repo root; asserting it here means the suite fails on
  // drift even if someone removes the check from scripts/check-repository.js.
  for (const name of fs.readdirSync(packsDir).filter((file) => file.endsWith('.json'))) {
    const value = pack(name.replace(/\.json$/, ''));
    if (!value.implementedBy) continue;
    const result = validatePack(value, { expectedId: value.id, repoRoot: repositoryRoot });
    assert.deepEqual(result, { ok: true, errors: [] }, `${value.id}: ${result.errors.join('; ')}`);
  }
});

const CORE_CAPABILITY_PACKS = ['nextjs-postgres', 'react-fastapi-postgres', 'expo-fastapi-postgres-sync', 'auth-rbac', 'audit-log'];

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

test('audit-log leaves requiresPacks empty, because the dependency it has cannot be expressed', () => {
  // It needs *some* persistence-providing pack, and requiresPacks is identity-based rather than
  // capability-based, so there is no honest way to write it — see templates/pack.tpl.json.
  // D-014 sharpened this: db was the other pack that could have satisfied it, and dropping db
  // leaves nextjs-postgres as the only real answer, which makes the missing expressiveness the
  // next thing worth fixing rather than a note nobody acts on.
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
  // Three stacks and two capabilities, all bound to a reference app. D-014 dropped the four
  // that nothing implemented, so this number going up means a new pack was added.
  assert.equal(parsed.results.length, 5);
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
