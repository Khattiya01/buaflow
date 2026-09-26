#!/usr/bin/env node
/**
 * upgrade.js — everything an upgrade needs to decide, in one report (PE-011)
 *
 *   node buaflow/claude-setup/upgrade.js --root . [--plugin] [--json]           what an upgrade would do
 *   node buaflow/claude-setup/upgrade.js --root . [--plugin] --write [--force]  do the file part of it
 *   buaflow upgrade [--plugin] [--write] [--force]
 *
 * ทำไมต้องมี: /buaflow:start เคยอัปเกรดด้วยการให้ AI อ่าน UPGRADE.md (พันบรรทัด) กับตารางสัญญาณใน START-HERE.md
 * แล้วไล่เช็คเงื่อนไขทีละข้อเอง ⇒ ช้า กิน token และแต่ละรอบเช็คไม่เหมือนกัน · ทุกอย่างที่ตอบได้จากไฟล์ของโปรเจกต์
 * — ติดตั้งรุ่นไหน, ไปทางลัดได้ไหม, ไฟล์ไหนจะถูกทับ, ขั้นที่ต้องลงมือข้อไหนเข้าเงื่อนไข, ไฟล์ไหนใน .claude/ เป็นสำเนา
 * ของ kit ที่ลบได้เมื่อย้ายมาใช้ plugin — จึงเป็นคำสั่ง · AI เหลือแค่อธิบายผลและถามผู้ใช้
 *
 * --write ทำเฉพาะส่วนที่ install ทำ (วางไฟล์ + บันทึก lock) · ไม่ลบอะไร ไม่แก้ settings.json ของทีม และไม่ทำ
 * ขั้นที่ต้องลงมือ — สิ่งเหล่านั้นต้องให้คนตัดสิน · ไม่ยอมเขียนเมื่อโปรเจกต์ติดตั้งจาก kit ที่ใหม่กว่า
 *
 * exit 0 = อัปเกรดได้ / เป็นรุ่นล่าสุดแล้ว · 1 = มี conflict หรือ kit เก่ากว่าโปรเจกต์ · 2 = input ผิด
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { installedFiles, kitHistory, sha } = require('./kit-lock.js');
const install = require('./install.js');

const KIT = path.resolve(__dirname, '..');
const KIT_VERSION = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8')).version;
const HOOK_NAMES = /\.claude\/hooks\/(guard-bash|guard-edit|session-context|format-changed|guard-new-component|usage-capture)\.js/;
const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|authorization|cookie/i;
// Kits before this one need UPGRADE.md's per-version sections first; from it on, the fast path covers the rest.
const FAST_PATH_FROM = '2.3.4';
// The UPGRADE.md section that starts a stepwise upgrade from each version older than FAST_PATH_FROM.
const STEPWISE = [
  ['1.0', 'v1.0 → v2.1'], ['2.0', 'v1.0 → v2.1'], ['2.1', 'v2.1 → v2.2'], ['2.2', 'v2.2 → v2.3'], ['2.3', 'v2.3 → v2.3.1'],
  ['2.3.1', 'v2.3.1 → v2.3.2'], ['2.3.2', 'v2.3.2 → v2.3.3'], ['2.3.3', 'v2.3.3 → v2.3.4'],
];

// Negative when a is older than b. "2.3" reads as 2.3.0.
function compareVersions(a, b) {
  const parts = (v) => String(v).split('.').map(Number).concat([0, 0, 0]).slice(0, 3);
  const [pa, pb] = [parts(a), parts(b)];
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

// The same test as the plugin's SessionStart hook: a team's own .claude/skills/ is not Buaflow, a skill the kit ships is.
function isInstalled(root) {
  const kitSkill = listDir(path.join(KIT, 'claude-setup', 'skills')).some((s) => fs.existsSync(path.join(root, '.claude', 'skills', s, 'SKILL.md')));
  return kitSkill || ['.claude/gate.js', '.claude/commands', '.buaflow/lock.json'].some((rel) => fs.existsSync(path.join(root, rel)));
}

// Which kit a project was installed from: the lock says; without one, the newest kit release any
// installed file matches (a file the kit left alone for several releases still names the old one);
// without a match, START-HERE.md's signal table.
function detectVersion(root) {
  const lock = readJson(path.join(root, '.buaflow', 'lock.json'));
  if (lock?.kitVersion) return { version: lock.kitVersion, from: 'lock' };
  const history = kitHistory() || {};
  let best = null;
  for (const { installed, source } of installedFiles(root)) {
    const now = sha(installed);
    const rel = path.relative(KIT, source).replace(/\\/g, '/');
    // Only the history votes: a file the kit has not changed in years matches today's kit too, and
    // what counts is the release it first shipped in. Kit-only scripts an old Phase 7 copied are not in it.
    const version = history[rel]?.[now];
    if (version && version !== 'unknown' && (!best || compareVersions(version, best) > 0)) best = version;
  }
  if (best) return { version: best, from: 'files' };
  const has = (rel) => fs.existsSync(path.join(root, rel));
  const signal = has('.claude/verifier.js') ? '3.0.0'
    : has('.claude/prototype.js') ? '2.3'
      : has('.claude/stack.json') ? '2.2'
        : has('.claude/skills') && has('AGENTS.md') ? '2.1'
          : has('.claude/commands') || has('CLAUDE.md') ? '1.0' : null;
  return { version: signal, from: signal ? 'signals' : null };
}

function stepwiseStart(version) {
  if (compareVersions(version, FAST_PATH_FROM) >= 0) return null;
  let section = STEPWISE[0][1];
  for (const [from, heading] of STEPWISE) if (compareVersions(version, from) >= 0) section = heading;
  return section;
}

// The fast path's step 4: the steps a person has to do, only where this project meets the condition.
function manualSteps(root, options) {
  const steps = [];
  const rel = (...p) => path.join(...p).replace(/\\/g, '/');
  const claude = path.join(root, '.claude');
  const packs = listDir(path.join(claude, 'packs')).filter((f) => f.endsWith('.json') && readJson(path.join(claude, 'packs', f))?.schemaVersion === '1.0');
  if (packs.length) steps.push({ id: 'pack-1.0', required: true, files: packs.map((f) => rel('.claude/packs', f)), what: 'rewrite each pack as pack 2.0 by hand — there is no converter on purpose', read: 'v2.3.4 → v3.0.0' });
  const profiles = listDir(path.join(claude, 'profiles')).filter((f) => f.endsWith('.json') && readJson(path.join(claude, 'profiles', f))?.schemaVersion === '1.0');
  if (profiles.length) steps.push({ id: 'profile-1.0', required: false, files: profiles.map((f) => rel('.claude/profiles', f)), what: 'migrate-artifact.js --type application-profile --write, then set the budget ceilings (1.0 is still read)', read: 'v3.4.0 → v3.5.0' });
  const evals = listDir(path.join(root, 'docs', 'evals')).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');
  if (evals.length) steps.push({ id: 'eval-markdown', required: true, files: evals.map((f) => rel('docs/evals', f)), what: 'convert each case to .json; the old results table is dropped', read: 'v3.5.0 → v3.6.0' });

  const settings = readJson(path.join(claude, 'settings.json'));
  const allow = settings?.permissions?.allow || [];
  const unsafe = [
    ...allow.filter((a) => /^Bash(\(\s*\*\s*\))?$/.test(a)).map((a) => `permissions.allow has ${a}`),
    ...(settings?.permissions?.defaultMode === 'bypassPermissions' ? ['permissions.defaultMode is bypassPermissions'] : []),
  ];
  const mcp = readJson(path.join(root, '.mcp.json'));
  for (const [name, server] of Object.entries(mcp?.mcpServers || {})) {
    const literal = Object.entries({ ...(server.env || {}), ...(server.headers || {}) })
      .filter(([k, v]) => SECRET_KEY.test(k) && typeof v === 'string' && v.trim() && !/^\$\{[A-Z0-9_]+(:-[^}]*)?\}$/.test(v.trim()) && !/^Bearer \$\{[A-Z0-9_]+\}$/.test(v.trim()));
    if (literal.length) unsafe.push(`.mcp.json server "${name}" holds ${literal.map(([k]) => k).join(', ')} as a literal`);
  }
  if (unsafe.length) steps.push({ id: 'unsafe-permissions', required: true, files: unsafe, what: 'remove them — check-config fails on them since 3.11.0', read: 'v3.10.0 → v3.11.0' });

  const usage = readJson(path.join(root, '.buaflow', 'usage.json'));
  if (!options.plugin && usage?.enabled === true && settings?.hooks && !/usage-capture\.js/.test(JSON.stringify(settings.hooks))) {
    steps.push({ id: 'usage-capture-hook', required: true, files: ['.claude/settings.json'], what: 'wire the usage-capture hook in the 4 places of "hooks" by hand — install seeds settings.json once and never adds to it; without it consent records nothing', read: 'v3.12.1 → v3.13.0' });
  }
  return steps;
}

// Moving a project that copied the kit into .claude/ over to the plugin: which copies are the kit's
// (safe to delete: the plugin now carries them) and which the team wrote or changed (keep).
function pluginMigration(root) {
  const claude = path.join(root, '.claude');
  const settings = readJson(path.join(claude, 'settings.json'));
  const history = kitHistory() || {};
  const kitCopies = [];
  const changedCopies = [];
  const teamFiles = [];
  const classify = (installedRel, sourceRel) => {
    const installed = path.join(root, installedRel);
    const source = path.join(KIT, sourceRel);
    const now = sha(installed);
    if (!fs.existsSync(source) && !history[sourceRel]) teamFiles.push(installedRel);
    else if ((fs.existsSync(source) && now === sha(source)) || history[sourceRel]?.[now]) kitCopies.push(installedRel);
    else changedCopies.push(installedRel);
  };
  for (const f of listDir(path.join(claude, 'hooks')).filter((n) => n.endsWith('.js'))) classify(`.claude/hooks/${f}`, `claude-setup/hooks/${f}`);
  for (const f of listDir(path.join(claude, 'agents')).filter((n) => n.endsWith('.md'))) classify(`.claude/agents/${f}`, `claude-setup/agents/${f}`);
  for (const skill of listDir(path.join(claude, 'skills'))) {
    const dir = path.join(claude, 'skills', skill);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of listDir(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile())) classify(`.claude/skills/${skill}/${f}`, `claude-setup/skills/${skill}/${f}`);
  }
  return {
    hooksInSettings: HOOK_NAMES.test(JSON.stringify(settings?.hooks || {})),
    kitCopies,
    changedCopies,
    teamFiles,
    buaflowFolder: fs.existsSync(path.join(root, 'buaflow', 'bin', 'buaflow.js')),
  };
}

function report(root, options = {}) {
  const base = { kitVersion: KIT_VERSION, plugin: !!options.plugin };
  if (!isInstalled(root)) return { ...base, state: 'not-installed', installed: null, next: ['Buaflow is not installed here: start with Phase 0 (/buaflow:start), not an upgrade'] };
  const installed = detectVersion(root);
  const order = installed.version ? compareVersions(installed.version, KIT_VERSION) : -1;
  const state = order > 0 && installed.from === 'lock' ? 'plugin-behind' : 'upgrade';
  if (state === 'plugin-behind') {
    return { ...base, state, installed, next: [`the project was installed from kit ${installed.version}, newer than this kit (${KIT_VERSION}): update the kit or plugin first and start a new session — installing from an older kit would put older files over newer ones`] };
  }
  const plan = install.plan(root, options);
  const counts = Object.fromEntries(['create', 'update', 'unchanged', 'keep', 'conflict'].map((a) => [a, plan.entries.filter((e) => e.action === a).length]));
  const current = installed.from === 'lock' && order === 0 && !counts.create && !counts.update && !counts.conflict;
  const stepwise = installed.version ? stepwiseStart(installed.version) : stepwiseStart('1.0');
  const manual = manualSteps(root, options);
  const migration = options.plugin ? pluginMigration(root) : null;
  return {
    ...base,
    state: current ? 'current' : 'upgrade',
    installed,
    route: current ? null : stepwise ? 'stepwise' : 'fast-path',
    ...(stepwise && !current ? { stepwise: { from: installed.version || 'unknown', read: stepwise } } : {}),
    install: {
      counts,
      conflicts: plan.entries.filter((e) => e.action === 'conflict').map(({ file, reason }) => ({ file, reason })),
      updates: plan.entries.filter((e) => e.action === 'update').map(({ file, reason }) => ({ file, ...(reason ? { reason } : {}) })),
      creates: plan.entries.filter((e) => e.action === 'create').map((e) => e.file),
      warnings: plan.warnings,
    },
    manual,
    ...(migration ? { migration } : {}),
    _plan: plan,
  };
}

function run(root, options = {}) {
  const result = report(root, options);
  const { _plan: plan, ...out } = result;
  out.written = false;
  if (options.write) {
    if (out.state === 'plugin-behind' || out.state === 'not-installed') return { ...out, refused: true };
    if (plan && out.state === 'upgrade') out.lock = install.apply(root, plan).kitVersion;
    out.written = !!plan && out.state === 'upgrade';
  }
  return out;
}

function text(out) {
  const lines = [];
  if (out.state === 'not-installed' || out.state === 'plugin-behind') return [`upgrade: ${out.state}`, ...out.next.map((n) => `  ${n}`)].join('\n');
  const found = out.installed.version ? `${out.installed.version} (from ${out.installed.from})` : 'unknown';
  lines.push(`upgrade: installed ${found} → kit ${out.kitVersion}: ${out.state}${out.route ? `, ${out.route}` : ''}${out.written ? ' — written' : out.state === 'upgrade' ? ' — dry run, add --write' : ''}`);
  if (out.stepwise) lines.push(`  first: UPGRADE.md section "${out.stepwise.read}" and every section after it up to v${FAST_PATH_FROM}, then this command again`);
  const c = out.install.counts;
  lines.push(`  files: ${c.create} create, ${c.update} update, ${c.unchanged} unchanged, ${c.keep} kept, ${c.conflict} conflict`);
  for (const x of out.install.conflicts) lines.push(`  conflict ${x.file}  (${x.reason})`);
  for (const w of out.install.warnings) lines.push(`  warn     ${w}`);
  for (const m of out.manual) lines.push(`  manual   ${m.id}${m.required ? '' : ' (optional)'}: ${m.what} — ${m.files.join(', ')} · UPGRADE.md "${m.read}"`);
  if (out.migration) {
    const m = out.migration;
    if (m.hooksInSettings) lines.push('  plugin   remove Buaflow\'s entries from "hooks" in .claude/settings.json — with the plugin every hook runs twice');
    if (m.kitCopies.length) lines.push(`  plugin   ${m.kitCopies.length} kit copies in .claude/ can be deleted: ${m.kitCopies.join(', ')}`);
    if (m.changedCopies.length) lines.push(`  plugin   kit files the team changed — look before deleting: ${m.changedCopies.join(', ')}`);
    if (m.teamFiles.length) lines.push(`  plugin   the team's own — keep: ${m.teamFiles.join(', ')}`);
    if (m.buaflowFolder) lines.push('  plugin   the buaflow/ folder is no longer needed');
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--root');
  const root = path.resolve(i !== -1 ? argv[i + 1] : process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`upgrade: ${root} is not a directory`); return 2; }
  const out = run(root, { plugin: argv.includes('--plugin'), force: argv.includes('--force'), write: argv.includes('--write') });
  console.log(argv.includes('--json') ? JSON.stringify(out, null, 2) : text(out));
  return exitCode(out);
}

function exitCode(out) {
  if (out.state === 'not-installed') return 2;
  if (out.state === 'plugin-behind' || out.refused) return 1;
  return out.install?.counts.conflict ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { FAST_PATH_FROM, STEPWISE, compareVersions, detectVersion, exitCode, run, text };
