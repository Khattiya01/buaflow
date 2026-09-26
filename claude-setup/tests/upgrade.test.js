'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');
const { STEPWISE } = require('../upgrade.js');

const sha = (text) => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const has = (root, rel) => fs.existsSync(path.join(root, rel));

// The plugin's kit sits in ~/.claude/plugins/cache/, which is not a git checkout: copy the kit somewhere
// git cannot see, so nothing here can fall back on this repository's history.
function kitCopy() {
  const kit = temporaryProject('buaflow-kit-');
  for (const rel of ['package.json', 'bin', 'claude-setup', 'standards', 'templates']) {
    fs.cpSync(path.join(repositoryRoot, rel), path.join(kit, rel), { recursive: true, filter: (src) => !src.includes(`${path.sep}tests`) });
  }
  return kit;
}

function upgrade(kit, root, ...args) {
  const r = runNode(path.join(kit, 'claude-setup', 'upgrade.js'), { args: ['--root', root, '--json', ...args] });
  return { status: r.status, out: JSON.parse(r.stdout), stderr: r.stderr };
}

// A file an old kit shipped: content this kit no longer has, recorded in the kit's history at `version`.
function shippedAt(kit, sourceRel, content, version) {
  const file = path.join(kit, 'claude-setup', 'kit-history.json');
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  history.files[sourceRel] = { ...(history.files[sourceRel] || {}), [sha(content)]: version };
  fs.writeFileSync(file, JSON.stringify(history));
}

