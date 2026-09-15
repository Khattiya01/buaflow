#!/usr/bin/env node
/**
 * ตรวจสุขภาพของ .claude/ — รันที่ราก repo ของโปรเจกต์จริง
 *
 *   node .claude/check-config.js
 *
 * ทำไมต้องมี: config ของ AI พังแบบ "เงียบ" ได้ ต่างจากโค้ดที่พังแล้วมี error
 *   - rule ที่ paths: ไม่ match โครงจริง จะไม่โหลดเลย โดยไม่มีอะไรฟ้อง
 *   - skill ที่ description กำกวม จะไม่ถูกเรียก หรือถูกเรียกผิดจังหวะ
 *   - hook ที่ path ผิด จะไม่ทำงาน ทั้งที่เขียนไว้ใน settings.json
 * ทั้งสามอย่างทำให้เข้าใจผิดว่ามีการป้องกันอยู่ ทั้งที่ไม่มี
 *
 * ใช้ใน Phase 7 (ตอนติดตั้ง) และ Phase 8 (ทุกรอบทบทวน)
 * exit 0 = ผ่าน | exit 1 = มีปัญหาที่ต้องแก้
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = process.argv[2] || process.cwd();
const CLAUDE = path.join(ROOT, '.claude');

const problems = [];
const warnings = [];
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); problems.push(m); };
const warn = (m) => { console.log(`  warn ${m}`); warnings.push(m); };
const head = (m) => console.log(`\n${m}\n${'-'.repeat(m.length)}`);

const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fields = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2].trim() === '') {
      const list = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = lines[j].match(/^\s*-\s*"?([^"]+?)"?\s*$/);
        if (!item) break;
        list.push(item[1]);
        i = j;
      }
      fields[kv[1]] = list;
    } else {
      fields[kv[1]] = kv[2].trim();
    }
  }
  return { fields, body: text.slice(m[0].length) };
}

// ── 1. โครงสร้างพื้นฐาน ────────────────────────────────────────────────
head('1. โครงสร้าง');
for (const p of ['.claude/skills', '.claude/rules', '.claude/hooks', '.claude/settings.json']) {
  exists(p) ? ok(p) : bad(`ไม่พบ ${p}`);
}
for (const p of ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md', 'docs/constitution.md']) {
  exists(p) ? ok(p) : bad(`ไม่พบ ${p}`);
}

// ── 2. AGENTS.md / CLAUDE.md ──────────────────────────────────────────
head('2. กติกาหลัก');
if (exists('AGENTS.md')) {
  const lines = read('AGENTS.md').split('\n').length;
  if (lines > 200) bad(`AGENTS.md ยาว ${lines} บรรทัด (เกิน 200 = AI เริ่มมองข้ามกฎบางข้อ) — ย้ายของที่ผูกกับไฟล์ไป rules`);
  else if (lines > 170) warn(`AGENTS.md ยาว ${lines} บรรทัด ใกล้เพดาน 200 แล้ว`);
  else ok(`AGENTS.md ${lines} บรรทัด`);

  if (/\{\{[^}]+\}\}/.test(read('AGENTS.md'))) bad('AGENTS.md ยังมี placeholder {{...}} ค้างอยู่');
  if (!/เคยทำผิด|gets wrong/i.test(read('AGENTS.md'))) warn('AGENTS.md ไม่มีหมวด "สิ่งที่ AI เคยทำผิด" — ระบบจะไม่เรียนรู้');
}
if (exists('CLAUDE.md')) {
  const first = read('CLAUDE.md').split('\n')[0].trim();
  first === '@AGENTS.md'
    ? ok('CLAUDE.md import AGENTS.md ถูกต้อง')
    : bad(`CLAUDE.md บรรทัดแรกต้องเป็น @AGENTS.md (เจอ: "${first}")`);
}

// ── 3. Rules: paths ต้อง match ไฟล์จริง ───────────────────────────────
head('3. Rules — paths ต้อง match โครงจริง');
let allFiles = [];
try {
  allFiles = fs.globSync('**/*', {
    cwd: ROOT,
    exclude: (p) => /(^|[\\/])(\.git|\.claude|node_modules|dist|build|coverage|\.next)([\\/]|$)/.test(p),
  })
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => { try { return fs.statSync(path.join(ROOT, p)).isFile(); } catch { return false; } });
} catch (e) {
  bad(`สแกนไฟล์ไม่ได้: ${e.message}`);
}

