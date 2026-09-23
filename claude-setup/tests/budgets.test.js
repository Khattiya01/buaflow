'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { derive, evaluateBudgets } = require('../budgets.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

const PROFILES = path.join(repositoryRoot, 'claude-setup', 'tests', 'fixtures', 'profiles');
const APPS = ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync'];

function scaffold(directory, { loadEvent = 500, domContentLoaded = 300, violations = [] } = {}) {
  writeJson(path.join(directory, 'evidence', 'performance-budget.json'), {
    login: { domContentLoaded, loadEvent },
  });
  writeJson(path.join(directory, 'evidence', 'axe-login.json'), { violations });
}

function record(profile = 'internal-crud', { loadEvent = 500, domContentLoaded = 300, violations = [] } = {}) {
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    generatedAt: '2026-09-24T00:00:00.000Z',
    profile,
    measurements: [
      { metric: 'loadEventMs', subject: 'login', value: loadEvent, command: 'npm run measure', source: { type: 'file', value: 'evidence/performance-budget.json' }, path: 'login.loadEvent' },
      { metric: 'domContentLoadedMs', subject: 'login', value: domContentLoaded, command: 'npm run measure', source: { type: 'file', value: 'evidence/performance-budget.json' }, path: 'login.domContentLoaded' },
      { metric: 'axeViolations', subject: 'login', value: violations.length, command: 'npm run a11y', source: { type: 'file', value: 'evidence/axe-login.json' } },
      { metric: 'axeSeriousOrCritical', subject: 'login', value: violations.filter((v) => ['serious', 'critical'].includes(v.impact)).length, command: 'npm run a11y', source: { type: 'file', value: 'evidence/axe-login.json' } },
    ],
  };
}

test('an app inside its profile’s budgets passes, and the ceilings come from the profile', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory);
    const result = evaluateBudgets(record(), { root: directory, profileRoots: [PROFILES] });
    assert.deepEqual(result.errors, []);
    assert.equal(result.profile.id, 'internal-crud');
    assert.equal(result.totals.worst.loadEventMs.max, 3000);
    assert.equal(result.totals.metrics, 4);
  } finally {
    cleanup(directory);
  }
});

// The sentence EP-007 exists to make true: the app did not change, the standard did.
test('a stricter profile fails the same app that a looser one passes', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    // 2200ms is fine for an internal tool and far too slow for a public content site.
    const measured = { loadEvent: 2200, domContentLoaded: 900, violations: [{ impact: 'minor' }, { impact: 'moderate' }] };
    scaffold(directory, measured);

    const loose = evaluateBudgets(record('internal-crud', measured), { root: directory, profileRoots: [PROFILES] });
    assert.deepEqual(loose.errors, [], 'internal-crud should tolerate this app');

    const strict = evaluateBudgets(record('content', measured), { root: directory, profileRoots: [PROFILES] });
    assert.equal(strict.ok, false);
    const joined = strict.errors.join('\n');
    assert.match(joined, /loadEventMs: worst observed 2200 \(login\) exceeds the 1500 that profile content allows/);
    assert.match(joined, /axeViolations: worst observed 2 \(login\) exceeds the 0 that profile content allows/);
    // Nothing about the app changed between the two runs.
    assert.equal(loose.totals.worst.loadEventMs.value, strict.totals.worst.loadEventMs.value);
  } finally {
    cleanup(directory);
  }
});

test('the measured number is re-derived from the evidence, so it cannot be written optimistically', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory, { loadEvent: 4000 });
    const flattering = record('internal-crud', { loadEvent: 4000 });
    flattering.measurements[0].value = 900;
    const result = evaluateBudgets(flattering, { root: directory, profileRoots: [PROFILES] });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /records 900 but evidence\/performance-budget\.json contains 4000/);
  } finally {
    cleanup(directory);
  }
});

test('a budgeted metric that nothing measures fails rather than passing quietly', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory);
    const partial = record();
    partial.measurements = partial.measurements.slice(0, 1);
    const result = evaluateBudgets(partial, { root: directory, profileRoots: [PROFILES] });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /an unmeasured budget is not a met budget/);
  } finally {
    cleanup(directory);
  }
});

test('every measurement needs a repeatable command and a source file that exists', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory);
    const noCommand = record();
    noCommand.measurements[0].command = '';
    assert.match(evaluateBudgets(noCommand, { root: directory, profileRoots: [PROFILES] }).errors.join('\n'), /a number nobody can reproduce is not a measurement/);

    const noFile = record();
    noFile.measurements[0].source = { type: 'file', value: 'evidence/never-produced.json' };
    assert.match(evaluateBudgets(noFile, { root: directory, profileRoots: [PROFILES] }).errors.join('\n'), /evidence\/never-produced\.json does not exist/);
  } finally {
    cleanup(directory);
  }
});

