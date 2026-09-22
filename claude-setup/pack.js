#!/usr/bin/env node
/**
 * pack — ตรวจ Stack/Capability Pack (PP-002) ตาม schemas/pack.schema.json
 *
 *   node claude-setup/pack.js --file .claude/packs/nextjs-postgres.json
 *   node claude-setup/pack.js --dir .claude/packs
 *   node claude-setup/pack.js --dir .claude/packs --json
 *
 * ทำไมต้องมี: pack ต้องพิสูจน์ตัวเองแบบ deterministic — สร้างอะไรจริง (generatedArtifacts),
 * รันแล้วผ่าน/ไม่ผ่านชัดเจน (verification), และช่วย readiness control ไหนได้จริง (operationalEvidence,
 * cross-check กับ claude-setup/readiness.js) ไม่ใช่แค่คำโฆษณาใน description
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

function validatePack(pack, options = {}) {
  const errors = [];
  if (!isPlainObject(pack)) return { ok: false, errors: ['pack must be a JSON object'] };

  if (pack.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${pack.schemaVersion}"`);
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

  const generatedArtifacts = Array.isArray(pack.generatedArtifacts) ? pack.generatedArtifacts : null;
  if (!generatedArtifacts || generatedArtifacts.length === 0) {
    errors.push('generatedArtifacts must be a non-empty array');
  } else {
    generatedArtifacts.forEach((artifact, i) => {
      const label = `generatedArtifacts[${i}]`;
      if (!isPlainObject(artifact)) { errors.push(`${label}: must be an object`); return; }
      if (!artifact.path || typeof artifact.path !== 'string') errors.push(`${label}: path is required`);
      else if (path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..')) {
        errors.push(`${label}: path must be relative and stay inside the generated project`);
      }
      if (!artifact.description || typeof artifact.description !== 'string') errors.push(`${label}: description is required`);
    });
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

  const upgrade = Array.isArray(pack.upgrade) ? pack.upgrade : null;
  if (!upgrade) {
    errors.push('upgrade must be an array');
  } else {
    upgrade.forEach((step, i) => {
      const label = `upgrade[${i}]`;
      if (!isPlainObject(step)) { errors.push(`${label}: must be an object`); return; }
      if (!SEMVER_PATTERN.test(step.from || '')) errors.push(`${label}: from must be a full semver string`);
      if (!SEMVER_PATTERN.test(step.to || '')) errors.push(`${label}: to must be a full semver string`);
      if (step.from === step.to) errors.push(`${label}: from and to must differ`);
      if (typeof step.breaking !== 'boolean') errors.push(`${label}: breaking must be a boolean`);
      if (!Array.isArray(step.steps) || step.steps.length === 0) errors.push(`${label}: steps must be a non-empty array`);
    });
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

  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const options = { file: null, dir: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index];
    else if (arg === '--dir') options.dir = argv[++index];
    else if (arg === '--json') options.json = true;
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
    console.log('Usage: node claude-setup/pack.js (--file <path> | --dir <path>) [--json]');
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
    const result = validatePack(pack, { expectedId });
    if (!result.ok) ok = false;
    results.push({ file, ...result });
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
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { KNOWN_CONTROLS, parseArgs, validatePack };
