#!/usr/bin/env node
'use strict';

/**
 * assumption-ledger — ทุกการเดาต้องมีเจ้าของ ผลกระทบ วันหมดอายุ และวิธีพิสูจน์ (IC-004)
 *
 *   node .claude/assumption-ledger.js --file docs/evidence/assumptions.json
 *   node .claude/assumption-ledger.js --file docs/evidence/assumptions.json --max-window-days 90 --json
 *   buaflow assumptions
 *
 * ทำไมต้องมี: kit ห้ามเดาในที่ที่ถามคนได้ ([NEEDS CLARIFICATION] + docs-lint) แต่การเดาบางข้อ
 * ต้องทำเพื่อเดินต่อ — จำนวนผู้ใช้พร้อมกันในปีแรก, ผู้ให้บริการ payment ที่ลูกค้าจะเลือก, ขนาดไฟล์ที่
 * ผู้ใช้จะอัปโหลด · product-graph เก็บการเดาเป็นประโยคพร้อม confidence เท่านั้น ไม่มีใครเป็นเจ้าของ
 * ไม่มีวันไหนที่ต้องกลับมาดู การเดาจึงกลายเป็นข้อเท็จจริงไปเองเมื่อเวลาผ่าน
 *
 * กติกา — รูปแบบเดียวกับ exception ของ EP-002 โดยตั้งใจ เพราะมันคือสิ่งเดียวกันคนละด้าน:
 * exception คือ "รู้ว่าขาด แล้วยอมรับ" ส่วน assumption คือ "ไม่รู้ แล้วเดินต่อ"
 *
 *   1. ทุกข้อมี owner, impact, madeOn, expiresOn และ verification.method ที่บอกว่าจะพิสูจน์ยังไง
 *   2. open และเลย expiresOn แล้ว = FAIL · การเดาที่ไม่มีใครกลับมาดูคือสิ่งที่ ledger นี้มีไว้กัน
 *   3. confirmed / refuted ต้องมี resolvedOn และหลักฐาน · หลักฐาน manual อย่างเดียวรับได้
 *      (การถามเจ้าของธุรกิจแล้วได้คำตอบคือหลักฐานจริงของ assumption) แต่ถูกรายงานว่าตรวจซ้ำไม่ได้
 *   4. refuted ต้องมี consequence — การเดาที่ผิดแล้วไม่มีอะไรเปลี่ยนตาม แปลว่ามันผิดอยู่ในโค้ด
 *   5. madeIn ต้องเป็นไฟล์ที่มีอยู่จริง — การเดาที่ไม่มีใครอาศัยอยู่ไม่ต้องบันทึก
 *   6. --max-window-days (นโยบายของผู้ตรวจ ไม่ใช่ของ ledger) ปิดช่อง expiresOn ปี 2099
 *
 * additive: ไม่มีไฟล์ = ไม่ถูกตรวจ · exit 0 ผ่าน · 1 ไม่ผ่าน · 2 input ผิด · ไม่มี dependency
 */
const fs = require('node:fs');
const path = require('node:path');
const { validateEvidence } = require('./readiness.js');

const IMPACTS = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['open', 'confirmed', 'refuted']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

const parseDate = (value) => (typeof value === 'string' && DATE.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN);
const startOfDay = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

