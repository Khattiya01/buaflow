#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const registryPath = path.join(root, 'schemas', 'registry.json');
const problems = [];

const expectedSources = {
  'stack-config': 'claude-setup/stack.json',
  'readiness-manifest': 'templates/readiness-manifest.tpl.json',
  'prototype-flow': 'templates/prototype-flow.tpl.json',
  'pixel-config': 'templates/pixel.tpl.json',
  'project-manifest': 'templates/project-manifest.tpl.json',
  'product-graph': 'templates/product-graph.tpl.json',
  'application-profile': 'templates/application-profile.tpl.json',
  'pack': 'templates/pack.tpl.json',
  'evidence-bundle': 'templates/evidence-bundle.tpl.json',
  'failure-record': 'templates/failure-record.tpl.json',
  'requirement-coverage': 'templates/requirement-coverage.tpl.json',
  'assumption-ledger': 'templates/assumption-ledger.tpl.json',
  'security-baseline': 'templates/security-baseline.tpl.json',
  'supply-chain': 'templates/supply-chain.tpl.json',
  'operational-readiness': 'templates/operational-readiness.tpl.json',
  'budget-evidence': 'templates/budget-evidence.tpl.json',
  'eval-case': 'templates/eval-case.tpl.json',
  'eval-run': 'templates/eval-run.tpl.json',
  'change-proposal': 'templates/change-proposal.tpl.json',
  'usage-consent': 'templates/usage-consent.tpl.json',
  'usage-event': 'templates/usage-event.tpl.json',
  'usage-review': 'templates/usage-review.tpl.json',
  'control-set': 'standards/control-sets/owasp-asvs-5.0.0-l1.json',
  'product-development-state': 'development/state.json',
};

const fail = (message) => problems.push(message);
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

let registry;
try {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch (error) {
  console.error(`artifacts: cannot read schema registry: ${error.message}`);
  process.exit(1);
}

if (registry.schemaVersion !== '1.0') fail(`unsupported registry schemaVersion ${registry.schemaVersion}`);
if (!Array.isArray(registry.artifacts) || !registry.artifacts.length) fail('registry.artifacts must not be empty');

const types = new Set();
for (const artifact of registry.artifacts || []) {
  const label = artifact.type || '(missing type)';
  if (!/^[a-z][a-z0-9-]+$/.test(label)) fail(`${label}: invalid type`);
  if (types.has(label)) fail(`${label}: duplicate registry type`);
  types.add(label);
  if (!['public', 'internal'].includes(artifact.classification)) fail(`${label}: invalid classification`);
  if (!/^\d+\.\d+$/.test(artifact.latestVersion || '')) fail(`${label}: latestVersion must be MAJOR.MINOR`);
  if (!artifact.schema || !fs.existsSync(path.join(root, artifact.schema))) {
    fail(`${label}: schema does not exist: ${artifact.schema}`);
    continue;
  }

  const schema = readJson(artifact.schema);
  if (!schema.$id) fail(`${label}: schema is missing $id`);
  const declaredVersion = schema.properties?.schemaVersion?.const;
  if (declaredVersion !== artifact.latestVersion) {
    fail(`${label}: schema version ${declaredVersion} does not match registry ${artifact.latestVersion}`);
  }

  const source = expectedSources[label];
  if (!source || !fs.existsSync(path.join(root, source))) {
    fail(`${label}: canonical source/template is missing`);
    continue;
  }
  const value = readJson(source);
  if (value.schemaVersion !== artifact.latestVersion) {
    fail(`${label}: ${source} version ${value.schemaVersion} does not match registry ${artifact.latestVersion}`);
  }
  if (artifact.classification === 'public' && !value.$schema) fail(`${label}: ${source} is missing $schema`);
}

for (const type of Object.keys(expectedSources)) {
  if (!types.has(type)) fail(`${type}: canonical source exists but registry entry is missing`);
}

if (problems.length) {
  console.error(`artifacts: FAIL (${problems.length})`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`artifacts: PASS (${registry.artifacts.length} registered types)`);
