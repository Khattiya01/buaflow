# Phase 7 — ส่งมอบ (Handoff) และเลิกใช้ kit

> เป้าหมาย: แปลงทุกอย่างที่วางแผนไว้ให้กลายเป็น "ไฟล์ถาวร" ที่ Claude อ่านทุก session
> หลังจบ Phase นี้ **ไม่ต้องใช้ `project-kit/` อีกแล้ว**

---

## 7.1 สร้าง `CLAUDE.md` (สำคัญที่สุด)

ใช้ `project-kit/templates/CLAUDE.md.tpl` เป็นโครง แล้วเติมค่าจริงจาก Phase 1–6

**กติกาการเขียน CLAUDE.md:**
- **สั้นและเป็นคำสั่ง** ไม่ใช่เอกสารอ้างอิง — เป้าหมายคือให้ Claude ทำถูกโดยไม่ต้องอ่านเยอะ
- ยาวไม่เกิน ~200 บรรทัด รายละเอียดให้ **ลิงก์ไป `docs/`** แทนการยัดเข้ามา
- เขียนเฉพาะสิ่งที่ **ถ้าไม่บอกแล้ว Claude จะทำผิด** อย่าเขียนสิ่งที่เดาได้เอง
- ใส่กติกาที่ต้องบังคับจริงๆ: การถามก่อนสร้าง UI component, i18n, theme token,
  DoD ของ backend/frontend, commit convention, ห้ามรัน sonar เอง

## 7.2 คัดลอก standards เข้าโปรเจกต์

```
project-kit/standards/*.md            →  docs/standards/
project-kit/templates/spec.tpl.md     →  docs/templates/
project-kit/templates/task.tpl.md     →  docs/templates/
project-kit/templates/adr.tpl.md      →  docs/templates/
```
ระหว่าง copy ให้ **ปรับเนื้อหาให้ตรงกับ stack จริงที่เลือก** อย่า copy ดิบๆ
(เช่น ถ้าไม่ได้ใช้ NestJS ก็ตัดตัวอย่าง NestJS ออก)

## 7.3 ติดตั้ง slash command และ subagent

```
project-kit/claude-setup/commands/*   →  .claude/commands/
project-kit/claude-setup/agents/*     →  .claude/agents/
```
ปรับชื่อ path ในไฟล์เหล่านี้ให้ตรงโครงจริง

## 7.4 สร้าง `CONTRIBUTING.md`
สำหรับคน (ไม่ใช่ AI): วิธี setup เครื่อง, รัน docker, รัน test, รัน sonar,
branch/commit convention, ขั้นตอนรีวิว, วิธีเพิ่ม task ใหม่

## 7.5 สร้าง `README.md` ของโปรเจกต์
ภาพรวม, stack, วิธีรัน 3 บรรทัดแรกต้องรันได้จริง, ผังโฟลเดอร์, ลิงก์ไปเอกสารสำคัญ

## 7.6 สร้าง `docs/workflow.md` — วงจรการทำงานประจำวัน
คัดจาก `project-kit/standards/workflow-lifecycle.md` มาปรับให้ตรงโปรเจกต์

## 7.7 แช่แข็งผลงาน planning
- `docs/planning/*` เก็บไว้เป็นหลักฐานการตัดสินใจ อย่าลบ
- ถ้าการตัดสินใจเปลี่ยนภายหลัง → **เขียน ADR ใหม่ที่ supersede อันเก่า** อย่าไปแก้ ADR เดิม

## 7.8 ตรวจก่อนปิด

| ข้อ | ผ่าน |
|---|---|
| `CLAUDE.md` มีครบและอ่านแล้วเข้าใจว่าต้องทำอะไร | ⬜ |
| `.claude/commands/` และ `.claude/agents/` ใช้งานได้ | ⬜ |
| `docs/backlog/board.md` มี task พร้อมหยิบทำ | ⬜ |
| `pnpm build` / `lint` / `typecheck` / `test` ผ่านหมด | ⬜ |
| `docker compose up` แล้วเปิดเว็บได้ | ⬜ |
| `.env.example` ครบ และไม่มี secret หลุดเข้า git | ⬜ |
| `/health` ตอบ 200 | ⬜ |
| API docs เปิดได้ (ถ้ามี backend) | ⬜ |
| สลับ th/en ได้ และไม่มีข้อความ hardcode ในหน้าที่ทำแล้ว | ⬜ |
| สลับ light/dark ได้ | ⬜ |

## 7.9 ปิดงาน
1. commit ทั้งหมด
2. บอกผู้ใช้ว่า **จากนี้ไม่ต้องใช้ `project-kit/` แล้ว** (ลบได้ หรือย้ายไป `docs/_archive/`)
3. แสดง **3 คำสั่งแรกที่ควรใช้ในวันถัดไป** เช่น
   ```
   /task            หยิบ task ถัดไปจาก board
   /spec F-01       ทำ spec ของ feature ใหญ่
   /review          รีวิวงานที่เพิ่งทำ
   ```
