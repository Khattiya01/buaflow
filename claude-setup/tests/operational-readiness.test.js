'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateOperationalReadiness, headingAnchors, slug } = require('../operational-readiness.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const APPS = ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync'];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function scaffold(directory, transcript = { ok: true, fingerprint: { identical: true } }) {
  write(path.join(directory, 'src', 'health.ts'), '// health endpoint\n');
  write(path.join(directory, 'docs', 'runbook.md'), '# Runbook\n\n## Diagnose\n\nlook here\n\n## Incident response\n\nthen here\n');
  const rehearsalPath = path.join(directory, 'evidence', 'backup-restore-rehearsal.json');
  writeJson(rehearsalPath, transcript);
  return { path: 'evidence/backup-restore-rehearsal.json', sha256: sha256(rehearsalPath) };
}

function hook(overrides = {}) {
  return {
    id: 'IH-001',
    name: 'The application is not serving',
    signal: 'GET /health returns a non-2xx status or does not respond at all',
    severity: 'critical',
    detectedBy: [{ type: 'file', value: 'src/health.ts' }],
    firstResponse: 'docs/runbook.md#diagnose',
    owner: 'a named human',
    ...overrides,
  };
}

function record(directory, overrides = {}, transcript) {
  const rehearsal = scaffold(directory, transcript);
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    generatedAt: '2026-09-23T00:00:00.000Z',
    backup: {
      procedure: 'pg_dump -Fc against the application database',
      restore: 'pg_restore --no-owner into an empty schema',
      documentedIn: 'docs/runbook.md',
      rehearsal,
    },
    incidentHooks: [hook()],
    ...overrides,
  };
}

test('a record with a passing rehearsal and a well-formed hook passes', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const result = evaluateOperationalReadiness(record(directory), { root: directory });
    assert.deepEqual(result.errors, []);
    assert.equal(result.totals.hooks, 1);
    assert.equal(result.totals.bySeverity.critical, 1);
    assert.ok(result.rehearsal);
  } finally {
    cleanup(directory);
  }
});

// The whole point of EP-005: a procedure nobody has run is a paragraph.
test('a rehearsal that failed cannot be cited as evidence that a restore works', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const failed = evaluateOperationalReadiness(record(directory, {}, { ok: false, fingerprint: { identical: true } }), { root: directory });
    assert.equal(failed.ok, false);
    assert.match(failed.errors.join('\n'), /records a rehearsal that did not pass/);

    const emptied = evaluateOperationalReadiness(record(directory, {}, { ok: true, fingerprint: { identical: false } }), { root: directory });
    assert.equal(emptied.ok, false);
    assert.match(emptied.errors.join('\n'), /the data did not come back identical/);
  } finally {
    cleanup(directory);
  }
});

test('re-running the rehearsal without updating the record invalidates it', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const value = record(directory);
    writeJson(path.join(directory, 'evidence', 'backup-restore-rehearsal.json'), { ok: true, fingerprint: { identical: true }, extra: 'a later run' });
    const result = evaluateOperationalReadiness(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /the rehearsal was re-run and this record still describes the old one/);
  } finally {
    cleanup(directory);
  }
});

// The failure that only shows up at 2am, which is the worst time to find it.
test('a firstResponse pointing at a renamed heading fails', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const value = record(directory, { incidentHooks: [hook({ firstResponse: 'docs/runbook.md#incident-triage' })] });
    const result = evaluateOperationalReadiness(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /points at #incident-triage in docs\/runbook\.md, and no heading there produces that anchor/);

    const missingFile = record(directory, { incidentHooks: [hook({ firstResponse: 'docs/nothing.md#diagnose' })] });
    const gone = evaluateOperationalReadiness(missingFile, { root: directory });
    assert.equal(gone.ok, false);
    assert.match(gone.errors.join('\n'), /points at docs\/nothing\.md, which does not exist/);
  } finally {
    cleanup(directory);
  }
});

test('a hook whose detector was deleted fails', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const value = record(directory, { incidentHooks: [hook({ detectedBy: [{ type: 'file', value: 'src/removed.ts' }] })] });
    const result = evaluateOperationalReadiness(value, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /file does not exist: src\/removed\.ts/);
  } finally {
    cleanup(directory);
  }
});

test('a hook needs an owner, a severity and a signal precise enough to alert on', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const thin = hook({ owner: '', severity: 'catastrophic', signal: 'it broke' });
    const result = evaluateOperationalReadiness(record(directory, { incidentHooks: [thin] }), { root: directory });
    assert.equal(result.ok, false);
    const joined = result.errors.join('\n');
    assert.match(joined, /owner is required/);
    assert.match(joined, /severity must be one of/);
    assert.match(joined, /specific enough to build an alert from/);
  } finally {
    cleanup(directory);
  }
});

