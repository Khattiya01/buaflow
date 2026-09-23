#!/usr/bin/env node
'use strict';

/**
 * operational-readiness — restore ที่ซ้อมจริง และ incident hook ที่เป็นสัญญา (EP-005)
 *
 *   node .claude/operational-readiness.js --file docs/evidence/operational-readiness.json
 *   node .claude/operational-readiness.js --file docs/evidence/operational-readiness.json --json
 *
 * ทำไมต้องมี: ครึ่งหนึ่งของ EP-005 เสร็จไปนานแล้วและถูกบังคับที่ R3 — health endpoint,
 * structured log และ runbook มีครบทุกแอป ส่วน **backup/restore ถูกพูดถึงใน runbook สองในสามตัว
 * และไม่มีอะไรซ้อมมันเลย** แปลว่าคำกล่าวอ้างที่หนักที่สุดในโมเดล (ข้อมูลหายแล้วกู้คืนได้)
 * ตั้งอยู่บนย่อหน้าเดียว ส่วน incident response ก็เป็น bullet ที่ไม่มีเจ้าของและไม่มีตัวจับสัญญาณ
 *
 * กติกาที่ไฟล์นี้บังคับ:
 *   1. **rehearsal ต้องมีอยู่จริง ผ่านจริง และเป็นไฟล์เดิม** — sha256 ถูกคำนวณใหม่ และเนื้อในต้อง
 *      บอกว่า ok และ fingerprint ก่อน/หลังตรงกัน · rehearsal ที่ล้มเหลวจะถูกอ้างว่าผ่านไม่ได้
 *   2. incident hook ทุกตัวต้องมี **สัญญาณที่สร้าง alert ได้จริง, ตัวที่จับมัน, ความรุนแรง,
 *      เจ้าของ และหัวข้อ runbook ที่เปิดเป็นอันแรก**
 *   3. `firstResponse` ต้องเป็น `ไฟล์.md#anchor` ที่ **มีหัวข้อนั้นอยู่จริง** — ลิงก์ไปหัวข้อที่ถูก
 *      เปลี่ยนชื่อไปแล้วคือคำสั่งที่ตอนตีสองจะพาไปที่ว่างเปล่า
 *   4. ไฟล์ใน `detectedBy` ต้องมีอยู่จริง — hook ที่ชี้ไป detector ที่ถูกลบคือสัญญาณที่ไม่มีใครส่ง
 *   5. ถ้าโปรเจกต์มี `security-baseline.json` **ทุก trust boundary ต้องมี hook อย่างน้อยหนึ่งตัว**
 *      ที่เฝ้ามันอยู่ — ที่ไหนที่ของไม่น่าเชื่อถือกลายเป็นของน่าเชื่อถือ ต้องมีคนตอบว่าถ้ามันพังจะรู้ได้ยังไง
 *
 * ข้อ 5 คือเหตุผลที่ไฟล์นี้ไม่ได้เขียน threat boundary ใหม่อีกรอบ: มันใช้ของที่ EP-003 บันทึกไว้แล้ว
 * และทำให้ช่องว่างระหว่าง "รู้ว่ามีเขตแดนตรงนี้" กับ "รู้ว่าจะรู้ได้ยังไงว่ามันพัง" มองเห็นด้วยเครื่อง
 *
 * additive ตามนโยบายของ BF-006: โปรเจกต์ที่ไม่มีไฟล์นี้ไม่ถูกตรวจข้อนี้เลย
 *
 * exit 0 = ผ่าน | exit 1 = rehearsal ไม่ผ่าน/ลิงก์เสีย/boundary ที่ไม่มีใครเฝ้า | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateEvidence } = require('./readiness.js');

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// GitHub's heading anchors: lowercase, drop anything that is not a word character, space or
// hyphen, then spaces become hyphens. Inline code and emphasis markers disappear with the rest.
// Each space becomes its own hyphen and runs are NOT collapsed — "web / backend" renders as
// "web--backend", because the slash is deleted and the two spaces around it both survive. A
// collapsing version would be self-consistent here and still produce links that 404 on the
// rendered page, which is the only place the link is ever actually clicked.
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!match) continue;
    const base = slug(match[1]);
    // Duplicate headings get -1, -2 … appended, the same way the renderer does it.
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkRehearsal(backup, root, errors) {
  const rehearsal = backup.rehearsal;
  if (!isPlainObject(rehearsal) || typeof rehearsal.path !== 'string' || !rehearsal.path.trim()) {
    errors.push('backup.rehearsal.path is required — a restore procedure nobody has run is a paragraph, not a procedure');
    return null;
  }
  const resolved = path.resolve(root, rehearsal.path);
  if (!fs.existsSync(resolved)) {
    errors.push(`backup.rehearsal: ${rehearsal.path} does not exist`);
    return null;
  }
  const bytes = fs.readFileSync(resolved);
  // Same rule as supply-chain.js: git gives this text file CRLF on Windows and LF on Linux, so the
  // recorded digest matches it with either line ending. The LF digest is the one reported to record.
  const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const lf = bytes.toString('latin1').replace(/\r\n/g, '\n');
  const actual = hash(Buffer.from(lf, 'latin1'));
  const accepted = new Set([hash(bytes), actual, hash(Buffer.from(lf.replace(/\n/g, '\r\n'), 'latin1'))]);
  if (!accepted.has(rehearsal.sha256)) {
    errors.push(`backup.rehearsal: ${rehearsal.path} hashes to ${actual}, not the recorded ${rehearsal.sha256} — the rehearsal was re-run and this record still describes the old one`);
    return null;
  }
  let transcript;
  try {
    transcript = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    errors.push(`backup.rehearsal: ${rehearsal.path} is not readable JSON: ${error.message}`);
    return null;
  }
  if (transcript.ok !== true) {
    errors.push(`backup.rehearsal: ${rehearsal.path} records a rehearsal that did not pass, so it cannot stand as evidence that a restore works`);
    return null;
  }
  // The point of a restore rehearsal is the data, not the schema: a run that recreated empty
  // tables would set ok and prove nothing.
  if (transcript.fingerprint && transcript.fingerprint.identical !== true) {
    errors.push(`backup.rehearsal: ${rehearsal.path} restored the database but the data did not come back identical`);
    return null;
  }
  return transcript;
}

function evaluateOperationalReadiness(record, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const errors = [];
  const warnings = [];
  const empty = () => ({ hooks: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 }, boundariesWatched: 0, boundariesTotal: 0 });

  if (!isPlainObject(record)) {
    return { ok: false, errors: ['operational readiness must be a JSON object'], warnings, totals: empty(), rehearsal: null };
  }
  if (record.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${record.schemaVersion}"`);
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project must be a non-empty string');
  if (Number.isNaN(Date.parse(record.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');

  const totals = empty();
  let rehearsal = null;

  if (!isPlainObject(record.backup)) {
    errors.push('backup is required');
  } else {
    for (const field of ['procedure', 'restore']) {
      if (typeof record.backup[field] !== 'string' || record.backup[field].trim().length < 10) {
        errors.push(`backup.${field} must name the actual command or mechanism, not a category`);
      }
    }
    const documentedIn = record.backup.documentedIn;
    if (typeof documentedIn !== 'string' || !documentedIn.trim()) {
      errors.push('backup.documentedIn must name the document an operator reads');
    } else if (!fs.existsSync(path.resolve(root, documentedIn))) {
      errors.push(`backup.documentedIn: ${documentedIn} does not exist`);
    }
    rehearsal = checkRehearsal(record.backup, root, errors);
  }

  const anchorCache = new Map();
  const ids = new Set();
  const watched = new Set();

  for (const [index, hook] of (record.incidentHooks || []).entries()) {
    const label = isPlainObject(hook) && typeof hook.id === 'string' ? hook.id : `incidentHooks[${index}]`;
    if (!isPlainObject(hook)) { errors.push(`${label}: must be an object`); continue; }
    if (!/^IH-\d{3,}$/.test(hook.id || '')) errors.push(`${label}: id must look like IH-001`);
    else if (ids.has(hook.id)) errors.push(`${label}: duplicate hook id`);
    else ids.add(hook.id);

    if (typeof hook.name !== 'string' || !hook.name.trim()) errors.push(`${label}: name is required`);
    if (typeof hook.signal !== 'string' || hook.signal.trim().length < 20) {
      errors.push(`${label}: signal must describe an observable condition specific enough to build an alert from`);
    }
    if (!SEVERITIES.has(hook.severity)) {
      errors.push(`${label}: severity must be one of ${[...SEVERITIES].join(', ')}`);
    } else {
      totals.bySeverity[hook.severity]++;
    }
    if (typeof hook.owner !== 'string' || !hook.owner.trim()) {
      errors.push(`${label}: owner is required — an incident everybody owns is an incident nobody owns`);
    }

    if (!Array.isArray(hook.detectedBy) || hook.detectedBy.length === 0) {
      errors.push(`${label}: detectedBy must name what produces this signal`);
    } else {
      validateEvidence(label, hook.detectedBy, root, errors, warnings);
    }

    const first = hook.firstResponse;
    if (typeof first !== 'string' || !/^[^#]+\.md#[a-z0-9-]+$/.test(first)) {
      errors.push(`${label}: firstResponse must look like docs/runbook.md#incident-response`);
    } else {
      const [file, anchor] = first.split('#');
      const resolved = path.resolve(root, file);
      if (!fs.existsSync(resolved)) {
        errors.push(`${label}: firstResponse points at ${file}, which does not exist`);
      } else {
        if (!anchorCache.has(resolved)) anchorCache.set(resolved, headingAnchors(fs.readFileSync(resolved, 'utf8')));
        if (!anchorCache.get(resolved).has(anchor)) {
          // This is the failure that only shows up during an incident, which is the worst
          // possible time to discover a heading was renamed.
          errors.push(`${label}: firstResponse points at #${anchor} in ${file}, and no heading there produces that anchor`);
        }
      }
    }

    if (hook.boundary !== undefined) {
      if (!/^TB-\d{3,}$/.test(hook.boundary)) errors.push(`${label}: boundary must look like TB-001`);
      else watched.add(hook.boundary);
    }
    totals.hooks++;
  }

  if (!Array.isArray(record.incidentHooks) || record.incidentHooks.length === 0) {
    errors.push('incidentHooks must declare at least one hook');
  }

  // Cross-check against EP-003 rather than describing the boundaries again here.
  const baselinePath = path.resolve(root, options.securityBaseline || 'docs/evidence/security-baseline.json');
  if (fs.existsSync(baselinePath)) {
    try {
      const baseline = readJson(baselinePath);
      const declared = (baseline.boundaries || []).map((boundary) => boundary.id).filter(Boolean);
      totals.boundariesTotal = declared.length;
      for (const id of declared) {
        if (watched.has(id)) totals.boundariesWatched++;
        else errors.push(`security-baseline declares trust boundary ${id} and no incident hook watches it — the place where untrusted input becomes trusted has no answer to "how would we know"`);
      }
      for (const id of watched) {
        if (!declared.includes(id)) errors.push(`incidentHooks reference boundary ${id}, which docs/evidence/security-baseline.json does not declare`);
      }
    } catch (error) {
      errors.push(`cannot read the security baseline to cross-check boundaries: ${error.message}`);
    }
  } else if (watched.size) {
    warnings.push('incident hooks name trust boundaries, but there is no security baseline to check them against');
  }

  return { ok: errors.length === 0, errors, warnings, totals, rehearsal: rehearsal ? { ok: true, at: rehearsal.finishedAt ?? null } : null };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/operational-readiness.json', root: process.cwd(), json: false, securityBaseline: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--security-baseline') options.securityBaseline = argv[++index];
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
    console.error(`operational-readiness: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/operational-readiness.js [--file path] [--root path] [--security-baseline path] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const recordPath = path.resolve(root, options.file);
  let record;
  try {
    record = readJson(recordPath);
  } catch (error) {
    console.error(`operational-readiness: cannot read ${path.relative(root, recordPath)}: ${error.message}`);
    return 2;
  }

  const result = evaluateOperationalReadiness(record, {
    root,
    securityBaseline: options.securityBaseline || undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const t = result.totals;
    const who = typeof record.project === 'string' && record.project.trim() ? record.project : path.relative(root, recordPath);
    console.log(`operational-readiness ${who}: ${result.ok ? 'PASS' : 'FAIL'}`);
    console.log(`  restore rehearsed: ${result.rehearsal ? 'yes' : 'no'} · ${t.hooks} incident hook(s) (${t.bySeverity.critical} critical, ${t.bySeverity.high} high, ${t.bySeverity.medium} medium, ${t.bySeverity.low} low) · ${t.boundariesWatched}/${t.boundariesTotal} trust boundaries watched`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { evaluateOperationalReadiness, headingAnchors, parseArgs, slug };
