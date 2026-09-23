#!/usr/bin/env node
'use strict';

/**
 * budgets — performance และ accessibility budget ที่มาจาก profile ไม่ใช่จากแอปแต่ละตัว (EP-007)
 *
 *   node .claude/budgets.js --file docs/evidence/budgets.json --profiles .claude/profiles
 *   node .claude/budgets.js --file docs/evidence/budgets.json --profiles .claude/profiles --json
 *
 * ทำไมต้องมี: การ "วัด" เสร็จไปนานแล้วและถูกบังคับที่ R3 — ทุกแอปรัน axe และ performance budget
 * แล้วส่ง JSON เป็นหลักฐาน แต่คำว่า **profile-specific** ที่ทั้ง roadmap และ
 * standards/deployment-ready-contract.md ใช้ ไม่เคยมีจริง: `application-profile.schema.json`
 * ไม่มี threshold สักตัว ตัวเลข `budgetMs: 3000` ในหลักฐานของแอปจึงเป็นเลขที่แอปนั้นเลือกเอง
 * แล้วให้คะแนนตัวเอง แปลว่า content site กับ booking system ถูกวัดด้วยไม้บรรทัดคนละอัน
 * ที่ไม่มีใครเลือกอย่างตั้งใจ
 *
 * กติกาที่ไฟล์นี้บังคับ:
 *   1. **threshold มาจาก profile เท่านั้น** — record ของแอปประกาศได้แค่ว่า "วัดได้เท่าไร"
 *      ประกาศไม่ได้ว่า "เท่าไรถึงจะผ่าน"
 *   2. **ตัวเลขที่วัดได้ถูก derive ใหม่จากไฟล์หลักฐานจริง** แล้วเทียบกับที่ประกาศ เหมือนที่
 *      EP-004 ทำกับสรุป licence — ตัวเลขที่พิมพ์เองคือตัวเลขที่มองโลกในแง่ดีได้
 *   3. metric ทุกตัวที่ profile กำหนดต้องมีการวัดอย่างน้อยหนึ่งครั้ง — ไม่วัดไม่ใช่ผ่าน
 *   4. ทุกการวัดต้องมี **คำสั่งที่รันซ้ำได้** และไฟล์หลักฐานที่มีอยู่จริง
 *   5. profile ที่ไม่ได้ประกาศ budget เลย = ตก เพราะ record ที่อ้าง profile ที่ไม่มีเพดาน
 *      คือเอกสารที่ดูเหมือนมีการควบคุม ทั้งที่ไม่มีอะไรควบคุม
 *
 * ผลที่ตั้งใจ: เปลี่ยน profile ของแอปจาก internal-crud เป็น content แล้วแอปเดิมจะตก
 * โดยไม่มีอะไรในตัวแอปเปลี่ยนเลย ซึ่งคือสิ่งที่คำว่า profile-specific ควรแปลมาตลอด
 *
 * additive ตามนโยบายของ BF-006: โปรเจกต์ที่ไม่มีไฟล์นี้ไม่ถูกตรวจข้อนี้เลย
 *
 * exit 0 = ผ่าน | exit 1 = เกิน budget / ตัวเลขไม่ตรงหลักฐาน / metric ที่ไม่ได้วัด | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PROFILE_DIRS = ['.claude/profiles', 'profiles', '../buaflow/claude-setup/tests/fixtures/profiles'];
const SERIOUS = new Set(['serious', 'critical']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadProfile(id, roots) {
  const tried = [];
  for (const root of roots) {
    const file = path.resolve(root, `${id}.json`);
    tried.push(file);
    if (!fs.existsSync(file)) continue;
    try {
      return { profile: readJson(file), file };
    } catch (error) {
      return { error: `application profile ${id} is not readable JSON: ${error.message}` };
    }
  }
  return { error: `application profile "${id}" was not found; looked in ${tried.join(', ')}` };
}

function dig(value, dotted) {
  return dotted.split('.').reduce((current, key) => (isPlainObject(current) ? current[key] : undefined), value);
}

// Recomputing the number from the evidence the measurement points at is what stops this record
// from being a place to write down a flattering figure. Each metric knows how to read itself out
// of the artifact its own tooling produces.
function derive(metric, source, dottedPath) {
  if (metric === 'axeViolations' || metric === 'axeSeriousOrCritical') {
    if (!Array.isArray(source.violations)) return { error: 'the cited file has no violations array, so it is not an axe result' };
    const violations = metric === 'axeViolations'
      ? source.violations
      : source.violations.filter((item) => SERIOUS.has(item?.impact));
    return { value: violations.length };
  }
  if (!dottedPath) return { error: `${metric} needs a path saying where in the cited file the number is` };
  const found = dig(source, dottedPath);
  if (typeof found !== 'number' || Number.isNaN(found)) {
    return { error: `${dottedPath} is not a number in the cited file` };
  }
  return { value: found };
}

function evaluateBudgets(record, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const errors = [];
  const warnings = [];
  const empty = () => ({ metrics: 0, measurements: 0, worst: {} });

  if (!isPlainObject(record)) {
    return { ok: false, errors: ['budget evidence must be a JSON object'], warnings, totals: empty(), profile: null };
  }
  if (record.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${record.schemaVersion}"`);
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project must be a non-empty string');
  if (Number.isNaN(Date.parse(record.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');

  const roots = options.profileRoots || DEFAULT_PROFILE_DIRS.map((relative) => path.resolve(root, relative));
  const loaded = loadProfile(record.profile, roots);
  if (loaded.error || !loaded.profile) {
    errors.push(loaded.error || 'profile is required');
    return { ok: false, errors, warnings, totals: empty(), profile: null };
  }
  const profile = loaded.profile;

  const limits = new Map();
  for (const group of ['performance', 'accessibility']) {
    for (const budget of profile.budgets?.[group] || []) {
      if (!isPlainObject(budget) || typeof budget.metric !== 'string') continue;
      if (limits.has(budget.metric)) {
        errors.push(`profile ${profile.id}: ${budget.metric} is given two different ceilings`);
        continue;
      }
      limits.set(budget.metric, { max: budget.max, group });
    }
  }
  if (limits.size === 0) {
    errors.push(`profile ${profile.id} declares no budgets, so this record holds the app to nothing — either add thresholds to the profile or stop claiming the app is budgeted`);
  }

  const totals = empty();
  totals.metrics = limits.size;
  const observed = new Map();

  for (const [index, measurement] of (record.measurements || []).entries()) {
    const label = isPlainObject(measurement) && measurement.metric
      ? `${measurement.metric}${measurement.subject ? ` (${measurement.subject})` : ''}`
      : `measurements[${index}]`;
    if (!isPlainObject(measurement)) { errors.push(`${label}: must be an object`); continue; }

    if (!limits.has(measurement.metric)) {
      errors.push(`${label}: profile ${profile.id} sets no budget for this metric, so measuring it here decides nothing`);
      continue;
    }
    if (typeof measurement.command !== 'string' || !measurement.command.trim()) {
      errors.push(`${label}: command is required — a number nobody can reproduce is not a measurement`);
      continue;
    }
    const source = measurement.source;
    if (!isPlainObject(source) || source.type !== 'file' || typeof source.value !== 'string') {
      errors.push(`${label}: source must be file evidence produced by that command`);
      continue;
    }
    const resolved = path.resolve(root, source.value);
    if (!fs.existsSync(resolved)) {
      errors.push(`${label}: ${source.value} does not exist`);
      continue;
    }
    let content;
    try {
      content = readJson(resolved);
    } catch (error) {
      errors.push(`${label}: ${source.value} is not readable JSON: ${error.message}`);
      continue;
    }

    const derived = derive(measurement.metric, content, measurement.path);
    if (derived.error) {
      errors.push(`${label}: ${derived.error}`);
      continue;
    }
    if (typeof measurement.value !== 'number') {
      errors.push(`${label}: value must be the number measured`);
      continue;
    }
    // Rounding is allowed; a different number is not.
    if (Math.abs(derived.value - measurement.value) > 0.5) {
      errors.push(`${label}: records ${measurement.value} but ${source.value} contains ${derived.value}`);
      continue;
    }

    totals.measurements++;
    const current = observed.get(measurement.metric);
    if (current === undefined || derived.value > current.value) {
      observed.set(measurement.metric, { value: derived.value, subject: measurement.subject ?? null });
    }
  }

  for (const [metric, limit] of limits) {
    const worst = observed.get(metric);
    if (worst === undefined) {
      errors.push(`${metric}: profile ${profile.id} sets a ceiling of ${limit.max} and nothing measures it — an unmeasured budget is not a met budget`);
      continue;
    }
    totals.worst[metric] = { value: worst.value, max: limit.max, subject: worst.subject };
    if (worst.value > limit.max) {
      // The message names the profile on purpose: the number did not change, the standard did.
      errors.push(`${metric}: worst observed ${worst.value}${worst.subject ? ` (${worst.subject})` : ''} exceeds the ${limit.max} that profile ${profile.id} allows`);
    }
  }

  if (!Array.isArray(record.measurements) || record.measurements.length === 0) {
    errors.push('measurements must record at least one number');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totals,
    profile: { id: profile.id, name: profile.name, schemaVersion: profile.schemaVersion, file: loaded.file },
  };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/budgets.json', root: process.cwd(), json: false, profiles: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--profiles') options.profiles = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file requires a path');
  if (!options.root) throw new Error('--root requires a path');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`budgets: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/budgets.js [--file path] [--root path] [--profiles dir] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const recordPath = path.resolve(root, options.file);
  let record;
  try {
    record = readJson(recordPath);
  } catch (error) {
    console.error(`budgets: cannot read ${path.relative(root, recordPath)}: ${error.message}`);
    return 2;
  }

  const result = evaluateBudgets(record, {
    root,
    profileRoots: options.profiles ? [path.resolve(process.cwd(), options.profiles)] : undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const who = typeof record.project === 'string' && record.project.trim() ? record.project : path.relative(root, recordPath);
    const from = result.profile ? `profile ${result.profile.id} (${result.profile.schemaVersion})` : 'no profile';
    console.log(`budgets ${who}: ${result.ok ? 'PASS' : 'FAIL'} — thresholds from ${from}`);
    for (const [metric, worst] of Object.entries(result.totals.worst)) {
      console.log(`  ${metric}: worst ${worst.value}${worst.subject ? ` (${worst.subject})` : ''} of ${worst.max} allowed`);
    }
    console.log(`  ${result.totals.measurements} measurement(s) against ${result.totals.metrics} budgeted metric(s)`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { derive, evaluateBudgets, loadProfile, parseArgs };
