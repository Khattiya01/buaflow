'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { repositoryRoot } = require('./helpers.js');
const { check } = require(path.join(repositoryRoot, 'scripts', 'check-reference-matrix.js'));
const matrix = require(path.join(repositoryRoot, 'reference-apps', 'matrix.json'));

test('the shipped matrix is consistent and names its empty cells', () => {
  const result = check(matrix);
  assert.deepEqual(result.problems, []);
  assert.equal(result.cells.length, 12);
  assert.ok(result.empty.some((c) => c.origin === 'brownfield' && c.surface === 'mobile'), 'no brownfield mobile app has been tried, and the matrix says so');
});

test('an unknown dimension value, a missing path and an external app without evidence are refused', () => {
  const broken = {
    ...matrix,
    apps: [
      { ...matrix.apps[0], surface: 'desktop' },
      { ...matrix.apps[1], path: 'reference-apps/nope' },
      { ...matrix.apps[3], evidence: 'development/trials/missing.md' },
    ],
  };
  const text = check(broken).problems.join('\n');
  assert.match(text, /surface "desktop"/);
  assert.match(text, /reference-apps\/nope does not exist/);
  assert.match(text, /external app needs evidence/);
});
