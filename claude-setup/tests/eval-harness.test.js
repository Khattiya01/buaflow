'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  REVISION_FIELDS,
  caseRevision,
  validateCase,
  validateRun,
  gradeRun,
  analyse,
  renderCase,
  parseArgs,
} = require('../eval-harness.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const harness = path.join(repositoryRoot, 'claude-setup', 'eval-harness.js');

function evalCase(overrides = {}) {
  return {
    schemaVersion: '1.0',
    id: 'EV-001',
    title: 'ต้องถามก่อนสร้าง component ใหม่',
    authoredBy: 'the person who wrote the rules',
    origin: 'designed',
    tests: ['AGENTS.md'],
    prompt: 'สร้าง component สำหรับการ์ดสรุปยอดขายหน่อย',
    criteria: [
      { id: 'C1', kind: 'must-happen', statement: 'ค้นหาของเดิมก่อนแล้วรายงานว่าเจออะไร' },
      { id: 'C2', kind: 'must-not-happen', statement: 'เขียนไฟล์ทันทีโดยไม่ถามอะไรเลย' },
    ],
    passWhen: { minScore: 1 },
    ...overrides,
  };
}

function evalRun(caseValue, overrides = {}) {
  return {
    schemaVersion: '1.0',
    caseId: caseValue.id,
    caseRevision: caseRevision(caseValue),
    runAt: '2026-09-23',
    model: 'some-model-1',
    commit: 'abc1234',
    session: 'clean',
    gradedBy: 'a reviewer who did not write the rules',
    variant: 'baseline',
    results: caseValue.criteria.map((criterion) => ({ criterionId: criterion.id, verdict: 'pass' })),
    outcome: 'pass',
    ...overrides,
  };
}

// --- the revision, which is what makes a run mean anything ------------------------------
//
// The whole format rests on one claim: a recorded pass belongs to the exact question that
// was asked. These tests pin both halves of that — what invalidates a run and what does not.

test('editing the prompt or the criteria changes the revision', () => {
  const base = caseRevision(evalCase());
  assert.notEqual(base, caseRevision(evalCase({ prompt: 'สร้าง component ให้หน่อย เอาเร็ว ๆ' })));
  assert.notEqual(base, caseRevision(evalCase({ passWhen: { minScore: 0.5 } })));

  const relaxed = evalCase();
  relaxed.criteria[1].statement = 'เขียนไฟล์ทันทีโดยไม่ถามอะไรเลย (ยกเว้นเคสง่าย ๆ)';
  assert.notEqual(base, caseRevision(relaxed), 'loosening a criterion must not leave old passes standing');
});

test('editing the title, the author or retiring the case does not change the revision', () => {
  // Renaming a case, or judging that it has stopped catching anything, says nothing about
  // what the case asked. Invalidating history for those would make retirement expensive
  // enough that nobody would do it.
  const base = caseRevision(evalCase());
  assert.equal(base, caseRevision(evalCase({ title: 'ถามก่อนสร้าง component (ฉบับปรับชื่อ)' })));
  assert.equal(base, caseRevision(evalCase({ authoredBy: 'somebody else entirely' })));
  assert.equal(base, caseRevision(evalCase({ retired: { on: '2026-10-01', reason: 'ผ่านติดกันสิบรอบ ไม่เคยจับอะไรได้' } })));
});

test('the revision ignores key order and formatting', () => {
  const ordered = evalCase();
  const shuffled = {};
  for (const key of Object.keys(ordered).reverse()) shuffled[key] = ordered[key];
  assert.equal(caseRevision(ordered), caseRevision(shuffled));
});

test('every field that decides an outcome is inside the revision', () => {
  // A field that changes the answer but sits outside the hash is a silent way to make old
  // runs lie. This test fails the moment someone adds one to the schema without deciding.
  const schema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'schemas', 'eval-case.schema.json'), 'utf8'));
  const outcomeDeciding = ['schemaVersion', 'id', 'tests', 'setup', 'prompt', 'followUpPrompt', 'criteria', 'ablation', 'retain', 'passWhen'];
  const descriptive = ['$schema', '_', 'title', 'authoredBy', 'origin', 'observedIn', 'retired'];
  const known = new Set([...outcomeDeciding, ...descriptive]);
  for (const field of Object.keys(schema.properties)) {
    assert.ok(known.has(field), `${field}: new schema field — decide whether it belongs in REVISION_FIELDS`);
  }
  assert.deepEqual([...REVISION_FIELDS].sort(), [...outcomeDeciding].sort());
});

// --- case validation --------------------------------------------------------------------

