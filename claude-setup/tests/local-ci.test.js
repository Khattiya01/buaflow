'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { localCi } = require('../local-ci.js');
const { cleanup, temporaryProject, write, writeJson } = require('./helpers.js');

const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

// A project whose gate passes only when the setup step copied an untracked file into the clone,
// which is what a real .env needs and what hosted CI would get from a secret.
function project(gateSource) {
  const root = temporaryProject('buaflow-local-ci-');
  git(root, 'init', '-q');
  write(path.join(root, '.claude', 'gate.js'), gateSource);
  writeJson(path.join(root, '.claude', 'stack.json'), { schemaVersion: '1.0', commands: { ciSetup: 'node -e "require(\'fs\').copyFileSync(\'{source}/secret.env\', \'secret.env\')"' } });
  write(path.join(root, '.gitignore'), 'secret.env\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  write(path.join(root, 'secret.env'), 'TOKEN=x\n');
  return root;
}

const gateNeedsSecret = "const fs=require('fs');process.exit(fs.existsSync('secret.env')&&!fs.existsSync('dirty.txt')?0:1);\n";

test('the gate runs on a fresh clone of HEAD, with setup able to bring in untracked files', { skip: !hasGit }, () => {
  const root = project(gateNeedsSecret);
  try {
    // An uncommitted file that would make the gate fail must not reach the clean checkout.
    write(path.join(root, 'dirty.txt'), 'x');
    const record = localCi(root);
    assert.equal(record.conclusion, 'success', JSON.stringify(record.steps, null, 2));
    assert.equal(record.provider, 'local-clean-checkout');
    assert.equal(record.commit, git(root, 'rev-parse', 'HEAD').stdout.trim());
    // dirty.txt is reported rather than silently dropped; the gitignored secret.env is not a change.
    assert.equal(record.uncommittedChangesNotIncluded, 1);
    assert.deepEqual(record.steps.map((s) => s.name), ['clean checkout', 'setup (commands.ciSetup)', 'gate']);
  } finally {
    cleanup(root);
  }
});

test('a failing gate is recorded as a failure, not left unrecorded', { skip: !hasGit }, () => {
  const root = project('process.exit(3);\n');
  try {
    const record = localCi(root);
    assert.equal(record.conclusion, 'failure');
    assert.equal(record.steps.at(-1).exitCode, 3);
  } finally {
    cleanup(root);
  }
});

test('a gate that is not committed cannot run from a checkout, and says so', { skip: !hasGit }, () => {
  const root = project(gateNeedsSecret);
  try {
    git(root, 'rm', '-q', '--cached', '.claude/gate.js');
    git(root, 'commit', '-q', '-m', 'untrack gate');
    const record = localCi(root);
    assert.equal(record.conclusion, 'failure');
    assert.match(record.steps.at(-1).outputTail, /not committed/);
  } finally {
    cleanup(root);
  }
});

test('outside a git work tree there is nothing to check out', () => {
  const root = temporaryProject('buaflow-local-ci-');
  try {
    // temporaryProject lives under the OS temp dir, which is not a repository.
    const record = localCi(root);
    if (record.error) assert.match(record.error, /not inside a git work tree/);
    else assert.ok(fs.existsSync(root), 'temp dir happens to be inside a repository on this machine');
  } finally {
    cleanup(root);
  }
});
