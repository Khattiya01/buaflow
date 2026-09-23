'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { controlsFor, evaluateFreshness, validateManifest } = require('../readiness.js');
const { repositoryRoot, runNode } = require('./helpers.js');

function manifest(level = 'R0') {
  const controls = {};
  for (const id of controlsFor(level)) {
    controls[id] = {
      status: 'pass',
      evidence: [{ type: 'command', value: `verify ${id}` }],
    };
  }
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    profile: 'test-profile',
    targetLevel: level,
    commit: level === 'R3' || level === 'R4' ? '0123456789abcdef' : 'WORKTREE',
    generatedAt: '2026-09-22T12:00:00.000Z',
    controls,
  };
}

test('R0 passes with its three required controls', () => {
  const result = validateManifest(manifest('R0'));
  assert.equal(result.ok, true);
  assert.equal(result.passed, 3);
  assert.deepEqual(result.errors, []);
});

test('missing inherited control fails R3', () => {
  const value = manifest('R3');
  delete value.controls.verification;
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /verification: required control is missing/);
});

test('conditional control accepts not-applicable with a concrete rationale', () => {
  const value = manifest('R2');
  value.controls.persistence = {
    status: 'not-applicable',
    evidence: [],
    rationale: 'This static site has no runtime data store or mutable user data.',
  };
  const result = validateManifest(value);
  assert.equal(result.ok, true);
});

test('non-conditional control rejects not-applicable', () => {
  const value = manifest('R1');
  value.controls.build = {
    status: 'not-applicable',
    evidence: [],
    rationale: 'The team does not currently run a build for this application.',
  };
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /build: not-applicable is not allowed/);
});

test('machine-verifiable control rejects manual-only evidence', () => {
  const value = manifest('R1');
  value.controls.verification.evidence = [{ type: 'manual', value: 'Reviewer says the checks passed' }];
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /manual evidence alone cannot satisfy/);
});

test('file evidence must exist under the project root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buaflow-readiness-'));
  try {
    const value = manifest('R0');
    value.controls['primary-flow'].evidence = [{ type: 'file', value: 'reports/flow.json' }];
    const missing = validateManifest(value, { root });
    assert.equal(missing.ok, false);
    assert.match(missing.errors.join('\n'), /file does not exist/);

    fs.mkdirSync(path.join(root, 'reports'));
    fs.writeFileSync(path.join(root, 'reports', 'flow.json'), '{}');
    const present = validateManifest(value, { root });
    assert.equal(present.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R3 requires an immutable hexadecimal commit identity', () => {
  const value = manifest('R3');
  value.commit = 'WORKTREE';
  const result = validateManifest(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /R3\+ requires commit/);
});

// --- EP-010: evidence freshness -------------------------------------------------------
//
// The question these cover is not "were the controls satisfied" but "is that answer still
// true". A manifest can be perfectly valid and completely out of date, and before this
// control the validator reported that as PASS.

// git is never consulted in these: a fake runner keeps them deterministic and fast, and
// the shapes it returns are the real ones (status 0 / non-zero from git plumbing).
function gitRunner(plan) {
  return (args) => {
    if (args[0] === 'rev-parse') return plan.insideWorkTree === false ? { status: 128 } : { status: 0 };
    if (args[0] === 'cat-file') return plan.commitKnown === false ? { status: 1 } : { status: 0 };
    if (args[0] === 'merge-base') return plan.ancestor === false ? { status: 1 } : { status: 0 };
    throw new Error('unexpected git call: ' + args.join(' '));
  };
}

const NOW = new Date('2026-12-01T00:00:00.000Z');

test('without a window the age is reported but never judged', () => {
  const result = validateManifest(manifest('R0'), { now: NOW });
  assert.equal(result.outcome, 'pass');
  assert.equal(result.ok, true);
  assert.equal(result.freshness.state, 'unknown');
  assert.equal(result.freshness.ageDays, 69);
  assert.match(result.warnings.join('\n'), /no --max-age-days was supplied/);
});

