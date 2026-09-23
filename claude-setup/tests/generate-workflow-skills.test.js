'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const generator = path.join(repositoryRoot, 'scripts', 'generate-workflow-skills.js');

const CORE_SKILL = [
  '---',
  'description: Example skill',
  'argumentHint: <thing>',
  'claudeAllowedTools: ["Read","Bash(git *)"]',
  '---',
  '',
  'Do: {{ARGUMENTS}}',
  '',
  '## Current state',
  '',
  '{{shell: git status --short || true}}',
  '',
  'Rest of the body.',
  '',
].join('\n');

const EXPECTED_CLAUDE_SKILL = [
  '---',
  'name: example',
  'description: Example skill',
  'argument-hint: "<thing>"',
  'allowed-tools: Read Bash(git *)',
  '---',
  '',
  'Do: $ARGUMENTS',
  '',
  '## Current state',
  '',
  '!`git status --short || true`',
  '',
  'Rest of the body.',
  '',
].join('\n');

test('generate-workflow-skills --write resolves {{ARGUMENTS}} and {{shell: ...}} to Claude Code syntax', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'example.md'), CORE_SKILL);
    const result = runNode(generator, { args: ['--root', root, '--write'] });
    assert.equal(result.status, 0, result.stderr);
    const written = require('node:fs').readFileSync(path.join(root, 'claude-setup', 'skills', 'example', 'SKILL.md'), 'utf8');
    assert.equal(written, EXPECTED_CLAUDE_SKILL);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-skills renders disable-model-invocation only for invocation: human', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'human-only.md'), [
      '---',
      'description: Human-only skill',
      'argumentHint: <thing>',
      'invocation: human',
      'claudeAllowedTools: ["Read"]',
      '---',
      '',
      'Do: {{ARGUMENTS}}',
      '',
      'Body.',
      '',
    ].join('\n'));
    const result = runNode(generator, { args: ['--root', root, '--write'] });
    assert.equal(result.status, 0, result.stderr);
    const written = require('node:fs').readFileSync(path.join(root, 'claude-setup', 'skills', 'human-only', 'SKILL.md'), 'utf8');
    assert.match(written, /disable-model-invocation: true/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-skills --check passes when claude-setup/skills already matches core', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'example.md'), CORE_SKILL);
    write(path.join(root, 'claude-setup', 'skills', 'example', 'SKILL.md'), EXPECTED_CLAUDE_SKILL);
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1\/1 skill\(s\)/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-skills --check fails when claude-setup/skills drifted from core', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'example.md'), CORE_SKILL);
    write(path.join(root, 'claude-setup', 'skills', 'example', 'SKILL.md'), 'hand-edited, out of sync\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /out of sync with core\/skills\/example\.md/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-skills --check flags a claude-setup skill with no core source', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'example.md'), CORE_SKILL);
    write(path.join(root, 'claude-setup', 'skills', 'example', 'SKILL.md'), EXPECTED_CLAUDE_SKILL);
    write(path.join(root, 'claude-setup', 'skills', 'stray', 'SKILL.md'), '---\nname: stray\n---\n\nhand-added\n');
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stray\/: no matching core\/skills\/stray\.md source/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-skills rejects a core skill missing {{ARGUMENTS}} in the body', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'broken.md'), [
      '---',
      'description: no arguments placeholder',
      'argumentHint: <thing>',
      'claudeAllowedTools: ["Read"]',
      '---',
      '',
      'Body with no placeholder.',
      '',
    ].join('\n'));
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /broken: body must reference \{\{ARGUMENTS\}\}/);
  } finally {
    cleanup(root);
  }
});

test('generate-workflow-skills rejects an unknown invocation value', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'core', 'skills', 'broken.md'), [
      '---',
      'description: bad invocation',
      'argumentHint: <thing>',
      'invocation: nobody',
      'claudeAllowedTools: ["Read"]',
      '---',
      '',
      'Do: {{ARGUMENTS}}',
      '',
    ].join('\n'));
    const result = runNode(generator, { args: ['--root', root, '--check'] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invocation must be one of/);
  } finally {
    cleanup(root);
  }
});
