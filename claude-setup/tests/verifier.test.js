'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { verifyManifest } = require('../verifier.js');
const { controlsFor } = require('../readiness.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

// --- the seeded-defect corpus (BC-006) -----------------------------------------------
//
// "The verifier works" is a claim, and this file is the evidence for it. Each case below
// seeds one defect into an otherwise-passing manifest and asserts that the verifier reaches
// the right verdict WITHOUT being told the answer. The stated threshold is every defect in
// this corpus: a deterministic re-executor should miss none of them, so anything less than
// 100% is a bug and not a tuning knob.
//
// What this corpus deliberately does NOT claim to catch, so nobody reads a green run as
// more than it is:
//   - a test suite that passes while asserting nothing
//   - evidence that is real but irrelevant to the control it is attached to
//   - a command that passes here and would fail in a different environment
// Those need a reader, or a mutation-testing layer this does not pretend to be.

function manifest(level = 'R1') {
  const controls = {};
  for (const id of controlsFor(level)) {
    controls[id] = { status: 'pass', evidence: [{ type: 'command', value: `verify ${id}` }] };
  }
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    profile: 'test-profile',
    targetLevel: level,
    commit: 'WORKTREE',
    generatedAt: '2026-09-23T00:00:00.000Z',
    controls,
  };
}

// Deterministic stand-in for a shell. Keyed by command so each case says exactly what the
// world does, instead of depending on what happens to be installed on the machine.
function runner(outcomes) {
  return (command) => outcomes[command] || { status: 0, timedOut: false, stderr: '', stdout: '' };
}

const allPass = { execute: true, runner: runner({}) };

test('a clean manifest is confirmed, and confirmation requires re-running the commands', () => {
  const result = verifyManifest(manifest('R1'), allPass);
  assert.equal(result.ok, true);
  assert.equal(result.counts.refuted, 0);
  assert.equal(result.counts.unverifiable, 0);
  assert.equal(result.counts.confirmed, controlsFor('R1').length);
  assert.deepEqual(result.disagreements, []);
});

