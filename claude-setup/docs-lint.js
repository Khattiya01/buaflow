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
 *   9. (DV-002, warn เท่านั้น) มี docs/discovery/pain-point-register.md ที่มีแถวจริงแล้ว →
 *      intent ที่ไม่อ้าง pain-point id ไหนเลยจะถูกเตือน — โปรเจกต์ที่ไม่ได้ใช้ discovery layer (DV-001)
 *      ไม่มีไฟล์นี้ จึงไม่โดนเช็คข้อนี้เลย ไม่กระทบพฤติกรรมเดิม
 *  10. (IC-007, warn เท่านั้น) docs/elaboration/*.md: ข้อเสนอทุกข้อมีแหล่งที่มา ระดับ และการตัดสิน ·
 *      ข้อที่ accepted อยู่ใน requirements.md ของ spec · intent ที่ brief: open และ accepted ต้องผ่าน /elaborate
 *      (หรือประกาศ elaboration: skipped)
 *  11. (BC-008, warn เท่านั้น) task ที่ยังไม่ done สองตัวมี touches: ซ้ำกัน (ไฟล์เดียวกัน หรือไฟล์อยู่ใต้โฟลเดอร์ของอีกตัว)
 *      และไม่มี depends_on ต่อกันเป็นทอดระหว่างกัน = ทำพร้อมกันได้แล้ว conflict ตอน merge ·
 *      task ที่ไม่มี touches: ไม่ถูกเช็คข้อนี้ — โปรเจกต์เดิมไม่เห็นอะไรเปลี่ยน
 *
 * exit 0 = ผ่าน | exit 1 = มีข้อที่ต้องแก้
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const releaseIdx = args.indexOf('--release');
const RELEASE_MS = releaseIdx !== -1 ? args[releaseIdx + 1] : null;
// Exclude the value after --release only when that option is actually present.
// The old `i !== releaseIdx + 1` also excluded index 0 when releaseIdx was -1,
// so `node docs-lint.js /some/project` silently linted process.cwd() instead.
const ROOT = path.resolve(args.find((a, i) => !a.startsWith('--') && !(releaseIdx !== -1 && i === releaseIdx + 1)) || process.cwd());

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

  // 11. สอง task ที่เปิดพร้อมกันได้แตะไฟล์เดียวกัน
  const touching = [...tasks].filter(([, { fm }]) => fm.status !== 'done' && touchesOf(fm).length);
  if (touching.length) {
    let collisions = 0;
    for (let i = 0; i < touching.length; i++) {
      for (let j = i + 1; j < touching.length; j++) {
        const [a, { fm: fa }] = touching[i];
        const [b, { fm: fb }] = touching[j];
        if (dependsOn(a, b) || dependsOn(b, a)) continue;
        const shared = touchesOf(fa).filter((p) => touchesOf(fb).some((q) => overlaps(p, q)));
        if (!shared.length) continue;
        collisions++;
        warn(`${a} กับ ${b} แตะที่เดียวกัน (${shared.join(', ')}) และไม่มี depends_on ระหว่างกัน — แยก branch แล้วจะ conflict ตอน merge: รวม task, ใส่ depends_on หรือแตกใหม่ตาม feature`);
      }
    }
    if (!collisions) ok(`touches: task ที่เปิดอยู่ ${touching.length} ตัวไม่แตะไฟล์เดียวกันโดยไม่มีลำดับ`);
  }
}

/** touches: เป็น path หรือโฟลเดอร์ — glob ตัดเหลือส่วนหน้าที่ไม่มี wildcard (หยาบแต่ไม่พลาดการชน) */
function touchesOf(fm) {
  const list = Array.isArray(fm.touches) ? fm.touches : fm.touches ? [fm.touches] : [];
  return list
    .map((p) => String(p).trim().replace(/^[`'"]|[`'"]$/g, '').replace(/^\.\//, '').replace(/[*?[{].*$/, '').replace(/\/+$/, ''))
    .filter((p) => p && !isPlaceholder(p));
}
function overlaps(p, q) {
  return p === q || p.startsWith(`${q}/`) || q.startsWith(`${p}/`);
}

/** a รอ b อยู่ไหม — ตาม depends_on ต่อกันเป็นทอด */
function dependsOn(a, b, seen = new Set()) {
  if (seen.has(a)) return false;
  seen.add(a);
  const deps = tasks.get(a)?.fm.depends_on;
  const list = (Array.isArray(deps) ? deps : deps ? [deps] : []).filter((d) => !isPlaceholder(d));
  return list.includes(b) || list.some((d) => dependsOn(d, b, seen));
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

// ── 9. discovery linkage (DV-002, warn only) ──────────────────────────
// projects that never ran the discovery layer (DV-001) have no pain-point-register.md at all,
// so this block never runs for them — existing behavior for every other project is unchanged.
const PAIN_POINT_REGISTER = 'docs/discovery/pain-point-register.md';
if (exists(PAIN_POINT_REGISTER)) {
  head('Discovery linkage — docs/discovery/pain-point-register.md');
  const registerRows = read(PAIN_POINT_REGISTER).match(/^\|\s*(PP-\d+)\s*\|/gm) || [];
  // PP-000 คือแถวตัวอย่างในตัว template เอง (pain-point-register.tpl.md) ไม่ใช่ pain point จริง — ตัดทิ้ง
  const painPointIds = new Set(registerRows.map((row) => row.match(/PP-\d+/)[0]).filter((id) => id !== 'PP-000'));
  if (!painPointIds.size) {
    ok('ทะเบียน pain point ยังไม่มีแถวจริง (มีแต่ตัวอย่าง PP-000) — ยังไม่ต้องเช็ค linkage');
  } else if (!exists(INTENTS_DIR)) {
    warn(`มี ${PAIN_POINT_REGISTER} แล้วแต่ยังไม่มี ${INTENTS_DIR} ให้เช็ค linkage`);
  } else {
    // เช็คแค่ intent — spec ที่โยงมาจาก intent (เช็คข้อ 7 ด้านบนแล้ว) สืบทอด linkage นี้ต่อโดยอัตโนมัติ
    // ผ่านสายที่มีอยู่แล้ว ไม่ต้องเช็คซ้ำที่ชั้น spec
    let unlinked = 0;
    for (const f of listMd(INTENTS_DIR)) {
      const text = read(`${INTENTS_DIR}/${f}`);
      const linked = [...painPointIds].some((id) => text.includes(id));
      if (!linked) {
        warn(`intents/${f}: ไม่อ้าง pain-point id ใดเลย (มีในทะเบียน: ${[...painPointIds].join(', ')}) — โปรเจกต์นี้ใช้ discovery layer แล้ว ควรโยงกลับถ้าเกี่ยวข้อง`);
        unlinked++;
      }
    }
    if (!unlinked) ok(`intent ทุกไฟล์อ้างถึง pain point ในทะเบียนแล้ว (${painPointIds.size} pain point)`);
  }
}

// ── 10. elaboration (IC-007, warn only) ───────────────────────────────
// /intent จดคำของลูกค้าตามจริงและห้ามเดา ⇒ ถ้าไม่มีขั้นที่สั่งให้คิดต่อ ไม่มีใครถามว่าที่ขอมาพอจะถึงเป้าหมายไหม
// /elaborate คือขั้นนั้น ส่วนตรงนี้ตรวจว่าข้อเสนอทุกข้อมีคนตัดสิน และข้อที่รับแล้วไปถึง spec จริง
// ใช้เฉพาะโปรเจกต์ที่มี docs/elaboration/ หรือ intent ที่ประกาศ brief: open ⇒ โปรเจกต์เดิมไม่โดนอะไรเลย
const ELABORATION_DIR = 'docs/elaboration';
const LEVELS = new Set(['must', 'should', 'could']);
const DECISIONS = new Set(['pending', 'accepted', 'change-request', 'rejected', 'deferred']);
const intentFiles = exists(INTENTS_DIR) ? listMd(INTENTS_DIR) : [];
const intentFile = (id) => intentFiles.find((f) => f === `${id}.md` || f.startsWith(`${id}-`));
const elaborated = new Set();
const elaborationFiles = exists(ELABORATION_DIR) ? listMd(ELABORATION_DIR) : [];
const openIntents = intentFiles.filter((f) => frontmatter(read(`${INTENTS_DIR}/${f}`))?.brief === 'open');
if (elaborationFiles.length || openIntents.length) head('Elaboration — docs/elaboration/ (IC-007)');
for (const f of elaborationFiles) {
  const file = `${ELABORATION_DIR}/${f}`;
  const text = read(file);
  const fm = frontmatter(text) || {};
  const intentName = !isPlaceholder(fm.intent) && intentFile(fm.intent);
  if (!intentName) { warn(`${file}: intent: ไม่ชี้ไป intent ที่มีจริง — ข้อเสนอที่ไม่รู้ว่ามาจากคำขอไหนตัดสินไม่ได้`); continue; }
  elaborated.add(intentName);
  const rows = text.split(/\r?\n/)
    .filter((line) => /^\|\s*E-\d+\s*\|/.test(line) && !/^\|\s*E-000\s*\|/.test(line))
    .map((line) => line.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim()));
  const pending = [];
  const accepted = [];
  for (const cells of rows) {
    const [id, , , source] = cells;
    const level = cells[cells.length - 2];
    const decision = cells[cells.length - 1];
    if (cells.length < 6) { warn(`${file}: ${id} มี ${cells.length} ช่อง ไม่ครบ 6 (ID/ข้อเสนอ/ทำไม/แหล่งที่มา/ระดับ/การตัดสิน) — มี | ในช่องหรือเปล่า`); continue; }
    if (!source || /^[-–—]?$|^</.test(source)) warn(`${file}: ${id} ไม่มีแหล่งที่มา — ใส่ URL ที่อ่านจริง path ใน repo หรือบอกตรง ๆ ว่ามาจากความรู้ทั่วไป`);
    if (!LEVELS.has(level)) warn(`${file}: ${id} ระดับ "${level}" ไม่ใช่ ${[...LEVELS].join('/')}`);
    if (!DECISIONS.has(decision)) warn(`${file}: ${id} การตัดสิน "${decision}" ไม่ใช่ ${[...DECISIONS].join('/')}`);
    if (decision === 'pending') pending.push(id);
    if (decision === 'accepted') accepted.push(id);
  }
  const intentStatus = frontmatter(read(`${INTENTS_DIR}/${intentName}`))?.status;
  const specDir = isPlaceholder(fm.spec) ? null : String(fm.spec).replace(/\/$/, '');
  if (pending.length && (intentStatus === 'accepted' || specDir))
    warn(`${file}: ยังไม่ตัดสิน ${pending.length} ข้อ (${pending.join(', ')}) ทั้งที่งานไปต่อแล้ว — ปิดรอบให้เปลี่ยนเป็น deferred ไม่ใช่ปล่อย pending`);
  if (specDir && accepted.length) {
    const reqFile = `${specDir}/requirements.md`;
    if (!exists(reqFile)) warn(`${file}: spec: ชี้ไป ${specDir} แต่ไม่มี requirements.md`);
    else {
      const missing = accepted.filter((id) => !new RegExp(`\\b${id}\\b`).test(read(reqFile)));
      if (missing.length) warn(`${file}: รับแล้วแต่ไม่อยู่ใน ${reqFile}: ${missing.join(', ')} — ข้อที่ตกลงแล้วต้องเป็น requirement ที่อ้าง E-xx`);
    }
  }
  ok(`${file}: ${rows.length} ข้อเสนอ · รับ ${accepted.length} · ค้าง ${pending.length}`);
}
for (const f of openIntents) {
  const fm = frontmatter(read(`${INTENTS_DIR}/${f}`));
  if (fm.status === 'accepted' && !elaborated.has(f) && fm.elaboration !== 'skipped')
    warn(`intents/${f}: brief: open และ accepted แล้ว แต่ไม่มี docs/elaboration/ ของมัน — รัน /elaborate หรือใส่ elaboration: skipped ถ้าตั้งใจข้าม`);
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
// ── IC-002: ถามเฉพาะสิ่งที่เปลี่ยนการตัดสินใจจริง และมีงบคำถาม ──────────────────
// คำถามที่ไม่บอกว่าคำตอบจะเปลี่ยนอะไร คือคำถามที่ AI ถามเพราะถามได้ ไม่ใช่เพราะต้องรู้ · ผลที่เห็นจริง
// ใน eval EV-002 ของ trial แรก: ถาม 4 ข้อแต่มีข้อเสนอพร้อมเหตุผลข้อเดียว · tag บังคับให้ต้องคิดก่อนถาม
// ว่าคำตอบเปลี่ยน architecture / security / cost / data / scope / ux / legal ข้อไหน · ถ้าไม่เปลี่ยนอะไร
// ให้ตั้งค่าเริ่มต้นแล้วบอก หรือบันทึกเป็น assumption (IC-004) แทนการถาม · warn ใน 3.x
const DIMENSIONS = new Set(['architecture', 'security', 'cost', 'data', 'scope', 'ux', 'legal']);
const QUESTION_BUDGET = 8;
const questionFiles = [
  ...(exists('docs/intents') ? listMd('docs/intents').map((f) => `docs/intents/${f}`) : []),
  ...(exists('docs/specs') ? fs.readdirSync(path.join(ROOT, 'docs', 'specs'), { withFileTypes: true }).filter((e) => e.isDirectory()).flatMap((e) => listMd(`docs/specs/${e.name}`).map((f) => `docs/specs/${e.name}/${f}`)) : []),
];
let questionsSeen = 0;
if (questionFiles.length) head('Clarification budget (IC-002)');
for (const file of questionFiles) {
  const markers = read(file).match(NEEDS) || [];
  questionsSeen += markers.length;
  const untagged = markers.filter((m) => {
    const tag = m.match(/^\[NEEDS CLARIFICATION\s*\(([a-z]+)\)/i);
    return !tag || !DIMENSIONS.has(tag[1].toLowerCase());
  });
  if (untagged.length) warn(`${file}: ${untagged.length} คำถามไม่บอกว่าคำตอบเปลี่ยนการตัดสินใจเรื่องไหน — เขียนเป็น [NEEDS CLARIFICATION (security): …] (${[...DIMENSIONS].join('/')}) ถ้าไม่เปลี่ยนอะไรเลย ไม่ต้องถาม`);
  if (markers.length > QUESTION_BUDGET) warn(`${file}: คำถามค้าง ${markers.length} ข้อ เกินงบ ${QUESTION_BUDGET} — ข้อที่ผลกระทบต่ำให้ตั้งค่าเริ่มต้นหรือบันทึกเป็น assumption แทน`);
}
if (questionsSeen) ok(`คำถามค้าง ${questionsSeen} ข้อใน intents/specs`);

// ── IC-005: acceptance criteria เป็น EARS และ trace ไปที่ test plan ได้ ─────────
// spec skill สั่งมาตลอดว่า AC ต้องเป็น EARS 4 แบบและ design ต้องมี test plan ต่อ AC แต่ไม่มีอะไรตรวจ
// ⇒ AI เขียน "ระบบต้องจัดการ error ได้ดี" แล้วไม่มีใครรู้จนถึงตอนเขียนเทส · เป็น warn ใน 3.x โดยตั้งใจ
// (โปรเจกต์ที่มี spec อยู่แล้วไม่ควรตกทันทีจาก MINOR release) ตาม standards/release-policy.md
const EARS = [
  /^WHEN\b.+\bTHE SYSTEM SHALL\b/i,
  /^WHILE\b.+\bTHE SYSTEM SHALL\b/i,
  /^IF\b.+\bTHEN THE SYSTEM SHALL\b/i,
  /^THE SYSTEM SHALL\b/i,
];
if (exists('docs/specs')) {
  head('Requirements — EARS + trace (IC-005)');
  let acTotal = 0;
  for (const spec of fs.readdirSync(path.join(ROOT, 'docs', 'specs'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const reqFile = `docs/specs/${spec}/requirements.md`;
    if (!exists(reqFile)) continue;
    const acs = [];
    for (const line of read(reqFile).split(/\r?\n/)) {
      const m = line.match(/\*\*(AC-\d+)\*\*\s*(.*)$/);
      if (m) acs.push({ id: m[1], text: m[2].replace(/\*\*/g, '').trim() });
    }
    acTotal += acs.length;
    const seenAc = new Set();
    for (const ac of acs) {
      if (seenAc.has(ac.id)) warn(`${reqFile}: ${ac.id} ซ้ำ — trace ไปเทสไม่ได้ถ้า id ไม่ unique`);
      seenAc.add(ac.id);
      if (!EARS.some((form) => form.test(ac.text))) warn(`${reqFile}: ${ac.id} ไม่ใช่ EARS 4 แบบ (WHEN/WHILE/IF…THEN/THE SYSTEM SHALL) — แปลงเป็นชื่อเทสตรง ๆ ไม่ได้`);
    }
    const trace = ['design.md', 'tasks.md'].map((f) => `docs/specs/${spec}/${f}`).filter(exists).map(read).join('\n');
    if (trace) {
      const untraced = [...seenAc].filter((id) => !new RegExp(`\\b${id}\\b`).test(trace));
      if (untraced.length) warn(`${reqFile}: ${untraced.join(', ')} ไม่ถูกอ้างใน design.md/tasks.md — AC ที่ไม่มีทางพิสูจน์คือ AC ที่เขียนไม่ดี`);
    }
  }
  if (acTotal) ok(`ตรวจ AC ${acTotal} ข้อใน docs/specs/`);
}

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