test('a profile with no budgets is refused, because it holds the app to nothing', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory);
    const profiles = path.join(directory, 'profiles');
    writeJson(path.join(profiles, 'unbudgeted.json'), {
      schemaVersion: '1.0',
      id: 'unbudgeted',
      name: 'A profile from before budgets existed',
      controls: [],
      architectureChoices: [],
      clarificationQuestions: [],
    });
    const result = evaluateBudgets(record('unbudgeted'), { root: directory, profileRoots: [profiles] });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /declares no budgets, so this record holds the app to nothing/);
  } finally {
    cleanup(directory);
  }
});

test('measuring a metric the profile does not budget decides nothing and says so', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory);
    const profiles = path.join(directory, 'profiles');
    writeJson(path.join(profiles, 'timing-only.json'), {
      schemaVersion: '1.1',
      id: 'timing-only',
      name: 'Timing only',
      controls: [],
      architectureChoices: [],
      clarificationQuestions: [],
      budgets: {
        performance: [
          { metric: 'loadEventMs', max: 3000, rationale: 'this fixture cares about load time and nothing else at all' },
          { metric: 'domContentLoadedMs', max: 2000, rationale: 'this fixture cares about parse time and nothing else at all' },
        ],
      },
    });
    const result = evaluateBudgets(record('timing-only'), { root: directory, profileRoots: [profiles] });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /sets no budget for this metric, so measuring it here decides nothing/);
  } finally {
    cleanup(directory);
  }
});

test('an unknown profile is reported rather than silently skipped', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    scaffold(directory);
    const result = evaluateBudgets(record('a-profile-nobody-wrote'), { root: directory, profileRoots: [PROFILES] });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /application profile "a-profile-nobody-wrote" was not found/);
  } finally {
    cleanup(directory);
  }
});

test('axe metrics are counted from the violations array, by impact', () => {
  const axe = { violations: [{ impact: 'minor' }, { impact: 'serious' }, { impact: 'critical' }] };
  assert.equal(derive('axeViolations', axe).value, 3);
  assert.equal(derive('axeSeriousOrCritical', axe).value, 2);
  assert.match(derive('axeViolations', { passes: [] }).error, /not an axe result/);
  assert.match(derive('loadEventMs', { login: {} }, 'login.loadEvent').error, /is not a number/);
});

test('the CLI exits 0 inside budget and 1 outside it', () => {
  const directory = temporaryProject('buaflow-budget-');
  try {
    const script = path.join(repositoryRoot, 'claude-setup', 'budgets.js');
    const target = path.join(directory, 'docs', 'evidence', 'budgets.json');
    const args = ['--root', directory, '--file', 'docs/evidence/budgets.json', '--profiles', PROFILES];

    scaffold(directory);
    writeJson(target, record());
    const pass = runNode(script, { args, cwd: directory });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /thresholds from profile internal-crud/);

    const slow = { loadEvent: 9000, domContentLoaded: 300, violations: [] };
    scaffold(directory, slow);
    writeJson(target, record('internal-crud', slow));
    const fail = runNode(script, { args, cwd: directory });
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /exceeds the 3000 that profile internal-crud allows/);
  } finally {
    cleanup(directory);
  }
});

test('every shipped profile carries budgets, so no reference app is unthresholded', () => {
  for (const name of fs.readdirSync(PROFILES).filter((file) => file.endsWith('.json'))) {
    const profile = JSON.parse(fs.readFileSync(path.join(PROFILES, name), 'utf8'));
    assert.equal(profile.schemaVersion, '1.1', `${name} was not migrated to the minor that has budgets`);
    assert.ok(profile.budgets, `${name} declares no budgets`);
    const metrics = [...(profile.budgets.performance || []), ...(profile.budgets.accessibility || [])].map((b) => b.metric);
    assert.ok(metrics.includes('loadEventMs'), `${name} sets no load-time ceiling`);
    assert.equal(new Set(metrics).size, metrics.length, `${name} budgets a metric twice`);
  }
});

test('every reference app measures what its profile budgets, from evidence that still matches', () => {
  for (const app of APPS) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const file = path.join(root, 'docs', 'evidence', 'budgets.json');
    assert.ok(fs.existsSync(file), `${app} is missing docs/evidence/budgets.json`);
    const result = evaluateBudgets(JSON.parse(fs.readFileSync(file, 'utf8')), { root, profileRoots: [PROFILES] });
    assert.deepEqual(result.errors, [], `${app}: ${result.errors.join('; ')}`);
    assert.equal(result.totals.metrics, 4);
    assert.ok(result.totals.measurements >= 4, `${app} measured fewer numbers than it has budgets`);
  }
});