function evaluateLedger(ledger, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const today = startOfDay(options.now instanceof Date ? options.now : new Date());
  const maxWindowDays = Number.isFinite(options.maxWindowDays) ? options.maxWindowDays : null;
  const errors = [];
  const warnings = [];
  const totals = { open: 0, confirmed: 0, refuted: 0, expired: 0, highOpen: 0 };

  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return { ok: false, errors: ['ledger must be a JSON object'], warnings, totals, rows: [] };
  if (ledger.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${ledger.schemaVersion}"`);
  if (!Array.isArray(ledger.assumptions) || !ledger.assumptions.length) {
    errors.push('assumptions must be a non-empty array');
    return { ok: false, errors, warnings, totals, rows: [] };
  }

  const seen = new Set();
  const rows = [];
  for (const [index, a] of ledger.assumptions.entries()) {
    const label = a?.id || `assumptions[${index}]`;
    if (!/^A-\d{3,}$/.test(a?.id || '')) errors.push(`${label}: id must look like A-001`);
    if (seen.has(a?.id)) errors.push(`${label}: duplicate id`);
    seen.add(a?.id);
    if (typeof a?.statement !== 'string' || a.statement.trim().length < 10) errors.push(`${label}: statement must say what is being guessed`);
    if (typeof a?.owner !== 'string' || !a.owner.trim()) errors.push(`${label}: owner is required — a guess nobody owns is never checked`);
    else if (/^(ai|claude|team|tbd|n\/a)$/i.test(a.owner.trim())) errors.push(`${label}: owner "${a.owner}" is not a person who can confirm or refute it`);
    if (!IMPACTS.has(a?.impact)) errors.push(`${label}: impact must be low, medium or high`);
    if (typeof a?.madeIn !== 'string' || !a.madeIn.trim()) errors.push(`${label}: madeIn must name the file that relies on this guess`);
    else if (path.isAbsolute(a.madeIn) || path.relative(root, path.resolve(root, a.madeIn)).startsWith('..')) errors.push(`${label}: madeIn must be inside the project`);
    else if (!fs.existsSync(path.resolve(root, a.madeIn))) errors.push(`${label}: madeIn ${a.madeIn} does not exist — nothing relies on a guess that is written nowhere`);

    const madeOn = parseDate(a?.madeOn);
    const expiresOn = parseDate(a?.expiresOn);
    if (Number.isNaN(madeOn)) errors.push(`${label}: madeOn must be YYYY-MM-DD`);
    if (Number.isNaN(expiresOn)) errors.push(`${label}: expiresOn must be YYYY-MM-DD`);
    if (!Number.isNaN(madeOn) && !Number.isNaN(expiresOn)) {
      if (expiresOn < madeOn) errors.push(`${label}: expiresOn is before madeOn`);
      const window = Math.round((expiresOn - madeOn) / DAY_MS);
      if (maxWindowDays !== null && window > maxWindowDays) errors.push(`${label}: allowed to stand unverified for ${window} days, past the ${maxWindowDays}-day limit supplied by the verifier`);
    }

    const v = a?.verification;
    const status = v?.status;
    if (!v || typeof v !== 'object') errors.push(`${label}: verification is required`);
    else {
      if (typeof v.method !== 'string' || v.method.trim().length < 10) errors.push(`${label}: verification.method must say how this will be checked`);
      if (!STATUSES.has(status)) errors.push(`${label}: verification.status must be open, confirmed or refuted`);
    }

    if (status === 'open') {
      totals.open++;
      if (a.impact === 'high') totals.highOpen++;
      if (!Number.isNaN(expiresOn) && expiresOn < today) {
        totals.expired++;
        errors.push(`${label}: open past its expiry on ${a.expiresOn} — confirm it, refute it, or have ${a.owner || 'the owner'} re-accept it with a new date`);
      }
    } else if (status === 'confirmed' || status === 'refuted') {
      totals[status]++;
      if (Number.isNaN(parseDate(v.resolvedOn))) errors.push(`${label}: ${status} needs resolvedOn (YYYY-MM-DD)`);
      const evidenceErrors = [];
      const valid = validateEvidence(`${label}.verification`, v.evidence, root, evidenceErrors, []);
      errors.push(...evidenceErrors);
      if (!valid.length) errors.push(`${label}: ${status} needs evidence of how it was checked`);
      else if (valid.every((e) => e.type === 'manual')) warnings.push(`${label}: ${status} on a human answer only — real, but not reproducible from the repository`);
      if (status === 'refuted' && (typeof v.consequence !== 'string' || v.consequence.trim().length < 10)) {
        errors.push(`${label}: refuted without a consequence — a wrong guess that changed nothing is still wrong in the code`);
      }
    }
    rows.push({ id: a?.id, status, impact: a?.impact, expiresOn: a?.expiresOn, daysLeft: Number.isNaN(expiresOn) ? null : Math.floor((expiresOn - today) / DAY_MS) });
  }
  if (maxWindowDays === null && totals.open) warnings.push('no --max-window-days was supplied, so how long each guess may stand is reported but not judged');
  return { ok: errors.length === 0, errors, warnings, totals, rows };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/assumptions.json', root: process.cwd(), json: false, maxWindowDays: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--max-window-days') options.maxWindowDays = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file requires a path');
  if (options.maxWindowDays !== null && (!Number.isFinite(options.maxWindowDays) || options.maxWindowDays <= 0)) throw new Error('--max-window-days requires a positive number of days');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`assumption-ledger: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/assumption-ledger.js [--file path] [--root path] [--max-window-days N] [--json]');
    return 0;
  }
  const root = path.resolve(options.root);
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(path.resolve(root, options.file), 'utf8')); } catch (error) {
    console.error(`assumption-ledger: cannot read ${options.file}: ${error.message}`);
    return 2;
  }
  const result = evaluateLedger(ledger, { root, maxWindowDays: options.maxWindowDays ?? undefined });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    const t = result.totals;
    console.log(`assumption-ledger ${ledger.project || ''}: ${result.ok ? 'PASS' : 'FAIL'} (${t.open} open${t.highOpen ? ` — ${t.highOpen} high impact` : ''}, ${t.confirmed} confirmed, ${t.refuted} refuted, ${t.expired} expired)`);
    const next = result.rows.filter((r) => r.status === 'open' && r.daysLeft !== null && r.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (next) console.log(`  next to expire: ${next.id} on ${next.expiresOn} (${next.daysLeft} days)`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { evaluateLedger, parseArgs };
