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

// resolve: a relative root such as '.' made require(path.join(ROOT, '.claude', ...)) look for a
// package named '.claude', so the project's stack.json was silently ignored (found during EV-010)
const ROOT = path.resolve(process.argv[2] || process.cwd());
const CLAUDE = path.join(ROOT, '.claude');

// stack ของโปรเจกต์มาจาก .claude/stack.json — ถ้าไม่มีก็เป็นค่าเริ่มต้นเดิมของ kit (JS/TS)
let stack;
let stackConfigAvailable = true;
try {
  stack = require(path.join(CLAUDE, 'stack-config.js')).load(ROOT);
} catch {
  // ติดตั้งเก่าที่ยังไม่มี stack-config.js — ต้องเป็นค่าเดิมของ kit เป๊ะ ๆ ไม่งั้นจะรายงานผิด
  // (เคยพลาดมาแล้ว: fallback ที่ protected/formatCommands ว่าง ทำให้ข้ามเทสและเตือน formatter ผิด)
  stackConfigAvailable = false;
  const legacy = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(CLAUDE, 'protected-paths.json'), 'utf8')); } catch { return {}; }
  })();
  stack = {
    codeFilePattern: '\\.(ts|tsx|js|jsx|prisma|sql)$',
    testFilePattern: legacy.testFilePattern || '\\.(spec|test)\\.[jt]sx?$|(^|/)(tests?|__tests__|e2e)/',
    bugfixBranchPattern: legacy.bugfixBranchPattern || '^(fix|hotfix)/',
    preflightHookPath: '.husky/pre-push',
    protected: Array.isArray(legacy.protected) ? legacy.protected : [{ pattern: '**/components/ui/**' }],
    formatCommands: [
      { id: 'biome', when: ['biome.json', 'biome.jsonc'] },
      { id: 'prettier', when: ['.prettierrc', '.prettierrc.json', 'prettier.config.js', '.prettierrc.cjs'] },
      { id: 'eslint', when: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.cjs'] },
    ],
  };
}

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
  // EV-009 K-6: ข้อนี้เคยอ่านได้ว่า "CLAUDE.md ต้องเป็นชั้นบาง ๆ" ซึ่งถูกกับโปรเจกต์ใหม่ แต่กับ
  // brownfield ที่ดูแล CLAUDE.md มาอย่างดี (trial แรกมี 153 บรรทัด) มันคือคำสั่งให้รื้อ · สิ่งที่ต้องการ
  // จริงมีข้อเดียวคือ AGENTS.md ถูก import ก่อนเนื้อหาอื่น — เนื้อหาเดิมอยู่ต่อใต้บรรทัดนั้นได้ทั้งหมด
  const lines = read('CLAUDE.md').split('\n').map((line) => line.trim());
  const at = lines.indexOf('@AGENTS.md');
  if (at === 0) ok('CLAUDE.md import AGENTS.md ถูกต้อง');
  else if (at > 0) warn(`CLAUDE.md import AGENTS.md ที่บรรทัด ${at + 1} — ย้ายขึ้นไปบรรทัดแรกเพื่อให้กฎกลางถูกอ่านก่อนเนื้อหาเฉพาะของ Claude Code`);
  else bad(`CLAUDE.md ไม่ได้ import AGENTS.md (บรรทัดแรก: "${lines[0]}") — เติม @AGENTS.md เป็นบรรทัดแรกบรรทัดเดียว เนื้อหาเดิมเก็บไว้ได้ทั้งหมด ไม่ต้องรื้อหรือย้ายไปไหน`);
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
let rulesChecked = 0;
let rulesDead = 0;
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

    rulesChecked++;
    if (total === 0) { rulesDead++; bad(`${rf}: ไม่ match ไฟล์ไหนเลย = rule ตายเงียบ`); }
    else if (dead.length) warn(`${rf}: match ${total} ไฟล์ แต่มี pattern ที่ไม่ match อะไรเลย ${dead.length} อัน -> ${dead.join(', ')} (ลบทิ้งหรือแก้ให้ตรงโครง)`);
    else ok(`${rf}: match ${total} ไฟล์ ทุก pattern ใช้งานจริง`);
  }
}

