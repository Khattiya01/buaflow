#!/usr/bin/env node
/**
 * PreToolUse hook — กันการแก้ไฟล์ที่ห้ามแก้
 *
 * บล็อก 2 กรณี:
 *   1. ไฟล์ที่อยู่ในรายการ protected (อ่านจาก .claude/stack.json)
 *      ค่าเริ่มต้น: components/ui/** ที่ shadcn generate
 *   2. ไฟล์เทส ขณะที่อยู่บน branch แก้บั๊ก (fix/ หรือ hotfix/)
 *      เหตุผล: ตอนแก้บั๊ก เทสคือหลักฐานว่าบั๊กมีจริง ถ้าแก้เทสได้ = แก้หลักฐาน
 *
 * ปรับรายการได้ที่ .claude/stack.json โดยไม่ต้องแก้สคริปต์นี้ (protected-paths.json เดิมยังอ่านได้)
 * (โปรเจกต์เดิมที่ไม่มี components/ui/ ให้แก้ที่นั่น)
 *
 * exit 2 = บล็อก (ข้อความใน stderr จะถูกส่งให้ Claude อ่าน)
 * exit 0 = ปล่อยผ่าน
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const DEFAULTS = {
  protected: [
    {
      pattern: '**/components/ui/**',
      reason:
        'This file is under components/ui/, copied in from shadcn. Edits are routed elsewhere so customisation lives in one visible place.\n' +
        'Correct path: wrap it in components/shared/. Use the shadcn CLI only to add a component that does not exist here yet — never re-run `shadcn add` for one that does: it replaces the whole file and does not merge.\n' +
        'If this project has already customised components/ui/ (usual when adopting an existing project), this protection is wrong for it: remove the pattern from .claude/stack.json (Phase A.5).',
    },
  ],
  testFilePattern: '\\.(spec|test)\\.[jt]sx?$|(^|/)(tests?|__tests__|e2e)/',
  bugfixBranchPattern: '^(fix|hotfix)/',
};

function loadConfig() {
  // stack.json เป็นที่อยู่ใหม่ของค่าพวกนี้ — stack-config.js อ่าน protected-paths.json ให้ด้วย
  try {
    return require('../stack-config.js').load(ROOT);
  } catch { /* ติดตั้งเก่าที่ยังไม่มี stack-config.js — อ่านไฟล์เดิมตรง ๆ ข้างล่าง */ }
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.claude', 'protected-paths.json'), 'utf8');
    const cfg = JSON.parse(raw);
    return {
      protected: Array.isArray(cfg.protected) ? cfg.protected : DEFAULTS.protected,
      testFilePattern: cfg.testFilePattern || DEFAULTS.testFilePattern,
      bugfixBranchPattern: cfg.bugfixBranchPattern || DEFAULTS.bugfixBranchPattern,
    };
  } catch {
    return DEFAULTS; // ไม่มีไฟล์ หรือ parse ไม่ได้ → ใช้ค่าเริ่มต้น อย่าขวางงาน
  }
}

/** แปลง glob ง่าย ๆ เป็น regex: ** = ข้ามกี่โฟลเดอร์ก็ได้, * = ในโฟลเดอร์เดียว */
function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = esc
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\/\*\*/g, '(?:/.*)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`(^|/)${body}$`);
}

function currentBranch() {
  try {
    // cwd ต้องเป็น process.cwd() ไม่ใช่ ROOT (CLAUDE_PROJECT_DIR) — ROOT ชี้ไปที่ primary
    // checkout เสมอ ต่อให้คำสั่งที่กำลังจะรันจริงอยู่ใน git worktree แยก (เช่น subagent ที่
    // spawn ด้วย isolation: "worktree") ก็ตาม ใช้ ROOT ตรงนี้จะเห็น branch ของ checkout หลัก
    // ผิดที่ (ดู guard-bash.js currentBranch() ซึ่งมีบั๊กเดียวกัน)
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0); // อ่าน input ไม่ได้ อย่าไปขวางงาน
  }
  if (!filePath) process.exit(0);

  const cfg = loadConfig();
  const p = path.relative(ROOT, path.resolve(ROOT, filePath)).replace(/\\/g, '/');

  for (const rule of cfg.protected) {
    if (!rule?.pattern) continue;
    if (globToRegex(rule.pattern).test(p)) {
      process.stderr.write(
        `[hook: guard-edit] ${rule.reason || `This file matches a protected pattern: ${rule.pattern}`}\n` +
          'If you believe the edit is truly necessary, stop and tell the user what is blocked and why. Do not look for a workaround.\n'
      );
      process.exit(2);
    }
  }

  if (new RegExp(cfg.testFilePattern).test(p)) {
    const branch = currentBranch();
    if (new RegExp(cfg.bugfixBranchPattern).test(branch)) {
      process.stderr.write(
        [
          `[hook: guard-edit] You are on branch "${branch}", a bug-fix branch, so editing test files is blocked.`,
          'The test is the evidence that the bug exists. Making the test pass is not fixing the bug.',
          'If the existing test really is wrong: stop, explain to the user where and why it is wrong, and wait for their decision.',
          'If you need to ADD a new test that catches this bug: create a separate new test file and tell the user.',
        ].join('\n') + '\n'
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
