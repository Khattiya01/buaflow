# Buaflow CLI

CLI นี้เป็นชั้นกลางที่ **ไม่ผูกกับ AI vendor**: ใช้กับ terminal, CI, Claude, Codex, Copilot หรือระบบ orchestration อื่นได้เหมือนกัน

เมื่อวาง Buaflow ไว้ใต้ project root ที่ชื่อ `buaflow/` ให้เรียก:

```bash
node buaflow/bin/buaflow.js <command>
```

เมื่อติดตั้งเป็น package executable แล้วใช้ `buaflow <command>` ได้โดยตรง

## Commands

| Command | หน้าที่ | การเขียนไฟล์ |
|---|---|---|
| `init --mode new\|extend` | สร้าง `.buaflow/project.json` ที่เป็น metadata กลางของโปรเจกต์ | สร้างเฉพาะ manifest; ปฏิเสธ overwrite ถ้าไม่ระบุ `--force` |
| `doctor [--strict]` | ตรวจ Node, Git, manifest, lifecycle state และ installed controls · บอกว่า root อยู่ใน git work tree ไหม และเป็น git root หรือ subdirectory (EV-009 K-1) | ไม่เขียน |
| `assess [--execute] [--write path [--level R0-R3] [--force]]` | ตอบว่า **"โปรเจกต์นี้อยู่ที่ R เท่าไร"** จากการ probe repository เอง — ไม่ต้องมี manifest และไม่ต้องติดตั้ง `.claude/` ก่อน (รัน `claude-setup/assess.js` ของ kit) · ทุก control ได้ `pass` / `pending` / `fail` พร้อมเหตุผลและสิ่งที่ต้องทำต่อ · ตอบสองระดับ: **proven** (ทุก control ผ่าน) กับ **reachable** (ไม่มี control ไหน fail) · `pass` เฉพาะเมื่อ probe เป็นข้อยุติหรือคำสั่งถูกรันจริงด้วย `--execute` · ไม่มีอะไรถูกตัดสิน `not-applicable` ให้ (EV-009 K-2) | ไม่เขียน เว้นแต่ `--write` (draft manifest ที่ pending ยังเป็น pending ⇒ `readiness` ตกจนกว่าคนจะปิดช่องว่าง · ไม่เขียนทับถ้าไม่ใส่ `--force`) และ `--execute` รัน build/verify/test จริงของโปรเจกต์ |
| `ci` | รัน gate จาก **clean checkout** บนเครื่องตัวเอง (clone ของ HEAD → `commands.ciSetup` → `.claude/gate.js`) แล้วบันทึก `docs/evidence/ci-run.json` ที่ provider เป็น `local-clean-checkout` · แทน hosted CI ที่ใช้ไม่ได้ · `assess` นับเป็นหลักฐานของ control `ci` · ความล้มเหลวก็ถูกบันทึก | เขียน `docs/evidence/ci-run.json` · โฟลเดอร์ชั่วคราวถูกลบหลังรัน |
| `benchmark` | ให้คะแนน **functional · engineering · operations** จาก artifact ที่มีอยู่แล้ว (manifest, verifier, probe ของ assess, ตัวตรวจ EP-002..007, eval run) แล้วตอบว่าเป็น **Production-Qualified** ไหม พร้อมเหตุผลทุกข้อที่ไม่ผ่าน (EV-002) · รันจาก kit โดยตรง ใช้กับโปรเจกต์ที่ไม่ได้เกิดจาก Buaflow ได้ · ดู `standards/production-qualified-benchmark.md` | ไม่เขียน ไม่รันคำสั่งของโปรเจกต์ |
| `verify` | รัน `.claude/verify.js` ของโปรเจกต์ | ไม่เขียนโดย CLI |
| `readiness [--file path] [--level R0-R4]` | รัน `.claude/readiness.js` | ไม่เขียน |
| `audit [--file path] [--level R0-R4] [--execute]` | รัน `.claude/verifier.js` — ตรวจซ้ำจาก artifact และผลการรันจริง ไม่อ่าน `control.status` เป็นข้อมูลเข้า (BC-006) | ไม่เขียน เว้นแต่ใส่ `--execute` ซึ่งรันคำสั่งจริงของโปรเจกต์ และคำสั่งพวกนั้นเขียนไฟล์ทับได้ |
| `requirements [--file path]` | รัน `.claude/requirement-coverage.js` — requirement ทุกข้อต้องมี proof หรือ approved exception ที่ยังไม่หมดอายุ (EP-002) ค่า default ของ `--file` คือ `docs/evidence/requirement-coverage.json` | ไม่เขียน |
| `security [--file path]` | รัน `.claude/security-baseline.js` — ทุก control ของ control set ภายนอกต้องมีคำตอบ และ control ที่ not-met ต้องชี้ไป approved exception (EP-003) | ไม่เขียน |
| `supply [--file path]` | รัน `.claude/supply-chain.js` — สรุป licence ถูก derive ใหม่จาก SBOM, provenance ต้องตรงกับ CI run จริง, subject ทุกตัวถูกคำนวณ sha256 ใหม่ (EP-004) | ไม่เขียน |
| `operations [--file path]` | รัน `.claude/operational-readiness.js` — restore ต้องถูกซ้อมจริงและข้อมูลกลับมาเหมือนเดิม, incident hook ต้องชี้ไปหัวข้อ runbook ที่มีอยู่จริง, ทุก trust boundary ต้องมีคนเฝ้า (EP-005) | ไม่เขียน |
| `budgets [--file path]` | รัน `.claude/budgets.js` — ตัวเลขที่วัดได้ถูก derive ใหม่จากไฟล์หลักฐาน และเทียบกับเพดานที่ **application profile** กำหนด ไม่ใช่เพดานที่แอปเขียนเอง (EP-007) | ไม่เขียน |
| `evals [--file dir]` | รัน `.claude/eval-harness.js` — เคสต้องชี้ไฟล์ config ที่มีอยู่จริง และ run ที่อ้างว่าผ่านต้องตัดสินเคส**เวอร์ชันปัจจุบัน** ไม่ใช่เวอร์ชันที่ถูกแก้ทิ้งไปแล้ว (EV-004) `--file` คือโฟลเดอร์เคส ค่า default คือ `docs/evals` | ไม่เขียน |
| `resume` | สรุป `.buaflow/project.json`, `docs/planning/_state.md` และ task ที่ in-progress | ไม่เขียน |

