#!/usr/bin/env node
/**
 * SessionStart hook — ฉีดสถานะงานเข้า context ตอนเปิด session
 *
 * แก้ปัญหา: ทุก session เริ่มจากศูนย์ ต้องคอยสั่งให้ไปอ่าน board เอง
 * ผลลัพธ์: Claude รู้ตั้งแต่ข้อความแรกว่ามีอะไรค้างอยู่ และอยู่บน branch อะไร
 *
 * ออก JSON ทาง stdout พร้อม hookSpecificOutput.additionalContext
 * ข้อมูลนี้ Claude เห็น แต่ไม่โผล่รบกวนผู้ใช้
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MAX_SECTION_LINES = 40;

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** ดึงเฉพาะหัวข้อที่สนใจจาก board แทนที่จะยัดทั้งไฟล์เข้า context */
function section(md, heading) {
  if (!md) return null;
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.includes(heading));
  if (start === -1) return null;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    if (i > start && /^#{2,3}\s/.test(lines[i])) break;
    out.push(lines[i]);
    if (out.length >= MAX_SECTION_LINES) break;
  }
  const body = out.join('\n').trim();
  // ตารางที่มีแต่หัว = ไม่มีงานในหมวดนั้น
  return body.split('\n').filter((l) => /^\|/.test(l)).length > 2 ? body : null;
}

const parts = [];

const branch = git('rev-parse --abbrev-ref HEAD');
const dirtyLines = git('status --short').split('\n').filter(Boolean);
if (branch) {
  let dirtyBlock = '\nworking tree สะอาด';
  if (dirtyLines.length) {
    // ตัดไม่ให้ยาวเกิน — repo ที่รกอยู่แล้วไม่ควรกิน context ทั้งก้อน
    const shown = dirtyLines.slice(0, 15).join('\n');
    const more = dirtyLines.length > 15 ? `\n... และอีก ${dirtyLines.length - 15} ไฟล์` : '';
    dirtyBlock = `\nไฟล์ที่ยังไม่ commit (${dirtyLines.length}):\n\`\`\`\n${shown}${more}\n\`\`\``;
  }
  parts.push(`## Git\nbranch: \`${branch}\`${dirtyBlock}`);
}

const board = read('docs/backlog/board.md');
if (board) {
  const inProgress = section(board, 'In Progress');
  const review = section(board, 'Review');
  const blocked = section(board, 'Blocked');
  const intents = section(board, 'Intent รอตัดสิน');

  const bits = [inProgress, review, blocked, intents].filter(Boolean);
  if (bits.length) {
    parts.push(`## สถานะจาก docs/backlog/board.md\n\n${bits.join('\n\n')}`);
  } else {
    parts.push('## สถานะจาก docs/backlog/board.md\nไม่มีงานค้างในหมวด in-progress / review / blocked');
  }
} else {
  parts.push('_ยังไม่มี docs/backlog/board.md ในโปรเจกต์นี้_');
}

const state = read('docs/planning/_state.md');
if (state) {
  const pending = state.split('\n').filter((l) => l.includes('⬜')).length;
  if (pending > 0) {
    parts.push(`## Planning\nยังมี Phase ที่ยังไม่เสร็จอีก ${pending} ขั้น — ดู docs/planning/_state.md`);
  }
}

const context = [
  '# สถานะโปรเจกต์ ณ ตอนเปิด session (ฉีดโดย hook อัตโนมัติ)',
  '',
  ...parts,
  '',
  '> ใช้ข้อมูลนี้ตั้งต้นได้เลย ไม่ต้องไปอ่าน board ซ้ำถ้าไม่ต้องการรายละเอียดเพิ่ม',
  '> ถ้ามี task ค้างที่ `in-progress` อยู่ ให้เตือนผู้ใช้ก่อนเริ่มงานใหม่ (กฎคือทำทีละ 1)',
].join('\n');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  })
);
process.exit(0);
