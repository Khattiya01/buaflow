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

// IC-007: /intent records the customer's words and must not invent; /elaborate proposes what they left out.
// docs-lint proves every proposal was decided and every accepted one reached the spec.
const elaboration = (rows, extra = '') => [
  '---', 'intent: I-001', 'brief: open', extra, 'researched: 2026-09-25', '---', '',
  '| ID | ข้อเสนอ | ทำไม | แหล่งที่มา | ระดับ | การตัดสิน |', '|---|---|---|---|---|---|',
  '| E-000 | <ตัวอย่าง> | <ตัวอย่าง> | <URL> | must | pending |',
  ...rows, '',
].join('\n');
const openIntent = (status, extra = '') => `---\nid: I-001\nstatus: ${status}\nbrief: open\n${extra}---\n\nsee docs/specs/F-01-dashboard/\n`;

test('docs-lint (IC-007) warns on proposals without a source, a level or a decision, and ignores the template row', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'intents', 'I-001-dashboard.md'), openIntent('draft'));
    write(path.join(root, 'docs', 'elaboration', 'I-001-dashboard.md'), elaboration([
      '| E-01 | aging report | ตามหนี้ก่อนเสีย | https://example.com/ar-aging | must | accepted |',
      '| E-02 | แจ้งเตือนเกินกำหนด | ไม่มีใครต้องเปิดดูเอง | - | should | pending |',
      '| E-03 | export | ส่งต่อบัญชี | ความรู้ทั่วไปของโดเมน | nice | maybe |',
    ], 'spec: <docs/specs/F-xx-name/>'));
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0, 'warnings only in 3.x');
    assert.match(result.stdout, /E-02 ไม่มีแหล่งที่มา/);
    assert.match(result.stdout, /E-03 ระดับ "nice"/);
    assert.match(result.stdout, /E-03 การตัดสิน "maybe"/);
    assert.doesNotMatch(result.stdout, /E-000|E-01 ไม่มีแหล่งที่มา/);
    assert.doesNotMatch(result.stdout, /ยังไม่ตัดสิน/, 'pending is fine while the intent is still a draft');
    assert.match(result.stdout, /3 ข้อเสนอ · รับ 1 · ค้าง 1/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (IC-007) warns when work moved on with proposals still pending or accepted ones missing from the spec', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'intents', 'I-001-dashboard.md'), openIntent('accepted'));
    write(path.join(root, 'docs', 'specs', 'F-01-dashboard', 'requirements.md'), '- [ ] **AC-1** WHEN finance opens the dashboard THE SYSTEM SHALL show aging buckets (E-01)\n');
    write(path.join(root, 'docs', 'elaboration', 'I-001-dashboard.md'), elaboration([
      '| E-01 | aging report | ตามหนี้ก่อนเสีย | https://example.com/ar-aging | must | accepted |',
      '| E-02 | จ่ายบางส่วน | ยอดค้างต้องถูก | https://example.com/partial | must | accepted |',
      '| E-03 | แจ้งเตือน | ไม่ต้องเปิดดูเอง | https://example.com/dunning | should | pending |',
      '| E-04 | e-Tax invoice | กฎหมาย | https://example.com/etax | could | change-request |',
    ], 'spec: docs/specs/F-01-dashboard/'));
    const result = runNode(docsLint, { args: [root] });
    assert.equal(result.status, 0, 'warnings only in 3.x');
    assert.match(result.stdout, /ยังไม่ตัดสิน 1 ข้อ \(E-03\)/);
    assert.match(result.stdout, /รับแล้วแต่ไม่อยู่ใน docs\/specs\/F-01-dashboard\/requirements\.md: E-02/);
    assert.doesNotMatch(result.stdout, /requirements\.md: E-01/);
    assert.doesNotMatch(result.stdout, /brief: open และ accepted แล้ว/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (IC-007) asks an accepted open-brief intent to be elaborated, unless it says it skipped on purpose', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'intents', 'I-001-dashboard.md'), openIntent('accepted'));
    write(path.join(root, 'docs', 'intents', 'I-002-bug.md'), '---\nid: I-002\nstatus: accepted\n---\n\nsee docs/specs/F-01-dashboard/\n');
    write(path.join(root, 'docs', 'specs', 'F-01-dashboard', 'requirements.md'), '');
    const missing = runNode(docsLint, { args: [root] });
    assert.equal(missing.status, 0, 'warnings only in 3.x');
    assert.match(missing.stdout, /intents\/I-001-dashboard\.md: brief: open และ accepted แล้ว/);
    assert.doesNotMatch(missing.stdout, /I-002-bug\.md: brief/, 'an intent without brief: is not asked');
    write(path.join(root, 'docs', 'intents', 'I-001-dashboard.md'), openIntent('accepted', 'elaboration: skipped\n'));
    const skipped = runNode(docsLint, { args: [root] });
    assert.doesNotMatch(skipped.stdout, /brief: open และ accepted แล้ว/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (IC-007) stays silent for a project that uses neither brief: nor docs/elaboration/', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'intents', 'I-001-old.md'), '---\nid: I-001\nstatus: draft\n---\n');
    const result = runNode(docsLint, { args: [root] });
    assert.doesNotMatch(result.stdout, /Elaboration/);
  } finally {
    cleanup(root);
  }
});

