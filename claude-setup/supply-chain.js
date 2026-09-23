#!/usr/bin/env node
'use strict';

/**
 * supply-chain — licence, provenance และ checksum ที่ตรวจซ้ำได้ ไม่ใช่ประกาศไว้เฉย ๆ (EP-004)
 *
 *   node .claude/supply-chain.js --file docs/evidence/supply-chain.json
 *   node .claude/supply-chain.js --file docs/evidence/supply-chain.json --json
 *
 * ทำไมต้องมี: EP-004 แถวเดิมขอสี่อย่าง — lockfile, SBOM, licence, provenance/checksum
 * สองอย่างแรกเสร็จไปแล้วและถูกบังคับที่ R3 ส่วนคำว่า provenance, SLSA และ license
 * ปรากฏอยู่ในเอกสาร roadmap เท่านั้น ไม่มีที่ไหนในเรพผลิตหรือตรวจมันเลย
 *
 * กติกาที่ไฟล์นี้บังคับ:
 *   1. **สรุป licence ถูก derive ใหม่จาก SBOM ทุกครั้ง** แล้วเทียบกับตัวเลขที่ประกาศไว้
 *      ตัวเลขที่เขียนด้วยมือคือตัวเลขที่ค่อย ๆ เพี้ยน ที่นี่มันโกหกไม่ได้เลย
 *   2. SBOM แต่ละไฟล์ถูก pin ด้วย sha256 ที่คำนวณใหม่ — แก้ SBOM แล้วสรุปเก่าใช้ไม่ได้ทันที
 *      ไม่ใช่เปลี่ยนตามอย่างเงียบ ๆ
 *   3. licence ที่ไม่อยู่ใน policy.allowed ต้องมีแถว review พร้อมเหตุผล และถ้าตัดสินว่า
 *      `accepted-risk` ต้องชี้ไป approved exception ของ EP-002 ที่มีอยู่จริง
 *   4. provenance ต้องตรงกับหลักฐาน CI ที่โปรเจกต์มีอยู่แล้ว (`evidence/ci-run.json`)
 *      และตรงกับ commit ใน readiness manifest — provenance ที่ชี้ไป build คนละตัวกับที่ประกาศว่า
 *      ผ่าน คือเอกสารสองใบที่พูดถึงคนละซอฟต์แวร์
 *   5. subject ทุกตัวมี sha256 ที่ **คำนวณใหม่จากไฟล์จริง** ไม่ใช่ตัวเลขที่พิมพ์ไว้
 *      ของที่ให้ digest ไม่ได้ (เช่น image ที่ผู้ใช้ build เอง) ต้องอยู่ใน notPublished พร้อมเหตุผล
 *
 * additive ตามนโยบายของ BF-006: โปรเจกต์ที่ไม่มีไฟล์นี้ไม่ถูกตรวจข้อนี้เลย
 *
 * exit 0 = ผ่าน | exit 1 = สรุปไม่ตรง SBOM / digest ไม่ตรง / provenance ขัดกับ CI | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { evaluateCoverage } = require('./requirement-coverage.js');

const NO_LICENCE = 'NONE';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// git rewrites line endings at checkout (core.autocrlf, .gitattributes text=auto), so the same
// committed text file is CRLF on a Windows machine and LF on a Linux CI runner — a digest recorded
// on one failed on the other (found when the kit's own CI first reached this step). For a text file
// the recorded digest therefore matches its bytes as they are, with LF, or with CRLF line endings.
// A file with a NUL byte is binary and is compared byte for byte only. `canonical` is the LF digest,
// the one to record.
function textDigests(bytes) {
  const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
  if (bytes.includes(0)) return { canonical: hash(bytes), accepted: new Set([hash(bytes)]) };
  const lf = bytes.toString('latin1').replace(/\r\n/g, '\n');
  const canonical = hash(Buffer.from(lf, 'latin1'));
  return { canonical, accepted: new Set([hash(bytes), canonical, hash(Buffer.from(lf.replace(/\n/g, '\r\n'), 'latin1'))]) };
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

// CycloneDX ปล่อยให้ licence ของ component หนึ่งตัวเขียนได้หลายแบบ: id, name หรือ expression
// รวมเป็นสตริงเดียวแบบเดียวกันเสมอ เพื่อให้นับได้ และเพื่อให้ของที่เขียนผิดรูป (เช่น "MIT and ISC"
// ซึ่งไม่ใช่ SPDX) โผล่ออกมาเป็นค่าของมันเอง แทนที่จะถูกกลืนหายไป
function licenseOf(component) {
  const entries = Array.isArray(component.licenses) ? component.licenses : [];
  const parts = entries
    .map((entry) => entry?.license?.id || entry?.license?.name || entry?.expression)
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
  return parts.length ? parts.join(' | ') : NO_LICENCE;
}

function deriveLicenses(sbomFiles, root, errors) {
  const summary = {};
  let components = 0;
  for (const entry of sbomFiles) {
    const resolved = path.resolve(root, entry.path);
    let sbom;
    try {
      sbom = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch (error) {
      errors.push(`sboms: cannot read ${entry.path}: ${error.message}`);
      continue;
    }
    if (!Array.isArray(sbom.components)) {
      errors.push(`sboms: ${entry.path} has no components array, so no licence can be derived from it`);
      continue;
    }
    for (const component of sbom.components) {
      components++;
      const key = licenseOf(component);
      summary[key] = (summary[key] || 0) + 1;
    }
  }
  return { summary, components };
}

function checkDigest(label, entry, root, errors) {
  if (!isPlainObject(entry)) {
    errors.push(`${label}: must be an object`);
    return false;
  }
  if (typeof entry.path !== 'string' || !entry.path.trim()) {
    errors.push(`${label}: path is required`);
    return false;
  }
  if (path.isAbsolute(entry.path)) {
    errors.push(`${label}: ${entry.path} must be relative to the project root`);
    return false;
  }
  const resolved = path.resolve(root, entry.path);
  if (!insideRoot(root, resolved)) {
    errors.push(`${label}: ${entry.path} escapes the project root`);
    return false;
  }
  if (!fs.existsSync(resolved)) {
    errors.push(`${label}: ${entry.path} does not exist`);
    return false;
  }
  if (!/^[0-9a-f]{64}$/.test(entry.sha256 || '')) {
    errors.push(`${label}: sha256 must be 64 hex characters`);
    return false;
  }
  const { canonical, accepted } = textDigests(fs.readFileSync(resolved));
  if (!accepted.has(entry.sha256)) {
    // ข้อความนี้ตั้งใจให้ยาว เพราะอาการที่พบบ่อยที่สุดคือ "ไฟล์ถูก regenerate แล้วลืมอัปเดต digest"
    // ซึ่งไม่ใช่การโจมตี แต่ก็แปลว่าสรุปที่อยู่ในไฟล์นี้ไม่ได้มาจากไฟล์ที่อยู่ในเรพตอนนี้
    errors.push(`${label}: ${entry.path} hashes to ${canonical}, not the recorded ${entry.sha256} — the file changed after this record was written`);
    return false;
  }
  return true;
}

function loadExceptionIds(root, coverageFile) {
  const file = path.resolve(root, coverageFile);
  if (!fs.existsSync(file)) return { available: false, ids: new Set(), reason: `${coverageFile} does not exist` };
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { available: false, ids: new Set(), reason: `${coverageFile} is not readable JSON: ${error.message}` };
  }
  const ids = new Set();
  for (const requirement of record.requirements || []) {
    if (isPlainObject(requirement) && requirement.exception !== undefined && typeof requirement.id === 'string') ids.add(requirement.id);
  }
  const coverage = evaluateCoverage(record, { root });
  return { available: true, ids, coverageOk: coverage.ok };
}

// provenance ที่ไม่ผูกกับหลักฐานที่มีอยู่แล้ว ก็เป็นแค่ข้อความอีกชุดหนึ่ง ที่นี่มันต้องตรงกับ
// evidence/ci-run.json (ของจริงที่ EP-011 ทำไว้) และตรงกับ commit ที่ readiness manifest ประกาศ
function crossCheckProvenance(provenance, root, options, errors, warnings) {
  const ciPath = path.resolve(root, options.ciRun || 'evidence/ci-run.json');
  if (!fs.existsSync(ciPath)) {
    warnings.push(`provenance: ${options.ciRun || 'evidence/ci-run.json'} does not exist, so the builder fields are declared but not corroborated`);
  } else {
    let run;
    try {
      run = JSON.parse(fs.readFileSync(ciPath, 'utf8'));
    } catch (error) {
      errors.push(`provenance: cannot read the CI run evidence: ${error.message}`);
      run = null;
    }
    if (run) {
      const compare = [
        ['source.commit', provenance.source?.commit, run.commit],
        ['builder.workflow', provenance.builder?.workflow, run.workflow],
        ['builder.runId', String(provenance.builder?.runId ?? ''), String(run.runId ?? '')],
        ['builder.url', provenance.builder?.url, run.url],
        ['source.repository', provenance.source?.repository, run.repository],
      ];
      for (const [field, declared, actual] of compare) {
        if (actual === undefined || actual === null || actual === '') continue;
        if (declared !== actual) {
          errors.push(`provenance.${field}: "${declared}" does not match the CI run evidence's "${actual}" — this record and evidence/ci-run.json describe different builds`);
        }
      }
      if (run.conclusion && run.conclusion !== 'success') {
        errors.push(`provenance: the cited CI run concluded "${run.conclusion}", so it did not produce a trustworthy artifact`);
      }
    }
  }

  const manifestPath = path.resolve(root, options.readinessManifest || 'docs/evidence/readiness.json');
  if (!fs.existsSync(manifestPath)) {
    warnings.push('provenance: no readiness manifest was found, so the provenance commit is not compared against the evaluated revision');
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.commit && provenance.source?.commit && manifest.commit !== provenance.source.commit) {
      errors.push(`provenance.source.commit: "${provenance.source.commit}" is not the revision the readiness manifest graded ("${manifest.commit}")`);
    }
  } catch (error) {
    errors.push(`provenance: cannot read the readiness manifest: ${error.message}`);
  }
}

function evaluateSupplyChain(record, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const errors = [];
  const warnings = [];
  const empty = () => ({ components: 0, licenses: 0, allowedByPolicy: 0, reviewed: 0, acceptedRisk: 0, subjects: 0 });

  if (!isPlainObject(record)) {
    return { ok: false, errors: ['supply-chain evidence must be a JSON object'], warnings, totals: empty() };
  }
  if (record.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${record.schemaVersion}"`);
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project must be a non-empty string');
  if (Number.isNaN(Date.parse(record.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');

  if (!Array.isArray(record.sboms) || record.sboms.length === 0) {
    errors.push('sboms must list at least one SBOM this record is derived from');
    return { ok: false, errors, warnings, totals: empty() };
  }
  const usable = record.sboms.filter((entry, index) => checkDigest(`sboms[${index}]`, entry, root, errors));

  const derived = deriveLicenses(usable, root, errors);
  const totals = empty();
  totals.components = derived.components;
  totals.licenses = Object.keys(derived.summary).length;

  const licenses = record.licenses;
  if (!isPlainObject(licenses) || !isPlainObject(licenses.policy) || !isPlainObject(licenses.summary)) {
    errors.push('licenses.policy and licenses.summary are required');
    return { ok: false, errors, warnings, totals };
  }

  // ข้อ 1: สรุปที่ประกาศไว้ต้องเท่ากับที่ derive ได้ ทุกคีย์ ทุกตัวเลข
  for (const [key, count] of Object.entries(derived.summary)) {
    if (licenses.summary[key] === undefined) {
      errors.push(`licenses.summary: "${key}" appears ${count} time(s) in the SBOMs and is missing from the summary`);
    } else if (licenses.summary[key] !== count) {
      errors.push(`licenses.summary: "${key}" is recorded as ${licenses.summary[key]} but the SBOMs contain ${count}`);
    }
  }
  for (const key of Object.keys(licenses.summary)) {
    if (derived.summary[key] === undefined) {
      errors.push(`licenses.summary: "${key}" is recorded but appears in no SBOM`);
    }
  }

  const allowed = new Set(Array.isArray(licenses.policy.allowed) ? licenses.policy.allowed : []);
  for (const value of allowed) {
    if (derived.summary[value] === undefined) {
      warnings.push(`licenses.policy.allowed: "${value}" matches nothing in the dependency tree, so the policy is broader than the project needs`);
    }
  }

  const reviews = new Map();
  for (const [index, review] of (licenses.reviewed || []).entries()) {
    const label = `licenses.reviewed[${index}]`;
    if (!isPlainObject(review)) { errors.push(`${label}: must be an object`); continue; }
    if (typeof review.license !== 'string' || !review.license.trim()) { errors.push(`${label}: license is required`); continue; }
    if (reviews.has(review.license)) { errors.push(`${label}: "${review.license}" is reviewed twice`); continue; }
    if (allowed.has(review.license)) {
      errors.push(`${label}: "${review.license}" is already blanket-allowed by the policy, so reviewing it individually says two different things`);
      continue;
    }
    if (typeof review.note !== 'string' || review.note.trim().length < 20) {
      errors.push(`${label}: a review needs a note of at least 20 characters saying what was decided and why`);
      continue;
    }
    const actual = derived.summary[review.license];
    if (actual === undefined) {
      errors.push(`${label}: "${review.license}" appears in no SBOM, so there is nothing to review`);
      continue;
    }
    if (review.components !== actual) {
      errors.push(`${label}: "${review.license}" is recorded against ${review.components} component(s) but the SBOMs contain ${actual}`);
      continue;
    }
    reviews.set(review.license, review);
  }

  const exceptions = loadExceptionIds(root, options.coverageFile || 'docs/evidence/requirement-coverage.json');
  for (const [license, review] of reviews) {
    totals.reviewed++;
    if (review.decision !== 'accepted-risk') continue;
    totals.acceptedRisk++;
    if (typeof review.exception !== 'string' || !review.exception.trim()) {
      errors.push(`licenses.reviewed: "${license}" is an accepted risk and must name an exception in docs/evidence/requirement-coverage.json, so it has an owner and an expiry date`);
      continue;
    }
    if (!exceptions.available) {
      errors.push(`licenses.reviewed: "${license}" cites ${review.exception}, but ${exceptions.reason}`);
      continue;
    }
    if (!exceptions.ids.has(review.exception)) {
      errors.push(`licenses.reviewed: "${license}" cites ${review.exception}, which is not a requirement carrying an approved exception`);
    }
  }

  // ข้อ 3: licence ทุกตัวต้องมีคนรับรอง — blanket policy หรือ review รายตัว
  for (const license of Object.keys(derived.summary)) {
    if (allowed.has(license)) { totals.allowedByPolicy++; continue; }
    if (reviews.has(license)) continue;
    errors.push(`licenses: "${license}" (${derived.summary[license]} component(s)) is neither allowed by policy nor reviewed — an unreviewed licence is an unanswered obligation`);
  }

  const provenance = record.provenance;
  if (!isPlainObject(provenance) || !isPlainObject(provenance.source) || !isPlainObject(provenance.builder)) {
    errors.push('provenance.source and provenance.builder are required');
    return { ok: errors.length === 0, errors, warnings, totals };
  }
  if (!/^[0-9a-f]{7,64}$/.test(provenance.source.commit || '')) {
    errors.push('provenance.source.commit must be a hexadecimal revision');
  }
  for (const field of ['provider', 'workflow', 'url']) {
    if (typeof provenance.builder[field] !== 'string' || !provenance.builder[field].trim()) {
      errors.push(`provenance.builder.${field} is required`);
    }
  }
  crossCheckProvenance(provenance, root, options, errors, warnings);

  if (!Array.isArray(provenance.subjects) || provenance.subjects.length === 0) {
    errors.push('provenance.subjects must list at least one artifact with a digest a consumer can recompute');
  } else {
    for (const [index, subject] of provenance.subjects.entries()) {
      if (checkDigest(`provenance.subjects[${index}]`, subject, root, errors)) totals.subjects++;
    }
  }

  if (exceptions.available && exceptions.coverageOk === false) {
    warnings.push('docs/evidence/requirement-coverage.json does not currently pass its own check, so any licence exception cited here may already have lapsed');
  }

  return { ok: errors.length === 0, errors, warnings, totals };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/supply-chain.json', root: process.cwd(), json: false, ciRun: null, readinessManifest: null, coverageFile: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--ci-run') options.ciRun = argv[++index];
    else if (arg === '--readiness-manifest') options.readinessManifest = argv[++index];
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
    console.error(`supply-chain: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/supply-chain.js [--file path] [--root path] [--ci-run path] [--readiness-manifest path] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const recordPath = path.resolve(root, options.file);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch (error) {
    console.error(`supply-chain: cannot read ${path.relative(root, recordPath)}: ${error.message}`);
    return 2;
  }

  const result = evaluateSupplyChain(record, {
    root,
    ciRun: options.ciRun || undefined,
    readinessManifest: options.readinessManifest || undefined,
    coverageFile: options.coverageFile || undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const t = result.totals;
    const who = typeof record.project === 'string' && record.project.trim() ? record.project : path.relative(root, recordPath);
    console.log(`supply-chain ${who}: ${result.ok ? 'PASS' : 'FAIL'}`);
    console.log(`  ${t.components} components under ${t.licenses} licence expression(s) — ${t.allowedByPolicy} allowed by policy, ${t.reviewed} reviewed (${t.acceptedRisk} as accepted risk), ${t.subjects} subject digest(s) recomputed`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { deriveLicenses, evaluateSupplyChain, licenseOf, parseArgs, textDigests };
