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

// EV-008 — every command an onboarding document tells a reader to run must exist and parse.
run('onboarding documents name only real commands', process.execPath, [path.join(root, 'scripts', 'check-docs-commands.js')]);
// EV-001 — which kinds of project the kit is proven on; the empty cells are printed every time.
run('reference app matrix', process.execPath, [path.join(root, 'scripts', 'check-reference-matrix.js')]);
run('roadmap state', process.execPath, [path.join(root, 'scripts', 'check-roadmap.js')]);
run('artifact contracts', process.execPath, [path.join(root, 'scripts', 'check-artifacts.js')]);
run('release compatibility matrix', process.execPath, [path.join(root, 'scripts', 'check-compatibility.js')]);
run('workflow rules (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-rules.js'), '--check']);
run('workflow skills (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-skills.js'), '--check']);
run('workflow manual playbooks (core → any tool, MT-007)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-manual.js'), '--check']);
run('Claude Code plugin and marketplace (PE-001/006/007)', process.execPath, [path.join(root, 'scripts', 'generate-claude-plugin.js'), '--check']);
run('plugin conformance and trust tier (PE-005/006)', process.execPath, [path.join(root, 'scripts', 'check-plugin.js'), path.join(root, 'claude-plugin'), '--no-validate']);
run('workflow agents (core → Claude adapter)', process.execPath, [path.join(root, 'scripts', 'generate-workflow-agents.js'), '--check']);
run('pack contracts and their binding to reference apps', process.execPath, [
  path.join(root, 'claude-setup', 'pack.js'),
  '--dir', path.join(root, 'packs'),
  '--repo-root', root,
]);
// EV-004 — the four starter eval cases the kit ships are checked against the kit's own tree,
// so a case cannot outlive the rule it was written for: `tests` paths must still exist here.
// No runs are checked, because the kit has no grader who did not write these cases.
run("the kit's own eval cases", process.execPath, [
  path.join(root, 'claude-setup', 'eval-harness.js'),
  '--cases', path.join(root, 'claude-setup', 'evals'),
  '--root', root,
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

// EP-004 — สรุป licence ต้องตรงกับ SBOM ที่ pin ด้วย sha256, provenance ต้องตรงกับ evidence/ci-run.json
// และ commit ที่ readiness manifest ตัดสิน ส่วน subject ทุกตัวถูกคำนวณ sha256 ใหม่จากไฟล์จริง
for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
  run(`supply-chain licences, provenance and checksums (${app})`, process.execPath, [
    path.join(root, 'claude-setup', 'supply-chain.js'),
    '--root', path.join(root, 'reference-apps', app),
    '--file', 'docs/evidence/supply-chain.json',
  ]);
}

// EP-005 — restore ต้องถูกซ้อมจริงและข้อมูลกลับมาเหมือนเดิม · incident hook ทุกตัวต้องชี้ไป
// หัวข้อ runbook ที่มีอยู่จริง และทุก trust boundary ของ EP-003 ต้องมีคนเฝ้า
for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
  run(`operational readiness: restore rehearsal and incident hooks (${app})`, process.execPath, [
    path.join(root, 'claude-setup', 'operational-readiness.js'),
    '--root', path.join(root, 'reference-apps', app),
    '--file', 'docs/evidence/operational-readiness.json',
  ]);
}

// EP-007 — ตัวเลขที่วัดได้ต้องตรงกับไฟล์หลักฐานจริง และต้องอยู่ใต้เพดานที่ profile กำหนด
// ไม่ใช่เพดานที่แอปเขียนให้ตัวเอง
for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
  run(`profile-driven performance and accessibility budgets (${app})`, process.execPath, [
    path.join(root, 'claude-setup', 'budgets.js'),
    '--root', path.join(root, 'reference-apps', app),
    '--file', 'docs/evidence/budgets.json',
    '--profiles', path.join(root, 'claude-setup', 'tests', 'fixtures', 'profiles'),
  ]);
}

run('regression tests', process.execPath, [path.join(root, 'scripts', 'run-tests.js')]);

console.log('\nrepository check: PASS');
