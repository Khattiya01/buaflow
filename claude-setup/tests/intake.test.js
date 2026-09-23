'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { plan, readItems } = require('../intake.js');
const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const now = new Date('2026-09-23T00:00:00Z');

test('GitHub, GitLab, CSV and plain-list inputs are all recognised from their content', () => {
  const gh = readItems(JSON.stringify([{ number: 7, title: 'Export fails', body: 'CSV export is broken for 3 customers', url: 'https://github.com/o/r/issues/7', labels: [{ name: 'bug' }] }]), 'issues.json');
  assert.deepEqual(gh[0], { title: 'Export fails', body: 'CSV export is broken for 3 customers', source: 'https://github.com/o/r/issues/7', labels: ['bug'], kind: 'github' });
  const gl = readItems(JSON.stringify([{ iid: 3, title: 'Slow report', description: 'x', web_url: 'https://gitlab.com/o/r/-/issues/3', labels: ['perf'] }]), 'i.json');
  assert.equal(gl[0].kind, 'gitlab');
  assert.equal(gl[0].source, 'https://gitlab.com/o/r/-/issues/3');
  const csv = readItems('title,body,url\n"Refunds, partial","Customers ask ""why""",https://t/1\n', 'backlog.csv');
  assert.deepEqual([csv[0].title, csv[0].body, csv[0].source], ['Refunds, partial', 'Customers ask "why"', 'https://t/1']);
  const text = readItems('# notes\n- Bulk import of users\n* [ ] Dark mode\nnot an item\n', 'notes.md');
  assert.deepEqual(text.map((t) => t.title), ['Bulk import of users', 'Dark mode']);
});

test('drafts keep the original words, invent nothing, and ask the four intent questions as tagged markers', () => {
  const root = temporaryProject('buaflow-intake-');
  try {
    const { created } = plan(root, [{ title: 'Dark mode', body: '', source: null, labels: [], kind: 'text' }], { now, from: 'notes.md' });
    const doc = created[0].content;
    assert.equal(created[0].id, 'I-001');
    assert.match(doc, /^status: draft$/m);
    assert.match(doc, /ไม่มีรายละเอียดนอกจากชื่อเรื่อง/);
    assert.equal((doc.match(/\[NEEDS CLARIFICATION \(scope\):/g) || []).length, 4);
    assert.doesNotMatch(doc, /## ปัญหา\n[^#>]+\w/, 'no invented problem statement');
  } finally {
    cleanup(root);
  }
});

test('nothing is imported twice, ids continue after existing intents, and --write never overwrites', () => {
  const root = temporaryProject('buaflow-intake-');
  try {
    write(path.join(root, 'docs', 'intents', 'I-004-existing.md'), '---\nid: I-004\ntitle: Old thing\nsource: https://github.com/o/r/issues/7\nstatus: rejected\n---\n');
    write(path.join(root, 'issues.json'), JSON.stringify([
      { number: 7, title: 'Export fails', body: 'b', url: 'https://github.com/o/r/issues/7' },
      { number: 8, title: 'Slow login', body: 'takes 9s for 40 users', url: 'https://github.com/o/r/issues/8' },
      { number: 8, title: 'Slow login', body: 'dup', url: 'https://github.com/o/r/issues/8' },
    ]));
    const cli = path.join(repositoryRoot, 'claude-setup', 'intake.js');
    const dry = runNode(cli, { args: ['--root', root, '--from', 'issues.json', '--json'] });
    const preview = JSON.parse(dry.stdout);
    assert.equal(preview.written, false);
    assert.deepEqual(preview.created.map((c) => c.id), ['I-005']);
    assert.match(preview.skipped.map((s) => s.reason).join('\n'), /already imported as I-004-existing\.md/);
    assert.match(preview.skipped.map((s) => s.reason).join('\n'), /duplicate in the input/);
    assert.equal(fs.readdirSync(path.join(root, 'docs', 'intents')).length, 1, 'a dry run writes nothing');

    runNode(cli, { args: ['--root', root, '--from', 'issues.json', '--write'] });
    assert.ok(fs.existsSync(path.join(root, 'docs', 'intents', 'I-005-slow-login.md')));
    const again = JSON.parse(runNode(cli, { args: ['--root', root, '--from', 'issues.json', '--write', '--json'] }).stdout);
    assert.equal(again.created.length, 0, 'the second import finds everything already there');
  } finally {
    cleanup(root);
  }
});
