'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { buildGraph } = require('../convergence.js');
const { impactOf, resolveStart } = require('../change-impact.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

function md(frontmatter, body = '') {
  const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

// intent <- task -> commit, plus a second task depending on the first, so impact has
// somewhere to travel in both directions.
function project(options = {}) {
  const root = temporaryProject('buaflow-impact-');
  write(path.join(root, 'docs', 'intents', 'I-001-checkout.md'),
    md({ id: 'I-001', status: 'accepted' }, 'Driven by PP-002.'));
  write(path.join(root, 'docs', 'backlog', 'tasks', 'T-001-checkout.md'), md({
    id: 'T-001',
    status: 'done',
    intent: 'docs/intents/I-001-checkout.md',
    commit: 'a1b2c3d',
  }));
  write(path.join(root, 'docs', 'backlog', 'tasks', 'T-002-receipt.md'), md({
    id: 'T-002',
    status: 'todo',
    depends_on: ['T-001'],
    ...(options.brokenLink ? { intent: 'docs/intents/I-404-missing.md' } : {}),
  }));
  return root;
}

test('changing an intent names the tasks that implement it, with an action for each', () => {
  const root = project();
  try {
    const result = impactOf(buildGraph(root), 'intent:I-001');
    const keys = result.affected.map((a) => a.key);
    assert.ok(keys.includes('task:T-001'), 'the implementing task must be listed');
    assert.ok(keys.includes('pain-point:PP-002'), 'the problem it came from must be listed');
    for (const item of result.affected) {
      assert.ok(item.action && item.action !== 'review', `${item.key} has no specific action`);
      assert.ok(item.via.includes('->') || item.via.includes('('), `${item.key} does not say how it was reached`);
    }
  } finally {
    cleanup(root);
  }
});

test('impact travels in both directions', () => {
  // Changing a task affects the intent above it, not only whatever it points at. A
  // one-directional walk would silently miss the thing most worth re-reading.
  const root = project();
  try {
    const result = impactOf(buildGraph(root), 'task:T-001');
    const keys = result.affected.map((a) => a.key);
    assert.ok(keys.includes('intent:I-001'), 'upward');
    assert.ok(keys.includes('commit:a1b2c3d'), 'downward');
    assert.ok(keys.includes('task:T-002'), 'sideways, through depends-on');
  } finally {
    cleanup(root);
  }
});

test('--depth bounds the blast radius without changing what is reachable', () => {
  const root = project();
  try {
    const graph = buildGraph(root);
    const shallow = impactOf(graph, 'commit:a1b2c3d', { depth: 1 });
    const deep = impactOf(graph, 'commit:a1b2c3d');
    assert.deepEqual(shallow.affected.map((a) => a.key), ['task:T-001']);
    assert.ok(deep.affected.length > shallow.affected.length);
    for (const item of deep.affected) assert.ok(item.depth >= 1);
  } finally {
    cleanup(root);
  }
});

test('an unresolved link inside the radius is reported as unknown impact', () => {
  // The acceptance criterion that matters most: a link that cannot be resolved must never
  // read as "nothing is affected".
  const root = project({ brokenLink: true });
  try {
    const result = impactOf(buildGraph(root), 'task:T-001');
    assert.ok(result.unknown.length > 0, 'the broken link must surface');
    assert.equal(result.unknown[0].from, 'task:T-002');
  } finally {
    cleanup(root);
  }
});

test('a start that does not exist is unknown, not empty', () => {
  const root = project();
  try {
    const start = resolveStart(buildGraph(root), 'intent:I-404', root);
    assert.equal(start.missing, true);
    assert.match(start.reason, /not a node in the graph/);
  } finally {
    cleanup(root);
  }
});

test('a real file nothing references is unknown impact, and says why', () => {
  // The subtle case: the file exists, so "not found" would be misleading, and "no impact"
  // would be wrong — nothing in the graph knows about it, which is a different answer.
  const root = project();
  try {
    write(path.join(root, 'src', 'stray.ts'), 'export const x = 1;\n');
    const start = resolveStart(buildGraph(root), 'src/stray.ts', root);
    assert.equal(start.missing, true);
    assert.match(start.reason, /exists but no artifact in the graph references it/);
  } finally {
    cleanup(root);
  }
});

test('a start can be given as a file path, not only a node id', () => {
  const root = project();
  try {
    const start = resolveStart(buildGraph(root), 'docs/intents/I-001-checkout.md', root);
    assert.equal(start.key, 'intent:I-001');
  } finally {
    cleanup(root);
  }
});

test('CLI exits 1 on unknown impact so silence cannot be read as safety', () => {
  const root = project();
  try {
    const result = runNode(path.join(repositoryRoot, 'claude-setup', 'change-impact.js'), {
      cwd: root,
      args: ['--root', root, '--from', 'intent:I-404'],
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /UNKNOWN/);
  } finally {
    cleanup(root);
  }
});

test('CLI reports a concrete list for a real start', () => {
  const root = project();
  try {
    const result = runNode(path.join(repositoryRoot, 'claude-setup', 'change-impact.js'), {
      cwd: root,
      args: ['--root', root, '--from', 'intent:I-001', '--json'],
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.start, 'intent:I-001');
    assert.ok(parsed.affected.length >= 2);
    assert.deepEqual(parsed.unknown, []);
  } finally {
    cleanup(root);
  }
});

test('CLI rejects a missing --from instead of guessing', () => {
  const result = runNode(path.join(repositoryRoot, 'claude-setup', 'change-impact.js'), { args: [] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--from is required/);
});

test('changing a control in a shipped reference app names its evidence', () => {
  const root = path.join(repositoryRoot, 'reference-apps', 'nextjs-postgres-crud');
  const result = impactOf(buildGraph(root), 'control:access-control', { depth: 1 });
  assert.ok(result.affected.length > 0, 'a control with evidence must have impact');
  assert.ok(result.affected.every((a) => a.kind === 'evidence'));
  assert.deepEqual(result.unknown, []);
});