const coverage = new Map(allFiles.map((f) => [f, []]));
const rulesDir = path.join(CLAUDE, 'rules');
if (fs.existsSync(rulesDir)) {
  for (const rf of fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'))) {
    const fm = frontmatter(path.join(rulesDir, rf));
    if (!fm) { bad(`${rf}: ไม่มี frontmatter`); continue; }
    const patterns = fm.fields.paths;
    if (!patterns) { warn(`${rf}: ไม่มี paths: — จะโหลดทุก session เหมือน AGENTS.md (ตั้งใจไหม)`); continue; }

    let total = 0;
    const dead = [];
    for (const pat of Array.isArray(patterns) ? patterns : [patterns]) {
      let hits = [];
      try {
        hits = fs.globSync(pat, { cwd: ROOT }).map((p) => p.replace(/\\/g, '/')).filter((p) => coverage.has(p));
      } catch (e) {
        bad(`${rf}: pattern ใช้ไม่ได้ "${pat}" (${e.message})`);
        continue;
      }
      total += hits.length;
      if (!hits.length) dead.push(pat);
      for (const h of hits) coverage.get(h).push(rf.replace(/\.md$/, ''));
    }

    if (total === 0) bad(`${rf}: ไม่ match ไฟล์ไหนเลย = rule ตายเงียบ`);
    else if (dead.length) warn(`${rf}: match ${total} ไฟล์ แต่มี pattern ที่ไม่ match อะไรเลย ${dead.length} อัน -> ${dead.join(', ')} (ลบทิ้งหรือแก้ให้ตรงโครง)`);
    else ok(`${rf}: match ${total} ไฟล์ ทุก pattern ใช้งานจริง`);
  }
}

// ── 4. ไฟล์โค้ดที่ไม่มี rule คุ้มครอง ──────────────────────────────────
head('4. ไฟล์โค้ดที่ไม่มี rule คุ้มครอง');
const code = allFiles.filter((f) => /\.(ts|tsx|js|jsx|prisma|sql)$/.test(f) && !f.startsWith('docs/'));
const naked = code.filter((f) => coverage.get(f).length === 0);
if (!code.length) warn('ไม่เจอไฟล์โค้ดเลย (ยังไม่ scaffold?)');
else if (!naked.length) ok(`ไฟล์โค้ด ${code.length} ไฟล์ มี rule คุ้มครองครบ`);
else {
  warn(`${naked.length} จาก ${code.length} ไฟล์ไม่มี rule ไหนคุ้มครอง:`);
  naked.slice(0, 10).forEach((f) => console.log(`         ${f}`));
  if (naked.length > 10) console.log(`         ... และอีก ${naked.length - 10} ไฟล์`);
}

// ── 5. Skills ─────────────────────────────────────────────────────────
head('5. Skills');
const SIDE_EFFECT = ['done', 'hotfix', 'release'];
const skillsDir = path.join(CLAUDE, 'skills');
if (fs.existsSync(skillsDir)) {
  const descs = new Map();
  for (const dir of fs.readdirSync(skillsDir)) {
    const f = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(f)) { bad(`skills/${dir}/ ไม่มี SKILL.md`); continue; }
    const fm = frontmatter(f);
    if (!fm) { bad(`skills/${dir}: frontmatter ต้องขึ้นต้นบรรทัดแรกด้วย ---`); continue; }
    const issues = [];
    if (!fm.fields.description) issues.push('ไม่มี description (Claude จะไม่รู้ว่าเมื่อไหร่ควรใช้)');
    else if (fm.fields.description.length < 30) issues.push('description สั้นเกินจนไม่บอกเงื่อนไขที่ควรใช้');
    else descs.set(dir, fm.fields.description);

    const lines = fs.readFileSync(f, 'utf8').split('\n').length;
    if (lines > 150) issues.push(`ยาว ${lines} บรรทัด — แยกรายละเอียดไปไฟล์ประกอบในโฟลเดอร์เดียวกัน`);

    if (SIDE_EFFECT.includes(dir) && fm.fields['disable-model-invocation'] !== 'true')
      issues.push('มี side effect แต่ไม่ได้ตั้ง disable-model-invocation: true');

    issues.length ? issues.forEach((i) => warn(`skills/${dir}: ${i}`)) : ok(`skills/${dir} (${lines} บรรทัด)`);
  }
}

