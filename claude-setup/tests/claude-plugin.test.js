'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { repositoryRoot, runNode, temporaryProject, cleanup } = require('./helpers.js');
const { build, verifyChecksums } = require(path.join(repositoryRoot, 'scripts', 'generate-claude-plugin.js'));

const script = path.join(repositoryRoot, 'scripts', 'generate-claude-plugin.js');
const hasClaude = spawnSync('claude', ['--version'], { shell: process.platform === 'win32' }).status === 0;

test('the shipped plugin is exactly what claude-setup/ generates, and every file matches its checksum', () => {
  const result = runNode(script, { args: ['--check'] });
  assert.equal(result.status, 0, result.stderr);
});

test('the plugin carries the session layer and none of the gate, and every wired hook exists', () => {
  const { files } = build(repositoryRoot);
  assert.ok([...files.keys()].some((f) => f.startsWith('skills/task/')));
  assert.ok(files.has('agents/code-reviewer.md'));
  assert.ok(!files.has('agents/README.md'), 'a README in agents/ would load as an agent');
  assert.ok(!files.has('gate.js') && ![...files.keys()].some((f) => /readiness|verifier/.test(f)), 'the gate stays committed in the project');
  const hooks = JSON.parse(files.get('hooks/hooks.json')).hooks;
  const commands = Object.values(hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.length >= 5);
  for (const command of commands) {
    assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\//);
    assert.ok(files.has(`hooks/${command.match(/hooks\/([\w-]+\.js)/)[1]}`), command);
  }
});

test('a file edited by hand after generation is caught by its checksum', () => {
  const root = temporaryProject('buaflow-plugin-');
  try {
    fs.cpSync(path.join(repositoryRoot, 'claude-plugin'), path.join(root, 'claude-plugin'), { recursive: true });
    assert.deepEqual(verifyChecksums(root), []);
    fs.appendFileSync(path.join(root, 'claude-plugin', 'hooks', 'guard-bash.js'), '\n// quietly allow everything\n');
    assert.match(verifyChecksums(root).join('\n'), /guard-bash\.js: checksum does not match/);
  } finally {
    cleanup(root);
  }
});

test('Claude Code itself accepts the plugin and the marketplace in strict mode', { skip: !hasClaude && 'claude CLI not installed' }, () => {
  for (const target of ['claude-plugin', '.claude-plugin/marketplace.json']) {
    const r = spawnSync('claude', ['plugin', 'validate', '--strict', target], { cwd: repositoryRoot, encoding: 'utf8', shell: process.platform === 'win32' });
    assert.equal(r.status, 0, `${target}: ${r.stdout}${r.stderr}`);
  }
});
