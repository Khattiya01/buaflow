#!/usr/bin/env node
/**
 * product-graph — แปลง Product Graph (IC-001, docs/planning/product-graph.json) เป็นเอกสาร Markdown อ่านง่าย
 *
 *   node .claude/product-graph.js                  พิมพ์ Markdown ออก stdout
 *   node .claude/product-graph.js --check           ตรวจไฟล์ + schemaVersion อย่างเดียว ไม่พิมพ์เอกสาร
 *   node .claude/product-graph.js --file <path> --out <path>
 *
 * ทำไมต้องมี: product-graph.json เป็น canonical (JSON) แต่คนอ่านตรงไม่สะดวก ไฟล์นี้ generate
 * มุมมอง Markdown แบบ deterministic จาก JSON เดียวกัน แล้ว **ตรวจตัวเองว่าไม่มีค่าไหนจาก JSON
 * ต้นทางหายไปจากเอกสาร** ก่อนพิมพ์ผลลัพธ์ — ตรงหลักการข้อ 2 (Markdown เป็นมุมมอง ไม่ใช่ฐานข้อมูล)
 * key ที่ขึ้นต้นด้วย _ และ $schema ไม่ถูกนับ เพราะเป็นคำอธิบาย/editor hint ไม่ใช่เนื้อหาโปรดักต์
 *
 * exit 0 = ผ่าน | exit 1 = ไฟล์หาย / JSON พัง / schemaVersion ไม่รองรับ / เอกสารตกหล่นข้อมูล
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; };
const CHECK_ONLY = args.includes('--check');
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GRAPH_FILE = path.resolve(ROOT, flag('--file', 'docs/planning/product-graph.json'));
const OUT_FILE = flag('--out', null);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

if (!fs.existsSync(GRAPH_FILE)) {
  console.error(`✗ ไม่มี ${rel(GRAPH_FILE)} — สร้างจาก templates/product-graph.tpl.json ก่อน`);
  process.exit(1);
}
let graph;
try {
  graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
} catch (e) {
  console.error(`✗ ${rel(GRAPH_FILE)} ไม่ใช่ JSON: ${e.message}`);
  process.exit(1);
}

if (graph.schemaVersion) {
  const version = String(graph.schemaVersion).match(/^(\d+)\.(\d+)$/);
  if (!version || Number(version[1]) !== 1) {
    console.error(`✗ ${rel(GRAPH_FILE)} ใช้ schemaVersion "${graph.schemaVersion}" ที่ product-graph.js รุ่นนี้ไม่รองรับ — migrate หรือ upgrade Buaflow`);
    process.exit(1);
  }
} else {
  console.log(`  warn  ${rel(GRAPH_FILE)} ยังไม่มี schemaVersion — migrate เป็น product-graph v1`);
}

// ── ตารางแต่ละหมวด (ยกเว้น entities ที่ต้องแตก attributes เป็นตารางย่อย) ──
const SECTIONS = [
  ['actors', 'Actors', ['id', 'name', 'type', 'description']],
  ['outcomes', 'Outcomes', ['id', 'statement', 'metric']],
  ['capabilities', 'Capabilities', ['id', 'name', 'description', 'actors', 'outcomes']],
  ['rules', 'Rules', ['id', 'statement', 'appliesTo']],
  ['entities', 'Entities', null],
  ['integrations', 'Integrations', ['id', 'name', 'direction', 'description']],
  ['nonFunctionalRequirements', 'Non-functional requirements', ['id', 'category', 'statement', 'target']],
  ['assumptions', 'Assumptions', ['id', 'statement', 'confidence']],
  ['risks', 'Risks', ['id', 'statement', 'impact', 'likelihood', 'mitigation']],
  ['exclusions', 'Exclusions', ['id', 'statement']],
];

const cell = (v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
};

function table(items, columns) {
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const rows = items.map((item) => `| ${columns.map((c) => cell(item[c])).join(' | ')} |`);
  return [header, divider, ...rows].join('\n');
}

function renderEntities(entities) {
  if (!entities.length) return '_ยังไม่มีข้อมูล_';
  return entities
    .map((e) => {
      const attrs = Array.isArray(e.attributes) ? e.attributes : [];
      const attrTable = attrs.length ? table(attrs, ['name', 'type', 'description']) : '_ไม่มี attribute_';
      return `### ${e.name} (\`${e.id}\`)\n\n${e.description ? `${e.description}\n\n` : ''}${attrTable}`;
    })
    .join('\n\n');
}

function render(g) {
  const lines = [`# Product graph — ${g.product || '(unnamed)'}`, '', `Schema version: ${g.schemaVersion || 'unversioned'}`];
  if (g.summary) lines.push('', g.summary);
  for (const [key, title, columns] of SECTIONS) {
    const items = Array.isArray(g[key]) ? g[key] : [];
    lines.push('', `## ${title}`, '');
    lines.push(key === 'entities' ? renderEntities(items) : items.length ? table(items, columns) : '_ยังไม่มีข้อมูล_');
  }
  return `${lines.join('\n')}\n`;
}

// ── ตรวจว่าไม่มีข้อมูลตกหล่น: ทุกค่า leaf ใน JSON (ยกเว้น $schema และ _*) ต้องเจอในเอกสาร ──
function collectLeaves(value, out) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') { if (value.trim()) out.push(value); return; }
  if (typeof value === 'number' || typeof value === 'boolean') { out.push(String(value)); return; }
  if (Array.isArray(value)) { for (const v of value) collectLeaves(v, out); return; }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$schema' || k.startsWith('_')) continue;
      collectLeaves(v, out);
    }
  }
}

const markdown = render(graph);
const leaves = [];
collectLeaves(graph, leaves);
const missing = leaves.filter((leaf) => !markdown.includes(leaf));

if (missing.length) {
  console.error(`✗ product-graph: เอกสาร Markdown ตกหล่นข้อมูล ${missing.length} จุด:`);
  for (const m of missing.slice(0, 10)) console.error(`  - ${m}`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`✓ product-graph --check: ${leaves.length} ค่าครบใน ${rel(GRAPH_FILE)}, เอกสารไม่ตกหล่นข้อมูล`);
  process.exit(0);
}

if (OUT_FILE) {
  const outPath = path.resolve(ROOT, OUT_FILE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown);
  console.log(`✓ product-graph: เขียน ${rel(outPath)}`);
} else {
  process.stdout.write(markdown);
}
