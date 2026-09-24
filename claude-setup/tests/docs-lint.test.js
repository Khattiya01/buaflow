'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const docsLint = path.join(repositoryRoot, 'claude-setup', 'docs-lint.js');

test('docs-lint treats a project before Phase 5 as warnings, not failure', () => {
  const root = temporaryProject();
  try {
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ต้องแก้: 0/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint rejects a task without frontmatter', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-001.md'), '# Task without metadata\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /T-001\.md: ไม่มี frontmatter/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint release mode fails when a milestone has no tasks', () => {
  const root = temporaryProject();
  try {
    const result = runNode(docsLint, { args: ['--release', 'M1', root] });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /ไม่มี task ไหนอยู่ใน milestone M1/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) skips discovery linkage entirely when there is no pain-point register', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nno pain point referenced anywhere\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /Discovery linkage/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) treats the template\'s own PP-000 example row as not-yet-filled-in', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'discovery', 'pain-point-register.md'), '| ID | workflow/step |\n|---|---|\n| PP-000 | <example> |\n');
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nno pain point referenced anywhere\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ยังไม่มีแถวจริง/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) warns, but does not fail, when an intent has no pain-point linkage', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'discovery', 'pain-point-register.md'), '| ID | workflow/step |\n|---|---|\n| PP-000 | <example> |\n| PP-001 | approval flow |\n');
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nno pain point referenced anywhere\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ไม่อ้าง pain-point id ใดเลย/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (DV-002) is silent when every intent references a real pain-point id', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'discovery', 'pain-point-register.md'), '| ID | workflow/step |\n|---|---|\n| PP-000 | <example> |\n| PP-001 | approval flow |\n');
    write(path.join(root, 'docs', 'intents', 'I-001-example.md'), '---\nstatus: draft\n---\n\nsee PP-001 for evidence\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /ไม่อ้าง pain-point id ใดเลย/);
    assert.match(result.stdout, /intent ทุกไฟล์อ้างถึง pain point ในทะเบียนแล้ว/);
  } finally {
    cleanup(root);
  }
});


// IC-005: the spec skill always said ACs must be EARS and each must map to a test in design.md,
// and nothing checked either. Warnings in 3.x, so no existing spec fails on a MINOR upgrade.
test('docs-lint (IC-005) warns on a non-EARS acceptance criterion and on an AC no test plan mentions', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'specs', 'F-01-refund', 'requirements.md'), [
      '- [ ] **AC-1** WHEN the user submits a refund THE SYSTEM SHALL create a pending request',
      '- [ ] **AC-2** IF the order is older than 30 days THEN THE SYSTEM SHALL reject with REFUND_EXPIRED',
      '- [ ] **AC-3** The system handles errors nicely',
      '',
    ].join('\n'));
    write(path.join(root, 'docs', 'specs', 'F-01-refund', 'design.md'), '## Test plan\n- AC-1 → refund.create.test\n- AC-3 → ?\n');
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0, 'warnings only in 3.x');
    assert.match(result.stdout, /AC-3 ไม่ใช่ EARS/);
    assert.doesNotMatch(result.stdout, /AC-1 ไม่ใช่ EARS|AC-2 ไม่ใช่ EARS/);
    assert.match(result.stdout, /AC-2 ไม่ถูกอ้างใน design\.md/);
  } finally {
    cleanup(root);
  }
});

// IC-002: a question must say which decision its answer changes; one that changes none is not asked.
test('docs-lint (IC-002) warns on untagged clarification questions and on a file over the question budget', () => {
  const root = temporaryProject();
  try {
    const q = (tag, i) => `[NEEDS CLARIFICATION${tag ? ` (${tag})` : ''}: question ${i}]`;
    write(path.join(root, 'docs', 'intents', 'I-001-refund.md'), `---\nstatus: draft\n---\n${q('security', 1)}\n${q('', 2)}\n${q('mood', 3)}\n`);
    write(path.join(root, 'docs', 'intents', 'I-002-big.md'), `---\nstatus: draft\n---\n${Array.from({ length: 9 }, (_, i) => q('scope', i)).join('\n')}\n`);
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0, 'warnings only in 3.x');
    assert.match(result.stdout, /I-001-refund\.md: 2 คำถามไม่บอกว่าคำตอบเปลี่ยน/);
    assert.match(result.stdout, /I-002-big\.md: คำถามค้าง 9 ข้อ เกินงบ 8/);
    assert.doesNotMatch(result.stdout, /I-002-big\.md: \d+ คำถามไม่บอก/);
  } finally {
    cleanup(root);
  }
});

// EV-011 AC-15: `fixes:` links a task to the closed task it repairs; docs-lint must accept it as it is.
test('docs-lint (EV-011) accepts a task that carries fixes:, and the task template offers the line', () => {
  const root = temporaryProject();
  try {
    const task = (id, extra) => ['---', `id: ${id}`, 'title: demo', 'type: fix', 'milestone: M1', 'status: todo', 'priority: P1', 'estimate: 1', ...extra, '---', '', '## Acceptance Criteria', '- [ ] **AC-1** WHEN x THE SYSTEM SHALL y', ''].join('\n');
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-003.md'), task('T-003', []));
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-004.md'), task('T-004', ['fixes: T-003']));
    const withFixes = runNode(docsLint, { args: [root] });
    write(path.join(root, 'docs', 'backlog', 'tasks', 'T-004.md'), task('T-004', []));
    const without = runNode(docsLint, { args: [root] });
    assert.equal(withFixes.status, without.status, withFixes.stdout);
    assert.equal(withFixes.stdout.replace(/T-004/g, ''), without.stdout.replace(/T-004/g, ''), 'fixes: adds no finding');
    const template = require('node:fs').readFileSync(path.join(repositoryRoot, 'templates', 'task.tpl.md'), 'utf8');
    assert.match(template, /^fixes: T-000\s+#.+ลบบรรทัดนี้$/m);
  } finally {
    cleanup(root);
  }
});
