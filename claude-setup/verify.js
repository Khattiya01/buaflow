#!/usr/bin/env node
/**
 * verify.js — ทางเข้าเดียวของ "คำสั่งตรวจมาตรฐาน" สำหรับ skill และ agent
 *
 *   node .claude/verify.js
 *
 * ทำไมต้องมี: skill อย่าง /check /done /task ประกาศ allowed-tools ไว้ว่า `Bash(pnpm verify*)`
 * ซึ่งเป็นกฎที่ "บังคับจริง" ไม่ใช่ข้อความ — โปรเจกต์ที่ไม่ได้ใช้ pnpm จึงรัน verify ของตัวเองไม่ได้เลย
 * แต่ทุก skill พวกนี้มี `Bash(node .claude/*)` อยู่แล้ว การเรียกผ่านไฟล์นี้จึงผ่าน permission
 * โดยไม่ต้องแก้ frontmatter สักบรรทัด และคำสั่งจริงย้ายไปอยู่ที่ stack.json แทน
 *
 * ลำดับการหาคำสั่ง: env VERIFY_COMMAND -> .claude/stack.json -> เดาจาก package.json
 * exit code = exit code ของคำสั่งจริง (ไม่กลืน)
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let resolveVerify;
try {
  ({ resolveVerify } = require(path.join(__dirname, 'stack-config.js')));
} catch {
  // ยังไม่ได้คัดลอก stack-config.js มา (ติดตั้งเก่า) — ใช้กติกาเดิมของ gate.js
  resolveVerify = () => {
    if (process.env.VERIFY_COMMAND) return process.env.VERIFY_COMMAND;
    try {
      const pkg = JSON.parse(require('node:fs').readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      return pkg?.scripts?.verify ? 'pnpm verify' : null;
    } catch {
      return null;
    }
  };
}

const cmd = resolveVerify(ROOT);

if (!cmd) {
  console.error(
    'verify: ยังไม่ได้ตั้งคำสั่งตรวจมาตรฐาน\n' +
      '  ตั้งอย่างใดอย่างหนึ่ง:\n' +
      '    - "verifyCommand" ใน .claude/stack.json   (เช่น "uv run poe verify", "npm run verify")\n' +
      '    - env VERIFY_COMMAND\n' +
      '    - script "verify" ใน package.json\n' +
      '  ดู phases/02-stack-decision.md รอบ B2 — ถ้าไม่มีคำสั่งนี้ /check และ /done บอกไม่ได้ว่างานผ่านหรือไม่'
  );
  process.exit(1);
}

const r = spawnSync(cmd.split(' ')[0], cmd.split(' ').slice(1), { cwd: ROOT, stdio: 'inherit', shell: true });
process.exit(r.status === null ? 1 : r.status);
