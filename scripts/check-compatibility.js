#!/usr/bin/env node
'use strict';

/**
 * check-compatibility — บังคับให้ support matrix ตรงกับความจริง (EV-007)
 *
 * ทำไมต้องมี: release policy ที่เป็นเอกสารอย่างเดียวจะคลาดจากของจริงตั้งแต่รีลีสที่สอง
 * ไฟล์นี้ทำให้ schemas/compatibility.json โกหกไม่ได้ — เลขใน package.json, artifact type
 * ที่ registry ประกาศ และเวอร์ชัน schema ล่าสุด ต้องตรงกันทั้งสามทาง
 *
 * ตรรกะทั้งหมดเป็นฟังก์ชันบริสุทธิ์ (checkCompatibility) ส่วน CLI แค่อ่านไฟล์แล้วเรียกมัน
 * เพื่อให้เทสต์ป้อนเคสที่ "ไม่ตรงกัน" ได้จริง แทนที่จะยืนยันข้อเท็จจริงกับตัวเองไปวัน ๆ
 *
 * exit 0 = ตรง | exit 1 = ไม่ตรง
 */

const fs = require('node:fs');
const path = require('node:path');

const MIN_NOTICE_DAYS = 90;
const DAY_MS = 86400000;

function compareSemver(a, b) {
  const [x, y] = [a, b].map((v) => String(v).split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function checkCompatibility({ matrix, registry, pkg, upgradeDoc }) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (matrix?.schemaVersion !== '1.0') fail(`unsupported schemaVersion ${matrix?.schemaVersion}`);
  const releases = Array.isArray(matrix?.releases) ? matrix.releases : [];
  if (releases.length === 0) {
    fail('releases must not be empty');
    return { ok: false, errors };
  }

  const seen = new Set();
  for (const [index, release] of releases.entries()) {
    const label = release?.version || `releases[${index}]`;
    if (!/^\d+\.\d+\.\d+$/.test(release?.version || '')) fail(`${label}: version must be MAJOR.MINOR.PATCH`);
    if (seen.has(release?.version)) fail(`${label}: duplicate release`);
    seen.add(release?.version);
    if (!['major', 'minor', 'patch'].includes(release?.change)) fail(`${label}: change must be major, minor or patch`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release?.releasedAt || '')) fail(`${label}: releasedAt must be YYYY-MM-DD`);
    if (index > 0 && compareSemver(releases[index - 1].version, release.version) <= 0) {
      fail(`${label}: releases must be listed newest first`);
    }
    // A major with no stated reason is indistinguishable from a mistake, and an adopter
    // reading the matrix has nothing to act on.
    if (release?.change === 'major' && (release.summary || '').length < 80) {
      fail(`${label}: a major release must state what an adopter has to do`);
    }
    if (release?.change === 'major' && typeof upgradeDoc === 'string' && !upgradeDoc.includes(`→ v${release.version}`)) {
      fail(`${label}: no upgrade path in UPGRADE.md; a major without one pushes the work onto the user`);
    }
  }

  // The newest entry is the release this checkout IS, so package.json must agree with it.
  // Without this the matrix quietly becomes a document about some other version of the kit.
  const newest = releases[0];
  if (pkg?.version !== newest?.version) {
    fail(`package.json version ${pkg?.version} does not match the newest release ${newest?.version} in the matrix`);
  }

  // Every public artifact type the registry declares must appear, at its current version.
  // A type added or bumped without touching the matrix is exactly the drift this catches.
  const publicTypes = (registry?.artifacts || []).filter((a) => a.classification === 'public');
  for (const artifact of publicTypes) {
    const supported = newest?.reads?.[artifact.type];
    if (!supported) {
      fail(`${artifact.type}: registered as public but missing from the ${newest?.version} support matrix`);
      continue;
    }
    if (!supported.includes(artifact.latestVersion)) {
      fail(`${artifact.type}: registry says latest is ${artifact.latestVersion}, which ${newest.version} does not claim to read (${supported.join(', ')})`);
    }
  }
  for (const type of Object.keys(newest?.reads || {})) {
    if (!publicTypes.some((a) => a.type === type)) {
      fail(`${type}: listed in the support matrix but not a public type in the schema registry`);
    }
  }

  // A deprecation that cannot be acted on is not a deprecation.
  for (const [index, item] of (matrix?.deprecations || []).entries()) {
    const label = item?.what || `deprecations[${index}]`;
    for (const field of ['what', 'announcedIn', 'removedNoEarlierThan', 'replacement']) {
      if (!item?.[field]) fail(`${label}: missing ${field}`);
    }
    if (item?.announcedIn && !seen.has(item.announcedIn)) fail(`${label}: announcedIn ${item.announcedIn} is not a release in this matrix`);
    if (item?.removedIn && !seen.has(item.removedIn)) fail(`${label}: removedIn ${item.removedIn} is not a release in this matrix`);
    // The notice period is the promise. Shortening it is allowed and must be argued for in a
    // note, so a reader can tell a considered exception from an accident.
    if (item?.announcedAt && item?.removedNoEarlierThan) {
      const days = Math.round((Date.parse(item.removedNoEarlierThan) - Date.parse(item.announcedAt)) / DAY_MS);
      if (days < MIN_NOTICE_DAYS && !item.note) {
        fail(`${label}: ${days} day(s) of notice is under the ${MIN_NOTICE_DAYS}-day minimum and carries no note explaining why`);
      }
    }
  }

  return { ok: errors.length === 0, errors, kitVersion: newest?.version, artifactTypes: publicTypes.length };
}

function main() {
  const root = path.resolve(__dirname, '..');
  const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  let inputs;
  try {
    inputs = {
      matrix: readJson('schemas/compatibility.json'),
      registry: readJson('schemas/registry.json'),
      pkg: readJson('package.json'),
      upgradeDoc: fs.readFileSync(path.join(root, 'UPGRADE.md'), 'utf8'),
    };
  } catch (error) {
    console.error(`compatibility: cannot read inputs: ${error.message}`);
    return 1;
  }

  const result = checkCompatibility(inputs);
  if (!result.ok) {
    console.error(`compatibility: FAIL (${result.errors.length})`);
    for (const problem of result.errors) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(
    `compatibility: PASS (kit ${result.kitVersion}, ${result.artifactTypes} artifact types, `
    + `${(inputs.matrix.deprecations || []).length} deprecation(s))`
  );
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { MIN_NOTICE_DAYS, checkCompatibility, compareSemver };
