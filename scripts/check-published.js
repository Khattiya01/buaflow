#!/usr/bin/env node
'use strict';

/**
 * check-published — main says one version, the marketplace serves another (PE-010)
 *
 * Why this exists: publishing is one command a human runs (scripts/publish-plugin.js), and the
 * whole point of a release is that users receive it. Forget that command and nothing anywhere
 * fails: this repository still checks out, `npm run check` still passes, main still says 3.16.0,
 * and every user keeps running 3.15.0 with no signal at all. That is the exact shape of failure
 * the kit exists to refuse — a claim nobody can verify — so it is verified here.
 *
 * This asks the marketplace repository what it actually serves, by its `v<version>` tag. It reads
 * a public repository over HTTPS with `git ls-remote`, so it needs no token, no secret and no
 * credential of any kind.
 *
 * It is NOT part of `npm run check`: that must run from a bare checkout with no network. This runs
 * in CI on main, where the network is there and where a red build is the reminder.
 *
 * exit 0 = the marketplace serves this version · exit 1 = it does not, or cannot be asked
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repo = String(pkg.marketplaceRepo || '');
const version = String(pkg.version || '');

if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error('check-published: package.json has no marketplaceRepo of the form owner/repo');
  process.exit(1);
}

const url = `https://github.com/${repo}.git`;
const result = spawnSync('git', ['ls-remote', '--tags', url], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(`check-published: cannot read ${url}: ${(result.stderr || '').trim()}`);
  process.exit(1);
}

const tags = new Set(
  result.stdout
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '')),
);

if (tags.has(`v${version}`)) {
  console.log(`published: PASS (${repo} serves v${version})`);
  process.exit(0);
}

// Sorted as numbers, not as text: a lexical sort calls v3.9.0 newer than v3.15.0 and the message
// would then state something untrue about what users are running.
const parts = (tag) => tag.slice(1).split('.').map(Number);
const served = [...tags]
  .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
  .sort((a, b) => {
    const [x, y] = [parts(a), parts(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  })
  .pop() || 'nothing';
console.error(`published: FAIL — this repository is at ${version}, ${repo} serves ${served}`);
console.error('');
console.error('Users receive a new copy only when the version changes, so until this is published');
console.error(`they keep running ${served}. Publish it from a clean main:`);
console.error('');
console.error('  node scripts/publish-plugin.js');
process.exit(1);
