#!/usr/bin/env node
/**
 * stack-config.js — จุดเดียวที่รู้ว่าโปรเจกต์นี้ใช้ stack อะไร
 *
 * ทำไมต้องมี: สคริปต์ใน .claude/ เคยฝังชื่อเครื่องมือไว้ในตัวเองเป็น regex ตายตัว
 * (`pnpm`, `\.tsx?$`, `prettier`, `.husky/pre-push`) ผลคือโปรเจกต์ที่ไม่ตรงค่าเริ่มต้น
 * — ไม่ใช่แค่ stack อื่น แต่รวม JS/TS ที่ใช้ npm แทน pnpm หรือ Biome แทน Prettier —
 * จะเจออาการ "เขียวปลอม": hook ไม่ match อะไรเลยแล้ว exit 0 เงียบ ๆ เหมือนทำงานปกติ
 *
 * กติกาเดียวกับ guard-edit.js + protected-paths.json ซึ่งเป็นต้นแบบของไฟล์นี้:
 *   1. DEFAULTS ข้างล่าง = ค่าเดิมของ kit เป๊ะ ๆ -> โปรเจกต์ JS/TS เดิมไม่รู้สึกอะไรเลย
 *   2. .claude/stack.json ทับ "รายคีย์" -> คีย์ที่ไม่ได้เขียนยังใช้ค่าเริ่มต้น
 *   3. ไฟล์หายหรือ JSON พัง -> ถอยไปใช้ DEFAULTS เงียบ ๆ ห้ามขวางงาน
 *
 * ไม่มี dependency — Node ล้วน
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  // null = ให้ resolveVerify() เดาจาก package.json (พฤติกรรมเดิมของ gate.js)
  // แยกจาก commands ข้างล่างเพราะตัวนี้เป็นของที่ gate ยึด และ env VERIFY_COMMAND ทับได้
  verifyCommand: null,

  // คำสั่งรองที่ skill/agent เรียกเป็นครั้งคราว — เรียกผ่าน `node .claude/run.js <ชื่อ>`
  // เพื่อให้ผ่าน allowed-tools ของ skill (ทุกตัวมี Bash(node .claude/*) อยู่แล้ว)
  // ตั้งเป็น null = โปรเจกต์นี้ไม่มีคำสั่งนั้น แล้ว run.js จะบอกตรง ๆ แทนที่จะรันอะไรมั่ว
  commands: {
    coverage: 'pnpm test:cov',
    audit: 'pnpm audit',
    apiTest: 'pnpm test:api',
  },

  // ไฟล์ที่นับว่าเป็น "โค้ด" ตอนตรวจว่า rule คุ้มครองครบไหม (check-config ข้อ 4)
  codeFilePattern: '\\.(ts|tsx|js|jsx|prisma|sql)$',

  // ไฟล์ที่ format-changed.js จะแตะ
  formattablePattern: '\\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|md)$',
  skipPattern: '(^|/)(node_modules|\\.next|dist|build|coverage)/',

  // ใช้ร่วมกันระหว่าง guard-edit.js (กันแก้เทสบน branch แก้บั๊ก) และ check-config
  testFilePattern: '\\.(spec|test)\\.[jt]sx?$|(^|/)(tests?|__tests__|e2e)/',
  bugfixBranchPattern: '^(fix|hotfix)/',

  // git hook ที่เรียก gate.js — husky (Node) หรือ .git/hooks ตรง ๆ ก็ได้
  preflightHookPath: '.husky/pre-push',

  // format/lint เฉพาะไฟล์ที่เพิ่งแก้ — เป็น "ข้อมูล" ไม่ใช่ if-chain ในสคริปต์
  //   when         ไฟล์ config ที่ต้องมีอย่างน้อยหนึ่งตัว ถึงจะถือว่าโปรเจกต์ใช้ตัวนี้
  //   match        (ไม่ใส่ = ทุกไฟล์ที่ผ่าน formattablePattern)
  //   args         {file} จะถูกแทนด้วย path ของไฟล์ที่เพิ่งแก้
  //   exclusive    ถ้าตัวนี้ทำงาน ให้ข้ามตัวที่เหลือ (Biome ทำทั้ง format และ lint จบในตัวเดียว)
  //   reportOutput ส่ง output ที่ autofix แก้เองไม่ได้กลับเข้า context ให้ Claude แก้ต่อ
  formatCommands: [
    {
      id: 'biome',
      when: ['biome.json', 'biome.jsonc'],
      cmd: 'pnpm',
      args: ['exec', 'biome', 'check', '--write', '{file}'],
      exclusive: true,
      reportOutput: false,
    },
    {
      id: 'prettier',
      when: ['.prettierrc', '.prettierrc.json', 'prettier.config.js', '.prettierrc.cjs'],
      cmd: 'pnpm',
      args: ['exec', 'prettier', '--write', '{file}'],
      reportOutput: false,
    },
    {
      id: 'eslint',
      when: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.cjs'],
      match: '\\.(ts|tsx|js|jsx|mjs|cjs)$',
      cmd: 'pnpm',
      args: ['exec', 'eslint', '--fix', '{file}'],
      reportOutput: true,
    },
  ],

  protected: [
    {
      pattern: '**/components/ui/**',
      reason:
        'This file is under components/ui/, which shadcn generates. Do not hand-edit it.\n' +
        'Correct path: install/update through the shadcn CLI, or create a wrapper in components/shared/ instead.',
    },
  ],
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * อ่าน config ของโปรเจกต์ที่ root แล้วรวมกับ DEFAULTS
 * protected-paths.json ยังอ่านอยู่เพื่อไม่ให้โปรเจกต์ที่ติดตั้งไปแล้วพัง (stack.json ชนะถ้ามีทั้งคู่)
 */