ทุก command รับ `--root <path>` เพื่อกำหนด project root และ `--json` เพื่อ output ที่ agent/CI parse ได้

## Exit codes และ JSON envelope

| Code | ความหมาย |
|---:|---|
| 0 | คำสั่งสำเร็จ |
| 1 | check/command ไม่ผ่าน หรือ state ไม่พอสำหรับคำสั่งนั้น |
| 2 | input หรือ command ไม่ถูกต้อง |
| 3 | control ที่ต้องใช้ยังไม่ได้ติดตั้ง |

ตัวอย่าง:

```bash
node buaflow/bin/buaflow.js doctor --json
node buaflow/bin/buaflow.js readiness --level R3 --json
```

JSON ทุกคำสั่งมี contract เดียวกัน:

```json
{
  "schemaVersion": "1.0",
  "command": "doctor",
  "status": "ok",
  "code": 0,
  "summary": "...",
  "data": {},
  "warnings": [],
  "errors": []
}
```

`doctor` ตั้งใจให้ return 0 เมื่อเจอ setup gap ที่ยังเป็นปกติในช่วงต้น lifecycle; ใช้ `--strict` เมื่อต้องการให้ warning ทำให้ CI ไม่ผ่าน

## ขอบเขตรุ่นแรก

CLI shell ยังไม่สร้าง application code, ไม่ติดตั้ง provider และไม่ execute agent เอง หน้าที่ของมันคือสร้าง interface ที่คงที่ให้ workflow/tool adapter ข้างบนเรียกได้โดยไม่ต้องรู้ว่า agent เป็นค่ายใด ส่วน intent compiler, profiles/packs และ orchestration จะต่อบน contract นี้ใน workstream ถัดไป

