#!/usr/bin/env node
/**
 * gate.js — ประตูเดียวที่ทุกอย่างต้องผ่านก่อนเข้า main
 *
 *   node .claude/gate.js               รันครบ: verify → check-config → docs-lint → board --check
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

const VERIFY = (() => {
  try {
    return require(path.join(CLAUDE, 'stack-config.js')).resolveVerify(ROOT);
  } catch {
    // ยังไม่ได้คัดลอก stack-config.js มา (ติดตั้งเก่า) — ใช้กติกาเดิม
    const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); } catch { return {}; } })();
    return process.env.VERIFY_COMMAND || (pkg.scripts?.verify ? 'pnpm verify' : null);
  }
})();

const steps = [];
const add = (name, cmd, cmdArgs, opts = {}) => steps.push({ name, cmd, cmdArgs, ...opts });

if (!DOCS_ONLY) {
  if (VERIFY) add('verify', VERIFY.split(' ')[0], VERIFY.split(' ').slice(1), { shell: true });
  else add('verify', null, null, { skip: 'ยังไม่ได้ตั้งคำสั่ง verify — ใส่ "verifyCommand" ใน .claude/stack.json หรือ env VERIFY_COMMAND (Phase 2 รอบ B2)' });
}
add('check-config', process.execPath, [path.join(CLAUDE, 'check-config.js')]);
add('docs-lint', process.execPath, [path.join(CLAUDE, 'docs-lint.js'), ...(RELEASE ? ['--release', RELEASE] : [])]);
add('board --check', process.execPath, [path.join(CLAUDE, 'board.js'), '--check'], { optional: true });

const results = [];
for (const s of steps) {
  process.stdout.write(`\n▶ ${s.name}\n`);
  if (s.skip) { console.log(`  skip: ${s.skip}`); results.push([s.name, 'skip']); continue; }
  if (s.cmdArgs && s.cmdArgs[0] && s.cmdArgs[0].endsWith('.js') && !fs.existsSync(s.cmdArgs[0])) {
    if (s.optional) { console.log(`  skip: ไม่มี ${path.basename(s.cmdArgs[0])}`); results.push([s.name, 'skip']); continue; }
    console.log(`  FAIL: ไม่มี ${path.basename(s.cmdArgs[0])}`); results.push([s.name, 'fail']); continue;
  }
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: !!s.shell });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const pass = r.status === 0;
  results.push([s.name, pass ? 'pass' : 'fail', sec]);
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
