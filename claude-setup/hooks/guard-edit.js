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
        'ไฟล์นี้อยู่ใน components/ui/ ซึ่งเป็นของที่ shadcn generate มา ห้ามแก้มือ\n' +
        'ทางที่ถูก: ติดตั้ง/อัปเดตผ่าน shadcn CLI หรือสร้าง wrapper ใน components/shared/ แทน',
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
        `[hook: guard-edit] ${rule.reason || `ไฟล์นี้ตรงกับ pattern ที่ห้ามแก้: ${rule.pattern}`}\n` +
          'ถ้าคิดว่าจำเป็นต้องแก้จริง ให้หยุดแล้วบอกผู้ใช้ว่าติดอะไรและทำไม อย่าหาทางอ้อม\n'
      );
      process.exit(2);
    }
  }

  if (new RegExp(cfg.testFilePattern).test(p)) {
    const branch = currentBranch();
    if (new RegExp(cfg.bugfixBranchPattern).test(branch)) {
      process.stderr.write(
        [
          `[hook: guard-edit] อยู่บน branch "${branch}" ซึ่งเป็นงานแก้บั๊ก จึงห้ามแก้ไฟล์เทส`,
          'เทสคือหลักฐานว่าบั๊กมีจริง การแก้เทสให้ผ่านไม่ใช่การแก้บั๊ก',
          'ถ้าเทสเดิมผิดจริง: หยุด แล้วอธิบายให้ผู้ใช้ฟังว่าเทสเดิมผิดตรงไหนเพราะอะไร แล้วรอการตัดสินใจ',
          'ถ้าต้องการ "เพิ่ม" เทสใหม่ที่จับบั๊กนี้: สร้างไฟล์เทสใหม่แยก แล้วบอกผู้ใช้',
        ].join('\n') + '\n'
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
