#!/usr/bin/env sh
# .husky/post-checkout — รันหลัง `git checkout`/`git switch` สลับ branch (และหลัง clone ครั้งแรก)
# ติดตั้ง: คัดลอกไป .husky/post-checkout
#
# เหตุผลเดียวกับ .husky/post-merge — board.md ไม่ commit ใน git ตั้งแต่ v2.3.3 แต่ละ branch
# มีไฟล์ docs/backlog/tasks/*.md ต่างกันได้ ($3 = 1 เฉพาะตอนสลับ branch จริง ไม่ใช่แค่ checkout ไฟล์)
if [ "$3" = "1" ]; then
  node .claude/board.js >/dev/null 2>&1 || true
fi
