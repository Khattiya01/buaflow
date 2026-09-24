'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const install = path.join(repositoryRoot, 'claude-setup', 'install.js');
const cli = path.join(repositoryRoot, 'bin', 'buaflow.js');
const kitContext = path.join(repositoryRoot, 'claude-plugin', 'hooks', 'kit-context.js');
const checkConfig = path.join(repositoryRoot, 'claude-setup', 'check-config.js');

const run = (root, ...args) => {
  const r = runNode(install, { args: ['--root', root, '--json', ...args] });
  return { status: r.status, report: JSON.parse(r.stdout), stderr: r.stderr };
};
const has = (root, rel) => fs.existsSync(path.join(root, rel));
const json = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

test('a dry run writes nothing', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    const { status, report } = run(root, '--plugin');
    assert.equal(status, 0);
    assert.ok(report.counts.create > 30);
    assert.equal(report.written, false);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    cleanup(root);
  }
});

test('plugin mode installs the gate and checkers, not the session layer, and offers the plugin to teammates', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    const { status } = run(root, '--plugin', '--write');
    assert.equal(status, 0);
    for (const rel of ['.claude/gate.js', '.claude/readiness.js', '.claude/check-config.js', '.claude/stack-config.js', '.claude/stack.json', '.claude/control-sets/owasp-asvs-5.0.0-l1.json', 'docs/templates/intent.tpl.md', '.buaflow/lock.json']) {
      assert.ok(has(root, rel), rel);
    }
    for (const rel of ['.claude/hooks', '.claude/skills', '.claude/agents', '.claude/assess.js', '.claude/kit-lock.js', '.claude/install.js']) assert.ok(!has(root, rel), `${rel} must not be installed`);
    const settings = json(root, '.claude/settings.json');
    assert.equal(settings.hooks, undefined, 'the plugin carries the hooks — a hooks block would run each twice');
    assert.equal(settings.enabledPlugins['buaflow@buaflow'], true);
    assert.deepEqual(settings.extraKnownMarketplaces.buaflow, { source: { source: 'github', repo: 'Khattiya01/buaflow' } });
    assert.ok(settings.permissions.deny.length, 'the template permissions come along');
  } finally {
    cleanup(root);
  }
});

test('without --plugin the session layer is installed into .claude/ too', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    run(root, '--write');
    assert.ok(has(root, '.claude/hooks/guard-bash.js'));
    assert.ok(has(root, '.claude/skills/task/SKILL.md'));
    assert.ok(has(root, '.claude/agents/code-reviewer.md'));
    assert.ok(!has(root, '.claude/agents/README.md'), 'a README in agents/ would load as an agent');
    assert.ok(json(root, '.claude/settings.json').hooks);
  } finally {
    cleanup(root);
  }
});

test('in a "type": "module" project the installed .claude/*.js still run as CommonJS', () => {
  const root = temporaryProject('buaflow-install-esm-');
  try {
    write(path.join(root, 'package.json'), `${JSON.stringify({ name: 'esm-app', type: 'module' })}\n`);
    run(root, '--write');
    assert.equal(json(root, '.claude/package.json').type, 'commonjs');
    for (const rel of ['.claude/hooks/session-context.js', '.claude/hooks/usage-capture.js', '.claude/board.js']) {
      const r = runNode(path.join(root, rel), { cwd: root, input: { hook_event_name: 'SessionStart', cwd: root }, env: { CLAUDE_PROJECT_DIR: root } });
      assert.doesNotMatch(r.stderr, /ES module|require is not defined/, `${rel}: ${r.stderr}`);
    }
    write(path.join(root, '.claude', 'package.json'), '{"type":"commonjs","name":"team"}\n');
    run(root, '--write');
    assert.equal(json(root, '.claude/package.json').name, 'team', 'a .claude/package.json the project has is kept');
  } finally {
    cleanup(root);
  }
});

test('a second run changes nothing, and project files the kit only seeds are never overwritten', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    run(root, '--plugin', '--write');
    write(path.join(root, '.claude', 'stack.json'), '{"verifyCommand":"make verify"}\n');
    fs.rmSync(path.join(root, '.claude', 'rules', 'i18n.md'));
    const { status, report } = run(root, '--plugin', '--write');
    assert.equal(status, 0);
    assert.equal(report.counts.create + report.counts.update, 0, JSON.stringify(report.entries.filter((e) => e.action !== 'unchanged' && e.action !== 'keep')));
    assert.equal(fs.readFileSync(path.join(root, '.claude', 'stack.json'), 'utf8'), '{"verifyCommand":"make verify"}\n');
    assert.ok(!has(root, '.claude/rules/i18n.md'), 'a rule the project removed stays removed');
  } finally {
    cleanup(root);
  }
});

test('a control the project changed is a conflict and is kept, unless --force', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    run(root, '--plugin', '--write');
    fs.appendFileSync(path.join(root, '.claude', 'gate.js'), '\n// team change\n');
    const first = run(root, '--plugin', '--write');
    assert.equal(first.status, 1);
    assert.deepEqual(first.report.entries.filter((e) => e.action === 'conflict').map((e) => e.file), ['.claude/gate.js']);
    assert.match(fs.readFileSync(path.join(root, '.claude', 'gate.js'), 'utf8'), /team change/);
    const forced = run(root, '--plugin', '--write', '--force');
    assert.equal(forced.status, 0);
    assert.doesNotMatch(fs.readFileSync(path.join(root, '.claude', 'gate.js'), 'utf8'), /team change/);
  } finally {
    cleanup(root);
  }
});

