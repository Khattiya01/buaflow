#!/usr/bin/env node
'use strict';

/**
 * check-docs-commands — every command an onboarding document tells a reader to run must exist,
 * and be spelled the way the kit spells it (EV-008).
 *
 * Why: onboarding is where a reader copies a line and presses enter. A renamed flag or a script
 * that moved does not fail anything in the kit, it fails the newcomer, silently, on their first
 * try — the exact failure EV-009 recorded (K-4: Phase A opened with commands an agent could not
 * run). This check runs in `npm run check`, so a document cannot drift from the CLI it describes.
 *
 * What is checked, in fenced ```bash blocks and in inline `code` of the documents below:
 *   - buaflow <command> [flags]  /  node [buaflow/]bin/buaflow.js <command> [flags]
 *       the command is one the CLI accepts and every flag parses (bin/buaflow.js parse())
 *   - node [buaflow/]claude-setup/<x>.js [args]  /  node .claude/<x>.js [args]
 *       the script exists in claude-setup/, and when it exports parseArgs the arguments parse
 *   - relative Markdown links resolve to a file that exists
 *
 * Placeholders such as <path> are accepted as values. Shell lines that are not one of the forms
 * above (cd, cp, git, npm) are not interpreted.
 *
 * exit 0 = every command and link resolves · exit 1 = at least one does not
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { COMMANDS, parse } = require(path.join(root, 'bin', 'buaflow.js'));

const DOCUMENTS = ['QUICKSTART.md', 'TROUBLESHOOTING.md', 'examples/worked-sample.md', 'README.md', 'START-HERE.md', 'UPGRADE.md'];

function tokenize(line) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

function commandsIn(input) {
  const text = input.replace(/\r\n/g, '\n');
  const found = [];
  const prose = [];
  // Walk fences line by line: a regex pairs a closing fence with the next opening one as soon as
  // a document has a non-shell block, and then reads output as commands and commands as output.
  let fence = null;
  for (const raw of text.split('\n')) {
    const marker = raw.match(/^\s*```\s*([\w-]*)\s*$/);
    if (marker) {
      fence = fence === null ? marker[1] : null;
      continue;
    }
    if (fence === null) prose.push(raw);
    else if (['bash', 'sh', 'shell'].includes(fence)) {
      const line = raw.replace(/\s+#.*$/, '').trim();
      if (line) found.push(line);
    }
  }
  const inline = /`([^`\n]+)`/g;
  let code;
  const outside = prose.join('\n');
  while ((code = inline.exec(outside)) !== null) {
    if (/^(node |buaflow )/.test(code[1])) found.push(code[1].trim());
  }
  return found;
}

function checkCommand(line) {
  const tokens = tokenize(line);
  let rest = null;
  if (tokens[0] === 'buaflow') rest = tokens.slice(1);
  else if (tokens[0] === 'node' && /^(buaflow\/)?bin\/buaflow\.js$/.test(tokens[1] || '')) rest = tokens.slice(2);
  if (rest) {
    if (!rest.length) return 'no subcommand';
    if (!COMMANDS.includes(rest[0])) return `"${rest[0]}" is not a buaflow command (known: ${COMMANDS.join(', ')})`;
    try { parse(rest); } catch (error) { return error.message; }
    return null;
  }

  if (tokens[0] !== 'node') return null;
  const script = (tokens[1] || '').match(/^(?:buaflow\/)?(?:claude-setup|\.claude)\/([\w.-]+\.js)$/);
  if (!script) return null;
  const file = path.join(root, 'claude-setup', script[1]);
  if (!fs.existsSync(file)) return `claude-setup/${script[1]} does not exist`;
  const source = fs.readFileSync(file, 'utf8');
  // Only modules that guard their own entry point can be required without running them.
  if (!/require\.main === module/.test(source)) return null;
  const mod = require(file);
  if (typeof mod.parseArgs !== 'function') return null;
  try { mod.parseArgs(tokens.slice(2)); } catch (error) { return `${script[1]}: ${error.message}`; }
  return null;
}

function linksIn(text) {
  const links = [];
  const pattern = /\]\(([^)\s#]+)(#[^)]*)?\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (!/^[a-z]+:/i.test(match[1])) links.push(match[1]);
  }
  return links;
}

function check(documents = DOCUMENTS) {
  const problems = [];
  let commands = 0;
  let links = 0;
  for (const document of documents) {
    const file = path.join(root, document);
    if (!fs.existsSync(file)) {
      problems.push(`${document}: document does not exist`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const line of commandsIn(text)) {
      const problem = checkCommand(line);
      if (/^(node|buaflow) /.test(line)) commands++;
      if (problem) problems.push(`${document}: \`${line}\` — ${problem}`);
    }
    for (const link of linksIn(text)) {
      links++;
      if (!fs.existsSync(path.resolve(path.dirname(file), link))) problems.push(`${document}: link ${link} does not resolve`);
    }
  }
  return { ok: problems.length === 0, problems, commands, links };
}

if (require.main === module) {
  const result = check();
  if (!result.ok) {
    console.error(`docs commands: FAIL (${result.problems.length})`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`docs commands: PASS (${result.commands} commands, ${result.links} links in ${DOCUMENTS.length} documents)`);
}

module.exports = { DOCUMENTS, check, checkCommand, commandsIn };
