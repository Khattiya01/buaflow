#!/usr/bin/env node
/**
 * pack-composition — checks whether a SET of packs can be installed together (PP-007)
 *
 *   node claude-setup/pack-composition.js --dir .claude/packs
 *   node claude-setup/pack-composition.js --dir .claude/packs --ids nextjs-postgres,auth-rbac,storage
 *   node claude-setup/pack-composition.js --dir .claude/packs --json
 *
 * ทำไมต้องมี: pack.js ตรวจ pack ทีละไฟล์ว่า "ตัวมันเองถูกต้องไหม" แต่ไม่เคยตอบว่า "ติดตั้งพร้อมกัน
 * ได้จริงไหม" — ไฟล์นี้เติมส่วนที่ขาด: หา requiresPacks ที่หายไปจากชุดที่จะติดตั้ง, หา
 * conflictsWithPacks ที่ทั้งสองฝั่งอยู่ในชุดเดียวกันจริง, และหา generatedArtifacts path ที่สอง pack
 * เขียนทับกัน (ซึ่งเป็น conflict โดยพฤตินัยแม้ไม่มีใครประกาศไว้) — เป็น convergence check ขั้นต้น
 * ของ M2 ("Repeatable Web Production")
 *
 * exit 0 = ชุดนี้ประกอบกันได้ | exit 1 = มี dependency หาย, conflict, หรือ path ชนกัน
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validatePack } = require('./pack.js');

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

  // A path two different packs both generate would silently overwrite one or the other at
  // install time — that is a real conflict whether or not either pack declared it.
  const ownerOfPath = new Map();
  for (const pack of packs) {
    for (const artifact of pack.generatedArtifacts) {
      const existingOwner = ownerOfPath.get(artifact.path);
      if (existingOwner && existingOwner !== pack.id) {
        errors.push(`generatedArtifacts path "${artifact.path}" is written by both "${existingOwner}" and "${pack.id}"`);
      } else {
        ownerOfPath.set(artifact.path, pack.id);
      }
    }
  }

  return { ok: errors.length === 0, errors, packIds: packs.map((p) => p.id) };
}

function parseArgs(argv) {
  const options = { dir: null, ids: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dir') options.dir = argv[++index];
    else if (arg === '--ids') options.ids = argv[++index].split(',').map((s) => s.trim()).filter(Boolean);
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
    console.log('Usage: node claude-setup/pack-composition.js --dir <path> [--ids id1,id2,...] [--json]');
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

  const result = validateComposition(packs);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Composing: ${result.packIds.join(', ')}`);
    for (const e of result.errors) console.log(`  - ${e}`);
    console.log(
      result.ok
        ? `\n✓ pack-composition: ${result.packIds.length} pack(s) compose without conflict`
        : `\n✗ pack-composition: ${result.errors.length} problem(s)`
    );
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { loadPacks, parseArgs, validateComposition };
