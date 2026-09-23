#!/usr/bin/env node
'use strict';

/**
 * security-baseline — threat boundary + ASVS mapping ที่เครื่องตรวจได้ (EP-003)
 *
 *   node .claude/security-baseline.js --file docs/evidence/security-baseline.json
 *   node .claude/security-baseline.js --file docs/evidence/security-baseline.json --json
 *   node .claude/security-baseline.js --file ... --control-sets ../buaflow/standards/control-sets
 *
 * ทำไมต้องมี: `standards/deployment-ready-contract.md` บอกไว้ตั้งแต่ต้นว่า control
 * `security-controls` ต้องการ "threat boundary + applicable ASVS/control proof" แต่คำว่า ASVS
 * ปรากฏอยู่แค่สองไฟล์ในเรพทั้งหมด และไม่มีอะไรผลิตหรือตรวจ mapping นั้นเลย ผลคือ control ที่
 * บังคับที่ R3 ถูกทำให้ผ่านด้วย prose ใน docs/security-notes.md — ซึ่งเป็นเอกสารที่ดี แต่ไม่ใช่หลักฐาน
 *
 * กติกาที่ไฟล์นี้บังคับ:
 *   1. control set ต้องเป็นของจริงที่มีเจ้าของและมีเวอร์ชัน — ไฟล์ใน standards/control-sets/
 *      ที่คัดลอกมาจากต้นทางพร้อม sha256 ของไฟล์ต้นฉบับ ไม่ใช่ checklist ที่เขียนขึ้นเองที่นี่
 *   2. control id ที่ไม่มีอยู่ใน control set = ผิด (ปิดช่องอ้าง ASVS id ที่ไม่มีจริง)
 *   3. control ทุกข้อในบทที่ไม่ได้ถูก exclude ต้องมีคำตอบ **ครบทุกข้อ** ไม่งั้นมันไม่ใช่ baseline
 *      แต่เป็นรายการที่เลือกมาเฉพาะข้อที่ผ่าน
 *   4. `met` ต้องมีหลักฐานที่ทำซ้ำได้ — manual ล้วนไม่นับ (กติกาเดียวกับ EP-002)
 *   5. **`not-met` ต้องชี้ไป exception ใน requirement-coverage.json ที่มีอยู่จริง** — control ที่
 *      รู้อยู่แล้วว่าไม่ผ่าน ต้องมีเจ้าของและวันหมดอายุ ไม่ใช่แถวสีแดงที่อยู่เฉย ๆ ตลอดกาล
 *   6. `not-applicable` ต้องมีเหตุผลเฉพาะโปรเจกต์ และบทที่ exclude ทั้งบทต้องบอกว่าทำไม
 *   7. threat boundary เป็นข้อมูล ไม่ใช่ย่อหน้า: entry point และไฟล์ที่บังคับกฎต้องมีอยู่จริง
 *
 * ข้อ 5 คือหัวใจ: มันเชื่อม EP-003 เข้ากับ EP-002 แทนที่จะสร้างทะเบียนความเสี่ยงชุดที่สอง
 * ช่องโหว่ที่ยอมรับแล้วมีที่อยู่ที่เดียวในโปรเจกต์ และ gate เดียวกันทำให้มันหมดอายุ
 *
 * additive ตามนโยบายของ BF-006: โปรเจกต์ที่ไม่มีไฟล์นี้ไม่ถูกตรวจข้อนี้เลย
 *
 * exit 0 = ผ่าน | exit 1 = mapping ไม่ครบ/ไม่มีหลักฐาน/exception ที่อ้างไม่มีจริง | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');

const { validateEvidence } = require('./readiness.js');
const { evaluateCoverage } = require('./requirement-coverage.js');

// .claude/control-sets is where buaflow install puts them (PE-008), so CI checks the mapping without the kit on the runner
const DEFAULT_CONTROL_SETS = ['.claude/control-sets', 'standards/control-sets', '../buaflow/standards/control-sets', 'buaflow/standards/control-sets'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function loadControlSet(id, roots) {
  const tried = [];
  for (const root of roots) {
    const file = path.resolve(root, `${id}.json`);
    tried.push(file);
    if (!fs.existsSync(file)) continue;
    try {
      return { set: JSON.parse(fs.readFileSync(file, 'utf8')), file };
    } catch (error) {
      return { error: `control set ${id} is not readable JSON: ${error.message}`, file };
    }
  }
  return { error: `control set "${id}" was not found; looked in ${tried.join(', ')}` };
}

function flattenControlSet(set) {
  const byId = new Map();
  const byChapter = new Map();
  for (const chapter of set.chapters || []) {
    const ids = [];
    for (const section of chapter.sections || []) {
      for (const requirement of section.requirements || []) {
        byId.set(requirement.id, { ...requirement, chapter: chapter.id, chapterTitle: chapter.title, section: section.id });
        ids.push(requirement.id);
      }
    }
    byChapter.set(chapter.id, ids);
  }
  return { byId, byChapter };
}

// requirement-coverage.json คือทะเบียนความเสี่ยงที่ยอมรับแล้วของโปรเจกต์ ไฟล์นี้ไม่สร้างชุดที่สอง
// แต่ยืนยันว่า exception ที่ control อ้างถึง มีอยู่จริงและเป็น exception จริง ๆ ไม่ใช่ requirement ที่พิสูจน์แล้ว
function loadExceptions(root, coverageFile) {
  const file = path.resolve(root, coverageFile);
  if (!fs.existsSync(file)) {
    return { available: false, ids: new Set(), reason: `${coverageFile} does not exist, so no exception id can be resolved` };
  }
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { available: false, ids: new Set(), reason: `${coverageFile} is not readable JSON: ${error.message}` };
  }
  const ids = new Set();
  for (const requirement of record.requirements || []) {
    if (isPlainObject(requirement) && requirement.exception !== undefined && typeof requirement.id === 'string') {
      ids.add(requirement.id);
    }
  }
  // ตรวจว่าไฟล์นั้นเองยังผ่านอยู่ไหม เพราะ exception ที่หมดอายุแล้วไม่ควรค้ำ control ไว้ได้
  const coverage = evaluateCoverage(record, { root });
  return { available: true, ids, coverageOk: coverage.ok, coverageErrors: coverage.errors };
}

function evaluateBaseline(record, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const errors = [];
  const warnings = [];
  const empty = () => ({ total: 0, met: 0, notMet: 0, notApplicable: 0, excludedChapters: 0, excludedControls: 0 });

  if (!isPlainObject(record)) {
    return { ok: false, errors: ['security baseline must be a JSON object'], warnings, totals: empty(), controlSet: null };
  }
  if (record.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${record.schemaVersion}"`);
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project must be a non-empty string');
  if (Number.isNaN(Date.parse(record.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');

  const roots = options.controlSetRoots || DEFAULT_CONTROL_SETS.map((relative) => path.resolve(root, relative));
  const loaded = loadControlSet(record.controlSet, roots);
  if (loaded.error || !loaded.set) {
    errors.push(loaded.error || 'controlSet is required');
    return { ok: false, errors, warnings, totals: empty(), controlSet: null };
  }
  const set = loaded.set;
  const { byId, byChapter } = flattenControlSet(set);

  const excluded = new Set();
  for (const [index, exclusion] of (record.excludedChapters || []).entries()) {
    const label = `excludedChapters[${index}]`;
    if (!isPlainObject(exclusion)) { errors.push(`${label}: must be an object`); continue; }
    if (!byChapter.has(exclusion.chapter)) {
      errors.push(`${label}: ${exclusion.chapter} is not a chapter of ${set.id}`);
      continue;
    }
    if (typeof exclusion.reason !== 'string' || exclusion.reason.trim().length < 20) {
      errors.push(`${label}: excluding ${exclusion.chapter} requires a reason of at least 20 characters`);
      continue;
    }
    if (excluded.has(exclusion.chapter)) errors.push(`${label}: ${exclusion.chapter} is excluded twice`);
    excluded.add(exclusion.chapter);
  }

  for (const [index, boundary] of (record.boundaries || []).entries()) {
    const label = isPlainObject(boundary) && typeof boundary.id === 'string' ? boundary.id : `boundaries[${index}]`;
    if (!isPlainObject(boundary)) { errors.push(`${label}: must be an object`); continue; }
    if (!/^TB-\d{3,}$/.test(boundary.id || '')) errors.push(`${label}: id must look like TB-001`);
    for (const field of ['name', 'untrusted', 'trusted']) {
      if (typeof boundary[field] !== 'string' || !boundary[field].trim()) errors.push(`${label}: ${field} is required`);
    }
    if (!Array.isArray(boundary.assets) || boundary.assets.length === 0) {
      errors.push(`${label}: assets must name what is behind this boundary`);
    }
    // entry point และตัวบังคับกฎต้องชี้ไปไฟล์ที่มีอยู่จริง — boundary ที่ชี้ไปโค้ดที่ถูกลบไปแล้ว
    // คือคำอธิบายของระบบที่ไม่มีอยู่อีกต่อไป ซึ่งอันตรายกว่าไม่เขียนไว้เลย
    for (const field of ['entryPoints', 'enforcedBy']) {
      if (!Array.isArray(boundary[field]) || boundary[field].length === 0) {
        errors.push(`${label}: ${field} must list at least one item`);
        continue;
      }
      validateEvidence(`${label}.${field}`, boundary[field], root, errors, warnings);
    }
  }
  if (!Array.isArray(record.boundaries) || record.boundaries.length === 0) {
    errors.push('boundaries must describe at least one trust boundary');
  }

  const exceptions = loadExceptions(root, options.coverageFile || 'docs/evidence/requirement-coverage.json');
  const totals = empty();
  const seen = new Set();

  for (const [index, control] of (record.controls || []).entries()) {
    const label = isPlainObject(control) && typeof control.id === 'string' ? control.id : `controls[${index}]`;
    if (!isPlainObject(control)) { errors.push(`${label}: must be an object`); continue; }

    const known = byId.get(control.id);
    if (!known) {
      errors.push(`${label}: not a control of ${set.id} ${set.version}`);
      continue;
    }
    if (seen.has(control.id)) { errors.push(`${label}: answered twice`); continue; }
    seen.add(control.id);
    if (excluded.has(known.chapter)) {
      errors.push(`${label}: ${known.chapter} is excluded as a whole, so this control must not also be answered individually`);
      continue;
    }
    totals.total++;

    if (control.status === 'met') {
      if (!Array.isArray(control.evidence) || control.evidence.length === 0) {
        errors.push(`${label}: met requires evidence`);
        continue;
      }
      const valid = validateEvidence(label, control.evidence, root, errors, warnings);
      if (valid.length === 0) continue;
      if (valid.every((item) => item.type === 'manual')) {
        errors.push(`${label}: met with manual evidence only, which is not reproducible — prove it with a command, a file or a run, or record it as not-met with an exception`);
        continue;
      }
      totals.met++;
    } else if (control.status === 'not-met') {
      if (typeof control.exception !== 'string' || !control.exception.trim()) {
        errors.push(`${label}: not-met requires an exception id from docs/evidence/requirement-coverage.json — a control known to be unmet needs an owner and an expiry date, not a permanent red row`);
        continue;
      }
      if (!exceptions.available) {
        errors.push(`${label}: cites exception ${control.exception}, but ${exceptions.reason}`);
        continue;
      }
      if (!exceptions.ids.has(control.exception)) {
        errors.push(`${label}: cites ${control.exception}, which is not a requirement carrying an approved exception in docs/evidence/requirement-coverage.json`);
        continue;
      }
      totals.notMet++;
    } else if (control.status === 'not-applicable') {
      if (typeof control.rationale !== 'string' || control.rationale.trim().length < 20) {
        errors.push(`${label}: not-applicable requires a project-specific rationale of at least 20 characters`);
        continue;
      }
      totals.notApplicable++;
    } else {
      errors.push(`${label}: unsupported status "${control.status}"`);
    }
  }

  // ข้อที่ทำให้มันเป็น baseline จริง ๆ: ทุก control ในบทที่ไม่ได้ exclude ต้องมีคำตอบ
  const missing = [];
  for (const [chapter, ids] of byChapter) {
    if (excluded.has(chapter)) {
      totals.excludedChapters++;
      totals.excludedControls += ids.length;
      continue;
    }
    for (const id of ids) if (!seen.has(id)) missing.push(id);
  }
  if (missing.length) {
    errors.push(`unanswered: ${missing.length} control(s) of ${set.id} have no entry and their chapter is not excluded — ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`);
  }

  if (exceptions.available && exceptions.coverageOk === false) {
    warnings.push('docs/evidence/requirement-coverage.json does not currently pass its own check, so the exceptions cited here may already have lapsed');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totals,
    controlSet: { id: set.id, name: set.name, version: set.version, level: set.level, file: loaded.file },
  };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/security-baseline.json', root: process.cwd(), json: false, controlSets: null, coverageFile: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--control-sets') options.controlSets = argv[++index];
    else if (arg === '--coverage-file') options.coverageFile = argv[++index];
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
    console.error(`security-baseline: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/security-baseline.js [--file path] [--root path] [--control-sets dir] [--coverage-file path] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const recordPath = path.resolve(root, options.file);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch (error) {
    console.error(`security-baseline: cannot read ${path.relative(root, recordPath)}: ${error.message}`);
    return 2;
  }

  const result = evaluateBaseline(record, {
    root,
    controlSetRoots: options.controlSets ? [path.resolve(process.cwd(), options.controlSets)] : undefined,
    coverageFile: options.coverageFile || undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const t = result.totals;
    const set = result.controlSet ? `${result.controlSet.name} ${result.controlSet.version} L${result.controlSet.level}` : 'unknown control set';
    console.log(`security-baseline ${record.project || path.relative(root, recordPath)}: ${result.ok ? 'PASS' : 'FAIL'} — ${set}`);
    console.log(`  ${t.total} answered (${t.met} met, ${t.notMet} not met with an exception, ${t.notApplicable} not applicable), ${t.excludedControls} in ${t.excludedChapters} excluded chapter(s)`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { evaluateBaseline, flattenControlSet, loadControlSet, parseArgs };
