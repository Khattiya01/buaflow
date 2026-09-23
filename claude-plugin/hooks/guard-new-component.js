#!/usr/bin/env node
/**
 * PreToolUse hook (Write/Edit/MultiEdit) — กันการ "คิดเอง" ตัดสินใจ design ใหม่แบบไม่เช็ค registry ก่อน
 *
 * ไม่บล็อกทุกไฟล์ component — ตามลำดับใน standards/ui-component-rules.md ข้อ 1
 * ข้อ 1-3 (ใช้ของเดิมใน shared / shadcn / ประกอบจาก primitive ที่มีอยู่) เป็น self-serve
 * ทำได้เลยไม่ต้องรอ ต้องกันเฉพาะข้อ 4-5 คือกรณีที่ "คิด design ใหม่เอง" จริง ๆ
 * สัญญาณที่เชื่อถือได้ของกรณีนั้นคือการใส่ **สี hex ดิบ หรือ arbitrary value** เข้ามาเอง
 * ซึ่งกติกาข้อ 5 (ข้อห้ามเด็ดขาด) ก็ห้ามอยู่แล้ว — ถ้าเนื้อหาที่กำลังจะเขียน/แก้ไม่มีสัญญาณนี้
 * ถือว่าเป็นแค่การประกอบจาก primitive เดิม ปล่อยผ่านได้เลย ไม่ว่าจะสร้างไฟล์ใหม่หรือแก้ไฟล์เดิม
 *
 * เงื่อนไขที่บล็อก: เนื้อหาที่กำลังเขียนลงไฟล์ใต้ components/** (ยกเว้น components/ui/**
 * ที่ guard-edit.js ดูแลอยู่แล้ว) มีสี hex ดิบ/arbitrary value และชื่อไฟล์ (component)
 * ไม่ตรงกับแถวไหนใน docs/design/components.md แบบเป๊ะ (ไม่ใช่ substring — กัน false
 * positive เช่น "Tab" ไป match ติดกับ "DataTable" ที่มีอยู่แล้ว)
 *
 * ไม่มี docs/design/components.md (ยังไม่ถึง Phase 3 หรือ stack ไม่ตรง) → ปล่อยผ่าน
 * exit 2 = บล็อก, exit 0 = ปล่อยผ่าน
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'docs', 'design', 'components.md');

const COMPONENT_FILE_RE = /(^|\/)components\/([^/]+)\/.*\.(tsx|jsx|ts|js)$/;

// สัญญาณว่ามีการ "คิด design ใหม่เอง" แทนที่จะประกอบจาก token/primitive เดิม
const RAW_DESIGN_DECISION_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|ring|fill|stroke|shadow|from|via|to)-\[[^\]]+\]/;

function normalize(s) {
  return s
    .replace(/[`*_]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function componentNameFromPath(relPath) {
  return normalize(path.basename(relPath).replace(/\.(tsx|jsx|ts|js)$/, ''));
}

/** ดึงชื่อ component จากคอลัมน์แรกของทุกแถวตาราง markdown แบบ exact (ไม่ใช่ substring ของทั้งไฟล์) */
function registryNames(markdown) {
  const names = new Set();
  for (const line of markdown.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    const first = cells[0];
    if (/^:?-+:?$/.test(first)) continue; // แถวคั่น header เช่น |---|---|
    const n = normalize(first);
    if (!n || n === 'component') continue; // header เอง
    names.add(n);
  }
  return names;
}

/** เนื้อหาที่ "กำลังจะถูกเขียนใหม่" จาก tool_input ของ Write / Edit / MultiEdit */
function newContentFrom(toolInput) {
  if (typeof toolInput.content === 'string') return toolInput.content; // Write
  if (typeof toolInput.new_string === 'string') return toolInput.new_string; // Edit
  if (Array.isArray(toolInput.edits)) {
    return toolInput.edits.map((e) => e?.new_string ?? '').join('\n'); // MultiEdit
  }
  return '';
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let filePath = '';
  let content = '';
  try {
    const input = JSON.parse(raw)?.tool_input ?? {};
    filePath = input.file_path ?? '';
    content = newContentFrom(input);
  } catch {
    process.exit(0); // อ่าน input ไม่ได้ อย่าไปขวางงาน
  }
  if (!filePath) process.exit(0);

  const p = path.relative(ROOT, path.resolve(ROOT, filePath)).replace(/\\/g, '/');

  const m = COMPONENT_FILE_RE.exec(p);
  if (!m) process.exit(0); // ไม่ใช่ไฟล์ใต้ components/**
  if (m[2] === 'ui') process.exit(0); // components/ui/** guard-edit.js ดูแลอยู่แล้ว

  if (!RAW_DESIGN_DECISION_RE.test(content)) process.exit(0); // ประกอบจาก primitive/token เดิมล้วน ๆ ปล่อยผ่าน (ข้อ 1-3)

  let registry = '';
  try {
    registry = fs.readFileSync(REGISTRY_PATH, 'utf8');
  } catch {
    process.exit(0); // ยังไม่มี registry (ยังไม่ถึง Phase 3 หรือ stack ไม่ตรง) อย่าขวางงาน
  }

  const name = componentNameFromPath(p);
  if (registryNames(registry).has(name)) process.exit(0); // มีแถวตรงชื่อในทะเบียนแล้ว ถือว่าเช็คมาแล้ว

  process.stderr.write(
    `[hook: guard-new-component] "${p}" contains a raw hex color or arbitrary value (e.g. bg-[#...]) that is not an existing token.\n` +
      'That is a new design decision (steps 4-5 in standards/ui-component-rules.md), not just composing existing primitives.\n' +
      'Before creating/editing, check:\n' +
      '  4) Is there a design/reference already (e.g. a canvas synced from claude.ai/design, or docs/design/)? Use values from existing tokens, not raw hex.\n' +
      '  5) None → stop and ask the user first. You may not propose new tokens/colors on your own.\n' +
      'Once done: add a row for this component to docs/design/components.md first, then try again.\n'
  );
  process.exit(2);
});
