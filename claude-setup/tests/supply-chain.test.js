'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { deriveLicenses, evaluateSupplyChain, licenseOf } = require('../supply-chain.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const APPS = ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync'];
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function component(name, licenses) {
  return { type: 'library', name, version: '1.0.0', ...(licenses ? { licenses } : {}) };
}

function scaffold(directory, components) {
  const sbomPath = path.join(directory, 'evidence', 'sbom.cdx.json');
  writeJson(sbomPath, { bomFormat: 'CycloneDX', specVersion: '1.6', components });
  writeJson(path.join(directory, 'lock.json'), { pinned: true });
  writeJson(path.join(directory, 'evidence', 'ci-run.json'), {
    provider: 'github-actions',
    repository: 'example/repo',
    runId: 42,
    url: 'https://example.invalid/runs/42',
    workflow: 'CI',
    commit: COMMIT,
    conclusion: 'success',
  });
  writeJson(path.join(directory, 'docs', 'evidence', 'readiness.json'), { commit: COMMIT });
  return {
    sbom: { path: 'evidence/sbom.cdx.json', sha256: sha256(sbomPath) },
    lock: { path: 'lock.json', sha256: sha256(path.join(directory, 'lock.json')) },
  };
}

function record(directory, components, overrides = {}) {
  const files = scaffold(directory, components);
  const summary = {};
  for (const item of components) summary[licenseOf(item)] = (summary[licenseOf(item)] || 0) + 1;
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    generatedAt: '2026-09-23T00:00:00.000Z',
    sboms: [files.sbom],
    licenses: { policy: { allowed: ['MIT'] }, summary, reviewed: [] },
    provenance: {
      source: { repository: 'example/repo', commit: COMMIT },
      builder: { provider: 'github-actions', workflow: 'CI', runId: 42, url: 'https://example.invalid/runs/42' },
      subjects: [files.lock],
    },
    ...overrides,
  };
}

test('a record whose summary matches its SBOMs passes, and the digests are recomputed', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }]), component('b', [{ license: { id: 'MIT' } }])]);
    const result = evaluateSupplyChain(value, { root: directory });
    assert.deepEqual(result.errors, []);
    assert.equal(result.totals.components, 2);
    assert.equal(result.totals.subjects, 1);
  } finally {
    cleanup(directory);
  }
});

// The rule the artifact exists for: a hand-written licence count is a count that drifts.
test('a summary that disagrees with the SBOM fails, in both directions', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const undercount = record(directory, [component('a', [{ license: { id: 'MIT' } }]), component('b', [{ license: { id: 'MIT' } }])]);
    undercount.licenses.summary.MIT = 1;
    const low = evaluateSupplyChain(undercount, { root: directory });
    assert.equal(low.ok, false);
    assert.match(low.errors.join('\n'), /"MIT" is recorded as 1 but the SBOMs contain 2/);

    const invented = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    invented.licenses.summary['Apache-2.0'] = 3;
    const ghost = evaluateSupplyChain(invented, { root: directory });
    assert.equal(ghost.ok, false);
    assert.match(ghost.errors.join('\n'), /"Apache-2\.0" is recorded but appears in no SBOM/);
  } finally {
    cleanup(directory);
  }
});

test('editing an SBOM after the record was written invalidates it rather than changing it silently', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    writeJson(path.join(directory, 'evidence', 'sbom.cdx.json'), {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [component('a', [{ license: { id: 'MIT' } }]), component('sneaked-in', [{ license: { id: 'MIT' } }])],
    });
    const result = evaluateSupplyChain(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /the file changed after this record was written/);
  } finally {
    cleanup(directory);
  }
});

test('a licence that is neither allowed nor reviewed is an unanswered obligation', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }]), component('b', [{ license: { id: 'GPL-3.0-only' } }])]);
    const result = evaluateSupplyChain(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /"GPL-3\.0-only" \(1 component\(s\)\) is neither allowed by policy nor reviewed/);
  } finally {
    cleanup(directory);
  }
});

test('a review must match the real component count and cannot double as a policy entry', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }]), component('b', [{ license: { id: 'MPL-2.0' } }])]);
    value.licenses.reviewed = [{ license: 'MPL-2.0', components: 5, decision: 'allowed', note: 'weak copyleft, consumed unmodified as a dependency' }];
    const wrongCount = evaluateSupplyChain(value, { root: directory });
    assert.equal(wrongCount.ok, false);
    assert.match(wrongCount.errors.join('\n'), /recorded against 5 component\(s\) but the SBOMs contain 1/);

    value.licenses.reviewed = [{ license: 'MIT', components: 1, decision: 'allowed', note: 'weak copyleft, consumed unmodified as a dependency' }];
    const doubled = evaluateSupplyChain(value, { root: directory });
    assert.equal(doubled.ok, false);
    assert.match(doubled.errors.join('\n'), /already blanket-allowed by the policy/);
  } finally {
    cleanup(directory);
  }
});

