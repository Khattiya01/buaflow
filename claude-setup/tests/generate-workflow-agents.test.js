'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const generator = path.join(repositoryRoot, 'scripts', 'generate-workflow-agents.js');

const CORE_AGENT = [
  '---',
  'description: Example agent',
  'modelTier: balanced',
  'claudeTools: ["Read","Grep"]',
  '---',
  '',
  'You are an example agent.',
  '',
].join('\n');

const EXPECTED_CLAUDE_AGENT = [
  '---',
  'name: example',
  'description: Example agent',
  'tools: Read, Grep',
  'model: sonnet',
  '---',
  '',
  'You are an example agent.',
  '',
].join('\n');

test('generate-workflow-agents --write maps modelTier to a Claude Code model name', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'agents', 'example.md'), CORE_AGENT);
    const result = runNode(generator, { args: ['--root', root, '--write'] });
    assert.equal(result.status, 0, result.stderr);
    const written = require('node:fs').readFileSync(path.join(root, 'claude-setup', 'agents', 'example.md'), 'utf8');
    assert.equal(written, EXPECTED_CLAUDE_AGENT);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-agents --check passes when claude-setup/agents already matches core', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'agents', 'example.md'), CORE_AGENT);
    write(path.join(root, 'claude-setup', 'agents', 'example.md'), EXPECTED_CLAUDE_AGENT);
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1\/1 agent\(s\)/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-agents --check ignores README.md in claude-setup/agents', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'agents', 'example.md'), CORE_AGENT);
    write(path.join(root, 'claude-setup', 'agents', 'example.md'), EXPECTED_CLAUDE_AGENT);
    write(path.join(root, 'claude-setup', 'agents', 'README.md'), '# why only these agents\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-agents --check fails when claude-setup/agents drifted from core', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'agents', 'example.md'), CORE_AGENT);
    write(path.join(root, 'claude-setup', 'agents', 'example.md'), 'hand-edited, out of sync\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /out of sync with core\/agents\/example\.md/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-agents rejects an unknown modelTier', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'agents', 'broken.md'), [
      '---',
      'description: bad tier',
      'modelTier: huge',
      'claudeTools: ["Read"]',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'));
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /modelTier must be one of/);
  } finally {
    cleanup(root);
  }
});
