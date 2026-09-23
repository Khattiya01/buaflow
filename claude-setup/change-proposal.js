#!/usr/bin/env node
'use strict';

/**
 * change-proposal — config ของ AI ถูกแก้เพราะหลักฐานอะไร และ eval บอกว่ามันได้ผลไหม (EV-006)
 *
 *   node .claude/change-proposal.js --dir docs/evidence/changes
 *   node .claude/change-proposal.js --dir docs/evidence/changes --cases docs/evals --json
 *
 * ทำไมต้องมี: Phase 8.1 บอกให้เลื่อนบทเรียนขึ้นจากโน้ต → rule → hook ตามความถี่ที่พลาด แต่ไม่มีอะไร
 * บันทึกว่าการแก้ครั้งไหนแก้ปัญหาอะไร และมันได้ผลหรือเปล่า · ผลคือ config โตขึ้นเรื่อย ๆ โดยไม่มีใครรู้ว่า
 * ข้อไหนทำงาน ข้อไหนไม่ทำอะไรเลย — ablation ของ EV-004 เจอแบบนั้นจริงใน trial แรก (guard-bash ปิดแล้ว
 * ผลเหมือนเดิม)
 *
 * กติกา:
 *   1. หลักฐานทุกชิ้นต้องเป็นไฟล์ที่มีอยู่จริง · การแก้ที่ไม่มีเหตุคือการแก้ตามความรู้สึก
 *   2. ต้องบอกเคส eval ที่การแก้นี้ควรเปลี่ยนผล · เคสต้องมีอยู่จริง
 *   3. rollout ได้เมื่อ:
 *        - ทุกเคสใน expect มี run หลังแก้ (variant baseline) ที่ตรวจผ่าน gradeRun สะอาด — revision ปัจจุบัน,
 *          คนตรวจไม่ใช่คนเขียนเคส, session สะอาด — และ derive ได้ pass
 *        - ไม่มีเคสไหนที่ run ก่อนแก้ผ่าน แต่ run หลังแก้ตก (ถดถอย)
 *   4. rollback ต้องมี reason · การถอยกลับก็เป็นการตัดสินใจที่ต้องมีคนรับผิดชอบ
 *   5. rollout / rollback ต้องมี decidedOn และ decidedBy
 *
 * pending ไม่ใช่ความผิด แต่ถูกนับให้เห็น · ไม่มีโฟลเดอร์ = ไม่ถูกตรวจ · exit 0/1/2 · ไม่มี dependency
 */
const fs = require('node:fs');
const path = require('node:path');
const { gradeRun, validateCase } = require('./eval-harness.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCases(root, dir) {
  const full = path.resolve(root, dir);
  const cases = new Map();
  if (!fs.existsSync(full)) return cases;
  for (const f of fs.readdirSync(full).filter((n) => /^EV-\d+\.json$/.test(n))) {
    try {
      const c = readJson(path.join(full, f));
      if (validateCase(c).ok) cases.set(c.id, c);
    } catch { /* an unreadable case is the harness's problem to report */ }
  }
  return cases;
}

function judgeRuns(root, files, cases, label, errors) {
  const results = new Map();
  for (const rel of files || []) {
    const file = path.resolve(root, rel);
    if (!fs.existsSync(file)) { errors.push(`${label}: run ${rel} does not exist`); continue; }
    let run;
    try { run = readJson(file); } catch (error) { errors.push(`${label}: run ${rel} is not JSON: ${error.message}`); continue; }
    const c = cases.get(run.caseId);
    if (!c) { errors.push(`${label}: run ${rel} judges ${run.caseId}, which is not a known case`); continue; }
    const graded = gradeRun(c, run);
    results.set(run.caseId, { rel, variant: run.variant, clean: graded.ok, stale: graded.stale, derived: graded.derived, problems: graded.errors });
  }
  return results;
}

