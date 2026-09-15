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
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|md)$/;
const SKIP = /(^|\/)(node_modules|\.next|dist|build|coverage)\//;

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

  // Biome ทำทั้ง format และ lint ในคำสั่งเดียว — ถ้ามีให้ใช้ตัวนี้อย่างเดียว
  if (has('biome.json') || has('biome.jsonc')) {
    run('pnpm', ['exec', 'biome', 'check', '--write', rel]);
  } else {
    if (has('.prettierrc') || has('.prettierrc.json') || has('prettier.config.js') || has('.prettierrc.cjs')) {
      run('pnpm', ['exec', 'prettier', '--write', rel]);
    }
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel) && (has('eslint.config.js') || has('eslint.config.mjs') || has('.eslintrc.json') || has('.eslintrc.cjs'))) {
      const out = run('pnpm', ['exec', 'eslint', '--fix', rel]);
      if (out && out.trim()) messages.push(out.trim().slice(0, 2000));
    }
  }

  if (messages.length) {
    // ส่ง error ที่ --fix แก้เองไม่ได้กลับเข้า context ให้ Claude จัดการต่อทันที
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            `lint ยังเหลือปัญหาในไฟล์ ${rel} ที่แก้อัตโนมัติไม่ได้ — แก้ให้เรียบร้อยก่อนไปต่อ:\n\n${messages.join('\n')}`,
        },
      })
    );
  }
  process.exit(0);
});
