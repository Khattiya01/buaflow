'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write, writeJson } = require('./helpers.js');

const hooks = path.join(repositoryRoot, 'claude-setup', 'hooks');

test('guard-bash allows a read-only git command', () => {
  const result = runNode(path.join(hooks, 'guard-bash.js'), {
    input: { tool_input: { command: 'git status --short' } },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

test('guard-bash blocks bypassing commit and push hooks', () => {
  for (const command of ['git commit --no-verify -m unsafe', 'git push --no-verify origin feature']) {
    const result = runNode(path.join(hooks, 'guard-bash.js'), {
      input: { tool_input: { command } },
    });
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /Blocked:/);
  }
});

// EV-009 K-8: `shadcn add` over an existing, customised component deletes the customisation.
// Adding a new component stays allowed; forcing an overwrite does not.
test('guard-bash blocks shadcn add --overwrite and allows adding a new component', () => {
  const run = (command) => runNode(path.join(hooks, 'guard-bash.js'), { input: { tool_input: { command } } });
  for (const command of ['npx shadcn@latest add button --overwrite', 'pnpm dlx shadcn add card -o', 'npx shadcn add dialog -yo']) {
    const result = run(command);
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /does not merge/);
  }
  for (const command of ['npx shadcn@latest add tooltip', 'npx shadcn add sheet -y']) {
    assert.equal(run(command).status, 0, command);
  }
});

test('the default components/ui protection no longer recommends re-running the shadcn CLI over existing files', () => {
  const { DEFAULTS } = require('../stack-config.js');
  const reason = DEFAULTS.protected.find((entry) => entry.pattern === '**/components/ui/**').reason;
  assert.doesNotMatch(reason, /install\/update through the shadcn CLI/);
  assert.match(reason, /never re-run `shadcn add`/);
  assert.match(reason, /remove the pattern/);
});

test('guard-edit reads protected patterns from project stack config', () => {
  const root = temporaryProject();
  try {
    writeJson(path.join(root, '.claude', 'stack.json'), {
      protected: [{ pattern: '**/generated/**', reason: 'Generated file' }],
    });
    const blocked = runNode(path.join(hooks, 'guard-edit.js'), {
      env: { CLAUDE_PROJECT_DIR: root },
      input: { tool_input: { file_path: path.join(root, 'src', 'generated', 'client.js') } },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /Generated file/);

    const allowed = runNode(path.join(hooks, 'guard-edit.js'), {
      env: { CLAUDE_PROJECT_DIR: root },
      input: { tool_input: { file_path: path.join(root, 'src', 'service.js') } },
    });
    assert.equal(allowed.status, 0);
  } finally {
    cleanup(root);
  }
});

// A commit message that *mentions* --no-verify or main blocked the whole command: the argument
// scan crossed newlines into the heredoc body, and quoted text was read as flags.
test('guard-bash reads flags, not commit message text', () => {
  const run = (command) => runNode(path.join(hooks, 'guard-bash.js'), { input: { tool_input: { command } } });
  const allowed = [
    "git add a && git commit -q -F - <<'EOF'\nfix: x\n\nthe hook comment warns this turns into --no-verify\nEOF\ngit push -u origin feat/x",
    'git commit -m "docs: explain why we never use --no-verify"',
    "git commit -F - <<EOF\nnever git push origin main by hand\nEOF",
    "git push origin feat/x\ncat <<'EOF'\n--no-verify\nEOF",
  ];
  for (const command of allowed) assert.equal(run(command).status, 0, command);

  const blocked = [
    'git commit -m "a message with spaces" --no-verify',
    'git commit -n -m x',
    "git add .\ngit push --no-verify",
    "cat <<'EOF' > notes\ntext\nEOF\ngit push --no-verify origin feat/x",
  ];
  for (const command of blocked) assert.equal(run(command).status, 2, command);

  const root = temporaryProject();
  try {
    writeJson(path.join(root, '.claude', 'stack.json'), { mergeMode: 'pr' });
    const runPr = (command) => runNode(path.join(hooks, 'guard-bash.js'), { env: { CLAUDE_PROJECT_DIR: root }, input: { tool_input: { command } } });
    for (const command of ["git push origin 'main'", 'git push origin HEAD:main']) assert.equal(runPr(command).status, 2, command);
  } finally {
    cleanup(root);
  }
});

// mergeMode decides who puts work on main. "pr": a human merges a PR, so the hook blocks merge and
// push into main. "direct" (the default): the AI squash-merges and pushes after /check, and the
// pre-push gate is the check — so force push and --no-verify stay blocked in both modes.
test('guard-bash blocks merging into main only when mergeMode is "pr"', () => {
  const root = temporaryProject();
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    const run = (command) =>
      runNode(path.join(hooks, 'guard-bash.js'), { cwd: root, env: { CLAUDE_PROJECT_DIR: root }, input: { tool_input: { command } } });
    const intoMain = ['git merge --squash feat/T-001-x', 'git push origin HEAD:main', 'git push'];
    const neverAllowed = ['git push --force origin main', 'git push --no-verify origin HEAD:main'];

    for (const command of intoMain) assert.equal(run(command).status, 0, `default (direct): ${command}`);
    for (const command of neverAllowed) assert.equal(run(command).status, 2, `default (direct): ${command}`);

    writeJson(path.join(root, '.claude', 'stack.json'), { mergeMode: 'direct' });
    for (const command of intoMain) assert.equal(run(command).status, 0, `direct: ${command}`);

    writeJson(path.join(root, '.claude', 'stack.json'), { mergeMode: 'pr' });
    for (const command of intoMain) {
      const result = run(command);
      assert.equal(result.status, 2, `pr: ${command}`);
      assert.match(result.stderr, /PR/);
    }
    for (const command of neverAllowed) assert.equal(run(command).status, 2, `pr: ${command}`);
    assert.equal(run('git push -u origin feat/T-001-x').status, 0, 'pr: pushing a feature branch');
  } finally {
    cleanup(root);
  }
});

test('session-context states the guardrail for the configured mergeMode', () => {
  const root = temporaryProject();
  try {
    const guardrail = () => JSON.parse(runNode(path.join(hooks, 'session-context.js'), { cwd: root, env: { CLAUDE_PROJECT_DIR: root } }).stdout)
      .hookSpecificOutput.additionalContext;
    assert.match(guardrail(), /mergeMode "direct"/);
    writeJson(path.join(root, '.claude', 'stack.json'), { mergeMode: 'pr' });
    assert.match(guardrail(), /PR only \(mergeMode "pr"\)/);
  } finally {
    cleanup(root);
  }
});

// guard-edit told the AI to "create a separate new test file" on a bug-fix branch, then blocked
// creating one. Only a test that already exists in git is evidence of the bug.
test('guard-edit on a bug-fix branch blocks tracked tests and allows new ones', () => {
  const root = temporaryProject();
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'fix/bug');
    write(path.join(root, 'tests', 'old.test.js'), 'test\n');
    git('add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
    write(path.join(root, 'tests', 'draft.test.js'), 'test\n');
    const edit = (name) =>
      runNode(path.join(hooks, 'guard-edit.js'), {
        cwd: root,
        env: { CLAUDE_PROJECT_DIR: root },
        input: { tool_input: { file_path: path.join(root, 'tests', name) } },
      });

    const tracked = edit('old.test.js');
    assert.equal(tracked.status, 2);
    assert.match(tracked.stderr, /bug-fix branch/);
    assert.equal(edit('new.test.js').status, 0, 'a file that does not exist yet');
    assert.equal(edit('draft.test.js').status, 0, 'a new file written earlier on this branch, not yet committed');

    git('checkout', '-q', '-b', 'feat/other');
    assert.equal(edit('old.test.js').status, 0, 'outside a bug-fix branch tests stay editable');
  } finally {
    cleanup(root);
  }
});

test('guard-new-component blocks an unregistered raw design decision', () => {
  const root = temporaryProject();
  try {
    write(path.join(root, 'docs', 'design', 'components.md'), '| Component | Status |\n|---|---|\n| Button | ready |\n');
    const blocked = runNode(path.join(hooks, 'guard-new-component.js'), {
      env: { CLAUDE_PROJECT_DIR: root },
      input: {
        tool_input: {
          file_path: path.join(root, 'src', 'components', 'shared', 'PromoCard.tsx'),
          content: '<div className="bg-[#123456]">Promo</div>',
        },
      },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /new design decision/);

    const tokenBased = runNode(path.join(hooks, 'guard-new-component.js'), {
      env: { CLAUDE_PROJECT_DIR: root },
      input: {
        tool_input: {
          file_path: path.join(root, 'src', 'components', 'shared', 'PromoCard.tsx'),
          content: '<div className="bg-primary">Promo</div>',
        },
      },
    });
    assert.equal(tokenBased.status, 0);
  } finally {
    cleanup(root);
  }
});