test('seeded: a command claimed to pass that actually exits non-zero is refuted', () => {
  const result = verifyManifest(manifest('R1'), {
    execute: true,
    runner: runner({ 'verify build': { status: 1, stderr: 'Error: type error in app/page.tsx\n' } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.counts.refuted, 1);
  assert.match(result.disagreements.join('\n'), /build: claimed pass, but did not reproduce in this environment — exited 1: Error: type error/);
});

test('seeded: a command that cannot be run at all is refuted, not skipped', () => {
  const result = verifyManifest(manifest('R1'), {
    execute: true,
    runner: runner({ 'verify verification': { status: null, error: 'spawn ENOENT' } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.disagreements.join('\n'), /verification: claimed pass, but could not run: spawn ENOENT/);
});

test('seeded: a non-terminating command is unverifiable, neither confirmed nor refuted', () => {
  // The reference apps really do cite `npm run dev` for start-path. Exit status can never be
  // evidence for a command that is not supposed to exit, so a false failure here would be as
  // wrong as a false pass.
  const result = verifyManifest(manifest('R1'), {
    execute: true,
    timeoutMs: 5000,
    runner: runner({ 'verify build': { status: null, timedOut: true } }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.counts.unverifiable, 1);
  const build = result.verdicts.find((v) => v.control === 'build');
  assert.equal(build.verdict, 'unverifiable');
  assert.match(build.evidence[0].reason, /did not terminate within 5s/);
});

test('seeded: file evidence that does not exist is refuted', () => {
  const root = temporaryProject('buaflow-verifier-');
  try {
    const value = manifest('R0');
    value.controls['start-path'].evidence = [{ type: 'file', value: 'docs/start.md' }];
    const result = verifyManifest(value, { ...allPass, root });
    assert.equal(result.ok, false);
    assert.match(result.disagreements.join('\n'), /start-path: claimed pass, but declared file evidence does not exist/);
  } finally {
    cleanup(root);
  }
});

test('seeded: file evidence that exists but is empty is refuted', () => {
  // The cheapest way for a placeholder to masquerade as evidence: `touch` the file and the
  // existence check that readiness.js performs is satisfied.
  const root = temporaryProject('buaflow-verifier-');
  try {
    write(path.join(root, 'docs', 'start.md'), '');
    const value = manifest('R0');
    value.controls['start-path'].evidence = [{ type: 'file', value: 'docs/start.md' }];
    const result = verifyManifest(value, { ...allPass, root });
    assert.equal(result.ok, false);
    assert.match(result.disagreements.join('\n'), /file evidence is empty, so it attests to nothing/);
  } finally {
    cleanup(root);
  }
});

test('seeded: directory evidence with nothing in it is refuted', () => {
  const root = temporaryProject('buaflow-verifier-');
  try {
    fs.mkdirSync(path.join(root, 'migrations'), { recursive: true });
    const value = manifest('R0');
    value.controls['start-path'].evidence = [{ type: 'file', value: 'migrations' }];
    const empty = verifyManifest(value, { ...allPass, root });
    assert.equal(empty.ok, false);
    assert.match(empty.disagreements.join('\n'), /directory evidence is empty/);

    write(path.join(root, 'migrations', '0001_init.sql'), 'select 1;\n');
    const filled = verifyManifest(value, { ...allPass, root });
    assert.equal(filled.ok, true);
  } finally {
    cleanup(root);
  }
});

test('seeded: a control the level requires but the manifest never mentions is refuted', () => {
  const value = manifest('R1');
  delete value.controls.build;
  const result = verifyManifest(value, allPass);
  assert.equal(result.ok, false);
  const build = result.verdicts.find((v) => v.control === 'build');
  assert.equal(build.verdict, 'refuted');
  assert.match(build.reason, /makes no claim about a control this level requires/);
});

test('seeded: a control claiming pass with no evidence attached is refuted', () => {
  const value = manifest('R1');
  value.controls.build.evidence = [];
  const result = verifyManifest(value, allPass);
  assert.equal(result.ok, false);
  assert.match(result.disagreements.join('\n'), /build: claimed pass, but no evidence is attached at all/);
});

test('a URL is unverifiable: it is another system\'s attestation', () => {
  const value = manifest('R1');
  value.controls.build.evidence = [{ type: 'url', value: 'https://example.invalid/runs/1' }];
  const result = verifyManifest(value, allPass);
  assert.equal(result.ok, true);
  assert.equal(result.verdicts.find((v) => v.control === 'build').verdict, 'unverifiable');
});

test('a human attestation is unverifiable, and never counts as confirmation', () => {
  const value = manifest('R1');
  value.controls.build.evidence = [{ type: 'manual', value: 'reviewed by the platform team' }];
  const result = verifyManifest(value, allPass);
  assert.equal(result.counts.confirmed, controlsFor('R1').length - 1);
  assert.equal(result.verdicts.find((v) => v.control === 'build').verdict, 'unverifiable');
});

test('not-applicable is left alone: scope is a human judgement, not a re-runnable fact', () => {
  const value = manifest('R2');
  value.controls.persistence = { status: 'not-applicable', rationale: 'this profile stores nothing at all' };
  const result = verifyManifest(value, allPass);
  assert.equal(result.ok, true);
  const persistence = result.verdicts.find((v) => v.control === 'persistence');
  assert.equal(persistence.verdict, 'unverifiable');
  assert.match(persistence.reason, /applicability is a human judgement/);
});

test('the verdict is reached without reading the claim', () => {
  // The independence property itself. A control claiming `fail` whose evidence in fact
  // reproduces is reported as confirmed — if the verifier were echoing the manifest it
  // would have to agree with the claim instead.
  const value = manifest('R1');
  value.controls.build.status = 'fail';
  const result = verifyManifest(value, allPass);
  const build = result.verdicts.find((v) => v.control === 'build');
  assert.equal(build.claimed, 'fail');
  assert.equal(build.verdict, 'confirmed');
  assert.deepEqual(result.disagreements, []);
});

test('without --execute, command evidence is unverified and never confirmed', () => {
  // The safe default must not quietly become a pass. Everything stays unverifiable.
  const result = verifyManifest(manifest('R1'), { execute: false });
  assert.equal(result.executed, false);
  assert.equal(result.counts.confirmed, 0);
  assert.equal(result.counts.refuted, 0);
  assert.equal(result.counts.unverifiable, controlsFor('R1').length);
});

test('a failing declaration is reported alongside, not merged into, the verdicts', () => {
  const value = manifest('R1');
  value.generatedAt = 'not a timestamp';
  const result = verifyManifest(value, allPass);
  assert.equal(result.declaration.ok, false);
  assert.equal(result.ok, true, 'a malformed header does not refute evidence that reproduces');
});

// --- end to end, with a real shell ----------------------------------------------------

test('CLI: refuted evidence exits 1 and names the control', () => {
  const root = temporaryProject('buaflow-verifier-cli-');
  try {
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), {
      schemaVersion: '1.0',
      project: 'cli-fixture',
      profile: 'test-profile',
      targetLevel: 'R0',
      commit: 'WORKTREE',
      generatedAt: '2026-09-23T00:00:00.000Z',
      controls: {
        'version-control': { status: 'pass', evidence: [{ type: 'command', value: 'exit 0' }] },
        'start-path': { status: 'pass', evidence: [{ type: 'command', value: 'exit 3' }] },
        'primary-flow': { status: 'pass', evidence: [{ type: 'file', value: 'docs/evidence/readiness.json' }] },
      },
    });

    const withoutExecute = runNode(path.join(repositoryRoot, 'claude-setup', 'verifier.js'), {
      cwd: root,
      args: ['--root', root],
    });
    assert.equal(withoutExecute.status, 0, 'the safe default does not run the failing command');
    assert.match(withoutExecute.stdout, /commands not re-run/);

    const executed = runNode(path.join(repositoryRoot, 'claude-setup', 'verifier.js'), {
      cwd: root,
      args: ['--root', root, '--execute'],
    });
    assert.equal(executed.status, 1, executed.stdout + executed.stderr);
    assert.match(executed.stdout, /REFUTED/);
    assert.match(executed.stdout, /start-path: claimed pass, but did not reproduce in this environment — exited 3/);
    // The control whose command really does exit 0 is confirmed in the same run, so the
    // failure is specific rather than the verifier failing everything.
    assert.match(executed.stdout, /1 refuted/);
  } finally {
    cleanup(root);
  }
});

test('CLI: --json emits the full verdict table', () => {
  const root = temporaryProject('buaflow-verifier-cli-');
  try {
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), {
      schemaVersion: '1.0',
      project: 'cli-fixture',
      profile: 'test-profile',
      targetLevel: 'R0',
      commit: 'WORKTREE',
      generatedAt: '2026-09-23T00:00:00.000Z',
      controls: {
        'version-control': { status: 'pass', evidence: [{ type: 'command', value: 'exit 0' }] },
        'start-path': { status: 'pass', evidence: [{ type: 'command', value: 'exit 0' }] },
        'primary-flow': { status: 'pass', evidence: [{ type: 'file', value: 'docs/evidence/readiness.json' }] },
      },
    });
    const result = runNode(path.join(repositoryRoot, 'claude-setup', 'verifier.js'), {
      cwd: root,
      args: ['--root', root, '--execute', '--json'],
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.executed, true);
    assert.equal(parsed.counts.confirmed, 3);
    assert.equal(parsed.verdicts.length, 3);
  } finally {
    cleanup(root);
  }
});

test('CLI: rejects a manifest path outside the project root', () => {
  const result = runNode(path.join(repositoryRoot, 'claude-setup', 'verifier.js'), {
    args: ['--root', '.', '--file', '../outside.json'],
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must stay inside the project root/);
});

test('every shipped reference app has all 25 R3 controls confirmable without a full environment', () => {
  // Not an execution run. Two assertions, and the second is the one with teeth: every control
  // must be CONFIRMED statically, not merely un-refuted. Until EP-011 that was false — six
  // controls per app (version-control, start-path, build, verification, automated-tests, ci)
  // carried only commands or a URL, so nothing could check them without a full environment,
  // and the verifier honestly called them unverifiable. Requiring zero unverifiable here means
  // a future control added with nothing but a command reintroduces the gap loudly instead of
  // quietly.
  for (const app of ['nextjs-postgres-crud', 'react-fastapi-postgres-crud', 'expo-fastapi-postgres-sync']) {
    const root = path.join(repositoryRoot, 'reference-apps', app);
    const value = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'evidence', 'readiness.json'), 'utf8'));
    const result = verifyManifest(value, { root });
    assert.deepEqual(result.disagreements, [], `${app} has a refutable claim`);
    assert.equal(result.ok, true, `${app}: ${JSON.stringify(result.verdicts.filter((v) => v.verdict === 'refuted'))}`);
    assert.equal(
      result.counts.unverifiable,
      0,
      `${app} has statically unverifiable controls: ${result.verdicts.filter((v) => v.verdict === 'unverifiable').map((v) => v.control).join(', ')}`
    );
    assert.equal(result.counts.confirmed, 25, `${app} should confirm all 25 R3 controls`);
  }
});
