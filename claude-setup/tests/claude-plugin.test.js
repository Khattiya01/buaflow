'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { repositoryRoot, runNode, temporaryProject, cleanup } = require('./helpers.js');
const { build, verifyChecksums } = require(path.join(repositoryRoot, 'scripts', 'generate-claude-plugin.js'));
const usage = require('../usage.js');

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
  const sessionLayer = [...files.keys()].filter((f) => !f.startsWith('kit/'));
  assert.ok(!sessionLayer.some((f) => /gate|readiness|verifier/.test(f)), 'the gate is not part of the session layer — it is installed into the project');
  const hooks = JSON.parse(files.get('hooks/hooks.json')).hooks;
  const commands = Object.values(hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.length >= 5);
  for (const command of commands) {
    assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\//);
    assert.ok(files.has(`hooks/${command.match(/hooks\/([\w-]+\.js)/)[1]}`), command);
  }
});

test('the plugin carries the whole kit a session needs, without examples or the kit\'s own tests', () => {
  const { files } = build(repositoryRoot);
  for (const rel of ['kit/START-HERE.md', 'kit/bin/buaflow.js', 'kit/package.json', 'kit/phases/07-handoff.md', 'kit/claude-setup/install.js', 'kit/claude-setup/gate.js',
    'kit/standards/control-sets/owasp-asvs-5.0.0-l1.json', 'kit/templates/intent.tpl.md', 'kit/schemas/registry.json', 'kit/scripts/migrate-artifact.js',
    'skills/start/SKILL.md', 'hooks/kit-context.js']) {
    assert.ok(files.has(rel), rel);
  }
  const keys = [...files.keys()];
  assert.ok(!keys.some((f) => f.startsWith('kit/reference-apps/') || f.startsWith('kit/claude-setup/tests/') || f.startsWith('kit/development/')));
  const sessionStart = JSON.parse(files.get('hooks/hooks.json')).hooks.SessionStart[0].hooks.map((h) => h.command);
  assert.match(sessionStart[0], /kit-context\.js/, 'the kit path is in context before anything else runs');
});

test('EV-011 usage-capture is wired where it listens and finds usage.js inside the plugin kit', () => {
  const { files } = build(repositoryRoot);
  const hooks = JSON.parse(files.get('hooks/hooks.json')).hooks;
  const wired = (event, matcher) => hooks[event].some((g) => g.matcher === matcher && g.hooks.some((h) => /usage-capture\.js/.test(h.command)));
  assert.ok(wired('SessionStart', 'startup|resume|clear'));
  assert.ok(wired('PostToolUse', 'Edit|Write|MultiEdit'));
  assert.ok(wired('PreToolUse', 'Bash'));
  assert.ok(files.has('hooks/usage-capture.js'));
  assert.ok(files.has('kit/claude-setup/usage.js') && files.has('kit/claude-setup/convergence.js'), 'the hook resolves ../kit/claude-setup/usage.js');
});

test('the kit inside the plugin runs from there: its CLI installs a project', () => {
  const root = temporaryProject('buaflow-plugin-kit-');
  try {
    const r = runNode(path.join(repositoryRoot, 'claude-plugin', 'kit', 'bin', 'buaflow.js'), { args: ['install', '--plugin', '--write', '--root', root, '--json'] });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.existsSync(path.join(root, '.claude', 'gate.js')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.buaflow', 'lock.json'), 'utf8')).kitVersion, JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).version);
  } finally {
    cleanup(root);
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

// EV-011 AC-1, AC-3, AC-7, AC-10: what the skills people actually get say about usage capture.
test('EV-011 skills: start asks once and only on a machine with a store, check records its result, plan names the approver', () => {
  const { files } = build(repositoryRoot);
  const start = files.get('skills/start/SKILL.md');
  const consent = start.slice(start.indexOf('## 4. Usage capture'), start.indexOf('## 5.'));
  assert.match(consent, /new, resume and upgrade/);
  assert.match(consent, /usage status --json/);
  assert.match(consent, /\| `null` \| anything \| Say nothing/);
  assert.match(consent, /\| set \| `unset` \| Ask once/);
  assert.match(consent, /\| set \| `enabled` or `disabled` \| Do not ask/);
  assert.match(consent, /usage consent --enable` or `usage consent --disable/);
  assert.match(consent, /never ask again once there is an answer/);

  const check = files.get('skills/check/SKILL.md');
  const command = check.match(/^node \.claude\/usage\.js (record check .+)$/m);
  assert.ok(command, 'check calls .claude/usage.js, which is installed in plugin and .claude mode alike');
  const args = command[1].replace('<ID>', 'T-001').replace('pass|fail', 'fail').replace('<code-review level>', 'medium').split(/\s+/).filter((a) => a !== '<<\'EOF\'');
  assert.equal(usage.parseArgs(args).verdict, 'fail', 'the command the skill shows parses');
  assert.match(check, /Recording must never change or fail `\/check`/);
  assert.match(check, /every item of all three lists.+`must-fix:`, `should-fix:` or `separate-task:`/, 'findings have one fixed scope, so events compare across runs');

  const plan = files.get('skills/plan/SKILL.md');
  assert.match(plan, /Set `approved_by:`.+Never your own name, and never leave the `<ใครอนุมัติ>` placeholder/);
});
