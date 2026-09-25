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

// cwd ต้องเป็น process.cwd() ไม่ใช่ CLAUDE_PROJECT_DIR — CLAUDE_PROJECT_DIR ชี้ไปที่ primary
// checkout เสมอ ต่อให้ session นี้กำลังรันจริงอยู่ใน git worktree แยก (เช่น subagent ที่ spawn
// ด้วย isolation: "worktree") ก็ตาม ใช้ CLAUDE_PROJECT_DIR ตรงนี้จะฉีด branch/board/task ของ
// checkout ผิดตัวเข้า context (เหมือนบั๊กเดิมที่แก้แล้วใน guard-edit.js / guard-bash.js)
const ROOT = process.cwd();
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
  let dirtyBlock = '\nworking tree clean';
  if (dirtyLines.length) {
    // ตัดไม่ให้ยาวเกิน — repo ที่รกอยู่แล้วไม่ควรกิน context ทั้งก้อน
    const shown = dirtyLines.slice(0, 15).join('\n');
    const more = dirtyLines.length > 15 ? `\n... and ${dirtyLines.length - 15} more` : '';
    dirtyBlock = `\nUncommitted files (${dirtyLines.length}):\n\`\`\`\n${shown}${more}\n\`\`\``;
  }
  parts.push(`## Git\nbranch: \`${branch}\`${dirtyBlock}`);
}

/**
 * board.md ตั้งแต่ v2.3.3 อยู่ใน .gitignore (generate จาก tasks/*.md — commit แล้ว conflict
 * ทุกครั้งที่มีหลาย PR พร้อมกัน) เลยอาจไม่มีไฟล์ตอน clone ใหม่ หรือมีแต่เก่ากว่า task ล่าสุด
 * (คนอื่น merge task ใหม่เข้า main แล้วเราเพิ่ง pull) — regenerate ให้สดก่อนอ่านเสมอ
 */
function ensureFreshBoard() {
  try {
    const boardPath = path.join(ROOT, 'docs/backlog/board.md');
    const tasksDir = path.join(ROOT, 'docs/backlog/tasks');
    if (!fs.existsSync(tasksDir)) return;
    if (!fs.existsSync(path.join(ROOT, '.claude/board.js'))) return;
    const boardMtime = fs.existsSync(boardPath) ? fs.statSync(boardPath).mtimeMs : 0;
    const newestTask = fs.readdirSync(tasksDir)
      .filter((f) => f.endsWith('.md'))
      .reduce((max, f) => Math.max(max, fs.statSync(path.join(tasksDir, f)).mtimeMs), 0);
    if (boardMtime && boardMtime >= newestTask) return; // สดอยู่แล้ว
    execSync('node .claude/board.js', { cwd: ROOT, stdio: 'ignore' });
  } catch { /* ห้ามพัง session start เพราะ regenerate ไม่ได้ — อ่านของเก่า/ไม่มีไปก่อน */ }
}
ensureFreshBoard();

const board = read('docs/backlog/board.md');
if (board) {
  const inProgress = section(board, 'In Progress');
  const review = section(board, 'Review');
  const blocked = section(board, 'Blocked');
  const intents = section(board, 'Intent รอตัดสิน');

  const bits = [inProgress, review, blocked, intents].filter(Boolean);
  if (bits.length) {
    parts.push(`## Status from docs/backlog/board.md\n\n${bits.join('\n\n')}`);
  } else {
    parts.push('## Status from docs/backlog/board.md\nNothing pending in in-progress / review / blocked');
  }
} else {
  parts.push('_No docs/backlog/board.md in this project yet_');
}

const state = read('docs/planning/_state.md');
if (state) {
  const pending = state.split('\n').filter((l) => l.includes('⬜')).length;
  if (pending > 0) {
    parts.push(`## Planning\n${pending} phase(s) still unfinished — see docs/planning/_state.md`);
  }
}

/**
 * กฎที่ hook บังคับอยู่ — ฉีดให้รู้ตั้งแต่ข้อความแรก
 *
 * แก้ปัญหา: hook มาจาก plugin (มีทุกโปรเจกต์ทันที) แต่คำอธิบายกฎอยู่ใน CLAUDE.md ซึ่งเขียนตอน
 * Phase 7 เท่านั้น ⇒ โปรเจกต์ที่ยังไม่ handoff จบ AI ไม่มีทางรู้กฎก่อนถูกบล็อก มันเลยต้อง "ลองยิง
 * ก่อนถึงรู้" แล้วเสีย token ไปกับการสืบหาสาเหตุ (และถ้า commit ลง main ไปก่อนแล้ว ต้องย้ายย้อนหลัง)
 * ธรรมนูญมาตรา 8 บอกว่ากฎที่ห้ามพังต้องมีครบทั้งชั้นข้อความและชั้น hook — นี่คือชั้นข้อความที่หายไป
 *
 * โปรเจกต์ที่มีตาราง "Active hooks" ใน CLAUDE.md อยู่แล้ว ข้ามไป — Claude Code โหลดไฟล์นั้นให้เอง
 * ไม่ต้องจ่าย token ซ้ำสอง
 */
function guardrails() {
  const claudeMd = read('CLAUDE.md');
  if (claudeMd && /Active hooks/.test(claudeMd)) return null;
  return [
    '',
    '## Guardrails (hooks enforce these — do not spend a call finding out)',
    '- `main` takes changes through a PR only: branch before editing, never merge or push to main.',
    '- Never `--no-verify` on commit/push, never `git checkout/restore .`, never run the sonar scan.',
    '- Never edit `components/ui/**`, a test file on a `fix/`/`hotfix/` branch, or the generated `docs/backlog/board.md`.',
    '- Blocked and you think it is a real exception → tell the user what blocked you. Do not look for a workaround.',
  ].join('\n');
}
const rules = guardrails();
if (rules) parts.push(rules);

const context = [
  '# Project status at session start (injected by hook)',
  '',
  ...parts,
  '',
  '> Start from this; do not re-read the board unless you need more detail.',
  '> If a task is already `in-progress`, warn the user before starting new work (rule: one at a time).',
  '> Reply to the user in Thai.',
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
