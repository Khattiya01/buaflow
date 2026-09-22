'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');
const { controlsFor } = require('../readiness.js');

function gateProject(config = {}) {
  const root = temporaryProject('buaflow-gate-');
  const claude = path.join(root, '.claude');
  fs.mkdirSync(claude, { recursive: true });
  for (const name of ['gate.js', 'stack-config.js', 'readiness.js']) {
    fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', name), path.join(claude, name));
  }
  write(path.join(claude, 'check-config.js'), 'process.exit(0);\n');
  write(path.join(claude, 'docs-lint.js'), 'process.exit(0);\n');
  writeJson(path.join(claude, 'stack.json'), {
    verifyCommand: null,
    auditMode: 'off',
    secretsMode: 'off',
    ...config,
  });
  return root;
}

function validR3Manifest() {
  const controls = {};
  for (const id of controlsFor('R3')) {
    controls[id] = { status: 'pass', evidence: [{ type: 'command', value: `verify ${id}` }] };
  }
  return {
    schemaVersion: '1.0',
    project: 'gate-fixture',
    profile: 'test-profile',
    targetLevel: 'R3',
    commit: '0123456789abcdef',
    generatedAt: '2026-09-22T12:00:00.000Z',
    controls,
  };
}

function runGate(root, args = []) {
  return runNode(path.join(root, '.claude', 'gate.js'), {
    cwd: root,
    env: { CLAUDE_PROJECT_DIR: root, VERIFY_COMMAND: '' },
    args,
  });
}

test('gate reports missing verify as skip in adoption behavior', () => {
  const root = gateProject();
  try {
    const result = runGate(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /skip\s+verify/);
  } finally {
    cleanup(root);
  }
});

test('gate fails instead of silently defaulting when stack config is malformed', () => {
  const root = gateProject();
  try {
    fs.writeFileSync(path.join(root, '.claude', 'stack.json'), '{ malformed');
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /cannot trust \.claude\/stack\.json/);
  } finally {
    cleanup(root);
  }
});

test('gate keeps a failing audit non-blocking in warn mode', () => {
  const root = gateProject({
    verifyCommand: 'node verify-pass.js',
    auditMode: 'warn',
    commands: { audit: 'node audit-fail.js' },
  });
  try {
    write(path.join(root, 'verify-pass.js'), 'process.exit(0);\n');
    write(path.join(root, 'audit-fail.js'), 'process.exit(7);\n');
    const result = runGate(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /warn\s+audit/);
  } finally {
    cleanup(root);
  }
});

test('gate stops and fails when verify fails', () => {
  const root = gateProject({ verifyCommand: 'node verify-fail.js' });
  try {
    write(path.join(root, 'verify-fail.js'), 'process.exit(3);\n');
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /fail\s+verify/);
    assert.doesNotMatch(result.stdout, /check-config/);
  } finally {
    cleanup(root);
  }
});

test('production gate fails instead of skipping a missing verify command', () => {
  const root = gateProject({
    assuranceMode: 'production',
    auditMode: 'required',
    secretsMode: 'required',
    commands: { audit: 'node --version', secrets: 'git version' },
  });
  try {
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), validR3Manifest());
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL: production assurance requires verifyCommand/);
  } finally {
    cleanup(root);
  }
});

test('production gate fails when a required scanner executable is unavailable', () => {
  const root = gateProject({
    assuranceMode: 'production',
    verifyCommand: 'node --version',
    auditMode: 'required',
    secretsMode: 'required',
    commands: { audit: 'node --version', secrets: 'buaflow-missing-scanner scan' },
  });
  try {
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), validR3Manifest());
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /requires secret scanner.*unavailable/);
    assert.doesNotMatch(result.stdout, /skip\s+secrets/);
  } finally {
    cleanup(root);
  }
});

test('production gate rejects caller-controlled docs-only bypass', () => {
  const root = gateProject({ assuranceMode: 'production' });
  try {
    const result = runGate(root, ['--docs-only']);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /production assurance does not allow --docs-only/);
  } finally {
    cleanup(root);
  }
});

test('gate rejects unknown assurance modes and production levels below R3', () => {
  const unknown = gateProject({ assuranceMode: 'prodction' });
  const low = gateProject({ assuranceMode: 'production', readinessLevel: 'R2' });
  try {
    const unknownResult = runGate(unknown);
    assert.equal(unknownResult.status, 1);
    assert.match(unknownResult.stdout, /unsupported assuranceMode/);

    const lowResult = runGate(low);
    assert.equal(lowResult.status, 1);
    assert.match(lowResult.stdout, /requires readinessLevel R3 or R4/);
  } finally {
    cleanup(unknown);
    cleanup(low);
  }
});

test('production gate passes only with required scanners and R3 readiness evidence', () => {
  const root = gateProject({
    assuranceMode: 'production',
    verifyCommand: 'node --version',
    auditMode: 'required',
    secretsMode: 'required',
    commands: { audit: 'node --version', secrets: 'git version' },
  });
  try {
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), validR3Manifest());
    const result = runGate(root);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /pass\s+readiness/);
    assert.doesNotMatch(result.stdout, /\bskip\b/);
  } finally {
    cleanup(root);
  }
});
