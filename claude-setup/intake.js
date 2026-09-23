#!/usr/bin/env node
/**
 * intake.js — นำงานที่ค้างอยู่ในที่อื่นเข้ามาเป็น intent แบบ draft (IC-003)
 *
 *   node buaflow/claude-setup/intake.js --from issues.json              ดูว่าจะสร้างอะไร (ไม่เขียน)
 *   node buaflow/claude-setup/intake.js --from issues.json --write      เขียน docs/intents/I-0xx-*.md
 *   gh issue list --state open --json number,title,body,url,labels > issues.json
 *   buaflow intake --file issues.json --write
 *
 * ทำไมต้องมี: Phase A.1 ถามว่า "ระบบติดตามงานเดิมมีงานค้างกี่ชิ้น" แล้วก็จบแค่นั้น · งานค้างเหล่านั้นไม่เคย
 * เข้ามาอยู่ใน artifact chain ของ kit เลย ⇒ AI ทำงานตาม intent ที่มี และมองไม่เห็นว่าทีมมีงานรอคิวอยู่อีก 40 ชิ้น
 * ใน tracker · /intent รับข้อความธรรมดาได้อยู่แล้ว สิ่งที่ขาดคือทางนำเข้าเป็นชุด
 *
 * รับได้สี่แบบ (ดูจากเนื้อไฟล์ ไม่ต้องบอก):
 *   GitHub   `gh issue list --json number,title,body,url,labels`   → [{ number, title, body, url, labels:[{name}] }]
 *   GitLab   `glab issue list -F json` / API                        → [{ iid, title, description, web_url, labels:[...] }]
 *   CSV      หัวคอลัมน์ต้องมี title · body / url / labels ไม่บังคับ
 *   ข้อความ  หนึ่งบรรทัด `- …` หรือ `* …` ต่อหนึ่งเรื่อง (โน้ตประชุม, roadmap.md เดิม)
 *
 * กติกาที่ทำให้มันไม่ใช่การปั๊มเอกสาร:
 *   - ทุกไฟล์ที่สร้างเป็น **draft** และเก็บต้นฉบับไว้ตามคำเดิม · ไม่แต่งปัญหา หลักฐาน หรือผลลัพธ์ให้
 *   - สี่คำถามของ /intent Step 2 ที่ต้นฉบับไม่ได้ตอบ ถูกใส่เป็น [NEEDS CLARIFICATION (scope): …] ⇒ docs-lint
 *     และ /spec ไม่ยอมให้เดินต่อจนกว่าคนจะตอบ · การนำเข้าไม่ใช่การอนุมัติ
 *   - ไม่นำเข้าซ้ำ: เรื่องที่ `source:` ตรงกับ intent ที่มีอยู่ (รวมที่ rejected) ถูกข้ามพร้อมบอกว่าซ้ำกับไฟล์ไหน
 *   - ไม่เขียนทับไฟล์ใด ๆ · ค่าเริ่มต้นคือแสดงผลอย่างเดียว ต้องใส่ --write
 *
 * exit 0 = สำเร็จ · 2 = input ผิด · ไม่มี dependency
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

function readItems(text, file) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data.issues || data.items || [];
    return list.map((it) => ({
      title: String(it.title || '').trim(),
      body: String(it.body ?? it.description ?? '').trim(),
      source: it.url || it.html_url || it.web_url || (it.number ? `#${it.number}` : it.iid ? `#${it.iid}` : null),
      labels: (it.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
      kind: it.web_url ? 'gitlab' : 'github',
    }));
  }
  if (/\.csv$/i.test(file) || /^[^\n]*\btitle\b[^\n]*,/i.test(trimmed)) {
    const [header, ...rows] = parseCsv(trimmed);
    const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
    const t = col('title');
    if (t === -1) throw new Error('CSV needs a "title" column');
    return rows.map((r) => ({
      title: (r[t] || '').trim(),
      body: col('body') !== -1 ? (r[col('body')] || '').trim() : '',
      source: col('url') !== -1 ? (r[col('url')] || '').trim() || null : null,
      labels: col('labels') !== -1 ? (r[col('labels')] || '').split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
      kind: 'csv',
    }));
  }
  return trimmed.split(/\r?\n/).map((l) => l.match(/^\s*[-*]\s+(?:\[[ x]\]\s+)?(.+)$/)).filter(Boolean).map((m) => ({ title: m[1].trim(), body: '', source: null, labels: [], kind: 'text' }));
}

function slug(title) {
  const ascii = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (ascii.length >= 3 ? ascii : 'imported').slice(0, 48).replace(/-+$/, '');
}

function existingIntents(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^I-\d+.*\.md$/.test(f)).map((f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const get = (k) => (text.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.trim() || '';
    return { file: f, number: Number(f.match(/^I-(\d+)/)[1]), source: get('source'), title: get('title') };
  });
}

function render(item, id, today, from) {
  const answered = (re) => re.test(item.body);
  const q = [];
  if (!answered(/ปัญหา|problem|bug|broken|cannot|can't|ไม่ได้|พัง/i)) q.push('ปัญหาจริงคืออะไร — วันนี้ทำอะไรไม่ได้ หรืออะไรพัง');
  if (!answered(/\d/)) q.push('หลักฐาน — ใครเจอ กี่คน บ่อยแค่ไหน มี log หรือตัวเลขไหม');
  q.push('ดีขึ้นแปลว่าอะไร — วัดความสำเร็จยังไง');
  q.push('อะไรที่ห้ามพังระหว่างแก้');
  return [
    '---',
    `id: ${id}`,
    `title: ${item.title.replace(/\r?\n/g, ' ')}`,
    `author: imported from ${item.kind === 'text' ? from : item.kind}`,
    `source: ${item.source || `imported:${from}`}`,
    'status: draft',
    `created: ${today}`,
    'decided:',
    item.labels.length ? `labels: [${item.labels.join(', ')}]` : null,
    '---',
    '',
    `# Intent: ${item.title}`,
    '',
    '> **นำเข้าโดย `buaflow intake` — ยังไม่ใช่ intent ที่ผ่านการคุย** ข้อความข้างล่างคือต้นฉบับตามคำเดิม',
    '> ไม่มีอะไรถูกแต่งเพิ่ม · ก่อนไป /spec ต้องตอบคำถามท้ายไฟล์ให้ครบ',
    '',
    '## ต้นฉบับ',
    '',
    item.body ? item.body.split(/\r?\n/).map((l) => `> ${l}`).join('\n') : '> (ไม่มีรายละเอียดนอกจากชื่อเรื่อง)',
    '',
    '## คำถามที่ยังไม่มีคำตอบ',
    '',
    ...q.map((text) => `- [NEEDS CLARIFICATION (scope): ${text}]`),
    '',
  ].filter((l) => l !== null).join('\n');
}

function plan(root, items, options = {}) {
  const dir = path.join(root, 'docs', 'intents');
  const existing = existingIntents(dir);
  let next = existing.reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const today = (options.now || new Date()).toISOString().slice(0, 10);
  const created = [];
  const skipped = [];
  const seen = new Set();
  for (const item of items) {
    if (!item.title) { skipped.push({ title: '(empty)', reason: 'no title' }); continue; }
    const key = item.source || `title:${item.title.toLowerCase()}`;
    const duplicate = existing.find((e) => (item.source && e.source === item.source) || (!item.source && e.title.toLowerCase() === item.title.toLowerCase()));
    if (duplicate) { skipped.push({ title: item.title, reason: `already imported as ${duplicate.file}` }); continue; }
    if (seen.has(key)) { skipped.push({ title: item.title, reason: 'duplicate in the input' }); continue; }
    seen.add(key);
    const id = `I-${String(next++).padStart(3, '0')}`;
    created.push({ id, file: `docs/intents/${id}-${slug(item.title)}.md`, title: item.title, content: render(item, id, today, options.from || 'input') });
  }
  return { created, skipped };
}

function parseArgs(argv) {
  const options = { root: process.cwd(), from: null, write: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') options.root = argv[++i];
    else if (arg === '--from' || arg === '--file') options.from = argv[++i];
    else if (arg === '--write') options.write = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.help && !options.from) throw new Error('--from <file> is required');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`intake: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node intake.js --from <issues.json|backlog.csv|notes.md> [--root path] [--write] [--json]');
    return 0;
  }
  const root = path.resolve(options.root);
  let items;
  try { items = readItems(fs.readFileSync(path.resolve(root, options.from), 'utf8'), options.from); } catch (error) {
    console.error(`intake: cannot read ${options.from}: ${error.message}`);
    return 2;
  }
  const result = plan(root, items, { from: path.basename(options.from) });
  if (options.write) {
    for (const c of result.created) {
      const file = path.join(root, c.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file)) { result.skipped.push({ title: c.title, reason: `${c.file} exists` }); continue; }
      fs.writeFileSync(file, c.content);
    }
  }
  if (options.json) console.log(JSON.stringify({ written: options.write, created: result.created.map(({ id, file, title }) => ({ id, file, title })), skipped: result.skipped }, null, 2));
  else {
    console.log(`intake: ${result.created.length} draft intent(s) ${options.write ? 'written' : 'would be written (add --write)'} · ${result.skipped.length} skipped`);
    for (const c of result.created) console.log(`  + ${c.file}  ${c.title}`);
    for (const s of result.skipped) console.log(`  = ${s.title} — ${s.reason}`);
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { parseArgs, plan, readItems, render };
