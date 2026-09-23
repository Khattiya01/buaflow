# .gitignore ที่ kit ต้องการ — วางที่ root ของโปรเจกต์ (ไม่ต้องมีใน buaflow/)
# หมายเหตุ: ใน .gitignore เครื่องหมาย # เป็น comment เฉพาะต้นบรรทัด ห้ามเขียน comment ท้าย pattern

# ── ของ kit / Claude Code ──────────────────────────────────────────────
# log เต็มของ scripts/verify.mjs (สรุปสั้นอยู่ใน terminal)
.verify.log
.verify-flakes.jsonl
# permissions/hook ส่วนตัว — .claude/settings.json ของทีม commit ปกติ
.claude/settings.local.json
# กติกาส่วนตัวต่อเครื่อง
CLAUDE.local.md
.claude/*.tmp
# ที่ husky generate — .husky/pre-push commit ปกติ
.husky/_/
# SonarQube scanner (ผู้ใช้รันเอง)
.scannerwork/
# generate จาก docs/backlog/tasks/*.md ด้วย node .claude/board.js — ห้าม commit
# (หลายคน/หลาย branch พร้อมกัน = ไฟล์นี้ conflict ทุกครั้งที่ merge ถ้า track ไว้)
docs/backlog/board.md
# docker save จาก /release ตอนยังไม่มี registry
dist/*.tar.gz

# ── ห้ามหลุดเด็ดขาด (settings.json deny ไว้ด้วย แต่ gitignore คือชั้นแรก) ──
.env
.env.*
!.env.example
*.pem
*.key

# ── ทั่วไป (ปรับตาม stack) ─────────────────────────────────────────────
node_modules/
dist/
build/
.next/
out/
coverage/
*.tsbuildinfo
.turbo/
.cache/
.DS_Store
Thumbs.db
*.log

# ── buaflow/ ───────────────────────────────────────────────────────
# ไม่ ignore buaflow/ — เป็นเอกสารของโปรเจกต์ commit ทั้งโฟลเดอร์ (Phase 8 ใช้)
# ถ้าได้มาด้วย git clone ให้ลบ buaflow/.git ทิ้งก่อน ไม่งั้น git จะไม่ track ไฟล์ข้างใน
