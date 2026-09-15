---
name: spec
description: ทำ spec ของ feature ใหญ่ แยกเป็น requirements design tasks พร้อม gate อนุมัติระหว่างขั้น ใช้เมื่อ intent ถูกอนุมัติแล้วและงานใหญ่พอที่จะต้องมี spec
argument-hint: "<F-xx หรือชื่อ feature>"
allowed-tools: Read Glob Grep Write
---

ทำ spec สำหรับ: $ARGUMENTS

ใช้โครงจาก `docs/templates/spec.tpl.md` เก็บที่ `docs/specs/<F-xx>-<ชื่อ>/`

## กฎเหล็กของขั้นนี้

- **ทำทีละไฟล์ และให้ผู้ใช้อนุมัติก่อนไปไฟล์ถัดไป** ห้ามเขียนรวด 3 ไฟล์
- **ห้ามเขียนโค้ดจนกว่าจะอนุมัติครบทั้ง 3 ไฟล์**
- **ห้ามเดา** จุดไหนไม่ชัดให้ใส่ `[NEEDS CLARIFICATION: <คำถาม>]` แล้วรวมไว้ท้ายไฟล์
  ไฟล์ที่ยังเหลือ marker **ผ่าน gate ไม่ได้**
- ทุกครั้งที่เสนอทางเลือก ต้องแนะนำ 1 ทางพร้อมเหตุผลและ trade-off

## ก่อนเริ่ม

อ่านให้ครบ:
- `docs/intents/I-0xx-*.md` ที่เป็นต้นทางของ feature นี้ (ถ้าไม่มี intent → กลับไปทำ `/intent` ก่อน)
- `docs/constitution.md`
- `docs/planning/01-requirements.md` และ `04-architecture.md`
- spec ของ feature ที่ใกล้เคียงที่ทำไปแล้ว — **ทำตาม pattern เดิม**

## ขั้นที่ 1 — requirements.md

เขียน user story, กติกาธุรกิจ, **acceptance criteria แบบ EARS**, กรณีขอบ, สิทธิ์การเข้าถึง,
non-functional ที่วัดได้, และ **สิ่งที่ไม่ทำในรอบนี้**

EARS ใช้ 4 รูปประโยคนี้เท่านั้น:

```
WHEN <เหตุการณ์> THE SYSTEM SHALL <ทำอะไร>
WHILE <สถานะ> THE SYSTEM SHALL <ทำอะไร>
IF <เงื่อนไข> THEN THE SYSTEM SHALL <ทำอะไร>
THE SYSTEM SHALL <ทำอะไร>
```

> ห้ามเขียน "จัดการ error ให้ดี" หรือ "ใช้งานลื่นไหล" เพราะเทสไม่ได้
> ทุก AC ต้องแปลงเป็นชื่อเทสได้ตรง ๆ

จบแล้วรายงาน gate:
- ไม่เหลือ [NEEDS CLARIFICATION] กี่ข้อ (ถ้าเหลือ ต้องถามให้ครบก่อน)
- AC ทุกข้อเป็น EARS แล้ว
- มีเกณฑ์วัดความสำเร็จที่เป็นรูปธรรม

แล้วถาม: "AC ครบไหม มีกรณีไหนที่ผมมองข้าม" → **หยุดรออนุมัติ**

## ขั้นที่ 2 — design.md

หลังอนุมัติขั้น 1 แล้วเท่านั้น

1. **ตรวจกับธรรมนูญก่อนออกแบบ** — มาตรา 4 (เล็กก่อน), 5 (ไม่ห่อเกิน), 6 (สัญญามาก่อน)
   ถ้าจะเพิ่ม dependency ใหม่ ต้องอธิบายว่าของเดิมทำไมไม่พอ
2. การเปลี่ยน DB + migration + **rollback** (destructive change ต้องเป็น expand/contract)
3. API contract (path, request, response, error code, สิทธิ์)
4. UI: หน้าที่กระทบ, component ที่ใช้ (**ระบุว่ามีแล้ว / จาก shadcn / ต้องสร้างใหม่**),
   i18n key ที่ต้องเพิ่ม, สถานะ loading/empty/error
5. ผลกระทบต่อของเดิม, breaking change ไหม
6. ความปลอดภัย
7. **แผนการทดสอบที่ map กับ AC ทีละข้อ** — AC ไหนไม่มีวิธีพิสูจน์ แปลว่า AC ข้อนั้นเขียนไม่ดีพอ
8. ทางเลือกที่พิจารณาแล้วไม่เอา

ถ้ามี component ใหม่ที่ยังไม่มี design → **ถามผู้ใช้ตาม `ui-component-rules.md`**

จบแล้วรายงาน gate แล้ว **หยุดรออนุมัติ**

## ขั้นที่ 3 — tasks.md

หลังอนุมัติขั้น 2 แล้วเท่านั้น

- แตกเป็น task ที่ **ทำจบได้ใน 1 session** พร้อม dependency และ AC ที่ครอบ
- backend task รวม unit test ในตัว
- frontend task ต้องมี task `-test` คู่ (สถานะ blocked)
- ใส่ `[P]` กับ task ที่สลับลำดับกันได้
- อย่าลืม task อัปเดต OpenAPI / Postman
- **ตรวจว่าทุก AC มี task รองรับ** — ตาราง "AC ที่ยังไม่มี task รองรับ" ต้องว่าง

แล้ว:
1. สร้างไฟล์ `docs/backlog/tasks/T-xxx.md` ทุกตัว (เติม `intent:` และ `spec:` ให้ครบ)
2. เพิ่มลง `docs/backlog/board.md`
3. อัปเดต `docs/backlog/import.csv`
4. อัปเดต intent ต้นทางเป็น `status: accepted` พร้อมลิงก์มาที่ spec นี้
5. เสนอ task แรกที่ควรทำ พร้อมบอกว่าควรทำ `/plan` ก่อนไหม
