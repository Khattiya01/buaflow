'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
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