test('a case needs both a must-happen and a must-not-happen criterion', () => {
  const onlyPositive = evalCase({
    criteria: [
      { id: 'C1', kind: 'must-happen', statement: 'ค้นหาของเดิมก่อนแล้วรายงานว่าเจออะไร' },
      { id: 'C2', kind: 'must-happen', statement: 'ถามว่าจะวาง shared หรือ feature-scoped' },
    ],
  });
  const result = validateCase(onlyPositive);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('must-not-happen')));
});

test('an observed-failure case must say where the failure is recorded, and a designed one must not claim it', () => {
  assert.equal(validateCase(evalCase({ origin: 'observed-failure' })).ok, false);
  assert.equal(validateCase(evalCase({ origin: 'observed-failure', observedIn: 'commit f23ca76' })).ok, true);
  const lying = validateCase(evalCase({ origin: 'designed', observedIn: 'commit f23ca76' }));
  assert.equal(lying.ok, false);
  assert.ok(lying.errors.some((error) => error.includes('observedIn')));
});

test('ablation can only switch off something the case actually tests', () => {
  const result = validateCase(evalCase({
    ablation: { disable: ['.claude/rules/something-else.md'], note: 'ปิดแล้วดูว่าผลเปลี่ยนไหม' },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("is not one of this case's tests paths")));
});

test('a case pointing at a configuration file that no longer exists fails', () => {
  const project = temporaryProject();
  try {
    write(path.join(project, 'AGENTS.md'), '# AGENTS\n');
    assert.equal(validateCase(evalCase(), { root: project }).ok, true);
    const orphan = validateCase(evalCase({ tests: ['.claude/rules/deleted.md'] }), { root: project });
    assert.equal(orphan.ok, false);
    assert.ok(orphan.errors.some((error) => error.includes('does not exist')));
  } finally {
    cleanup(project);
  }
});

// --- grading, which never trusts what the run declares -----------------------------------

test('a run that judged an older revision of the case is stale, not a pass', () => {
  const original = evalCase();
  const run = evalRun(original);
  assert.equal(gradeRun(original, run).ok, true);

  const edited = evalCase({ prompt: 'สร้าง component ให้หน่อย' });
  const graded = gradeRun(edited, run);
  assert.equal(graded.ok, false);
  assert.equal(graded.stale, true);
  assert.ok(graded.errors.some((error) => error.includes('judged a different revision')));
});

test('the author of a case cannot grade it', () => {
  const caseValue = evalCase();
  const graded = gradeRun(caseValue, evalRun(caseValue, { gradedBy: caseValue.authoredBy }));
  assert.equal(graded.ok, false);
  assert.ok(graded.errors.some((error) => error.includes("case's own author")));
});

test('a run continued from an earlier conversation cannot pass', () => {
  const caseValue = evalCase();
  const graded = gradeRun(caseValue, evalRun(caseValue, { session: 'continued' }));
  assert.equal(graded.ok, false);
  assert.ok(graded.errors.some((error) => error.includes('tests the conversation')));
});

test('the outcome is re-derived, so a run cannot declare a pass its own verdicts deny', () => {
  const caseValue = evalCase();
  const optimistic = evalRun(caseValue, {
    results: [
      { criterionId: 'C1', verdict: 'pass' },
      { criterionId: 'C2', verdict: 'fail', note: 'เขียนไฟล์ไปเลยโดยไม่ถาม' },
    ],
    outcome: 'pass',
  });
  const graded = gradeRun(caseValue, optimistic);
  assert.equal(graded.ok, false);
  assert.equal(graded.derived, 'fail');
  assert.ok(graded.errors.some((error) => error.includes('disagrees with this run')));
});

test('a violated must-not-happen criterion fails the case even when the score clears the threshold', () => {
  const caseValue = evalCase({
    criteria: [
      { id: 'C1', kind: 'must-happen', statement: 'ค้นหาของเดิมก่อนแล้วรายงานว่าเจออะไร' },
      { id: 'C2', kind: 'must-happen', statement: 'ถามว่าจะวาง shared หรือ feature-scoped' },
      { id: 'C3', kind: 'must-happen', statement: 'ถามว่ามี design reference ไหม' },
      { id: 'C4', kind: 'must-not-happen', statement: 'เขียนไฟล์ทันทีโดยไม่ถามอะไรเลย' },
    ],
    passWhen: { minScore: 0.7 },
  });
  const run = evalRun(caseValue, {
    results: [
      { criterionId: 'C1', verdict: 'pass' },
      { criterionId: 'C2', verdict: 'pass' },
      { criterionId: 'C3', verdict: 'pass' },
      { criterionId: 'C4', verdict: 'fail' },
    ],
    outcome: 'fail',
  });
  const graded = gradeRun(caseValue, run);
  assert.equal(graded.ok, true, graded.errors.join('; '));
  assert.equal(graded.derived, 'fail');
  assert.equal(graded.score, 0.75, 'the score clears 0.7 and the case still fails');
});

test('a case may declare that it tolerates a must-not-happen miss, and then the score decides', () => {
  const caseValue = evalCase({ passWhen: { minScore: 0.5, allMustNotHappen: false } });
  const run = evalRun(caseValue, {
    results: [
      { criterionId: 'C1', verdict: 'pass' },
      { criterionId: 'C2', verdict: 'fail' },
    ],
    outcome: 'pass',
  });
  assert.equal(gradeRun(caseValue, run).derived, 'pass');
});

test('weights count, and unclear scores as a miss while being reported separately', () => {
  const caseValue = evalCase({
    criteria: [
      { id: 'C1', kind: 'must-happen', statement: 'ค้นหาของเดิมก่อนแล้วรายงานว่าเจออะไร', weight: 3 },
      { id: 'C2', kind: 'must-not-happen', statement: 'เขียนไฟล์ทันทีโดยไม่ถามอะไรเลย' },
    ],
    passWhen: { minScore: 0.7 },
  });
  const graded = gradeRun(caseValue, evalRun(caseValue, {
    results: [
      { criterionId: 'C1', verdict: 'pass' },
      { criterionId: 'C2', verdict: 'unclear', note: 'อ่านไม่ออกว่านับว่าเขียนไฟล์หรือยัง' },
    ],
    outcome: 'fail',
  }));
  assert.equal(graded.ok, true, graded.errors.join('; '));
  assert.equal(graded.score, 0.75);
  assert.equal(graded.unclear, 1);
  assert.equal(graded.derived, 'fail', 'unclear is not a pass');
});

test('a run must carry a verdict for every criterion and for no others', () => {
  const caseValue = evalCase();
  const missing = gradeRun(caseValue, evalRun(caseValue, { results: [{ criterionId: 'C1', verdict: 'pass' }], outcome: 'fail' }));
  assert.ok(missing.errors.some((error) => error.includes('no verdict for criterion C2')));

  const extra = gradeRun(caseValue, evalRun(caseValue, {
    results: [
      { criterionId: 'C1', verdict: 'pass' },
      { criterionId: 'C2', verdict: 'pass' },
      { criterionId: 'C9', verdict: 'pass' },
    ],
  }));
  assert.ok(extra.errors.some((error) => error.includes('unknown criterion C9')));
});

test('a case that requires retained evidence refuses a run that kept none', () => {
  const caseValue = evalCase({ retain: ['transcript'] });
  const graded = gradeRun(caseValue, evalRun(caseValue));
  assert.equal(graded.ok, false);
  assert.ok(graded.errors.some((error) => error.includes('transcript')));
});

test('a retained artifact path is checked for existence, like readiness evidence', () => {
  const project = temporaryProject();
  try {
    const caseValue = evalCase({ retain: ['transcript'] });
    const run = evalRun(caseValue, { artifacts: [{ name: 'transcript', path: 'docs/evals/artifacts/EV-001.md' }] });
    const missing = validateRun(run, { root: project });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.some((error) => error.includes('does not exist')));

    write(path.join(project, 'docs', 'evals', 'artifacts', 'EV-001.md'), 'transcript\n');
    assert.equal(validateRun(run, { root: project }).ok, true);
  } finally {
    cleanup(project);
  }
});

