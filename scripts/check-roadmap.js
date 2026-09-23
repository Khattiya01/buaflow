#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'development', 'state.json');
const allowedStatuses = new Set(['backlog', 'ready', 'in_progress', 'blocked', 'done', 'dropped']);
const problems = [];

const fail = (message) => problems.push(message);
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

let state;
try {
  state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
} catch (error) {
  console.error(`roadmap: cannot read ${path.relative(root, statePath)}: ${error.message}`);
  process.exit(1);
}

if (state.schemaVersion !== '1.0') fail(`unsupported schemaVersion: ${state.schemaVersion}`);
if (state.product !== 'buaflow') fail('product must be "buaflow"');
if (!isDate(state.updatedAt)) fail('updatedAt must be YYYY-MM-DD');
if (!Array.isArray(state.workItems) || state.workItems.length === 0) fail('workItems must be a non-empty array');

const items = new Map();
for (const [index, item] of (state.workItems || []).entries()) {
  const label = item?.id || `workItems[${index}]`;
  if (!/^[A-Z]{2}-\d{3}$/.test(item?.id || '')) fail(`${label}: invalid id`);
  if (items.has(item?.id)) fail(`${label}: duplicate id`);
  else items.set(item?.id, item);
  if (!allowedStatuses.has(item?.status)) fail(`${label}: invalid status "${item?.status}"`);
  if (!/^M\d+$/.test(item?.milestone || '')) fail(`${label}: invalid milestone`);
  if (!Array.isArray(item?.dependsOn)) fail(`${label}: dependsOn must be an array`);
  if (!Array.isArray(item?.acceptance) || item.acceptance.length === 0) fail(`${label}: acceptance must not be empty`);
  if (!Array.isArray(item?.artifacts)) fail(`${label}: artifacts must be an array`);
  if (!Array.isArray(item?.verification)) fail(`${label}: verification must be an array`);
  if (['in_progress', 'done'].includes(item?.status) && !isDate(item?.startedAt)) fail(`${label}: ${item.status} requires startedAt`);
  if (item?.status === 'done') {
    if (!isDate(item.completedAt)) fail(`${label}: done requires completedAt`);
    if (!item.artifacts?.length) fail(`${label}: done requires at least one artifact`);
    if (!item.verification?.length) fail(`${label}: done requires at least one verification command`);
  }
  if (item?.status === 'blocked' && !item?.blockedReason) fail(`${label}: blocked requires blockedReason`);
}

for (const item of items.values()) {
  for (const dependency of item.dependsOn || []) {
    if (!items.has(dependency)) fail(`${item.id}: unknown dependency ${dependency}`);
    if (dependency === item.id) fail(`${item.id}: cannot depend on itself`);
    if (['ready', 'in_progress', 'done'].includes(item.status) && items.get(dependency)?.status !== 'done') {
      fail(`${item.id}: status ${item.status} requires dependency ${dependency} to be done`);
    }
  }
  for (const artifact of item.artifacts || []) {
    if (item.status === 'done' && !fs.existsSync(path.join(root, artifact))) fail(`${item.id}: artifact does not exist: ${artifact}`);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(id, trail = []) {
  if (visiting.has(id)) {
    fail(`dependency cycle: ${[...trail, id].join(' -> ')}`);
    return;
  }
  if (visited.has(id) || !items.has(id)) return;
  visiting.add(id);
  for (const dependency of items.get(id).dependsOn || []) visit(dependency, [...trail, id]);
  visiting.delete(id);
  visited.add(id);
}
for (const id of items.keys()) visit(id);

const focus = state.current?.focus;
if (!/^M\d+$/.test(state.current?.milestone || '')) fail('current.milestone is invalid');
// An empty focus is honest only when nothing is left open; otherwise it hides the next item.
const open = [...items.values()].filter((item) => !['done', 'dropped'].includes(item.status));
if (!Array.isArray(focus)) fail('current.focus must be an array');
else if (focus.length === 0 && open.length) fail(`current.focus is empty while ${open.length} item(s) are open (${open.map((item) => item.id).join(', ')})`);
for (const id of focus || []) {
  if (!items.has(id)) fail(`current.focus references unknown item ${id}`);
  else if (['done', 'dropped'].includes(items.get(id).status)) fail(`current.focus cannot reference ${items.get(id).status} item ${id}`);
}

const inProgress = [...items.values()].filter((item) => item.status === 'in_progress');
if (inProgress.length > 2) fail(`WIP limit exceeded: ${inProgress.length} items are in_progress (max 2)`);
for (const item of inProgress) {
  if (item.milestone !== state.current?.milestone) fail(`${item.id}: in_progress outside current milestone ${state.current?.milestone}`);
  if (!focus?.includes(item.id)) fail(`${item.id}: in_progress but absent from current.focus`);
}

const decisionIds = new Set();
for (const [index, decision] of (state.decisions || []).entries()) {
  const label = decision?.id || `decisions[${index}]`;
  if (!/^D-\d{3}$/.test(decision?.id || '')) fail(`${label}: invalid decision id`);
  if (decisionIds.has(decision?.id)) fail(`${label}: duplicate decision id`);
  decisionIds.add(decision?.id);
  if (!isDate(decision?.date)) fail(`${label}: invalid date`);
  for (const field of ['decision', 'reason', 'impact']) if (!decision?.[field]) fail(`${label}: missing ${field}`);
}

if (!state.lastSession?.summary || !state.lastSession?.next) fail('lastSession requires summary and next');
if (!isDate(state.lastSession?.date)) fail('lastSession.date must be YYYY-MM-DD');

if (problems.length) {
  console.error(`roadmap: FAIL (${problems.length})`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const counts = {};
for (const status of allowedStatuses) counts[status] = 0;
for (const item of items.values()) counts[item.status]++;
console.log(`roadmap: PASS (${items.size} items; ${counts.done} done, ${counts.in_progress} in progress, ${counts.ready} ready, ${counts.backlog} backlog)`);

