# {{PROJECT_NAME}}

> ไฟล์นี้คือกติกาหลักของโปรเจกต์สำหรับ **AI agent ทุกตัว** (มาตรฐานกลาง AGENTS.md)
> Claude Code อ่านผ่าน `CLAUDE.md` ที่ import ไฟล์นี้เข้าไป
> **ยาวไม่เกิน ~200 บรรทัด** รายละเอียดให้ลิงก์ไป `docs/` อย่ายัดเข้ามา
> เกณฑ์ตัดสินว่าบรรทัดไหนควรอยู่: *"ถ้าลบบรรทัดนี้ AI จะทำผิดไหม"* ถ้าไม่ผิด → ตัดทิ้ง

## โปรเจกต์นี้คืออะไร
{{หนึ่งย่อหน้า: เว็บอะไร ให้ใคร แก้ปัญหาอะไร}}

## Stack
- Frontend: {{...}}
- Backend: {{...}}
- DB/ORM: {{PostgreSQL + Prisma}}
- UI: **shadcn/ui + Radix + Tailwind** (ห้ามใช้ UI library อื่น)
- i18n: {{next-intl}} — **th (default) + en**
- Test: {{Vitest + Testing Library + Playwright}}
- Docker สำหรับ dev และ deploy

## คำสั่ง

```bash
{{VERIFY_COMMAND}}       # คำสั่งตรวจมาตรฐาน ต้องผ่านก่อนบอกว่าเสร็จทุกครั้ง
pnpm dev                 # รันโหมดพัฒนา
pnpm build               # build
pnpm test:cov            # เทส + coverage
pnpm db:migrate          # รัน migration
pnpm db:seed             # ใส่ข้อมูลตั้งต้น
pnpm docker:dev          # ยก docker compose
pnpm sonar               # ผู้ใช้รันเอง — AI ห้ามรัน
```

**หน้าตาของ "ผ่าน" ที่ถูกต้อง** (ถ้าเห็นไม่ตรงนี้แปลว่ายังไม่ผ่าน):

```
{{วางผลลัพธ์จริงตอนที่ทุกอย่างเขียวไว้ตรงนี้ เช่น
tsc --noEmit                 (ไม่มี output = ผ่าน)
eslint .                     0 errors, 0 warnings
Test Files  12 passed (12)   Tests  84 passed (84)}}
```

## โครงโฟลเดอร์

```
{{ผังจริง พร้อมคำอธิบายสั้นๆ ว่าอะไรวางตรงไหน}}
```

- `components/ui/` = shadcn generated — **ห้ามแก้มือ** (มี hook กันไว้)
- `components/shared/` = component กลางของเรา
- `components/<feature>/` = เฉพาะ feature
- ห้าม feature หนึ่ง import component ของอีก feature — ถ้าต้องใช้ร่วมให้ยกขึ้น `shared/`

---

## วงจรการทำงาน (ทำตามลำดับนี้เสมอ)

```
intent -> spec (feature ใหญ่) -> plan -> code -> verify -> review -> done
```

1. **เริ่มงานทุกครั้ง** — อ่าน `docs/backlog/board.md` + ไฟล์ task แล้ว **สรุปความเข้าใจให้ผู้ใช้ฟังก่อน** อย่าเริ่มเขียนทันที
2. **ก่อนแตะโค้ด** — งานที่แก้หลายไฟล์ หรือไม่คุ้นโค้ดส่วนนั้น ต้องทำ `plan.md` ใน plan mode และ commit ก่อน
   (งานที่อธิบาย diff ได้จบใน 1 ประโยค เช่น แก้ typo ข้ามได้)
3. **ระหว่างทำ** — ทำทีละ task, commit ย่อยตาม Conventional Commits, เจอของนอก scope ให้ **หยุดถาม** ห้ามทำเผื่อ
4. **ก่อนบอกว่าเสร็จ** — รัน `{{VERIFY_COMMAND}}` จริง แล้ว **แปะผลลัพธ์จริงให้ดู** ห้ามประกาศว่าผ่านเฉย ๆ
5. **จบงาน** — review -> คนอนุมัติ -> ปิด task

## ห้ามเด็ดขาด