test('a team\'s own .claude/skills/ is not an install: nothing to upgrade', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    write(path.join(root, '.claude', 'skills', 'our-own', 'SKILL.md'), 'x\n');
    const { status, out } = upgrade(kit, root, '--plugin');
    assert.equal(status, 2);
    assert.equal(out.state, 'not-installed');
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

// The case that used to cost a session: installed before the lock (3.11), upgraded from the plugin's kit.
test('without a lock and without git, an old kit file is an update from the version it shipped in, not a conflict', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    const oldGate = '// gate as the kit shipped it in 3.9.0\n';
    write(path.join(root, '.claude', 'gate.js'), oldGate);
    write(path.join(root, '.claude', 'readiness.js'), '// the team rewrote this\n');
    shippedAt(kit, 'claude-setup/gate.js', oldGate, '3.9.0');

    const { status, out } = upgrade(kit, root, '--plugin');
    assert.equal(status, 1, 'the team\'s readiness.js is a conflict');
    assert.equal(out.state, 'upgrade');
    assert.deepEqual(out.installed, { version: '3.9.0', from: 'files' });
    assert.equal(out.route, 'fast-path');
    assert.deepEqual(out.install.updates.find((u) => u.file === '.claude/gate.js'), { file: '.claude/gate.js', reason: 'kit file from 3.9.0' });
    assert.deepEqual(out.install.conflicts.map((c) => c.file), ['.claude/readiness.js']);

    // Without the history the same file is a conflict: the manifest is what tells them apart.
    fs.rmSync(path.join(kit, 'claude-setup', 'kit-history.json'));
    const bare = upgrade(kit, root, '--plugin').out;
    assert.ok(bare.install.conflicts.some((c) => c.file === '.claude/gate.js'));
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

test('--write upgrades, records the lock, and the next report says current', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    const oldGate = '// old gate\n';
    write(path.join(root, '.claude', 'gate.js'), oldGate);
    shippedAt(kit, 'claude-setup/gate.js', oldGate, '3.9.0');
    const { status, out } = upgrade(kit, root, '--plugin', '--write');
    assert.equal(status, 0);
    assert.equal(out.written, true);
    assert.equal(fs.readFileSync(path.join(root, '.claude', 'gate.js'), 'utf8'), fs.readFileSync(path.join(kit, 'claude-setup', 'gate.js'), 'utf8'));
    assert.ok(has(root, '.buaflow/lock.json'));
    const again = upgrade(kit, root, '--plugin').out;
    assert.equal(again.state, 'current');
    assert.equal(again.route, null);
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

test('older than 2.3.4 is stepwise, and names the UPGRADE.md section to start from', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    const old = '// stack-config from 2.2\n';
    write(path.join(root, '.claude', 'stack-config.js'), old);
    write(path.join(root, '.claude', 'skills', 'task', 'SKILL.md'), 'old task\n');
    shippedAt(kit, 'claude-setup/stack-config.js', old, '2.2');
    const { out } = upgrade(kit, root, '--plugin');
    assert.equal(out.route, 'stepwise');
    assert.deepEqual(out.stepwise, { from: '2.2', read: 'v2.2 → v2.3' });
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

test('a project locked at a newer kit is never written from an older one', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    write(path.join(root, '.claude', 'gate.js'), '// from the future\n');
    writeJson(path.join(root, '.buaflow', 'lock.json'), { schemaVersion: '1.0', kitVersion: '99.0.0', files: {} });
    const { status, out } = upgrade(kit, root, '--plugin', '--write');
    assert.equal(status, 1);
    assert.equal(out.state, 'plugin-behind');
    assert.equal(out.refused, true);
    assert.equal(fs.readFileSync(path.join(root, '.claude', 'gate.js'), 'utf8'), '// from the future\n');
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

test('manual steps appear only where the project meets their condition, each naming a real UPGRADE.md section', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    write(path.join(root, '.claude', 'gate.js'), '// x\n');
    let ids = upgrade(kit, root, '--plugin').out.manual.map((m) => m.id);
    assert.deepEqual(ids, [], 'nothing applies to a plain project');

    writeJson(path.join(root, '.claude', 'packs', 'web.json'), { schemaVersion: '1.0' });
    writeJson(path.join(root, '.claude', 'profiles', 'app.json'), { schemaVersion: '1.0' });
    write(path.join(root, 'docs', 'evals', 'EV-001.md'), '# case\n');
    writeJson(path.join(root, '.claude', 'settings.json'), { permissions: { allow: ['Bash(*)'] }, hooks: { PreToolUse: [] } });
    writeJson(path.join(root, '.mcp.json'), { mcpServers: { db: { command: 'x', env: { DB_PASSWORD: 'hunter2', HOST: 'localhost' } } } });
    writeJson(path.join(root, '.buaflow', 'usage.json'), { enabled: true });
    const plugin = upgrade(kit, root, '--plugin').out.manual;
    assert.deepEqual(plugin.map((m) => m.id), ['pack-1.0', 'profile-1.0', 'eval-markdown', 'unsafe-permissions']);
    assert.equal(plugin.find((m) => m.id === 'profile-1.0').required, false);
    assert.ok(plugin.find((m) => m.id === 'unsafe-permissions').files.some((f) => /DB_PASSWORD/.test(f)));
    ids = upgrade(kit, root).out.manual.map((m) => m.id);
    assert.ok(ids.includes('usage-capture-hook'), 'a .claude-mode project with consent and no usage-capture hook records nothing');

    const headings = fs.readFileSync(path.join(repositoryRoot, 'UPGRADE.md'), 'utf8').split('\n').filter((l) => l.startsWith('## '));
    const sections = [...upgrade(kit, root).out.manual.map((m) => m.read), ...STEPWISE.map(([, s]) => s)];
    for (const section of sections) assert.ok(headings.some((h) => h.startsWith(`## ${section}`)), `UPGRADE.md has "## ${section}"`);
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

test('moving to the plugin: kit copies can go, changed ones are shown, the team\'s own are kept', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    const copy = (rel) => fs.cpSync(path.join(kit, 'claude-setup', rel), path.join(root, '.claude', rel));
    copy('hooks/guard-edit.js');
    copy('skills/task/SKILL.md');
    write(path.join(root, '.claude', 'hooks', 'guard-bash.js'), '// the team changed it\n');
    write(path.join(root, '.claude', 'skills', 'our-own', 'SKILL.md'), 'ours\n');
    writeJson(path.join(root, '.claude', 'settings.json'), { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/guard-edit.js' }] }] } });
    const { migration } = upgrade(kit, root, '--plugin').out;
    assert.equal(migration.hooksInSettings, true);
    assert.deepEqual(migration.kitCopies.sort(), ['.claude/hooks/guard-edit.js', '.claude/skills/task/SKILL.md']);
    assert.deepEqual(migration.changedCopies, ['.claude/hooks/guard-bash.js']);
    assert.deepEqual(migration.teamFiles, ['.claude/skills/our-own/SKILL.md']);
    assert.equal(upgrade(kit, root).out.migration, undefined, 'without --plugin nothing is moved');
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});

test('the kit history records the current content of every file the kit installs', () => {
  const { check } = require('../../scripts/generate-kit-history.js');
  assert.deepEqual(check(repositoryRoot), [], 'run node scripts/generate-kit-history.js --write');
});

test('buaflow upgrade wraps the report in the CLI envelope', () => {
  const root = temporaryProject('buaflow-upgrade-');
  try {
    const r = runNode(path.join(repositoryRoot, 'bin', 'buaflow.js'), { args: ['upgrade', '--plugin', '--root', root, '--json'] });
    const out = JSON.parse(r.stdout);
    assert.equal(out.command, 'upgrade');
    assert.equal(out.data.result.state, 'not-installed');
    assert.equal(r.status, 2);
  } finally {
    cleanup(root);
  }
});

test('the report says when .prettierignore will gain the kit\'s files, and --write adds them', () => {
  const kit = kitCopy();
  const root = temporaryProject('buaflow-upgrade-');
  try {
    write(path.join(root, '.claude', 'gate.js'), '// x\n');
    write(path.join(root, '.prettierrc.json'), '{}\n');
    const { out } = upgrade(kit, root, '--plugin');
    assert.equal(out.formatter.file, '.prettierignore');
    assert.equal(out.formatter.action, 'create');
    upgrade(kit, root, '--plugin', '--write', '--force');
    assert.match(fs.readFileSync(path.join(root, '.prettierignore'), 'utf8'), /\.claude\/\*\.js/);
    assert.equal(upgrade(kit, root, '--plugin').out.formatter, null);
  } finally {
    cleanup(root);
    cleanup(kit);
  }
});
