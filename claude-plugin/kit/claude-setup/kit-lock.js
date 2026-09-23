#!/usr/bin/env node
/**
 * kit-lock.js — which Buaflow version a project installed, and which installed files changed since (PE-002)
 *
 *   node buaflow/claude-setup/kit-lock.js --root . --write     record .buaflow/lock.json
 *   node buaflow/claude-setup/kit-lock.js --root .             compare the installed files with the lock and the kit
 *   buaflow lock [--write]
 *
 * ทำไมต้องมี: Phase 7 คัดลอก claude-setup/ ไปเป็น .claude/ แล้วไม่มีอะไรจำว่าคัดลอกจากเวอร์ชันไหน · trial แรก
 * มี .claude/check-config.js เก่ากว่า kit อยู่หลายรุ่น (มันอ่าน stack.json ไม่ได้เมื่อ root เป็น relative — K-13)
 * และมี guard-bash.js ที่ทีมแก้เองโดยตั้งใจ · สองอย่างนี้ต่างกันมาก แต่มองจากไฟล์แล้วเหมือนกันทุกประการ: "ไม่ตรงกับ kit"
 *
 * lock บันทึก sha256 ของทุกไฟล์ที่ติดตั้งจาก kit ตอนติดตั้ง/ยอมรับ ⇒ แยกได้สี่สถานะ:
 *   current       ตรงกับ kit ตอนนี้
 *   outdated      ตรงกับตอนติดตั้ง แต่ kit เปลี่ยนแล้ว → อัปเกรดได้โดยไม่เสียอะไร
 *   customized    ถูกแก้หลังติดตั้ง และ lock รับรู้แล้ว (--write หลังแก้) → ตั้งใจ
 *   drifted       ถูกแก้หลังติดตั้ง และไม่มีใครบันทึก → ต้องมีคนดู
 * rules และ stack.json ไม่อยู่ใน lock โดยตั้งใจ — มันถูกออกแบบให้ต่างกันในแต่ละโปรเจกต์
 *
 * exit 0 = ไม่มี drifted · 1 = มี drifted หรือไม่มี lock · 2 = input ผิด
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KIT = path.resolve(__dirname, '..');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

// Installed path → kit source. Only files the kit ships verbatim.
function installedFiles(root) {
  const claude = path.join(root, '.claude');
  const pairs = [];
  const add = (installed, source) => { if (fs.existsSync(installed) && fs.existsSync(source)) pairs.push({ installed, source }); };
  if (!fs.existsSync(claude)) return pairs;
  for (const f of fs.readdirSync(claude).filter((n) => n.endsWith('.js'))) add(path.join(claude, f), path.join(KIT, 'claude-setup', f));
  for (const dir of ['hooks', 'agents']) {
    const d = path.join(claude, dir);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).filter((n) => /\.(js|md)$/.test(n))) add(path.join(d, f), path.join(KIT, 'claude-setup', dir, f));
  }
  const skills = path.join(claude, 'skills');
  if (fs.existsSync(skills)) for (const s of fs.readdirSync(skills)) add(path.join(skills, s, 'SKILL.md'), path.join(KIT, 'claude-setup', 'skills', s, 'SKILL.md'));
  return pairs;
}

// Did this exact content ever ship from the kit? If the kit is a git checkout, look back through
// the source file's history. Without this, the first lock of a project installed from an older
// kit reports every stale file as "customized" — found on the first outside trial.
function shippedEarlier(source, digest) {
  const { spawnSync } = require('node:child_process');
  const rel = path.relative(KIT, source).replace(/\\/g, '/');
  const log = spawnSync('git', ['log', '--format=%h', '-n', '60', '--', rel], { cwd: KIT, encoding: 'utf8' });
  if (log.status !== 0) return null;
  for (const commit of log.stdout.split(/\r?\n/).filter(Boolean)) {
    const show = spawnSync('git', ['show', `${commit}:${rel}`], { cwd: KIT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (show.status === 0 && crypto.createHash('sha256').update(show.stdout.replace(/\r\n/g, '\n')).digest('hex') === digest) return commit;
  }
  return null;
}

function kitVersion() {
  return JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8')).version;
}

function writeLock(root, options = {}) {
  const pairs = installedFiles(root);
  const lock = {
    _: 'Written by buaflow lock (PE-002). Records the Buaflow version installed and the sha256 of every file copied from it, so a later run can tell an upgrade-able file from one somebody changed. Re-run with --write after an intentional change to accept it.',
    schemaVersion: '1.0',
    kitVersion: kitVersion(),
    lockedAt: (options.now || new Date()).toISOString(),
    files: Object.fromEntries(pairs.map(({ installed }) => [path.relative(root, installed).replace(/\\/g, '/'), sha(installed)])),
  };
  fs.mkdirSync(path.join(root, '.buaflow'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buaflow', 'lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

function compare(root) {
  const lockFile = path.join(root, '.buaflow', 'lock.json');
  if (!fs.existsSync(lockFile)) return { error: 'no .buaflow/lock.json — run buaflow lock --write after installing or upgrading the kit' };
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const rows = [];
  for (const { installed, source } of installedFiles(root)) {
    const rel = path.relative(root, installed).replace(/\\/g, '/');
    const now = sha(installed);
    const locked = lock.files?.[rel];
    const kit = sha(source);
    let status;
    if (now === kit) status = 'current';
    else if (!locked) status = 'drifted';
    else if (now === locked) status = kit === locked ? 'current' : (lock.kitVersion === kitVersion() ? 'customized' : 'outdated');
    else status = 'drifted';
    // Content the kit itself once shipped is an old version, not somebody's change.
    let shippedIn = null;
    if (status === 'customized' || status === 'drifted') {
      shippedIn = shippedEarlier(source, now);
      if (shippedIn) status = 'outdated';
    }
    rows.push({ file: rel, status, ...(shippedIn ? { shippedIn } : {}) });
  }
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { lockedVersion: lock.kitVersion, kitVersion: kitVersion(), rows, counts: { current: count('current'), outdated: count('outdated'), customized: count('customized'), drifted: count('drifted') } };
}

function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--root');
  const root = path.resolve(i !== -1 ? argv[i + 1] : process.cwd());
  const json = argv.includes('--json');
  if (!fs.existsSync(path.join(root, '.claude'))) {
    console.error('kit-lock: no .claude/ here — nothing from the kit is installed yet');
    return 2;
  }
  if (argv.includes('--write')) {
    const lock = writeLock(root);
    if (json) console.log(JSON.stringify(lock, null, 2));
    else console.log(`kit-lock: recorded ${Object.keys(lock.files).length} installed file(s) at kit ${lock.kitVersion} in .buaflow/lock.json`);
    return 0;
  }
  const result = compare(root);
  if (result.error) {
    if (json) console.log(JSON.stringify(result, null, 2)); else console.error(`kit-lock: ${result.error}`);
    return 1;
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    const c = result.counts;
    console.log(`kit-lock: locked at ${result.lockedVersion}, kit is ${result.kitVersion} — ${c.current} current, ${c.outdated} outdated, ${c.customized} customized, ${c.drifted} drifted`);
    for (const r of result.rows.filter((x) => x.status !== 'current')) console.log(`  ${r.status.padEnd(10)} ${r.file}`);
  }
  return result.counts.drifted ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { compare, installedFiles, sha, shippedEarlier, writeLock };
