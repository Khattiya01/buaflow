'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { analyze, buildGraph } = require('../convergence.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

function md(frontmatter, body = '') {
  const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

// A small project shaped like a real one: a pain point motivating an intent, a task
// implementing it and carrying a commit, plus the deliberate holes each test looks for.
function project(options = {}) {
  const root = temporaryProject('buaflow-convergence-');

  write(path.join(root, 'docs', 'intents', 'I-001-faster-checkout.md'),
    md({ id: 'I-001', status: 'accepted' }, 'Driven by PP-002, checkout takes too long.'));

  write(path.join(root, 'docs', 'backlog', 'tasks', 'T-001-checkout.md'), md({
    id: 'T-001',
    status: 'done',
    intent: 'docs/intents/I-001-faster-checkout.md',
    ...(options.taskCommit === false ? {} : { commit: 'a1b2c3d' }),
  }));

  if (options.orphanIntent) {
    write(path.join(root, 'docs', 'intents', 'I-009-nobody-asked.md'), md({ id: 'I-009', status: 'draft' }));
  }
  if (options.brokenLink) {
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-002-ghost.md'), md({
      id: 'T-002',
      status: 'in-progress',
      intent: 'docs/intents/I-404-missing.md',
    }));
  }
  if (options.manifest !== false) {
    write(path.join(root, 'evidence', 'report.json'), '{"ok":true}\n');
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), {
      schemaVersion: '1.0',
      project: 'fixture',
      profile: 'test-profile',
      targetLevel: 'R0',
      commit: 'a1b2c3d',
      generatedAt: '2026-09-23T00:00:00.000Z',
      controls: {
        'version-control': { status: 'pass', evidence: [{ type: 'file', value: 'evidence/report.json' }] },
        ...(options.controlWithMissingEvidence
          ? { 'start-path': { status: 'pass', evidence: [{ type: 'file', value: 'evidence/gone.json' }] } }
          : {}),
      },
    });
  }
  return root;
}

test('the graph is derived from artifacts that already exist', () => {
  const root = project();
  try {
    const graph = buildGraph(root);
    const keys = [...graph.nodes.keys()];
    assert.ok(keys.includes('intent:I-001'), 'intents are nodes');
    assert.ok(keys.includes('task:T-001'), 'tasks are nodes');
    assert.ok(keys.includes('pain-point:PP-002'), 'a pain point cited by an intent becomes a node');
    assert.ok(keys.includes('commit:a1b2c3d'), 'a commit is a proof node');
    assert.ok(keys.includes('control:version-control'), 'readiness controls are nodes');

    const relations = graph.edges.map((e) => `${e.from} -${e.relation}-> ${e.to}`);
    assert.ok(relations.includes('pain-point:PP-002 -motivates-> intent:I-001'));
    assert.ok(relations.includes('task:T-001 -implements-> intent:I-001'));
    assert.ok(relations.includes('task:T-001 -proven-by-> commit:a1b2c3d'));
  } finally {
    cleanup(root);
  }
});

test('an artifact nothing links to and that links to nothing is reported as unconnected', () => {
  // The shape most integration failures take: correct in itself, attached to nothing.
  const root = project({ orphanIntent: true });
  try {
    const report = analyze(buildGraph(root));
    assert.deepEqual(report.unconnected, ['intent:I-009']);
  } finally {
    cleanup(root);
  }
});

test('connected but unproven is reported separately from unconnected', () => {
  // Conflating the two would drown the real signal: every not-yet-finished intent would
  // read as an orphan, and nobody would look at the list twice.
  const root = project({ taskCommit: false });
  try {
    const report = analyze(buildGraph(root));
    assert.deepEqual(report.unconnected, []);
    assert.ok(report.unproven.includes('intent:I-001'));
    assert.ok(report.unproven.includes('task:T-001'));
  } finally {
    cleanup(root);
  }
});

test('proof reached through a neighbour counts, in either direction', () => {
  // An intent is proven because a task points AT it and that task has a commit, not
  // because the intent points anywhere itself.
  const root = project();
  try {
    const report = analyze(buildGraph(root));
    assert.deepEqual(report.unproven, [], JSON.stringify(report));
  } finally {
    cleanup(root);
  }
});

test('a link to something that does not exist is recorded as unresolved, never dropped', () => {
  // The rule IC-006 depends on: a silently dropped link becomes "no impact" later, which is
  // the most dangerous answer a change-impact tool can give.
  const root = project({ brokenLink: true });
  try {
    const graph = buildGraph(root);
    assert.equal(graph.unresolved.length, 1);
    assert.equal(graph.unresolved[0].from, 'task:T-002');
    assert.match(graph.unresolved[0].reason, /does not exist in this project/);
    assert.ok(![...graph.nodes.keys()].includes('intent:I-404'), 'a missing target must not be invented as a node');
  } finally {
    cleanup(root);
  }
});

test('evidence a control cites but that is missing is unresolved, not a silent pass', () => {
  const root = project({ controlWithMissingEvidence: true });
  try {
    const graph = buildGraph(root);
    const missing = graph.unresolved.find((u) => u.from === 'control:start-path');
    assert.ok(missing, 'the missing evidence file must be reported');
    assert.match(missing.reason, /evidence file does not exist/);
  } finally {
    cleanup(root);
  }
});

test('packs and profiles connect to the controls they touch', () => {
  const root = project();
  try {
    writeJson(path.join(root, '.claude', 'packs', 'auth-rbac.json'), {
      id: 'auth-rbac',
      operationalEvidence: [{ control: 'version-control', evidence: 'x'.repeat(25) }],
    });
    writeJson(path.join(root, '.claude', 'profiles', 'internal-crud.json'), {
      id: 'internal-crud',
      controls: [{ control: 'version-control', requirement: 'required' }],
    });
    const graph = buildGraph(root);
    const relations = graph.edges.map((e) => `${e.from} -${e.relation}-> ${e.to}`);
    assert.ok(relations.includes('pack:auth-rbac -contributes-to-> control:version-control'));
    assert.ok(relations.includes('profile:internal-crud -requires-> control:version-control'));
  } finally {
    cleanup(root);
  }
});

test('an empty project produces an empty graph rather than an error', () => {
  const root = temporaryProject('buaflow-convergence-empty-');
  try {
    const graph = buildGraph(root);
    assert.equal(graph.nodes.size, 0);
    assert.deepEqual(analyze(graph), { unconnected: [], unproven: [] });
  } finally {
    cleanup(root);
  }
});

test('CLI reports unconnected artifacts and exits 1', () => {
  const root = project({ orphanIntent: true });
  try {
    const result = runNode(path.join(repositoryRoot, 'claude-setup', 'convergence.js'), {
      cwd: root,
      args: ['--root', root],
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /unconnected: intent:I-009/);
  } finally {
    cleanup(root);
  }
});

test('CLI --json emits the graph, not only the verdict', () => {
  const root = project();
  try {
    const result = runNode(path.join(repositoryRoot, 'claude-setup', 'convergence.js'), {
      cwd: root,
      args: ['--root', root, '--json'],
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.nodes.length > 0 && parsed.edges.length > 0);
  } finally {
    cleanup(root);
  }
});

test('every shipped reference app is fully connected', () => {
  for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const graph = buildGraph(root);
    const report = analyze(graph);
    assert.deepEqual(report.unconnected, [], `${app} has unconnected artifacts`);
    assert.deepEqual(graph.unresolved, [], `${app} has unresolved links`);
  }
});
