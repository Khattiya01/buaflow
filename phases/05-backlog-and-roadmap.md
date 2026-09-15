# Phase 5 — Backlog และ Roadmap

> เป้าหมาย: แตกงานทั้งหมดเป็น task ที่ "หยิบมาสั่ง AI ทำได้ทันที" และมีกระดาน agile ในไฟล์
> **ยังไม่เขียนโค้ด**

---

## 5.1 ลำดับชั้นของงาน

```
Milestone  (M0-M3)     ก้อนที่ส่งมอบได้ / demo ได้
└── Epic   (E-01)      กลุ่ม feature ที่เกี่ยวกัน เช่น "ระบบสมาชิก"
    └── Feature (F-01) สิ่งที่ผู้ใช้รับรู้ได้ เช่น "สมัครสมาชิกด้วยอีเมล"
        └── Task (T-001) หน่วยที่สั่ง AI ทำจบได้ใน 1 session
```

### กติกาขนาด Task (สำคัญที่สุดของ Phase นี้)
- **1 task = ทำจบได้ใน 1 session ของ Claude** (ประมาณไม่เกิน 4 ชั่วโมงคน)
- ถ้า task แตะไฟล์เกิน ~10 ไฟล์ หรือ acceptance criteria เกิน 7 ข้อ → **ต้องแตกอีก**
- task ต้อง **verify ได้ด้วยตัวเอง** (มีวิธีพิสูจน์ว่าเสร็จจริง)
- backend task ต้องรวม unit test อยู่ในตัว task นั้น ไม่แยกเป็น task ใหม่
- frontend task **ให้สร้าง task คู่อัตโนมัติ** คือ `T-xxx` (ทำ UI) และ `T-xxx-test` (เขียน unit test)
  โดย task test อยู่สถานะ `blocked` จนกว่า UI จะผ่าน review

---

## 5.2 Milestone ที่แนะนำ

| M | ชื่อ | ได้อะไร | เกณฑ์ผ่าน |
|---|---|---|---|
| **M0** | Foundation | repo, scaffold, docker, lint, theme, i18n, layout, auth เปล่า, health check | `docker compose up` แล้วเปิดเว็บได้, build ผ่าน, lint ผ่าน |
| **M1** | MVP core | เฉพาะ Must feature | ผู้ใช้ทำ flow หลักได้ครบตั้งแต่ต้นจนจบ |
| **M2** | Should feature + ขัดเกลา | feature รอง, empty/error state, responsive ครบ | UAT ผ่าน |
| **M3** | Production hardening | security review, performance, coverage ถึงเป้า, Sonar quality gate ผ่าน, API docs ครบ, ซ้อม backup/restore | ขึ้น prd ได้ |

> **M0 สำคัญมากเมื่อเขียนโค้ดด้วย AI** — ถ้ารากฐาน (theme token, i18n, shared component, error envelope)
> ไม่นิ่งตั้งแต่ M0 โค้ดที่ AI เขียนใน M1 จะเละแล้วต้องรื้อ

---

## 5.3 รูปแบบไฟล์ backlog

### `docs/backlog/board.md` — กระดานหลัก
ใช้ template `project-kit/templates/backlog-board.tpl.md`
สถานะ: `backlog` → `todo` → `in-progress` → `review` → `done` (+ `blocked`)

### `docs/backlog/tasks/T-001.md` — รายละเอียดต่อ task
ใช้ template `project-kit/templates/task.tpl.md`

### `docs/backlog/import.csv` — สำหรับ import เข้า dashboard จริงทีหลัง
คอลัมน์: `id,title,type,epic,feature,milestone,estimate,priority,status,depends_on,acceptance_criteria`

> ทีมใช้ไฟล์ใน repo เป็น source of truth
> ถ้าวันหนึ่งย้ายไป Jira / GitHub Projects ก็ export จาก CSV นี้ได้เลย
> และถ้ามี task เกิดใหม่ที่ dashboard → **ต้องสร้างไฟล์ task กลับเข้า repo ด้วย** ไม่งั้น AI มองไม่เห็น

---

## 5.4 วิธีแตกงาน

1. เอา Must feature จาก `01-requirements.md` มาไล่ทีละอัน
2. แต่ละ feature แตกเป็น task ตามลำดับที่ทำจริง เช่น:

```
F-01 สมัครสมาชิก
  T-010 [db]   Prisma model User + migration + seed
  T-011 [api]  POST /api/v1/auth/register + validation + unit test
  T-012 [api]  ส่งอีเมลยืนยัน + unit test
  T-013 [ui]   หน้า /register (shadcn form + zod + i18n th/en)
  T-013-test   unit test ของหน้า register   [blocked จนกว่า T-013 ผ่าน review]
  T-014 [e2e]  Playwright: สมัคร → ยืนยัน → เข้าระบบ
  T-015 [docs] อัปเดต OpenAPI + Postman collection
```

3. ใส่ **dependency** ให้ครบ — AI จะได้ไม่หยิบ task ที่ทำไม่ได้
4. เรียงลำดับตาม: dependency → ความเสี่ยง (เสี่ยงสูงทำก่อน) → คุณค่าต่อผู้ใช้
5. **ทำ Epic "M0 Foundation" ให้ละเอียดที่สุด** เพราะเป็นรากของทุกอย่าง

### ประเภท task (`type`) ที่ใช้
`feat` `fix` `hotfix` `refactor` `test` `docs` `chore` `perf` `security` `ui`
ต้องตรงกับ type ของ Conventional Commits เพื่อให้เชื่อม commit กับ task ได้

---

## 5.5 ประมาณการและลำดับความสำคัญ
- estimate เป็น **จำนวน session ของ AI** (0.5 / 1 / 2 / 3) เข้าใจง่ายกว่าชั่วโมงคน
- priority: `P0` (บล็อกทุกอย่าง) / `P1` (MVP) / `P2` / `P3`
- อย่าพยายามประมาณให้แม่น ใช้เพื่อจัดลำดับเท่านั้น

---

## 5.6 เตรียมช่องทางรับงานใหม่

หลังจาก Phase 7 งานใหม่ทุกชิ้นจะเข้าทาง `docs/intents/` ไม่ใช่เพิ่มลง board ตรง ๆ
เพราะฉะนั้นใน Phase นี้ต้องเตรียม:

- โฟลเดอร์ `docs/intents/` (ใส่ `.gitkeep`)
- ตาราง **"Intent รอตัดสิน"** ใน `board.md` (มีอยู่ในเทมเพลตแล้ว)
- ใน `05-roadmap.md` ระบุว่า **งานที่ยังไม่ได้อยู่ใน backlog จะเข้าระบบยังไง**

> เหตุผล: ถ้าไม่มีประตูเข้าที่ชัด งานใหม่จะโผล่เข้ามาเป็น task ลอย ๆ
> ที่ไม่มีใครรู้ว่าทำไมถึงทำ และไม่มีใครกล้าตัดทิ้ง

## 5.7 เครื่องหมายบน task

- `[P]` = task นี้สลับลำดับกับตัวอื่นในกลุ่มเดียวกันได้ (ไม่มี dependency ชนกัน)
  ใช้เพื่อบอกว่า **ลำดับยืดหยุ่นได้** ไม่ใช่ให้ทำพร้อมกัน — กติกายังคือทำทีละ 1 task
- ทุก task ต้องระบุ **AC ที่ครอบ** หรือระบุชัดว่าเป็นงาน infra ที่ไม่ผูก AC
- frontend task ต้องมีคู่ `-test` เสมอ (สถานะ blocked)

## ผลลัพธ์ที่ต้องเขียน
1. `docs/backlog/board.md` (รวมตาราง "Intent รอตัดสิน")
2. `docs/backlog/tasks/*.md` — **อย่างน้อยต้องเขียนละเอียดครบทุก task ของ M0 และ M1**
   ส่วน M2/M3 เขียนเป็นหัวข้อไว้ก่อนได้ แล้วค่อยลงรายละเอียดเมื่อใกล้ถึง
3. `docs/backlog/import.csv`
4. `docs/planning/05-roadmap.md` — milestone, ลำดับ, dependency graph, ความเสี่ยงเรื่องเวลา

## ก่อนจบ Phase
อัปเดต `_state.md` → สรุปจำนวน epic/feature/task ต่อ milestone และ task แรกที่ควรทำ
→ บอกให้พิมพ์ `ทำ Phase ต่อไป` เพื่อสร้างโปรเจกต์จริง → **หยุด**
