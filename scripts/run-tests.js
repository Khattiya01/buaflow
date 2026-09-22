#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsRoot = path.join(root, 'claude-setup', 'tests');

const tests = fs.readdirSync(testsRoot)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join(testsRoot, name));

if (!tests.length) {
  console.error('tests: no *.test.js files found');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);

