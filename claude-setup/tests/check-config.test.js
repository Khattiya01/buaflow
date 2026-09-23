'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const script = path.join(repositoryRoot, 'claude-setup', 'check-config.js');

function lineAbout(root, claudeMd) {
  write(path.join(root, 'CLAUDE.md'), claudeMd);
  const result = runNode(script, { args: [root] });
  return result.stdout.split(/\r?\n/).find((line) => /CLAUDE\.md/.test(line) && /AGENTS\.md/.test(line)) || '';
}

// EV-009 K-6: the first outside trial had a well-kept 153-line CLAUDE.md. The old message read
// as "CLAUDE.md must be a thin layer", which for a brownfield project is an order to tear it
// down. The only real requirement is that AGENTS.md is imported first.
test('CLAUDE.md: imported first passes, imported later warns, missing tells you to prepend and keep the rest', () => {
  const root = temporaryProject('buaflow-check-config-');
  try {
    assert.match(lineAbout(root, '@AGENTS.md\n\n# Project notes\n'), /^\s+ok\s/);

    const later = lineAbout(root, '# Existing guide\n\n@AGENTS.md\n');
    assert.match(later, /^\s+warn\s/);
    assert.match(later, /บรรทัด 3/);

    const missing = lineAbout(root, '# 153 lines the team maintains\n\n- rule one\n');
    assert.match(missing, /^\s+FAIL\s/);
    assert.match(missing, /เนื้อหาเดิมเก็บไว้ได้ทั้งหมด/);
  } finally {
    cleanup(root);
  }
});

// EV-009 K-11: the first trial kept the template's Bash(pnpm verify) entries in an npm project,
// so its real verify command was never allowed. In a session nobody is watching, that is a
// silent denial, and an eval failed for it.
test('permissions.allow naming a package manager the project does not use is warned about', () => {
  const root = temporaryProject('buaflow-check-config-');
  try {
    write(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n');
    write(path.join(root, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(pnpm verify)', 'Bash(node .claude/verify.js*)'] } }));
    write(path.join(root, 'package-lock.json'), '{}\n');
    const warned = () => runNode(script, { args: [root] }).stdout.split(/\r?\n/).find((line) => /lockfile ของ pnpm/.test(line));
    assert.match(warned() || '', /^\s+warn\s.*1 รายการของ pnpm/);

    write(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    assert.equal(warned(), undefined);
  } finally {
    cleanup(root);
  }
});

// Found while running the kit against the EV-009 trial: `check-config.js .` made
// require(path.join('.', '.claude', 'stack-config.js')) resolve '.claude' as a package, so the
// project's stack.json was silently ignored and a guard-edit self-test failed for no reason.
test('a relative root reads the same project configuration as an absolute one', () => {
  const root = temporaryProject('buaflow-check-config-');
  try {
    write(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n');
    write(path.join(root, '.claude', 'stack-config.js'), require('node:fs').readFileSync(path.join(repositoryRoot, 'claude-setup', 'stack-config.js'), 'utf8'));
    write(path.join(root, '.claude', 'stack.json'), JSON.stringify({ schemaVersion: '1.0', ciMode: 'local-only', preflightHookPath: '.git/hooks/pre-push' }));
    // The worktree self-test names a temporary branch and folder after the clock; nothing else may differ.
    const stable = (text) => text.replace(/check-config-wt-[\w-]+/g, 'check-config-wt-*');
    const absolute = stable(runNode(script, { args: [root] }).stdout);
    const relative = stable(runNode(script, { cwd: root, args: ['.'] }).stdout);
    assert.equal(relative, absolute);
    assert.doesNotMatch(relative, /ไม่มี \.husky\/pre-push/);
  } finally {
    cleanup(root);
  }
});

// Found by the first local clean-checkout CI run (EV-009): .git/hooks/* is never in a checkout,
// so "local-only needs an installed pre-push" failed every CI run, hosted or local, by construction.
test('an uninstalled .git/hooks pre-push fails on a developer machine but not inside CI', () => {
  const root = temporaryProject('buaflow-check-config-');
  try {
    write(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n');
    write(path.join(root, '.claude', 'stack-config.js'), require('node:fs').readFileSync(path.join(repositoryRoot, 'claude-setup', 'stack-config.js'), 'utf8'));
    write(path.join(root, '.claude', 'stack.json'), JSON.stringify({ schemaVersion: '1.0', ciMode: 'local-only', preflightHookPath: '.git/hooks/pre-push' }));
    const line = (env) => runNode(script, { args: [root], env }).stdout.split(/\r?\n/).find((l) => /pre-push/.test(l) && /(FAIL|ok)\s/.test(l)) || '';
    assert.match(line({ CI: '', BUAFLOW_LOCAL_CI: '' }), /FAIL/);
    assert.match(line({ CI: 'true' }), /^\s+ok\s/);
    assert.match(line({ BUAFLOW_LOCAL_CI: '1' }), /^\s+ok\s/);
  } finally {
    cleanup(root);
  }
});
