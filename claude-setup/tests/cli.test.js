'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { controlsFor } = require('../readiness.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const cli = path.join(repositoryRoot, 'bin', 'buaflow.js');

function runCli(root, args) {
  return runNode(cli, { cwd: root, args: [...args, '--json'] });
}

function json(result) {
  assert.notEqual(result.stdout.trim(), '', result.stderr);
  return JSON.parse(result.stdout);
}

function r0Manifest() {
  const controls = {};
  for (const id of controlsFor('R0')) controls[id] = { status: 'pass', evidence: [{ type: 'command', value: `check ${id}` }] };
  return {
    schemaVersion: '1.0',
    project: 'fixture',
    profile: 'test',
    targetLevel: 'R0',
    commit: 'WORKTREE',
    generatedAt: '2026-09-22T12:00:00.000Z',
    controls,
  };
}

test('init creates only a tool-neutral manifest and refuses accidental overwrite', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    writeJson(path.join(root, 'package.json'), { name: 'demo-product' });
    const initialized = runCli(root, ['init', '--mode', 'extend']);
    assert.equal(initialized.status, 0);
    const output = json(initialized);
    assert.equal(output.command, 'init');
    assert.equal(output.status, 'ok');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.buaflow', 'project.json'), 'utf8'));
    assert.equal(manifest.project, 'demo-product');
    assert.equal(manifest.track, 'extend');
    assert.equal(fs.existsSync(path.join(root, '.claude')), false);

    const duplicate = runCli(root, ['init']);
    assert.equal(duplicate.status, 1);
    assert.equal(json(duplicate).code, 1);
  } finally {
    cleanup(root);
  }
});

test('doctor is vendor-neutral and exposes structured setup gaps', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const result = runCli(root, ['doctor']);
    assert.equal(result.status, 0);
    const output = json(result);
    assert.equal(output.command, 'doctor');
    assert.ok(output.data.checks.some((check) => check.name === 'controls' && check.status === 'warn'));
    assert.ok(output.warnings.some((warning) => warning.includes('project-manifest')));
  } finally {
    cleanup(root);
  }
});

// EV-009 K-1: pointed at frontend/ of a monorepo, doctor used to report only that git was
// installed. It now says where the repository is, because hooks and CI live there.
test('doctor names the git root when the project root is below it, and warns when there is no repository', { skip: spawnSync('git', ['--version']).status !== 0 }, () => {
  const top = temporaryProject('buaflow-cli-');
  try {
    const repositoryCheck = (root) => json(runCli(root, ['doctor'])).data.checks.find((check) => check.name === 'repository');
    assert.match(repositoryCheck(top).detail, /not inside a git work tree/);

    spawnSync('git', ['init', '-q'], { cwd: top });
    assert.equal(repositoryCheck(top).status, 'pass');

    const sub = path.join(top, 'frontend');
    fs.mkdirSync(sub);
    const check = repositoryCheck(sub);
    // Said, not warned: a monorepo subdirectory is valid, and --strict must not fail it.
    assert.equal(check.status, 'pass');
    assert.match(check.detail, /subdirectory of the git repository/);
  } finally {
    cleanup(top);
  }
});

test('verify and readiness use stable unavailable, failed and pass exit codes', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const unavailable = runCli(root, ['verify']);
    assert.equal(unavailable.status, 3);
    assert.equal(json(unavailable).code, 3);

    write(path.join(root, '.claude', 'verify.js'), 'process.exit(0);\n');
    const verified = runCli(root, ['verify']);
    assert.equal(verified.status, 0);
    assert.equal(json(verified).status, 'ok');

    fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', 'readiness.js'), path.join(root, '.claude', 'readiness.js'));
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), r0Manifest());
    const ready = runCli(root, ['readiness', '--level', 'R0']);
    assert.equal(ready.status, 0, ready.stderr);
    const readyOutput = json(ready);
    assert.equal(readyOutput.data.result.ok, true);
  } finally {
    cleanup(root);
  }
});

test('audit delegates to the independent verifier and keeps the same exit-code contract', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const unavailable = runCli(root, ['audit']);
    assert.equal(unavailable.status, 3, 'an uninstalled control is unavailable, not a failure');

    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    for (const name of ['readiness.js', 'verifier.js']) {
      fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', name), path.join(root, '.claude', name));
    }

    // Command evidence that cannot be reproduced, claimed as a pass. Without --execute the
    // verifier must not run it, and must not call it a pass either.
    const value = r0Manifest();
    value.controls['start-path'].evidence = [{ type: 'command', value: 'exit 7' }];
    writeJson(path.join(root, 'docs', 'evidence', 'readiness.json'), value);

    const quiet = runCli(root, ['audit', '--level', 'R0']);
    assert.equal(quiet.status, 0, quiet.stderr);
    const quietOutput = json(quiet);
    assert.equal(quietOutput.data.result.executed, false);
    assert.equal(quietOutput.data.result.counts.confirmed, 0);

    const executed = runCli(root, ['audit', '--level', 'R0', '--execute']);
    assert.equal(executed.status, 1, executed.stdout + executed.stderr);
    const executedOutput = json(executed);
    assert.equal(executedOutput.data.result.ok, false);
    assert.match(executedOutput.data.result.disagreements.join('\n'), /start-path: claimed pass, but did not reproduce in this environment — exited 7/);
  } finally {
    cleanup(root);
  }
});

