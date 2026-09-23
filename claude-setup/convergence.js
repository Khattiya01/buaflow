#!/usr/bin/env node
/**
 * convergence — สร้างกราฟความเชื่อมโยงของ artifact ทั้งโปรเจกต์ แล้วบอกว่าอะไรไม่เชื่อมกับอะไร (BC-004)
 *
 *   node .claude/convergence.js
 *   node .claude/convergence.js --root /path/to/project --json
 *
 * ทำไมต้องมี: docs-lint ตรวจ "ลิงก์ที่เขียนไว้ชี้ไปหาของที่มีจริงไหม" ทีละเส้น แต่ไม่เคยตอบคำถาม
 * ระดับกราฟว่า "มีอะไรลอยอยู่โดยไม่เชื่อมกับใครเลยไหม" และ "มีอะไรที่ยังไม่มีหลักฐานรองรับเลยไหม"
 * ความล้มเหลวแบบ integration ส่วนใหญ่มีรูปร่างแบบนั้น — ของที่ถูกต้องในตัวเอง แต่ไม่ได้ต่อกับอะไร
 *
 * BC-005 ทำ slice แรกไว้แล้ว (profile เทียบชุด pack) โดยอ่านสัญญาที่มีอยู่แทนการประดิษฐ์ของใหม่
 * ไฟล์นี้ทำแบบเดียวกันแต่ครอบทั้งโปรเจกต์ — **กราฟถูก derive จาก artifact ที่มีอยู่เสมอ
 * ไม่มีใครต้องมาดูแลกราฟด้วยมือ** ถ้าต้องมาบำรุงรักษาเอง มันจะผิดภายในสัปดาห์เดียว
 *
 * รายงานสองอย่างที่ต่างกันจริง ๆ:
 *   unconnected  ไม่มีเส้นเข้าและไม่มีเส้นออกเลย — ของที่ลอยอยู่
 *   unproven     มีเส้น แต่เดินไปไม่ถึงหลักฐานใด ๆ (commit หรือ evidence)
 *
 * exit 0 = ไม่มีของลอย | exit 1 = มี | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROOF_KINDS = new Set(['commit', 'evidence']);

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// เท่าที่ docs-lint รองรับพอดี: key: value และ key: [a, b] — ไม่ทำ YAML เต็มรูปแบบ
// เพราะสองไฟล์ที่อ่าน frontmatter คนละแบบคือจุดที่ความจริงเริ่มแตกออกจากกัน
function frontmatter(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].replace(/\s+#.*$/, '').trim();
    if (/^\[.*\]$/.test(value)) {
      out[key] = value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean);
    } else if (value) {
      out[key] = value;
    }
  }
  return out;
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
}

function buildGraph(root) {
  const nodes = new Map();
  const edges = [];
  const unresolved = [];

  const node = (kind, id, extra = {}) => {
    const key = `${kind}:${id}`;
    if (!nodes.has(key)) nodes.set(key, { key, kind, id, ...extra });
    else Object.assign(nodes.get(key), extra);
    return key;
  };
  const edge = (from, to, relation) => { edges.push({ from, to, relation }); };

  // ลิงก์ที่ชี้ไปหาของที่ไม่มีอยู่ ต้องถูกบันทึกว่า "ไม่รู้" ไม่ใช่ถูกทิ้งเงียบ ๆ —
  // ลิงก์ที่หายไปเงียบ ๆ จะกลายเป็น "ไม่มีผลกระทบ" ตอน IC-006 ถาม ซึ่งเป็นคำตอบที่อันตรายที่สุด
  const link = (from, kind, id, relation, resolvedPath) => {
    if (resolvedPath && !fs.existsSync(resolvedPath)) {
      unresolved.push({ from, to: `${kind}:${id}`, relation, reason: `${id} does not exist in this project` });
      return;
    }
    edge(from, node(kind, id), relation);
  };

  // --- intents ---------------------------------------------------------------------
  const intentsDir = path.join(root, 'docs', 'intents');
  for (const file of listMarkdown(intentsDir)) {
    const text = readText(path.join(intentsDir, file)) || '';
    const meta = frontmatter(text) || {};
    const id = meta.id || path.basename(file, '.md');
    const key = node('intent', id, { status: meta.status, file: `docs/intents/${file}` });

    // DV-002 เชื่อม pain point ขึ้นไปข้างบน: เก็บ id ที่อ้างถึงในเนื้อความ
    for (const pp of new Set((text.match(/\bPP-\d{3}\b/g) || []).filter((v) => v !== 'PP-000'))) {
      edge(node('pain-point', pp), key, 'motivates');
    }
  }

  // --- tasks -----------------------------------------------------------------------
  const tasksDir = path.join(root, 'docs', 'backlog', 'tasks');
  for (const file of listMarkdown(tasksDir)) {
    const meta = frontmatter(readText(path.join(tasksDir, file))) || {};
    const id = meta.id || path.basename(file, '.md');
    const key = node('task', id, { status: meta.status, file: `docs/backlog/tasks/${file}` });

    if (meta.intent) link(key, 'intent', path.basename(String(meta.intent)).replace(/\.md$/, '').split('-').slice(0, 2).join('-'), 'implements', path.join(root, String(meta.intent)));
    if (meta.spec) link(key, 'spec', String(meta.spec).replace(/\/$/, ''), 'specified-by', path.join(root, String(meta.spec)));
    if (meta.plan) link(key, 'plan', String(meta.plan), 'planned-by', path.join(root, String(meta.plan)));
    for (const dep of [].concat(meta.depends_on || [])) {
      if (dep && dep !== 'T-000') edge(key, node('task', dep), 'depends-on');
    }
    // commit คือหลักฐานของ task: ของที่ทำเสร็จจริงต้องชี้กลับไปหา revision ได้
    if (meta.commit) edge(key, node('commit', String(meta.commit)), 'proven-by');
  }

  // --- readiness manifest: control -> evidence ---------------------------------------
  const manifest = readJson(path.join(root, 'docs', 'evidence', 'readiness.json'));
  if (manifest && manifest.controls && typeof manifest.controls === 'object') {
    for (const [controlId, control] of Object.entries(manifest.controls)) {
      const key = node('control', controlId, { status: control?.status });
      for (const item of control?.evidence || []) {
        if (!item || typeof item.value !== 'string') continue;
        if (item.type === 'file') {
          const resolved = path.join(root, item.value);
          if (!fs.existsSync(resolved)) {
            unresolved.push({ from: key, to: `evidence:${item.value}`, relation: 'proven-by', reason: 'evidence file does not exist' });
            continue;
          }
        }
        edge(key, node('evidence', `${item.type}:${item.value}`, { type: item.type }), 'proven-by');
      }
    }
    if (manifest.commit) node('commit', String(manifest.commit));
  }

  // --- packs -> controls, and profile -> controls -------------------------------------
  const packsDir = path.join(root, '.claude', 'packs');
  if (fs.existsSync(packsDir)) {
    for (const file of fs.readdirSync(packsDir).filter((f) => f.endsWith('.json')).sort()) {
      const pack = readJson(path.join(packsDir, file));
      if (!pack) continue;
      const key = node('pack', pack.id || path.basename(file, '.json'));
      for (const item of pack.operationalEvidence || []) {
        if (item?.control) edge(key, node('control', item.control), 'contributes-to');
      }
    }
  }
  const profilesDir = path.join(root, '.claude', 'profiles');
  if (fs.existsSync(profilesDir)) {
    for (const file of fs.readdirSync(profilesDir).filter((f) => f.endsWith('.json')).sort()) {
      const profile = readJson(path.join(profilesDir, file));
      if (!profile) continue;
      const key = node('profile', profile.id || path.basename(file, '.json'));
      for (const item of profile.controls || []) {
        if (item?.control) edge(key, node('control', item.control), 'requires');
      }
    }
  }

  return { nodes, edges, unresolved };
}

// เดินจากทุก node ไปหา node ที่เป็นหลักฐาน ตามทิศทางของเส้นและย้อนกลับได้ด้วย เพราะ
// "intent ถูกพิสูจน์แล้ว" หมายถึงมี task ที่ชี้กลับมาหามันและมี commit ไม่ใช่ intent ชี้ออกไปเอง
function analyze(graph) {
  const { nodes, edges } = graph;
  const outgoing = new Map();
  const incoming = new Map();
  for (const { from, to } of edges) {
    if (!outgoing.has(from)) outgoing.set(from, new Set());
    if (!incoming.has(to)) incoming.set(to, new Set());
    outgoing.get(from).add(to);
    incoming.get(to).add(from);
  }

  const reachesProof = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      if (current !== start && PROOF_KINDS.has(nodes.get(current)?.kind)) return true;
      for (const next of [...(outgoing.get(current) || []), ...(incoming.get(current) || [])]) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return false;
  };

  const unconnected = [];
  const unproven = [];
  for (const [key, value] of nodes) {
    if (PROOF_KINDS.has(value.kind)) continue;
    const degree = (outgoing.get(key)?.size || 0) + (incoming.get(key)?.size || 0);
    if (degree === 0) unconnected.push(key);
    else if (!reachesProof(key)) unproven.push(key);
  }

  return { unconnected: unconnected.sort(), unproven: unproven.sort() };
}

function parseArgs(argv) {
  const options = { root: process.cwd(), json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.root) throw new Error('--root requires a path');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`convergence: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/convergence.js [--root <path>] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  if (!fs.existsSync(root)) {
    console.error(`convergence: no such directory: ${options.root}`);
    return 2;
  }

  const graph = buildGraph(root);
  const report = analyze(graph);
  const ok = report.unconnected.length === 0;

  if (options.json) {
    console.log(JSON.stringify({
      ok,
      nodes: [...graph.nodes.values()],
      edges: graph.edges,
      unresolved: graph.unresolved,
      ...report,
    }, null, 2));
  } else {
    console.log(`convergence: ${graph.nodes.size} node(s), ${graph.edges.length} edge(s)`);
    for (const key of report.unconnected) console.log(`  unconnected: ${key} — nothing links to it and it links to nothing`);
    for (const key of report.unproven) console.log(`  unproven: ${key} — connected, but no path reaches a commit or evidence`);
    for (const item of graph.unresolved) console.log(`  unresolved: ${item.from} -> ${item.to} (${item.reason})`);
    if (ok && !report.unproven.length && !graph.unresolved.length) console.log('  everything is connected and reaches a proof');
  }

  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { PROOF_KINDS, analyze, buildGraph, frontmatter, parseArgs };
