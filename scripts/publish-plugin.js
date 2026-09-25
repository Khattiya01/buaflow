#!/usr/bin/env node
'use strict';

/**
 * publish-plugin — push the generated plugin to the marketplace repository (PE-010)
 *
 * Why this exists: a git-hosted marketplace is cloned **whole** onto every user's machine. This
 * repository is where the kit is developed, so it also carries reference apps, the development
 * record, CI, and a second copy of every kit file under claude-plugin/kit/. A user needs none of
 * that — measured on a real project, 14 MB arrived and 2.4 MB of it was the plugin. Worse, the
 * files that arrive are live: a reference app's tsconfig.json broke that project's whole test run,
 * because tsconfig-scanning tools find every tsconfig in the workspace and do not read .gitignore.
 *
 * So the marketplace is its own repository, holding only what a user runs:
 *
 *     <marketplaceRepo>/.claude-plugin/marketplace.json
 *     <marketplaceRepo>/claude-plugin/**
 *
 * The layout matches this repository's, so `source: "./claude-plugin"` needs no rewriting and the
 * published tree is byte-identical to what `generate-claude-plugin.js` already checks here.
 *
 * Usage:
 *   node scripts/publish-plugin.js --dry-run     # what would be published, and where (in `npm run check`)
 *   node scripts/publish-plugin.js               # clone, replace, commit, tag, push
 *
 * exit 0 = published (or the dry run passed) · exit 1 = refused, with the reason
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function fail(message) {
  console.error(`publish-plugin: ${message}`);
  process.exit(1);
}

function git(cwd, args, { capture = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed in ${cwd}${capture ? `: ${result.stderr || result.stdout}` : ''}`);
  return (result.stdout || '').trim();
}

// Every file the marketplace repository gets, as paths relative to the repository root. Nothing
// else is published, so adding a directory here is the only way to widen what users receive.
function filesToPublish() {
  const out = [];
  const walk = (relative) => {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else out.push(next);
    }
  };
  walk('.claude-plugin');
  walk('claude-plugin');
  return out.sort();
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pkg = readJson(path.join(root, 'package.json'));
  const repo = String(pkg.marketplaceRepo || '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail('package.json has no marketplaceRepo of the form owner/repo');
  if (repo === String(pkg.repository || '').replace(/^github:/, '')) {
    fail('marketplaceRepo is this repository; publishing here is what this script exists to stop');
  }

  // The published tree must be the one this repository checks, not one this script assembles.
  // Without this the marketplace could carry a plugin no check in `npm run check` has ever seen.
  const generated = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-claude-plugin.js'), '--check'], { cwd: root, encoding: 'utf8' });
  if (generated.status !== 0) {
    process.stderr.write(generated.stdout || '');
    fail('claude-plugin/ is out of sync with the kit source; run scripts/generate-claude-plugin.js --write first');
  }

  const version = pkg.version;
  const marketplace = readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
  const manifest = readJson(path.join(root, 'claude-plugin', '.claude-plugin', 'plugin.json'));
  const entry = (marketplace.plugins || []).find((p) => p.name === 'buaflow');
  if (!entry) fail('no plugin entry named buaflow in .claude-plugin/marketplace.json');
  if (entry.version !== version || manifest.version !== version) {
    fail(`version disagreement: package.json ${version}, marketplace entry ${entry.version}, plugin.json ${manifest.version}`);
  }
  if (entry.source !== './claude-plugin') fail(`the marketplace entry's source is ${entry.source}; this script publishes the ./claude-plugin layout`);

  const files = filesToPublish();
  const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
  console.log(`publish-plugin: buaflow ${version} → github.com/${repo}`);
  console.log(`publish-plugin: ${files.length} file(s), ${(bytes / 1024 / 1024).toFixed(2)} MB`);

  if (dryRun) {
    console.log('publish-plugin: dry run, nothing pushed');
    return;
  }

  // Publishing from a dirty tree puts files on users' machines that are in no commit here, so the
  // version they run could never be reproduced from this repository's history.
  const dirty = git(root, ['status', '--porcelain'], { capture: true });
  if (dirty) fail('this repository has uncommitted changes; commit them first so the published tree is reproducible');
  const commit = git(root, ['rev-parse', 'HEAD'], { capture: true });

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'buaflow-publish-'));
  try {
    git(work, ['clone', '--depth', '1', `https://github.com/${repo}.git`, 'marketplace']);
    const target = path.join(work, 'marketplace');

    // Replace rather than merge: a file this repository stopped generating must stop being served.
    for (const entryName of fs.readdirSync(target)) {
      if (entryName === '.git') continue;
      fs.rmSync(path.join(target, entryName), { recursive: true, force: true });
    }
    for (const file of files) {
      const to = path.join(target, file);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(root, file), to);
    }
    fs.writeFileSync(path.join(target, 'README.md'), readmeFor({ repo, version, commit, source: String(pkg.repository || '').replace(/^github:/, '') }));

    git(target, ['add', '-A']);
    const staged = git(target, ['status', '--porcelain'], { capture: true });
    if (!staged) {
      console.log('publish-plugin: the marketplace already serves this tree, nothing to push');
      return;
    }
    git(target, ['commit', '-m', `buaflow ${version}\n\nGenerated from ${String(pkg.repository || '').replace(/^github:/, '')}@${commit}. Do not edit here.`]);
    git(target, ['tag', '-f', `v${version}`]);
    git(target, ['push', 'origin', 'HEAD']);
    git(target, ['push', '--force', 'origin', `v${version}`]);
    console.log(`publish-plugin: pushed buaflow ${version} to github.com/${repo}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function readmeFor({ repo, version, commit, source }) {
  return `# Buaflow — the Claude Code plugin

This repository is the **marketplace** users install Buaflow from. It holds the plugin and nothing
else, because Claude Code clones a git-hosted marketplace whole onto every machine that adds it.

\`\`\`
/plugin marketplace add ${repo}
/plugin install buaflow@buaflow
\`\`\`

Then open a new session and type \`/buaflow:start\`.

## Do not edit anything here

Every file is generated from [${source}](https://github.com/${source}) by
\`scripts/publish-plugin.js\` and overwritten on each release. Issues, pull requests and the kit's
documentation belong in that repository.

Currently serving **${version}**, generated from \`${commit}\`.
`;
}

main();
