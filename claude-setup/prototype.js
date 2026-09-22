#!/usr/bin/env node
/**
 * prototype — สร้าง click-through prototype จาก canvas baseline ที่ commit ไว้
 *
 *   node .claude/prototype.js            สร้างลง docs/design/prototype/dist/
 *   node .claude/prototype.js --check    ตรวจ flow.json / ไฟล์ / data อย่างเดียว ไม่เขียนอะไร
 *   node .claude/prototype.js --canvas <dir> --flow <file> --data <dir> --out <dir>
 *
 * ทำไมต้องมี: ทีม/ลูกค้าอยากกดดู flow ก่อนเขียนโค้ด แต่ถ้า "วาด mockup ใหม่ตาม design"
 * มันจะไม่ตรง canvas แน่ ๆ — ไฟล์นี้จึง **ไม่วาดอะไรเลย** แค่ copy artboard (`.dc.html`)
 * ทั้งก้อนแล้วฉีด <script> ท้าย </body> เป็นชั้น overlay (hotspot + mock data)
 * artboard ไม่ถูกแตะแม้แต่ byte เดียว → prototype ตรง canvas 100% โดยโครงสร้าง
 *
 * input:
 *   docs/design/canvas/*.dc.html         baseline (เท่ากับ canvas ที่ confirm — Phase 3 D / 8.8)
 *   docs/design/prototype/flow.json      หน้าไหน กดอะไร ไปไหน + จุดไหนใส่ data (templates/prototype-flow.tpl.json)
 *   docs/design/prototype/data/*.json    mock data ต่อหน้า (เขียนมือ หรือ export จาก DB แบบ sanitize แล้ว)
 * output:
 *   docs/design/prototype/dist/          generate ล้วน ห้ามแก้มือ ห้าม commit (gitignore `dist/`)
 *     index.html                         shell: เลือกหน้า / viewport / state / theme / back
 *     _proto.js                          ฝั่งใน iframe: ผูก hotspot + apply bindings
 *     screens/<screen>/<variant>.html    artboard เดิม + script ฉีดท้าย
 *
 * exit 0 = ผ่าน (อาจมี warn) | exit 1 = flow.json อ้างไฟล์/หน้าที่ไม่มี หรือ JSON พัง
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; };
const CHECK_ONLY = args.includes('--check');
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CANVAS_DIR = path.resolve(ROOT, flag('--canvas', 'docs/design/canvas'));
const FLOW_FILE = path.resolve(ROOT, flag('--flow', 'docs/design/prototype/flow.json'));
const DATA_DIR = path.resolve(ROOT, flag('--data', 'docs/design/prototype/data'));
const OUT_DIR = path.resolve(ROOT, flag('--out', 'docs/design/prototype/dist'));

const errors = [];
const warns = [];
const bad = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// ── 1. อ่าน flow.json ─────────────────────────────────────────────────
if (!fs.existsSync(FLOW_FILE)) {
  console.error(`✗ ไม่มี ${rel(FLOW_FILE)} — สร้างจาก docs/templates/prototype-flow.tpl.json ก่อน (skill /prototype เสนอให้ได้)`);
  process.exit(1);
}
let flow;
try { flow = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf8')); }
catch (e) { console.error(`✗ ${rel(FLOW_FILE)} ไม่ใช่ JSON: ${e.message}`); process.exit(1); }
if (flow.schemaVersion) {
  const version = String(flow.schemaVersion).match(/^(\d+)\.(\d+)$/);
  if (!version || Number(version[1]) !== 1) {
    console.error(`✗ ${rel(FLOW_FILE)} ใช้ schemaVersion "${flow.schemaVersion}" ที่ prototype.js รุ่นนี้ไม่รองรับ — migrate หรือ upgrade Buaflow`);
    process.exit(1);
  }
} else {
  warn(`${rel(FLOW_FILE)} ยังไม่มี schemaVersion — migrate เป็น prototype-flow v1`);
}

const screens = flow.screens && typeof flow.screens === 'object' ? flow.screens : {};
const names = Object.keys(screens);
if (names.length === 0) bad('flow.screens ว่าง — ต้องมีอย่างน้อย 1 หน้า');
if (!flow.start) bad('ไม่มี flow.start (หน้าแรกที่เปิด)');
else if (!screens[flow.start]) bad(`flow.start = "${flow.start}" ไม่มีใน screens`);

// ── 2. ตรวจทุกหน้า ────────────────────────────────────────────────────
const EXTERNAL_RE = /(?:src|href)=["']https?:\/\/[^"']+["']|url\((?:"|')?https?:\/\/[^)"']+/g;
const manifest = { start: flow.start, locale: flow.locale || 'th-TH', title: flow.title || 'Prototype', screens: {} };
const variants = []; // { screen, key, state, src, cfg }

function resolveArtboard(file, where) {
  const p = path.resolve(CANVAS_DIR, file);
  if (!fs.existsSync(p)) { bad(`${where}: ไม่มีไฟล์ ${rel(p)}`); return null; }
  return p;
}

for (const name of names) {
  const s = screens[name] || {};
  const where = `screens.${name}`;
  const artboards = s.artboards && typeof s.artboards === 'object' ? s.artboards : {};
  if (Object.keys(artboards).length === 0) bad(`${where}: ไม่มี artboards (ต้องมีอย่างน้อย 1 viewport เช่น "1280": "x.dc.html")`);

  // data
  let data = null;
  if (s.data) {
    const dp = path.resolve(DATA_DIR, s.data);
    if (!fs.existsSync(dp)) bad(`${where}.data: ไม่มีไฟล์ ${rel(dp)}`);
    else {
      try { data = JSON.parse(fs.readFileSync(dp, 'utf8')); }
      catch (e) { bad(`${where}.data: ${rel(dp)} ไม่ใช่ JSON (${e.message})`); }
      const kb = fs.statSync(dp).size / 1024;
      if (kb > 512) warn(`${where}.data: ${rel(dp)} ใหญ่ ${kb.toFixed(0)} KB — prototype ไม่ต้องการข้อมูลทั้งตาราง ตัดให้เหลือพอดูจริง (≤ 50 แถวต่อ list)`);
    }
  }

  // hotspots / bindings
  const hotspots = Array.isArray(s.hotspots) ? s.hotspots : [];
  hotspots.forEach((h, i) => {
    if (!h.selector) bad(`${where}.hotspots[${i}]: ไม่มี selector`);
    const kinds = ['to', 'state', 'back'].filter((k) => h[k] !== undefined);
    if (kinds.length !== 1) bad(`${where}.hotspots[${i}]: ต้องมี to | state | back อย่างใดอย่างหนึ่ง`);
    if (h.to && !screens[h.to]) bad(`${where}.hotspots[${i}]: to = "${h.to}" ไม่มีใน screens`);
    if (h.state && h.state !== 'default' && !(s.states && s.states[h.state])) bad(`${where}.hotspots[${i}]: state = "${h.state}" ไม่มีใน ${where}.states`);
  });
  const bindings = Array.isArray(s.bindings) ? s.bindings : [];
  if (bindings.length && !s.data) bad(`${where}: มี bindings แต่ไม่มี data`);
  bindings.forEach((b, i) => {
    if (!b.selector) bad(`${where}.bindings[${i}]: ไม่มี selector`);
    if (!b.path && !b.repeat) bad(`${where}.bindings[${i}]: ต้องมี path หรือ repeat`);
    if (b.repeat && (!b.fields || typeof b.fields !== 'object')) bad(`${where}.bindings[${i}]: repeat ต้องมี fields {subselector: path}`);
  });

  // variants: default artboards + state artboards
  const entry = { title: s.title || name, variants: {}, states: {} };
  const cfgBase = { screen: name, locale: manifest.locale, hotspots, bindings, data };
  const pushVariant = (key, file, state) => {
    const src = resolveArtboard(file, `${where}${state ? `.states.${state}` : '.artboards'}["${key}"]`);
    if (!src) return;
    if (!/^\d+(:dark)?$/.test(key)) warn(`${where}: key "${key}" ควรเป็น "<width>" หรือ "<width>:dark" เช่น "1280", "390:dark"`);
    const html = fs.readFileSync(src, 'utf8');
    const ext = html.match(EXTERNAL_RE) || [];
    if (ext.length) warn(`${rel(src)}: อ้าง URL ภายนอก ${ext.length} จุด (font/รูป) — เปิดจาก link ที่ส่งลูกค้าต้องมี internet และ host นั้นต้องอยู่ (${ext[0].slice(0, 60)}…)`);
    const out = `screens/${name}/${state ? state + '.' : ''}${key.replace(':', '-')}.html`;
    variants.push({ screen: name, key, state, src, html, out, cfg: { ...cfgBase, key, state: state || 'default' } });
    if (state) (entry.states[state] = entry.states[state] || {})[key] = out;
    else entry.variants[key] = out;
  };
  for (const [key, file] of Object.entries(artboards)) pushVariant(key, file, null);
  if (s.states && typeof s.states === 'object') {
    for (const [state, files] of Object.entries(s.states)) {
      if (typeof files === 'string') { pushVariant(Object.keys(artboards)[0] || '1280', files, state); continue; }
      for (const [key, file] of Object.entries(files || {})) pushVariant(key, file, state);
    }
  }
  manifest.screens[name] = entry;
}

// หน้าที่ไม่มีใครลิงก์ถึง (นอกจาก start) = ทีมกดไปไม่ถึง
const reachable = new Set([flow.start]);
for (const s of Object.values(screens)) for (const h of s.hotspots || []) if (h.to) reachable.add(h.to);
for (const n of names) if (!reachable.has(n)) warn(`screens.${n}: ไม่มี hotspot จากหน้าไหนชี้มา — ถึงได้จาก dropdown เท่านั้น`);

// ── 3. รายงาน ──────────────────────────────────────────────────────────
for (const w of warns) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
if (errors.length) { console.log(`\n✗ prototype: ${errors.length} ข้อต้องแก้ใน ${rel(FLOW_FILE)}`); process.exit(1); }
if (CHECK_ONLY) { console.log(`✓ prototype --check: ${names.length} หน้า, ${variants.length} artboard, ${warns.length} warn`); process.exit(0); }

// ── 4. เขียน dist/ ─────────────────────────────────────────────────────
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// ฉีดเฉพาะท้าย </body> — ไม่แตะอย่างอื่นใน artboard
const inject = (html, cfg) => {
  const tag = `\n<script>window.__PROTO=${JSON.stringify(cfg).replace(/<\//g, '<\\/')};</script>\n<script src="../../_proto.js"></script>\n`;
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
};
for (const v of variants) {
  const p = path.join(OUT_DIR, v.out);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, inject(v.html, v.cfg));
}
fs.writeFileSync(path.join(OUT_DIR, '_proto.js'), protoJs());
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), shellHtml(manifest));
console.log(`✓ prototype: ${names.length} หน้า, ${variants.length} artboard → ${rel(OUT_DIR)}/index.html${warns.length ? ` (${warns.length} warn)` : ''}`);
console.log('  เปิดดู: เปิด index.html ในเบราว์เซอร์ · แชร์: publish โฟลเดอร์นี้เป็น Artifact (skill /prototype)');

// ═══════════════════════════════════════════════════════════════════════
// ฝั่งใน iframe — ผูก hotspot + apply mock data ลง DOM ของ artboard
// ═══════════════════════════════════════════════════════════════════════
function PROTO_JS_SRC() {
  const cfg = window.__PROTO || {};
  const locale = cfg.locale || 'th-TH'; // ห้ามอ่านจาก parent — file:// ต่างกันเป็น origin null คนละอัน
  const unmatched = [];
  const send = (msg) => window.parent && window.parent !== window && window.parent.postMessage({ __proto: true, ...msg }, '*');
  const get = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const fmt = (v, f) => {
    if (v == null) return '';
    try {
      if (f === 'number') return new Intl.NumberFormat(locale).format(v);
      if (f && f.startsWith('currency')) return new Intl.NumberFormat(locale, { style: 'currency', currency: f.split(':')[1] || 'THB' }).format(v);
      if (f === 'date') return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(v));
      if (f === 'datetime') return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
    } catch (_) { /* ค่าไม่ตรง format → แสดงดิบ */ }
    return String(v);
  };
  const apply = (el, spec, item) => {
    const s = typeof spec === 'string' ? { path: spec } : spec || {};
    const v = get(item, s.path);
    if (v === undefined) return false;
    if (s.attr) el.setAttribute(s.attr, fmt(v, s.format)); else el.textContent = fmt(v, s.format);
    return true;
  };

  // bindings
  for (const b of cfg.bindings || []) {
    const all = document.querySelectorAll(b.selector);
    if (!all.length) { unmatched.push('binding ' + b.selector); continue; }
    if (b.repeat) {
      const items = get(cfg.data, b.repeat);
      if (!Array.isArray(items)) { unmatched.push('repeat ' + b.repeat + ' ไม่ใช่ array'); continue; }
      const tpl = all[0]; const parent = tpl.parentNode;
      all.forEach((n) => n.remove());
      for (const item of items) {
        const node = tpl.cloneNode(true);
        for (const [sub, spec] of Object.entries(b.fields || {})) {
          const targets = sub === '.' ? [node] : node.querySelectorAll(sub);
          if (!targets.length) unmatched.push('field ' + sub + ' ใน ' + b.selector);
          targets.forEach((t) => apply(t, spec, item));
        }
        parent.appendChild(node);
      }
    } else {
      all.forEach((el) => { if (!apply(el, b, cfg.data)) unmatched.push('path ' + b.path + ' ไม่มีใน data'); });
    }
  }

  // hotspots
  for (const h of cfg.hotspots || []) {
    const els = document.querySelectorAll(h.selector);
    if (!els.length) { unmatched.push('hotspot ' + h.selector); continue; }
    els.forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (h.to) send({ type: 'go', to: h.to });
        else if (h.state) send({ type: 'state', state: h.state });
        else if (h.back) send({ type: 'back' });
      });
    });
  }
  // ลิงก์อื่นใน artboard ห้ามพาออกนอก prototype
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a) e.preventDefault(); });
  send({ type: 'ready', screen: cfg.screen, state: cfg.state, unmatched });
}
function protoJs() { return `(${PROTO_JS_SRC.toString()})();\n`; }

