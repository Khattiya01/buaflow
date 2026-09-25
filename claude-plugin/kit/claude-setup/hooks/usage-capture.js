#!/usr/bin/env node
/**
 * usage-capture hook — บันทึก event การใช้งาน Buaflow ลงเครื่อง เมื่อโปรเจกต์ยินยอมแล้วเท่านั้น (EV-011)
 *
 *   SessionStart  อัปเดต marker ของ model · reconcile สิ่งที่เปลี่ยนนอก session · แจ้งผู้ใช้ 1 บรรทัดว่ากำลังเก็บ (systemMessage ไม่เข้า context)
 *   PostToolUse   (Write|Edit|MultiEdit) ไฟล์ใน docs/intents, docs/plans, docs/backlog/tasks → event
 *   PreToolUse    (Bash) อัปเดต marker เท่านั้น ให้ `buaflow usage record` รู้ว่า session ไหนใช้ model อะไร
 *   SessionEnd    เริ่ม sync เบื้องหลัง (SessionStart ก็เริ่มด้วย) เมื่อเครื่องนี้ตั้งค่าที่เก็บกลางแล้ว
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
  let input;
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const usage = loadUsage();
  if (!usage) return;
  // Not CLAUDE_PROJECT_DIR: a session inside a worktree must record against that worktree. The cwd follows
  // every `cd`, so walk up to the folder that holds .git — and resolve a relative file_path from where the session is.
  const cwd = input.cwd || process.cwd();
  const root = usage.projectRoot(cwd);
  const consent = usage.readConsent(root).state;
  if (consent === 'enabled') {
    const filePath = input.tool_input?.file_path;
    const resolved = typeof filePath === 'string' && filePath ? { ...input, tool_input: { ...input.tool_input, file_path: path.resolve(cwd, filePath) } } : input;
    try { usage.handleHook(root, resolved); } catch { /* the notice below still goes out */ }
  }
  const notice = input.hook_event_name === 'SessionStart' ? usage.sessionNotice(consent, root) : null;
  // systemMessage only, never additionalContext: every notice is addressed to the person (how to opt out,
  // how to set the store up, how many events are waiting). The model cannot act on any of it, so putting it
  // in context bills Thai prose every session for nothing.
  if (notice) process.stdout.write(JSON.stringify({ systemMessage: notice }));
}

try { main(); } catch { /* ห้ามทำให้ session หรือ tool call ล้มเพราะเก็บข้อมูลไม่ได้ */ }
process.exit(0);
