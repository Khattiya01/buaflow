---
description: ทำ spec ของ feature ใหญ่ (requirements → design → tasks)
argument-hint: "<F-xx หรือชื่อ feature>"
---

ทำ spec สำหรับ: $ARGUMENTS

ใช้โครงจาก `docs/templates/spec.tpl.md` เก็บที่ `docs/specs/<F-xx>-<ชื่อ>/`

## กฎ
- **ทำทีละไฟล์ และให้ผู้ใช้อนุมัติก่อนไปไฟล์ถัดไป** ห้ามเขียนรวด 3 ไฟล์
- **ห้ามเขียนโค้ดจนกว่าจะอนุมัติครบทั้ง 3 ไฟล์**
- อ่าน `docs/planning/01-requirements.md` และ `04-architecture.md` ก่อนเริ่ม

## ขั้นที่ 1 — requirements.md
เขียน user story, กติกาธุรกิจ, acceptance criteria แบบ Given/When/Then,
กรณีขอบ, สิทธิ์การเข้าถึง, และ **สิ่งที่ไม่ทำในรอบนี้**

จบแล้วถาม: "AC ครบไหม มีกรณีไหนที่ผมมองข้าม" → **หยุดรออนุมัติ**

## ขั้นที่ 2 — design.md
หลังอนุมัติขั้น 1 แล้วเท่านั้น
- การเปลี่ยน DB + migration + rollback
- API contract (path, request, response, error code, สิทธิ์)
- UI: หน้าที่กระทบ, component ที่ใช้ (**ระบุว่ามีแล้ว / จาก shadcn / ต้องสร้างใหม่**),
  i18n key ที่ต้องเพิ่ม, สถานะ loading/empty/error
- ผลกระทบต่อของเดิม, breaking change ไหม
- ความปลอดภัย, แผนการทดสอบ
- ทางเลือกที่พิจารณาแล้วไม่เอา

ถ้ามี component ใหม่ที่ยังไม่มี design → **ถามผู้ใช้ตาม `ui-component-rules.md`**

จบแล้ว **หยุดรออนุมัติ**

## ขั้นที่ 3 — tasks.md
หลังอนุมัติขั้น 2 แล้วเท่านั้น
- แตกเป็น task ที่ **ทำจบได้ใน 1 session** พร้อม dependency และ AC ที่ครอบ
- backend task รวม unit test ในตัว
- frontend task ต้องมี task `-test` คู่ (สถานะ blocked)
- อย่าลืม task อัปเดต OpenAPI / Postman

แล้ว:
1. สร้างไฟล์ `docs/backlog/tasks/T-xxx.md` ทุกตัว
2. เพิ่มลง `docs/backlog/board.md`
3. อัปเดต `docs/backlog/import.csv`
4. เสนอ task แรกที่ควรทำ
