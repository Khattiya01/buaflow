#!/usr/bin/env node
/**
 * docs-lint — ตรวจว่า artifact chain ยัง "ตรงกัน" อยู่ไหม
 *
 *   node .claude/docs-lint.js            ตรวจทั้งหมด
 *   node .claude/docs-lint.js --release M1   ตรวจเพิ่มเงื่อนไขก่อน release milestone
 *
 * ทำไมต้องมี: kit ย้ำหลายที่ว่า "spec ที่โกหกอันตรายกว่าไม่มี" แต่ที่ผ่านมาให้ AI
 * ถามตัวเอง ซึ่งเป็นกฎอ่อน ไฟล์นี้เปลี่ยนกฎอ่อน 6 ข้อให้เป็นกฎแข็ง 1 ข้อที่ CI รันได้
 *
 * ตรวจอะไร:
 *   1. task ทุกตัวมี frontmatter ครบ (id / status / type) และ id ตรงชื่อไฟล์
 *   2. task ที่ในสถานะทำงาน (in-progress / review / done) → intent: และ spec: ที่อ้างต้องมีไฟล์จริง
 *   3. task ที่ in-progress / review / done → spec แม่ต้องไม่เหลือ [NEEDS CLARIFICATION]
 *   4. task ที่ done → ต้องมี commit hash (ใน frontmatter `commit:` หรือใน board)
 *   5. task ที่ plan: ชี้ไป → ไฟล์ plan ต้องมีจริง (และ plan ต้องมี Proof)
 *   6. WIP: in-progress ได้ทีละ 1 (ต่อ assignee)
 *   7. intent ที่ accepted ต้องชี้ไป spec หรือ task ที่มีจริง
 *   8. (--release <M>) ทุก task ใน milestone นั้นต้อง done และไม่มี task -test ค้าง
 *
 * exit 0 = ผ่าน | exit 1 = มีข้อที่ต้องแก้
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const releaseIdx = args.indexOf('--release');
const RELEASE_MS = releaseIdx !== -1 ? args[releaseIdx + 1] : null;
const ROOT = args.find((a, i) => !a.startsWith('--') && i !== releaseIdx + 1) || process.cwd();

const problems = [];
const warnings = [];
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); problems.push(m); };
const warn = (m) => { console.log(`  warn ${m}`); warnings.push(m); };
const head = (m) => console.log(`\n${m}\n${'-'.repeat(m.length)}`);

const rel = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(rel(p));
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const listMd = (dir) => (exists(dir) ? fs.readdirSync(rel(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_')) : []);

const NEEDS = /\[NEEDS CLARIFICATION[^\]]*\]/g;
const ACTIVE = new Set(['in-progress', 'review', 'done']);

/** อ่าน frontmatter แบบง่าย — รองรับ key: value และ key: [a, b] */
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const f = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].replace(/\s+#.*$/, '').trim(); // ตัด comment ท้ายบรรทัด
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    f[kv[1]] = v;
  }
  return f;
}

/** ค่าที่ยังเป็น placeholder ของ template ถือว่า "ไม่ได้กรอก" */
const isPlaceholder = (v) => !v || /^<|T-000|I-000|F-xx|xxx|\.\.\./.test(String(v)) || isLegacy(v);
/** `intent: legacy` = งานที่เกิดก่อนมีระบบ intent (โปรเจกต์ที่อัปเกรดจาก v1.0 — UPGRADE.md ข้อ 7) ไม่ต้องย้อนเขียน */
const isLegacy = (v) => String(v ?? '').trim() === 'legacy';

/** path ที่อ้างในไฟล์ task/intent อาจเป็นไฟล์หรือโฟลเดอร์ (spec เป็นโฟลเดอร์) */
function refExists(p) {
  if (!p) return false;
  const clean = String(p).replace(/\/$/, '');
  return exists(clean) || exists(clean + '.md');
}

// ── 1-6. tasks ─────────────────────────────────────────────────────────
head('Tasks — docs/backlog/tasks/');
const tasks = new Map();
const TASKS_DIR = 'docs/backlog/tasks';
if (!exists(TASKS_DIR)) {
  warn(`ยังไม่มี ${TASKS_DIR} — ยังไม่ถึง Phase 5 หรือใช้ tracker ภายนอก (Phase A.6)`);
} else {
  for (const f of listMd(TASKS_DIR)) {
    const text = read(`${TASKS_DIR}/${f}`);
    const fm = frontmatter(text);
    const name = f.replace(/\.md$/, '');
    if (!fm) { bad(`${f}: ไม่มี frontmatter`); continue; }
    if (fm.id && fm.id !== name) bad(`${f}: id ใน frontmatter (${fm.id}) ไม่ตรงชื่อไฟล์`);
    if (!fm.status) { bad(`${f}: ไม่มี status:`); continue; }
    if (!fm.type) warn(`${f}: ไม่มี type: — จะเชื่อม commit กับ task ไม่ได้`);
    tasks.set(name, { fm, text, file: f });
  }
  ok(`อ่าน task ได้ ${tasks.size} ไฟล์`);

  const wip = new Map();
  for (const [id, { fm, text }] of tasks) {
    const active = ACTIVE.has(fm.status);

    // 2. intent / spec ต้องมีจริงเมื่อ task ทำงานแล้ว
    if (active) {
      if (!isPlaceholder(fm.intent) && !refExists(fm.intent)) bad(`${id}: intent: ชี้ไป ${fm.intent} แต่ไม่มีไฟล์`);
      if (!isPlaceholder(fm.spec) && !refExists(fm.spec)) bad(`${id}: spec: ชี้ไป ${fm.spec} แต่ไม่มีโฟลเดอร์`);
      if (isPlaceholder(fm.intent) && !isLegacy(fm.intent) && !/^(chore|docs|test)$/.test(fm.type || '') && !/^T-\d+-test$/.test(id) && fm.track !== 'trivial')
        warn(`${id}: ไม่มี intent: ต้นทาง — งานลอยที่ไม่มีใครรู้ว่าทำไมถึงทำ (ยกเว้น track: trivial)`);
    }

    // 3. spec แม่ต้องไม่เหลือ marker
    if (active && !isPlaceholder(fm.spec) && refExists(fm.spec)) {
      const dir = String(fm.spec).replace(/\/$/, '');
      const files = exists(dir) && fs.statSync(rel(dir)).isDirectory() ? listMd(dir).map((x) => `${dir}/${x}`) : [dir + '.md'];
      for (const sf of files) {
        if (!exists(sf)) continue;
        const left = (read(sf).match(NEEDS) || []).length;
        if (left) bad(`${id}: spec ${sf} ยังเหลือ [NEEDS CLARIFICATION] ${left} จุด แต่ task อยู่สถานะ ${fm.status}`);
      }
    }

    // 4. done ต้องมี commit
    if (fm.status === 'done' && !fm.commit) {
      const boardHas = exists('docs/backlog/board.md') && new RegExp(`\\|\\s*${id}\\s*\\|[^\\n]*\\|\\s*[0-9a-f]{7,40}\\s*\\|`).test(read('docs/backlog/board.md'));
      if (!boardHas) bad(`${id}: status done แต่ไม่มี commit: ใน frontmatter และไม่มี hash ใน board`);
    }

    // 5. plan ต้องมีจริง + มี Proof
    if (!isPlaceholder(fm.plan)) {
      if (!refExists(fm.plan)) bad(`${id}: plan: ชี้ไป ${fm.plan} แต่ไม่มีไฟล์`);
      else if (!/##\s*Proof/.test(read(String(fm.plan)))) bad(`${id}: ${fm.plan} ไม่มีหัวข้อ Proof — plan ที่ไม่บอกว่าอะไรพิสูจน์ว่าเสร็จใช้ไม่ได้`);
    } else if (fm.status === 'in-progress' && fm.track !== 'trivial') {
      warn(`${id}: in-progress โดยไม่มี plan: — โอเคเฉพาะงานที่อธิบาย diff ได้ใน 1 ประโยค`);
    }

    // 6. WIP
    if (fm.status === 'in-progress') {
      const who = fm.assignee || '(ไม่ระบุ)';
      wip.set(who, [...(wip.get(who) || []), id]);
    }

    // Proof ในไฟล์ task ต้องมี
    if (active && !/##\s*Proof/.test(text)) warn(`${id}: ไม่มีหัวข้อ Proof ในไฟล์ task`);
  }
  for (const [who, ids] of wip) {
    if (ids.length > 1) bad(`WIP เกิน: ${who} มี in-progress ${ids.length} ตัว (${ids.join(', ')}) — กฎคือทีละ 1`);
  }
  if (![...wip.values()].some((v) => v.length > 1)) ok('WIP: in-progress ไม่เกิน 1 ต่อคน');
}

// ── 7. intents ─────────────────────────────────────────────────────────
head('Intents — docs/intents/');
const INTENTS_DIR = 'docs/intents';
if (!exists(INTENTS_DIR)) {
  warn(`ยังไม่มี ${INTENTS_DIR}`);
} else {
  let n = 0;
  const now = Date.now();
  for (const f of listMd(INTENTS_DIR)) {
    const fm = frontmatter(read(`${INTENTS_DIR}/${f}`));
    if (!fm) { bad(`intents/${f}: ไม่มี frontmatter`); continue; }
    n++;
    if (fm.status === 'accepted') {
      const pointsSomewhere = [...tasks.values()].some(({ fm: t }) => String(t.intent || '').includes(f.replace(/\.md$/, '')))
        || /docs\/specs\/[^\s`<]+/.test(read(`${INTENTS_DIR}/${f}`));
      if (!pointsSomewhere) bad(`intents/${f}: accepted แต่ไม่มี task หรือ spec ไหนอ้างถึง — งานที่ตกลงแล้วแต่หายไป`);
    }
    if (fm.status === 'draft' && fm.created && now - Date.parse(fm.created) > 30 * 864e5)
      warn(`intents/${f}: draft ค้างเกิน 30 วัน — ตัดสิน หรือ defer (Phase 8.5)`);
  }
  ok(`อ่าน intent ได้ ${n} ไฟล์`);
}

// ── board ↔ tasks ──────────────────────────────────────────────────────
head('Board ↔ tasks');
if (exists('docs/backlog/board.md')) {
  const board = read('docs/backlog/board.md');
  const onBoard = new Set(board.match(/\bT-\d+(?:-test)?\b/g) || []);
  const missingOnBoard = [...tasks.keys()].filter((id) => !onBoard.has(id));
  const missingFile = [...onBoard].filter((id) => !tasks.has(id));
  if (missingOnBoard.length) bad(`มีไฟล์ task แต่ไม่อยู่บน board: ${missingOnBoard.slice(0, 8).join(', ')}${missingOnBoard.length > 8 ? ' …' : ''} — รัน node .claude/board.js`);
  if (missingFile.length) bad(`อยู่บน board แต่ไม่มีไฟล์ task: ${missingFile.slice(0, 8).join(', ')}${missingFile.length > 8 ? ' …' : ''}`);
  if (!missingOnBoard.length && !missingFile.length) ok('board กับ tasks/ ตรงกัน');
  if (/<!--\s*generated by board\.js/.test(board)) {
    // board ที่ generate ต้องไม่เก่ากว่าไฟล์ task ล่าสุด
    const bt = fs.statSync(rel('docs/backlog/board.md')).mtimeMs;
    const newest = Math.max(0, ...[...tasks.values()].map(({ file }) => fs.statSync(rel(`${TASKS_DIR}/${file}`)).mtimeMs));
    if (newest > bt + 1000) warn('board.md เก่ากว่าไฟล์ task ล่าสุด — รัน node .claude/board.js');
  }
} else {
  warn('ยังไม่มี docs/backlog/board.md');
}

// ── 8. release gate ────────────────────────────────────────────────────
if (RELEASE_MS) {
  head(`Release gate — milestone ${RELEASE_MS}`);
  const inMs = [...tasks.entries()].filter(([, { fm }]) => fm.milestone === RELEASE_MS);
  if (!inMs.length) bad(`ไม่มี task ไหนอยู่ใน milestone ${RELEASE_MS}`);
  const notDone = inMs.filter(([, { fm }]) => fm.status !== 'done');
  if (notDone.length) bad(`${RELEASE_MS}: ยังไม่ done ${notDone.length} task: ${notDone.map(([id]) => id).join(', ')}`);
  else ok(`${RELEASE_MS}: task ทั้ง ${inMs.length} ตัว done แล้ว`);
  const testDebt = inMs.filter(([id, { fm }]) => /-test$/.test(id) && fm.status !== 'done');
  if (testDebt.length) bad(`${RELEASE_MS}: task -test ค้าง ${testDebt.length} ตัว — หนี้เทส frontend ต้องปิดก่อน release`);
  // spec ทั้งหมดของ milestone ต้องไม่เหลือ marker
  const specs = new Set(inMs.map(([, { fm }]) => fm.spec).filter((s) => !isPlaceholder(s)));
  for (const s of specs) {
    const dir = String(s).replace(/\/$/, '');
    if (!exists(dir)) continue;
    for (const sf of listMd(dir)) {
      const left = (read(`${dir}/${sf}`).match(NEEDS) || []).length;
      if (left) bad(`${dir}/${sf} ยังเหลือ [NEEDS CLARIFICATION] ${left} จุด`);
    }
  }
}

// ── สรุป ───────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`docs-lint — ต้องแก้: ${problems.length}    ควรดู: ${warnings.length}`);
if (problems.length) {
  console.log('\nที่ต้องแก้:');
  problems.forEach((p) => console.log(`  - ${p}`));
}
process.exit(problems.length ? 1 : 0);
