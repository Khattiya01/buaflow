'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validateProfile } = require('../application-profile.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const profilesDir = path.join(__dirname, 'fixtures', 'profiles');
const profileFile = (name) => path.join(profilesDir, `${name}.json`);
const profile = (name) => JSON.parse(fs.readFileSync(profileFile(name), 'utf8'));

function minimalProfile(overrides = {}) {
  return {
    schemaVersion: '1.0',
    id: 'fixture',
    name: 'Fixture profile',
    controls: [{ control: 'persistence', requirement: 'not-applicable', rationale: 'This fixture has no runtime data store at all.' }],
    architectureChoices: [{ area: 'rendering', choice: 'static', rationale: 'Kept simple for the unit test.' }],
    clarificationQuestions: [{ id: 'q1', prompt: 'Sample?', affects: ['architecture'], whyItMatters: 'Exercises the validator.' }],
    ...overrides,
  };
}

test('validateProfile accepts a well-formed profile', () => {
  const result = validateProfile(minimalProfile());
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('validateProfile rejects an unknown control id', () => {
  const result = validateProfile(minimalProfile({ controls: [{ control: 'not-a-real-control', requirement: 'required', rationale: 'X'.repeat(25) }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unknown control "not-a-real-control"/);
});

test('validateProfile rejects not-applicable on a non-conditional control', () => {
  const result = validateProfile(minimalProfile({ controls: [{ control: 'build', requirement: 'not-applicable', rationale: 'X'.repeat(25) }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /"build" is not a conditional control/);
});

test('validateProfile rejects a rationale shorter than 20 characters', () => {
  const result = validateProfile(minimalProfile({ controls: [{ control: 'persistence', requirement: 'not-applicable', rationale: 'too short' }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /rationale must be at least 20 characters/);
});

test('validateProfile requires at least one entry in every category', () => {
  const result = validateProfile(minimalProfile({ architectureChoices: [] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /architectureChoices must be a non-empty array/);
});

test('validateProfile rejects duplicate clarification question ids', () => {
  const question = { id: 'q1', prompt: 'Sample?', affects: ['architecture'], whyItMatters: 'Exercises the validator.' };
  const result = validateProfile(minimalProfile({ clarificationQuestions: [question, question] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate question id "q1"/);
});

test('validateProfile rejects an unknown affects value', () => {
  const result = validateProfile(
    minimalProfile({ clarificationQuestions: [{ id: 'q1', prompt: 'Sample?', affects: ['marketing'], whyItMatters: 'Exercises the validator.' }] })
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unknown affects value "marketing"/);
});

test('validateProfile flags an id that does not match its filename', () => {
  const result = validateProfile(minimalProfile(), { expectedId: 'other-id' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /does not match filename "other-id\.json"/);
});

test('the content, internal-crud and saas fixtures each pass validation', () => {
  for (const name of ['content', 'internal-crud', 'saas']) {
    const result = validateProfile(profile(name), { expectedId: name });
    assert.equal(result.ok, true, `${name}: ${result.errors.join('; ')}`);
  }
});

test('the three fixture profiles genuinely disagree on required controls', () => {
  const requirementFor = (name, control) => profile(name).controls.find((c) => c.control === control)?.requirement;

  // A content site has no runtime data store or auth boundary; an internal CRUD tool and a SaaS product both do.
  assert.equal(requirementFor('content', 'persistence'), 'not-applicable');
  assert.equal(requirementFor('internal-crud', 'persistence'), 'required');
  assert.equal(requirementFor('saas', 'persistence'), 'required');

  // Only the SaaS profile ships continuous schema changes to a shared production database.
  assert.equal(requirementFor('saas', 'database-migration'), 'required');
  assert.equal(requirementFor('content', 'database-migration'), undefined);
  assert.equal(requirementFor('internal-crud', 'database-migration'), undefined);

  // A public content site commits to an accessibility budget; an internal tool with a known audience does not.
  assert.equal(requirementFor('content', 'accessibility'), 'required');
  assert.equal(requirementFor('internal-crud', 'accessibility'), 'not-applicable');
});

function run(args, cwd = repositoryRoot) {
  return runNode(path.join(repositoryRoot, 'claude-setup', 'application-profile.js'), { cwd, args });
}

test('--file validates a single profile and exits 0', () => {
  const result = run(['--file', path.relative(repositoryRoot, profileFile('saas'))]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /application-profile: 1 profile\(s\) valid/);
});

test('--dir validates every profile in the fixtures directory', () => {
  const result = run(['--dir', path.relative(repositoryRoot, profilesDir), '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.results.length, 3);
  assert.ok(parsed.results.every((r) => r.ok));
});

test('--dir fails a profile whose id does not match its own filename', () => {
  const root = temporaryProject('buaflow-application-profile-');
  try {
    writeJson(path.join(root, 'profiles', 'renamed.json'), minimalProfile({ id: 'fixture' }));
    const result = run(['--dir', 'profiles'], root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /does not match filename "renamed\.json"/);
  } finally {
    cleanup(root);
  }
});

test('fails on malformed JSON', () => {
  const root = temporaryProject('buaflow-application-profile-');
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
