'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateBaseline, flattenControlSet, loadControlSet } = require('../security-baseline.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const CONTROL_SETS = path.join(repositoryRoot, 'standards', 'control-sets');
const APPS = ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync'];

// A miniature control set, so the unit tests do not depend on which requirements ASVS happens
// to place at level 1. The shipped set is exercised separately, against the real apps.
const TINY_SET = {
  schemaVersion: '1.0',
  id: 'tiny-set-1.0',
  name: 'Tiny Control Set',
  version: '1.0',
  level: 1,
  reference: 'https://example.invalid/tiny',
  source: 'https://example.invalid/tiny/source',
  retrievedAt: '2026-09-23',
  chapters: [
    {
      id: 'V1',
      title: 'First',
      sections: [{ id: 'V1.1', title: 'Only', requirements: [{ id: 'V1.1.1', text: 'a' }, { id: 'V1.1.2', text: 'b' }] }],
    },
    {
      id: 'V2',
      title: 'Second',
      sections: [{ id: 'V2.1', title: 'Only', requirements: [{ id: 'V2.1.1', text: 'c' }] }],
    },
  ],
};

function fixture(directory, controls, extra = {}) {
  write(path.join(directory, 'src', 'api.ts'), '// entry point\n');
  write(path.join(directory, 'src', 'guard.ts'), '// enforcement\n');
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    generatedAt: '2026-09-23T00:00:00.000Z',
    controlSet: 'tiny-set-1.0',
    boundaries: [{
      id: 'TB-001',
      name: 'HTTP API',
      untrusted: 'any client on the network sending request bodies',
      trusted: 'everything below the data layer, which re-checks nothing',
      assets: ['rows belonging to other users'],
      entryPoints: [{ type: 'file', value: 'src/api.ts' }],
      enforcedBy: [{ type: 'file', value: 'src/guard.ts' }],
    }],
    controls,
    ...extra,
  };
}

function withSet(directory) {
  const sets = path.join(directory, 'sets');
  writeJson(path.join(sets, 'tiny-set-1.0.json'), TINY_SET);
  return [sets];
}

const met = (id) => ({ id, status: 'met', evidence: [{ type: 'file', value: 'src/api.ts' }] });
const na = (id) => ({ id, status: 'not-applicable', rationale: 'this fixture has no such surface at all, anywhere' });

test('a complete baseline passes and reports what each status cost', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const record = fixture(directory, [met('V1.1.1'), na('V1.1.2'), met('V2.1.1')]);
    const result = evaluateBaseline(record, { root: directory, controlSetRoots: withSet(directory) });
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.equal(result.totals.met, 2);
    assert.equal(result.totals.notApplicable, 1);
    assert.equal(result.controlSet.version, '1.0');
  } finally {
    cleanup(directory);
  }
});

// The rule that makes it a baseline rather than a list of the controls that happened to pass.
test('a control that is simply left out fails, and is named', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const record = fixture(directory, [met('V1.1.1'), met('V2.1.1')]);
    const result = evaluateBaseline(record, { root: directory, controlSetRoots: withSet(directory) });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /unanswered: 1 control\(s\).*V1\.1\.2/s);
  } finally {
    cleanup(directory);
  }
});

test('a whole chapter can be excluded with a reason, and then must not also be answered', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const roots = withSet(directory);
    const excluded = { excludedChapters: [{ chapter: 'V2', reason: 'this fixture has no such capability anywhere in it' }] };
    const clean = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2')], excluded), { root: directory, controlSetRoots: roots });
    assert.deepEqual(clean.errors, []);
    assert.equal(clean.totals.excludedControls, 1);

    const both = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), met('V2.1.1')], excluded), { root: directory, controlSetRoots: roots });
    assert.equal(both.ok, false);
    assert.match(both.errors.join('\n'), /V2 is excluded as a whole/);

    const lazy = { excludedChapters: [{ chapter: 'V2', reason: 'no time' }] };
    const thin = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2')], lazy), { root: directory, controlSetRoots: roots });
    assert.equal(thin.ok, false);
    assert.match(thin.errors.join('\n'), /requires a reason of at least 20 characters/);
  } finally {
    cleanup(directory);
  }
});

test('a control id that the named standard does not contain is rejected', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const record = fixture(directory, [met('V1.1.1'), na('V1.1.2'), met('V2.1.1'), met('V9.9.9')]);
    const result = evaluateBaseline(record, { root: directory, controlSetRoots: withSet(directory) });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /V9\.9\.9: not a control of tiny-set-1\.0/);
  } finally {
    cleanup(directory);
  }
});

// The link to EP-002: a knowingly unmet control is an accepted risk, and an accepted risk has
// exactly one home in a project.
test('not-met must cite an exception that really exists in the coverage record', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const roots = withSet(directory);
    const unmet = { id: 'V2.1.1', status: 'not-met', exception: 'REQ-050' };

    const naked = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), unmet]), { root: directory, controlSetRoots: roots });
    assert.equal(naked.ok, false);
    assert.match(naked.errors.join('\n'), /requirement-coverage\.json does not exist/);

    writeJson(path.join(directory, 'docs', 'evidence', 'requirement-coverage.json'), {
      schemaVersion: '1.0',
      project: 'fixture',
      generatedAt: '2026-09-23T00:00:00.000Z',
      requirements: [
        { id: 'REQ-049', statement: 'Something proven by a command', source: 'fixture', proof: [{ type: 'command', value: 'npm test' }] },
        {
          id: 'REQ-050',
          statement: 'Something accepted rather than proven',
          source: 'fixture',
          exception: {
            owner: 'a named human',
            reason: 'accepted deliberately for a reason long enough to be a real sentence',
            risk: 'medium',
            acceptedOn: '2026-09-01',
            expiresOn: '2099-01-01',
          },
        },
      ],
    });

    const linked = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), unmet]), { root: directory, controlSetRoots: roots });
    assert.deepEqual(linked.errors, []);
    assert.equal(linked.totals.notMet, 1);

    // Pointing at a requirement that is proven, not excepted, is the mistake worth catching:
    // it would let a met requirement launder an unmet control.
    const wrong = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), { ...unmet, exception: 'REQ-049' }]), { root: directory, controlSetRoots: roots });
    assert.equal(wrong.ok, false);
    assert.match(wrong.errors.join('\n'), /REQ-049, which is not a requirement carrying an approved exception/);

    const bare = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), { id: 'V2.1.1', status: 'not-met' }]), { root: directory, controlSetRoots: roots });
    assert.equal(bare.ok, false);
    assert.match(bare.errors.join('\n'), /not-met requires an exception id/);
  } finally {
    cleanup(directory);
  }
});