// EP-005 does not restate EP-003's boundaries; it answers them.
test('every trust boundary in the security baseline must be watched by a hook', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    writeJson(path.join(directory, 'docs', 'evidence', 'security-baseline.json'), {
      boundaries: [{ id: 'TB-001' }, { id: 'TB-002' }],
    });

    const partial = record(directory, { incidentHooks: [hook({ boundary: 'TB-001' })] });
    const unwatched = evaluateOperationalReadiness(partial, { root: directory });
    assert.equal(unwatched.ok, false);
    assert.match(unwatched.errors.join('\n'), /trust boundary TB-002 and no incident hook watches it/);

    const complete = record(directory, {
      incidentHooks: [hook({ boundary: 'TB-001' }), hook({ id: 'IH-002', boundary: 'TB-002' })],
    });
    const covered = evaluateOperationalReadiness(complete, { root: directory });
    assert.deepEqual(covered.errors, []);
    assert.equal(covered.totals.boundariesWatched, 2);

    const invented = record(directory, {
      incidentHooks: [hook({ boundary: 'TB-001' }), hook({ id: 'IH-002', boundary: 'TB-002' }), hook({ id: 'IH-003', boundary: 'TB-009' })],
    });
    const ghost = evaluateOperationalReadiness(invented, { root: directory });
    assert.equal(ghost.ok, false);
    assert.match(ghost.errors.join('\n'), /reference boundary TB-009, which docs\/evidence\/security-baseline\.json does not declare/);
  } finally {
    cleanup(directory);
  }
});

test('heading anchors follow the rendered form, duplicates included', () => {
  assert.equal(slug('Incident response'), 'incident-response');
  assert.equal(slug('Deploy (web / backend — the containerized artifact)'), 'deploy-web--backend--the-containerized-artifact');
  assert.equal(slug('`rollback.sql` and you'), 'rollbacksql-and-you');
  const anchors = headingAnchors('# A\n## Notes\n## Notes\n### Notes\n');
  assert.ok(anchors.has('notes'));
  assert.ok(anchors.has('notes-1'));
  assert.ok(anchors.has('notes-2'));
});

test('the CLI exits 0 on a complete record and 1 on a broken runbook link', () => {
  const directory = temporaryProject('buaflow-ops-');
  try {
    const script = path.join(repositoryRoot, 'claude-setup', 'operational-readiness.js');
    const target = path.join(directory, 'docs', 'evidence', 'operational-readiness.json');
    const args = ['--root', directory, '--file', 'docs/evidence/operational-readiness.json'];

    writeJson(target, record(directory));
    const pass = runNode(script, { args, cwd: directory });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /restore rehearsed: yes/);

    writeJson(target, record(directory, { incidentHooks: [hook({ firstResponse: 'docs/runbook.md#gone' })] }));
    const fail = runNode(script, { args, cwd: directory });
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /no heading there produces that anchor/);
  } finally {
    cleanup(directory);
  }
});

test('every reference app has a rehearsed restore and a hook for every trust boundary', () => {
  for (const app of APPS) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const file = path.join(root, 'docs', 'evidence', 'operational-readiness.json');
    assert.ok(fs.existsSync(file), `${app} is missing docs/evidence/operational-readiness.json`);
    const result = evaluateOperationalReadiness(JSON.parse(fs.readFileSync(file, 'utf8')), { root });
    assert.deepEqual(result.errors, [], `${app}: ${result.errors.join('; ')}`);
    assert.ok(result.rehearsal, `${app} cites no passing restore rehearsal`);
    assert.equal(result.totals.boundariesWatched, result.totals.boundariesTotal);
    assert.ok(result.totals.boundariesTotal > 0, `${app} declares no trust boundaries to watch`);
  }
});

// The rehearsal transcripts are the thing EP-005 exists to produce, so check they say what the
// records claim rather than only that the digests line up.
test('every reference app ships a rehearsal that really destroyed and restored the database', () => {
  for (const app of APPS) {
    const transcript = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'reference-apps', app, 'evidence', 'backup-restore-rehearsal.json'), 'utf8'));
    assert.equal(transcript.ok, true, `${app}: rehearsal did not pass`);
    assert.equal(transcript.fingerprint.identical, true, `${app}: data did not come back identical`);
    assert.equal(transcript.rollForwardAfterRestore, true, `${app}: the runbook's roll-forward instruction was not exercised`);
    assert.ok(transcript.backupArtifact.bytes > 0, `${app}: the backup was empty`);
    const names = transcript.steps.map((step) => step.name);
    assert.ok(names.some((name) => /destroy the database/.test(name)), `${app}: nothing was destroyed, so nothing was proven`);
    assert.ok(names.some((name) => /verify the data is really gone/.test(name)), `${app}: the destruction was never verified`);
  }
});
