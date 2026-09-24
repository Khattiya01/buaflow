#!/usr/bin/env node
/**
 * usage-capture hook — บันทึก event การใช้งาน Buaflow ลงเครื่อง เมื่อโปรเจกต์ยินยอมแล้วเท่านั้น (EV-011)
 *
 *   SessionStart  อัปเดต marker ของ model · reconcile สิ่งที่เปลี่ยนนอก session · แจ้ง 1 บรรทัดว่ากำลังเก็บ
 *   PostToolUse   (Write|Edit|MultiEdit) ไฟล์ใน docs/intents, docs/plans, docs/backlog/tasks → event
 *   PreToolUse    (Bash) อัปเดต marker เท่านั้น ให้ `buaflow usage record` รู้ว่า session ไหนใช้ model อะไร
 *
 * ยังไม่ยินยอม = อ่านไฟล์ยินยอมแล้วออก ไม่สร้างไฟล์หรือโฟลเดอร์ใด ๆ
 * ทุกกรณีล้มเหลว exit 0 — การเก็บข้อมูลห้ามขวางงาน (R7)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// .claude/hooks/ → .claude/usage.js · plugin hooks/ → kit/claude-setup/usage.js
function loadUsage() {
  for (const candidate of [path.join(__dirname, '..', 'usage.js'), path.join(__dirname, '..', 'kit', 'claude-setup', 'usage.js')]) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  return null;
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const usage = loadUsage();
  if (!usage) return;
  // input.cwd before CLAUDE_PROJECT_DIR: a session inside a worktree must record against that worktree.
  const root = input.cwd || process.cwd();
  const consent = usage.readConsent(root).state;
  const notice = input.hook_event_name === 'SessionStart' ? usage.sessionNotice(consent) : null;
  if (consent === 'enabled') {
    try { usage.handleHook(root, input); } catch { /* the notice below still goes out */ }
  }
  if (notice) {
    process.stdout.write(JSON.stringify({
      systemMessage: notice,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: notice },
    }));
  }
}

try { main(); } catch { /* ห้ามทำให้ session หรือ tool call ล้มเพราะเก็บข้อมูลไม่ได้ */ }
process.exit(0);