test('a control still as it was installed is an old kit file and is updated', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    run(root, '--plugin', '--write');
    // Simulate an older kit: the file differs from today's kit but matches what the lock recorded.
    const file = path.join(root, '.claude', 'verify.js');
    fs.writeFileSync(file, '// verify.js from an older kit\n');
    const lock = json(root, '.buaflow/lock.json');
    lock.files['.claude/verify.js'] = require(path.join(repositoryRoot, 'claude-setup', 'kit-lock.js')).sha(file);
    write(path.join(root, '.buaflow', 'lock.json'), JSON.stringify(lock));
    const { report } = run(root, '--plugin');
    const entry = report.entries.find((e) => e.file === '.claude/verify.js');
    assert.equal(entry.action, 'update');
    assert.match(entry.reason, /unchanged since installed/);
  } finally {
    cleanup(root);
  }
});

test('an existing settings.json keeps everything it had and gains the plugin, with a warning about doubled hooks', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    write(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(make verify)'] },
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-bash.js"' }] }] },
    }));
    const { report } = run(root, '--plugin', '--write');
    assert.match(report.warnings.join('\n'), /every hook runs twice/);
    const settings = json(root, '.claude/settings.json');
    assert.deepEqual(settings.permissions.allow, ['Bash(make verify)']);
    assert.ok(settings.hooks, 'install reports the doubled hooks; it does not delete what the team wrote');
    assert.equal(settings.enabledPlugins['buaflow@buaflow'], true);
  } finally {
    cleanup(root);
  }
});

test('buaflow install is a CLI command with a dry run by default', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    const r = runNode(cli, { args: ['install', '--plugin', '--root', root, '--json'] });
    assert.equal(r.status, 0, r.stdout);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.written, false);
    assert.match(out.summary, /dry run/);
  } finally {
    cleanup(root);
  }
});

test('doctor warns when the plugin is enabled but nothing guards a push, and when hooks are wired twice', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    write(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      enabledPlugins: { 'buaflow@buaflow': true },
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/guard-edit.js' }] }] },
    }));
    const out = JSON.parse(runNode(cli, { args: ['doctor', '--root', root, '--json'] }).stdout);
    assert.match(out.warnings.join('\n'), /controls: the Buaflow plugin is enabled here but the gate and checkers are not installed/);
    assert.match(out.warnings.join('\n'), /hooks: .*every hook runs twice/);
  } finally {
    cleanup(root);
  }
});

test('check-config accepts hooks and skills from the plugin, and tests the hooks from the kit when it can reach them', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    run(root, '--plugin', '--write');
    const without = runNode(checkConfig, { args: [root], env: { BUAFLOW_HOOKS_DIR: '' } }).stdout;
    assert.match(without, /ok {3}\.claude\/hooks — มาจาก plugin/);
    assert.match(without, /ok {3}hooks มาจาก plugin buaflow@buaflow/);
    assert.doesNotMatch(without, /FAIL ไม่มี hooks\//);
    assert.match(without, /warn ไม่ได้ทดสอบ hook กับ stack\.json/);
    const withKit = runNode(checkConfig, { args: [root], env: { BUAFLOW_HOOKS_DIR: path.join(repositoryRoot, 'claude-setup', 'hooks') } }).stdout;
    assert.match(withKit, /ok {3}guard-bash\.js: บล็อก --no-verify \(exit 2\)/);
  } finally {
    cleanup(root);
  }
});

test('the plugin session hook tells a session where the kit is and what state the project is in', () => {
  const root = temporaryProject('buaflow-install-');
  try {
    const context = () => JSON.parse(runNode(kitContext, { cwd: root, env: { CLAUDE_PROJECT_DIR: root } }).stdout).hookSpecificOutput.additionalContext;
    const kit = path.join(repositoryRoot, 'claude-plugin', 'kit');
    assert.match(context(), /Buaflow kit \d+\.\d+\.\d+ \(from the buaflow plugin\) is at: /);
    assert.ok(context().includes(kit), 'the path is the kit folder next to hooks/');
    assert.match(context(), /has not started Buaflow\. \/buaflow:start begins it/);
    write(path.join(root, 'docs', 'planning', '_state.md'), '# state\n');
    assert.match(context(), /gate and checkers are not installed yet .* install --plugin --write/);
    run(root, '--plugin', '--write');
    assert.match(context(), /controls are installed/);
    // A project a 2.x kit installed has .claude/ but no lock (the lock arrived in 3.11): an upgrade, never "current".
    fs.rmSync(path.join(root, '.buaflow', 'lock.json'));
    assert.match(context(), /installed from a kit older than 3\.11 .* upgrades it/);
    fs.rmSync(path.join(root, '.claude', 'gate.js'));
    write(path.join(root, '.claude', 'skills', 'task', 'SKILL.md'), '---\nname: task\n---\n');
    assert.match(context(), /older than 3\.11/, 'a pre-2.3 install without gate.js is still an install');
  } finally {
    cleanup(root);
  }
});
