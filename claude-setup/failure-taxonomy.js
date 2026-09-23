#!/usr/bin/env node
/**
 * failure-taxonomy — ชุดหมวดความล้มเหลวที่ตั้งอยู่บนของจริง และตัวตรวจ failure record (EV-003)
 *
 *   node claude-setup/failure-taxonomy.js --list
 *   node claude-setup/failure-taxonomy.js --file docs/evidence/failures/F-001.json
 *   node claude-setup/failure-taxonomy.js --dir docs/evidence/failures --json
 *
 * ทำไมต้องมี: "จัดหมวดความล้มเหลว" เป็นงานที่ลอกจากตำรามาได้ง่ายมาก และได้ taxonomy ที่สวย
 * แต่ไม่มีใครใช้ ไฟล์นี้จึงบังคับกติกาเดียว: **ทุกหมวดต้องชี้ไปที่ความล้มเหลวที่เกิดขึ้นจริง
 * ในเรพนี้ พร้อมที่อยู่ที่ตรวจได้** หมวดที่ไม่มีของจริงรองรับ ไม่ควรมีอยู่
 *
 * ผลข้างเคียงที่ตั้งใจ: ช่องว่างของ corpus มองเห็นได้ทันที — ดู note เรื่อง operations ท้ายไฟล์
 *
 * exit 0 = ผ่าน | exit 1 = มี record ที่ไม่ผ่าน | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// แต่ละหมวดมี observedIn เสมอ: อะไรเกิดขึ้น, ที่ไหน, และอะไรคือสิ่งที่จับมันได้ (หรือไม่มีอะไรจับ)
// detectedBy คือคอลัมน์ที่มีค่าที่สุด เพราะมันบอกว่า gate ไหนคุ้มค่า และช่องไหนยังว่าง
const CLASSES = Object.freeze({
  'spec-gap': {
    summary: 'A contract does not describe the thing it is supposed to govern, so nothing can be wrong against it.',
    observedIn: {
      what: "pack v1's generatedArtifacts described files a generator would write, while no generator existed or was planned, so the field could never be checked against anything",
      where: 'D-010, D-011, PP-010',
      detectedBy: 'human review of the contract, not by any check',
    },
  },
  'contract-drift': {
    summary: 'Two artifacts that are supposed to agree have stopped agreeing, and nothing compares them.',
    observedIn: {
      what: 'the nextjs-postgres pack asserted .claude/stack.json, a file its own reference app has never contained',
      where: 'PP-010, packs/nextjs-postgres.json',
      detectedBy: 'the pack-to-reference-app binding check, on its first run',
    },
  },
  'implementation-defect': {
    summary: 'Code compiles, types check and reviews clean, and still does the wrong thing at runtime.',
    observedIn: {
      what: 'a sync triggered right after a local mutation read a stale state snapshot and silently overwrote the edit that had just been made — real data loss',
      where: 'PP-005, D-009, reference-apps/expo-fastapi-postgres-sync/mobile/src/hooks/useTasks.ts',
      detectedBy: 'end-to-end tests failing, after two wrong fixes',
    },
  },
  'integration-mismatch': {
    summary: 'Every piece is correct on its own and wrong once assembled, usually at a platform or module boundary.',
    observedIn: {
      what: "a runtime Platform.OS branch still pulled expo-sqlite's WASM worker into the web bundle statically and broke it; the fix was Metro's platform-extension convention instead",
      where: 'PP-005, reference-apps/expo-fastapi-postgres-sync/mobile/src/storage/',
      detectedBy: 'the web build failing',
    },
  },
  'supply-chain-finding': {
    summary: 'A dependency the project never chose directly brings a vulnerability or a licence problem with it.',
    observedIn: {
      what: "10 moderate findings in the mobile production tree, all one transitive uuid advisory arriving through Expo's own iOS tooling chain; fixed with a targeted overrides pin",
      where: 'PP-005, D-009',
      detectedBy: 'the dependency audit required by the R3 dependency-scan control',
    },
  },
  'toolchain-failure': {
    summary: 'The build, CI or tooling fails for reasons that have nothing to do with the code being built.',
    observedIn: {
      what: "android-actions/setup-android@v3's own default packages input requests a legacy 'tools' SDK package Google removed from its repository years ago",
      where: 'D-009, .github/workflows/ci-expo-fastapi-postgres-sync.yml',
      detectedBy: 'the first real CI run of that workflow',
    },
  },
  'verification-gap': {
    summary: 'The check that should have caught a class of problem does not exist, or exists and never runs.',
    observedIn: {
      what: 'scripts/check-repository.js already validated roadmap state, artifact contracts, adapter drift and the full suite, and no workflow ran it; separately, command evidence in every readiness manifest was never re-executed by anything',
      where: 'BF-008, BC-006, D-011',
      detectedBy: 'a direction review reading the repository rather than its documentation',
    },
  },
  'evidence-defect': {
    summary: 'The evidence itself is missing, empty, stale or destroyed, so a true claim becomes unprovable.',
    observedIn: {
      what: "running the verifier with --execute re-ran a Playwright suite that rewrote evidence/playwright-report.json in place, replacing 238 lines of real R3 evidence with a failed partial run — the verifier destroyed what it was verifying",
      where: 'commit f23ca76, claude-setup/verifier.js',
      detectedBy: 'git status, after the fact',
    },
  },
  'guidance-defect': {
    summary: 'Instructions are followable and would lead the next implementer somewhere worse than where the last one got to.',
    observedIn: {
      what: 'the auth-rbac recipe installed iron-session and bcrypt, while the only app implementing that capability deliberately uses neither — it signs sessions with node:crypto HMAC and hashes with scrypt, adding no third-party auth dependency at all',
      where: 'PP-011, packs/auth-rbac.json',
      detectedBy: 'binding the pack to the reference app that implements it',
    },
  },
});

// เจตนา ไม่ใช่ความลืม: ไม่มีหมวด operations-failure เพราะเรพนี้ยังไม่เคยรันอะไรใน production
// ช่องว่างนี้คือข้อมูล ไม่ใช่ข้อบกพร่องของ taxonomy — และมันจะถูกเติมได้ก็ต่อเมื่อ EV-009 เกิดขึ้น
const KNOWN_GAPS = Object.freeze([
  {
    missing: 'operations-failure',
    reason: 'Nothing in this repository has ever run in production, so there is no real incident to ground such a class in. Adding it from a category list would be exactly the copied-taxonomy failure this file exists to avoid.',
    unlockedBy: 'EV-009',
  },
]);

const CLASS_IDS = Object.freeze(Object.keys(CLASSES));
const SEVERITIES = new Set(['low', 'medium', 'high']);
const ID_PATTERN = /^F-\d{3,}$/;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateFailureRecord(record, options = {}) {
  const errors = [];
  if (!isPlainObject(record)) return { ok: false, errors: ['failure record must be a JSON object'] };

  if (record.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${record.schemaVersion}"`);
  if (!ID_PATTERN.test(record.id || '')) errors.push('id must look like F-001');
  if (options.expectedId && record.id !== options.expectedId) {
    errors.push(`id "${record.id}" does not match filename "${options.expectedId}.json"`);
  }

  // The rule the whole file exists for: a record cannot name a class that does not exist.
  if (!CLASS_IDS.includes(record.class)) {
    errors.push(`unknown class "${record.class}"; known classes: ${CLASS_IDS.join(', ')}`);
  }

  if (typeof record.summary !== 'string' || record.summary.trim().length < 20) {
    errors.push('summary must be at least 20 characters');
  }
  if (typeof record.where !== 'string' || !record.where.trim()) {
    errors.push('where must name a file, commit, decision or work item');
  }
  if (typeof record.detectedBy !== 'string' || !record.detectedBy.trim()) {
    errors.push('detectedBy is required — "nothing caught it" is a valid and useful answer');
  }
  if (!SEVERITIES.has(record.severity)) {
    errors.push(`severity must be one of ${[...SEVERITIES].join(', ')}`);
  }
  if (record.escaped !== undefined && typeof record.escaped !== 'boolean') {
    errors.push('escaped must be a boolean when present');
  }
  if (record.preventedNextTimeBy !== undefined) {
    if (typeof record.preventedNextTimeBy !== 'string' || !record.preventedNextTimeBy.trim()) {
      errors.push('preventedNextTimeBy must be a non-empty string when present');
    }
  }

  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const options = { file: null, dir: null, json: false, list: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index];
    else if (arg === '--dir') options.dir = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.list && !options.file && !options.dir) {
    throw new Error('--list, --file or --dir is required');
  }
  if (options.file && options.dir) throw new Error('--file and --dir cannot be used together');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`failure-taxonomy: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node claude-setup/failure-taxonomy.js (--list | --file <path> | --dir <path>) [--json]');
    return 0;
  }

  if (options.list) {
    if (options.json) {
      console.log(JSON.stringify({ classes: CLASSES, knownGaps: KNOWN_GAPS }, null, 2));
    } else {
      for (const [id, entry] of Object.entries(CLASSES)) {
        console.log(`${id}`);
        console.log(`  ${entry.summary}`);
        console.log(`  seen: ${entry.observedIn.what}`);
        console.log(`  where: ${entry.observedIn.where}`);
        console.log(`  caught by: ${entry.observedIn.detectedBy}`);
        console.log('');
      }
      for (const gap of KNOWN_GAPS) {
        console.log(`no class for "${gap.missing}" — ${gap.reason} (unlocked by ${gap.unlockedBy})`);
      }
    }
    return 0;
  }

  let files;
  if (options.file) {
    files = [path.resolve(process.cwd(), options.file)];
  } else {
    const dir = path.resolve(process.cwd(), options.dir);
    if (!fs.existsSync(dir)) {
      console.error(`failure-taxonomy: no such directory: ${options.dir}`);
      return 2;
    }
    files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(dir, name));
  }
  if (!files.length) {
    console.error('failure-taxonomy: no failure records found');
    return 2;
  }

  const results = [];
  let ok = true;
  for (const file of files) {
    const expectedId = path.basename(file, '.json');
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      results.push({ file, ok: false, errors: [`cannot read/parse: ${error.message}`] });
      ok = false;
      continue;
    }
    const result = validateFailureRecord(record, { expectedId });
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
    console.log(ok ? `\n✓ failure-taxonomy: ${results.length} record(s) valid` : `\n✗ failure-taxonomy: ${results.filter((r) => !r.ok).length}/${results.length} record(s) failed`);
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { CLASSES, CLASS_IDS, KNOWN_GAPS, SEVERITIES, parseArgs, validateFailureRecord };
