'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildBundle, renderReportIndex, validateBundle } = require('../evidence-bundle.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

function manifest(overrides = {}) {
  return {
    schemaVersion: '1.0',
    project: 'fixture-app',
    profile: 'internal-crud',
    targetLevel: 'R1',
    commit: 'abc1234',
    generatedAt: '2026-09-23T00:00:00.000Z',
    controls: {
      'version-control': { status: 'pass', evidence: [{ type: 'command', value: 'git log -1' }] },
      'start-path': { status: 'pass', evidence: [{ type: 'command', value: 'npm start' }] },
      'primary-flow': { status: 'pass', evidence: [{ type: 'manual', value: 'manually verified crud flow' }] },
      build: { status: 'pass', evidence: [{ type: 'command', value: 'npm run build' }] },
      verification: { status: 'pass', evidence: [{ type: 'command', value: 'npm test' }] },
    },
    ...overrides,
  };
}

function setup(overrides = {}) {
  const root = temporaryProject('buaflow-evidence-bundle-');
  writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), manifest(overrides));
  return root;
}

test('buildBundle wraps a passing readiness manifest without dropping any control data', () => {
  const root = setup();
  try {
    const { bundle, markdown } = buildBundle({
      root,
      manifestPath: 'docs/evidence/readiness.json',
      reportIndexPath: 'docs/evidence/bundle-index.md',
      now: '2026-09-23T01:00:00.000Z',
    });
    assert.equal(bundle.project, 'fixture-app');
    assert.equal(bundle.commit, 'abc1234');
    assert.equal(bundle.generatedAt, '2026-09-23T01:00:00.000Z');
    assert.equal(bundle.readinessManifestPath, 'docs/evidence/readiness.json');
    assert.equal(bundle.reportIndexPath, 'docs/evidence/bundle-index.md');
    assert.equal(bundle.toolVersions.node, process.version);
    assert.deepEqual(bundle.summary, { level: 'R1', ok: true, passed: 5, required: 5 });
    assert.equal(validateBundle(bundle).ok, true);

    for (const needle of ['version-control', 'npm run build', 'manually verified crud flow', 'git log -1']) {
      assert.match(markdown, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    cleanup(root);
  }
});

test('buildBundle still wraps a failing readiness manifest, reporting summary.ok false', () => {
  const root = setup({ controls: { ...manifest().controls, build: { status: 'fail', evidence: [] } } });
  try {
    const { bundle } = buildBundle({ root, manifestPath: 'docs/evidence/readiness.json', reportIndexPath: 'docs/evidence/bundle-index.md' });
    assert.equal(bundle.summary.ok, false);
    assert.equal(bundle.summary.passed, 4);
    assert.equal(validateBundle(bundle).ok, true);
  } finally {
    cleanup(root);
  }
});

test('buildBundle throws when the readiness manifest is missing', () => {
  const root = temporaryProject('buaflow-evidence-bundle-');
  try {
    assert.throws(
      () => buildBundle({ root, manifestPath: 'docs/evidence/readiness.json', reportIndexPath: 'docs/evidence/bundle-index.md' }),
      /readiness manifest not found/
    );
  } finally {
    cleanup(root);
  }
});

test('buildBundle throws when the manifest commit is not a valid revision', () => {
  const root = setup({ commit: 'not-hex' });
  try {
    assert.throws(
      () => buildBundle({ root, manifestPath: 'docs/evidence/readiness.json', reportIndexPath: 'docs/evidence/bundle-index.md' }),
      /hexadecimal revision/
    );
  } finally {
    cleanup(root);
  }
});

test('validateBundle rejects a bundle missing required fields', () => {
  const result = validateBundle({ schemaVersion: '1.0', project: 'x' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('commit')));
});

test('renderReportIndex includes every control id from the manifest', () => {
  const m = manifest();
  const bundle = {
    project: 'fixture-app',
    commit: 'abc1234',
    generatedAt: '2026-09-23T01:00:00.000Z',
    readinessManifestPath: 'docs/evidence/readiness.json',
    toolVersions: { node: process.version, platform: process.platform, arch: process.arch },
    summary: { level: 'R1', ok: true, passed: 5, required: 5 },
  };
  const markdown = renderReportIndex(bundle, m);
  for (const controlId of Object.keys(m.controls)) assert.match(markdown, new RegExp(controlId));
});

function run(args) {
  return runNode(path.join(repositoryRoot, 'claude-setup', 'evidence-bundle.js'), { args });
}

test('CLI --check passes for a well-formed readiness manifest', () => {
  const root = setup();
  try {
    const result = run(['--root', root, '--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /builds cleanly/);
    assert.match(result.stdout, /R1 PASS 5\/5/);
  } finally {
    cleanup(root);
  }
});

test('CLI --check --json emits a machine-readable bundle', () => {
  const root = setup();
  try {
    const result = run(['--root', root, '--check', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.bundle.project, 'fixture-app');
  } finally {
    cleanup(root);
  }
});

test('CLI --write produces both the bundle JSON and its report index', () => {
  const root = setup();
  try {
    const result = run(['--root', root, '--write']);
    assert.equal(result.status, 0, result.stderr);

    const bundlePath = path.join(root, 'docs', 'evidence', 'bundle.json');
    const indexPath = path.join(root, 'docs', 'evidence', 'bundle-index.md');
    assert.ok(fs.existsSync(bundlePath));
    assert.ok(fs.existsSync(indexPath));

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    assert.equal(validateBundle(bundle).ok, true);
    assert.match(fs.readFileSync(indexPath, 'utf8'), /## Controls/);
  } finally {
    cleanup(root);
  }
});

test('CLI default preview prints Markdown to stdout without writing files', () => {
  const root = setup();
  try {
    const result = run(['--root', root]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# Evidence bundle — fixture-app/);
    assert.ok(!fs.existsSync(path.join(root, 'docs', 'evidence', 'bundle.json')));
  } finally {
    cleanup(root);
  }
});

test('CLI fails cleanly when the readiness manifest file does not exist', () => {
  const root = temporaryProject('buaflow-evidence-bundle-');
  try {
    const result = run(['--root', root, '--check']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /readiness manifest not found/);
  } finally {
    cleanup(root);
  }
});

test('CLI rejects --write combined with --check', () => {
  const root = setup();
  try {
    const result = run(['--root', root, '--write', '--check']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot be used together/);
  } finally {
    cleanup(root);
  }
});
