#!/usr/bin/env node
/**
 * change-impact — ของเปลี่ยนแล้วอะไรต้องถูกทบทวน (IC-006)
 *
 *   node .claude/change-impact.js --from intent:I-003
 *   node .claude/change-impact.js --from docs/specs/checkout/spec.md
 *   node .claude/change-impact.js --from control:access-control --depth 2 --json
 *
 * ทำไมต้องมี: ยิ่งโมเดลเก่งขึ้น ยิ่งแก้ของเยอะต่อรอบ และยิ่งมีคนอ่าน diff น้อยลง
 * คำถาม "แก้ตรงนี้แล้วอะไรต้องถูกทบทวนบ้าง" จึงมีค่าเพิ่มขึ้นเรื่อย ๆ ไม่ใช่ลดลง
 *
 * อ่านกราฟตัวเดียวกับ convergence.js (BC-004) — สองไฟล์นี้ตอบคนละคำถามจากลิงก์ชุดเดียวกัน:
 * BC-004 ถามว่า "อะไรไม่เชื่อมกับอะไร" ส่วนไฟล์นี้ถามว่า "ถ้าตรงนี้ขยับ อะไรขยับตาม"
 *
 * กฎที่สำคัญที่สุดในไฟล์นี้: **ลิงก์ที่ resolve ไม่ได้ ต้องรายงานว่า "ไม่รู้" ไม่ใช่ "ไม่กระทบ"**
 * เครื่องมือ change-impact ที่เงียบเมื่อไม่รู้ อันตรายกว่าการไม่มีเครื่องมือเลย เพราะคนจะเชื่อมัน
 *
 * exit 0 = รายงานได้ครบ | exit 1 = มีผลกระทบที่ยังไม่รู้ | exit 2 = input ผิด
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildGraph } = require('./convergence.js');

// อะไรที่ต้องทำเมื่อ node ชนิดนั้นถูกกระทบ — คนอ่านต้องได้รายการที่ลงมือได้
// ไม่ใช่คำเตือนให้ "อ่านให้ดี ๆ"
const ACTION = Object.freeze({
  intent: 'confirm the intent still says what the change assumes',
  spec: 'update the spec, or record why it still holds',
  plan: 'revisit the plan before continuing',
  task: 'reopen or re-verify this task',
  control: 're-run this readiness control; its evidence may no longer hold',
  evidence: 'regenerate this evidence',
  pack: 'check the pack still matches what it asserts',
  profile: 'check the profile still requires what it claims',
  'pain-point': 'confirm the original problem is still the one being solved',
  commit: 'the revision this was proven at',
});

function resolveStart(graph, from, root) {
  if (graph.nodes.has(from)) return { key: from };

  // ให้ระบุเป็น path ของไฟล์ได้ด้วย เพราะสิ่งที่คนถืออยู่ในมือหลังแก้โค้ดคือชื่อไฟล์ ไม่ใช่ node id
  const normalized = String(from).replace(/\\/g, '/');
  const matches = [...graph.nodes.values()].filter((node) => {
    if (node.file && node.file.replace(/\\/g, '/') === normalized) return true;
    if (node.kind === 'evidence' && node.id.endsWith(`:${normalized}`)) return true;
    if (node.kind === 'spec' && normalized.startsWith(node.id.replace(/\/$/, ''))) return true;
    return false;
  });
  if (matches.length === 1) return { key: matches[0].key };
  if (matches.length > 1) return { ambiguous: matches.map((m) => m.key) };

  const onDisk = fs.existsSync(path.join(root, normalized));
  return {
    missing: true,
    reason: onDisk
      ? `${normalized} exists but no artifact in the graph references it, so its impact is unknown rather than none`
      : `${normalized} is not a node in the graph and does not exist in this project`,
  };
}

function impactOf(graph, startKey, options = {}) {
  const maxDepth = Number.isFinite(options.depth) ? options.depth : Infinity;
  const neighbours = new Map();
  const addNeighbour = (a, b, relation) => {
    if (!neighbours.has(a)) neighbours.set(a, []);
    neighbours.get(a).push({ key: b, relation });
  };
  for (const { from, to, relation } of graph.edges) {
    // Impact travels both ways: changing an intent affects the tasks that implement it, and
    // changing a task's proof affects confidence in the intent above it.
    addNeighbour(from, to, relation);
    addNeighbour(to, from, `${relation} (reverse)`);
  }

  const seen = new Map([[startKey, 0]]);
  const queue = [startKey];
  const affected = [];
  while (queue.length) {
    const current = queue.shift();
    const depth = seen.get(current);
    if (depth >= maxDepth) continue;
    for (const { key, relation } of neighbours.get(current) || []) {
      if (seen.has(key)) continue;
      seen.set(key, depth + 1);
      const node = graph.nodes.get(key);
      affected.push({
        key,
        kind: node?.kind,
        depth: depth + 1,
        via: `${current} (${relation})`,
        action: ACTION[node?.kind] || 'review',
      });
      queue.push(key);
    }
  }
  affected.sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));

  // ลิงก์ที่พังและแตะ node ที่อยู่ในรัศมีผลกระทบ = ผลกระทบที่ "ไม่รู้" ต้องแยกออกมาให้เห็น
  const unknown = graph.unresolved.filter((item) => seen.has(item.from) || item.from === startKey);

  return { start: startKey, affected, unknown };
}

function parseArgs(argv) {
  const options = { root: process.cwd(), from: null, depth: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--from') options.from = argv[++index];
    else if (arg === '--depth') options.depth = Number(argv[++index]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.from) throw new Error('--from is required (a node id like intent:I-003, or a file path)');
  if (options.depth !== null && (!Number.isFinite(options.depth) || options.depth < 1)) {
    throw new Error('--depth requires a positive number');
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`change-impact: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/change-impact.js --from <node-id|path> [--root <path>] [--depth N] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const graph = buildGraph(root);
  const start = resolveStart(graph, options.from, root);

  if (start.ambiguous) {
    console.error(`change-impact: "${options.from}" matches more than one node: ${start.ambiguous.join(', ')}`);
    return 2;
  }
  if (start.missing) {
    // Unknown, never "no impact". Exit non-zero so a script cannot read silence as safety.
    const payload = { start: options.from, affected: [], unknown: [{ from: options.from, reason: start.reason }] };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`change-impact: UNKNOWN for "${options.from}"`);
      console.log(`  ${start.reason}`);
    }
    return 1;
  }

  const result = impactOf(graph, start.key, { depth: options.depth ?? Infinity });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`change-impact: ${result.affected.length} artifact(s) to review after changing ${result.start}`);
    for (const item of result.affected) {
      console.log(`  [${item.depth}] ${item.key} — ${item.action}`);
      console.log(`        via ${item.via}`);
    }
    for (const item of result.unknown) {
      console.log(`  UNKNOWN: ${item.from} -> ${item.to || '?'} (${item.reason})`);
    }
    if (!result.affected.length && !result.unknown.length) {
      console.log('  nothing else in the graph is linked to it');
    }
  }

  return result.unknown.length ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { ACTION, impactOf, parseArgs, resolveStart };
