'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { assess, draftManifest } = require('../assess.js');
const { validateManifest } = require('../readiness.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const HEAD = '0123456789abcdef0123456789abcdef01234567';

// A git that answers like a repository whose root is `top`, without needing git in the sandbox.
function fakeGit(top, { commits = true } = {}) {
  return (args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return top ? { status: 0, stdout: top } : { status: 128, stdout: '' };
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return top && commits ? { status: 0, stdout: HEAD } : { status: 128, stdout: '' };
    return { status: 1, stdout: '' };
  };
}

// The shape of the first outside trial: backend/ and frontend/ each own a package.json, the
// root has none, CI is declared local-only, and nobody has written a readiness manifest.
function brownfield(root) {
  writeJson(path.join(root, 'backend', 'package.json'), { scripts: { build: 'tsc', 'verify:all': 'x' }, dependencies: { jose: '1', bcrypt: '1' } });
  writeJson(path.join(root, 'frontend', 'package.json'), { scripts: { build: 'vite build', typecheck: 'tsc' } });
  write(path.join(root, 'backend', 'prisma', 'schema.prisma'), 'model A { id Int @id }\n');
  write(path.join(root, 'backend', 'prisma', 'migrations', '0001_init', 'migration.sql'), 'CREATE TABLE a (id int);\n');
  write(path.join(root, 'backend', 'scripts', 'roleMatrixSmoke.ts'), 'export {};\n');
  write(path.join(root, 'backend', '.env.example'), 'DATABASE_URL=\n');
  write(path.join(root, 'README.md'), '# App\n\n```bash\ndocker compose up -d postgres\nnpm --prefix backend run dev\n```\n');
  write(path.join(root, 'docs', 'requirements.md'), '# Requirements\n');
  writeJson(path.join(root, '.claude', 'stack.json'), {
    schemaVersion: '1.0',
    verifyCommand: 'npm --prefix backend run verify:all',
    testFilePattern: '(^|/)scripts/.*Smoke\\.ts$',
    ciMode: 'local-only',
  });
}

test('an empty directory is assessed as reaching no level, and says why', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    const report = assess(root, { gitRunner: fakeGit(null) });
    assert.equal(report.results['version-control'].status, 'fail');
    assert.equal(report.results['start-path'].status, 'fail');
    assert.equal(report.results.verification.status, 'fail');
    assert.equal(report.summary.proven, null);
    assert.equal(report.summary.reachable, null);
    assert.equal(report.summary.nextLevel, 'R0');
    assert.deepEqual(report.summary.blockers.map((b) => b.control), ['version-control', 'start-path']);
  } finally {
    cleanup(root);
  }
});

test('the first trial\'s shape: R1 reachable, R2 blocked on ci alone, with no manifest written', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    brownfield(root);
    const report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.summary.reachable, 'R1');
    assert.equal(report.summary.nextLevel, 'R2');
    assert.deepEqual(report.summary.blockers.map((b) => b.control), ['ci']);
    // A monorepo without a root package.json still has its builds found, one per workspace.
    assert.deepEqual(report.results.build.commands, ['npm --prefix backend run build', 'npm --prefix frontend run build']);
    assert.deepEqual(report.results.verification.commands, ['npm --prefix backend run verify:all']);
    // The project's own test pattern is honoured, so integration smokes count as tests.
    assert.equal(report.results['automated-tests'].status, 'pending');
    assert.match(report.results['automated-tests'].reason, /1 test file/);
    assert.equal(report.results.persistence.status, 'pass');
    assert.deepEqual(report.results.persistence.evidence[0], { type: 'file', value: 'backend/prisma/migrations' });
    assert.equal(report.results['start-path'].status, 'pass');
  } finally {
    cleanup(root);
  }
});

test('probes alone never pass a control that needs a command to run', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    brownfield(root);
    const report = assess(root, { gitRunner: fakeGit(root) });
    for (const control of ['build', 'verification', 'automated-tests', 'primary-flow', 'access-control', 'requirements-traceability']) {
      assert.notEqual(report.results[control].status, 'pass', control);
    }
    assert.equal(report.summary.proven, null);
  } finally {
    cleanup(root);
  }
});

