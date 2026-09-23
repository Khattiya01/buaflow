#!/usr/bin/env node
/**
 * gate.js — ประตูเดียวที่ทุกอย่างต้องผ่านก่อนเข้า main
 *
 *   node .claude/gate.js               รันครบ: verify → check-config → docs-lint → requirement-coverage → security-baseline → supply-chain → operational-readiness → budgets
 *   node .claude/gate.js --docs-only   ข้าม verify (ใช้กับ commit ที่แตะแต่ docs/)
 *   node .claude/gate.js --release M1  เพิ่มเงื่อนไข release ของ milestone
 *
 * ใช้ที่ไหน: .husky/pre-push, CI (github-actions.yml / gitlab-ci.yml), และ /release
 * ทำไมต้องมี: กฎทุกข้อของ kit เดิมบังคับได้แค่ "ในเทิร์นของ Claude" — คนที่ merge จาก editor
 * หรือ AI ตัวอื่นข้ามได้หมด ไฟล์นี้คือกฎชุดเดียวกันที่รัน **นอก** session ได้
 *
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS และใน container
 * exit 0 = ผ่านทุกด่าน | exit 1 = มีด่านที่ไม่ผ่าน (บอกว่าด่านไหน)
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const DOCS_ONLY = args.includes('--docs-only');
const ri = args.indexOf('--release');
const RELEASE = ri !== -1 ? args[ri + 1] : null;
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CLAUDE = path.join(ROOT, '.claude');

let stackApi = null;
let CONFIG = null;
let CONFIG_ERROR = null;
const STACK_CONFIG_FILE = path.join(CLAUDE, 'stack-config.js');
if (fs.existsSync(STACK_CONFIG_FILE)) {
  try {
    stackApi = require(STACK_CONFIG_FILE);
    CONFIG = stackApi.load(ROOT, { strict: true });
  } catch (error) {
    CONFIG_ERROR = error.message;
  }
}
if (!CONFIG) {
  CONFIG = {
    assuranceMode: 'adoption',
    readinessLevel: 'R3',
    readinessManifest: 'docs/evidence/readiness.json',
    auditMode: 'off',
    secretsMode: 'off',
    commands: {},
  };
}
const ASSURANCE_MODE = CONFIG.assuranceMode || 'adoption';
const PRODUCTION = ASSURANCE_MODE === 'production';

const VERIFY = (() => {
  try {
    return stackApi ? stackApi.resolveVerify(ROOT, CONFIG) : null;
  } catch {
    // ยังไม่ได้คัดลอก stack-config.js มา (ติดตั้งเก่า) — ใช้กติกาเดิม
    const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); } catch { return {}; } })();
    return process.env.VERIFY_COMMAND || (pkg.scripts?.verify ? 'pnpm verify' : null);
  }
})();

const AUDIT = (() => {
  try {
    return { cmd: stackApi?.resolveCommand(ROOT, 'audit', CONFIG) || null, mode: CONFIG.auditMode || 'warn' };
  } catch {
    return { cmd: null, mode: 'off' };
  }
})();

const SECRETS = (() => {
  try {
    return { cmd: stackApi?.resolveCommand(ROOT, 'secrets', CONFIG) || null, mode: CONFIG.secretsMode || 'required' };
  } catch {
    return { cmd: null, mode: 'off' };
  }
})();

const steps = [];
const add = (name, cmd, cmdArgs, opts = {}) => steps.push({ name, cmd, cmdArgs, ...opts });

if (CONFIG_ERROR) {
  add('stack-config', null, null, { failure: `cannot trust .claude/stack.json: ${CONFIG_ERROR}` });
}
if (!['adoption', 'production'].includes(ASSURANCE_MODE)) {
  add('assurance-policy', null, null, {
    failure: `unsupported assuranceMode "${ASSURANCE_MODE}"; use "adoption" or "production"`,
  });
}
if (PRODUCTION && !['R3', 'R4'].includes(CONFIG.readinessLevel || 'R3')) {
  add('readiness-policy', null, null, {
    failure: `production assurance requires readinessLevel R3 or R4 (found "${CONFIG.readinessLevel}")`,
  });
}
if (PRODUCTION && DOCS_ONLY) {
  add('production-policy', null, null, {
    failure: 'production assurance does not allow --docs-only because it is a caller-controlled bypass; run the full gate',
  });
}
if (!DOCS_ONLY) {
  if (VERIFY) add('verify', VERIFY.split(' ')[0], VERIFY.split(' ').slice(1), { shell: true });
  else if (PRODUCTION) add('verify', null, null, { failure: 'production assurance requires verifyCommand; missing verify may not be skipped' });
  else add('verify', null, null, { skip: 'ยังไม่ได้ตั้งคำสั่ง verify — ใส่ "verifyCommand" ใน .claude/stack.json หรือ env VERIFY_COMMAND (Phase 2 รอบ B2)' });
}
if (PRODUCTION && AUDIT.mode !== 'required') {
  add('audit-policy', null, null, { failure: `production assurance requires auditMode "required" (found "${AUDIT.mode}")` });
} else if (!DOCS_ONLY && AUDIT.cmd && AUDIT.mode !== 'off') {
  add('audit', AUDIT.cmd.split(' ')[0], AUDIT.cmd.split(' ').slice(1), { shell: true, warnOnly: AUDIT.mode !== 'required' });
} else if (PRODUCTION && !AUDIT.cmd) {
  add('audit', null, null, { failure: 'production assurance requires commands.audit' });
}
if (PRODUCTION && SECRETS.mode !== 'required') {
  add('secrets-policy', null, null, { failure: `production assurance requires secretsMode "required" (found "${SECRETS.mode}")` });
} else if (SECRETS.cmd && SECRETS.mode !== 'off') {
  const bin = SECRETS.cmd.split(' ')[0];
  const has = spawnSync(bin, ['version'], { stdio: 'ignore', shell: true }).status === 0;
  if (has) add('secrets', bin, SECRETS.cmd.split(' ').slice(1), { shell: true, warnOnly: SECRETS.mode === 'warn' });
  else if (PRODUCTION) add('secrets', null, null, { failure: `production assurance requires secret scanner "${bin}", but it is unavailable` });
  else add('secrets', null, null, { skip: `ไม่พบ ${bin} ในเครื่อง — ติดตั้งจาก https://github.com/gitleaks/gitleaks (เช่น brew install gitleaks / scoop install gitleaks) หรือตั้ง "secretsMode": "off" ใน .claude/stack.json` });
} else if (PRODUCTION) {
  add('secrets', null, null, { failure: 'production assurance requires commands.secrets' });
}
add('check-config', process.execPath, [path.join(CLAUDE, 'check-config.js')]);
add('docs-lint', process.execPath, [path.join(CLAUDE, 'docs-lint.js'), ...(RELEASE ? ['--release', RELEASE] : [])]);
// EP-002 — เฉพาะโปรเจกต์ที่มี requirement coverage record เท่านั้น: ไม่มีไฟล์ = ไม่ตรวจ
// พฤติกรรมเดิมไม่เปลี่ยน (additive ตาม BF-006) มีไฟล์แล้ว exception ที่เลยวันหมดอายุทำให้ gate ตก
// ไม่ส่ง --max-window-days ที่นี่โดยตั้งใจ: หน้าต่างที่ยอมรับได้เป็นนโยบายของผู้ตรวจในโปรเจกต์นั้น
// ไม่ใช่ของ kit — ใส่เองได้ใน CI ของโปรเจกต์ เหมือนที่ evidence-freshness ทำกับ --max-age-days
if (fs.existsSync(path.join(ROOT, 'docs', 'evidence', 'requirement-coverage.json'))) {
  add('requirement-coverage', process.execPath, [path.join(CLAUDE, 'requirement-coverage.js'), '--file', 'docs/evidence/requirement-coverage.json']);
}
// EP-003 — เงื่อนไขเดียวกัน: ไม่มีไฟล์ = ไม่ตรวจ · control ที่ not-met ต้องชี้ไป exception ที่มีอยู่จริง
if (fs.existsSync(path.join(ROOT, 'docs', 'evidence', 'security-baseline.json'))) {
  add('security-baseline', process.execPath, [path.join(CLAUDE, 'security-baseline.js'), '--file', 'docs/evidence/security-baseline.json']);
}
// EP-004 — เงื่อนไขเดียวกันอีกครั้ง: ไม่มีไฟล์ = ไม่ตรวจ · สรุป licence ถูก derive ใหม่จาก SBOM ทุกครั้ง
if (fs.existsSync(path.join(ROOT, 'docs', 'evidence', 'supply-chain.json'))) {
  add('supply-chain', process.execPath, [path.join(CLAUDE, 'supply-chain.js'), '--file', 'docs/evidence/supply-chain.json']);
}
// EP-005 — เงื่อนไขเดียวกัน: ไม่มีไฟล์ = ไม่ตรวจ · rehearsal ที่ไม่ผ่านถูกอ้างว่าผ่านไม่ได้
if (fs.existsSync(path.join(ROOT, 'docs', 'evidence', 'operational-readiness.json'))) {
  add('operational-readiness', process.execPath, [path.join(CLAUDE, 'operational-readiness.js'), '--file', 'docs/evidence/operational-readiness.json']);
}
// EP-007 — เพดานอยู่ที่ profile ไม่ใช่ที่แอป · ไม่มีไฟล์ = ไม่ตรวจ
if (fs.existsSync(path.join(ROOT, 'docs', 'evidence', 'budgets.json'))) {
  add('budgets', process.execPath, [path.join(CLAUDE, 'budgets.js'), '--file', 'docs/evidence/budgets.json']);
}
if (PRODUCTION) {
  add('readiness', process.execPath, [
    path.join(CLAUDE, 'readiness.js'),
    '--file', CONFIG.readinessManifest || 'docs/evidence/readiness.json',
    '--level', CONFIG.readinessLevel || 'R3',
  ]);
}

const results = [];
for (const s of steps) {
  process.stdout.write(`\n▶ ${s.name}\n`);
  if (s.failure) { console.log(`  FAIL: ${s.failure}`); results.push([s.name, 'fail']); continue; }
  if (s.skip) { console.log(`  skip: ${s.skip}`); results.push([s.name, 'skip']); continue; }
  if (s.cmdArgs && s.cmdArgs[0] && s.cmdArgs[0].endsWith('.js') && !fs.existsSync(s.cmdArgs[0])) {
    if (s.optional) { console.log(`  skip: ไม่มี ${path.basename(s.cmdArgs[0])}`); results.push([s.name, 'skip']); continue; }
    console.log(`  FAIL: ไม่มี ${path.basename(s.cmdArgs[0])}`); results.push([s.name, 'fail']); continue;
  }
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: !!s.shell });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const pass = r.status === 0;
  results.push([s.name, pass ? 'pass' : s.warnOnly ? 'warn' : 'fail', sec]);
  if (!pass && s.warnOnly) console.log(`  warn: ${s.name} พบปัญหา แต่ตั้งเป็นรายงานอย่างเดียว (${s.name}Mode: warn ใน .claude/stack.json) — ไม่บล็อก`);
  if (!pass && s.name === 'verify') {
    // verify พัง = ไม่ต้องเสียเวลาด่านอื่น
    console.log('\nverify ไม่ผ่าน — หยุดตรงนี้ แก้ก่อนแล้วรันใหม่');
    break;
  }
}

console.log('\n' + '='.repeat(60));
console.log('gate');
for (const [name, st, sec] of results) console.log(`  ${st.padEnd(4)}  ${name}${sec ? `  (${sec}s)` : ''}`);
const failed = results.filter(([, st]) => st === 'fail');
console.log(failed.length ? `\nไม่ผ่าน: ${failed.map(([n]) => n).join(', ')}` : '\nผ่านทุกด่าน');
process.exit(failed.length ? 1 : 0);
