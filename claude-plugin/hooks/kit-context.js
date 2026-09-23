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

const locked = json(path.join(ROOT, '.buaflow', 'lock.json'))?.kitVersion;
if (has('.claude/gate.js')) {
  lines.push(locked && locked !== version
    ? `This project's Buaflow controls were installed at ${locked}; the plugin kit is ${version}. /buaflow:start upgrades them.`
    : `This project's Buaflow controls are installed${locked ? ` (${locked})` : ''}.`);
} else if (has('docs/planning/_state.md') || has('.buaflow/project.json')) {
  lines.push(`This project uses Buaflow but its gate and checkers are not installed yet — they are installed in Phase 7 with: ${cli} install --plugin --write`);
} else {
  lines.push('This project has not started Buaflow. /buaflow:start begins it.');
}
const folder = json(path.join(ROOT, 'buaflow', 'package.json'));
if (folder?.name === 'buaflow') lines.push(`This project also has a buaflow/ folder (kit ${folder.version}). Use the plugin kit above unless the user says otherwise.`);

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } }));
