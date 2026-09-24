# EV-011 เก็บข้อมูลการใช้งานภายใน (opt-in) — Tasks

- requirements: [requirements.md](requirements.md) · design: [design.md](design.md) (อนุมัติแล้วทั้งคู่ 2026-09-24)
- สถานะ: อนุมัติแล้ว (2026-09-24)
- repo นี้ติดตามงานใน `development/state.json` ไม่ใช่ `docs/backlog/tasks/` — task ด้านล่างเป็นงานย่อยของ EV-011 ใช้รหัส `EV-011.<n>` และบันทึกความคืบหน้าใน notes ของ EV-011

| ID | งาน | ประเภท | ขึ้นกับ | ประมาณ (session) | AC ที่ครอบ | ขนานได้ |
|---|---|---|---|---|---|---|
| EV-011.1 | schema 2 ตัว + `claude-setup/usage.js` แกนกลาง: อ่าน/เขียนความยินยอม, สร้าง event, หา model จาก marker, `redact()`, เขียนต่อท้ายในเครื่องพร้อม `.gitignore` ของตัวเอง · CLI `usage consent / status / record check` · ลง `schemas/registry.json` · unit test | core + cli | – | 1 | AC-1 (ส่วน CLI), AC-2 (ส่วน CLI), AC-4, AC-10, AC-13, AC-14, AC-20, NF ความปลอดภัย | |
| EV-011.2 | hook `usage-capture.js`: PostToolUse (intent/plan/task created/status/done), PreToolUse Bash (marker), SessionStart (reconcile + แจ้งสถานะ) · อ่าน model จาก transcript · ลงทะเบียนใน `settings.json.tpl` · เพิ่มใน `install.js` · regenerate plugin · integration test | hook | EV-011.1 | 1 | AC-2, AC-5, AC-6, AC-7, AC-8, AC-9, AC-12, AC-14, NF เวลา, wiring | |
| EV-011.3 | `buaflow audit` บันทึก `verifier.audit` · SessionStart บันทึก `readiness.snapshot` เมื่อ readiness.json เปลี่ยน · test | cli + hook | EV-011.2 | 0.5 | AC-11, AC-23 (ส่วนเก็บ) | [P] |
| EV-011.4 | sync: `usage setup / sync`, lock, offset หลัง commit, spawn แบบ detached จาก SessionStart/SessionEnd, ข้อความ "ยังไม่ได้ตั้งค่า" และ "ค้าง n event" · test กับ bare repo | sync | EV-011.2 | 1 | AC-16, AC-17, AC-18, AC-19 | [P] |
| EV-011.5 | `usage report` (ตามโมเดล / ตามโปรเจกต์ / task ที่ควรดู, ตัดซ้ำด้วย id, ข้าม schema ที่ไม่รู้จัก, อัปเดต `lastReviewAt`) + `usage show` + ข้อความ AC-27 ตอนเปิด repo Buaflow · test ด้วย fixture store | report | EV-011.1 | 1 | AC-22, AC-23, AC-24, AC-25, AC-26, AC-27 | [P] |
| EV-011.6 | `usage eval-draft` → ร่างที่ผ่าน `eval-case.schema.json` ลง `evals/drafts/` · test | report | EV-011.5 | 0.5 | AC-21 | |
| EV-011.7 | skill และ template: `/buaflow:start` ถามยินยอม, `/check` เรียก `usage record check`, `/plan` เติม `approved_by`, `task.tpl.md` มี `fixes:` · regenerate skill + plugin · test สแกนข้อความ skill และ docs-lint | skill + template | EV-011.1 | 0.5 | AC-1, AC-3, AC-7 (ส่วน skill), AC-10 (ส่วน skill), AC-15 | [P] |
| EV-011.8 | เอกสารและ release: `CLI.md`, `VERSION.md`, `UPGRADE.md` (ส่วน "เปิดการเก็บข้อมูล"), kit 3.13.0, `npm run check` ผ่าน, roadmap row | docs | EV-011.2–.7 | 0.5 | – (งาน release ไม่ผูก AC) | |
| EV-011.9 | ใช้จริง: ตั้งค่า private repo กลาง, เปิดใน 2 โปรเจกต์ภายใน (Bluepeak Hub + อีก 1), ยืนยันว่ามี event เข้าที่เก็บกลาง, รัน `report` ครั้งแรก · ปิด EV-011 ใน state.json | rollout (เจ้าของ + AI) | EV-011.8 | 0.5 | เกณฑ์วัดความสำเร็จข้อ 1–3 ใน requirements | |