test('an accepted-risk licence needs an exception with an owner and an expiry, like every other accepted risk', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }]), component('b', null)]);
    value.licenses.reviewed = [{ license: 'NONE', components: 1, decision: 'accepted-risk', note: 'the publisher declares no licence the generator could resolve' }];
    const naked = evaluateSupplyChain(value, { root: directory });
    assert.equal(naked.ok, false);
    assert.match(naked.errors.join('\n'), /must name an exception/);

    value.licenses.reviewed[0].exception = 'REQ-201';
    const dangling = evaluateSupplyChain(value, { root: directory });
    assert.equal(dangling.ok, false);
    assert.match(dangling.errors.join('\n'), /requirement-coverage\.json does not exist/);

    writeJson(path.join(directory, 'docs', 'evidence', 'requirement-coverage.json'), {
      schemaVersion: '1.0',
      project: 'fixture',
      generatedAt: '2026-09-23T00:00:00.000Z',
      requirements: [{
        id: 'REQ-201',
        statement: 'Every component carries a licence grant',
        source: 'fixture',
        exception: {
          owner: 'a named human',
          reason: 'accepted deliberately for a reason long enough to be a real sentence',
          risk: 'medium',
          acceptedOn: '2026-09-01',
          expiresOn: '2099-01-01',
        },
      }],
    });
    const linked = evaluateSupplyChain(value, { root: directory });
    assert.deepEqual(linked.errors, []);
    assert.equal(linked.totals.acceptedRisk, 1);
  } finally {
    cleanup(directory);
  }
});

// Provenance that is not tied to evidence the project already has is just more prose.
test('provenance must agree with the CI run evidence and the graded revision', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    value.provenance.builder.runId = 99;
    const mismatch = evaluateSupplyChain(value, { root: directory });
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.errors.join('\n'), /builder\.runId.*describe different builds/s);

    const other = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    other.provenance.source.commit = 'fedcba9876543210fedcba9876543210fedcba98';
    writeJson(path.join(directory, 'evidence', 'ci-run.json'), {
      provider: 'github-actions',
      repository: 'example/repo',
      runId: 42,
      url: 'https://example.invalid/runs/42',
      workflow: 'CI',
      commit: 'fedcba9876543210fedcba9876543210fedcba98',
      conclusion: 'success',
    });
    const wrongRevision = evaluateSupplyChain(other, { root: directory });
    assert.equal(wrongRevision.ok, false);
    assert.match(wrongRevision.errors.join('\n'), /is not the revision the readiness manifest graded/);
  } finally {
    cleanup(directory);
  }
});

test('provenance citing a build that did not succeed is refused', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    writeJson(path.join(directory, 'evidence', 'ci-run.json'), {
      provider: 'github-actions',
      repository: 'example/repo',
      runId: 42,
      url: 'https://example.invalid/runs/42',
      workflow: 'CI',
      commit: COMMIT,
      conclusion: 'failure',
    });
    const result = evaluateSupplyChain(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /concluded "failure"/);
  } finally {
    cleanup(directory);
  }
});

test('a subject digest that does not match the file on disk fails', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const value = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    value.provenance.subjects[0].sha256 = '0'.repeat(64);
    const result = evaluateSupplyChain(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /provenance\.subjects\[0\]: lock\.json hashes to/);
  } finally {
    cleanup(directory);
  }
});

test('a malformed or duplicated licence expression is preserved rather than tidied away', () => {
  assert.equal(licenseOf({ licenses: [{ license: { name: 'MIT and ISC' } }] }), 'MIT and ISC');
  assert.equal(licenseOf({ licenses: [{ license: { id: 'MIT' } }, { license: { id: 'MIT' } }] }), 'MIT | MIT');
  assert.equal(licenseOf({ licenses: [{ expression: '(MIT OR Apache-2.0)' }] }), '(MIT OR Apache-2.0)');
  assert.equal(licenseOf({}), 'NONE');
});

test('the CLI exits 0 on a consistent record and 1 when the summary drifts', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const script = path.join(repositoryRoot, 'claude-setup', 'supply-chain.js');
    const target = path.join(directory, 'docs', 'evidence', 'supply-chain.json');
    const args = ['--root', directory, '--file', 'docs/evidence/supply-chain.json'];

    const good = record(directory, [component('a', [{ license: { id: 'MIT' } }])]);
    writeJson(target, good);
    const pass = runNode(script, { args, cwd: directory });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /PASS/);

    good.licenses.summary.MIT = 9;
    writeJson(target, good);
    const fail = runNode(script, { args, cwd: directory });
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /recorded as 9 but the SBOMs contain 1/);
  } finally {
    cleanup(directory);
  }
});

test('every reference app ships supply-chain evidence that still matches its own SBOMs', () => {
  for (const app of APPS) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const file = path.join(root, 'docs', 'evidence', 'supply-chain.json');
    assert.ok(fs.existsSync(file), `${app} is missing docs/evidence/supply-chain.json`);
    const result = evaluateSupplyChain(JSON.parse(fs.readFileSync(file, 'utf8')), { root });
    assert.deepEqual(result.errors, [], `${app}: ${result.errors.join('; ')}`);
    assert.ok(result.totals.components > 0, `${app} derived no components at all`);
    assert.ok(result.totals.subjects > 0, `${app} recomputed no subject digest`);
  }
});

test('deriveLicenses reads the licence of every component, including the ones with none', () => {
  const directory = temporaryProject('buaflow-supply-');
  try {
    const files = scaffold(directory, [
      component('a', [{ license: { id: 'MIT' } }]),
      component('b', [{ license: { id: 'MIT' } }]),
      component('c', null),
    ]);
    const errors = [];
    const { summary, components } = deriveLicenses([files.sbom], directory, errors);
    assert.deepEqual(errors, []);
    assert.equal(components, 3);
    assert.deepEqual(summary, { MIT: 2, NONE: 1 });
  } finally {
    cleanup(directory);
  }
});
