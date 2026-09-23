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

test('docs-lint (DV-002) skips discovery linkage entirely when there is no pain-point register', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nno pain point referenced anywhere\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /Discovery linkage/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) treats the template\'s own PP-000 example row as not-yet-filled-in', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'discovery', 'pain-point-register.md'), '| ID | workflow/step |\n|---|---|\n| PP-000 | <example> |\n');
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nno pain point referenced anywhere\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ยังไม่มีแถวจริง/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) warns, but does not fail, when an intent has no pain-point linkage', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'discovery', 'pain-point-register.md'), '| ID | workflow/step |\n|---|---|\n| PP-000 | <example> |\n| PP-001 | approval flow |\n');
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nno pain point referenced anywhere\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ไม่อ้าง pain-point id ใดเลย/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) is silent when every intent references a real pain-point id', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'discovery', 'pain-point-register.md'), '| ID | workflow/step |\n|---|---|\n| PP-000 | <example> |\n| PP-001 | approval flow |\n');
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nsee PP-001 for evidence\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /ไม่อ้าง pain-point id ใดเลย/);
    assert.match(result.stdout, /intent ทุกไฟล์อ้างถึง pain point ในทะเบียนแล้ว/);
  } finally {
    cleanup(root);
  }
});