test('--execute turns build and verify into pass or fail, and tests stay pending when green', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    brownfield(root);
    const ran = [];
    const green = assess(root, {
      gitRunner: fakeGit(root),
      execute: true,
      runner: (command) => { ran.push(command); return { status: 0, tail: '' }; },
    });
    assert.equal(green.results.build.status, 'pass');
    assert.equal(green.results.build.basis, 'executed');
    assert.equal(green.results.verification.status, 'pass');
    // Green tests prove they run, not that they cover the business path.
    assert.equal(green.results['automated-tests'].status, 'pending');
    // The verify command doubles as the test command here and is run once, not twice.
    assert.equal(ran.filter((c) => c === 'npm --prefix backend run verify:all').length, 1);

    const red = assess(root, {
      gitRunner: fakeGit(root),
      execute: true,
      runner: (command) => (command.includes('frontend') ? { status: 2, tail: 'TS2304: Cannot find name' } : { status: 0, tail: '' }),
    });
    assert.equal(red.results.build.status, 'fail');
    assert.match(red.results.build.reason, /frontend run build` exited 2: TS2304/);
    assert.equal(red.summary.reachable, 'R0');
    assert.deepEqual(red.summary.blockers.map((b) => b.control), ['build']);
  } finally {
    cleanup(root);
  }
});

test('ci passes only with a recorded successful run, not with a workflow file alone', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    write(path.join(root, '.github', 'workflows', 'ci.yml'), 'on: push\n');
    let report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.results.ci.status, 'pending');
    assert.match(report.results.ci.reason, /never ran proves nothing/);

    writeJson(path.join(root, 'evidence', 'ci-run.json'), { conclusion: 'failure' });
    report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.results.ci.status, 'pending');

    writeJson(path.join(root, 'evidence', 'ci-run.json'), { conclusion: 'success' });
    report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.results.ci.status, 'pass');
  } finally {
    cleanup(root);
  }
});

test('nothing is ever assessed not-applicable: scope is a human judgement', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    write(path.join(root, 'README.md'), 'static site\n');
    const report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.results.persistence.status, 'pending');
    assert.equal(report.results['access-control'].status, 'pending');
    assert.match(report.results.persistence.reason, /not-applicable a human declares/);
    for (const entry of Object.values(report.results)) assert.notEqual(entry.status, 'not-applicable');
  } finally {
    cleanup(root);
  }
});

test('a root below the git root is reported, and CI there counts only if it names this project', () => {
  const top = temporaryProject('buaflow-assess-');
  const root = path.join(top, 'apps', 'web');
  try {
    write(path.join(root, 'README.md'), '# web\n');
    write(path.join(top, '.github', 'workflows', 'other.yml'), 'working-directory: apps/api\n');
    let report = assess(root, { gitRunner: fakeGit(top) });
    assert.match(report.notes.join('\n'), /not the git root/);
    assert.equal(report.results.ci.status, 'fail');

    write(path.join(top, '.github', 'workflows', 'web.yml'), 'working-directory: apps/web\n');
    report = assess(root, { gitRunner: fakeGit(top) });
    assert.equal(report.results.ci.status, 'pending');
    // Evidence never points outside the project root.
    assert.deepEqual(report.results.ci.evidence, []);
  } finally {
    cleanup(top);
  }
});

test('the draft manifest keeps pending as pending, so readiness.js fails it honestly', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    brownfield(root);
    const report = assess(root, { gitRunner: fakeGit(root) });
    const draft = draftManifest(report);
    assert.equal(draft.targetLevel, 'R2');
    assert.equal(draft.commit, HEAD);
    assert.equal(draft.controls.ci.status, 'fail');
    assert.equal(draft.controls.build.status, 'pending');
    const check = validateManifest(draft, { root });
    assert.equal(check.outcome, 'fail');
    assert.ok(check.errors.some((e) => /^build: status is pending/.test(e)));
    // The controls it did prove survive the same validator a human manifest faces.
    assert.ok(!check.errors.some((e) => /^persistence:|^version-control:|^start-path:/.test(e)), check.errors.join('\n'));
  } finally {
    cleanup(root);
  }
});

test('CLI: buaflow assess works before any .claude/ control is installed, and --write never overwrites', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    brownfield(root);
    fs.rmSync(path.join(root, '.claude'), { recursive: true, force: true });
    const cli = path.join(repositoryRoot, 'bin', 'buaflow.js');
    const first = runNode(cli, { cwd: root, args: ['assess', '--write', 'docs/evidence/readiness.draft.json', '--json'] });
    assert.equal(first.status, 0, first.stderr + first.stdout);
    const output = JSON.parse(first.stdout);
    assert.equal(output.command, 'assess');
    assert.equal(output.data.result.draft.file, 'docs/evidence/readiness.draft.json');
    assert.equal(output.data.result.draft.readiness, 'fail');
    assert.ok(fs.existsSync(path.join(root, 'docs', 'evidence', 'readiness.draft.json')));

    const second = runNode(cli, { cwd: root, args: ['assess', '--write', 'docs/evidence/readiness.draft.json', '--json'] });
    assert.equal(second.status, 2);
    assert.match(JSON.parse(second.stdout).errors.join('\n'), /refusing to overwrite/);
  } finally {
    cleanup(root);
  }
});

// EV-009: hosted CI was unavailable (account billing). A clean-checkout run recorded by
// `buaflow ci` answers what R2 asks, and turns local-only from a permanent fail into a pass.
test('ciMode local-only passes ci once a local clean-checkout run succeeded, and says it was local', () => {
  const root = temporaryProject('buaflow-assess-');
  try {
    brownfield(root);
    let report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.results.ci.status, 'fail');
    assert.match(report.results.ci.next, /buaflow ci/);

    writeJson(path.join(root, 'docs', 'evidence', 'ci-run.json'), { provider: 'local-clean-checkout', conclusion: 'success', commit: 'abc1234def', durationSeconds: 111 });
    report = assess(root, { gitRunner: fakeGit(root) });
    assert.equal(report.results.ci.status, 'pass');
    assert.match(report.results.ci.reason, /local clean-checkout run passed/);
    assert.match(report.results.ci.reason, /not HEAD/);
    assert.equal(report.summary.reachable, 'R2');

    writeJson(path.join(root, 'docs', 'evidence', 'ci-run.json'), { provider: 'local-clean-checkout', conclusion: 'failure', commit: HEAD });
    assert.equal(assess(root, { gitRunner: fakeGit(root) }).results.ci.status, 'fail');
  } finally {
    cleanup(root);
  }
});
