#!/usr/bin/env node
'use strict';

/**
 * Validate a Buaflow readiness manifest without external dependencies.
 *
 *   node .claude/readiness.js --file docs/evidence/readiness.json
 *   node .claude/readiness.js --file docs/evidence/readiness.json --level R3 --json
 *
 * This v1 validates the declaration and local file evidence. It does not execute
 * the declared commands; fail-closed execution belongs to the production gate.
 */
const fs = require('node:fs');
const path = require('node:path');

const LEVEL_ORDER = ['R0', 'R1', 'R2', 'R3', 'R4'];
const CONTROLS_BY_LEVEL = {
  R0: ['version-control', 'start-path', 'primary-flow'],
  R1: ['build', 'verification'],
  R2: ['requirements-traceability', 'automated-tests', 'persistence', 'access-control', 'ci'],
  R3: [
    'deployment-package', 'runtime-config', 'database-migration', 'rollback',
    'secrets-scan', 'dependency-scan', 'security-controls', 'end-to-end-tests',
    'observability', 'health-check', 'performance', 'accessibility', 'sbom',
    'runbook', 'clean-environment',
  ],
  R4: ['compliance-pack', 'audit-evidence', 'recovery-test'],
};

const CONDITIONAL = new Set(['persistence', 'access-control', 'database-migration', 'accessibility']);
const MACHINE_EVIDENCE_REQUIRED = new Set([
  'build', 'verification', 'automated-tests', 'ci', 'deployment-package', 'secrets-scan',
  'dependency-scan', 'end-to-end-tests', 'health-check', 'performance', 'sbom',
  'clean-environment',
]);
const STATUSES = new Set(['pass', 'fail', 'pending', 'not-applicable']);
const EVIDENCE_TYPES = new Set(['command', 'file', 'url', 'manual']);

function controlsFor(level) {
  const last = LEVEL_ORDER.indexOf(level);
  if (last === -1) return null;
  return LEVEL_ORDER.slice(0, last + 1).flatMap((key) => CONTROLS_BY_LEVEL[key]);
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function validateEvidence(controlId, evidence, root, errors, warnings) {
  if (!Array.isArray(evidence)) {
    errors.push(`${controlId}: evidence must be an array`);
    return [];
  }

  const valid = [];
  for (const [index, item] of evidence.entries()) {
    const label = `${controlId}.evidence[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    if (!EVIDENCE_TYPES.has(item.type)) {
      errors.push(`${label}: unsupported type "${item.type}"`);
      continue;
    }
    if (typeof item.value !== 'string' || item.value.trim().length === 0) {
      errors.push(`${label}: value must be a non-empty string`);
      continue;
    }
    if (item.type === 'url' && !/^https?:\/\//i.test(item.value)) {
      errors.push(`${label}: url evidence must start with http:// or https://`);
      continue;
    }
    if (item.type === 'file') {
      if (path.isAbsolute(item.value)) {
        errors.push(`${label}: file evidence must be relative to the project root`);
        continue;
      }
      const resolved = path.resolve(root, item.value);
      if (!insideRoot(root, resolved)) {
        errors.push(`${label}: file evidence escapes the project root`);
        continue;
      }
      if (!fs.existsSync(resolved)) {
        errors.push(`${label}: file does not exist: ${item.value}`);
        continue;
      }
    }
    if (item.type === 'manual') warnings.push(`${label}: manual evidence is not independently reproducible`);
    valid.push(item);
  }
  return valid;
}

