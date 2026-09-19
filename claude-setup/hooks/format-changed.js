#!/usr/bin/env node
/**
 * PostToolUse hook — format + lint เฉพาะไฟล์ที่เพิ่งแก้
 *
 * ทำไมต้องมี: ถ้าปล่อยให้ไปเจอตอน commit ทีเดียว Claude จะต้องย้อนกลับมาแก้ทีหลัง
 * ทำตรงนี้ = ไฟล์สะอาดตั้งแต่ตอนเขียน และ Claude ได้เห็น error ของ lint ทันที
 *
 * ไม่บล็อกอะไรทั้งสิ้น (PostToolUse บล็อกไม่ได้อยู่แล้ว) — ถ้า format ไม่ได้ก็เงียบไป
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// formatter/linter ของโปรเจกต์มาจาก .claude/stack.json — ไม่ใช่ if-chain ในไฟล์นี้
// (ติดตั้งเก่าที่ยังไม่มี stack-config.js จะถอยไปใช้ค่าเดิมของ kit)
let cfg;
try {
  cfg = require('../stack-config.js').load(ROOT);
} catch {
  cfg = {
    formattablePattern: '\\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|md)$',
    skipPattern: '(^|/)(node_modules|\\.next|dist|build|coverage)/',
    formatCommands: [
      { when: ['biome.json', 'biome.jsonc'], cmd: 'pnpm', args: ['exec', 'biome', 'check', '--write', '{file}'], exclusive: true },
      { when: ['.prettierrc', '.prettierrc.json', 'prettier.config.js', '.prettierrc.cjs'], cmd: 'pnpm', args: ['exec', 'prettier', '--write', '{file}'] },
      { when: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.cjs'], match: '\\.(ts|tsx|js|jsx|mjs|cjs)$', cmd: 'pnpm', args: ['exec', 'eslint', '--fix', '{file}'], reportOutput: true },
    ],
  };
}

const FORMATTABLE = new RegExp(cfg.formattablePattern);
const SKIP = new RegExp(cfg.skipPattern);

function has(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    return null;
  } catch (e) {
    return (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  }
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }
  if (!filePath) process.exit(0);

  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (!FORMATTABLE.test(rel) || SKIP.test(rel) || !fs.existsSync(filePath)) process.exit(0);

  const messages = [];

  // exclusive = ตัวที่ทำทั้ง format และ lint จบในคำสั่งเดียว (เช่น Biome) ถ้าทำงานแล้วไม่ต้องรันตัวอื่น
  for (const f of cfg.formatCommands) {
    if (!Array.isArray(f.when) || !f.when.some(has)) continue;
    if (f.match && !new RegExp(f.match).test(rel)) continue;
    const out = run(f.cmd, (f.args || []).map((a) => (a === '{file}' ? rel : a)));
    if (f.reportOutput && out && out.trim()) messages.push(out.trim().slice(0, 2000));
    if (f.exclusive) break;
  }

  if (messages.length) {
    // ส่ง error ที่ --fix แก้เองไม่ได้กลับเข้า context ให้ Claude จัดการต่อทันที
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            `Lint issues remain in ${rel} that autofix could not resolve — fix them before continuing:\n\n${messages.join('\n')}`,
        },
      })
    );
  }
  process.exit(0);
});
