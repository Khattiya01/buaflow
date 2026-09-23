'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { compare, writeLock } = require('../kit-lock.js');
const { cleanup, repositoryRoot, temporaryProject } = require('./helpers.js');

function installed(root) {
  fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', 'gate.js'), path.join(root, '.claude', 'gate.js'));
  fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', 'hooks', 'guard-bash.js'), path.join(root, '.claude', 'hooks', 'guard-bash.js'));
}

test('without a lock the comparison says how to create one', () => {
  const root = temporaryProject('buaflow-lock-');
  try {
    installed(root);
    assert.match(compare(root).error, /buaflow lock --write/);
  } finally {
    cleanup(root);
  }
});

test('current, drifted, customized and outdated are told apart', () => {
  const root = temporaryProject('buaflow-lock-');
  try {
    installed(root);
    writeLock(root);
    assert.deepEqual(compare(root).counts, { current: 2, outdated: 0, customized: 0, drifted: 0 });

    // The trial's case: a team changes guard-bash on purpose. Unrecorded, it is drift.
    fs.appendFileSync(path.join(root, '.claude', 'hooks', 'guard-bash.js'), '\n// project rule: block shadcn add\n');
    assert.equal(compare(root).rows.find((r) => r.file === '.claude/hooks/guard-bash.js').status, 'drifted');

    // Accepted with --write, it is a customization.
    writeLock(root);
    assert.equal(compare(root).rows.find((r) => r.file === '.claude/hooks/guard-bash.js').status, 'customized');

    // Locked at an older kit and untouched since: the kit moved, the file did not.
    const lockFile = path.join(root, '.buaflow', 'lock.json');
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.kitVersion = '0.0.1';
    lock.files['.claude/gate.js'] = 'f'.repeat(64);
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    fs.writeFileSync(path.join(root, '.claude', 'gate.js'), 'old gate\n');
    lock.files['.claude/gate.js'] = require('node:crypto').createHash('sha256').update('old gate\n').digest('hex');
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    assert.equal(compare(root).rows.find((r) => r.file === '.claude/gate.js').status, 'outdated');
  } finally {
    cleanup(root);
  }
});
