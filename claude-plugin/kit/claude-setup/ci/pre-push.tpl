#!/usr/bin/env sh
# .husky/pre-push — ด่านเดียวกับ CI รันก่อน push ทุกครั้ง
# ติดตั้ง: คัดลอกไป .husky/pre-push แล้ว chmod +x (บน Windows git จัดการเอง)
#
# ถ้า verify ช้าเกิน ~30 วิ จนคนเริ่มใช้ --no-verify ตอน push → ถือเป็นบั๊กของ verify ไม่ใช่ของ hook
# (guard-bash.js บล็อก --no-verify ของ AI อยู่แล้ว แต่คนทำได้ — จึงต้องให้เร็วพอที่จะไม่อยากข้าม)
#
# push ที่ลบ branch/tag อย่างเดียว (git push origin --delete x) ไม่ส่งโค้ดขึ้นไป จึงไม่มีอะไรให้ตรวจ —
# git ส่ง "<local ref> <local sha> <remote ref> <remote sha>" มาทาง stdin และ local sha ของการลบเป็นศูนย์ล้วน
# ข้าม gate เฉพาะเมื่อ "ทุก" ref เป็นการลบ · push ที่ปนโค้ดมาด้วยยังรัน gate ครบเหมือนเดิม
deletes=0
pushes=0
while read -r local_ref local_sha remote_ref remote_sha || [ -n "$local_sha" ]; do
  case "$local_sha" in
    *[!0]*) pushes=1 ;;
    ?*) deletes=1 ;;
  esac
done
if [ "$deletes" = 1 ] && [ "$pushes" = 0 ]; then
  echo "pre-push: ลบ ref อย่างเดียว ไม่มีโค้ดขึ้นไป — ข้าม gate"
  exit 0
fi
node .claude/gate.js
