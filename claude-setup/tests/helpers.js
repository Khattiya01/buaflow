'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..', '..');

function temporaryProject(prefix = 'buaflow-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function runNode(script, options = {}) {
  return spawnSync(process.execPath, [script, ...(options.args || [])], {
    cwd: options.cwd || repositoryRoot,
    env: { ...process.env, ...(options.env || {}) },
    input: options.input === undefined ? undefined : JSON.stringify(options.input),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

module.exports = {
  cleanup,
  repositoryRoot,
  runNode,
  temporaryProject,
  write,
  writeJson,
};

