# Definition of Done

งานเป็น `done` ได้เมื่อผ่าน **DoD กลาง** ข้างล่าง + **DoD ของประเภทงาน** ซึ่งอยู่ใน `.claude/rules/` และโหลดเข้า context เองตอนแตะไฟล์ประเภทนั้น
**ทุกข้อรันจริง/ตรวจจริง ห้ามติ๊กจากความรู้สึก** — และ `/check` รายงาน**เฉพาะข้อที่ไม่ผ่าน** ไม่ต้องไล่ทุกข้อเป็นร้อยแก้ว

> ไฟล์นี้ตั้งใจให้สั้นพอที่จะไม่ต้องเปิดอ่านซ้ำทุก task — ของที่ผูกกับประเภทไฟล์ย้ายไปอยู่กับ rule ที่โหลดตาม path แล้ว
> (เดิมไฟล์นี้ 7.6KB ถูก Read 2-3 ครั้งต่อ task = token ที่ไม่ได้เพิ่มความถูกต้อง)

## DoD กลาง — ทุกประเภท

| # | ข้อ | ใครตรวจ |
|---|---|---|
| 1 | ครบทุก AC ในไฟล์ task (หรือใน "ข้อกำหนดที่คัดมาแล้ว" ของ plan.md) | `/check` ข้อ 2 |
| 2 | `verify` ผ่าน — แปะ**บรรทัดสรุป**ที่มันพิมพ์ (log เต็มอยู่ `.verify.log`) | `/check` ข้อ 1, gate |
| 3 | Proof ใน plan/task ทำครบ แสดงผลจริง | `/check` ข้อ 2 |
| 4 | diff ตรง plan.md — ต่างต้องอธิบายได้และอัปเดต plan ก่อนปิด | `/check` ข้อ 2, code-reviewer |
| 5 | ไม่มี `console.log` / `TODO` ไม่ตั้งใจ / โค้ดตาย / secret / ค่า hardcode ที่ควรอยู่ใน env | `/code-review`, `/check` ข้อ 4 |
| 6 | ผ่าน `/check` แล้ว **คนอนุมัติ** และ **merge ผ่าน PR** หลัง gate ผ่าน — AI ไม่ merge เอง | คน + CI |
| 7 | commit ตาม Conventional Commits อ้าง task id | commitlint |
| 8 | ไฟล์ task อัปเดต (`status`, `commit`) แล้ว `node .claude/board.js` | `/done`, docs-lint |
| 9 | เอกสารที่พูดถึงพฤติกรรมนี้อัปเดตแล้ว (spec / OpenAPI / components.md / ADR) | `/done` ข้อ 5 |
| 10 | ตอบแล้วว่ามีบทเรียนควรเข้า config ไหม — ไม่มีให้บอกว่าไม่มี | `/done` ข้อ 6 |

## DoD ตามประเภท — อยู่ที่ไหน

| ประเภทงาน | ไฟล์ที่โหลดเอง | trigger |
|---|---|---|
| Backend / API | `.claude/rules/backend-api.md` § DoD | แตะ `api/**`, `modules/**`, `services/**` |
| Frontend / UI + task `-test` | `.claude/rules/frontend-ui.md` § DoD | แตะ `components/**`, `app/**` |
| DB / migration | `.claude/rules/db-migration.md` § DoD | แตะ `prisma/**`, `migrations/**` |
| Hotfix | `/hotfix` ขั้นที่ 7 | — |
| Milestone / release | `/release` ขั้นที่ 1 + `node .claude/gate.js --release <M>` | — |

## track: trivial

งานที่ `track: trivial` (typo / copy / log / chore บรรทัดเดียว) ใช้ข้อ 2, 5, 6, 7, 8 พอ
