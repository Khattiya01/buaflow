#!/usr/bin/env node
/**
 * run.js — รันคำสั่งรองของโปรเจกต์ตามชื่อ
 *
 *   node .claude/run.js coverage     # วัด coverage
 *   node .claude/run.js audit        # ตรวจช่องโหว่ dependency
 *   node .claude/run.js apiTest      # เทส API (ถ้ามี)
 *
 * เหตุผลเดียวกับ verify.js: `allowed-tools` ของ skill เป็นกฎที่บังคับจริง
 * `/release` มี `Bash(pnpm *)` ซึ่งใช้ไม่ได้กับ stack อื่น แต่มี `Bash(node .claude/*)` อยู่แล้ว
 * คำสั่งจริงจึงย้ายไปอยู่ที่ `commands` ใน stack.json แทนการฝังชื่อ pnpm ไว้ในเนื้อ skill
 *
 * คำสั่งที่ไม่ได้ตั้งไว้ = บอกตรง ๆ แล้ว exit 1 ไม่ใช่เงียบแล้วผ่าน
 * (คำสั่ง verify ใช้ verify.js — แยกกันเพราะ gate ยึดตัวนั้นและ env VERIFY_COMMAND ทับได้)
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const name = process.argv[2];

if (!name) {
  console.error('run: ต้องระบุชื่อคำสั่ง เช่น  node .claude/run.js coverage');
  process.exit(1);
}

let commands;
try {
  commands = require(path.join(__dirname, 'stack-config.js')).load(ROOT).commands || {};
} catch {
  console.error('run: ไม่พบ .claude/stack-config.js — คัดลอกมาจาก project-kit/claude-setup/ ก่อน (ดู UPGRADE.md)');
  process.exit(1);
}

const cmd = commands[name];
if (!cmd) {
  // แยก "ตั้ง null ไว้ตั้งใจ" ออกจาก "ยังไม่ได้ตั้ง" — คนละปัญหา คนละทางแก้
  console.error(
    name in commands && cmd === null
      ? `run: โปรเจกต์นี้ระบุว่าไม่มีคำสั่ง "${name}" (ตั้งเป็น null ไว้ใน .claude/stack.json)\n` +
          '  ถ้าขั้นตอนที่เรียกมันยังอยู่ใน skill/checklist ให้ตัดออก — ไม่ใช่ปล่อยให้ล้มทุกครั้ง'
      : `run: โปรเจกต์นี้ไม่ได้ตั้งคำสั่ง "${name}"\n` +
          `  ตั้งที่ "commands.${name}" ใน .claude/stack.json (เช่น "uv run pytest --cov")\n` +
          '  ถ้าโปรเจกต์นี้ไม่มีคำสั่งนั้นจริง ๆ ให้ตั้งเป็น null'
  );
  process.exit(1);
}

const r = spawnSync(cmd.split(' ')[0], cmd.split(' ').slice(1), { cwd: ROOT, stdio: 'inherit', shell: true });
process.exit(r.status === null ? 1 : r.status);