// ═══════════════════════════════════════════════════════════════════════
// shell — toolbar + iframe + hash routing  #/<screen>?vp=1280&state=empty&theme=dark
// ═══════════════════════════════════════════════════════════════════════
function shellHtml(m) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.title)}</title>
<style>
:root{--bg:#f4f4f5;--bar:#18181b;--fg:#fafafa;--muted:#a1a1aa;--accent:#3b82f6;--warn:#f59e0b}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);font:13px/1.4 system-ui,sans-serif}
#bar{position:fixed;inset:0 0 auto 0;height:44px;background:var(--bar);color:var(--fg);display:flex;align-items:center;gap:8px;padding:0 12px;z-index:9;overflow-x:auto}
#bar select,#bar button{font:inherit;background:#27272a;color:var(--fg);border:1px solid #3f3f46;border-radius:6px;padding:4px 8px;cursor:pointer}
#bar button.on{background:var(--accent);border-color:var(--accent)}
#bar .grp{display:flex;gap:4px;align-items:center}#bar .lbl{color:var(--muted);margin-right:2px}
#bar .sp{flex:1}#warn{color:var(--warn);cursor:help;display:none}
#stage{position:absolute;inset:44px 0 0 0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:16px}
body.bare #bar{display:none}body.bare #stage{inset:0;padding:0}
iframe{border:0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15);transform-origin:top center}
#note{position:fixed;left:12px;bottom:12px;background:var(--warn);color:#111;padding:6px 10px;border-radius:6px;display:none;max-width:60vw}
</style></head><body>
<div id="bar">
  <span class="lbl">${esc(m.title)}</span>
  <button id="back" title="ย้อนกลับ">←</button>
  <select id="screen"></select>
  <div class="grp"><span class="lbl">viewport</span><span id="vps"></span></div>
  <div class="grp" id="stateGrp"><span class="lbl">state</span><span id="states"></span></div>
  <div class="grp" id="themeGrp"><button id="theme">dark</button></div>
  <span class="sp"></span>
  <span id="warn" title="">⚠ <span id="warnN"></span></span>
  <button id="bare" title="ซ่อน toolbar (กด Esc เพื่อแสดง)">present</button>
