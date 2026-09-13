---
description: ปิด task ที่ผ่าน review แล้ว และอัปเดตกระดาน
argument-hint: "[T-xxx]"
---

ปิดงาน: $ARGUMENTS

## เช็กก่อนปิด
- [ ] ผ่าน `/review` แล้ว และ **ผู้ใช้อนุมัติแล้ว**
- [ ] typecheck / lint / test ผ่าน (รันซ้ำอีกครั้งให้แน่ใจ)
- [ ] Definition of Done ครบทุกข้อ

ถ้ายังไม่ครบ → บอกว่าขาดอะไร แล้วหยุด อย่าปิดงานที่ยังไม่เสร็จ

## ขั้นตอน

1. **Merge**
   - squash merge เข้า `main`
   - ข้อความ commit เป็น Conventional Commit และอ้าง task id
   - ลบ branch

2. **อัปเดต backlog**
   - `docs/backlog/board.md`: ย้าย task ไปหมวด Done พร้อมวันที่และ commit hash
   - `docs/backlog/tasks/<ID>.md`: เปลี่ยน `status: done` และเติมส่วน "บันทึกระหว่างทำ"
   - `docs/backlog/import.csv`: อัปเดตสถานะ

3. **ปลดล็อกงานที่รออยู่**
   - หา task ที่ `depends_on` ตัวนี้ แล้วย้ายจาก `blocked` เป็น `todo`
   - **ถ้าเป็น frontend task → ปลดล็อก task `T-xxx-test`** ให้เขียน unit test ได้แล้ว
     (UI นิ่งแล้ว) แล้วบอกผู้ใช้ว่ามี task test รออยู่

4. **ตรวจเอกสาร**
   - spec / OpenAPI / README / `docs/design/components.md` อัปเดตแล้วหรือยัง
   - ถ้ามีการตัดสินใจเชิงสถาปัตยกรรมระหว่างทาง → เขียน ADR

5. **สรุปและเสนอถัดไป**
   - สรุปสั้นๆ ว่าปิดอะไรไป
   - ความคืบหน้าของ milestone (เสร็จกี่ task จากทั้งหมด)
   - เสนอ task ถัดไปที่ควรทำ 2-3 ตัว พร้อมเหตุผล
   - ถ้าปิด milestone ครบแล้ว → เตือนให้รัน SonarQube และตรวจ DoD ของ milestone