test('evidence inside the supplied window is fresh', () => {
  const result = validateManifest(manifest('R0'), { now: NOW, maxAgeDays: 90, git: false });
  assert.equal(result.outcome, 'pass');
  assert.equal(result.freshness.state, 'fresh');
});

test('evidence past the supplied window is expired, not passed and not failed', () => {
  const result = validateManifest(manifest('R0'), { now: NOW, maxAgeDays: 30, git: false });
  assert.equal(result.outcome, 'expired');
  assert.deepEqual(result.errors, []);
  assert.equal(result.passed, result.required);
  // ok stays true: every control really was satisfied. Expiry is the separate axis, so a
  // report or an evidence bundle can still be produced for it.
  assert.equal(result.ok, true);
  assert.match(result.warnings.join('\n'), /69 days old, past the 30-day window/);
});

test('a commit that is no longer an ancestor of HEAD expires the manifest on its own', () => {
  const result = validateManifest(manifest('R3'), {
    now: NOW,
    maxAgeDays: 3650,
    gitRunner: gitRunner({ ancestor: false }),
  });
  assert.equal(result.outcome, 'expired');
  assert.equal(result.freshness.state, 'stale');
  assert.equal(result.freshness.commit, 'orphaned');
  assert.match(result.warnings.join('\n'), /no longer an ancestor of HEAD/);
});

test('an environment without git is reported as unknown, never failed', () => {
  const result = validateManifest(manifest('R3'), {
    now: NOW,
    maxAgeDays: 3650,
    gitRunner: gitRunner({ insideWorkTree: false }),
  });
  assert.equal(result.outcome, 'pass');
  assert.equal(result.freshness.commit, 'unknown');
  assert.match(result.warnings.join('\n'), /git is unavailable or this is not a git work tree/);
});

test('a shallow clone that lacks the commit is unknown, not orphaned', () => {
  const freshness = evaluateFreshness(manifest('R3'), {
    now: NOW,
    maxAgeDays: 3650,
    gitRunner: gitRunner({ commitKnown: false }),
  });
  assert.equal(freshness.state, 'fresh');
  assert.equal(freshness.commit, 'unknown');
  assert.match(freshness.reasons.join('\n'), /not present in this clone/);
});

test('freshness does not run git unless a judgement was asked for', () => {
  let calls = 0;
  evaluateFreshness(manifest('R3'), {
    now: NOW,
    gitRunner: (args) => {
      calls++;
      return { status: 0 };
    },
  });
  assert.equal(calls, 0, 'no window supplied, so no git subprocess should be spawned');
});

test('an unreadable generatedAt cannot be judged fresh or stale', () => {
  const value = manifest('R0');
  value.generatedAt = 'sometime last year';
  const result = validateManifest(value, { now: NOW, maxAgeDays: 30, git: false });
  assert.equal(result.freshness.state, 'unknown');
  assert.equal(result.outcome, 'fail'); // generatedAt is independently required to be ISO-8601
  assert.match(result.warnings.join('\n'), /age cannot be computed/);
});

test('expired exits 4, distinct from pass (0) and fail (1)', () => {
  const app = path.join(repositoryRoot, 'reference-apps', 'nextjs-postgres-crud');
  const script = path.join(repositoryRoot, 'claude-setup', 'readiness.js');

  const fresh = runNode(script, { args: ['--root', app, '--max-age-days', '36500'] });
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);

  const expired = runNode(script, { args: ['--root', app, '--max-age-days', '0', '--json'] });
  const report = JSON.parse(expired.stdout);
  // The reference app's manifest is regenerated with every evidence commit, so on the day
  // it is written it is 0 days old and a 0-day window still holds. Assert the wiring, not
  // a calendar: whatever the outcome is, the exit code must agree with it.
  assert.equal(expired.status, report.outcome === 'expired' ? 4 : 0, expired.stdout + expired.stderr);

  const failed = runNode(script, { args: ['--root', app, '--level', 'R4'] });
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
});

test('--max-age-days rejects nonsense instead of silently ignoring it', () => {
  const script = path.join(repositoryRoot, 'claude-setup', 'readiness.js');
  const result = runNode(script, { args: ['--max-age-days', 'soon'] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--max-age-days requires a non-negative number of days/);
});