// rule ตายทั้งหมด = โครงไฟล์ไม่ตรงกับที่ rule คาดไว้ทั้งชุด ไม่ใช่พิมพ์ผิดทีละอัน
// แยกข้อความนี้ออกมาเพื่อไม่ให้คนอ่านเห็น FAIL 5-6 บรรทัดแล้วไล่แก้ทีละไฟล์โดยไม่รู้สาเหตุร่วม
if (rulesChecked > 1 && rulesDead === rulesChecked)
  console.log(
    `\n  วินิจฉัย: rule ทั้ง ${rulesDead} ไฟล์ไม่ match อะไรเลยพร้อมกัน = paths: ยังเป็นค่าของ kit (JS/TS) ไม่ใช่โครงจริงของโปรเจกต์นี้\n` +
      '            ถ้า stack ไม่ใช่ JS/TS ให้เขียน rules ใหม่ตาม convention ของ stack นั้น (phases/A-adopt-existing.md ข้อ A.5)\n' +
      '            rule ที่ยังไม่มีของจริงให้คุ้มครอง = ลบทิ้ง ดีกว่าเก็บไว้แล้วเข้าใจว่ามีกฎคุมอยู่'
  );

// ── 4. ไฟล์โค้ดที่ไม่มี rule คุ้มครอง ──────────────────────────────────
head('4. ไฟล์โค้ดที่ไม่มี rule คุ้มครอง');
const CODE_RE = new RegExp(stack.codeFilePattern);
const code = allFiles.filter((f) => CODE_RE.test(f) && !f.startsWith('docs/'));
const naked = code.filter((f) => coverage.get(f).length === 0);
if (!code.length)
  warn(
    `ไม่เจอไฟล์ที่ match codeFilePattern (${stack.codeFilePattern}) เลย — ` +
      'ถ้ายังไม่ scaffold ก็ปกติ แต่ถ้าโปรเจกต์มีโค้ดอยู่แล้วแปลว่า pattern ไม่ตรง stack: ตั้ง "codeFilePattern" ใน .claude/stack.json'
  );
else if (!naked.length) ok(`ไฟล์โค้ด ${code.length} ไฟล์ มี rule คุ้มครองครบ`);
else {
  warn(`${naked.length} จาก ${code.length} ไฟล์ไม่มี rule ไหนคุ้มครอง:`);
  naked.slice(0, 10).forEach((f) => console.log(`         ${f}`));
  if (naked.length > 10) console.log(`         ... และอีก ${naked.length - 10} ไฟล์`);
}

// ── 5. Skills ─────────────────────────────────────────────────────────
head('5. Skills');
const SIDE_EFFECT = ['done', 'hotfix', 'release'];
// ชื่อที่ชนกับ built-in ของ Claude Code (คำสั่งหรือ alias) — custom skill ชื่อเดียวกันจะกำกวมว่าเรียกตัวไหน
const BUILTIN_NAMES = ['review', 'code-review', 'security-review', 'simplify', 'init', 'doctor', 'checkup', 'insights',
  'context', 'usage', 'cost', 'memory', 'compact', 'clear', 'rewind', 'model', 'config', 'help', 'import', 'loop', 'schedule', 'run'];
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

    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n').length;
    if (lines > 150) issues.push(`ยาว ${lines} บรรทัด — แยกรายละเอียดไปไฟล์ประกอบในโฟลเดอร์เดียวกัน`);

    if (SIDE_EFFECT.includes(dir) && fm.fields['disable-model-invocation'] !== 'true')
      issues.push('มี side effect แต่ไม่ได้ตั้ง disable-model-invocation: true');

    if (BUILTIN_NAMES.includes((fm.fields.name || dir).toLowerCase()))
      bad(`skills/${dir}: ชื่อ "${fm.fields.name || dir}" ชนกับคำสั่ง/alias built-in ของ Claude Code — เปลี่ยนชื่อ (เช่น review → check)`);

    // !`cmd` ที่ fail จะ abort ทั้ง skill (docs) — git diff HEAD บน repo ที่ยังไม่มี commit พังได้
    const injections = [...text.matchAll(/!`([^`]+)`/g)].map((m) => m[1]);
    const fragile = injections.filter((c) => !/\|\|\s*true\s*$/.test(c.trim()));
    if (fragile.length) issues.push(`มี !\`…\` ที่ไม่มี "|| true" ${fragile.length} ตัว — ถ้าคำสั่ง fail ทั้ง skill จะ abort: ${fragile.map((c) => c.slice(0, 30)).join(' / ')}`);

    issues.length ? issues.forEach((i) => warn(`skills/${dir}: ${i}`)) : ok(`skills/${dir} (${lines} บรรทัด)`);
  }
}