test('resume reads persisted state without a vendor-specific session', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    runCli(root, ['init']);
    write(path.join(root, 'docs', 'planning', '_state.md'), '# State\n| Phase | Status |\n| 0 | ✅ |\n| 1 | ⬜ |\n');
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-101.md'), '---\nstatus: in-progress\n---\n');
    const result = runCli(root, ['resume']);
    assert.equal(result.status, 0);
    const output = json(result);
    assert.equal(output.data.planning.pendingMarkers, 1);
    assert.deepEqual(output.data.inProgressTasks, ['T-101']);
  } finally {
    cleanup(root);
  }
});

test('requirements delegates to the requirement-coverage control and keeps the same exit-code contract', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const unavailable = runCli(root, ['requirements']);
    assert.equal(unavailable.status, 3, 'an uninstalled control is unavailable, not a failure');

    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    for (const name of ['readiness.js', 'requirement-coverage.js']) {
      fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', name), path.join(root, '.claude', name));
    }

    const requirement = (exception) => ({
      schemaVersion: '1.0',
      project: 'cli-fixture',
      generatedAt: '2026-09-23T00:00:00.000Z',
      requirements: [{
        id: 'REQ-001',
        statement: 'Something this fixture accepted and cannot prove',
        source: 'cli fixture',
        exception,
      }],
    });
    const file = path.join(root, 'docs', 'evidence', 'requirement-coverage.json');
    const base = {
      owner: 'a named human',
      reason: 'accepted deliberately for a reason long enough to be a real sentence',
      risk: 'low',
      acceptedOn: '2026-09-01',
    };

    writeJson(file, requirement({ ...base, expiresOn: '2099-01-01' }));
    const live = runCli(root, ['requirements']);
    assert.equal(live.status, 0, live.stderr);
    assert.equal(json(live).data.result.totals.excepted, 1);

    writeJson(file, requirement({ ...base, acceptedOn: '2020-01-01', expiresOn: '2020-06-01' }));
    const lapsed = runCli(root, ['requirements']);
    assert.equal(lapsed.status, 1, lapsed.stdout + lapsed.stderr);
    assert.equal(json(lapsed).data.result.totals.expired, 1);
  } finally {
    cleanup(root);
  }
});

test('security delegates to the security-baseline control and keeps the same exit-code contract', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const unavailable = runCli(root, ['security']);
    assert.equal(unavailable.status, 3, 'an uninstalled control is unavailable, not a failure');

    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    for (const name of ['readiness.js', 'requirement-coverage.js', 'security-baseline.js']) {
      fs.copyFileSync(path.join(repositoryRoot, 'claude-setup', name), path.join(root, '.claude', name));
    }
    // The control set the kit ships has to be reachable from the adopter project; standards/
    // control-sets under the project root is the first of the default lookup paths.
    fs.cpSync(path.join(repositoryRoot, 'standards', 'control-sets'), path.join(root, 'standards', 'control-sets'), { recursive: true });

    write(path.join(root, 'src', 'api.ts'), '// entry point\n');
    const baseline = {
      schemaVersion: '1.0',
      project: 'cli-fixture',
      generatedAt: '2026-09-23T00:00:00.000Z',
      controlSet: 'owasp-asvs-5.0.0-l1',
      excludedChapters: [],
      boundaries: [{
        id: 'TB-001',
        name: 'HTTP API',
        untrusted: 'any client on the network sending request bodies',
        trusted: 'everything below the data layer, which re-checks nothing',
        assets: ['rows belonging to other users'],
        entryPoints: [{ type: 'file', value: 'src/api.ts' }],
        enforcedBy: [{ type: 'file', value: 'src/api.ts' }],
      }],
      controls: [{ id: 'V8.2.2', status: 'met', evidence: [{ type: 'file', value: 'src/api.ts' }] }],
    };
    writeJson(path.join(root, 'docs', 'evidence', 'security-baseline.json'), baseline);

    // One control answered out of seventy: the baseline is incomplete, so this must fail.
    const incomplete = runCli(root, ['security']);
    assert.equal(incomplete.status, 1, incomplete.stdout + incomplete.stderr);
    assert.match(json(incomplete).data.result.errors.join('\n'), /unanswered/);
  } finally {
    cleanup(root);
  }
});

test('invalid CLI input returns a JSON error envelope with exit code 2', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const result = runCli(root, ['unknown-command']);
    assert.equal(result.status, 2);
    const output = json(result);
    assert.equal(output.code, 2);
    assert.equal(output.status, 'error');
  } finally {
    cleanup(root);
  }
});

test('top-level help works before a command is selected', () => {
  const root = temporaryProject('buaflow-cli-');
  try {
    const result = runNode(cli, { cwd: root, args: ['--help'] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: buaflow/);
  } finally {
    cleanup(root);
  }
});