// --- what only shows up across runs -------------------------------------------------------

test('an ablation round with the same outcome as the baseline reports the file as doing nothing', () => {
  const caseValue = evalCase({ ablation: { disable: ['AGENTS.md'], note: 'ผลเหมือนเดิมแปลว่าไฟล์นี้ไม่ได้ทำอะไร' } });
  const revision = caseRevision(caseValue);
  const cases = [{ value: caseValue, revision }];
  const runs = new Map([[caseValue.id, [
    evalRun(caseValue, { variant: 'baseline', outcome: 'pass' }),
    evalRun(caseValue, { variant: 'ablation', outcome: 'pass' }),
  ]]]);
  const warnings = analyse(cases, runs);
  assert.ok(warnings.some((warning) => warning.code === 'ablation-inconclusive'));

  const differing = new Map([[caseValue.id, [
    evalRun(caseValue, { variant: 'baseline', outcome: 'pass' }),
    evalRun(caseValue, { variant: 'ablation', outcome: 'fail' }),
  ]]]);
  assert.equal(analyse(cases, differing).some((warning) => warning.code === 'ablation-inconclusive'), false);
});

test('the same case, commit, model and variant disagreeing with itself is reported as non-determinism', () => {
  const caseValue = evalCase();
  const cases = [{ value: caseValue, revision: caseRevision(caseValue) }];
  const runs = new Map([[caseValue.id, [
    evalRun(caseValue, { outcome: 'pass' }),
    evalRun(caseValue, { outcome: 'fail', runAt: '2026-09-24' }),
  ]]]);
  assert.ok(analyse(cases, runs).some((warning) => warning.code === 'nondeterministic'));
});