if (fs.existsSync(path.join(CLAUDE, 'commands')))
  bad('.claude/commands/ ยังอยู่ (ของ kit v1.0) — ลบทิ้ง: /review เดิมชนกับ built-in และ /check ใหม่ (ดู UPGRADE.md ข้อ 3)');

// ── 5b. Agents ────────────────────────────────────────────────────────
head('5b. Agents');
const agentsDir = path.join(CLAUDE, 'agents');
if (fs.existsSync(agentsDir)) {
  for (const af of fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')) {
    const fm = frontmatter(path.join(agentsDir, af));
    if (!fm) { bad(`agents/${af}: ไม่มี frontmatter`); continue; }
    if (!fm.fields.description) warn(`agents/${af}: ไม่มี description`);
    if (!fm.fields.model) warn(`agents/${af}: ไม่มี model: — จะใช้โมเดลหลัก (แพงสุด) กับงานที่ไม่ต้องคิด ดู standards/context-budget.md §4`);
    else ok(`agents/${af} (model: ${fm.fields.model})`);
  }
} else {
  warn('ไม่มี .claude/agents/');
}

// ── 5c. สคริปต์ของ gate ───────────────────────────────────────────────
head('5c. สคริปต์ gate');
for (const s of ['docs-lint.js', 'board.js', 'gate.js']) {
  exists(`.claude/${s}`) ? ok(`.claude/${s}`) : warn(`ไม่มี .claude/${s} — กฎเรื่อง artifact chain / board / ด่านก่อน main จะเป็นแค่ข้อความ`);
}
for (const s of ['stack-config.js', 'verify.js', 'run.js']) {
  exists(`.claude/${s}`) ? ok(`.claude/${s}`) : warn(`ไม่มี .claude/${s} — สคริปต์จะถอยไปใช้ค่าเริ่มต้น JS/TS และ skill จะเรียก verify ของ stack อื่นไม่ได้ (ดู UPGRADE.md)`);
}
const preflight = stack.preflightHookPath;
const ciMode = stack.ciMode || 'required';
const localOnly = ciMode === 'local-only';

// ใน CI (hosted หรือ buaflow ci) checkout เป็น clone ใหม่ที่ไม่มีวันมี .git/hooks/* เพราะ hook ไม่อยู่ใน git
// การติดตั้ง hook เป็นคุณสมบัติของเครื่องคน ไม่ใช่ของ checkout — ตรวจตรงนี้ใน CI ตกเสมอโดยไม่บอกอะไร
// (เจอจริงตอน local CI ครั้งแรกของ trial EV-009) · husky ที่ commit .husky/pre-push ไว้ยังถูกตรวจตามปกติ
const inCi = process.env.CI === 'true' || process.env.BUAFLOW_LOCAL_CI === '1';
const untracked = /^\.git\//.test(preflight.replace(/\\/g, '/'));
if (inCi && untracked && !exists(preflight)) {
  ok(`${preflight} ไม่อยู่ใน git จึงไม่มีใน checkout ของ CI — ตรวจบนเครื่องคนแทน (รัน check-config นอก CI)`);
} else if (exists(preflight)) {
  /gate\.js/.test(read(preflight))
    ? ok(`${preflight} เรียก gate.js`)
    : (localOnly ? bad : warn)(`${preflight} มีอยู่แต่ไม่ได้เรียก gate.js`);
} else {
  const how = `ถ้าโปรเจกต์ไม่ได้ใช้ husky ให้ตั้ง "preflightHookPath" ใน .claude/stack.json (เช่น .git/hooks/pre-push)`;
  // ciMode: local-only = ประกาศแล้วว่าไม่มี CI -> hook ตัวนี้คือด่านเดียวที่เหลือ ไม่ใช่ของเสริม
  localOnly
    ? bad(`ไม่มี ${preflight} แต่ ciMode = local-only — เท่ากับไม่มีด่านไหนบังคับเลยนอก session ของ Claude · ${how}`)
    : warn(`ไม่มี ${preflight} — gate จะรันแค่ใน CI (ถ้ามี) คนที่ push จากเครื่องข้ามได้ · ${how}`);
}

