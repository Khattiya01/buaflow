'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { cleanup, repositoryRoot, runNode, temporaryProject, write } = require('./helpers.js');

const script = path.join(repositoryRoot, 'claude-setup', 'check-config.js');

function lineAbout(root, claudeMd) {
  write(path.join(root, 'CLAUDE.md'), claudeMd);
  const result = runNode(script, { args: [root] });
  return result.stdout.split(/\r?\n/).find((line) => /CLAUDE\.md/.test(line) && /AGENTS\.md/.test(line)) || '';
}

// EV-009 K-6: the first outside trial had a well-kept 153-line CLAUDE.md. The old message read
// as "CLAUDE.md must be a thin layer", which for a brownfield project is an order to tear it
// down. The only real requirement is that AGENTS.md is imported first.
test('CLAUDE.md: imported first passes, imported later warns, missing tells you to prepend and keep the rest', () => {
  const root = temporaryProject('buaflow-check-config-');
  try {
    assert.match(lineAbout(root, '@AGENTS.md\n\n# Project notes\n'), /^\s+ok\s/);

    const later = lineAbout(root, '# Existing guide\n\n@AGENTS.md\n');
    assert.match(later, /^\s+warn\s/);
    assert.match(later, /บรรทัด 3/);

    const missing = lineAbout(root, '# 153 lines the team maintains\n\n- rule one\n');
    assert.match(missing, /^\s+FAIL\s/);
    assert.match(missing, /เนื้อหาเดิมเก็บไว้ได้ทั้งหมด/);
  } finally {
    cleanup(root);
  }
});
