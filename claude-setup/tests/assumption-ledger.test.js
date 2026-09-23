'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { evaluateLedger } = require('../assumption-ledger.js');
const { cleanup, temporaryProject, write } = require('./helpers.js');

const now = new Date('2026-09-23T10:00:00Z');

function ledger(overrides = {}) {
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    generatedAt: '2026-09-23T00:00:00Z',
    assumptions: [{
      id: 'A-001',
      statement: 'Fewer than 50 people use the system at the same time in year one',
      madeIn: 'docs/intents/I-001.md',
      owner: 'Somchai (product owner)',
      impact: 'high',
      madeOn: '2026-09-01',
      expiresOn: '2026-10-01',
      verification: { method: 'Read the concurrent-session count from the audit log after the pilot month', status: 'open' },
      ...overrides,
    }],
  };
}

function withProject(fn) {
  const root = temporaryProject('buaflow-assumptions-');
  try {
    write(path.join(root, 'docs', 'intents', 'I-001.md'), '# intent\n');
    write(path.join(root, 'docs', 'evidence', 'pilot-sessions.json'), '{"peak": 31}\n');
    return fn(root);
  } finally {
    cleanup(root);
  }
}

test('an open guess inside its window passes and is counted as open', () => withProject((root) => {
  const result = evaluateLedger(ledger(), { root, now });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual({ open: result.totals.open, highOpen: result.totals.highOpen }, { open: 1, highOpen: 1 });
}));

test('an open guess past its expiry fails and names who has to act', () => withProject((root) => {
  const result = evaluateLedger(ledger({ expiresOn: '2026-09-20' }), { root, now });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /open past its expiry on 2026-09-20 .*Somchai/);
}));

test('an owner that is not a person, and a guess relied on nowhere, are refused', () => withProject((root) => {
  assert.match(evaluateLedger(ledger({ owner: 'AI' }), { root, now }).errors.join('\n'), /not a person/);
  assert.match(evaluateLedger(ledger({ madeIn: 'docs/intents/I-404.md' }), { root, now }).errors.join('\n'), /does not exist/);
}));

test('a refuted guess must say what changed, and every resolution needs evidence and a date', () => withProject((root) => {
  const refuted = (extra) => ledger({ verification: { method: 'Read the peak from the pilot', status: 'refuted', resolvedOn: '2026-09-22', evidence: [{ type: 'file', value: 'docs/evidence/pilot-sessions.json' }], ...extra } });
  assert.match(evaluateLedger(refuted({}), { root, now }).errors.join('\n'), /refuted without a consequence/);
  assert.equal(evaluateLedger(refuted({ consequence: 'Raised the connection pool from 10 to 40 in ADR-012' }), { root, now }).ok, true);

  const noEvidence = ledger({ verification: { method: 'Ask the product owner directly', status: 'confirmed', resolvedOn: '2026-09-22' } });
  assert.match(evaluateLedger(noEvidence, { root, now }).errors.join('\n'), /needs evidence/);

  const manual = ledger({ verification: { method: 'Ask the product owner directly', status: 'confirmed', resolvedOn: '2026-09-22', evidence: [{ type: 'manual', value: 'Somchai confirmed in the 2026-09-22 meeting' }] } });
  const result = evaluateLedger(manual, { root, now });
  assert.equal(result.ok, true);
  assert.match(result.warnings.join('\n'), /human answer only/);
}));

test('the verifier, not the ledger, decides how long a guess may stand', () => withProject((root) => {
  const forever = ledger({ expiresOn: '2099-01-01' });
  assert.equal(evaluateLedger(forever, { root, now }).ok, true);
  assert.match(evaluateLedger(forever, { root, now, maxWindowDays: 90 }).errors.join('\n'), /past the 90-day limit/);
}));
