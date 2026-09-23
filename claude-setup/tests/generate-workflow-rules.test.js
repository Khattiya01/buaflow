'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const generator = path.join(repositoryRoot, 'scripts', 'generate-workflow-rules.js');

const CORE_RULE = [
  '---',
  'description: Example rule',
  'triggerPaths: ["**/example/**/*.ts"]',
  '---',
  '',
  '# Example rule',
  '',
  'Body content.',
  '',
].join('\n');

const EXPECTED_CLAUDE_RULE = [
  '---',
  'paths:',
  '  - "**/example/**/*.ts"',
  '---',
  '',
  '# Example rule',
  '',
  'Body content.',
  '',
].join('\n');

test('generate-workflow-rules --write renders the Claude Code shape from a core rule', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'rules', 'example.md'), CORE_RULE);
    const result = runNode(generator, { args: ['--root', root, '--write'] });
    assert.equal(result.status, 0, result.stderr);
    const written = require('node:fs').readFileSync(path.join(root, 'claude-setup', 'rules', 'example.md'), 'utf8');
    assert.equal(written, EXPECTED_CLAUDE_RULE);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-rules --check passes when claude-setup/rules already matches core', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'rules', 'example.md'), CORE_RULE);
    write(path.join(root, 'claude-setup', 'rules', 'example.md'), EXPECTED_CLAUDE_RULE);
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1\/1 rule\(s\)/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-rules --check fails when claude-setup/rules drifted from core', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'rules', 'example.md'), CORE_RULE);
    write(path.join(root, 'claude-setup', 'rules', 'example.md'), 'hand-edited, out of sync\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /out of sync with core\/rules\/example\.md/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-rules --check flags a claude-setup rule with no core source', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'rules', 'example.md'), CORE_RULE);
    write(path.join(root, 'claude-setup', 'rules', 'example.md'), EXPECTED_CLAUDE_RULE);
    write(path.join(root, 'claude-setup', 'rules', 'stray.md'), '---\npaths:\n  - "**/*"\n---\n\nhand-added\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stray\.md: no matching core\/rules\/stray\.md source/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-rules rejects a core rule missing triggerPaths', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'rules', 'broken.md'), '---\ndescription: no paths\n---\n\nbody\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /broken: frontmatter missing "triggerPaths"/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-rules --check and --write together is a usage error', () => {
  const result = runNode(generator, { args: ['--check', '--write'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--check and --write cannot be used together/);
});
