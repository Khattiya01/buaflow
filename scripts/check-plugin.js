#!/usr/bin/env node
/**
 * check-plugin — conformance and trust tier of a Claude Code plugin directory (PE-005, PE-006)
 *
 *   node scripts/check-plugin.js claude-plugin
 *   node scripts/check-plugin.js <any-plugin-dir> --json
 *
 * Conformance (fails the check):
 *   - .claude-plugin/plugin.json has a kebab-case name, a semver version and a description
 *   - every hook command points inside the plugin through ${CLAUDE_PLUGIN_ROOT} at a file that exists
 *   - no hook command fetches from the network or pipes into a shell (curl/wget/iwr, `| sh`)
 *   - every skill has SKILL.md with name and description frontmatter; every agent has description
 *   - no absolute paths to a developer's machine anywhere in the plugin
 *
 * Trust tier (reported, decided by evidence rather than by the publisher's say-so):
 *   local      conforms
 *   verified   conforms, every file matches CHECKSUMS.sha256, and `claude plugin validate --strict` passes
 *              when the claude CLI is available (without it, the tier says so instead of pretending)
 * Signing by a publisher key is not implemented: there is one publisher, and a signature nobody
 * verifies against a known key adds nothing a checksum in the same repository does not.
 *
 * exit 0 = conforms · exit 1 = does not · exit 2 = not a plugin directory
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function walk(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : [];
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2].trim()]));
}

function checkPlugin(dir, options = {}) {
  const problems = [];
  const manifestFile = path.join(dir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestFile)) return { error: `${dir} has no .claude-plugin/plugin.json` };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (e) { return { error: `plugin.json is not JSON: ${e.message}` }; }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name || '')) problems.push('plugin.json name must be kebab-case');
  if (!/^\d+\.\d+\.\d+/.test(manifest.version || '')) problems.push('plugin.json version must be semver — an unversioned plugin cannot be pinned');
  if (!manifest.description || manifest.description.length < 20) problems.push('plugin.json description must say what the plugin does');

  const hooksFile = path.join(dir, 'hooks', 'hooks.json');
  if (fs.existsSync(hooksFile)) {
    const hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8')).hooks || {};
    for (const hook of Object.values(hooks).flat().flatMap((g) => g.hooks || [])) {
      const cmd = hook.command || '';
      const target = cmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/);
      if (!target) problems.push(`hook "${cmd}" does not run from \${CLAUDE_PLUGIN_ROOT}`);
      else if (!fs.existsSync(path.join(dir, target[1]))) problems.push(`hook target ${target[1]} does not exist in the plugin`);
      if (/\b(curl|wget|iwr|Invoke-WebRequest)\b|\|\s*(sh|bash|pwsh|powershell)\b/.test(cmd)) problems.push(`hook "${cmd}" fetches from the network or pipes into a shell`);
    }
  }
  for (const skill of fs.existsSync(path.join(dir, 'skills')) ? fs.readdirSync(path.join(dir, 'skills')) : []) {
    const file = path.join(dir, 'skills', skill, 'SKILL.md');
    const fm = fs.existsSync(file) ? frontmatter(fs.readFileSync(file, 'utf8')) : null;
    if (!fm || !fm.name || !fm.description) problems.push(`skills/${skill}/SKILL.md needs name and description frontmatter`);
  }
  for (const agent of walk(path.join(dir, 'agents')).filter((f) => f.endsWith('.md'))) {
    const fm = frontmatter(fs.readFileSync(agent, 'utf8'));
    if (!fm || !fm.description) problems.push(`agents/${path.basename(agent)} needs description frontmatter`);
  }
  for (const file of walk(dir).filter((f) => /\.(json|md|js|sh)$/.test(f))) {
    if (/[A-Z]:\\Users\\|\/home\/[a-z]|\/Users\/[A-Za-z]/.test(fs.readFileSync(file, 'utf8'))) problems.push(`${path.relative(dir, file)} contains an absolute path to a developer's machine`);
  }

  // Trust tier
  const sumsFile = path.join(dir, 'CHECKSUMS.sha256');
  let checksums = 'absent';
  if (fs.existsSync(sumsFile)) {
    const bad = fs.readFileSync(sumsFile, 'utf8').split(/\r?\n/).filter(Boolean).filter((line) => {
      const [digest, rel] = line.split(/\s+/);
      const f = path.join(dir, rel);
      return !fs.existsSync(f) || crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex') !== digest;
    });
    checksums = bad.length ? 'mismatch' : 'match';
    if (bad.length) problems.push(`${bad.length} file(s) do not match CHECKSUMS.sha256`);
  }
  let validated = 'unavailable';
  if (options.validate !== false) {
    const r = spawnSync('claude', ['plugin', 'validate', '--strict', dir], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.error || r.status === null || /not recognized|not found/i.test(r.stderr || '')) validated = 'unavailable';
    else validated = r.status === 0 ? 'pass' : 'fail';
    if (validated === 'fail') problems.push(`claude plugin validate --strict failed: ${(r.stdout || '').split(/\r?\n/).filter((l) => /❯|✘/.test(l)).join(' ')}`);
  }
  const tier = problems.length ? 'none' : checksums === 'match' && validated !== 'fail' ? 'verified' : 'local';
  return { name: manifest.name, version: manifest.version, ok: problems.length === 0, problems, tier, checksums, validated };
}

if (require.main === module) {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!dir) { console.error('usage: node scripts/check-plugin.js <plugin-dir> [--json] [--no-validate]'); process.exit(2); }
  const result = checkPlugin(path.resolve(dir), { validate: !process.argv.includes('--no-validate') });
  if (result.error) { console.error(`check-plugin: ${result.error}`); process.exit(2); }
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`plugin ${result.name}@${result.version}: ${result.ok ? 'PASS' : 'FAIL'} · tier ${result.tier} (checksums ${result.checksums}, claude validate ${result.validated})`);
    for (const p of result.problems) console.log(`  fail: ${p}`);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { checkPlugin };
