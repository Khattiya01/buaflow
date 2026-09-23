'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { checkCompatibility } = require('../../scripts/check-compatibility.js');
const { repositoryRoot, runNode } = require('./helpers.js');

const checker = path.join(repositoryRoot, 'scripts', 'check-compatibility.js');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), 'utf8'));

test('the shipped matrix agrees with package.json and the schema registry', () => {
  const result = runNode(checker);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /compatibility: PASS/);
});

test('every public artifact type is claimed by the current release, at its current version', () => {
  // The drift this guards against is quiet: someone registers a new artifact type, or bumps
  // one, and the support matrix keeps describing a kit that no longer exists.
  const matrix = read('schemas/compatibility.json');
  const registry = read('schemas/registry.json');
  const newest = matrix.releases[0];

  for (const artifact of registry.artifacts.filter((a) => a.classification === 'public')) {
    const supported = newest.reads[artifact.type];
    assert.ok(supported, `${artifact.type} is public but absent from the ${newest.version} matrix`);
    assert.ok(
      supported.includes(artifact.latestVersion),
      `${artifact.type}: registry latest is ${artifact.latestVersion}, matrix claims ${supported.join(', ')}`
    );
  }
});

test('the kit version matches the newest release in the matrix', () => {
  assert.equal(read('package.json').version, read('schemas/compatibility.json').releases[0].version);
});

test('releases are newest-first and unique', () => {
  const versions = read('schemas/compatibility.json').releases.map((r) => r.version);
  assert.equal(new Set(versions).size, versions.length);
  const rank = (v) => v.split('.').map(Number);
  for (let i = 1; i < versions.length; i++) {
    const [a, b] = [rank(versions[i - 1]), rank(versions[i])];
    const newer = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
    assert.ok(newer, `${versions[i - 1]} must be newer than ${versions[i]}`);
  }
});

test('every deprecation can be acted on, and a short notice must explain itself', () => {
  const matrix = read('schemas/compatibility.json');
  const known = new Set(matrix.releases.map((r) => r.version));
  for (const item of matrix.deprecations) {
    assert.ok(item.replacement, `${item.what}: no replacement, so nobody can act on it`);
    assert.ok(known.has(item.announcedIn), `${item.what}: announcedIn is not a known release`);
    if (item.removedIn) assert.ok(known.has(item.removedIn), `${item.what}: removedIn is not a known release`);
    if (item.announcedAt && item.removedNoEarlierThan) {
      const days = Math.round((Date.parse(item.removedNoEarlierThan) - Date.parse(item.announcedAt)) / 86400000);
      if (days < 90) {
        assert.ok(item.note, `${item.what}: ${days} days of notice with no note explaining the exception`);
      }
    }
  }
});

test('the one exception in the matrix is recorded honestly rather than backdated', () => {
  // pack v1 was announced and removed in the same release, before this policy existed.
  // Making the dates look compliant would have been the easy lie; the note is the record.
  const packV1 = read('schemas/compatibility.json').deprecations.find((d) => d.what.startsWith('pack schemaVersion 1.0'));
  assert.ok(packV1, 'the pack v1 deprecation must stay recorded');
  assert.equal(packV1.announcedIn, packV1.removedIn, 'it really was announced and removed together');
  assert.match(packV1.note, /no notice period/i);
});

// --- the checker itself, fed cases the shipped data cannot produce --------------------

function inputs(overrides = {}) {
  return {
    matrix: {
      schemaVersion: '1.0',
      releases: [
        {
          version: '3.0.0',
          releasedAt: '2026-09-23',
          change: 'minor',
          summary: 'x',
          reads: { pack: ['2.0'] },
        },
      ],
      deprecations: [],
    },
    registry: { artifacts: [{ type: 'pack', classification: 'public', latestVersion: '2.0' }] },
    pkg: { version: '3.0.0' },
    upgradeDoc: '',
    ...overrides,
  };
}

test('the baseline the negative cases mutate is itself valid', () => {
  assert.deepEqual(checkCompatibility(inputs()), {
    ok: true,
    errors: [],
    kitVersion: '3.0.0',
    artifactTypes: 1,
  });
});

test('a matrix that disagrees with package.json is rejected', () => {
  const result = checkCompatibility(inputs({ pkg: { version: '2.9.9' } }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /package.json version 2\.9\.9 does not match the newest release 3\.0\.0/);
});

test('a public artifact type missing from the matrix is rejected', () => {
  const value = inputs();
  value.registry.artifacts.push({ type: 'failure-record', classification: 'public', latestVersion: '1.0' });
  const result = checkCompatibility(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /failure-record: registered as public but missing/);
});

test('an artifact bumped without updating the matrix is rejected', () => {
  const value = inputs();
  value.registry.artifacts[0].latestVersion = '3.0';
  const result = checkCompatibility(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /registry says latest is 3\.0, which 3\.0\.0 does not claim to read/);
});

test('a matrix entry for a type the registry does not know is rejected', () => {
  const value = inputs();
  value.matrix.releases[0].reads['ghost-type'] = ['1.0'];
  const result = checkCompatibility(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /ghost-type: listed in the support matrix but not a public type/);
});

test('a major release with no stated reason and no upgrade path is rejected', () => {
  const value = inputs();
  value.matrix.releases[0].change = 'major';
  const result = checkCompatibility(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must state what an adopter has to do/);
  assert.match(result.errors.join('\n'), /no upgrade path in UPGRADE\.md/);
});

test('releases listed oldest-first are rejected', () => {
  const value = inputs();
  value.matrix.releases.push({ version: '4.0.0', releasedAt: '2026-10-01', change: 'patch', reads: { pack: ['2.0'] } });
  const result = checkCompatibility(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must be listed newest first/);
});

test('a deprecation shorter than the notice period must carry a note', () => {
  const value = inputs();
  value.matrix.deprecations = [{
    what: 'something', announcedIn: '3.0.0', announcedAt: '2026-09-23',
    removedNoEarlierThan: '2026-09-30', replacement: 'something else',
  }];
  const short = checkCompatibility(value);
  assert.equal(short.ok, false);
  assert.match(short.errors.join('\n'), /7 day\(s\) of notice is under the 90-day minimum/);

  value.matrix.deprecations[0].note = 'deliberate, and here is why';
  assert.equal(checkCompatibility(value).ok, true, 'a stated exception is allowed');
});

test('a deprecation pointing at a release that does not exist is rejected', () => {
  const value = inputs();
  value.matrix.deprecations = [{
    what: 'something', announcedIn: '1.2.3',
    removedNoEarlierThan: '2027-01-01', replacement: 'something else',
  }];
  const result = checkCompatibility(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /announcedIn 1\.2\.3 is not a release in this matrix/);
});


test('every MAJOR release has a section in UPGRADE.md', () => {
  const upgrade = fs.readFileSync(path.join(repositoryRoot, 'UPGRADE.md'), 'utf8');
  for (const release of read('schemas/compatibility.json').releases) {
    if (release.change !== 'major') continue;
    assert.ok(
      upgrade.includes(`→ v${release.version}`),
      `UPGRADE.md has no path to v${release.version}; a major with no upgrade path pushes the work onto the user`
    );
  }
});
