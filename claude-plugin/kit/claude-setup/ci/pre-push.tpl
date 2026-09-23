#!/usr/bin/env sh
# .husky/pre-push — ด่านเดียวกับ CI รันก่อน push ทุกครั้ง
# ติดตั้ง: คัดลอกไป .husky/pre-push แล้ว chmod +x (บน Windows git จัดการเอง)
#
# ถ้า verify ช้าเกิน ~30 วิ จนคนเริ่มใช้ --no-verify ตอน push → ถือเป็นบั๊กของ verify ไม่ใช่ของ hook
# (guard-bash.js บล็อก --no-verify ของ AI อยู่แล้ว แต่คนทำได้ — จึงต้องให้เร็วพอที่จะไม่อยากข้าม)
node .claude/gate.js
