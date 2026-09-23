#!/usr/bin/env node
'use strict';

/**
 * requirement-coverage — requirement ทุกข้อต้องมีคนตอบ: proof หรือ exception ที่มีวันหมดอายุ (EP-002)
 *
 *   node .claude/requirement-coverage.js --file docs/evidence/requirement-coverage.json
 *   node .claude/requirement-coverage.js --file docs/evidence/requirement-coverage.json --json
 *   node .claude/requirement-coverage.js --file docs/evidence/requirement-coverage.json --max-window-days 180
 *
 * ทำไมต้องมี: ครึ่งแรกของ EP-002 (requirement ชี้ไป proof) ทำเสร็จไปแล้วตั้งแต่
 * requirements-traceability + docs-lint + DV-002 แต่ครึ่งหลังไม่เคยมีอยู่เลย — ในเรพนี้
 * ไม่มี waiver record สักที่เดียว readiness.js มีแต่ not-applicable ซึ่งแปลว่า "ไม่มี
 * ความสามารถนั้นอยู่" ไม่ใช่ "รับความเสี่ยงไว้แล้ว" แปลว่าวิธีเดียวที่จะ ship ช่องโหว่
 * ที่รู้อยู่แล้วและยอมรับแล้ว คือโกหกใน manifest หรือไม่บันทึกมันเลย
 *
 * ของจริงที่พิสูจน์ว่ามันเกิดขึ้นแล้ว: reference app ทั้งสามตัวเขียน "Known limitations"
 * ไว้ใน docs/security-notes.md — ไม่มีเจ้าของ ไม่มีระดับความเสี่ยง ไม่มีวันหมดอายุ และ
 * ไม่มี gate ไหนอ่านมัน นั่นคือทางที่สามที่แย่พอกัน: ซื่อสัตย์แต่มองไม่เห็นด้วยเครื่อง
 *
 * กติกาที่ไฟล์นี้บังคับ:
 *   1. requirement หนึ่งข้อมี proof หรือ exception ได้อย่างใดอย่างหนึ่ง — ไม่ใช่ทั้งคู่ ไม่ใช่ไม่มีเลย
 *   2. proof ที่เป็น manual ล้วนไม่นับเป็น proof มันคือ exception ที่ยังไม่ได้เขียน
 *      (ถ้านับ ใครก็เลี่ยงกลไกนี้ได้ด้วยการพิมพ์ว่า "ตรวจด้วยมือแล้ว")
 *   3. exception ต้องมี owner / reason / risk / acceptedOn / expiresOn ครบ
 *   4. exception ที่เลยวันหมดอายุ = FAIL ไม่ใช่ warning
 *
 * ต่างจาก evidence-freshness (EP-010) ตรงไหน และทำไมถึงตั้งใจให้ต่าง: ที่นั่นหน้าต่างเวลา
 * ถูกกำหนดโดย "ผู้ตรวจ" เพราะหลักฐานที่ประกาศวันหมดอายุของตัวเองได้ ก็ประกาศว่าตัวเองสดตลอดกาลได้
 * และผลลัพธ์คือ EXPIRED ซึ่งไม่ใช่ความผิดของใคร — มันแค่เก่า แต่ที่นี่วันหมดอายุเป็นของ
 * **คนที่เซ็นรับความเสี่ยง** ไม่ใช่ของหลักฐาน มันคือสัญญาที่มีชื่อเจ้าของกำกับ การเลยกำหนด
 * จึงเป็นสัญญาที่ไม่ถูกรักษา = FAIL ส่วนช่องโหว่ "ตั้ง expiresOn เป็นปี 2099" ปิดด้วย
 * --max-window-days ซึ่งเป็นนโยบายของผู้ตรวจเหมือน EP-010 ไม่ใส่ = รายงานอย่างเดียว ไม่ตัดสิน
 *
 * additive ตามนโยบายของ BF-006: โปรเจกต์ที่ไม่มีไฟล์นี้ไม่ถูกตรวจข้อนี้เลย พฤติกรรมเดิมไม่เปลี่ยน
 *
 * exit 0 = ผ่าน | exit 1 = มี requirement ที่ไม่มีใครตอบ หรือ exception ที่หมดอายุ | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');

// ใช้กติกา "อะไรนับเป็นหลักฐาน" ชุดเดียวกับ readiness manifest โดยตั้งใจ — นิยามหลักฐานสองชุด
// ที่ค่อย ๆ เพี้ยนออกจากกันคือ contract-drift ที่ taxonomy ของ EV-003 ตั้งชื่อไว้แล้ว
const { validateEvidence } = require('./readiness.js');

const RISKS = new Set(['low', 'medium', 'high']);
const ID_PATTERN = /^[A-Z][A-Z0-9]*-\d{3,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

function startOfDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// คืนสถานะของ exception หนึ่งอัน: ผิดรูป / หมดอายุ / ยังอยู่ พร้อมจำนวนวันที่เหลือ
function evaluateException(exception, context) {
  const errors = [];
  const label = context.label;

  if (!isPlainObject(exception)) {
    return { errors: [`${label}: exception must be an object`], state: 'invalid', daysRemaining: null, windowDays: null };
  }
  if (typeof exception.owner !== 'string' || !exception.owner.trim()) {
    errors.push(`${label}: exception requires an owner — a name that can be asked about it later`);
  }
  if (typeof exception.reason !== 'string' || exception.reason.trim().length < 20) {
    errors.push(`${label}: exception requires a reason of at least 20 characters saying why this risk was accepted`);
  }
  if (!RISKS.has(exception.risk)) {
    errors.push(`${label}: exception risk must be one of ${[...RISKS].join(', ')}`);
  }
  if (exception.compensatingControl !== undefined
    && (typeof exception.compensatingControl !== 'string' || !exception.compensatingControl.trim())) {
    errors.push(`${label}: compensatingControl must be a non-empty string when present`);
  }

  const acceptedOn = parseDate(exception.acceptedOn);
  const expiresOn = parseDate(exception.expiresOn);
  if (acceptedOn === null) errors.push(`${label}: acceptedOn must be a YYYY-MM-DD date`);
  if (expiresOn === null) errors.push(`${label}: expiresOn must be a YYYY-MM-DD date`);

  let windowDays = null;
  let malformed = errors.length > 0;
  if (acceptedOn !== null && expiresOn !== null) {
    windowDays = Math.round((expiresOn - acceptedOn) / DAY_MS);
    if (windowDays <= 0) {
      errors.push(`${label}: expiresOn (${exception.expiresOn}) must be after acceptedOn (${exception.acceptedOn})`);
      malformed = true;
    }
  }
  if (malformed) return { errors, state: 'invalid', daysRemaining: null, windowDays };

  // นโยบายหน้าต่างเวลาเป็นคนละเรื่องกับสถานะ: exception ที่ยอมรับไว้ยาวเกินกำหนด ทำให้ผลรวมตก
  // แต่ไม่ได้ทำให้มัน "ผิดรูป" — รายงานต้องยังบอกได้ว่ามันยังอยู่หรือหมดอายุไปแล้ว ไม่งั้นบันทึก
  // ที่ทั้งยาวเกินและหมดอายุ จะถูกนับเป็น uncovered แล้วคำว่า expired หายไปจากรายงานทั้งที่เป็นความจริง
  if (context.maxWindowDays !== null && windowDays > context.maxWindowDays) {
    errors.push(`${label}: accepted for ${windowDays} days, past the ${context.maxWindowDays}-day limit supplied by the verifier`);
  }

  const daysRemaining = Math.floor((expiresOn - context.today) / DAY_MS);
  if (daysRemaining < 0) {
    // ไม่ใช่ warning โดยตั้งใจ: นี่คือวันที่คนคนหนึ่งบอกเองว่าจะกลับมาดู แล้วไม่ได้กลับมา
    errors.push(`${label}: exception expired on ${exception.expiresOn} (${-daysRemaining} days ago) — reprove the requirement or have ${exception.owner} accept it again with a new date`);
    return { errors, state: 'expired', daysRemaining, windowDays };
  }
  return { errors, state: 'live', daysRemaining, windowDays };
}

function evaluateCoverage(record, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const now = options.now instanceof Date ? options.now : new Date();
  const today = startOfDay(now);
  const maxWindowDays = Number.isFinite(options.maxWindowDays) ? options.maxWindowDays : null;
  const errors = [];
  const warnings = [];

  const empty = () => ({
    total: 0, proven: 0, excepted: 0, uncovered: 0, expired: 0, byRisk: { low: 0, medium: 0, high: 0 },
  });

  if (!isPlainObject(record)) {
    return { ok: false, errors: ['requirement coverage must be a JSON object'], warnings, requirements: [], totals: empty(), soonestExpiry: null, maxWindowDays };
  }
  if (record.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${record.schemaVersion}"`);
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project must be a non-empty string');
  if (Number.isNaN(Date.parse(record.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');
  if (!Array.isArray(record.requirements) || record.requirements.length === 0) {
    errors.push('requirements must be a non-empty array');
    return { ok: false, errors, warnings, requirements: [], totals: empty(), soonestExpiry: null, maxWindowDays };
  }

  const totals = empty();
  const rows = [];
  const seen = new Set();
  let soonestExpiry = null;

  for (const [index, requirement] of record.requirements.entries()) {
    const label = `requirements[${index}]`;
    if (!isPlainObject(requirement)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    const id = requirement.id;
    const name = ID_PATTERN.test(id || '') ? id : label;
    totals.total++;

    if (!ID_PATTERN.test(id || '')) errors.push(`${label}: id must look like REQ-001`);
    else if (seen.has(id)) errors.push(`${id}: duplicate requirement id`);
    else seen.add(id);

    if (typeof requirement.statement !== 'string' || requirement.statement.trim().length < 10) {
      errors.push(`${name}: statement must say what the requirement actually is (10 characters or more)`);
    }
    if (typeof requirement.source !== 'string' || !requirement.source.trim()) {
      errors.push(`${name}: source must name where this requirement came from`);
    }

    const hasProof = requirement.proof !== undefined;
    const hasException = requirement.exception !== undefined;

    if (hasProof && hasException) {
      // ทั้งคู่พร้อมกันแปลว่าอย่างใดอย่างหนึ่งโกหก: ถ้าพิสูจน์ได้ก็ไม่ต้องยกเว้น
      errors.push(`${name}: has both proof and an exception — an exception on a proven requirement means one of the two is untrue`);
      rows.push({ id: name, state: 'invalid' });
      totals.uncovered++;
      continue;
    }
    if (!hasProof && !hasException) {
      errors.push(`${name}: neither proof nor an approved exception — this requirement is accepted and unanswered`);
      rows.push({ id: name, state: 'uncovered' });
      totals.uncovered++;
      continue;
    }

    if (hasProof) {
      if (!Array.isArray(requirement.proof) || requirement.proof.length === 0) {
        errors.push(`${name}: proof must list at least one evidence item`);
        rows.push({ id: name, state: 'invalid' });
        totals.uncovered++;
        continue;
      }
      const proofErrors = [];
      const valid = validateEvidence(name, requirement.proof, root, proofErrors, warnings);
      errors.push(...proofErrors);
      if (valid.length === 0) {
        rows.push({ id: name, state: 'invalid' });
        totals.uncovered++;
      } else if (valid.every((item) => item.type === 'manual')) {
        // ถ้า manual ล้วนนับเป็น proof ได้ กลไกทั้งหมดนี้เลี่ยงได้ด้วยประโยคเดียว
        errors.push(`${name}: proof is manual evidence only, which is not reproducible — either prove it with a command, a file or a run, or record an approved exception`);
        rows.push({ id: name, state: 'invalid' });
        totals.uncovered++;
      } else {
        rows.push({ id: name, state: 'proven' });
        totals.proven++;
      }
      continue;
    }

    const verdict = evaluateException(requirement.exception, { label: name, today, maxWindowDays });
    errors.push(...verdict.errors);
    rows.push({
      id: name,
      state: verdict.state,
      risk: requirement.exception?.risk,
      owner: requirement.exception?.owner,
      daysRemaining: verdict.daysRemaining,
      windowDays: verdict.windowDays,
    });
    if (verdict.state === 'live') {
      totals.excepted++;
      totals.byRisk[requirement.exception.risk]++;
      if (soonestExpiry === null || verdict.daysRemaining < soonestExpiry.daysRemaining) {
        soonestExpiry = { id: name, on: requirement.exception.expiresOn, daysRemaining: verdict.daysRemaining };
      }
    } else if (verdict.state === 'expired') {
      totals.expired++;
    } else {
      totals.uncovered++;
    }
  }

  if (maxWindowDays === null && totals.excepted > 0) {
    warnings.push('no --max-window-days was supplied, so how long each exception was accepted for is reported but not judged');
  }

  return { ok: errors.length === 0, errors, warnings, requirements: rows, totals, soonestExpiry, maxWindowDays };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/requirement-coverage.json', root: process.cwd(), json: false, maxWindowDays: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--max-window-days') options.maxWindowDays = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file requires a path');
  if (!options.root) throw new Error('--root requires a path');
  if (options.maxWindowDays !== null && (!Number.isFinite(options.maxWindowDays) || options.maxWindowDays <= 0)) {
    throw new Error('--max-window-days requires a positive number of days');
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`requirement-coverage: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/requirement-coverage.js [--file path] [--root path] [--max-window-days N] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const recordPath = path.resolve(root, options.file);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch (error) {
    console.error(`requirement-coverage: cannot read ${path.relative(root, recordPath)}: ${error.message}`);
    return 2;
  }

  const result = evaluateCoverage(record, {
    root,
    maxWindowDays: options.maxWindowDays === null ? undefined : options.maxWindowDays,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const t = result.totals;
    const who = typeof record.project === 'string' && record.project.trim() ? record.project : path.relative(root, recordPath);
    console.log(`requirement-coverage ${who}: ${result.ok ? 'PASS' : 'FAIL'} (${t.total} requirements — ${t.proven} proven, ${t.excepted} excepted, ${t.expired} expired, ${t.uncovered} uncovered)`);
    if (t.excepted) {
      console.log(`  accepted risk: ${t.byRisk.high} high, ${t.byRisk.medium} medium, ${t.byRisk.low} low`);
      if (result.soonestExpiry) {
        console.log(`  next to expire: ${result.soonestExpiry.id} on ${result.soonestExpiry.on} (${result.soonestExpiry.daysRemaining} days)`);
      }
    }
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { RISKS, evaluateCoverage, evaluateException, parseArgs };
