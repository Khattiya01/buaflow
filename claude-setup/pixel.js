#!/usr/bin/env node
/**
 * pixel — เทียบหน้าจริงกับ canvas baseline แบบเดียวกันทุกครั้ง แล้วรายงานเป็นตัวเลข
 *
 *   node .claude/pixel.js                 ทุกหน้าใน docs/design/pixel.json
 *   node .claude/pixel.js --page orders   เฉพาะหน้าเดียว
 *   node .claude/pixel.js --check         ตรวจ config / ไฟล์ baseline / เครื่องมือที่ต้องมี ไม่เปิด browser
 *
 * ทำไมต้องมี: ขั้น "พิสูจน์ด้วย pixel diff" ใน /ui เดิมเป็นคำสั่งให้ AI ประกอบ screenshot + diff เอง —
 * ผลไม่คงที่ (รอโหลดไม่เท่ากัน, ลืมบาง viewport/theme) ไม่มีอะไรบังคับ และต้องเปิดภาพเข้า context ทุกรอบ
 * ไฟล์นี้ทำให้ทุกรอบเหมือนกัน และคืน "ตัวเลข + พิกัดบริเวณที่ต่าง" ให้ AI แก้ได้โดยไม่ต้องเปิดรูป
 * (เปิดรูป diff เฉพาะตอนสงสัย — path บอกไว้ท้ายรายงาน)
 *
 * ไม่ได้เขียน diff เอง: ใช้ playwright + pixelmatch + pngjs ของโปรเจกต์ (dev dependency, ติดตั้งใน Phase 6)
 * ไฟล์นี้ไม่มี dependency ของตัวเอง — หาเครื่องมือจาก node_modules ของโปรเจกต์
 *
 * docs/design/pixel.json:
 *   {
 *     "baseUrl": "http://localhost:3000",
 *     "maxDiffPercent": 0.5,            % พิกเซลที่ต่างได้ (ทั้งไฟล์ ปรับรายหน้าได้)
 *     "pixelmatchThreshold": 0.1,       ความไวต่อสี 0-1 (สูง = ผ่อนปรน; แก้ anti-aliasing ของฟอนต์)
 *     "pages": {
 *       "orders": {
 *         "path": "/orders",
 *         "artboards": { "1280": "orders.dc.html", "390": "orders-mobile.dc.html", "1280:dark": "orders-dark.dc.html" },
 *         "maxDiffPercent": 1           (ไม่ใส่ = ใช้ค่ากลาง; ใช้กับหน้าที่มี deviation ที่ตกลงไว้)
 *       }
 *     }
 *   }
 *   key ของ artboards = "<width>" หรือ "<width>:dark" (เหมือน prototype flow.json)
 *
 * ภาพ diff เก็บนอก repo (ค่าเริ่มต้น: โฟลเดอร์ชั่วคราวของระบบ) — ห้าม commit รูป
 * exit 0 = ทุก artboard ไม่เกินเกณฑ์ | exit 1 = เกินเกณฑ์ / config พัง / เครื่องมือไม่ครบ / เปิด baseUrl ไม่ได้
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; };
const CHECK_ONLY = args.includes('--check');
const ONLY = flag('--page', null);
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CONFIG = path.resolve(ROOT, flag('--config', 'docs/design/pixel.json'));
const CANVAS_DIR = path.resolve(ROOT, flag('--canvas', 'docs/design/canvas'));
const OUT_DIR = path.resolve(flag('--out', path.join(os.tmpdir(), 'buaflow-pixel')));
const VIEW_H = 800;
const BAND = 80;

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const problems = [];
const bad = (m) => { console.log(`  FAIL ${m}`); problems.push(m); };
const die = (m) => { console.error(m); process.exit(1); };

// ── 1. config ─────────────────────────────────────────────────────────
if (!fs.existsSync(CONFIG)) die(`✗ ไม่มี ${rel(CONFIG)} — สร้างตามตัวอย่างในหัวไฟล์ .claude/pixel.js (baseUrl + pages → artboards)`);
let cfg;
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { die(`✗ ${rel(CONFIG)} ไม่ใช่ JSON: ${e.message}`); }

const baseUrl = String(cfg.baseUrl || 'http://localhost:3000').replace(/\/$/, '');
const maxDefault = Number.isFinite(cfg.maxDiffPercent) ? cfg.maxDiffPercent : 0.5;
const pmThreshold = Number.isFinite(cfg.pixelmatchThreshold) ? cfg.pixelmatchThreshold : 0.1;
const pages = cfg.pages && typeof cfg.pages === 'object' ? cfg.pages : {};
let names = Object.keys(pages);
if (ONLY) {
  if (!pages[ONLY]) die(`✗ ไม่มีหน้า "${ONLY}" ใน ${rel(CONFIG)} (มี: ${names.join(', ') || 'ไม่มีเลย'})`);
  names = [ONLY];
}
if (!names.length) die(`✗ ${rel(CONFIG)} ไม่มี pages`);

const jobs = []; // { page, key, width, dark, file, url, max }
for (const name of names) {
  const p = pages[name] || {};
  if (!p.path || !String(p.path).startsWith('/')) bad(`pages.${name}: path ต้องขึ้นต้นด้วย "/"`);
  const boards = p.artboards && typeof p.artboards === 'object' ? p.artboards : {};
  if (!Object.keys(boards).length) bad(`pages.${name}: ไม่มี artboards`);
  for (const [key, file] of Object.entries(boards)) {
    const m = key.match(/^(\d+)(:dark)?$/);
    if (!m) { bad(`pages.${name}: key "${key}" ต้องเป็น "<width>" หรือ "<width>:dark"`); continue; }
    const abs = path.resolve(CANVAS_DIR, file);
    if (!fs.existsSync(abs)) { bad(`pages.${name}["${key}"]: ไม่มี baseline ${rel(abs)}`); continue; }
    jobs.push({ page: name, key, width: Number(m[1]), dark: !!m[2], file: abs, url: baseUrl + p.path, max: Number.isFinite(p.maxDiffPercent) ? p.maxDiffPercent : maxDefault });
  }
}

// ── 2. เครื่องมือ (หาจาก node_modules ของโปรเจกต์) ────────────────────
const req = createRequire(path.join(ROOT, 'package.json'));
const tryResolve = (id) => { try { return req.resolve(id); } catch { return null; } };
// pixelmatch v6+ เป็น ESM ล้วน — require.resolve ใช้ไม่ได้ จึงอ่าน package.json หา entry เอง
function pixelmatchEntry() {
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    const pj = path.join(dir, 'node_modules', 'pixelmatch', 'package.json');
    if (fs.existsSync(pj)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
        const ex = pkg.exports;
        const e = typeof ex === 'string' ? ex : ex && (typeof ex['.'] === 'string' ? ex['.'] : ex['.']?.import || ex['.']?.default || ex.import || ex.default);
        return path.join(path.dirname(pj), (typeof e === 'string' ? e : pkg.module || pkg.main || 'index.js'));
      } catch { return null; }
    }
    if (path.dirname(dir) === dir) return null;
  }
}
const pwId = ['playwright', '@playwright/test'].find((id) => tryResolve(id));
const missing = [];
if (!pwId) missing.push('playwright (@playwright/test)');
if (!pixelmatchEntry()) missing.push('pixelmatch');
if (!tryResolve('pngjs')) missing.push('pngjs');
if (missing.length) bad(`ยังไม่ได้ติดตั้ง: ${missing.join(', ')} — pnpm add -D pixelmatch pngjs @playwright/test && pnpm exec playwright install chromium`);

if (problems.length) { console.log(`\n✗ pixel: ${problems.length} ข้อต้องแก้`); process.exit(1); }
if (CHECK_ONLY) { console.log(`✓ pixel --check: ${names.length} หน้า, ${jobs.length} artboard, เครื่องมือครบ`); process.exit(0); }

// ── 3. รัน ────────────────────────────────────────────────────────────
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

async function shot(browser, url, job) {
  const ctx = await browser.newContext({
    viewport: { width: job.width, height: VIEW_H },
    colorScheme: job.dark ? 'dark' : 'light',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.addStyleTag({ content: FREEZE });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return await page.screenshot({ fullPage: true });
  } finally {
    await ctx.close();
  }
}

// pixelmatch ต้องภาพขนาดเท่ากัน — ขยายด้วยสีขาว ส่วนที่เกินจะนับเป็นความต่างเอง
function pad(PNG, img, w, h) {
  if (img.width === w && img.height === h) return img;
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

// diff ถูกวาดสีม่วงล้วน (255,0,255) — สแกนหาแถบแนวนอนที่มีความต่างเพื่อบอกพิกัดคร่าว ๆ
function regions(data, w, h) {
  const bands = [];
  for (let by = 0; by < h; by += BAND) {
    let n = 0, x0 = w, x1 = -1;
    for (let y = by; y < Math.min(by + BAND, h); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
    }
    bands.push({ y0: by, y1: Math.min(by + BAND, h), n, x0, x1 });
  }
  const merged = [];
  for (const b of bands) {
    if (!b.n) continue;
    const last = merged[merged.length - 1];
    if (last && last.y1 === b.y0) { last.y1 = b.y1; last.n += b.n; last.x0 = Math.min(last.x0, b.x0); last.x1 = Math.max(last.x1, b.x1); }
    else merged.push({ ...b });
  }
  return merged.sort((a, b) => b.n - a.n).slice(0, 5);
}

(async () => {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    void res;
  } catch {
    die(`✗ เปิด ${baseUrl} ไม่ได้ — สั่งรันแอปก่อน (skill run / pnpm dev) หรือแก้ "baseUrl" ใน ${rel(CONFIG)}`);
  }

  const { chromium } = req(pwId);
  const { PNG } = req('pngjs');
  const pmMod = await import(pathToFileURL(pixelmatchEntry()).href);
  const pixelmatch = pmMod.default || pmMod;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const job of jobs) {
      const label = `${job.page} @${job.key}`;
      try {
        const [actualBuf, baseBuf] = await Promise.all([shot(browser, job.url, job), shot(browser, pathToFileURL(job.file).href, job)]);
        const a = PNG.sync.read(actualBuf);
        const b = PNG.sync.read(baseBuf);
        const w = Math.max(a.width, b.width);
        const h = Math.max(a.height, b.height);
        const A = pad(PNG, a, w, h);
        const B = pad(PNG, b, w, h);
        const diff = new PNG({ width: w, height: h });
        const count = pixelmatch(A.data, B.data, diff.data, w, h, { threshold: pmThreshold, diffColor: [255, 0, 255], aaColor: [0, 0, 0], includeAA: false });
        const pct = (count / (w * h)) * 100;
        const file = path.join(OUT_DIR, `${job.page}-${job.key.replace(':', '-')}.diff.png`);
        fs.writeFileSync(file, PNG.sync.write(diff));
        rows.push({ label, pct, max: job.max, count, sizeDiff: a.width !== b.width || a.height !== b.height ? `จริง ${a.width}x${a.height} · baseline ${b.width}x${b.height}` : null, regs: count ? regions(diff.data, w, h) : [], file });
      } catch (e) {
        rows.push({ label, error: String(e.message || e).split('\n')[0] });
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`pixel — ${rows.length} artboard · threshold สี ${pmThreshold} · ${baseUrl}\n`);
  let failed = 0;
  for (const r of rows) {
    if (r.error) { failed++; console.log(`  ERR  ${r.label}  ${r.error}`); continue; }
    const ok = r.pct <= r.max;
    if (!ok) failed++;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${r.label}  ต่าง ${r.pct.toFixed(2)}% (เกณฑ์ ${r.max}%)`);
    if (r.sizeDiff) console.log(`        ขนาดไม่เท่ากัน: ${r.sizeDiff}`);
    if (!ok) {
      for (const g of r.regs) console.log(`        y ${g.y0}-${g.y1}  x ${g.x0}-${g.x1}  ${g.n} px`);
      console.log(`        ภาพ diff: ${r.file}`);
    }
  }
  console.log(`\n${failed ? `✗ ไม่ผ่าน ${failed} จาก ${rows.length}` : `✓ ผ่านทั้ง ${rows.length}`}`);
  if (failed) console.log('  ความต่างที่ตกลงไว้ = deviation → บันทึกใน docs/design/components.md แล้วแก้ canvas ให้ตรงโค้ด (ui-component-rules 8.4) ก่อนปรับเกณฑ์');
  process.exit(failed ? 1 : 0);
})().catch((e) => die(`✗ pixel พัง: ${e.message}`));
