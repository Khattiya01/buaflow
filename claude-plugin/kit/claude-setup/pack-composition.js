#!/usr/bin/env node
/**
 * pack-composition — checks whether a SET of packs can be installed together, and optionally
 * against one application profile (PP-007, extended for M2's "convergence checks")
 *
 *   node claude-setup/pack-composition.js --dir .claude/packs
 *   node claude-setup/pack-composition.js --dir .claude/packs --ids nextjs-postgres,auth-rbac,storage
 *   node claude-setup/pack-composition.js --dir .claude/packs --ids content,auth-rbac --profile .claude/profiles/content.json
 *   node claude-setup/pack-composition.js --dir .claude/packs --json
 *
 * ทำไมต้องมี: pack.js ตรวจ pack ทีละไฟล์ว่า "ตัวมันเองถูกต้องไหม" แต่ไม่เคยตอบว่า "ติดตั้งพร้อมกัน
 * ได้จริงไหม" — ไฟล์นี้เติมส่วนที่ขาด: หา requiresPacks ที่หายไปจากชุดที่จะติดตั้ง, หา
 * conflictsWithPacks ที่ทั้งสองฝั่งอยู่ในชุดเดียวกันจริง, และหา requiredArtifacts path ที่สอง pack
 * เขียนทับกัน (ซึ่งเป็น conflict โดยพฤตินัยแม้ไม่มีใครประกาศไว้)
 *
 * --profile (เพิ่มภายหลัง) เติม convergence check อีกชั้น: application profile (PP-001) ประกาศ
 * ว่า control ไหน "not-applicable" พร้อมเหตุผล แต่ถ้า pack ที่เลือกไว้ใน --ids ดันประกาศ
 * operationalEvidence สำหรับ control เดียวกันนั้นจริง (เช่น profile บอกว่า access-control
 * not-applicable แต่ชุด pack มี auth-rbac ซึ่งทำหน้าที่พิสูจน์ access-control โดยตรง) แปลว่า
 * profile กับชุด pack ที่เลือกขัดแย้งกันเอง — เป็นสัญญาณว่า "not-applicable" นั้นไม่จริงอีกต่อไป
 * เป็น convergence check ที่ทำได้ตอนนี้โดยไม่ต้องมี BC-001..003 (agent I/O contract, work
 * isolation, scheduler) ก่อน เพราะอ่านแค่ contract ของ artifact สองชนิดที่มีอยู่แล้ว (PP-001, PP-002)
 *
 * exit 0 = ชุดนี้ประกอบกันได้ (และไม่ขัดกับ profile ถ้าระบุ) | exit 1 = มี dependency หาย, conflict,
 * path ชนกัน, หรือ profile/pack ขัดแย้งกัน
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validatePack } = require('./pack.js');
const { validateProfile } = require('./application-profile.js');

function loadPacks(dir, ids) {
  const files = ids
    ? ids.map((id) => `${id}.json`)
    : fs.readdirSync(dir).filter((name) => name.endsWith('.json'));

  const packs = [];
  const errors = [];
  for (const file of files.sort()) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      errors.push(`no such pack file: ${file}`);
      continue;
    }
    let pack;
    try {
      pack = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (error) {
      errors.push(`${file}: cannot read/parse: ${error.message}`);
      continue;
    }
    const expectedId = path.basename(file, '.json');
    const result = validatePack(pack, { expectedId });
    if (!result.ok) {
      errors.push(`${file}: fails its own pack contract — ${result.errors.join('; ')}`);
      continue;
    }
    packs.push(pack);
  }
  return { packs, errors };
}

function validateComposition(packs) {
  const errors = [];
  const warnings = [];
  const byId = new Map(packs.map((p) => [p.id, p]));

  for (const pack of packs) {
    for (const requiredId of pack.compatibility.requiresPacks) {
      if (!byId.has(requiredId)) {
        errors.push(`${pack.id}: requires "${requiredId}", which is not in this set`);
      }
    }
    for (const conflictId of pack.compatibility.conflictsWithPacks) {
      if (byId.has(conflictId)) {
        errors.push(`${pack.id}: conflicts with "${conflictId}", which is also in this set`);
      }
    }
  }

  // Overlapping paths are a warning in v2, not an error, and the demotion is deliberate.
  // Under v1 a pack claimed to GENERATE its artifacts, so two packs naming the same path
  // meant one would silently overwrite the other at install time — a real defect. v2
  // artifacts are assertions that a file EXISTS when the work is done, and two packs
  // asserting the same file are usually both simply right: auth-rbac and audit-log both
  // need prisma/migrations/ to exist, and neither is overwriting anything. What survives
  // is the genuine question underneath — if both recipes touch the same file, which one
  // decides its contents — which is worth surfacing and not worth failing a legitimate
  // composition over.
  const claimants = new Map();
  for (const pack of packs) {
    for (const artifact of pack.requiredArtifacts) {
      if (!claimants.has(artifact.path)) claimants.set(artifact.path, new Set());
      claimants.get(artifact.path).add(pack.id);
    }
  }
  for (const [artifactPath, owners] of claimants) {
    if (owners.size > 1) {
      warnings.push(
        `"${artifactPath}" is asserted by ${[...owners].sort().map((id) => `"${id}"`).join(' and ')} — `
        + 'check which recipe determines its contents'
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, packIds: packs.map((p) => p.id) };
}

function loadProfile(file) {
  if (!fs.existsSync(file)) return { errors: [`no such profile file: ${file}`] };
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { errors: [`${file}: cannot read/parse: ${error.message}`] };
  }
  const expectedId = path.basename(file, '.json');
  const result = validateProfile(profile, { expectedId });
  if (!result.ok) return { errors: [`${file}: fails its own application-profile contract — ${result.errors.join('; ')}`] };
  return { profile };
}

// A profile marking a control "not-applicable" is a claim that the capability genuinely does not
// exist in this application. If a pack in the same composed set produces operationalEvidence for
// that exact control, the pack is proof the capability DOES exist, so the two artifacts disagree.
function validateProfileFit(profile, packs) {
  const errors = [];
  const notApplicable = (profile.controls || []).filter((c) => c.requirement === 'not-applicable');
  for (const override of notApplicable) {
    for (const pack of packs) {
      const evidence = pack.operationalEvidence.find((item) => item.control === override.control);
      if (evidence) {
        errors.push(
          `profile "${profile.id}" marks "${override.control}" as not-applicable, but pack "${pack.id}" `
          + `declares operationalEvidence for it — the profile and the chosen pack set disagree`
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const options = { dir: null, ids: null, profile: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dir') options.dir = argv[++index];
    else if (arg === '--ids') options.ids = argv[++index].split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--profile') options.profile = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.dir) throw new Error('--dir is required');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`pack-composition: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log(
      'Usage: node claude-setup/pack-composition.js --dir <path> [--ids id1,id2,...] '
      + '[--profile <path>] [--json]'
    );
    return 0;
  }

  const dir = path.resolve(process.cwd(), options.dir);
  if (!fs.existsSync(dir)) {
    console.error(`pack-composition: no such directory: ${options.dir}`);
    return 2;
  }

  const { packs, errors: loadErrors } = loadPacks(dir, options.ids);
  if (loadErrors.length) {
    if (options.json) console.log(JSON.stringify({ ok: false, errors: loadErrors }, null, 2));
    else for (const e of loadErrors) console.error(`✗ ${e}`);
    return 2;
  }

  let profile = null;
  if (options.profile) {
    const profileFile = path.resolve(process.cwd(), options.profile);
    const loaded = loadProfile(profileFile);
    if (loaded.errors) {
      if (options.json) console.log(JSON.stringify({ ok: false, errors: loaded.errors }, null, 2));
      else for (const e of loaded.errors) console.error(`✗ ${e}`);
      return 2;
    }
    profile = loaded.profile;
  }

  const result = validateComposition(packs);
  const profileFit = profile ? validateProfileFit(profile, packs) : { ok: true, errors: [] };
  const errors = [...result.errors, ...profileFit.errors];
  const ok = result.ok && profileFit.ok;

  if (options.json) {
    console.log(JSON.stringify({ ok, errors, warnings: result.warnings, packIds: result.packIds, profile: profile?.id || null }, null, 2));
  } else {
    console.log(`Composing: ${result.packIds.join(', ')}${profile ? ` against profile "${profile.id}"` : ''}`);
    for (const w of result.warnings) console.log(`  warn: ${w}`);
    for (const e of errors) console.log(`  - ${e}`);
    console.log(
      ok
        ? `\n✓ pack-composition: ${result.packIds.length} pack(s) compose without conflict`
        : `\n✗ pack-composition: ${errors.length} problem(s)`
    );
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { loadPacks, loadProfile, parseArgs, validateComposition, validateProfileFit };
