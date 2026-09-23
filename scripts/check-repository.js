#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const skippedDirectories = new Set(['.git', 'aidlc-starter-template', 'node_modules']);

function walk(directory, predicate, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, predicate, output);
    else if (predicate(absolute)) output.push(absolute);
  }
  return output;
}

function run(label, command, args) {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nrepository check: FAIL at ${label}`);
    process.exit(result.status === null ? 1 : result.status);
  }
}

const javascript = walk(root, (file) => file.endsWith('.js')).sort();
for (const file of javascript) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    console.error(`repository check: syntax FAIL ${path.relative(root, file)}`);
    process.exit(1);
  }
}
console.log(`syntax: PASS (${javascript.length} JavaScript files)`);

const jsonFiles = walk(root, (file) => file.endsWith('.json')).sort();
for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`repository check: JSON FAIL ${path.relative(root, file)}: ${error.message}`);
    process.exit(1);
  }
}
console.log(`json: PASS (${jsonFiles.length} files)`);

run('roadmap state', process.execPath, [path.join(root, 'scripts', 'check-roadmap.js')]);
run('artifact contracts', process.execPath, [path.join(root, 'scripts', 'check-artifacts.js')]);
run('workflow rules (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-rules.js'), '--check']);
run('regression tests', process.execPath, [path.join(root, 'scripts', 'run-tests.js')]);

console.log('\nrepository check: PASS');
