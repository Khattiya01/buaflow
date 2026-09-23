#!/usr/bin/env node
/**
 * application-profile — ตรวจ Application Profile (PP-001) ตาม schemas/application-profile.schema.json
 *
 *   node claude-setup/application-profile.js --file .claude/profiles/saas.json
 *   node claude-setup/application-profile.js --dir .claude/profiles
 *   node claude-setup/application-profile.js --dir .claude/profiles --json
 *
 * ทำไมต้องมี: profile ต้องเปลี่ยน required controls, architecture choices และ clarification
 * questions จริง ไม่ใช่แค่บอกด้วยปาก — ไฟล์นี้บังคับว่าแต่ละหมวดต้องมีอย่างน้อย 1 รายการ,
 * control ที่อ้างต้องมีจริงใน readiness.js (CONTROLS_BY_LEVEL), และ "not-applicable" ใช้ได้เฉพาะ
 * control ที่ conditional เท่านั้น — ผูกกับ standards/deployment-ready-contract.md โดยตรง
 *
 * exit 0 = ผ่าน | exit 1 = มี profile ที่ไม่ผ่าน หรือ id ซ้ำข้าม profile
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CONTROLS_BY_LEVEL, CONDITIONAL } = require('./readiness.js');

const KNOWN_CONTROLS = new Set(Object.values(CONTROLS_BY_LEVEL).flat());
const AFFECTS = new Set(['architecture', 'security', 'cost', 'compliance', 'ux']);
const ID_PATTERN = /^[a-z][a-z0-9-]+$/;
const KNOWN_MINORS = new Set(['1.0', '1.1']);

function validateProfile(profile, options = {}) {
  const errors = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { ok: false, errors: ['profile must be a JSON object'] };
  }
  // 1.0 stays readable inside the same major: it simply declares no budgets. A NEWER minor is
  // refused, per standards/artifact-versioning.md, so a validator that does not know the latest
  // fields cannot report a profile as fine while ignoring what they require.
  if (!KNOWN_MINORS.has(profile.schemaVersion)) errors.push(`unsupported schemaVersion "${profile.schemaVersion}"`);
  if (!ID_PATTERN.test(profile.id || '')) errors.push('id must be lowercase-kebab-case');
  if (options.expectedId && profile.id !== options.expectedId) {
    errors.push(`id "${profile.id}" does not match filename "${options.expectedId}.json"`);
  }
  if (typeof profile.name !== 'string' || !profile.name.trim()) errors.push('name must be a non-empty string');

  const controls = Array.isArray(profile.controls) ? profile.controls : null;
  if (!controls || controls.length === 0) {
    errors.push('controls must be a non-empty array');
  } else {
    const seen = new Set();
    controls.forEach((c, i) => {
      const label = `controls[${i}]`;
      if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${label}: must be an object`); return; }
      if (seen.has(c.control)) errors.push(`${label}: duplicate control "${c.control}"`);
      seen.add(c.control);
      if (!KNOWN_CONTROLS.has(c.control)) errors.push(`${label}: unknown control "${c.control}"`);
      if (!['required', 'not-applicable'].includes(c.requirement)) {
        errors.push(`${label}: requirement must be "required" or "not-applicable"`);
      } else if (c.requirement === 'not-applicable' && !CONDITIONAL.has(c.control)) {
        errors.push(`${label}: "${c.control}" is not a conditional control — only "required" is allowed`);
      }
      if (typeof c.rationale !== 'string' || c.rationale.trim().length < 20) {
        errors.push(`${label}: rationale must be at least 20 characters`);
      }
    });
  }

  const architectureChoices = Array.isArray(profile.architectureChoices) ? profile.architectureChoices : null;
  if (!architectureChoices || architectureChoices.length === 0) {
    errors.push('architectureChoices must be a non-empty array');
  } else {
    architectureChoices.forEach((a, i) => {
      const label = `architectureChoices[${i}]`;
      if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(`${label}: must be an object`); return; }
      if (!a.area || typeof a.area !== 'string') errors.push(`${label}: area is required`);
      if (!a.choice || typeof a.choice !== 'string') errors.push(`${label}: choice is required`);
      if (!a.rationale || typeof a.rationale !== 'string') errors.push(`${label}: rationale is required`);
    });
  }

  const questions = Array.isArray(profile.clarificationQuestions) ? profile.clarificationQuestions : null;
  if (!questions || questions.length === 0) {
    errors.push('clarificationQuestions must be a non-empty array');
  } else {
    const seen = new Set();
    questions.forEach((q, i) => {
      const label = `clarificationQuestions[${i}]`;
      if (!q || typeof q !== 'object' || Array.isArray(q)) { errors.push(`${label}: must be an object`); return; }
      if (seen.has(q.id)) errors.push(`${label}: duplicate question id "${q.id}"`);
      seen.add(q.id);
      if (!ID_PATTERN.test(q.id || '')) errors.push(`${label}: id must be lowercase-kebab-case`);
      if (!q.prompt || typeof q.prompt !== 'string') errors.push(`${label}: prompt is required`);
      if (!q.whyItMatters || typeof q.whyItMatters !== 'string') errors.push(`${label}: whyItMatters is required`);
      if (!Array.isArray(q.affects) || q.affects.length === 0) {
        errors.push(`${label}: affects must be a non-empty array`);
      } else {
        for (const value of q.affects) if (!AFFECTS.has(value)) errors.push(`${label}: unknown affects value "${value}"`);
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
    console.error(`application-profile: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node claude-setup/application-profile.js (--file <path> | --dir <path>) [--json]');
    return 0;
  }

  let files;
  if (options.file) {
    files = [path.resolve(process.cwd(), options.file)];
  } else {
    const dir = path.resolve(process.cwd(), options.dir);
    if (!fs.existsSync(dir)) {
      console.error(`application-profile: no such directory: ${options.dir}`);
      return 2;
    }
    files = fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => path.join(dir, name));
  }

  if (!files.length) {
    console.error(`application-profile: no profile files found in ${options.dir}`);
    return 2;
  }

  // A directory cannot hold two files with the same name, and every profile's id must match
  // its filename, so filenames alone already guarantee id uniqueness within one --dir run.
  const results = [];
  let ok = true;
  for (const file of files) {
    const expectedId = path.basename(file, '.json');
    let profile;
    try {
      profile = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      results.push({ file, ok: false, errors: [`cannot read/parse: ${error.message}`] });
      ok = false;
      continue;
    }
    const result = validateProfile(profile, { expectedId });
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
        ? `\n✓ application-profile: ${results.length} profile(s) valid`
        : `\n✗ application-profile: ${results.filter((r) => !r.ok).length}/${results.length} profile(s) failed`
    );
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { AFFECTS, KNOWN_CONTROLS, parseArgs, validateProfile };
