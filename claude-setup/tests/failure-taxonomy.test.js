'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { CLASSES, CLASS_IDS, KNOWN_GAPS, validateFailureRecord } = require('../failure-taxonomy.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, writeJson } = require('./helpers.js');

function record(overrides = {}) {
  return {
    schemaVersion: '1.0',
    id: 'F-001',
    class: 'implementation-defect',
    summary: 'A sync overwrote an edit that had just been made locally.',
    where: 'PP-005',
    detectedBy: 'end-to-end tests',
    severity: 'high',
    ...overrides,
  };
}

// --- the taxonomy itself ---------------------------------------------------------------
//
// The point of EV-003 is not that a taxonomy exists; it is that this one cannot drift into
// a copied category list. These tests enforce the grounding rule directly.

test('every class points at a failure that actually happened, with a checkable location', () => {
  for (const [id, entry] of Object.entries(CLASSES)) {
    assert.ok(entry.summary.length >= 40, `${id}: summary is too thin to distinguish it from a neighbour`);
    assert.ok(entry.observedIn, `${id}: has no observed failure`);
    assert.ok(entry.observedIn.what.length >= 60, `${id}: the observed failure is described too vaguely to verify`);
    assert.ok(entry.observedIn.where.trim().length > 0, `${id}: the observed failure has no location`);
    assert.ok(entry.observedIn.detectedBy.trim().length > 0, `${id}: does not say what caught it`);
  }
});

test('every class cites a location this repository can actually resolve', () => {
  // A citation that resolves to nothing is how a grounded taxonomy quietly becomes a
  // copied one. Work-item and decision ids must exist in state.json; paths must exist on disk.
  const state = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'development', 'state.json'), 'utf8'));
  const ids = new Set([
    ...state.workItems.map((w) => w.id),
    ...state.decisions.map((d) => d.id),
  ]);

  for (const [id, entry] of Object.entries(CLASSES)) {
    const citations = entry.observedIn.where.split(',').map((c) => c.trim()).filter(Boolean);
    assert.ok(citations.length > 0, `${id}: no citations`);
    for (const citation of citations) {
      if (/^[A-Z]{1,2}-\d{3}$/.test(citation)) {
        assert.ok(ids.has(citation), `${id}: cites ${citation}, which is not a work item or decision in state.json`);
      } else if (citation.startsWith('commit ')) {
        assert.match(citation, /^commit [0-9a-f]{7,40}$/, `${id}: malformed commit citation "${citation}"`);
      } else {
        assert.ok(
          fs.existsSync(path.join(repositoryRoot, citation)),
          `${id}: cites ${citation}, which does not exist in this repository`
        );
      }
    }
  }
});

test('the corpus gap is declared rather than filled with an invented class', () => {
  // Nothing here has ever run in production, so an operations class would have to be made
  // up. Declaring the hole is the honest form, and it is what a later trial will close.
  assert.ok(KNOWN_GAPS.length > 0);
  const operations = KNOWN_GAPS.find((gap) => gap.missing === 'operations-failure');
  assert.ok(operations, 'the missing operations class must stay declared');
  assert.equal(operations.unlockedBy, 'EV-009');
  assert.ok(!CLASS_IDS.includes('operations-failure'), 'an ungrounded class must not be added to close the gap on paper');
});

test('class ids are distinct, kebab-case and stable enough to record against', () => {
  assert.equal(new Set(CLASS_IDS).size, CLASS_IDS.length);
  for (const id of CLASS_IDS) assert.match(id, /^[a-z][a-z0-9-]+$/);
});

// --- failure records -------------------------------------------------------------------

test('a well-formed record validates', () => {
  assert.deepEqual(validateFailureRecord(record()), { ok: true, errors: [] });
});

test('a record cannot name a class that does not exist', () => {
  // The acceptance criterion this whole file is built around.
  const result = validateFailureRecord(record({ class: 'cosmic-ray' }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unknown class "cosmic-ray"/);
});

test('detectedBy is required, because "nothing caught it" is the answer worth recording', () => {
  const result = validateFailureRecord(record({ detectedBy: '   ' }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /detectedBy is required/);

  assert.equal(validateFailureRecord(record({ detectedBy: 'nothing caught it' })).ok, true);
});

test('a summary that only repeats the class name is rejected', () => {
  const result = validateFailureRecord(record({ summary: 'a defect' }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /summary must be at least 20 characters/);
});

test('id must match its filename, so records cannot silently collide', () => {
  const result = validateFailureRecord(record(), { expectedId: 'F-002' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /does not match filename/);
});

test('severity is constrained and escaped must be a boolean when present', () => {
  assert.match(validateFailureRecord(record({ severity: 'catastrophic' })).errors.join('\n'), /severity must be one of/);
  assert.match(validateFailureRecord(record({ escaped: 'yes' })).errors.join('\n'), /escaped must be a boolean/);
});

test('the shipped template is a valid record apart from its placeholders', () => {
  const template = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'templates', 'failure-record.tpl.json'), 'utf8'));
  const result = validateFailureRecord({ ...template, class: 'spec-gap' });
  assert.deepEqual(result.errors.filter((e) => !/summary|where|detectedBy|preventedNextTimeBy/.test(e)), []);
});

// --- CLI --------------------------------------------------------------------------------

test('CLI --list prints every class and the declared gap', () => {
  const result = runNode(path.join(repositoryRoot, 'claude-setup', 'failure-taxonomy.js'), { args: ['--list'] });
  assert.equal(result.status, 0, result.stderr);
  for (const id of CLASS_IDS) assert.match(result.stdout, new RegExp(id));
  assert.match(result.stdout, /no class for "operations-failure"/);
});

test('CLI --dir fails a record naming an unknown class and exits 1', () => {
  const root = temporaryProject('buaflow-failures-');
  try {
    const dir = path.join(root, 'failures');
    writeJson(path.join(dir, 'F-001.json'), record());
    writeJson(path.join(dir, 'F-002.json'), record({ id: 'F-002', class: 'not-a-class' }));
    const result = runNode(path.join(repositoryRoot, 'claude-setup', 'failure-taxonomy.js'), {
      cwd: root,
      args: ['--dir', dir],
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /unknown class "not-a-class"/);
    assert.match(result.stdout, /1\/2 record\(s\) failed/);
  } finally {
    cleanup(root);
  }
});