function load(root) {
  const dir = path.join(root || process.cwd(), '.claude');
  const stack = readJson(path.join(dir, 'stack.json')) || {};
  const legacy = readJson(path.join(dir, 'protected-paths.json')) || {};

  const pick = (key) => {
    if (stack[key] !== undefined) return stack[key];
    if (legacy[key] !== undefined) return legacy[key];
    return DEFAULTS[key];
  };

  const cfg = {};
  for (const key of Object.keys(DEFAULTS)) cfg[key] = pick(key);
  if (!Array.isArray(cfg.formatCommands)) cfg.formatCommands = DEFAULTS.formatCommands;
  if (!Array.isArray(cfg.protected)) cfg.protected = DEFAULTS.protected;
  // commands ทับ "รายคำสั่ง" ไม่ใช่ทั้งก้อน — ตั้ง coverage อย่างเดียวแล้วไม่ต้องเขียน audit ซ้ำ
  cfg.commands = { ...DEFAULTS.commands, ...(stack.commands || {}) };
  return cfg;
}

/** คำสั่งรองตามชื่อ — คืน null เมื่อโปรเจกต์นี้ไม่มีคำสั่งนั้น */
function resolveCommand(root, name, cfg) {
  const c = cfg || load(root);
  return c.commands?.[name] || null;
}

/**
 * คำสั่งตรวจมาตรฐานของโปรเจกต์นี้ — ลำดับ: env -> stack.json -> เดาจาก package.json
 * คืน null เมื่อยังไม่ได้ตั้ง (ผู้เรียกเป็นคนตัดสินว่าจะ skip หรือ fail)
 */
function resolveVerify(root, cfg) {
  if (process.env.VERIFY_COMMAND) return process.env.VERIFY_COMMAND;
  const c = cfg || load(root);
  if (c.verifyCommand) return c.verifyCommand;
  const pkg = readJson(path.join(root || process.cwd(), 'package.json'));
  return pkg?.scripts?.verify ? 'pnpm verify' : null;
}

module.exports = { DEFAULTS, load, resolveVerify, resolveCommand };
