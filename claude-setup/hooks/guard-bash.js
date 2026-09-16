#!/usr/bin/env node
/**
 * PreToolUse hook — กันคำสั่งที่ห้ามรัน
 *
 * บล็อก:
 *   - git commit --no-verify / -n      ข้าม hook ของ husky (commitlint, lint-staged)
 *   - sonar-scanner / pnpm sonar        ผู้ใช้เป็นคนรันเอง ตามที่ตกลงไว้
 *   - git push --force ไปที่ main/master
 *   - git checkout/restore . แบบทิ้งงานทั้ง working tree
 *   - git merge / git push ที่ปลายทางเป็น main   AI ไม่ merge งานตัวเอง (ธรรมนูญมาตรา 7) — เปิด PR แทน
 *   - git push --no-verify                       ข้าม pre-push gate
 *
 * ข้อจำกัดที่ต้องรู้: นี่คือ regex กันอุบัติเหตุของ AI เอง เลี่ยงได้ด้วยตัวแปร/subshell
 * มันไม่ใช่ security boundary — ของที่ต้องกันจริงให้ใช้ branch protection บน git host + CI gate
 *
 * exit 2 = บล็อก | exit 0 = ผ่าน
 */
const { execSync } = require('node:child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MAIN = /\b(main|master)\b/;

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const RULES = [
  {
    // git merge <อะไรก็ตาม> ขณะยืนอยู่บน main = เอางานเข้า main โดยไม่ผ่าน PR
    match: (cmd) => /\bgit\s+merge\b/.test(cmd) && MAIN.test(currentBranch()),
    reason: [
      'Blocked: no local merge into main — the AI does not merge its own work (constitution art. 7).',
      'Correct path: push the branch and open a PR (`gh pr create` / `glab mr create`) for a human to merge after the gate passes.',
      'Solo developer: still open the PR — the human merges in the UI after reading the summary (10 seconds, and it records who approved).',
    ].join('\n'),
  },
  {
    // git push origin main / git push origin HEAD:main / git push ขณะอยู่บน main
    match: (cmd) =>
      /\bgit\s+push\b/.test(cmd) &&
      !/--force|-f\b/.test(cmd) && // เคส force มีกฎของตัวเองด้านล่าง
      (/\bgit\s+push\b[^|;&]*(:|\s)(main|master)\b/.test(cmd) || (!/\bgit\s+push\b[^|;&]*\s\S+\s+\S+/.test(cmd) && MAIN.test(currentBranch()))),
    reason: [
      'Blocked: no direct push to main — main only accepts changes through a PR + gate.',
      'Correct path: `git push -u origin <current branch>` then open a PR.',
    ].join('\n'),
  },
  {
    match: /\bgit\s+push\b[^|;&]*--no-verify/,
    reason: 'Blocked: push --no-verify — pre-push runs the gate (verify + docs-lint). If it fails, fix the cause; do not skip it.',
  },
  {
    match: /\bgit\s+commit\b[^|;&]*(--no-verify|\s-n\b)/,
    reason: [
      'Blocked: --no-verify — the git hooks (commitlint / lint-staged) exist to keep bad changes out of the repo.',
      'If a hook rejects the commit, fix the cause; do not skip the check.',
      'If you are truly stuck, stop and tell the user what the hook reported.',
    ].join('\n'),
  },
  {
    match: /\b(sonar-scanner|sonar\.sh)\b|\b(pnpm|npm|yarn)\s+(run\s+)?sonar\b/,
    reason: [
      'Blocked: the AI does not run the SonarQube scan — the user runs it and hands over the results.',
      'What you may do: prepare sonar-project.properties, generate coverage/lcov.info,',
      'then tell the user the scan is ready to run.',
    ].join('\n'),
  },
  {
    match: /\bgit\s+push\b[^|;&]*(--force|-f\b)[^|;&]*\b(main|master)\b/,
    reason: 'Blocked: force push to main/master — if it is truly necessary, the user must do it themselves.',
  },
  {
    match: /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/,
    reason: [
      'Blocked: this discards every uncommitted change in the working tree.',
      'To revert a file, name that file path explicitly and tell the user first.',
    ].join('\n'),
  },
];

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }
  if (!cmd) process.exit(0);

  for (const rule of RULES) {
    const hit = typeof rule.match === 'function' ? rule.match(cmd) : rule.match.test(cmd);
    if (hit) {
      process.stderr.write(`[hook: guard-bash] ${rule.reason}\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
