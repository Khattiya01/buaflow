'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { migrateArtifact } = require('../../scripts/migrate-artifact.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const fixtures = path.join(__dirname, 'fixtures', 'artifacts');
const types = ['stack-config', 'readiness-manifest', 'prototype-flow', 'pixel-config', 'project-manifest', 'product-graph', 'application-profile', 'pack', 'evidence-bundle'];

function fixture(version, type) {
  return JSON.parse(fs.readFileSync(path.join(fixtures, version, `${type}.json`), 'utf8'));
}

for (const type of types) {
  test(`${type} migrates unversioned fixture to canonical v1`, () => {
    const before = fixture('v0', type);
    const expected = fixture('v1', type);
    const result = migrateArtifact(before, { type });
    assert.equal(result.fromVersion, 'unversioned');
    assert.equal(result.toVersion, '1.0');
    assert.equal(result.changed, true);
    assert.deepEqual(result.value, expected);
  });

  test(`${type} v1 migration is idempotent`, () => {
    const current = fixture('v1', type);
    const result = migrateArtifact(current, { type });
    assert.equal(result.changed, false);
    assert.deepEqual(result.value, current);
  });
}

test('migrator rejects unknown future source versions', () => {
  assert.throws(
    () => migrateArtifact({ schemaVersion: '2.0' }, { type: 'stack-config' }),
    /unsupported source version 2\.0/
  );
});

test('CLI preview does not modify the source file', () => {
  const root = temporaryProject('buaflow-migration-');
  try {
    const file = path.join(root, 'stack.json');
    const before = fixture('v0', 'stack-config');
    writeJson(file, before);
    const result = runNode(path.join(repositoryRoot, 'scripts', 'migrate-artifact.js'), {
      cwd: root,
      args: ['--type', 'stack-config', '--file', 'stack.json'],
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), before);
    assert.match(result.stdout, /"schemaVersion": "1\.0"/);
  } finally {
    cleanup(root);
  }
});

test('CLI check and explicit write have stable exit behavior', () => {
  const root = temporaryProject('buaflow-migration-');
  try {
    const file = path.join(root, 'pixel.json');
    writeJson(file, fixture('v0', 'pixel-config'));
    const needsMigration = runNode(path.join(repositoryRoot, 'scripts', 'migrate-artifact.js'), {
      cwd: root,
      args: ['--type', 'pixel-config', '--file', 'pixel.json', '--check'],
    });
    assert.equal(needsMigration.status, 1);

    const written = runNode(path.join(repositoryRoot, 'scripts', 'migrate-artifact.js'), {
      cwd: root,
      args: ['--type', 'pixel-config', '--file', 'pixel.json', '--write'],
    });
    assert.equal(written.status, 0, written.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), fixture('v1', 'pixel-config'));

    const canonical = runNode(path.join(repositoryRoot, 'scripts', 'migrate-artifact.js'), {
      cwd: root,
      args: ['--type', 'pixel-config', '--file', 'pixel.json', '--check'],
    });
    assert.equal(canonical.status, 0);
  } finally {
    cleanup(root);
  }
});

test('prototype and pixel readers reject unknown future major versions', () => {
  const root = temporaryProject('buaflow-version-reader-');
  try {
    writeJson(path.join(root, 'flow.json'), { schemaVersion: '2.0', screens: {} });
    writeJson(path.join(root, 'pixel.json'), { schemaVersion: '2.0', pages: {} });

    const prototype = runNode(path.join(repositoryRoot, 'claude-setup', 'prototype.js'), {
      cwd: root,
      env: { CLAUDE_PROJECT_DIR: root },
      args: ['--flow', 'flow.json', '--check'],
    });
    assert.equal(prototype.status, 1);
    assert.match(prototype.stderr, /schemaVersion "2\.0".*ไม่รองรับ/);

    const pixel = runNode(path.join(repositoryRoot, 'claude-setup', 'pixel.js'), {
      cwd: root,
      env: { CLAUDE_PROJECT_DIR: root },
      args: ['--config', 'pixel.json', '--check'],
    });
    assert.equal(pixel.status, 1);
    assert.match(pixel.stderr, /schemaVersion "2\.0".*ไม่รองรับ/);
  } finally {
    cleanup(root);
  }
});
