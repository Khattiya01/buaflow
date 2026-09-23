'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { repositoryRoot } = require('./helpers.js');
const { check, checkCommand, commandsIn } = require(path.join(repositoryRoot, 'scripts', 'check-docs-commands.js'));

test('the onboarding documents only name commands, flags, scripts and links that exist', () => {
  const result = check();
  assert.deepEqual(result.problems, []);
  assert.ok(result.commands >= 15, `expected the onboarding to show real commands, found ${result.commands}`);
});

test('a misspelt command, an unknown flag and a missing script are each caught', () => {
  assert.match(checkCommand('node buaflow/bin/buaflow.js asses'), /not a buaflow command/);
  assert.match(checkCommand('buaflow assess --exectue'), /unknown option: --exectue/);
  assert.match(checkCommand('node .claude/readyness.js --level R3'), /does not exist/);
  assert.match(checkCommand('node claude-setup/readiness.js --level R9'), /unsupported level/);
  assert.equal(checkCommand('node buaflow/bin/buaflow.js assess --execute'), null);
  assert.equal(checkCommand('cp a b'), null, 'lines that are not kit commands are not interpreted');
});

test('output blocks are not read as commands, even after a non-shell block', () => {
  const doc = [
    '```text', 'your-project/', '```',
    '',
    '```bash', 'node buaflow/bin/buaflow.js doctor   # comment', '```',
    '',
    '```', 'buaflow doctor: OK', '```',
    '',
    'inline `buaflow benchmark` and `npm test`',
  ].join('\r\n');
  assert.deepEqual(commandsIn(doc), ['node buaflow/bin/buaflow.js doctor', 'buaflow benchmark']);
});
