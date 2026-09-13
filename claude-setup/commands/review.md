---
description: รีวิวงานที่เพิ่งทำ ก่อนย้ายไปสถานะ review
---

## 1. รันของจริงก่อน
```
pnpm typecheck && pnpm lint && pnpm test
```
ถ้าข้อไหนไม่ผ่าน → **หยุด แก้ก่อน** อย่ารีวิวโค้ดที่ยังพัง

## 2. ตรวจ Definition of Done
เปิด `docs/standards/definition-of-done.md` หมวดที่ตรงกับประเภทงาน
ไล่ **ทีละข้อ** แล้วรายงานตามจริงว่าข้อไหนผ่าน ข้อไหนไม่ผ่าน

## 3. ให้ subagent ตรวจ diff
เรียก subagent `code-reviewer` ตรวจ diff ของ branch นี้
แล้วจัดลำดับสิ่งที่เจอเป็น: **ต้องแก้ก่อน merge** / **ควรแก้** / **แค่ข้อสังเกต**

## 4. ตรวจเพิ่มตามประเภทงาน

**ถ้าแตะ backend/API:**
- [ ] validate input ครบทุกทางเข้า
- [ ] ตรวจสิทธิ์ที่ server และตรวจ ownership ของ record
- [ ] error ตอบตาม envelope กลาง พร้อม code
- [ ] มี unit test มาพร้อมแล้ว และ coverage ไม่ลดลง
- [ ] อัปเดต OpenAPI + Postman แล้ว
- [ ] ไม่ log ข้อมูลอ่อนไหว
- [ ] ไล่ดู query ที่อาจเป็น N+1 หรือขาด index

**ถ้าแตะ UI:**
- [ ] ไม่มีข้อความ hardcode และมี key ครบ th + en
- [ ] ไม่มีสี/ขนาดดิบ
- [ ] ครบทุกสถานะ loading/empty/error
- [ ] responsive, light/dark, a11y พื้นฐาน
- [ ] ประเมินเรื่อง shared component แล้วและบันทึกใน `docs/design/components.md`
- [ ] สร้าง task `-test` แล้ว

**ถ้าแตะ DB:**
- [ ] migration รันขึ้นได้และมีแผน rollback
- [ ] ถ้าเป็น destructive change ได้ทำแบบ expand/contract หรือยัง
- [ ] อัปเดต seed ถ้าจำเป็น

## 5. ตรวจของที่มักหลุด
- [ ] ไม่มี secret / ค่า hardcode ที่ควรอยู่ใน env
- [ ] ไม่มี `console.log` หรือโค้ด debug ค้าง
- [ ] ไม่มีไฟล์ที่ไม่ควร commit หลุดเข้ามา
- [ ] commit message ถูกรูปแบบและอ้าง task id

## 6. สรุปให้ผู้ใช้ตัดสินใจ
รายงานเป็น:
- **สิ่งที่ทำไปทั้งหมด** (สรุปจาก diff)
- **ผลการตรวจ** ผ่าน/ไม่ผ่านข้อไหน
- **สิ่งที่ต้องแก้ก่อน merge**
- **สิ่งที่ควรเปิดเป็น task แยก**

แล้วถามว่าให้แก้เลยไหม หรืออนุมัติเพื่อไป `/done`

> **AI ไม่อนุมัติงานตัวเอง** คนเป็นผู้ตัดสินใจเสมอ
