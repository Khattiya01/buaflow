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
run('release compatibility matrix', process.execPath, [path.join(root, 'scripts', 'check-compatibility.js')]);
run('workflow rules (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-rules.js'), '--check']);
run('workflow skills (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-skills.js'), '--check']);
run('workflow agents (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-agents.js'), '--check']);
run('pack contracts and their binding to reference apps', process.execPath, [
  path.join(root, 'claude-setup', 'pack.js'),
  '--dir', path.join(root, 'packs'),
  '--repo-root', root,
]);
// EP-002 — every reference app answers for each of its requirements with proof or with an
// exception a named owner accepted until a date. The 90-day window is the kit's policy as the
// verifier, the same one evidence-freshness.yml supplies, not something a record may declare
// about itself.
for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
  run(`requirement coverage and approved exceptions (${app})`, process.execPath, [
    path.join(root, 'claude-setup', 'requirement-coverage.js'),
    '--root', path.join(root, 'reference-apps', app),
    '--file', 'docs/evidence/requirement-coverage.json',
    '--max-window-days', '90',
  ]);
}

// EP-003 — ทุก control ของ ASVS 5.0.0 L1 ที่ไม่ได้ถูก exclude ต้องมีคำตอบ และคำตอบว่า not-met
// ต้องชี้ไป exception ที่มีเจ้าของและวันหมดอายุใน requirement-coverage.json ของแอปเดียวกัน
for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
  run(`security baseline and threat boundaries (${app})`, process.execPath, [
    path.join(root, 'claude-setup', 'security-baseline.js'),
    '--root', path.join(root, 'reference-apps', app),
    '--file', 'docs/evidence/security-baseline.json',
    '--control-sets', path.join(root, 'standards', 'control-sets'),
  ]);
}

run('regression tests', process.execPath, [path.join(root, 'scripts', 'run-tests.js')]);

console.log('\nrepository check: PASS');
