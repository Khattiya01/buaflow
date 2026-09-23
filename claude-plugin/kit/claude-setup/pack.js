#!/usr/bin/env node
/**
 * pack — ตรวจ Stack/Capability Pack (PP-002) ตาม schemas/pack.schema.json
 *
 *   node claude-setup/pack.js --file .claude/packs/nextjs-postgres.json
 *   node claude-setup/pack.js --dir .claude/packs
 *   node claude-setup/pack.js --dir .claude/packs --json
 *
 * ทำไมต้องมี: pack ต้องพิสูจน์ตัวเองแบบ deterministic — ต้องลงมืออย่างไร (setup), ต้องมีไฟล์อะไร
 * อยู่จริงเมื่อทำเสร็จ (requiredArtifacts), รันแล้วผ่าน/ไม่ผ่านชัดเจน (verification), และช่วย readiness
 * control ไหนได้จริง (operationalEvidence, cross-check กับ claude-setup/readiness.js)
 * ไม่ใช่แค่คำโฆษณาใน description
 *
 * v2 (PP-010 / D-011) เปลี่ยนความหมายของ pack จาก template เป็น recipe + assertion:
 *
 *   - `setup` คือสูตร — คำสั่งของเจ้าของ framework ที่ต้องรัน ไม่ใช่โค้ดที่ Buaflow เก็บไว้
 *     คำสั่ง scaffold ห้าม pin เวอร์ชัน เพราะ pack ที่ pin คือ snapshot ของปีที่เขียนมัน
 *   - `requiredArtifacts` (เดิมชื่อ generatedArtifacts) คือ assertion — ไฟล์ที่ต้องมีอยู่จริงเมื่อเสร็จ
 *     ไม่ใช่คำสัญญาว่า generator จะเขียนให้ (ซึ่งไม่เคยมีใครตรวจ เพราะไม่เคยมี generator)
 *   - `implementedBy` ผูก pack เข้ากับ reference app ที่พิสูจน์มันจริง — ถ้าไฟล์ที่ประกาศไม่มีอยู่
 *     ในนั้น pack ตก ไม่ใช่แค่ "รูปแบบถูก"
 *   - `upgrade` ถูกถอดออก: ว่างเปล่าทั้ง 9 pack ตั้งแต่วันแรกจนวันสุดท้าย และ EP-010
 *     (evidence-freshness) ตอบคำถามเรื่องของเก่าด้วยเครื่องแทน ledger ที่ต้องรอคนมาเขียน
 *
 * exit 0 = ผ่าน | exit 1 = มี pack ที่ไม่ผ่าน
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CONTROLS_BY_LEVEL } = require('./readiness.js');

const KNOWN_CONTROLS = new Set(Object.values(CONTROLS_BY_LEVEL).flat());
const ID_PATTERN = /^[a-z][a-z0-9-]+$/;
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const INPUT_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const INPUT_TYPES = new Set(['string', 'boolean', 'number', 'enum']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Which token does each launcher treat as "the tool to run"? Leading flags are skipped so
// that `npx --yes create-next-app@latest` reads the same as `npx create-next-app@latest`.
// Only the `--flag=value` form is consumed as a flag value: allowing a space-separated one
// lets the flag swallow the tool token itself, which silently passed a pinned scaffolder
// until a test caught it.
const SCAFFOLD_LAUNCHERS = [
  /\bnpx\s+(?:--?[\w-]+(?:=\S+)?\s+)*(\S+)/,
  /\bbunx\s+(?:--?[\w-]+(?:=\S+)?\s+)*(\S+)/,
  /\b(?:pnpm|yarn)\s+dlx\s+(?:--?[\w-]+(?:=\S+)?\s+)*(\S+)/,
  /\b(?:npm|pnpm|yarn|bun)\s+create\s+(?:--?[\w-]+(?:=\S+)?\s+)*(\S+)/,
  /\buvx\s+(?:--?[\w-]+(?:=\S+)?\s+)*(\S+)/,
  /\bpipx\s+run\s+(?:--?[\w-]+(?:=\S+)?\s+)*(\S+)/,
];

// The single rule that keeps a pack from aging into a lie. A scaffolder pinned to a
// number bakes the year the pack was written into every project made from it, which is
// exactly the failure phases/06-scaffold.md has always warned about ("อย่าสร้างไฟล์โครงเอง
// ... ไม่ใช่โครงที่ AI จำมาจากปีก่อน"). Detection is by command shape, not by a flag the
// author sets, so it cannot be dodged by leaving a field out. Only the launcher's own
// tool token is examined: an application's own dependencies SHOULD be pinned, and a
// later `npm ci` or a lockfile is none of this rule's business.
function pinnedScaffolder(command) {
  if (typeof command !== 'string') return null;
  for (const pattern of SCAFFOLD_LAUNCHERS) {
    const match = command.match(pattern);
    if (match && /(?:@|==)\d/.test(match[1])) return match[1];
  }
  return null;
}

function validatePack(pack, options = {}) {
  const errors = [];
  if (!isPlainObject(pack)) return { ok: false, errors: ['pack must be a JSON object'] };

  if (pack.schemaVersion !== '2.0') {
    errors.push(pack.schemaVersion === '1.0'
      ? 'schemaVersion 1.0 is a pack template, not a recipe; migrate it with scripts/migrate-artifact.js --type pack'
      : `unsupported schemaVersion "${pack.schemaVersion}"`);
  }
  if (!ID_PATTERN.test(pack.id || '')) errors.push('id must be lowercase-kebab-case');
  if (options.expectedId && pack.id !== options.expectedId) {
    errors.push(`id "${pack.id}" does not match filename "${options.expectedId}.json"`);
  }
  if (!['stack', 'capability'].includes(pack.kind)) errors.push('kind must be "stack" or "capability"');
  if (typeof pack.name !== 'string' || !pack.name.trim()) errors.push('name must be a non-empty string');
  if (!SEMVER_PATTERN.test(pack.version || '')) errors.push('version must be a full semver string (major.minor.patch)');

  const inputs = Array.isArray(pack.inputs) ? pack.inputs : null;
  if (!inputs) {
    errors.push('inputs must be an array');
  } else {
    const seen = new Set();
    inputs.forEach((input, i) => {
      const label = `inputs[${i}]`;
      if (!isPlainObject(input)) { errors.push(`${label}: must be an object`); return; }
      if (seen.has(input.name)) errors.push(`${label}: duplicate input name "${input.name}"`);
      seen.add(input.name);
      if (!INPUT_NAME_PATTERN.test(input.name || '')) errors.push(`${label}: name must be camelCase starting with a lowercase letter`);
      if (!INPUT_TYPES.has(input.type)) errors.push(`${label}: type must be one of string, boolean, number, enum`);
      if (typeof input.required !== 'boolean') errors.push(`${label}: required must be a boolean`);
      if (!input.description || typeof input.description !== 'string') errors.push(`${label}: description is required`);
      if (input.type === 'enum' && (!Array.isArray(input.options) || input.options.length === 0)) {
        errors.push(`${label}: enum inputs must declare a non-empty options array`);
      }
    });
  }

  const setup = Array.isArray(pack.setup) ? pack.setup : null;
  if (!setup || setup.length === 0) {
    errors.push('setup must be a non-empty array');
  } else {
    const seen = new Set();
    setup.forEach((step, i) => {
      const label = `setup[${i}]`;
      if (!isPlainObject(step)) { errors.push(`${label}: must be an object`); return; }
      if (seen.has(step.id)) errors.push(`${label}: duplicate setup id "${step.id}"`);
      seen.add(step.id);
      if (!ID_PATTERN.test(step.id || '')) errors.push(`${label}: id must be lowercase-kebab-case`);
      if (!step.command || typeof step.command !== 'string') errors.push(`${label}: command is required`);
      if (!step.description || typeof step.description !== 'string') errors.push(`${label}: description is required`);
      const pinned = pinnedScaffolder(step.command);
      if (pinned) {
        errors.push(`${label}: scaffolding command pins "${pinned}"; use the unpinned tool (e.g. @latest) so the generated project is current rather than a snapshot of when this pack was written`);
      }
    });
  }

  const requiredArtifacts = Array.isArray(pack.requiredArtifacts) ? pack.requiredArtifacts : null;
  if (!requiredArtifacts || requiredArtifacts.length === 0) {
    errors.push('requiredArtifacts must be a non-empty array');
  } else {
    const seen = new Set();
    requiredArtifacts.forEach((artifact, i) => {
      const label = `requiredArtifacts[${i}]`;
      if (!isPlainObject(artifact)) { errors.push(`${label}: must be an object`); return; }
      if (!artifact.path || typeof artifact.path !== 'string') errors.push(`${label}: path is required`);
      else {
        if (path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..')) {
          errors.push(`${label}: path must be relative and stay inside the generated project`);
        }
        if (seen.has(artifact.path)) errors.push(`${label}: duplicate path "${artifact.path}"`);
        seen.add(artifact.path);
      }
      if (!artifact.description || typeof artifact.description !== 'string') errors.push(`${label}: description is required`);
    });
  }

  if (pack.implementedBy !== undefined) {
    if (typeof pack.implementedBy !== 'string' || !pack.implementedBy.trim()) {
      errors.push('implementedBy must be a non-empty path when present');
    } else if (path.isAbsolute(pack.implementedBy) || pack.implementedBy.split(/[\\/]/).includes('..')) {
      errors.push('implementedBy must be a repository-relative path that does not escape the repository');
    }
  }

  const compatibility = pack.compatibility;
  if (!isPlainObject(compatibility)) {
    errors.push('compatibility must be an object');
  } else {
    for (const key of ['requiresPacks', 'conflictsWithPacks', 'profiles']) {
      if (!Array.isArray(compatibility[key])) errors.push(`compatibility.${key} must be an array`);
    }
    if (Array.isArray(compatibility.requiresPacks) && compatibility.requiresPacks.includes(pack.id)) {
      errors.push('compatibility.requiresPacks cannot include the pack\'s own id');
    }
    if (Array.isArray(compatibility.conflictsWithPacks) && compatibility.conflictsWithPacks.includes(pack.id)) {
      errors.push('compatibility.conflictsWithPacks cannot include the pack\'s own id');
    }
  }

  const verification = Array.isArray(pack.verification) ? pack.verification : null;
  if (!verification || verification.length === 0) {
    errors.push('verification must be a non-empty array');
  } else {
    const seen = new Set();
    verification.forEach((step, i) => {
      const label = `verification[${i}]`;
      if (!isPlainObject(step)) { errors.push(`${label}: must be an object`); return; }
      if (seen.has(step.id)) errors.push(`${label}: duplicate verification id "${step.id}"`);
      seen.add(step.id);
      if (!ID_PATTERN.test(step.id || '')) errors.push(`${label}: id must be lowercase-kebab-case`);
      if (!step.command || typeof step.command !== 'string') errors.push(`${label}: command is required`);
      if (!step.description || typeof step.description !== 'string') errors.push(`${label}: description is required`);
    });
  }

  // v1's `upgrade` ledger is gone on purpose: it was required by the contract and empty in
  // all nine packs from the day they were written, which is what a field nobody can keep
  // filling in looks like. EP-010 answers the same question by machine instead.
  if (pack.upgrade !== undefined) {
    errors.push('upgrade was removed in pack v2; staleness is detected by the evidence-freshness control (EP-010), not by a hand-written ledger');
  }

  const operationalEvidence = Array.isArray(pack.operationalEvidence) ? pack.operationalEvidence : null;
  if (!operationalEvidence || operationalEvidence.length === 0) {
    errors.push('operationalEvidence must be a non-empty array');
  } else {
    operationalEvidence.forEach((item, i) => {
      const label = `operationalEvidence[${i}]`;
      if (!isPlainObject(item)) { errors.push(`${label}: must be an object`); return; }
      if (!KNOWN_CONTROLS.has(item.control)) errors.push(`${label}: unknown control "${item.control}"`);
      if (typeof item.evidence !== 'string' || item.evidence.trim().length < 20) {
        errors.push(`${label}: evidence must be at least 20 characters`);
      }
    });
  }

  // The binding: a pack that names the reference app implementing it must actually match
  // that app. Before v2 nothing in this repository connected a pack to a single line of
  // real code, so a pack could describe a project that had never existed and still pass.
  if (options.repoRoot && typeof pack.implementedBy === 'string' && pack.implementedBy.trim() && Array.isArray(requiredArtifacts)) {
    const appRoot = path.resolve(options.repoRoot, pack.implementedBy);
    if (!fs.existsSync(appRoot)) {
      errors.push(`implementedBy: no such directory in this repository: ${pack.implementedBy}`);
    } else {
      for (const artifact of requiredArtifacts) {
        if (!artifact || typeof artifact.path !== 'string') continue;
        if (!fs.existsSync(path.resolve(appRoot, artifact.path))) {
          errors.push(`requiredArtifacts: "${artifact.path}" is asserted by this pack but does not exist in ${pack.implementedBy}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const options = { file: null, dir: null, json: false, repoRoot: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index];
    else if (arg === '--dir') options.dir = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--repo-root') options.repoRoot = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.file && !options.dir) throw new Error('--file or --dir is required');
  if (options.file && options.dir) throw new Error('--file and --dir cannot be used together');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`pack: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node claude-setup/pack.js (--file <path> | --dir <path>) [--repo-root <path>] [--json]');
    return 0;
  }

  let files;
  if (options.file) {
    files = [path.resolve(process.cwd(), options.file)];
  } else {
    const dir = path.resolve(process.cwd(), options.dir);
    if (!fs.existsSync(dir)) {
      console.error(`pack: no such directory: ${options.dir}`);
      return 2;
    }
    files = fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => path.join(dir, name));
  }

  if (!files.length) {
    console.error(`pack: no pack files found in ${options.dir}`);
    return 2;
  }

  // A directory cannot hold two files with the same name, and every pack's id must match its
  // filename, so filenames alone already guarantee id uniqueness within one --dir run.
  const results = [];
  let ok = true;
  for (const file of files) {
    const expectedId = path.basename(file, '.json');
    let pack;
    try {
      pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      results.push({ file, ok: false, errors: [`cannot read/parse: ${error.message}`] });
      ok = false;
      continue;
    }
    const result = validatePack(pack, {
      expectedId,
      repoRoot: options.repoRoot ? path.resolve(process.cwd(), options.repoRoot) : null,
    });
    if (!result.ok) ok = false;
    results.push({ file, pack, ...result });
  }

  if (options.json) {
    console.log(JSON.stringify({ ok, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.ok ? '✓' : '✗'} ${path.relative(process.cwd(), r.file)}`);
      for (const e of r.errors || []) console.log(`  - ${e}`);
    }
    console.log(
      ok
        ? `\n✓ pack: ${results.length} pack(s) valid`
        : `\n✗ pack: ${results.filter((r) => !r.ok).length}/${results.length} pack(s) failed`
    );
    if (options.repoRoot && ok) {
      // A pack without implementedBy is a recipe nobody has followed end to end. Printing the
      // count keeps that visible instead of leaving it to whoever opens the files.
      const unbound = results.filter((r) => !r.pack?.implementedBy).map((r) => r.pack?.id).filter(Boolean).sort();
      console.log(
        unbound.length
          ? `  ${results.length - unbound.length}/${results.length} bound to a reference app; unproven: ${unbound.join(', ')}`
          : `  all ${results.length} bound to a reference app`
      );
    }
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { KNOWN_CONTROLS, parseArgs, pinnedScaffolder, validatePack };
