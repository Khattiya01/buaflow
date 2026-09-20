#!/usr/bin/env sh
# .husky/post-merge — รันหลัง `git merge` ทุกครั้ง (รวม `git pull` = fetch + merge)
# ติดตั้ง: คัดลอกไป .husky/post-merge
#
# docs/backlog/board.md ไม่ commit ใน git ตั้งแต่ v2.3.3 (generate ทับกันเองแล้ว conflict
# ทุกครั้งที่มีหลาย PR พร้อมกัน) — hook นี้ทำให้พอ pull เอา task ที่คนอื่นปิดจบเข้ามา
# เห็นสถานะล่าสุดทันทีโดยไม่ต้องเปิด Claude Code ก่อน หรือรัน node .claude/board.js เอง
node .claude/board.js >/dev/null 2>&1 || true
