'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repositoryRoot, runNode, temporaryProject, cleanup, write } = require('./helpers.js');
const { build, loadCapabilities, renderSkill } = require(path.join(repositoryRoot, 'scripts', 'generate-workflow-manual.js'));

const script = path.join(repositoryRoot, 'scripts', 'generate-workflow-manual.js');

test('the shipped manual/ is exactly what core/ renders to', () => {
  const result = runNode(script, { args: ['--check'] });
  assert.equal(result.status, 0, result.stderr);
});

test('a playbook resolves tool syntax and lists a fallback for every feature the skill uses, and only those', () => {
  const { capabilities } = loadCapabilities(repositoryRoot);
  const skill = {
    id: 'demo', description: 'Demo skill.', argumentHint: '[T-xxx]', invocation: 'human', claudeAllowedTools: ['Read'],
    body: 'Do: {{ARGUMENTS}}\n\n{{shell: git status --short}}\n\nThen continue.\n',
  };
  const out = renderSkill(skill, capabilities);
  assert.doesNotMatch(out, /\{\{/);
  assert.match(out, /Do: <argument>/);
  assert.match(out, /## Run first\n\n- `git status --short`/);
  assert.match(out, /only when a person explicitly asks/);
  assert.match(out, /\*\*slash-command-arguments\*\*/);
  assert.match(out, /\*\*inline-shell\*\*/);
  assert.doesNotMatch(out, /\*\*subagents\*\*/, 'a skill that delegates nothing gets no delegation fallback');
});

test('every guarantee that does not survive without session features says what to do instead', () => {
  const { guarantees } = loadCapabilities(repositoryRoot);
  const lost = guarantees.filter((g) => !g.holdsWithoutSession);
  assert.ok(lost.length >= 3, 'the session-only guarantees are stated, not hidden');
  for (const g of lost) assert.ok(g.note.length > 40, `${g.id} needs an honest note`);
  const readme = fs.readFileSync(path.join(repositoryRoot, 'manual', 'README.md'), 'utf8');
  for (const g of lost) assert.match(readme, new RegExp(`\\| ${g.id} \\|[^\\n]*\\*\\*no\\*\\*`));
});

test('a core placeholder with no fallback, or a mapped feature nothing uses, fails the build', () => {
  const root = temporaryProject('buaflow-manual-');
  try {
    for (const dir of ['core/skills', 'core/agents']) fs.cpSync(path.join(repositoryRoot, dir), path.join(root, dir), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, 'core', 'capabilities.json'), path.join(root, 'core', 'capabilities.json'));
    assert.deepEqual(build(root).problems, []);

    const file = path.join(root, 'core', 'skills', 'task.md');
    write(file, fs.readFileSync(file, 'utf8').replace('{{ARGUMENTS}}', '{{ARGUMENTS}} {{clipboard}}'));
    assert.match(build(root).problems.join('\n'), /\{\{clipboard\} that has no fallback|\{\{clipboard/);

    const map = JSON.parse(fs.readFileSync(path.join(root, 'core', 'capabilities.json'), 'utf8'));
    map.capabilities.push({ id: 'voice', detect: 'speak aloud', without: 'type instead' });
    write(path.join(root, 'core', 'capabilities.json'), JSON.stringify(map));
    assert.match(build(root).problems.join('\n'), /"voice" is mapped but nothing in core uses it/);
  } finally {
    cleanup(root);
  }
});