const ciFiles = ['.github/workflows/gate.yml', '.gitlab-ci.yml'].filter(exists);
if (localOnly) {
  ciFiles.length
    ? warn(`ciMode = local-only แต่ยังมีไฟล์ CI อยู่ (${ciFiles.join(', ')}) — ถ้าไม่ได้ใช้แล้วให้ลบ ไม่งั้นเข้าใจผิดว่ามีด่านที่ CI`)
    : ok('ciMode = local-only — ไม่มีไฟล์ CI ตามที่ตั้งใจ (ด่านอยู่ที่ pre-push)');
} else if (ciFiles.length) {
  ok(`CI: ${ciFiles.join(', ')} (ciMode = ${ciMode})`);
} else {
  warn(
    `ยังไม่มีไฟล์ CI (gate.yml / .gitlab-ci.yml) — วางจาก claude-setup/ci/ ได้เลยแม้ยังไม่เลือก host · ` +
      'ถ้าตั้งใจไม่ใช้ CI (นาทีหมด / ไม่มี remote) ให้ตั้ง "ciMode": "local-only" ใน .claude/stack.json แล้วเช็กว่า pre-push ติดตั้งจริง'
  );
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
// EV-009 K-11: trial แรกยังมี Bash(pnpm verify) ฯลฯ จาก template ทั้งที่โปรเจกต์ใช้ npm ⇒ คำสั่งตรวจจริง
// ไม่มีตัวไหนอยู่ใน allow · ใน session ที่ไม่มีคนกดอนุญาต (eval, CI, agent เบื้องหลัง) มันถูกปฏิเสธเงียบ ๆ
// และ eval EV-003 ตกเพราะ AI รัน verify ไม่ได้ ไม่ใช่เพราะไม่อยากรัน
const LOCKFILES = { pnpm: /(^|\/)pnpm-lock\.yaml$/, yarn: /(^|\/)yarn\.lock$/, bun: /(^|\/)bun\.lockb?$/ };
for (const [manager, lockfile] of Object.entries(LOCKFILES)) {
  const entries = (settings?.permissions?.allow || []).filter((entry) => new RegExp(`^Bash\\(${manager}\\b`).test(entry));
  if (entries.length && !allFiles.some((file) => lockfile.test(file))) {
    warn(`permissions.allow มี ${entries.length} รายการของ ${manager} (${entries[0]}…) แต่ไม่มี lockfile ของ ${manager} ในโปรเจกต์ — คำสั่งตรวจจริงไม่ได้รับอนุญาต ใส่คำสั่งที่โปรเจกต์ใช้จริงแทน (A.5)`);
  }
}

const ppFile = ['.claude/stack.json', '.claude/protected-paths.json'].find(exists);
if (ppFile) {
  try {
    const pp = JSON.parse(read(ppFile));
    const name = path.basename(ppFile);
    const list = Array.isArray(pp.protected) ? pp.protected : [];
    const noReason = list.filter((r) => !r.reason);
    if (!list.length) warn(`${name} ไม่มีรายการ protected เลย`);
    else if (noReason.length) warn(`${name}: ${noReason.length} รายการไม่มี reason — Claude จะไม่รู้ทางที่ถูกตอนถูกบล็อก`);
    else ok(`${name}: ${list.length} รายการ มี reason ครบ`);
    // pattern ที่ไม่ match อะไรเลย = อาจคัดลอกมาดิบ ๆ จากโปรเจกต์อื่น
    for (const r of list) {
      if (!r.pattern) continue;
      let hits = 0;
      try { hits = fs.globSync(r.pattern, { cwd: ROOT }).length; } catch { /* pattern แปลก ๆ ให้ hook ตัดสินเอง */ }
      if (!hits) warn(`${name}: "${r.pattern}" ไม่ match ไฟล์ไหนในโปรเจกต์ (ยังไม่มี หรือคัดลอกมาจาก stack อื่น)`);
    }
    if (name === 'protected-paths.json' && !exists('.claude/stack.json'))
      warn('ยังใช้ protected-paths.json อยู่ — ย้ายไป .claude/stack.json ได้ (รวมคีย์อื่นของ stack ไว้ที่เดียว ดู UPGRADE.md) ไฟล์เดิมยังอ่านได้ต่อไป');
  } catch (e) {
    bad(`${path.basename(ppFile)} ไม่ใช่ JSON ที่ถูกต้อง: ${e.message} (hook จะถอยไปใช้ค่าเริ่มต้นเงียบ ๆ)`);
  }
} else {
  warn('ไม่มี .claude/stack.json — guard-edit จะใช้ค่าเริ่มต้น (components/ui/** เท่านั้น) และสคริปต์อื่นจะถือว่า stack เป็น JS/TS');
}

// hook ที่ไม่มีอะไรให้ทำ = exit 0 ทุกครั้งเหมือนทำงานปกติ ต้องฟ้องตรงนี้ ไม่งั้นเข้าใจว่า format-on-save ต่อแล้ว
if (exists('.claude/hooks/format-changed.js')) {
  const active = (stack.formatCommands || []).filter((f) => Array.isArray(f.when) && f.when.some(exists));
  active.length
    ? ok(`format-changed.js: ใช้ ${active.map((f) => f.id || f.cmd).join(', ')}`)
    : warn(
        'format-changed.js ผูกไว้แต่ไม่มี formatter ตัวไหน match โปรเจกต์นี้เลย = hook ไม่ทำอะไร ' +
          (stackConfigAvailable ? 'ตั้ง "formatCommands" ใน .claude/stack.json' : 'คัดลอก stack-config.js + stack.json มาก่อน')
      );
}

// ── 7. hooks ทำงานจริงไหม ─────────────────────────────────────────────
head('7. hooks ทำงานจริงไหม (รันด้วย input จำลอง)');
const TEST_FILE = new RegExp(stack.testFilePattern);
let branch = '';
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* ไม่ใช่ repo git ก็ไม่เป็นไร */ }
const onFixBranch = new RegExp(stack.bugfixBranchPattern).test(branch);
console.log(`  (branch ปัจจุบัน: ${branch || 'ไม่ทราบ'}${onFixBranch ? ' -> เป็น branch แก้บั๊ก' : ''})`);

