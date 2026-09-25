#!/usr/bin/env node
/**
 * kit-context.js — SessionStart hook that ships only in the Claude Code plugin (PE-008)
 *
 * Buaflow's documents say `buaflow/<path>` because the kit used to be a folder in the project. From
 * the plugin the kit lives in the plugin cache, and a skill's text is not guaranteed to have
 * ${CLAUDE_PLUGIN_ROOT} substituted — a hook command is. So this hook tells the session where the
 * kit is, and what state the project is in, in a few lines.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KIT = path.resolve(__dirname, '..', 'kit');
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const has = (rel) => fs.existsSync(path.join(ROOT, rel));
const json = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

const version = json(path.join(KIT, 'package.json'))?.version || 'unknown';
const cli = `node "${path.join(KIT, 'bin', 'buaflow.js')}"`;
const lines = [
  `Buaflow kit ${version} (from the buaflow plugin) is at: ${KIT}`,
  `Where Buaflow documents say \`buaflow/<path>\`, read \`${KIT}${path.sep}<path>\`. Run the Buaflow CLI as: ${cli} <command>`,
];

// Negative when a is older than b; null when either is not x.y.z.
const compare = (a, b) => {
  const [pa, pb] = [a, b].map((v) => (/^\d+\.\d+\.\d+$/.test(String(v)) ? String(v).split('.').map(Number) : null));
  if (!pa || !pb) return null;
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};

// The plugin and the project update separately: the plugin through Claude Code, the gate and checkers
// in .claude/ only through `install`. Either can fall behind without anything failing, so the user is told.
const notices = [];
const locked = json(path.join(ROOT, '.buaflow', 'lock.json'))?.kitVersion;
if (has('.claude/gate.js') || has('.claude/skills') || has('.claude/commands')) {
  const order = locked ? compare(locked, version) : null;
  // No lock means a kit older than 3.11 installed it (the lock arrived in 3.11) — an upgrade, not "installed".
  if (!locked) {
    lines.push(`This project has Buaflow installed from a kit older than 3.11 (no .buaflow/lock.json); the plugin kit is ${version}. /buaflow:start upgrades it.`);
    notices.push(`Buaflow: โปรเจกต์นี้ติดตั้งจาก kit ที่เก่ากว่า 3.11 · plugin เป็น ${version} แล้ว → พิมพ์ /buaflow:start เพื่ออัปเกรด gate และตัวตรวจในโปรเจกต์`);
  } else if (order !== null && order > 0) {
    lines.push(`This project's Buaflow controls were installed at ${locked}, newer than this plugin (${version}). The user's plugin is out of date: tell them to update it and start a new session before relying on skills.`);
    notices.push(`Buaflow: plugin ของคุณ (${version}) เก่ากว่าที่โปรเจกต์นี้ติดตั้งไว้ (${locked}) → รัน claude plugin marketplace update buaflow แล้ว claude plugin update buaflow@buaflow จากนั้นเปิด session ใหม่ · ไม่อยากทำเองอีก: /plugin → Marketplaces → buaflow → Enable auto-update`);
  } else if (locked !== version) {
    lines.push(`This project's Buaflow controls were installed at ${locked}; the plugin kit is ${version}. /buaflow:start upgrades them.`);
    notices.push(`Buaflow: plugin เป็น ${version} แล้ว แต่ gate และตัวตรวจในโปรเจกต์นี้ยังเป็น ${locked} → พิมพ์ /buaflow:start เพื่ออัปเกรด แล้ว commit`);
  } else lines.push(`This project's Buaflow controls are installed (${locked}).`);
} else if (has('docs/planning/_state.md') || has('.buaflow/project.json')) {
  lines.push(`This project uses Buaflow but its gate and checkers are not installed yet — they are installed in Phase 7 with: ${cli} install --plugin --write`);
} else {
  lines.push('This project has not started Buaflow. /buaflow:start begins it.');
}
// PE-010 — a marketplace hosted in a git repository is cloned whole. Until 3.15.0 that was the
// kit's development repository, so every machine also received reference-apps/ and development/:
// files nobody runs, and live enough to break a project (a reference app's tsconfig took down a
// real project's whole test run, because tsconfig-scanning tools do not read .gitignore). The
// marketplace is now its own repository. An old checkout is recognisable by what only the
// development repository has, and the user is told how to move; nothing breaks if they do not.
const marketplaceRepo = json(path.join(KIT, 'package.json'))?.marketplaceRepo;
const plugins = (() => {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    if (path.basename(dir) === 'plugins') return dir;
    if (path.dirname(dir) === dir) return null;
  }
})();
const fatMarketplace = plugins && path.join(plugins, 'marketplaces', 'buaflow');
if (marketplaceRepo && fatMarketplace && fs.existsSync(path.join(fatMarketplace, 'reference-apps'))) {
  lines.push(`This plugin came from the kit's development repository, which Claude Code clones whole (~14 MB of kit sources and reference apps under ${fatMarketplace}). The marketplace is now ${marketplaceRepo} and carries the plugin only.`);
  notices.push(`Buaflow: marketplace ย้ายไป ${marketplaceRepo} แล้ว (ของเดิม clone repo พัฒนาทั้งก้อนลงเครื่อง ~14 MB และไฟล์ในนั้นเคยทำให้ test ของโปรเจกต์จริงพังทั้งชุด) · ย้ายด้วย 3 คำสั่ง: /plugin marketplace remove buaflow → /plugin marketplace add ${marketplaceRepo} → /plugin install buaflow@buaflow · ของเดิมยังใช้ได้ ไม่ต้องรีบ`);
}

const folder = json(path.join(ROOT, 'buaflow', 'package.json'));
if (folder?.name === 'buaflow') lines.push(`This project also has a buaflow/ folder (kit ${folder.version}). Use the plugin kit above unless the user says otherwise.`);

process.stdout.write(JSON.stringify({
  ...(notices.length ? { systemMessage: notices.join('\n') } : {}),
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
}));
