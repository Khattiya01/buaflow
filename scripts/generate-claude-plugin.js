#!/usr/bin/env node
/**
 * generate-claude-plugin — Buaflow as an installable Claude Code plugin (PE-001, PE-006, PE-007)
 *
 *   node scripts/generate-claude-plugin.js --check    claude-plugin/ and the marketplace match claude-setup/
 *   node scripts/generate-claude-plugin.js --write    regenerate them
 *
 * ทำไมต้องมี: วันนี้การติดตั้ง Buaflow คือการคัดลอกโฟลเดอร์ตาม Phase 7 ทีละบรรทัด · Claude Code มี plugin
 * กับ marketplace ของตัวเองแล้ว ⇒ ชั้นที่อยู่ใน session (skills, agents, hooks) ติดตั้งได้ด้วยคำสั่งเดียว:
 *
 *   /plugin marketplace add <marketplaceRepo ใน package.json>
 *   /plugin install buaflow@buaflow
 *
 * marketplace **ไม่ใช่ repository นี้** (PE-010): marketplace ที่อยู่บน git ถูก clone ทั้งก้อนลงเครื่องผู้ใช้
 * ที่นี่มี reference-apps/, development/ และสำเนาของ kit อีกชุดใน claude-plugin/kit/ ซึ่งผู้ใช้ไม่ได้ใช้เลย
 * และเคยทำให้ test ของโปรเจกต์จริงพังทั้งชุด · scripts/publish-plugin.js เป็นตัว push ของที่ generate ที่นี่
 * ไปยัง repository ของ marketplace
 *
 * สิ่งที่ plugin **ไม่ได้** ถือ และจงใจไม่ถือ:
 *   - gate และตัวตรวจทั้งหมด (.claude/gate.js, readiness.js …) — ต้อง commit อยู่ในโปรเจกต์ เพราะ pre-push
 *     และ CI รันมันนอก session ซึ่ง plugin ไม่มีอยู่ตรงนั้น (manual/README.md: ตารางการรับประกัน)
 *   - permissions — plugin ส่ง permission ไม่ได้ (เอกสารของ Claude Code) · settings.json ของโปรเจกต์ยังจำเป็น
 *   - rules ที่ผูก paths — ต้องปรับให้ตรงโครงของแต่ละโปรเจกต์ (Phase A.5) จึงไม่ใช่ของที่แจกแบบเดียวกันทุกที่
 *
 * ทุกไฟล์ใน claude-plugin/ มาจาก claude-setup/ (ซึ่งมาจาก core/ อีกที) และถูกตรึงด้วย sha256 ใน
 * CHECKSUMS.sha256 · --check ตรวจทั้ง drift และ checksum ⇒ แก้ไฟล์ใน plugin ด้วยมือไม่ได้
 *
 * exit 0 = ตรง · exit 1 = ไม่ตรง / ผิดรูปแบบ
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = 'claude-plugin';
const MARKETPLACE = path.join('.claude-plugin', 'marketplace.json');
const KIT_BUNDLE = ['package.json', 'START-HERE.md', 'QUICKSTART.md', 'CLI.md', 'UPGRADE.md', 'TROUBLESHOOTING.md', 'VERSION.md',
  'bin', 'claude-setup', 'phases', 'standards', 'templates', 'schemas', 'packs', 'scripts/migrate-artifact.js'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function build(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const setup = path.join(root, 'claude-setup');
  const files = new Map();
  const put = (rel, content) => files.set(rel.replace(/\\/g, '/'), content);

  const description = 'Buaflow workflow for Claude Code: intent → elaborate → spec → plan → task → check → done, with guard hooks. The gate and evidence controls stay committed in the project (.claude/), because pre-push and CI run them outside any session.';
  put('.claude-plugin/plugin.json', `${JSON.stringify({
    name: 'buaflow',
    version: pkg.version,
    description,
    author: { name: 'Buaflow' },
    keywords: ['workflow', 'sdlc', 'readiness', 'verification'],
  }, null, 2)}\n`);

  for (const file of walk(path.join(setup, 'skills'))) put(path.join('skills', path.relative(path.join(setup, 'skills'), file)), fs.readFileSync(file, 'utf8'));
  // agents/README.md documents the folder; Claude Code would load it as an agent without frontmatter.
  for (const file of walk(path.join(setup, 'agents')).filter((f) => path.basename(f) !== 'README.md')) put(path.join('agents', path.relative(path.join(setup, 'agents'), file)), fs.readFileSync(file, 'utf8'));
  for (const file of fs.readdirSync(path.join(setup, 'hooks')).filter((f) => f.endsWith('.js'))) put(path.join('hooks', file), fs.readFileSync(path.join(setup, 'hooks', file), 'utf8'));
  // Two hooks require('../stack-config.js'); it reads the PROJECT's .claude/stack.json through
  // CLAUDE_PROJECT_DIR, so the plugin's copy still follows each project's own configuration.
  put('stack-config.js', fs.readFileSync(path.join(setup, 'stack-config.js'), 'utf8'));
  // The plugin cache can sit inside a project (a project-local config dir); without its own
  // package.json, a project's "type": "module" makes Node load hooks/*.js as ESM and they fail on require.
  put('package.json', require(path.join(setup, 'install.js')).COMMONJS_PACKAGE);

  // PE-008: the whole kit rides along under kit/, so nobody has to clone buaflow/ into a project.
  // Left out on purpose: reference-apps/ (examples, not runtime), manual/ (for tools without
  // Claude Code), core/ (the source claude-setup/ is generated from), claude-setup/tests/, and the
  // kit's own development records.
  for (const rel of KIT_BUNDLE) {
    const source = path.join(root, rel);
    const files = fs.statSync(source).isDirectory() ? walk(source) : [source];
    for (const file of files) {
      const inside = path.relative(root, file).replace(/\\/g, '/');
      if (inside.startsWith('claude-setup/tests/')) continue;
      put(path.join('kit', inside), fs.readFileSync(file, 'utf8'));
    }
  }
  // Plugin-only pieces: the /buaflow:start skill and the hook that tells a session where kit/ is.
  for (const file of walk(path.join(root, 'plugin-src'))) put(path.relative(path.join(root, 'plugin-src'), file), fs.readFileSync(file, 'utf8'));

  const settings = JSON.parse(fs.readFileSync(path.join(setup, 'settings.json.tpl'), 'utf8'));
  const hooks = JSON.parse(JSON.stringify(settings.hooks).split('${CLAUDE_PROJECT_DIR}/.claude/hooks/').join('${CLAUDE_PLUGIN_ROOT}/hooks/'));
  hooks.SessionStart[0].hooks.unshift({ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/kit-context.js"', timeout: 10 });
  for (const [, groups] of Object.entries(hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const target = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([\w-]+\.js)/);
        if (!target || !files.has(`hooks/${target[1]}`)) throw new Error(`settings.json.tpl wires a hook the plugin does not carry: ${hook.command}`);
      }
    }
  }
  put('hooks/hooks.json', `${JSON.stringify({ hooks }, null, 2)}\n`);

  put('README.md', [
    '<!-- generated by scripts/generate-claude-plugin.js — do not edit by hand -->',
    '# buaflow — Claude Code plugin',
    '',
    '```text',
    '/plugin marketplace add Khattiya01/buaflow-plugin',
    '/plugin install buaflow@buaflow',
    '/buaflow:start',
    '```',
    '',
    'In the VS Code extension `/plugin` is not available — run `claude plugin marketplace add Khattiya01/buaflow-plugin` and',
    '`claude plugin install buaflow@buaflow` in a terminal, then start a new session.',
    '',
    'No `buaflow/` folder is needed in the project: the whole kit ships under `kit/`, and a SessionStart hook tells',
    'each session where it is. `/buaflow:start` starts Phase 0, resumes a project, or upgrades one.',
    '',
    '| Carried by the plugin | Written into the project by `buaflow install --plugin --write` in Phase 7 |',
    '|---|---|',
    '| skills (/intent /elaborate /spec /plan /task /check /done /hotfix /release /ui /prototype, and /buaflow:start) | `.claude/gate.js` and every checker it runs — pre-push and CI run them outside any session |',
    '| agents (code-reviewer, legacy-explorer, test-writer) | `.claude/settings.json` permissions — a plugin cannot ship permissions |',
    '| hooks (guard-edit, guard-bash, guard-new-component, format-changed, session-context, usage-capture, kit-context) | `.claude/rules/*.md` — their paths are fitted to each project in Phase A.5 |',
    '| the kit: START-HERE, phases, standards, templates, schemas, packs and the `buaflow` CLI | `.claude/stack.json` — the hooks read it from the project |',
    '',
    'Use the plugin **or** the hooks block in the project\'s `.claude/settings.json`, not both — otherwise every hook runs twice.',
    'Teammates get the marketplace from the project\'s settings automatically; each runs `/plugin install buaflow@buaflow` once.',
    '',
  ].join('\n'));

  // Digests are over LF-normalised text so a Windows checkout (CRLF) verifies the same as Linux.
  // Code-point order, not localeCompare: the file is compared byte-for-byte, and locale collation
  // differs between a Windows machine and a Linux CI runner (punctuation and case are weighted differently).
  const checksums = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([rel, content]) => `${sha256(content.replace(/\r\n/g, '\n'))}  ${rel}`).join('\n');
  put('CHECKSUMS.sha256', `${checksums}\n`);

  const marketplace = `${JSON.stringify({
    name: 'buaflow',
    owner: { name: 'Buaflow' },
    description: 'The Buaflow kit as a Claude Code plugin: workflow skills, review agents and guard hooks.',
    plugins: [{ name: 'buaflow', source: `./${PLUGIN_DIR}`, description, version: pkg.version }],
  }, null, 2)}\n`;
  return { files, marketplace };
}

function verifyChecksums(root) {
  const file = path.join(root, PLUGIN_DIR, 'CHECKSUMS.sha256');
  const problems = [];
  if (!fs.existsSync(file)) return ['CHECKSUMS.sha256 is missing'];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const [digest, rel] = line.split(/\s+/);
    const target = path.join(root, PLUGIN_DIR, rel);
    if (!fs.existsSync(target)) problems.push(`${rel}: listed in CHECKSUMS.sha256 but missing`);
    else if (sha256(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n')) !== digest) problems.push(`${rel}: checksum does not match — edited by hand after generation`);
  }
  return problems;
}

function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  let result;
  try { result = build(ROOT); } catch (error) {
    console.error(`generate-claude-plugin: ${error.message}`);
    return 1;
  }
  const outDir = path.join(ROOT, PLUGIN_DIR);
  if (write) {
    fs.rmSync(outDir, { recursive: true, force: true });
    for (const [rel, content] of result.files) {
      const file = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    fs.mkdirSync(path.dirname(path.join(ROOT, MARKETPLACE)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, MARKETPLACE), result.marketplace);
    console.log(`✓ generate-claude-plugin: wrote ${result.files.size} file(s) under ${PLUGIN_DIR}/ and ${MARKETPLACE.replace(/\\/g, '/')}`);
    return 0;
  }
  const problems = [];
  const norm = (text) => text.replace(/\r\n/g, '\n');
  for (const [rel, content] of result.files) {
    const file = path.join(outDir, rel);
    if (!fs.existsSync(file)) problems.push(`${PLUGIN_DIR}/${rel}: missing (run --write)`);
    else if (norm(fs.readFileSync(file, 'utf8')) !== norm(content)) problems.push(`${PLUGIN_DIR}/${rel}: out of sync with claude-setup/ (run --write)`);
  }
  for (const file of walk(outDir)) {
    const rel = path.relative(outDir, file).replace(/\\/g, '/');
    if (!result.files.has(rel)) problems.push(`${PLUGIN_DIR}/${rel}: not generated (hand-added files bypass claude-setup/)`);
  }
  const market = path.join(ROOT, MARKETPLACE);
  if (!fs.existsSync(market) || norm(fs.readFileSync(market, 'utf8')) !== result.marketplace) problems.push(`${MARKETPLACE.replace(/\\/g, '/')}: missing or out of sync (run --write)`);
  problems.push(...verifyChecksums(ROOT));
  if (problems.length) {
    console.error(`generate-claude-plugin: FAIL (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`✓ generate-claude-plugin --check: ${result.files.size} plugin file(s) match claude-setup/ and their checksums`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { build, verifyChecksums };