test('met with manual evidence only is refused, exactly as it is for requirement coverage', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const hand = { id: 'V2.1.1', status: 'met', evidence: [{ type: 'manual', value: 'reviewed it once' }] };
    const result = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), hand]), { root: directory, controlSetRoots: withSet(directory) });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /manual evidence only, which is not reproducible/);
  } finally {
    cleanup(directory);
  }
});

test('not-applicable needs a project-specific reason, not a shrug', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const shrug = { id: 'V2.1.1', status: 'not-applicable', rationale: 'n/a' };
    const result = evaluateBaseline(fixture(directory, [met('V1.1.1'), na('V1.1.2'), shrug]), { root: directory, controlSetRoots: withSet(directory) });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /not-applicable requires a project-specific rationale/);
  } finally {
    cleanup(directory);
  }
});

// A boundary that points at deleted code describes a system that no longer exists, which is
// worse than having written nothing down.
test('a threat boundary must point at code that is still there', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const record = fixture(directory, [met('V1.1.1'), na('V1.1.2'), met('V2.1.1')]);
    record.boundaries[0].enforcedBy = [{ type: 'file', value: 'src/deleted-guard.ts' }];
    const result = evaluateBaseline(record, { root: directory, controlSetRoots: withSet(directory) });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /TB-001\.enforcedBy.*file does not exist/s);
  } finally {
    cleanup(directory);
  }
});

test('an unknown control set is reported as such rather than silently skipped', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const record = fixture(directory, [met('V1.1.1')]);
    record.controlSet = 'a-standard-nobody-shipped';
    const result = evaluateBaseline(record, { root: directory, controlSetRoots: withSet(directory) });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /control set "a-standard-nobody-shipped" was not found/);
  } finally {
    cleanup(directory);
  }
});

test('the shipped ASVS control set is a real, traceable copy rather than a checklist written here', () => {
  const { set, error } = loadControlSet('owasp-asvs-5.0.0-l1', [CONTROL_SETS]);
  assert.equal(error, undefined);
  assert.equal(set.name, 'OWASP Application Security Verification Standard');
  assert.equal(set.version, '5.0.0');
  assert.equal(set.level, 1);
  assert.match(set.source, /^https:\/\/github\.com\/OWASP\/ASVS\/tree\/v5\.0\.0/);
  for (const chapter of set.chapters) {
    assert.match(chapter.sha256, /^[0-9a-f]{64}$/, `${chapter.id} has no upstream digest`);
  }
  const { byId } = flattenControlSet(set);
  assert.equal(byId.size, 70);
  assert.ok(byId.has('V8.2.2'), 'the IDOR/BOLA requirement should be present at level 1');
});

test('the CLI exits 0 on a complete baseline and 1 on an incomplete one', () => {
  const directory = temporaryProject('buaflow-baseline-');
  try {
    const roots = withSet(directory);
    const script = path.join(repositoryRoot, 'claude-setup', 'security-baseline.js');
    const target = path.join(directory, 'docs', 'evidence', 'security-baseline.json');
    const args = ['--root', directory, '--file', 'docs/evidence/security-baseline.json', '--control-sets', roots[0]];

    writeJson(target, fixture(directory, [met('V1.1.1'), na('V1.1.2'), met('V2.1.1')]));
    const pass = runNode(script, { args, cwd: directory });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /PASS — Tiny Control Set 1\.0 L1/);

    writeJson(target, fixture(directory, [met('V1.1.1'), met('V2.1.1')]));
    const fail = runNode(script, { args, cwd: directory });
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /unanswered/);

    const bad = runNode(script, { args: ['--nonsense'], cwd: directory });
    assert.equal(bad.status, 2);
  } finally {
    cleanup(directory);
  }
});

test('each reference app answers every level-1 ASVS control it did not exclude', () => {
  for (const app of APPS) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const file = path.join(root, 'docs', 'evidence', 'security-baseline.json');
    assert.ok(fs.existsSync(file), `${app} is missing docs/evidence/security-baseline.json`);
    const result = evaluateBaseline(JSON.parse(fs.readFileSync(file, 'utf8')), { root, controlSetRoots: [CONTROL_SETS] });
    assert.deepEqual(result.errors, [], `${app}: ${result.errors.join('; ')}`);
    assert.ok(result.totals.met > 0, `${app} claims nothing is met`);
    assert.ok(result.boundaries !== null);
  }
});

// The readiness control that used to be satisfied by prose now has to name the artifact.
test('every reference app cites the baseline from its security-controls control', () => {
  for (const app of APPS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'reference-apps', app, 'docs', 'evidence', 'readiness.json'), 'utf8'));
    const cited = manifest.controls['security-controls'].evidence.map((item) => item.value);
    assert.ok(cited.includes('docs/evidence/security-baseline.json'), `${app}: security-controls still rests on prose alone`);
  }
});
