---
id: T-000
title: <ชื่องานสั้นๆ ที่อ่านแล้วรู้ว่าทำอะไร>
type: feat | fix | hotfix | refactor | test | docs | chore | perf | security | ui
epic: E-01
feature: F-01
milestone: M1
status: backlog | todo | in-progress | review | done | blocked
priority: P0 | P1 | P2 | P3
estimate: 0.5 | 1 | 2 | 3   # หน่วยเป็น session ของ AI
depends_on: [T-000]
intent: docs/intents/I-000-....md   # ถ้ามี
spec: docs/specs/<feature>/         # ถ้ามี
plan: docs/plans/T-000.md           # เติมเมื่อทำ plan แล้ว
branch: feat/T-000-xxx
assignee: <คน หรือ AI>
---

## ทำอะไร
<2-4 บรรทัด ให้คนที่ไม่เคยเห็นงานนี้อ่านแล้วเข้าใจ>

## ทำไมต้องทำ
<คุณค่าทางธุรกิจ หรือปัญหาที่แก้>

## Acceptance Criteria
- [ ] **AC-1** Given ... When ... Then ...
- [ ] **AC-2** ...

> ถ้ามีเกิน 7 ข้อ แปลว่า task ใหญ่เกินไป → แตกเป็นหลาย task

## ขอบเขต
**ทำ:**
- ...

**ไม่ทำ (รอบนี้):**
- ...

## ไฟล์ที่คาดว่าจะแตะ
- ...

> ถ้าเกิน ~10 ไฟล์ → แตก task

## หมายเหตุทางเทคนิค
- ข้อควรระวัง / pattern ที่ต้องตาม / ของเดิมที่เกี่ยวข้อง
- ถ้าเป็น UI: ระบุ component ที่จะใช้ และตอบแล้วหรือยังว่าเป็น shared หรือไม่

## Proof — อะไรพิสูจน์ว่าเสร็จ
> ห้ามเว้นว่าง ถ้าเขียนไม่ได้แปลว่ายังไม่เข้าใจงานดีพอ
> ตอนปิดงานต้อง **แปะผลลัพธ์จริง** ของข้อเหล่านี้ ไม่ใช่แค่ติ๊ก

- [ ] `pnpm verify` ผ่าน
- [ ] เทส `<ไฟล์เทส>` ครอบ AC-x (backend: มาพร้อม task นี้ / frontend: อยู่ใน task `-test`)
- [ ] ยิงจริง: `<คำสั่ง / endpoint / หน้าจอ>` → ได้ `<ผลลัพธ์ที่คาด>`

## วิธีทดสอบด้วยมือ
1. <ขั้นตอนที่ทำแล้วเห็นว่าใช้ได้จริง>
2. ...

## Definition of Done
ดู `docs/standards/definition-of-done.md` — ใช้หมวด: <backend | frontend | hotfix>

- [ ] typecheck / lint / test ผ่าน
- [ ] ผ่าน review และคนอนุมัติแล้ว
- [ ] เอกสารที่เกี่ยวข้องอัปเดตแล้ว
- [ ] board อัปเดตแล้ว

## บันทึกระหว่างทำ
<!-- AI เขียนที่นี่: ตัดสินใจอะไร ทำไม เจออะไรที่ไม่คาดคิด -->

## ถ้าเป็น blocked
- ติดอะไร:
- รออะไร/รอใคร:
- เริ่มบล็อกเมื่อ:
