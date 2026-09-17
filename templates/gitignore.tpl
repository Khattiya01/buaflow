# ── ของ kit / Claude Code ─────────────────────────────────────────────
.verify.log                 # log เต็มของ scripts/verify.mjs (สรุปสั้นอยู่ใน terminal)
.claude/settings.local.json # permissions/hook ส่วนตัว — settings.json ของทีม commit ปกติ
CLAUDE.local.md             # กติกาส่วนตัวต่อเครื่อง (import ~/.claude/... ได้)
.claude/*.tmp
.husky/_/                   # ที่ husky generate — .husky/pre-push commit ปกติ
.scannerwork/               # SonarQube scanner (ผู้ใช้รันเอง)
dist/*.tar.gz               # docker save จาก /release เมื่อยังไม่มี registry

# ── ห้ามหลุดเด็ดขาด (settings.json deny ไว้ด้วย แต่ gitignore คือชั้นแรก) ──
.env
.env.*
!.env.example
*.pem
*.key

# ── ทั่วไป (ปรับตาม stack) ────────────────────────────────────────────
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
!.verify.log.example

# ── ถ้า project-kit/ เป็น git clone ซ้อนอยู่ในโปรเจกต์ ─────────────────
# ห้ามมี .git ซ้อน — เลือกอย่างใดอย่างหนึ่ง:
#   (ก) คัดลอกเฉพาะไฟล์ (ไม่มี project-kit/.git)  → commit project-kit/ ทั้งโฟลเดอร์ปกติ (Phase 8 ใช้)
#   (ข) git submodule add <url> project-kit           → git จัดการเอง ไม่ต้อง ignore
# ไม่ ignore project-kit/ — มันคือเอกสารของโปรเจกต์ ไม่ใช่ build output
