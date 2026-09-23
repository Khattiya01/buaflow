#!/usr/bin/env node
/**
 * generate-workflow-skills — MT-001/MT-002 core→adapter pipeline (skills slice)
 *
 *   node scripts/generate-workflow-skills.js --check          verify claude-setup/skills matches core/skills
 *   node scripts/generate-workflow-skills.js --write           regenerate claude-setup/skills/*\/SKILL.md from core/skills
 *   node scripts/generate-workflow-skills.js [--root <path>]   defaults to the repository root
 *
 * ทำไมต้องมี: เหมือน scripts/generate-workflow-rules.js แต่สำหรับ skill — core/skills/<id>.md เก็บสิ่งที่
 * เป็นเนื้อหาจริง ๆ (description, argument hint, ใครเรียกได้, body) ส่วนอะไรที่เป็น syntax เฉพาะ
 * Claude Code จะถูกแปลงสองทาง:
 *
 *   - `{{ARGUMENTS}}` ในบอดี้  →  `$ARGUMENTS`            (ตัวแปร argument ของ slash command)
 *   - `{{shell: <cmd>}}` บรรทัดเดี่ยว  →  `` !`<cmd>` ``  (inline bash execution ของ Claude Code)
 *   - `invocation: human`  →  เพิ่มบรรทัด `disable-model-invocation: true`
 *
 * ส่วน `allowed-tools` (permission DSL ของ Claude Code เอง เช่น `Bash(git *)`) **ไม่ถูกทำให้ neutral**
 * ในรอบนี้ — เก็บเป็น `claudeAllowedTools` ตรง ๆ (ลำดับเดิมเป๊ะ) เพราะเป็น syntax ที่ผูกกับ Claude Code
 * โดยเฉพาะและยังไม่มี adapter ตัวที่สองมาพิสูจน์ว่า neutral shape ที่ถูกต้องหน้าตาเป็นอย่างไร — ดู
 * core/README.md ก่อนเพิ่ม field ใหม่
 *
 * exit 0 = ผ่าน | exit 1 = core skill ผิดรูปแบบ หรือ claude-setup/skills ไม่ตรงกับ core (--check)
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const INVOCATIONS = new Set(['human', 'human-or-model']);

function parseCoreSkill(id, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${id}: missing --- frontmatter block`);
  const [, front, rawBody] = match;

  const descMatch = front.match(/^description:\s*(.+)$/m);
  if (!descMatch || !descMatch[1].trim()) throw new Error(`${id}: frontmatter missing "description"`);
  const description = descMatch[1].trim();

  const hintMatch = front.match(/^argumentHint:\s*(.+)$/m);
  if (!hintMatch || !hintMatch[1].trim()) throw new Error(`${id}: frontmatter missing "argumentHint"`);
  const argumentHint = hintMatch[1].trim();

  const invocationMatch = front.match(/^invocation:\s*(.+)$/m);
  const invocation = invocationMatch ? invocationMatch[1].trim() : 'human-or-model';
  if (!INVOCATIONS.has(invocation)) {
    throw new Error(`${id}: invocation must be one of ${[...INVOCATIONS].join(', ')}, got "${invocation}"`);
  }

  const toolsMatch = front.match(/^claudeAllowedTools:\s*(\[[\s\S]*?\])\s*$/m);
  if (!toolsMatch) throw new Error(`${id}: frontmatter missing "claudeAllowedTools" as a JSON array`);
  let claudeAllowedTools;
  try {
    claudeAllowedTools = JSON.parse(toolsMatch[1]);
  } catch (error) {
    throw new Error(`${id}: claudeAllowedTools is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(claudeAllowedTools) || !claudeAllowedTools.length
    || !claudeAllowedTools.every((t) => typeof t === 'string' && t.trim())) {
    throw new Error(`${id}: claudeAllowedTools must be a non-empty array of non-empty strings`);
  }

  const body = rawBody.replace(/^\r?\n/, '');
  if (!body.trim()) throw new Error(`${id}: body must not be empty`);
  if (!body.includes('{{ARGUMENTS}}')) throw new Error(`${id}: body must reference {{ARGUMENTS}} at least once`);

  return { id, description, argumentHint, invocation, claudeAllowedTools, body };
}

// Renders the Claude Code adapter's shape for a core skill: SKILL.md frontmatter + body with
// {{ARGUMENTS}}/{{shell: ...}} resolved to Claude Code's own $ARGUMENTS / inline-bash syntax.
function renderClaudeSkill(skill) {
  const lines = ['---', `name: ${skill.id}`, `description: ${skill.description}`, `argument-hint: "${skill.argumentHint}"`];
  if (skill.invocation === 'human') lines.push('disable-model-invocation: true');
  lines.push(`allowed-tools: ${skill.claudeAllowedTools.join(' ')}`, '---');
  const body = skill.body
    .replace(/\{\{ARGUMENTS\}\}/g, '$ARGUMENTS')
    .replace(/^\{\{shell:\s*(.+)\}\}$/gm, '!`$1`');
  return `${lines.join('\n')}\n\n${body}`;
}

function loadCoreSkills(root) {
  const coreDir = path.join(root, 'core', 'skills');
  if (!fs.existsSync(coreDir)) throw new Error(`core skills directory not found: ${path.relative(root, coreDir)}`);
  const files = fs.readdirSync(coreDir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new Error(`no core skills found under ${path.relative(root, coreDir)}`);
  return files.map((file) => {
    const id = file.slice(0, -3);
    const text = fs.readFileSync(path.join(coreDir, file), 'utf8');
    return parseCoreSkill(id, text);
  });
}

function build(root) {
  const skills = loadCoreSkills(root);
  return skills.map((skill) => ({
    id: skill.id,
    generated: renderClaudeSkill(skill),
    targetPath: path.join('claude-setup', 'skills', skill.id, 'SKILL.md'),
  }));
}

function parseArgs(argv) {
  const options = { root: REPO_ROOT, check: false, write: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') options.root = argv[++i];
    else if (arg === '--check') options.check = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.check && options.write) throw new Error('--check and --write cannot be used together');
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`generate-workflow-skills: ${error.message}`);
    return 1;
  }
  if (options.help) {
    console.log('Usage: node scripts/generate-workflow-skills.js [--root <path>] [--check | --write]');
    return 0;
  }

  const root = path.resolve(options.root);
  let outputs;
  try {
    outputs = build(root);
  } catch (error) {
    console.error(`generate-workflow-skills: ${error.message}`);
    return 1;
  }

  if (options.write) {
    for (const output of outputs) {
      const targetFile = path.join(root, output.targetPath);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, output.generated);
    }
    console.log(`✓ generate-workflow-skills: wrote ${outputs.length} file(s) under claude-setup/skills/`);
    return 0;
  }

  const skillsDir = path.join(root, 'claude-setup', 'skills');
  const existing = new Set(fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
  const problems = [];
  for (const output of outputs) {
    existing.delete(output.id);
    const targetFile = path.join(root, output.targetPath);
    if (!fs.existsSync(targetFile)) {
      problems.push(`${output.targetPath}: missing (run --write to generate it from core/skills/${output.id}.md)`);
      continue;
    }
    const current = fs.readFileSync(targetFile, 'utf8');
    if (current !== output.generated) {
      problems.push(`${output.targetPath}: out of sync with core/skills/${output.id}.md (run --write to regenerate)`);
    }
  }
  for (const stray of existing) {
    problems.push(`claude-setup/skills/${stray}/: no matching core/skills/${stray}.md source (hand-added skill bypasses the core)`);
  }

  if (problems.length) {
    console.error(`generate-workflow-skills: FAIL (${problems.length})`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(`✓ generate-workflow-skills --check: ${outputs.length}/${outputs.length} skill(s) in claude-setup/skills/ match core/skills/`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { build, loadCoreSkills, main, parseArgs, parseCoreSkill, renderClaudeSkill };