</div>
<div id="stage"><iframe id="frame" title="prototype"></iframe></div>
<div id="note"></div>
<script>
const M=${JSON.stringify(m)};
const $=(s)=>document.querySelector(s);const hist=[];
const vpsOf=(scr)=>{const s=new Set();const add=(o)=>Object.keys(o||{}).forEach(k=>s.add(k.split(':')[0]));add(scr.variants);Object.values(scr.states||{}).forEach(add);return [...s].sort((a,b)=>a-b);};
const hasDark=Object.values(M.screens).some(s=>Object.keys(s.variants).some(k=>k.endsWith(':dark')));
function parse(){const h=location.hash.replace(/^#\\/?/,'');const [name,q]=h.split('?');const p=new URLSearchParams(q||'');return{screen:M.screens[name]?name:M.start,vp:p.get('vp'),state:p.get('state')||'default',theme:p.get('theme')||'light'};}
function nav(r,push=true){const cur=parse();if(push)hist.push(location.hash);const q=new URLSearchParams();if(r.vp)q.set('vp',r.vp);if(r.state&&r.state!=='default')q.set('state',r.state);if(r.theme==='dark')q.set('theme','dark');location.hash='/'+r.screen+(q.toString()?'?'+q:'');}
function resolve(r){const scr=M.screens[r.screen];const vps=vpsOf(scr);const vp=vps.includes(r.vp)?r.vp:vps[vps.length-1];const keys=[r.theme==='dark'?vp+':dark':null,vp].filter(Boolean);const note=[];
  let src=null,hit=null;const pick=(o)=>{for(const k of keys){if(o&&o[k]){src=o[k];hit=k;return true;}}return false;};
  if(r.state!=='default'&&!pick((scr.states||{})[r.state]))note.push('state "'+r.state+'" ไม่มี artboard ที่ '+vp+(r.theme==='dark'?' dark':'')+' — แสดง default แทน');
  if(!src)pick(scr.variants);
  if(!src){src=Object.values(scr.variants)[0];note.push('ไม่มี artboard ที่ '+vp+' — แสดง '+Object.keys(scr.variants)[0]+' แทน');}
  else if(r.theme==='dark'&&!hit.endsWith(':dark'))note.push('ไม่มี artboard dark ของหน้านี้ — แสดง light');
  return{src,vp,vps,note};}
function render(){const r=parse();const scr=M.screens[r.screen];const {src,vp,vps,note}=resolve(r);
  $('#screen').value=r.screen;
  $('#vps').innerHTML=vps.map(v=>'<button data-vp="'+v+'" class="'+(v===vp?'on':'')+'">'+v+'</button>').join('');
  const states=['default',...Object.keys(scr.states||{})];$('#stateGrp').style.display=states.length>1?'':'none';
  $('#states').innerHTML=states.map(s=>'<button data-state="'+s+'" class="'+(s===r.state?'on':'')+'">'+s+'</button>').join('');
  $('#themeGrp').style.display=hasDark?'':'none';$('#theme').className=r.theme==='dark'?'on':'';
  const f=$('#frame');f.style.width=vp+'px';const avail=$('#stage').clientWidth-32;f.style.transform=avail<vp?'scale('+(avail/vp)+')':'';
  f.src=src;$('#note').textContent=note.join(' · ');$('#note').style.display=note.length?'block':'none';$('#warn').style.display='none';}
$('#screen').innerHTML=Object.entries(M.screens).map(([k,s])=>'<option value="'+k+'">'+s.title+'</option>').join('');
$('#screen').onchange=(e)=>nav({...parse(),screen:e.target.value,state:'default'});
$('#vps').onclick=(e)=>{const b=e.target.closest('[data-vp]');if(b)nav({...parse(),vp:b.dataset.vp},false);};
$('#states').onclick=(e)=>{const b=e.target.closest('[data-state]');if(b)nav({...parse(),state:b.dataset.state},false);};
$('#theme').onclick=()=>{const r=parse();nav({...r,theme:r.theme==='dark'?'light':'dark'},false);};
$('#back').onclick=()=>{const h=hist.pop();if(h!==undefined){location.hash=h;}};
$('#bare').onclick=()=>document.body.classList.add('bare');
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')document.body.classList.remove('bare');});
window.addEventListener('message',(e)=>{const d=e.data||{};if(!d.__proto)return;const r=parse();
  if(d.type==='go')nav({...r,screen:d.to,state:'default'});else if(d.type==='state')nav({...r,state:d.state},false);else if(d.type==='back')$('#back').click();
  else if(d.type==='ready'&&d.unmatched&&d.unmatched.length){$('#warn').style.display='inline';$('#warnN').textContent=d.unmatched.length;$('#warn').title='selector ใน flow.json ไม่เจอใน artboard นี้:\\n'+d.unmatched.join('\\n');}});
window.addEventListener('hashchange',render);window.addEventListener('resize',render);
if(new URLSearchParams(location.search).get('bare'))document.body.classList.add('bare');
render();
</script></body></html>
`;
}
