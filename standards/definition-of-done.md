# Definition of Done

งานจะเป็น `done` ได้ก็ต่อเมื่อผ่านครบทุกข้อของประเภทนั้น
**ทุกข้อต้องรันจริง/ตรวจจริง ห้ามติ๊กจากความรู้สึก**

---

## DoD กลาง (ใช้กับทุกประเภท)

- [ ] ทำครบทุกข้อของ acceptance criteria ในไฟล์ task
- [ ] **`pnpm verify` ผ่าน และแปะผลลัพธ์จริงให้ดูแล้ว** (typecheck + lint + test)
      — ไม่ใช่เขียนว่า "ผ่านแล้ว" แต่แปะ output จริงจาก terminal
- [ ] **ทำ Proof ที่ระบุไว้ใน `plan.md` หรือไฟล์ task ครบ และแสดงผลแล้ว**
- [ ] **diff ตรงกับ `plan.md`** — ถ้าต่างต้องอธิบายได้ว่าทำไม และอัปเดต plan ให้ตรงก่อนปิด
- [ ] ไม่มี `console.log` / `TODO` ที่ไม่ได้ตั้งใจ / โค้ดตายค้างอยู่
- [ ] ไม่มี secret หรือค่า hardcode ที่ควรมาจาก env
- [ ] ผ่าน `/review` และคนอนุมัติแล้ว
- [ ] commit ตาม Conventional Commits และอ้าง task id
- [ ] อัปเดตสถานะใน `docs/backlog/board.md`
- [ ] ถ้าเปลี่ยนพฤติกรรมที่เอกสารพูดถึง → อัปเดตเอกสารแล้ว
- [ ] **ตอบแล้วว่ามีบทเรียนอะไรควรเข้า config ไหม** (AGENTS.md / rule / hook / eval) —
      ถ้าไม่มีให้บอกตรง ๆ ว่าไม่มี

---

## DoD: Backend / API

เพิ่มจาก DoD กลาง:
- [ ] **มี unit test เขียนพร้อมกับ module นี้แล้ว** (ไม่เลื่อน ไม่แยก task)
- [ ] coverage ของไฟล์ที่แตะ **ไม่ต่ำกว่าเป้าที่ตกลง** และไม่ทำให้ coverage รวมลดลง
- [ ] validate input ทุกทางเข้าด้วย zod/DTO
- [ ] error ตอบตาม error envelope กลาง พร้อม `code` ที่ frontend แมป i18n ได้
- [ ] ตรวจสิทธิ์ที่ server แล้ว (ไม่ใช่แค่ซ่อนปุ่มใน UI)
- [ ] ไม่ log ข้อมูลอ่อนไหว (password, token, PII)
- [ ] **อัปเดต OpenAPI spec + export `docs/api/openapi.json`**
- [ ] **อัปเดต Postman collection** ของ endpoint นี้
- [ ] ถ้าแตะฐานข้อมูล: มี migration, รันขึ้นได้, มีแผน rollback, อัปเดต seed ถ้าจำเป็น
- [ ] ตรวจ query ที่อาจเป็น N+1 หรือขาด index

---

## DoD: Frontend / UI

เพิ่มจาก DoD กลาง:
- [ ] **ตอบคำถาม component ครบก่อนสร้าง** (มี shared แล้วไหม / มีใน shadcn ไหม / มี design ไหม)
- [ ] ใช้ UI library ที่ล็อกในธรรมนูญมาตรา 9 (ค่าเริ่มต้น React: shadcn/ui + Radix) ไม่ดึงตัวอื่นเข้ามาโดยไม่มี ADR
- [ ] **ไม่มีข้อความ hardcode** — ทุกข้อความผ่าน i18n key และมีครบทั้ง `th` และ `en`
      (รวม placeholder, aria-label, ข้อความ error, toast, empty state)
- [ ] **ไม่มีสี/ขนาดดิบ** — ใช้ theme token เท่านั้น
- [ ] ทำครบทุกสถานะ: loading / empty / error / ไม่มีสิทธิ์ / success
- [ ] responsive ใช้งานได้จริงบนมือถือ (ทดสอบที่ ~390px)
- [ ] ทดสอบสลับภาษาแล้ว layout ไม่พัง (ความยาวข้อความไทย/อังกฤษต่างกัน)
- [ ] ทดสอบทั้ง light และ dark
- [ ] a11y พื้นฐาน: label ครบ, กด Tab ไล่ได้, focus มองเห็น, contrast ผ่าน
- [ ] **ประเมินแล้วว่า component นี้ควรเป็น shared หรือไม่** และบันทึกใน `docs/design/components.md`
- [ ] **สร้าง task `T-xxx-test` สำหรับ unit test ไว้แล้ว** (สถานะ blocked จนกว่า UI จะผ่าน review)

> Frontend **ไม่ต้อง**เขียน unit test ในรอบนี้ ตามที่ตกลงกันไว้ —
> เขียนเมื่อ UI นิ่งแล้ว (ผ่าน review → done) เพื่อไม่ต้องรื้อเทสซ้ำๆ ระหว่างที่ UI ยังเปลี่ยน

---

## DoD: Frontend unit test (task `-test`)

- [ ] เทสพฤติกรรมที่ผู้ใช้เห็น ไม่ใช่ implementation detail
- [ ] ครอบ: render ปกติ, interaction หลัก, สถานะ error, สถานะ empty
- [ ] ใช้ query แบบ accessible (`getByRole`, `getByLabelText`) ไม่ใช่ `getByTestId` ทุกที่
- [ ] เทสผ่านทั้งสองภาษา (อย่างน้อย component ที่มีข้อความสำคัญ)
- [ ] coverage ของ component ถึงเป้าที่ตกลง

---

## DoD: Hotfix

- [ ] บันทึกอาการและผลกระทบไว้ก่อนแก้
- [ ] แก้เล็กที่สุด **ไม่มี refactor ปนมา**
- [ ] มี test ที่ครอบบั๊กนี้ (fail ก่อนแก้ ผ่านหลังแก้)
- [ ] ทดสอบบนสภาพที่ใกล้ prd มากที่สุดเท่าที่ทำได้
- [ ] **merge กลับ `main` แล้ว**
- [ ] เขียน postmortem สั้นๆ: สาเหตุจริง / ทำไมหลุดออกไป / จะกันยังไง
- [ ] เปิด task ถาวรสำหรับแก้รากของปัญหา (ถ้า hotfix เป็นแค่พลาสเตอร์)

---

## DoD: Milestone (ก่อน demo / ก่อนขึ้น uat)

- [ ] ทุก task ในรอบเป็น `done`
- [ ] รัน SonarQube local แล้วผ่าน quality gate (ดู `sonarqube-local.md`)
- [ ] coverage รวมถึงเป้า
- [ ] Postman collection รันผ่านทั้งชุด
- [ ] E2E critical path ผ่าน
- [ ] `docker compose up` จากศูนย์แล้วใช้งานได้ (ทดสอบบนเครื่องสะอาด)
- [ ] `.env.example` ตรงกับตัวแปรที่ใช้จริง
- [ ] อัปเดต README / CHANGELOG / release note
