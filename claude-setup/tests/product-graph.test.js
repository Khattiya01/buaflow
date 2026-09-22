'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'artifacts', 'v1', 'product-graph.json'), 'utf8')
);

function run(root, args) {
  return runNode(path.join(repositoryRoot, 'claude-setup', 'product-graph.js'), {
    cwd: root,
    env: { CLAUDE_PROJECT_DIR: root },
    args,
  });
}

test('renders every leaf value from the graph without loss', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    writeJson(path.join(root, 'docs', 'planning', 'product-graph.json'), fixture);
    const result = run(root, []);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# Product graph — Fixture product/);
    for (const category of ['Actors', 'Outcomes', 'Capabilities', 'Rules', 'Entities', 'Integrations', 'Non-functional requirements', 'Assumptions', 'Risks', 'Exclusions']) {
      assert.match(result.stdout, new RegExp(`## ${category}`));
    }
    // spot-check values from every category actually appear verbatim
    for (const value of ['customer', 'faster-checkout', 'checkout', 'one-active-cart', 'order', 'payment-gateway', 'checkout-latency', 'single-currency', 'gateway-outage', 'no-subscriptions']) {
      assert.ok(result.stdout.includes(value), `expected rendered doc to include "${value}"`);
    }
  } finally {
    cleanup(root);
  }
});

test('--check validates without printing the full document', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    writeJson(path.join(root, 'docs', 'planning', 'product-graph.json'), fixture);
    const result = run(root, ['--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /product-graph --check:.*เอกสารไม่ตกหล่นข้อมูล/);
    assert.doesNotMatch(result.stdout, /^# Product graph/m);
  } finally {
    cleanup(root);
  }
});

test('--out writes the rendered document to a file', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    writeJson(path.join(root, 'docs', 'planning', 'product-graph.json'), fixture);
    const result = run(root, ['--out', 'docs/planning/product-graph.md']);
    assert.equal(result.status, 0, result.stderr);
    const written = fs.readFileSync(path.join(root, 'docs', 'planning', 'product-graph.md'), 'utf8');
    assert.match(written, /# Product graph — Fixture product/);
  } finally {
    cleanup(root);
  }
});

test('fails when the graph file is missing', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    const result = run(root, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ไม่มี/);
  } finally {
    cleanup(root);
  }
});

test('fails on malformed JSON', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    fs.mkdirSync(path.join(root, 'docs', 'planning'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'planning', 'product-graph.json'), '{ not json');
    const result = run(root, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ไม่ใช่ JSON/);
  } finally {
    cleanup(root);
  }
});

test('rejects unknown future major schemaVersion', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    writeJson(path.join(root, 'docs', 'planning', 'product-graph.json'), { ...fixture, schemaVersion: '2.0' });
    const result = run(root, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /schemaVersion "2\.0".*ไม่รองรับ/);
  } finally {
    cleanup(root);
  }
});

test('reader accepts an unversioned graph with a warning', () => {
  const root = temporaryProject('buaflow-product-graph-');
  try {
    const { $schema, schemaVersion, ...unversioned } = fixture;
    writeJson(path.join(root, 'docs', 'planning', 'product-graph.json'), unversioned);
    const result = run(root, ['--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /warn.*ยังไม่มี schemaVersion/);
  } finally {
    cleanup(root);
  }
});
