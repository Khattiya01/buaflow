#!/usr/bin/env node
/**
 * PreToolUse hook — กันการแก้ไฟล์ที่ห้ามแก้
 *
 * บล็อก 2 กรณี:
 *   1. ไฟล์ที่ shadcn generate (components/ui/**) — ต้องแก้ผ่าน registry หรือห่อใหม่ใน shared/
 *   2. ไฟล์เทส ขณะที่อยู่บน branch fix/ หรือ hotfix/
 *      เหตุผล: ตอนแก้บั๊ก เทสคือหลักฐานว่าบั๊กมีจริง ถ้าแก้เทสได้ = แก้หลักฐาน
 *
 * exit 2 = บล็อก (ข้อความใน stderr จะถูกส่งให้ Claude อ่าน)
 * exit 0 = ปล่อยผ่าน
 */
const { execSync } = require('node:child_process');

const PROTECTED = [
  {
    // shadcn generated
    test: (p) => /(^|\/)components\/ui\//.test(p),
    reason: [
      'ไฟล์นี้อยู่ใน components/ui/ ซึ่งเป็นของที่ shadcn generate มา ห้ามแก้มือ',
      'ทางที่ถูก: ติดตั้ง/อัปเดตผ่าน shadcn CLI หรือสร้าง wrapper ใน components/shared/ แทน',
      'ถ้าคิดว่าจำเป็นต้องแก้จริง ให้หยุดแล้วบอกผู้ใช้ว่าติดอะไรและทำไม',
    ].join('\n'),
  },
];

const TEST_FILE = /\.(spec|test)\.[jt]sx?$|(^|\/)(tests?|__tests__|e2e)\//;

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
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

  const p = filePath.replace(/\\/g, '/');

  for (const rule of PROTECTED) {
    if (rule.test(p)) {
      process.stderr.write(`[hook: guard-edit] ${rule.reason}\n`);
      process.exit(2);
    }
  }

  if (TEST_FILE.test(p)) {
    const branch = currentBranch();
    if (/^(fix|hotfix)\//.test(branch)) {
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