// ── 6. settings.json + hooks ──────────────────────────────────────────
head('6. settings.json และ hooks');
let settings = null;
if (exists('.claude/settings.json')) {
  try {
    settings = JSON.parse(read('.claude/settings.json'));
    ok('settings.json parse ได้');
  } catch (e) {
    bad(`settings.json ไม่ใช่ JSON ที่ถูกต้อง: ${e.message}`);
  }
}
if (settings?.hooks) {
  const cmds = JSON.stringify(settings.hooks).match(/[^"\\]*\.claude\/hooks\/[a-z-]+\.js/g) || [];
  const wired = new Set();
  for (const c of cmds) {
    const rel = '.claude/hooks/' + c.split('/').pop();
    wired.add(path.basename(rel));
    exists(rel) ? ok(`hook ผูกไว้และมีไฟล์จริง: ${path.basename(rel)}`) : bad(`settings.json ชี้ไปที่ ${rel} แต่ไม่มีไฟล์`);
  }
  const onDisk = fs.existsSync(path.join(CLAUDE, 'hooks'))
    ? fs.readdirSync(path.join(CLAUDE, 'hooks')).filter((f) => f.endsWith('.js'))
    : [];
  onDisk.filter((f) => !wired.has(f)).forEach((f) => warn(`hooks/${f} มีไฟล์แต่ไม่ได้ผูกใน settings.json = ไม่ทำงาน`));
} else if (settings) {
  warn('settings.json ไม่มี hooks เลย — กฎทั้งหมดเป็นแค่คำแนะนำ ไม่มีอะไรบังคับ');
}

// ── 7. hooks ทำงานจริงไหม ─────────────────────────────────────────────
head('7. hooks ทำงานจริงไหม (รันด้วย input จำลอง)');
const TEST_FILE = /\.(spec|test)\.[jt]sx?$|(^|\/)(tests?|__tests__|e2e)\//;
let branch = '';
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* ไม่ใช่ repo git ก็ไม่เป็นไร */ }
const onFixBranch = /^(fix|hotfix)\//.test(branch);
console.log(`  (branch ปัจจุบัน: ${branch || 'ไม่ทราบ'}${onFixBranch ? ' -> เป็น branch แก้บั๊ก' : ''})`);

const uiFile = code.find((f) => /components\/ui\//.test(f)) || 'src/components/ui/button.tsx';
// ต้องเลือกไฟล์ที่ "ไม่ใช่ไฟล์เทส" ไม่งั้นผลจะขึ้นกับ branch ที่กำลังยืนอยู่
const normalFile = code.find((f) => !TEST_FILE.test(f) && !/components\/ui\//.test(f)) || 'src/lib/util.ts';
const testFile = code.find((f) => TEST_FILE.test(f));

const cases = [
  ['guard-edit.js', { tool_input: { file_path: uiFile } }, 2, `บล็อกการแก้ ${uiFile}`],
  ['guard-edit.js', { tool_input: { file_path: normalFile } }, 0, `ปล่อยผ่าน ${normalFile}`],
  ['guard-bash.js', { tool_input: { command: 'git commit --no-verify -m x' } }, 2, 'บล็อก --no-verify'],
  ['guard-bash.js', { tool_input: { command: 'pnpm sonar' } }, 2, 'บล็อกการรัน sonar เอง'],
  ['guard-bash.js', { tool_input: { command: 'pnpm verify' } }, 0, 'ปล่อยผ่าน pnpm verify'],
];
// การกันแก้ไฟล์เทสขึ้นกับ branch — ตรวจให้ตรงกับที่ควรเป็นบน branch ที่ยืนอยู่จริง
if (testFile) {
  cases.push([
    'guard-edit.js',
    { tool_input: { file_path: testFile } },
    onFixBranch ? 2 : 0,
    onFixBranch ? `บล็อกการแก้ ${testFile} เพราะอยู่บน branch แก้บั๊ก` : `ปล่อยผ่าน ${testFile} เพราะไม่ได้อยู่บน branch แก้บั๊ก`,
  ]);
}
for (const [hook, input, want, label] of cases) {
  const hp = path.join(CLAUDE, 'hooks', hook);
  if (!fs.existsSync(hp)) { bad(`ไม่มี hooks/${hook}`); continue; }
  let got = 0;
  try {
    execFileSync(process.execPath, [hp], { cwd: ROOT, input: JSON.stringify(input), stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    got = e.status ?? -1;
  }
  got === want ? ok(`${hook}: ${label} (exit ${got})`) : bad(`${hook}: ${label} — คาดว่า exit ${want} แต่ได้ ${got}`);
}
const sc = path.join(CLAUDE, 'hooks', 'session-context.js');
if (fs.existsSync(sc)) {
  try {
    const out = execFileSync(process.execPath, [sc], { cwd: ROOT, input: '{}', encoding: 'utf8' });
    JSON.parse(out).hookSpecificOutput?.additionalContext
      ? ok('session-context.js คืน additionalContext ได้')
      : bad('session-context.js ไม่ได้คืน additionalContext');
  } catch (e) {
    bad(`session-context.js พัง: ${e.message.split('\n')[0]}`);
  }
}
if (testFile && !onFixBranch)
  warn(`ยังไม่ได้ทดสอบว่ากันแก้ไฟล์เทสตอนแก้บั๊กได้จริง — ต้องรันซ้ำบน branch fix/... (ดู hooks/README.md)`);

// ── 8. artifact chain ─────────────────────────────────────────────────
head('8. โฟลเดอร์ของ artifact chain');
for (const d of ['docs/intents', 'docs/plans', 'docs/specs', 'docs/evals', 'docs/adr', 'docs/backlog']) {
  exists(d) ? ok(d) : warn(`ยังไม่มี ${d} — สร้างพร้อม .gitkeep ไว้ก่อน`);
}
exists('docs/backlog/board.md') ? ok('docs/backlog/board.md') : warn('ยังไม่มี docs/backlog/board.md — hook session-context จะไม่มีอะไรฉีดเข้า context');

// ── สรุป ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`ต้องแก้: ${problems.length}    ควรดู: ${warnings.length}`);
if (problems.length) {
  console.log('\nที่ต้องแก้ก่อนใช้งานจริง:');
  problems.forEach((p) => console.log(`  - ${p}`));
}
console.log(
  problems.length
    ? '\nผลรวม: ยังไม่ผ่าน'
    : warnings.length
      ? '\nผลรวม: ผ่าน (มีข้อควรดูที่ไม่บล็อก)'
      : '\nผลรวม: ผ่านหมด'
);
process.exit(problems.length ? 1 : 0);