// ต้องใช้ "ไฟล์ที่มีอยู่จริง" เท่านั้น — guard-edit ตัดสินจาก pattern ล้วน ไฟล์สมมติจึงได้ exit ตามที่คาด
// เสมอแล้วรายงานว่าผ่าน ทั้งที่ไม่ได้พิสูจน์ว่า config ตรงกับโครงจริงของโปรเจกต์เลย (เขียวปลอม)
const protectedHits = new Set();
for (const r of stack.protected || []) {
  if (!r.pattern) continue;
  try {
    fs.globSync(r.pattern, { cwd: ROOT }).forEach((p) => protectedHits.add(p.replace(/\\/g, '/')));
  } catch { /* pattern แปลก ๆ ให้ hook ตัดสินเอง */ }
}
const isFile = (p) => { try { return fs.statSync(path.join(ROOT, p)).isFile(); } catch { return false; } };
const protectedFile = [...protectedHits].find(isFile) || null;
// ต้องเลือกไฟล์ที่ "ไม่ใช่ไฟล์เทส" ไม่งั้นผลจะขึ้นกับ branch ที่กำลังยืนอยู่
const normalFile = code.find((f) => !TEST_FILE.test(f) && !protectedHits.has(f)) || null;
const testFile = code.find((f) => TEST_FILE.test(f));
const verifyCmd = (() => {
  try { return require(path.join(CLAUDE, 'stack-config.js')).resolveVerify(ROOT); } catch { return null; }
})() || 'pnpm verify';

const cases = [
  ['guard-bash.js', { tool_input: { command: 'git commit --no-verify -m x' } }, 2, 'บล็อก --no-verify'],
  ['guard-bash.js', { tool_input: { command: 'pnpm sonar' } }, 2, 'บล็อกการรัน sonar เอง'],
  ['guard-bash.js', { tool_input: { command: verifyCmd } }, 0, `ปล่อยผ่าน ${verifyCmd}`],
  ['guard-bash.js', { tool_input: { command: 'git push origin HEAD:main' } }, 2, 'บล็อก push ตรงเข้า main'],
  ['guard-bash.js', { tool_input: { command: 'git push --no-verify' } }, 2, 'บล็อก push --no-verify'],
  ['guard-bash.js', { tool_input: { command: 'git push -u origin feat/x' } }, 0, 'ปล่อยผ่าน push branch feature'],
  ['guard-edit.js', { tool_input: { file_path: 'docs/backlog/board.md' } }, ppFile && /board\.md/.test(read(ppFile)) ? 2 : 0, 'board.md (generate) ถูกกันตาม protected'],
];