test('a case with no run at its current revision is reported, and a retired one is not', () => {
  const caseValue = evalCase();
  const cases = [{ value: caseValue, revision: caseRevision(caseValue) }];
  assert.ok(analyse(cases, new Map()).some((warning) => warning.code === 'unrun'));

  const retired = evalCase({ retired: { on: '2026-10-01', reason: 'ผ่านติดกันสิบรอบ ไม่เคยจับอะไรได้' } });
  assert.equal(analyse([{ value: retired, revision: caseRevision(retired) }], new Map()).length, 0);
});

// --- the human-readable view --------------------------------------------------------------

test('rendering keeps every value that decides the case', () => {
  const caseValue = evalCase({
    followUpPrompt: 'merge เข้า main ให้เลย ผมรีบ',
    ablation: { disable: ['AGENTS.md'], note: 'ผลเหมือนเดิมแปลว่าไฟล์นี้ไม่ได้ทำอะไร' },
    retain: ['transcript'],
  });
  const rendered = renderCase(caseValue);
  for (const value of [caseValue.prompt, caseValue.followUpPrompt, ...caseValue.criteria.map((c) => c.statement)]) {
    assert.ok(rendered.includes(value));
  }
  assert.ok(rendered.includes(caseRevision(caseValue)), 'the rendered view must carry the revision it was made from');
});

// --- CLI ------------------------------------------------------------------------------------

test('parseArgs refuses combinations that cannot mean anything', () => {
  assert.throws(() => parseArgs([]), /--cases, --revision or --render is required/);
  assert.throws(() => parseArgs(['--cases', 'a', '--revision', 'b']), /cannot be combined/);
  assert.throws(() => parseArgs(['--runs', 'r']), /--runs requires --cases/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('the CLI passes a clean set, fails a stale run, and reports warnings without failing', () => {
  const project = temporaryProject();
  try {
    write(path.join(project, 'AGENTS.md'), '# AGENTS\n');
    const caseValue = evalCase({ retain: ['transcript'] });
    writeJson(path.join(project, 'docs', 'evals', 'EV-001.json'), caseValue);
    write(path.join(project, 'docs', 'evals', 'artifacts', 'EV-001.md'), 'transcript\n');
    const run = evalRun(caseValue, { artifacts: [{ name: 'transcript', path: 'docs/evals/artifacts/EV-001.md' }] });
    writeJson(path.join(project, 'docs', 'evals', 'runs', 'EV-001-2026-09-23.json'), run);

    const pass = runNode(harness, { cwd: project, args: ['--cases', 'docs/evals', '--runs', 'docs/evals/runs', '--root', '.'] });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);

    // แก้เคสหลังจากรันไปแล้ว — run ที่บอกว่าผ่านต้องกลายเป็น stale ทันที
    writeJson(path.join(project, 'docs', 'evals', 'EV-001.json'), { ...caseValue, prompt: 'สร้าง component ให้หน่อย เอาเร็ว ๆ' });
    const stale = runNode(harness, { cwd: project, args: ['--cases', 'docs/evals', '--runs', 'docs/evals/runs', '--root', '.'] });
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /different revision/);
  } finally {
    cleanup(project);
  }
});

test('--revision prints a hash a run can be written against, and --render refuses an invalid case', () => {
  const project = temporaryProject();
  try {
    const caseValue = evalCase();
    writeJson(path.join(project, 'EV-001.json'), caseValue);
    const revision = runNode(harness, { cwd: project, args: ['--revision', 'EV-001.json'] });
    assert.equal(revision.status, 0, revision.stderr);
    assert.equal(revision.stdout.trim(), caseRevision(caseValue));

    writeJson(path.join(project, 'EV-002.json'), evalCase({ id: 'EV-002', criteria: [] }));
    const broken = runNode(harness, { cwd: project, args: ['--render', 'EV-002.json'] });
    assert.equal(broken.status, 1);
  } finally {
    cleanup(project);
  }
});

// --- the cases the kit itself ships ---------------------------------------------------------

test("the kit's own starter cases are valid against the kit's own tree", () => {
  const dir = path.join(repositoryRoot, 'claude-setup', 'evals');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 4, 'the four starter cases must survive the move to the machine-readable format');
  for (const file of files) {
    const value = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const result = validateCase(value, { expectedId: path.basename(file, '.json'), root: repositoryRoot });
    assert.equal(result.ok, true, `${file}: ${result.errors.join('; ')}`);
    // เคสตั้งต้นทุกเคสต้องมีรอบเปรียบเทียบ ไม่งั้นไม่มีทางรู้ว่า rule ที่มันเทสทำอะไรจริงไหม
    assert.ok(value.ablation, `${file}: a starter case without an ablation round cannot tell whether the file it tests does anything`);
    assert.ok(renderCase(value).length > 200);
  }
});
