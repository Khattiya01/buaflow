#!/usr/bin/env node
/**
 * install.js — put the project-side controls of Buaflow into a project, from wherever the kit lives (PE-008)
 *
 *   node buaflow/claude-setup/install.js --root .                   show what would change
 *   node buaflow/claude-setup/install.js --root . --write           do it, then record .buaflow/lock.json
 *   node buaflow/claude-setup/install.js --root . --plugin --write  the session layer comes from the plugin
 *   buaflow install [--plugin] [--write] [--force]
 *
 * ทำไมต้องมี: Phase 7 และ UPGRADE.md เคยให้ AI คัดลอกไฟล์ทีละบรรทัดจาก `buaflow/claude-setup/` · เมื่อ kit
 * มากับ plugin จะไม่มีโฟลเดอร์ `buaflow/` ให้คัดลอกจาก และสิ่งที่ plugin ถือไม่ได้ (gate กับตัวตรวจ ที่
 * pre-push และ CI รันนอก session · permission · rules · stack.json) ยังต้องไปอยู่ในโปรเจกต์ ⇒ ส่วนที่
 * deterministic ของการติดตั้งจึงเป็นคำสั่ง ไม่ใช่ขั้นตอนที่ AI ต้องจำ
 *
 * กติกาต่อไฟล์:
 *   control   ของ kit ที่ต้องตรงกับ kit — ไม่มี = create · ตรงแล้ว = unchanged · เป็นของ kit รุ่นเก่า
 *             (ตรงกับ lock หรือเคย ship จาก kit) = update · นอกนั้นคือทีมแก้เอง = conflict ไม่ทับเว้นแต่ --force
 *   seed      ของโปรเจกต์ที่ kit ให้จุดตั้งต้น (stack.json, rules, settings.json, templates) — สร้างเมื่อไม่มีเท่านั้น
 *   settings  --plugin เติม marketplace + enabledPlugins ลง settings.json ที่มีอยู่ เพื่อให้เพื่อนร่วมทีมถูกชวนติดตั้ง plugin
 *
 * exit 0 = ไม่มี conflict · 1 = มี conflict ที่ไม่ได้ทับ · 2 = input ผิด
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha, shippedEarlier, writeLock } = require('./kit-lock.js');

const KIT = path.resolve(__dirname, '..');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8'));
// Scripts that run from the kit itself and never belong in a project.
const KIT_ONLY = new Set(['assess.js', 'benchmark.js', 'install.js', 'intake.js', 'kit-lock.js', 'local-ci.js', 'usage-report.js']);
const PLUGIN_ID = 'buaflow@buaflow';
// The kit's scripts are CommonJS. Node picks the module type from the nearest package.json, so in a
// project whose own package.json says "type": "module" every .claude/*.js (and the plugin's hooks)
// would load as ESM and fail on require. A package.json next to them stops that lookup.
const COMMONJS_PACKAGE = `${JSON.stringify({ private: true, type: 'commonjs' }, null, 2)}\n`;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

// "github:owner/repo" in package.json → the marketplace source teammates are offered.
function marketplaceSource() {
  const repo = String(PACKAGE.repository?.url || PACKAGE.repository || '').replace(/^github:/, '').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? { source: 'github', repo } : null;
}

function readLock(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.buaflow', 'lock.json'), 'utf8')); } catch { return null; }
}

function plan(root, options = {}) {
  const setup = path.join(KIT, 'claude-setup');
  const lock = readLock(root);
  const rel = (file) => path.relative(root, file).replace(/\\/g, '/');
  const entries = [];

  const control = (from, to) => {
    const target = rel(to);
    if (!fs.existsSync(to)) return entries.push({ kind: 'control', from, to, file: target, action: 'create' });
    const now = sha(to);
    if (now === sha(from)) return entries.push({ kind: 'control', from, to, file: target, action: 'unchanged' });
    if (lock?.files?.[target] === now) return entries.push({ kind: 'control', from, to, file: target, action: 'update', reason: `unchanged since installed at ${lock.kitVersion}` });
    const shippedIn = shippedEarlier(from, now);
    if (shippedIn) return entries.push({ kind: 'control', from, to, file: target, action: 'update', reason: `kit file from ${shippedIn}` });
    return entries.push({ kind: 'control', from, to, file: target, action: options.force ? 'update' : 'conflict', reason: 'changed by the project — not part of any kit release' });
  };
  const seed = (from, to, content) => {
    const target = rel(to);
    entries.push({ kind: 'seed', from, to, file: target, content, action: fs.existsSync(to) ? 'keep' : 'create' });
  };

  const claude = path.join(root, '.claude');
  for (const name of fs.readdirSync(setup).filter((n) => n.endsWith('.js') && !KIT_ONLY.has(n)).sort()) control(path.join(setup, name), path.join(claude, name));
  if (!options.plugin) {
    for (const file of walk(path.join(setup, 'hooks')).filter((f) => f.endsWith('.js'))) control(file, path.join(claude, 'hooks', path.basename(file)));
    // agents/README.md documents the folder; Claude Code would load it as an agent without frontmatter.
    for (const file of walk(path.join(setup, 'agents')).filter((f) => f.endsWith('.md') && path.basename(f) !== 'README.md')) control(file, path.join(claude, 'agents', path.basename(file)));
    for (const file of walk(path.join(setup, 'skills'))) control(file, path.join(claude, 'skills', path.relative(path.join(setup, 'skills'), file)));
  }
  // security-baseline.js looks here, so CI can check the mapping without the kit on the runner.
  for (const file of walk(path.join(KIT, 'standards', 'control-sets'))) control(file, path.join(claude, 'control-sets', path.basename(file)));

  seed(null, path.join(claude, 'package.json'), COMMONJS_PACKAGE);
  seed(path.join(setup, 'stack.json'), path.join(claude, 'stack.json'));
  // Rules are fitted to each project (Phase A.5): seed the folder once, never file by file into one that exists.
  if (!fs.existsSync(path.join(claude, 'rules'))) for (const file of walk(path.join(setup, 'rules'))) seed(file, path.join(claude, 'rules', path.basename(file)));
  for (const file of walk(path.join(KIT, 'templates')).filter((f) => /\.tpl\.(md|json)$/.test(f))) seed(file, path.join(root, 'docs', 'templates', path.basename(file)));

  const settingsFile = path.join(claude, 'settings.json');
  const warnings = [];
  if (!fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(path.join(setup, 'settings.json.tpl'), 'utf8'));
    if (options.plugin) { delete settings.hooks; Object.assign(settings, pluginSettings(settings)); }
    seed(path.join(setup, 'settings.json.tpl'), settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  } else {
    let settings = null;
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { warnings.push('.claude/settings.json is not valid JSON — left alone'); }
    if (settings && options.plugin) {
      const merged = { ...settings, ...pluginSettings(settings) };
      if (JSON.stringify(merged) !== JSON.stringify(settings)) entries.push({ kind: 'settings', to: settingsFile, file: rel(settingsFile), content: `${JSON.stringify(merged, null, 2)}\n`, action: 'update', reason: `offer ${PLUGIN_ID} to everyone who opens the project` });
      if (/\.claude\/hooks\/(guard-bash|guard-edit|session-context|format-changed|guard-new-component|usage-capture)\.js/.test(JSON.stringify(settings.hooks || {}))) {
        warnings.push('.claude/settings.json still wires Buaflow hooks from .claude/hooks/ — with the plugin enabled every hook runs twice; remove those entries from "hooks"');
      }
    }
  }
  return { kitVersion: PACKAGE.version, plugin: !!options.plugin, entries, warnings };
}

function pluginSettings(settings) {
  const out = {};
  const source = marketplaceSource();
  if (source && !settings.extraKnownMarketplaces?.buaflow) out.extraKnownMarketplaces = { ...(settings.extraKnownMarketplaces || {}), buaflow: { source } };
  if (settings.enabledPlugins?.[PLUGIN_ID] !== true) out.enabledPlugins = { ...(settings.enabledPlugins || {}), [PLUGIN_ID]: true };
  return out;
}

function apply(root, report) {
  for (const entry of report.entries) {
    if (!['create', 'update'].includes(entry.action)) continue;
    fs.mkdirSync(path.dirname(entry.to), { recursive: true });
    if (entry.content !== undefined) fs.writeFileSync(entry.to, entry.content);
    else fs.copyFileSync(entry.from, entry.to);
  }
  const gitignore = path.join(root, '.gitignore');
  if (fs.existsSync(gitignore) && !/^\.verify-flakes\.jsonl$/m.test(fs.readFileSync(gitignore, 'utf8'))) {
    fs.appendFileSync(gitignore, `${fs.readFileSync(gitignore, 'utf8').endsWith('\n') ? '' : '\n'}.verify-flakes.jsonl\n`);
  }
  return writeLock(root);
}

function summarize(report) {
  const count = (a) => report.entries.filter((e) => e.action === a).length;
  return { create: count('create'), update: count('update'), unchanged: count('unchanged'), keep: count('keep'), conflict: count('conflict') };
}

function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--root');
  const root = path.resolve(i !== -1 ? argv[i + 1] : process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`install: ${root} is not a directory`); return 2; }
  const options = { plugin: argv.includes('--plugin'), force: argv.includes('--force') };
  const report = plan(root, options);
  const write = argv.includes('--write');
  if (write) report.lock = apply(root, report).kitVersion;
  report.written = write;
  report.counts = summarize(report);
  const out = { ...report, entries: report.entries.map(({ kind, file, action, reason }) => ({ kind, file, action, ...(reason ? { reason } : {}) })) };
  if (argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
  else {
    const c = report.counts;
    console.log(`install: kit ${report.kitVersion}${report.plugin ? ' (session layer from the plugin)' : ''} — ${c.create} create, ${c.update} update, ${c.unchanged} unchanged, ${c.keep} kept, ${c.conflict} conflict${write ? '' : ' · dry run, add --write'}`);
    for (const e of out.entries.filter((x) => !['unchanged', 'keep'].includes(x.action))) console.log(`  ${e.action.padEnd(8)} ${e.file}${e.reason ? `  (${e.reason})` : ''}`);
    for (const w of report.warnings) console.log(`  warn     ${w}`);
  }
  return report.counts.conflict ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { COMMONJS_PACKAGE, KIT_ONLY, main, plan };
