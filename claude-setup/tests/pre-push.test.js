'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { cleanup, repositoryRoot, temporaryProject, write } = require('./helpers.js');

const HOOK = path.join(repositoryRoot, 'claude-setup', 'ci', 'pre-push.tpl');
const ZERO = '0'.repeat(40);
const SHA = 'a'.repeat(40);
const skip = spawnSync('sh', ['-c', 'exit 0']).status === 0 ? false : 'sh not available';

// The hook runs the gate through `node`; a stub gate records that it ran and exits with its code.
function runHook(stdin, gateExit = 0) {
  const root = temporaryProject('buaflow-pre-push-');
  try {
    write(path.join(root, '.claude', 'gate.js'), `require('fs').writeFileSync('gate-ran', '');process.exit(${gateExit});\n`);
    const result = spawnSync('sh', [HOOK], { cwd: root, input: stdin, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, gateRan: fs.existsSync(path.join(root, 'gate-ran')) };
  } finally {
    cleanup(root);
  }
}

// `git push origin --delete <branch>` ran the whole gate (verify, lint, tests) although it sends no code.
test('a push that only deletes refs skips the gate', { skip }, () => {
  const result = runHook(`(delete) ${ZERO} refs/heads/old ${SHA}\n(delete) ${ZERO} refs/heads/older ${SHA}\n`);
  assert.equal(result.status, 0);
  assert.equal(result.gateRan, false);
  assert.match(result.stdout, /ข้าม gate/);
});

test('a push that deletes one ref and updates another still runs the gate', { skip }, () => {
  const result = runHook(`(delete) ${ZERO} refs/heads/old ${SHA}\nrefs/heads/feat ${SHA} refs/heads/feat ${ZERO}\n`, 1);
  assert.equal(result.status, 1, 'a failing gate still blocks the push');
  assert.equal(result.gateRan, true);
});

test('an ordinary push runs the gate', { skip }, () => {
  assert.equal(runHook(`refs/heads/feat ${SHA} refs/heads/feat ${ZERO}\n`).gateRan, true);
});

test('a delete in a SHA-256 repository is still recognised as a delete', { skip }, () => {
  assert.equal(runHook(`(delete) ${'0'.repeat(64)} refs/heads/old ${'b'.repeat(64)}\n`).gateRan, false);
});

test('empty input runs the gate rather than guessing', { skip }, () => {
  assert.equal(runHook('').gateRan, true);
});
