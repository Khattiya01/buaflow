---
name: done
description: ปิด task ที่ผ่าน review และผู้ใช้อนุมัติแล้ว merge อัปเดตกระดาน ปลดล็อกงานที่รออยู่ และป้อนบทเรียนกลับเข้า config
argument-hint: "[T-xxx]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash(git *) Bash(pnpm *)
---

ปิดงาน: $ARGUMENTS

## เช็กก่อนปิด

- [ ] ผ่าน `/review` แล้ว และ **ผู้ใช้อนุมัติแล้ว**
- [ ] `pnpm verify` ผ่าน (รันซ้ำอีกครั้งให้แน่ใจ แล้วแปะผล)
- [ ] Proof ที่ระบุไว้ใน plan/task ทำครบและแสดงผลแล้ว
- [ ] Definition of Done ครบทุกข้อ

ถ้ายังไม่ครบ → บอกว่าขาดอะไร แล้วหยุด **อย่าปิดงานที่ยังไม่เสร็จ**

## ขั้นตอน

### 1. Merge
- squash merge เข้า `main`
- ข้อความ commit เป็น Conventional Commit และอ้าง task id
- ลบ branch

### 2. อัปเดต backlog
- `docs/backlog/board.md`: ย้าย task ไปหมวด Done พร้อมวันที่และ commit hash
- `docs/backlog/tasks/<ID>.md`: เปลี่ยน `status: done` และเติมส่วน "บันทึกระหว่างทำ"
- `docs/backlog/import.csv`: อัปเดตสถานะ

### 3. ปลดล็อกงานที่รออยู่
- หา task ที่ `depends_on` ตัวนี้ แล้วย้ายจาก `blocked` เป็น `todo`
- **ถ้าเป็น frontend task → ปลดล็อก task `T-xxx-test`** ให้เขียน unit test ได้แล้ว
  (UI นิ่งแล้ว) แล้วบอกผู้ใช้ว่ามี task test รออยู่

### 4. ตรวจเอกสาร
- spec / OpenAPI / README / `docs/design/components.md` อัปเดตแล้วหรือยัง
- ถ้ามีการตัดสินใจเชิงสถาปัตยกรรมระหว่างทาง → เขียน ADR
- ถ้า diff ต่างจาก `plan.md` อย่างมีนัย → อัปเดต plan.md ให้ตรงกับของจริงก่อนปิด
  (plan ที่โกหกจะทำให้รอบหน้าประเมินผิด)
- ถ้า intent ต้นทางปิดครบแล้ว → อัปเดตสถานะ intent ด้วย

### 5. ป้อนกลับเข้า config (ห้ามข้าม)

ถามตัวเอง 3 ข้อ แล้วเสนอผู้ใช้:

| เจออะไรระหว่างทำ | ควรไปอยู่ที่ไหน |
|---|---|
| AI พลาดเรื่องเดิม **เป็นครั้งที่ 2** | `AGENTS.md` หมวด "สิ่งที่ AI ในโปรเจกต์นี้เคยทำผิด" |
| กฎที่ห้ามพังและเคยพังแล้ว | rule ใน `.claude/rules/` หรือ hook |
| เรื่องที่ถ้าหลุดไป prd จะเจ็บ | eval ใน `docs/evals/` |

ถ้าไม่มีอะไรเข้าเกณฑ์ ให้บอกตรง ๆ ว่าไม่มี อย่าหาเรื่องมาเติม

### 6. สรุปและเสนอถัดไป
- สรุปสั้น ๆ ว่าปิดอะไรไป
- ความคืบหน้าของ milestone (เสร็จกี่ task จากทั้งหมด)
- เสนอ task ถัดไปที่ควรทำ 2-3 ตัว พร้อมเหตุผล
- ถ้าปิด milestone ครบแล้ว → เตือนให้รัน SonarQube และตรวจ DoD ของ milestone แล้วดู `/release`
