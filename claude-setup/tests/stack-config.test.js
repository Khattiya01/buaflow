'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { DEFAULTS, load, resolveCommand, resolveVerify } = require('../stack-config.js');
const { cleanup, temporaryProject, writeJson } = require('./helpers.js');

test('stack config preserves defaults while overriding individual commands', () => {
  const root = temporaryProject();
  try {
    writeJson(path.join(root, '.claude', 'stack.json'), {
      commands: { coverage: 'npm run coverage' },
      ciMode: 'local-only',
    });
    const config = load(root);
    assert.equal(config.ciMode, 'local-only');
    assert.equal(resolveCommand(root, 'coverage', config), 'npm run coverage');
    assert.equal(resolveCommand(root, 'audit', config), DEFAULTS.commands.audit);
    assert.deepEqual(config.formatCommands, DEFAULTS.formatCommands);
  } finally {
    cleanup(root);
  }
});

test('stack config falls back safely when JSON is malformed', () => {
  const root = temporaryProject();
  try {
    require('node:fs').mkdirSync(path.join(root, '.claude'));
    require('node:fs').writeFileSync(path.join(root, '.claude', 'stack.json'), '{ invalid');
    const config = load(root);
    assert.equal(config.auditMode, DEFAULTS.auditMode);
    assert.equal(config.verifyCommand, null);
  } finally {
    cleanup(root);
  }
});

test('resolveVerify uses environment, config and package script in precedence order', () => {
  const root = temporaryProject();
  const original = process.env.VERIFY_COMMAND;
  try {
    writeJson(path.join(root, 'package.json'), { scripts: { verify: 'node verify.js' } });
    assert.equal(resolveVerify(root), 'pnpm verify');

    writeJson(path.join(root, '.claude', 'stack.json'), { verifyCommand: 'npm run check' });
    assert.equal(resolveVerify(root), 'npm run check');

    process.env.VERIFY_COMMAND = 'custom verify';
    assert.equal(resolveVerify(root), 'custom verify');
  } finally {
    if (original === undefined) delete process.env.VERIFY_COMMAND;
    else process.env.VERIFY_COMMAND = original;
    cleanup(root);
  }
});

test('strict stack config rejects malformed JSON and unsupported major versions', () => {
  const root = temporaryProject();
  try {
    require('node:fs').mkdirSync(path.join(root, '.claude'));
    require('node:fs').writeFileSync(path.join(root, '.claude', 'stack.json'), '{ invalid');
    assert.throws(() => load(root, { strict: true }), /not valid JSON/);

    writeJson(path.join(root, '.claude', 'stack.json'), { schemaVersion: '2.0' });
    assert.throws(() => load(root, { strict: true }), /unsupported schemaVersion/);

    writeJson(path.join(root, '.claude', 'stack.json'), { schemaVersion: '1.4', ciMode: 'local-only' });
    assert.equal(load(root, { strict: true }).ciMode, 'local-only');
  } finally {
    cleanup(root);
  }
});
