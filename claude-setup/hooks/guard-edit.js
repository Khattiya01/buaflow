#!/usr/bin/env node
/**
 * PreToolUse hook — กันการแก้ไฟล์ที่ห้ามแก้
 *
 * บล็อก 2 กรณี:
 *   1. ไฟล์ที่อยู่ในรายการ protected (อ่านจาก .claude/protected-paths.json)
 *      ค่าเริ่มต้น: components/ui/** ที่ shadcn generate
 *   2. ไฟล์เทส ขณะที่อยู่บน branch แก้บั๊ก (fix/ หรือ hotfix/)
 *      เหตุผล: ตอนแก้บั๊ก เทสคือหลักฐานว่าบั๊กมีจริง ถ้าแก้เทสได้ = แก้หลักฐาน
 *
 * ปรับรายการได้ที่ .claude/protected-paths.json โดยไม่ต้องแก้สคริปต์นี้
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
        'This file is under components/ui/, which shadcn generates. Do not hand-edit it.\n' +
        'Correct path: install/update through the shadcn CLI, or create a wrapper in components/shared/ instead.',
    },
  ],
  testFilePattern: '\\.(spec|test)\\.[jt]sx?$|(^|/)(tests?|__tests__|e2e)/',
  bugfixBranchPattern: '^(fix|hotfix)/',
};

function loadConfig() {
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
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: ROOT,
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
