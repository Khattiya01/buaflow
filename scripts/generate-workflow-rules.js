#!/usr/bin/env node
/**
 * generate-workflow-rules — MT-001/MT-002 core→adapter pipeline (first slice: rules only)
 *
 *   node scripts/generate-workflow-rules.js --check          verify claude-setup/rules matches core/rules
 *   node scripts/generate-workflow-rules.js --write           regenerate claude-setup/rules from core/rules
 *   node scripts/generate-workflow-rules.js [--root <path>]   defaults to the repository root
 *
 * ทำไมต้องมี: core/rules/*.md เป็น vendor-neutral source ของ workflow rule (description + triggerPaths
 * + body markdown) ส่วน claude-setup/rules/*.md คือรูปแบบที่ Claude Code ต้องการ (frontmatter key
 * ชื่อ `paths:`) — ไฟล์นี้คือ "Claude Code adapter" ตัวแรก (MT-002) ที่ generate จาก core เดียวกัน (MT-001)
 * แทนการเขียนสองที่ วันที่มี adapter ค่ายอื่น (Codex/Copilot ฯลฯ) ให้เขียน generator ใหม่อ่าน core/rules/
 * ชุดเดียวกันนี้ ไม่ต้องแตะ core
 *
 * Scope ของรอบนี้จงใจแคบ: เฉพาะ rules (paths: + body markdown ล้วน ไม่มี syntax เฉพาะ Claude Code)
 * skills/agents/hooks ยังไม่ทำ เพราะมี syntax ผูกกับ Claude Code โดยตรง ($ARGUMENTS, inline bash
 * execution ในบอดี้, allowed-tools permission string, model hint) ที่ต้องออกแบบ neutral representation
 * ของตัวเองก่อน — ดู core/README.md
 *
 * exit 0 = ผ่าน | exit 1 = core rule ผิดรูปแบบ หรือ claude-setup/rules ไม่ตรงกับ core (--check)
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function parseCoreRule(id, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${id}: missing --- frontmatter block`);
  const [, front, rawBody] = match;

  const descMatch = front.match(/^description:\s*(.+)$/m);
  if (!descMatch || !descMatch[1].trim()) throw new Error(`${id}: frontmatter missing "description"`);
  const description = descMatch[1].trim();

  const pathsMatch = front.match(/^triggerPaths:\s*(\[[\s\S]*?\])\s*$/m);
  if (!pathsMatch) throw new Error(`${id}: frontmatter missing "triggerPaths" as a JSON array`);
  let triggerPaths;
  try {
    triggerPaths = JSON.parse(pathsMatch[1]);
  } catch (error) {
    throw new Error(`${id}: triggerPaths is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(triggerPaths) || !triggerPaths.length || !triggerPaths.every((p) => typeof p === 'string' && p.trim())) {
    throw new Error(`${id}: triggerPaths must be a non-empty array of non-empty strings`);
  }

  const body = rawBody.replace(/^\r?\n/, '');
  if (!body.trim()) throw new Error(`${id}: body must not be empty`);

  return { id, description, triggerPaths, body };
}

// Renders the Claude Code adapter's shape for a core rule: `paths:` frontmatter + the body
// verbatim. This is the entire adapter step for rules — no content is added or removed.
function renderClaudeRule(rule) {
  const lines = ['---', 'paths:', ...rule.triggerPaths.map((p) => `  - ${JSON.stringify(p)}`), '---'];
  return `${lines.join('\n')}\n\n${rule.body}`;
}

function loadCoreRules(root) {
  const coreDir = path.join(root, 'core', 'rules');
  if (!fs.existsSync(coreDir)) throw new Error(`core rules directory not found: ${path.relative(root, coreDir)}`);
  const files = fs.readdirSync(coreDir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new Error(`no core rules found under ${path.relative(root, coreDir)}`);
  return files.map((file) => {
    const id = file.slice(0, -3);
    const text = fs.readFileSync(path.join(coreDir, file), 'utf8');
    return parseCoreRule(id, text);
  });
}

function build(root) {
  const rules = loadCoreRules(root);
  return rules.map((rule) => ({
    id: rule.id,
    generated: renderClaudeRule(rule),
    targetPath: path.join('claude-setup', 'rules', `${rule.id}.md`),
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
    console.error(`generate-workflow-rules: ${error.message}`);
    return 1;
  }
  if (options.help) {
    console.log('Usage: node scripts/generate-workflow-rules.js [--root <path>] [--check | --write]');
    return 0;
  }

  const root = path.resolve(options.root);
  let outputs;
  try {
    outputs = build(root);
  } catch (error) {
    console.error(`generate-workflow-rules: ${error.message}`);
    return 1;
  }

  if (options.write) {
    for (const output of outputs) {
      const targetFile = path.join(root, output.targetPath);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, output.generated);
    }
    console.log(`✓ generate-workflow-rules: wrote ${outputs.length} file(s) to claude-setup/rules/`);
    return 0;
  }

  // --check (or default): compare generated output against what's committed, in both directions —
  // a core rule with no matching claude-setup file, a claude-setup file whose content drifted from
  // what core would generate, and a claude-setup file with no core source (hand-added, bypassing core).
  const rulesDir = path.join(root, 'claude-setup', 'rules');
  const existing = new Set(fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')) : []);
  const problems = [];
  for (const output of outputs) {
    const fileName = `${output.id}.md`;
    existing.delete(fileName);
    const targetFile = path.join(root, output.targetPath);
    if (!fs.existsSync(targetFile)) {
      problems.push(`${output.targetPath}: missing (run --write to generate it from core/rules/${output.id}.md)`);
      continue;
    }
    const current = fs.readFileSync(targetFile, 'utf8');
    if (current !== output.generated) {
      problems.push(`${output.targetPath}: out of sync with core/rules/${output.id}.md (run --write to regenerate)`);
    }
  }
  for (const stray of existing) {
    problems.push(`claude-setup/rules/${stray}: no matching core/rules/${stray} source (hand-added rule bypasses the core)`);
  }

  if (problems.length) {
    console.error(`generate-workflow-rules: FAIL (${problems.length})`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(`✓ generate-workflow-rules --check: ${outputs.length}/${outputs.length} rule(s) in claude-setup/rules/ match core/rules/`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { build, loadCoreRules, main, parseArgs, parseCoreRule, renderClaudeRule };