- `[P]` = ไม่ชนกับตัวอื่นในแถวที่มี `[P]` สลับลำดับได้ แต่ยังทำทีละ 1 task
- ทุก task มี unit/integration test มาในตัว (ไม่มีงาน frontend จึงไม่มีคู่ `-test`)
- ไม่มีงาน OpenAPI/Postman เพราะ feature นี้ไม่มี HTTP API — สัญญาคือ schema 2 ตัวและ CLI ซึ่งอยู่ใน EV-011.1 และ EV-011.8

## ลำดับที่แนะนำ

1. **EV-011.1** — ทุกอย่างพึ่ง schema และ `usage.js`
2. **EV-011.2** — หลังจากนี้เปิดเก็บในเครื่องได้จริงแล้ว (ยังไม่ sync)
3. **EV-011.7** — ให้ skill ถามยินยอมและบันทึก `/check` ได้เร็ว เพื่อลองกับตัวเองก่อน
4. **EV-011.4** — sync
5. **EV-011.3**
6. **EV-011.5 → EV-011.6** — ใช้ข้อมูล (มี fixture ทดสอบได้โดยไม่ต้องรอข้อมูลจริง)
7. **EV-011.8 → EV-011.9**

## AC ที่ยังไม่มี task รองรับ

ไม่มี — AC-1 ถึง AC-27, NF เวลา, NF ความปลอดภัย และ wiring มี task ครบ (ตรวจจากคอลัมน์ "AC ที่ครอบ")

## ความเสี่ยง

| ความเสี่ยง | แผนรับมือ |
|---|---|
| รูปแบบ transcript ของ Claude Code เปลี่ยน ทำให้หา model ไม่เจอ | ผลคือ `unknown` ไม่ใช่ข้อมูลผิด (R8) · เทส AC-14 มี fixture transcript · report แสดงสัดส่วน `unknown` ให้เห็นว่าเริ่มหาไม่เจอ |
| hook เพิ่ม 3 จุดทำให้ทุก Write/Edit/Bash ช้าลง | เทส NF เวลาใน EV-011.2 เป็นเงื่อนไขปิด task · ไม่ยินยอม = อ่านไฟล์เดียวแล้วออก |
| Windows: spawn แบบ detached ค้างหรือเด้งหน้าต่าง | `windowsHide: true` + เทสบน Windows ของเครื่องนี้ · CI Linux ครอบอีกฝั่ง |
| ช่อง `hook_event_name` / `SessionEnd` ไม่มีใน Claude Code รุ่นที่ผู้ใช้ใช้ | ทุก path ออก exit 0 · sync ยังทำได้ตอน SessionStart ครั้งถัดไปและสั่งเองได้ |
| ข้อมูลน้อยเกินกว่าจะเทียบ model ได้ (n เล็ก) | report แสดง n ทุกแถว · ตีความเป็นหน้าที่คน (นอกขอบเขต) — ข้อควรระวังเดียวกับ EV-009 |

## Gate ก่อนเริ่มเขียนโค้ด

- [x] ทุก AC มี task รองรับครบ
- [x] ทุก task มี AC ที่ครอบ หรือระบุชัดว่าเป็นงาน release/rollout ที่ไม่ผูก AC
- [x] บันทึก task ลง `development/state.json` (notes + artifacts ของ EV-011) แล้ว
- [x] ผู้ใช้อนุมัติแล้ว (2026-09-24)