function evaluateProposal(proposal, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const cases = options.cases || loadCases(root, 'docs/evals');
  const label = proposal?.id || '(proposal)';
  const errors = [];
  const warnings = [];
  if (proposal?.schemaVersion !== '1.0') errors.push(`${label}: unsupported schemaVersion "${proposal?.schemaVersion}"`);
  if (!/^CP-\d{3,}$/.test(proposal?.id || '')) errors.push(`${label}: id must look like CP-001`);

  for (const ref of proposal?.evidence || []) {
    if (!fs.existsSync(path.resolve(root, ref))) errors.push(`${label}: evidence ${ref} does not exist — a change needs a reason someone can read`);
  }
  if (!(proposal?.evidence || []).length) errors.push(`${label}: evidence must name at least one file`);
  if (!(proposal?.change?.files || []).length) errors.push(`${label}: change.files must list what was changed`);

  const expected = proposal?.expect?.cases || [];
  if (!expected.length) errors.push(`${label}: expect.cases must name the eval cases this change should decide`);
  for (const id of expected) if (!cases.has(id)) errors.push(`${label}: expected case ${id} does not exist in docs/evals`);

  const before = judgeRuns(root, proposal?.before, cases, `${label}.before`, errors);
  const after = judgeRuns(root, proposal?.after, cases, `${label}.after`, errors);

  const decision = proposal?.decision;
  if (!['pending', 'rollout', 'rollback'].includes(decision)) errors.push(`${label}: decision must be pending, rollout or rollback`);
  if (decision === 'rollout' || decision === 'rollback') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposal.decidedOn || '')) errors.push(`${label}: ${decision} needs decidedOn`);
    if (!proposal.decidedBy) errors.push(`${label}: ${decision} needs decidedBy`);
  }
  if (decision === 'rollout') {
    for (const id of expected) {
      const r = after.get(id);
      if (!r) errors.push(`${label}: rolled out without an after-run of ${id} — nothing shows the change did what it was for`);
      else if (r.variant !== 'baseline') errors.push(`${label}: after-run of ${id} is an ${r.variant} round, not the baseline`);
      else if (!r.clean) errors.push(`${label}: after-run of ${id} does not grade clean: ${r.problems[0]}`);
      else if (r.derived !== 'pass') errors.push(`${label}: after-run of ${id} fails — the change did not fix what it was for; roll it back or keep it pending`);
    }
    for (const [id, b] of before) {
      const a = after.get(id);
      if (b.derived === 'pass' && a && a.derived !== 'pass') errors.push(`${label}: ${id} passed before the change and fails after it — a regression cannot be rolled out`);
    }
  }
  if (decision === 'rollback' && (typeof proposal.reason !== 'string' || proposal.reason.trim().length < 20)) {
    errors.push(`${label}: rollback needs a reason`);
  }
  if (decision === 'pending' && !(proposal?.after || []).length) warnings.push(`${label}: pending with no after-run yet`);
  return { id: proposal?.id, decision, ok: errors.length === 0, errors, warnings };
}

function parseArgs(argv) {
  const options = { dir: 'docs/evidence/changes', cases: 'docs/evals', root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '--cases') options.cases = argv[++i];
    else if (arg === '--root') options.root = argv[++i];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`change-proposal: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/change-proposal.js [--dir docs/evidence/changes] [--cases docs/evals] [--root path] [--json]');
    return 0;
  }
  const root = path.resolve(options.root);
  const dir = path.resolve(root, options.dir);
  if (!fs.existsSync(dir)) {
    console.error(`change-proposal: no such directory: ${options.dir}`);
    return 2;
  }
  const cases = loadCases(root, options.cases);
  const results = fs.readdirSync(dir).filter((n) => /^CP-\d+\.json$/.test(n)).sort().map((n) => {
    try { return evaluateProposal(readJson(path.join(dir, n)), { root, cases }); } catch (error) { return { id: n, ok: false, errors: [`${n}: ${error.message}`], warnings: [] }; }
  });
  const ok = results.every((r) => r.ok);
  if (options.json) console.log(JSON.stringify({ ok, proposals: results }, null, 2));
  else {
    const count = (d) => results.filter((r) => r.decision === d).length;
    console.log(`change-proposal: ${ok ? 'PASS' : 'FAIL'} (${results.length} proposal(s) — ${count('rollout')} rolled out, ${count('rollback')} rolled back, ${count('pending')} pending)`);
    for (const r of results) {
      for (const w of r.warnings) console.log(`  warn: ${w}`);
      for (const e of r.errors) console.log(`  fail: ${e}`);
    }
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { evaluateProposal, loadCases, parseArgs };
