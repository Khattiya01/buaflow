#!/usr/bin/env node
'use strict';

/**
 * check-reference-matrix — which kinds of project the kit is proven on, and which it is not (EV-001)
 *
 *   node scripts/check-reference-matrix.js           check + list empty cells
 *   node scripts/check-reference-matrix.js --json
 *
 * The matrix is only worth keeping if its gaps are visible: an in-repository app that is listed
 * must exist, an external one must point at the record of what was done there, every dimension
 * value must be a declared one, and the cells nobody has proven are printed every time the
 * repository is checked. A missing cell is not a failure — the roadmap chose golden paths over
 * breadth (principle 5, D-011: no fourth golden stack) — but it is never silent.
 *
 * exit 0 = matrix consistent · exit 1 = an entry is wrong
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function check(matrix) {
  const problems = [];
  const dims = matrix.dimensions || {};
  const ids = new Set();
  for (const app of matrix.apps || []) {
    const label = app.id || '(app)';
    if (ids.has(app.id)) problems.push(`${label}: duplicate id`);
    ids.add(app.id);
    for (const [dim, values] of Object.entries(dims)) {
      if (!values.includes(app[dim])) problems.push(`${label}: ${dim} "${app[dim]}" is not one of ${values.join(', ')}`);
    }
    if (typeof app.proves !== 'string' || app.proves.length < 20) problems.push(`${label}: proves must say what this app demonstrates`);
    if (app.external) {
      if (!app.evidence || !fs.existsSync(path.join(root, app.evidence))) problems.push(`${label}: an external app needs evidence inside this repository`);
    } else if (!app.path || !fs.existsSync(path.join(root, app.path))) problems.push(`${label}: path ${app.path} does not exist`);
  }
  const cells = [];
  const [first, ...rest] = Object.entries(dims);
  const combos = rest.reduce((acc, [dim, values]) => acc.flatMap((c) => values.map((v) => ({ ...c, [dim]: v }))), (first ? first[1] : []).map((v) => ({ [first[0]]: v })));
  for (const combo of combos) {
    const apps = (matrix.apps || []).filter((a) => Object.entries(combo).every(([k, v]) => a[k] === v)).map((a) => a.id);
    cells.push({ ...combo, apps });
  }
  return { ok: problems.length === 0, problems, cells, empty: cells.filter((c) => !c.apps.length) };
}

if (require.main === module) {
  const matrix = JSON.parse(fs.readFileSync(path.join(root, 'reference-apps', 'matrix.json'), 'utf8'));
  const result = check(matrix);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    const covered = result.cells.length - result.empty.length;
    console.log(`reference matrix: ${result.ok ? 'PASS' : 'FAIL'} (${matrix.apps.length} apps cover ${covered}/${result.cells.length} cells)`);
    for (const p of result.problems) console.log(`  fail: ${p}`);
    console.log(`  unproven: ${result.empty.map((c) => Object.values(c).filter((v) => typeof v === 'string').join('/')).join(' · ')}`);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { check };
