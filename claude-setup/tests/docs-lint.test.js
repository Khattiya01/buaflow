'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const docsLint = path.join(repositoryRoot, 'claude-setup', 'docs-lint.js');

test('docs-lint treats a project before Phase 5 as warnings, not failure', () => {
  const root = temporaryProject();
  try {
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ต้องแก้: 0/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint rejects a task without frontmatter', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-001.md'), '# Task without metadata\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /T-001\.md: ไม่มี frontmatter/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint release mode fails when a milestone has no tasks', () => {
  const root = temporaryProject();
  try {
    const result = runNode(docsLint, { args: ['--release', 'M1', root] });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /ไม่มี task ไหนอยู่ใน milestone M1/);
  } finally {
    cleanup(root);
  }
});