test('the elaboration template carries the columns docs-lint reads, and the intent template offers brief:', () => {
  const fs = require('node:fs');
  const tpl = fs.readFileSync(path.join(repositoryRoot, 'templates', 'elaboration.tpl.md'), 'utf8');
  assert.match(tpl, /^\| ID \| ข้อเสนอ \| ทำไม \(ผูกกับเป้าหมาย\) \| แหล่งที่มา \| ระดับ \| การตัดสิน \|$/m);
  assert.match(tpl, /^\| E-000 \|/m);
  const intent = fs.readFileSync(path.join(repositoryRoot, 'templates', 'intent.tpl.md'), 'utf8');
  assert.match(intent, /^brief: open \| fixed\s+#/m);
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
    assert.match(template, /^fixes: <T-xxx .+ลบบรรทัดนี้>$/m);
  } finally {
    cleanup(root);
  }
});

// BC-008: two open tasks that change the same file with no order between them conflict at merge.
test('docs-lint (BC-008) warns when two open tasks share a touches: path with no depends_on between them', () => {
  const root = temporaryProject();
  try {
    const task = (id, status, extra) => ['---', `id: ${id}`, 'title: demo', 'type: feat', 'milestone: M1', `status: ${status}`, 'priority: P1', 'estimate: 1', ...extra, '---', ''].join('\n');
    const tasksDir = path.join(root, 'docs', 'backlog', 'tasks');
    write(path.join(tasksDir, 'T-001.md'), task('T-001', 'todo', ['touches: [src/orders/api.ts, src/routes.ts]']));
    write(path.join(tasksDir, 'T-002.md'), task('T-002', 'todo', ['touches: [src/orders/, docs/api/]']));
    write(path.join(tasksDir, 'T-003.md'), task('T-003', 'todo', ['depends_on: [T-001]', 'touches: [src/routes.ts]']));
    write(path.join(tasksDir, 'T-004.md'), task('T-004', 'done', ['touches: [src/routes.ts]']));
    write(path.join(tasksDir, 'T-005.md'), task('T-005', 'todo', ['touches: [<path/ไฟล์.ts>, <โฟลเดอร์/>]']));
    const result = runNode(docsLint, { args: [root] });
    const warnings = result.stdout.split(/\r?\n/).filter((line) => /แตะที่เดียวกัน/.test(line));
    assert.equal(warnings.length, 1, result.stdout);
    assert.match(warnings[0], /T-001 กับ T-002 .*src\/orders\/api\.ts/);
    assert.doesNotMatch(result.stdout, /FAIL.*แตะที่เดียวกัน/);
  } finally {
    cleanup(root);
  }
});

test('docs-lint (BC-008) follows depends_on through a chain, and says nothing when no task declares touches:', () => {
  const root = temporaryProject();
  try {
    const task = (id, extra) => ['---', `id: ${id}`, 'title: demo', 'type: feat', 'milestone: M1', 'status: todo', 'priority: P1', 'estimate: 1', ...extra, '---', ''].join('\n');
    const tasksDir = path.join(root, 'docs', 'backlog', 'tasks');
    write(path.join(tasksDir, 'T-001.md'), task('T-001', []));
    write(path.join(tasksDir, 'T-002.md'), task('T-002', []));
    const bare = runNode(docsLint, { args: [root] });
    assert.doesNotMatch(bare.stdout, /touches/);

    write(path.join(tasksDir, 'T-001.md'), task('T-001', ['touches: [src/app/orders/*.tsx]']));
    write(path.join(tasksDir, 'T-002.md'), task('T-002', ['depends_on: [T-001]']));
    write(path.join(tasksDir, 'T-003.md'), task('T-003', ['depends_on: [T-002]', 'touches: [src/app/orders/page.tsx]']));
    const chained = runNode(docsLint, { args: [root] });
    assert.doesNotMatch(chained.stdout, /แตะที่เดียวกัน/, chained.stdout);
    assert.match(chained.stdout, /ok\s+touches:/);
  } finally {
    cleanup(root);
  }
});

test('the task template offers touches: as a placeholder docs-lint ignores', () => {
  const template = require('node:fs').readFileSync(path.join(repositoryRoot, 'templates', 'task.tpl.md'), 'utf8');
  assert.match(template, /^touches: \[<.+>\]\s+#/m);
});