if (protectedFile) cases.unshift(['guard-edit.js', { tool_input: { file_path: protectedFile } }, 2, `บล็อกการแก้ ${protectedFile}`]);
else warn('ข้ามเทส "บล็อกไฟล์ protected" — ไม่มีไฟล์จริงในโปรเจกต์ที่ match pattern ไหนใน protected เลย จึงยังพิสูจน์ไม่ได้ว่ารายการนี้ตรงกับโครงจริง');

if (normalFile) cases.splice(1, 0, ['guard-edit.js', { tool_input: { file_path: normalFile } }, 0, `ปล่อยผ่าน ${normalFile}`]);
else warn('ข้ามเทส "ปล่อยผ่านไฟล์ปกติ" — ไม่เจอไฟล์โค้ดที่ไม่ใช่ไฟล์เทสและไม่ได้อยู่ในรายการ protected');
// merge บน main ขึ้นกับ branch ที่ยืนอยู่ — ตรวจให้ตรงกับที่ควรเป็น
cases.push(['guard-bash.js', { tool_input: { command: 'git merge feat/x' } }, /^(main|master)$/.test(branch) ? 2 : 0,
  /^(main|master)$/.test(branch) ? 'บล็อก merge ขณะยืนบน main' : `ปล่อย merge เพราะยืนบน ${branch || '?'} (บน main ต้องถูกบล็อก)`]);
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
// ── 7b. hooks กับ git worktree ────────────────────────────────────────
// บั๊กที่เจอจริง: currentBranch() ใน guard-bash.js/guard-edit.js เคยรัน `git rev-parse`
// ด้วย cwd: ROOT (= CLAUDE_PROJECT_DIR) ซึ่งชี้ไปที่ primary checkout เสมอ ต่อให้คำสั่งที่
// กำลังจะรันจริงอยู่ใน git worktree แยก (เช่น subagent ที่ spawn ด้วย isolation: "worktree")
// ผลคือ hook เห็น branch ของ checkout หลักแทนที่จะเห็น branch จริงของ worktree
head('7b. hooks กับ git worktree (currentBranch ต้องอ่าน cwd จริง ไม่ใช่ primary checkout)');
try {
  const os = require('node:os');
  const wtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-config-wt-'));
  const wtBranch = `check-config-wt-test-${Date.now()}`;
  execFileSync('git', ['worktree', 'add', '-b', wtBranch, wtDir], { cwd: ROOT, stdio: 'pipe' });
  try {
    let got = 0;
    try {
      execFileSync(process.execPath, [path.join(CLAUDE, 'hooks', 'guard-bash.js')], {
        cwd: wtDir,
        input: JSON.stringify({ tool_input: { command: 'git merge feat/x' } }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      got = e.status ?? -1;
    }
    // wtBranch ไม่ใช่ main/master แน่ๆ (ตั้งชื่อเอง) -> merge ต้องปล่อยผ่านเสมอ ไม่ว่า
    // primary checkout (ROOT) จะยืนอยู่บน branch อะไร ถ้า hook อ่าน ROOT แทน cwd จะบล็อกผิด
    got === 0
      ? ok(`guard-bash.js: ปล่อย merge ใน worktree บน branch "${wtBranch}" (exit 0) แม้ primary checkout อยู่บน ${branch || '?'}`)
      : bad(`guard-bash.js: ควรปล่อยผ่าน merge ใน worktree (branch "${wtBranch}") แต่ได้ exit ${got} — currentBranch() น่าจะอ่าน ROOT/CLAUDE_PROJECT_DIR แทน cwd จริง (บั๊ก worktree isolation)`);
    if (!/^(main|master)$/.test(branch))
      warn('primary checkout (ROOT) ไม่ได้อยู่บน main/master ตอนรันเทสนี้ — เทส 7b จะตรวจจับบั๊กนี้ได้แน่นอนเฉพาะตอน ROOT อยู่บน main/master เท่านั้น');
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', wtDir], { cwd: ROOT, stdio: 'pipe' }); } catch { /* เก็บกวาดแบบ best-effort */ }
    try { execFileSync('git', ['branch', '-D', wtBranch], { cwd: ROOT, stdio: 'pipe' }); } catch { /* เก็บกวาดแบบ best-effort */ }
    try { fs.rmSync(wtDir, { recursive: true, force: true }); } catch { /* เก็บกวาดแบบ best-effort */ }
  }
} catch (e) {
  warn(`ข้ามเทส worktree isolation: ${e.message.split('\n')[0]} (อาจไม่ใช่ git repo หรือ git worktree ใช้ไม่ได้ในสภาพแวดล้อมนี้)`);
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