- ข้อความ hardcode — ทุกข้อความผ่าน i18n ครบทั้ง th และ en (รวม placeholder, aria-label, error, toast, empty state)
- สี/ขนาดดิบ — ใช้ theme token เท่านั้น
- ติดตั้ง UI library อื่นนอกจาก shadcn/Radix
- แก้ไฟล์เทสเพื่อให้เทสผ่าน ตอนที่กำลังแก้บั๊ก
- `git commit --no-verify`
- รัน SonarQube scan เอง (ผู้ใช้รันเอง แล้วเอาผลมาให้แก้)
- ทำงานนอก scope ของ task โดยไม่ถาม
- รายงานว่า "ผ่าน" โดยไม่ได้รันจริง

## Backend

- **เขียน unit test พร้อมกับ module เสมอ** อยู่ใน DoD ไม่เลื่อน
- validate input ด้วย zod/DTO ทุกทางเข้า
- error ตอบตาม envelope กลางพร้อม `code` ที่ frontend แมป i18n ได้
- ตรวจสิทธิ์ที่ server เสมอ และตรวจ **ownership ของ record** ไม่ใช่แค่ role
- อัปเดต OpenAPI + Postman ทุกครั้งที่ API เปลี่ยน

## Frontend

- **ก่อนสร้าง component ต้องถามเสมอ**: มีใน `shared/` ไหม → มีใน shadcn ไหม → ประกอบจากของเดิมได้ไหม → มี design ไหม → **ถ้าไม่มีทั้งหมด หยุดถามก่อนออกแบบเอง**
- ประเมินทุกครั้งว่าควรเป็น shared ไหม (ใช้ตั้งแต่ 2 ที่ = shared) แล้วบันทึกใน `docs/design/components.md`
- unit test เขียนทีหลังเมื่อ UI นิ่ง แต่ **ต้องสร้าง task `T-xxx-test` ไว้ตั้งแต่ตอนทำ UI**
- ทำครบทุกสถานะ: loading / empty / error / ไม่มีสิทธิ์
- ทดสอบ th/en, light/dark, ~390px

## ถ้าแผนเปลี่ยน

แก้เอกสารต้นทางก่อนเสมอ (intent / spec / plan / ADR / board) แล้วค่อยแก้โค้ด
**ห้ามปล่อยให้โค้ดกับเอกสารไม่ตรงกัน**

## ถ้าไม่แน่ใจ

ถาม อย่าเดา — ทำเครื่องหมาย `[NEEDS CLARIFICATION: <คำถาม>]` ไว้ในเอกสารแทนการเติมเอาเอง
โดยเฉพาะเรื่อง UI, business rule, และการเปลี่ยน API contract

---

## สิ่งที่ AI ในโปรเจกต์นี้เคยทำผิด

<!-- กฎ: พลาดเรื่องเดิม "ครั้งที่ 2" -> เขียนลงตรงนี้ทันที (จากการรีวิว หรือจากที่ผู้ใช้ต้องแก้ซ้ำ) -->
<!-- เขียนสั้น 1 บรรทัดต่อข้อ: <ทำผิดว่าอะไร> -> <ที่ถูกคืออะไร> -->

- {{ตัวอย่าง: ใส่ directive ของ client component ที่ไฟล์ page ทั้งไฟล์ → ต้องใส่ที่ component ย่อยที่ต้องใช้ hook เท่านั้น}}

> ถ้ารายการนี้ยาวเกิน ~10 ข้อ แปลว่าบางข้อควรเลื่อนชั้นไปเป็น rule ที่ผูกกับ path หรือ hook แทน

## เอกสารอ้างอิง

| เรื่อง | ไฟล์ |
|---|---|
| ธรรมนูญโปรเจกต์ (หลักการที่ห้ามละเมิด) | `docs/constitution.md` |
| วงจรการทำงาน / การปล่อยของ | `docs/workflow.md` |
| Definition of Done | `docs/standards/definition-of-done.md` |
| นโยบายการรีวิว | `REVIEW.md` |
| มาตรฐานทั้งหมด | `docs/standards/` |
| สถาปัตยกรรม / ADR | `docs/planning/04-architecture.md`, `docs/adr/` |
| backlog | `docs/backlog/board.md` |