function validateManifest(manifest, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const level = options.level || manifest?.targetLevel;
  const errors = [];
  const warnings = [];
  const required = controlsFor(level);

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, level, errors: ['manifest must be a JSON object'], warnings, passed: 0, required: 0 };
  }
  if (manifest.schemaVersion !== '1.0') errors.push(`unsupported schemaVersion "${manifest.schemaVersion}"`);
  if (typeof manifest.project !== 'string' || manifest.project.trim().length === 0) errors.push('project must be a non-empty string');
  if (typeof manifest.profile !== 'string' || manifest.profile.trim().length === 0) errors.push('profile must be a non-empty string');
  if (!required) errors.push(`unsupported readiness level "${level}"`);
  if (!LEVEL_ORDER.includes(manifest.targetLevel)) errors.push(`unsupported targetLevel "${manifest.targetLevel}"`);
  if (required && LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(manifest.targetLevel)) {
    errors.push(`cannot evaluate ${level}; manifest only targets ${manifest.targetLevel}`);
  }
  if (Number.isNaN(Date.parse(manifest.generatedAt))) errors.push('generatedAt must be an ISO-8601 timestamp');
  if (LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf('R3') && !/^[0-9a-f]{7,64}$/i.test(manifest.commit || '')) {
    errors.push('R3+ requires commit to be a 7–64 character hexadecimal revision');
  } else if (typeof manifest.commit !== 'string' || manifest.commit.trim().length === 0) {
    errors.push('commit must identify the evaluated source revision');
  }
  if (!manifest.controls || typeof manifest.controls !== 'object' || Array.isArray(manifest.controls)) {
    errors.push('controls must be an object keyed by control id');
  }

  let passed = 0;
  for (const controlId of required || []) {
    const control = manifest.controls?.[controlId];
    if (!control || typeof control !== 'object' || Array.isArray(control)) {
      errors.push(`${controlId}: required control is missing`);
      continue;
    }
    if (!STATUSES.has(control.status)) {
      errors.push(`${controlId}: unsupported status "${control.status}"`);
      continue;
    }
    const evidence = validateEvidence(controlId, control.evidence, root, errors, warnings);
    if (control.status === 'pass') {
      if (evidence.length === 0) errors.push(`${controlId}: pass requires at least one valid evidence item`);
      else if (MACHINE_EVIDENCE_REQUIRED.has(controlId) && evidence.every((item) => item.type === 'manual')) {
        errors.push(`${controlId}: manual evidence alone cannot satisfy this control`);
      } else passed++;
    } else if (control.status === 'not-applicable') {
      if (!CONDITIONAL.has(controlId)) errors.push(`${controlId}: not-applicable is not allowed for this control`);
      else if (typeof control.rationale !== 'string' || control.rationale.trim().length < 20) {
        errors.push(`${controlId}: not-applicable requires a project-specific rationale of at least 20 characters`);
      } else passed++;
    } else {
      errors.push(`${controlId}: status is ${control.status}`);
    }
  }

  const known = new Set(LEVEL_ORDER.flatMap((key) => CONTROLS_BY_LEVEL[key]));
  for (const controlId of Object.keys(manifest.controls || {})) {
    if (!known.has(controlId)) warnings.push(`${controlId}: unknown control is ignored by schemaVersion 1.0`);
  }

  return { ok: errors.length === 0, level, errors, warnings, passed, required: required?.length || 0 };
}

function parseArgs(argv) {
  const options = { file: 'docs/evidence/readiness.json', root: process.cwd(), json: false, level: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--root') options.root = argv[++index];
    else if (arg === '--level') options.level = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error('--file requires a path');
  if (!options.root) throw new Error('--root requires a path');
  if (options.level && !LEVEL_ORDER.includes(options.level)) throw new Error(`unsupported level: ${options.level}`);
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`readiness: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node .claude/readiness.js [--file path] [--root path] [--level R0-R4] [--json]');
    return 0;
  }

  const root = path.resolve(options.root);
  const manifestPath = path.resolve(root, options.file);
  if (!insideRoot(root, manifestPath)) {
    console.error('readiness: manifest path must stay inside the project root');
    return 2;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`readiness: cannot read ${path.relative(root, manifestPath)}: ${error.message}`);
    return 2;
  }

  const result = validateManifest(manifest, { root, level: options.level || undefined });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`readiness ${result.level}: ${result.ok ? 'PASS' : 'FAIL'} (${result.passed}/${result.required} controls)`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
    for (const error of result.errors) console.log(`  fail: ${error}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = {
  CONDITIONAL,
  CONTROLS_BY_LEVEL,
  LEVEL_ORDER,
  controlsFor,
  parseArgs,
  validateManifest,
};

