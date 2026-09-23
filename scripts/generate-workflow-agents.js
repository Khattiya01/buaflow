#!/usr/bin/env node
/**
 * generate-workflow-agents — MT-001/MT-002 core→adapter pipeline (agents slice)
 *
 *   node scripts/generate-workflow-agents.js --check          verify claude-setup/agents matches core/agents
 *   node scripts/generate-workflow-agents.js --write           regenerate claude-setup/agents/*.md from core/agents
 *   node scripts/generate-workflow-agents.js [--root <path>]   defaults to the repository root
 *
 * ทำไมต้องมี: เหมือน scripts/generate-workflow-rules.js/generate-workflow-skills.js แต่สำหรับ subagent —
 * `modelTier` (fast/balanced/deep) เป็น concept ที่ vendor ไหนก็มี (ทุกค่ายมี model ตระกูลเล็ก/กลาง/ใหญ่)
 * จึงทำให้ neutral จริง ๆ ได้ ต่างจาก `claudeTools` ซึ่งเก็บชื่อ tool ตรง ๆ ตามลำดับเดิม (ไม่ทำ taxonomy ใหม่)
 * เพราะมี consumer จริงแค่ตัวเดียว — ดู core/README.md
 *
 * exit 0 = ผ่าน | exit 1 = core agent ผิดรูปแบบ หรือ claude-setup/agents ไม่ตรงกับ core (--check)
 * ไม่มี dependency — Node ล้วน รันได้ทุก OS
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MODEL_MAP = { fast: 'haiku', balanced: 'sonnet', deep: 'opus' };

function parseCoreAgent(id, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${id}: missing --- frontmatter block`);
  const [, front, rawBody] = match;

  const descMatch = front.match(/^description:\s*(.+)$/m);
  if (!descMatch || !descMatch[1].trim()) throw new Error(`${id}: frontmatter missing "description"`);
  const description = descMatch[1].trim();

  const tierMatch = front.match(/^modelTier:\s*(.+)$/m);
  if (!tierMatch) throw new Error(`${id}: frontmatter missing "modelTier"`);
  const modelTier = tierMatch[1].trim();
  if (!Object.prototype.hasOwnProperty.call(MODEL_MAP, modelTier)) {
    throw new Error(`${id}: modelTier must be one of ${Object.keys(MODEL_MAP).join(', ')}, got "${modelTier}"`);
  }

  const toolsMatch = front.match(/^claudeTools:\s*(\[[\s\S]*?\])\s*$/m);
  if (!toolsMatch) throw new Error(`${id}: frontmatter missing "claudeTools" as a JSON array`);
  let claudeTools;
  try {
    claudeTools = JSON.parse(toolsMatch[1]);
  } catch (error) {
    throw new Error(`${id}: claudeTools is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(claudeTools) || !claudeTools.length || !claudeTools.every((t) => typeof t === 'string' && t.trim())) {
    throw new Error(`${id}: claudeTools must be a non-empty array of non-empty strings`);
  }

  const body = rawBody.replace(/^\r?\n/, '');
  if (!body.trim()) throw new Error(`${id}: body must not be empty`);

  return { id, description, modelTier, claudeTools, body };
}

function renderClaudeAgent(agent) {
  const lines = [
    '---',
    `name: ${agent.id}`,
    `description: ${agent.description}`,
    `tools: ${agent.claudeTools.join(', ')}`,
    `model: ${MODEL_MAP[agent.modelTier]}`,
    '---',
  ];
  return `${lines.join('\n')}\n\n${agent.body}`;
}

function loadCoreAgents(root) {
  const coreDir = path.join(root, 'core', 'agents');
  if (!fs.existsSync(coreDir)) throw new Error(`core agents directory not found: ${path.relative(root, coreDir)}`);
  const files = fs.readdirSync(coreDir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new Error(`no core agents found under ${path.relative(root, coreDir)}`);
  return files.map((file) => {
    const id = file.slice(0, -3);
    const text = fs.readFileSync(path.join(coreDir, file), 'utf8');
    return parseCoreAgent(id, text);
  });
}

function build(root) {
  const agents = loadCoreAgents(root);
  return agents.map((agent) => ({
    id: agent.id,
    generated: renderClaudeAgent(agent),
    targetPath: path.join('claude-setup', 'agents', `${agent.id}.md`),
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
    console.error(`generate-workflow-agents: ${error.message}`);
    return 1;
  }
  if (options.help) {
    console.log('Usage: node scripts/generate-workflow-agents.js [--root <path>] [--check | --write]');
    return 0;
  }

  const root = path.resolve(options.root);
  let outputs;
  try {
    outputs = build(root);
  } catch (error) {
    console.error(`generate-workflow-agents: ${error.message}`);
    return 1;
  }

  if (options.write) {
    for (const output of outputs) {
      const targetFile = path.join(root, output.targetPath);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, output.generated);
    }
    console.log(`✓ generate-workflow-agents: wrote ${outputs.length} file(s) to claude-setup/agents/`);
    return 0;
  }

  const agentsDir = path.join(root, 'claude-setup', 'agents');
  // README.md documents the agents directory itself (why only 3 subagents, when to add one) —
  // it is not an agent definition and has no core/agents/ source; excluded from the drift check.
  const existing = new Set(
    fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f !== 'README.md') : []
  );
  const problems = [];
  for (const output of outputs) {
    const fileName = `${output.id}.md`;
    existing.delete(fileName);
    const targetFile = path.join(root, output.targetPath);
    if (!fs.existsSync(targetFile)) {
      problems.push(`${output.targetPath}: missing (run --write to generate it from core/agents/${output.id}.md)`);
      continue;
    }
    const current = fs.readFileSync(targetFile, 'utf8');
    if (current !== output.generated) {
      problems.push(`${output.targetPath}: out of sync with core/agents/${output.id}.md (run --write to regenerate)`);
    }
  }
  for (const stray of existing) {
    problems.push(`claude-setup/agents/${stray}: no matching core/agents/${stray} source (hand-added agent bypasses the core)`);
  }

  if (problems.length) {
    console.error(`generate-workflow-agents: FAIL (${problems.length})`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(`✓ generate-workflow-agents --check: ${outputs.length}/${outputs.length} agent(s) in claude-setup/agents/ match core/agents/`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { build, loadCoreAgents, main, parseArgs, parseCoreAgent, renderClaudeAgent };
