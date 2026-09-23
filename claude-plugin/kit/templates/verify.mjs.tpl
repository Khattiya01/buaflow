#!/usr/bin/env node
/**
 * scripts/verify.mjs — คำสั่งตรวจมาตรฐานที่ "แปะผลจริงได้โดยไม่กิน context"
 *
 *   "verify": "node scripts/verify.mjs"           ใน package.json
 *   node scripts/verify.mjs --full                 พิมพ์ output เต็ม (สำหรับคน / CI log)
 *
 * ปัญหาที่แก้: กฎของ kit คือ "แปะผลลัพธ์จริง ห้ามบอกว่าผ่านเฉย ๆ" ซึ่งถูก —
 * แต่ tsc + eslint + vitest ที่พังพร้อมกันคือ output หลายพันบรรทัดเข้า context ทุกรอบ
 * ไฟล์นี้รันทุกขั้นเหมือนเดิม แต่:
 *   - ตอนผ่าน: พิมพ์ ~5 บรรทัด (นี่คือ "หน้าตาของผ่าน" ที่ AGENTS.md อ้าง)
 *   - ตอนพัง: พิมพ์เฉพาะบรรทัดที่เป็น error/fail ไม่เกิน MAX_LINES ต่อขั้น + บอกว่า log เต็มอยู่ไหน
 *   - เขียน output เต็มลง .verify.log เสมอ (gitignore ไว้) ให้คน/CI/AI เปิดดูเมื่อต้องการ
 * ผล: กฎ "แปะผลจริง" ยังอยู่ครบ แต่ต้นทุนลง ~10 เท่า
 *
 * ปรับ STEPS ให้ตรง stack จริง (Phase 2 รอบ B2 / Phase 6 ขั้น 3) — ห้ามคัดลอกดิบ
 * บน Windows รันผ่าน shell (pnpm.cmd) — หลีกเลี่ยง args ที่มี quote ซ้อน ถ้าต้องการให้เขียนเป็นสคริปต์แยกแล้วเรียกไฟล์
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const FULL = process.argv.includes('--full');
const MAX_LINES = 25;
const LOG = '.verify.log';

// ── ปรับตรงนี้ให้ตรงโปรเจกต์ ──────────────────────────────────────────
const STEPS = [
  { name: 'typecheck', cmd: 'pnpm', args: ['exec', 'tsc', '--noEmit', '--pretty', 'false'] },
  { name: 'lint',      cmd: 'pnpm', args: ['exec', 'eslint', '.', '--max-warnings', '0', '--format', 'unix'] },
  { name: 'test',      cmd: 'pnpm', args: ['exec', 'vitest', 'run', '--reporter', 'dot'] },
];
// บรรทัดที่ถือว่า "สำคัญ" เมื่อพัง — เอาเฉพาะพวกนี้มาแสดง
const IMPORTANT = /error|fail|✗|×|expected|received|AssertionError|TS\d{4}|\bat\s+.+:\d+:\d+/i;
// ──────────────────────────────────────────────────────────────────────

const t0 = Date.now();
const results = [];
let fullLog = '';

for (const s of STEPS) {
  const st = Date.now();
  const r = spawnSync(s.cmd, s.args, { encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, FORCE_COLOR: '0', CI: '1' } });
  const out = (r.stdout || '') + (r.stderr || '');
  const sec = ((Date.now() - st) / 1000).toFixed(1);
  fullLog += `\n===== ${s.name} (exit ${r.status}, ${sec}s) =====\n${out}`;
  results.push({ name: s.name, ok: r.status === 0, sec, out });
  if (r.status !== 0) break; // พังขั้นไหนหยุดขั้นนั้น — ขั้นถัดไปมักพังตามและกิน context เปล่า
}

writeFileSync(LOG, fullLog.trimStart());
const total = ((Date.now() - t0) / 1000).toFixed(1);

if (FULL) {
  console.log(fullLog);
}

const failed = results.find((r) => !r.ok);
const line = results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name} ${r.sec}s`).join('   ');
const skipped = STEPS.slice(results.length).map((s) => `– ${s.name} (skipped)`).join('   ');
console.log(`verify  ${line}${skipped ? '   ' + skipped : ''}   [${total}s]`);

if (!failed) {
  // ตัวเลขสรุปของ test ถ้าดึงได้ (vitest / jest)
  const t = results.find((r) => r.name === 'test');
  const m = t?.out.match(/Tests?\s+(\d+)\s+passed[^\n]*/i) || t?.out.match(/(\d+)\s+passing/i);
  if (m) console.log(`        ${m[0].trim()}`);
  console.log(`        all passed`);
  process.exit(0);
}

if (!FULL) {
  const all = failed.out.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  let lines = all.filter((l) => IMPORTANT.test(l));
  let how = `${lines.length} relevant lines`;
  if (!lines.length) { lines = all.slice(-15); how = 'no line matched the error pattern — showing the last 15 lines'; } // fallback: ท้าย log มักบอกสาเหตุ
  const shown = lines.slice(0, MAX_LINES);
  console.log(`\n${failed.name} FAILED — ${how}, showing ${shown.length}:`);
  shown.forEach((l) => console.log('  ' + l.slice(0, 200)));
  if (lines.length > MAX_LINES) console.log(`  … ${lines.length - MAX_LINES} more`);
  console.log(`\nfull log: ${LOG}   (or: node scripts/verify.mjs --full)`);
}
process.exit(1);
