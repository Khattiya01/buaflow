'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { DIMENSIONS, benchmark, scoreControl } = require('../benchmark.js');
const { CONTROLS_BY_LEVEL } = require('../readiness.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const noGit = () => ({ status: 128, stdout: '' });
const probe = (status = 'fail') => ({ results: new Proxy({}, { get: () => ({ status, reason: 'probe' }) }) });

test('every R0–R3 control belongs to exactly one dimension', () => {
  const all = ['R0', 'R1', 'R2', 'R3'].flatMap((level) => CONTROLS_BY_LEVEL[level]);
  const placed = Object.values(DIMENSIONS).flat();
  assert.deepEqual([...placed].sort(), [...all].sort());
  assert.equal(new Set(placed).size, placed.length);
});

test('a claim is worth full marks only with independently confirmed evidence', () => {
  const manifest = (evidence) => ({ controls: { build: { status: 'pass', evidence } } });
  const verification = (verdicts) => ({ verdicts: [{ control: 'build', verdict: verdicts.includes('refuted') ? 'refuted' : 'confirmed', evidence: verdicts.map((v) => ({ verdict: v })) }] });

  assert.equal(scoreControl('build', manifest([{ type: 'file', value: 'x' }]), verification(['confirmed']), probe()).score, 1);
  assert.equal(scoreControl('build', manifest([{ type: 'command', value: 'x' }]), verification(['unverifiable']), probe()).score, 0.5);
  assert.equal(scoreControl('build', manifest([{ type: 'file', value: 'x' }]), verification(['refuted']), probe()).score, 0);
  // EV-002: a screenshot-only score is explicitly not qualifying.
  const manual = scoreControl('build', manifest([{ type: 'manual', value: 'screenshot.png looked fine' }]), verification(['unverifiable']), probe());
  assert.equal(manual.score, 0);
  assert.equal(manual.basis, 'manual-only');
});

test('without a manifest the probe decides, and a builder\'s own fail is believed', () => {
  assert.equal(scoreControl('ci', null, null, probe('pending')).score, 0.5);
  assert.equal(scoreControl('ci', null, null, probe('pass')).score, 1);
  assert.equal(scoreControl('ci', { controls: { ci: { status: 'fail', evidence: [] } } }, { verdicts: [] }, probe('pass')).score, 0);
});

test('an allowed not-applicable leaves the denominator; an unjustified one does not', () => {
  const na = (rationale) => ({ controls: { persistence: { status: 'not-applicable', rationale, evidence: [] } } });
  assert.equal(scoreControl('persistence', na('The app is a static brochure with no stored state.'), { verdicts: [] }, probe()).score, null);
  assert.equal(scoreControl('persistence', na('n/a'), { verdicts: [] }, probe()).score, 0);
  assert.equal(scoreControl('build', { controls: { build: { status: 'not-applicable', rationale: 'Nothing to build here at all, honestly.', evidence: [] } } }, { verdicts: [] }, probe()).score, 0);
});

test('a project with no manifest is still scored, and is never production-qualified', () => {
  const root = temporaryProject('buaflow-benchmark-');
  try {
    write(path.join(root, 'README.md'), '```\nnpm run dev\n```\n');
    const result = benchmark(root, { gitRunner: noGit });
    assert.equal(result.sources.manifest, false);
    assert.equal(result.qualified, false);
    assert.match(result.reasons.join('\n'), /no readiness manifest/);
    for (const dimension of Object.values(result.dimensions)) assert.ok(dimension.score < 0.8);
    // Missing evidence artifacts score 0 for everyone rather than being skipped.
    assert.ok(result.dimensions.operations.items.some((i) => i.id === 'budgets' && i.basis === 'absent' && i.score === 0));
  } finally {
    cleanup(root);
  }
});

test('an honest R2 manifest is not reported as refuted for the R3 claims it never made', () => {
  const root = temporaryProject('buaflow-benchmark-');
  try {
    write(path.join(root, 'README.md'), '# app\n');
    const controls = {};
    for (const id of ['version-control', 'start-path', 'primary-flow', 'build', 'verification', 'requirements-traceability', 'automated-tests', 'persistence', 'access-control']) {
      controls[id] = { status: 'pass', evidence: [{ type: 'file', value: 'README.md' }] };
    }
    controls.ci = { status: 'fail', evidence: [] };
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), {
      schemaVersion: '1.0', project: 'honest-r2', profile: 'internal-crud', targetLevel: 'R2', commit: 'WORKTREE', generatedAt: '2026-09-23T00:00:00.000Z', controls,
    });
    const result = benchmark(root, { gitRunner: noGit });
    assert.doesNotMatch(result.reasons.join('\n'), /refuted/);
    assert.match(result.reasons.join('\n'), /targets R2, not R3/);
  } finally {
    cleanup(root);
  }
});

test('the three reference apps are scored by the same command, and each is production-qualified', () => {
  const apps = ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync'].map((app) => path.join(repositoryRoot, 'reference-apps', app));
  const result = runNode(path.join(repositoryRoot, 'claude-setup', 'benchmark.js'), { args: [...apps.flatMap((app) => ['--root', app]), '--json'] });
  assert.equal(result.status, 0, result.stderr);
  const scores = JSON.parse(result.stdout);
  assert.equal(scores.length, 3);
  for (const score of scores) {
    assert.equal(score.qualified, true, `${score.project}: ${score.reasons.join('; ')}`);
    // None of them has agent evals — the benchmark says so instead of skipping the item.
    assert.equal(score.dimensions.engineering.items.find((i) => i.id === 'agent-evals').score, 0);
  }
});
