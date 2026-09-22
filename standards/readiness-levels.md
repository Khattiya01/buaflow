# ระดับความพร้อมของ Buaflow (R0–R4)

เอกสารนี้เป็นมาตรฐานกลางสำหรับตอบว่าแอป “พร้อมแค่ไหน” โดยไม่ใช้คำว่า prototype, MVP หรือ production แบบตีความเอง

## กติกากลาง

1. ระดับสูงรวมข้อกำหนดของระดับต่ำกว่าทั้งหมด
2. การผ่านมาจาก evidence ที่ตรวจซ้ำได้ ไม่ใช่ข้อความสรุปของผู้สร้างหรือ AI
3. `not-applicable` ใช้ได้เฉพาะ control ที่มาตรฐานกำหนดว่า conditional และต้องมีเหตุผลเฉพาะโปรเจกต์
4. exception/waiver เป็นการยอมรับความเสี่ยง ไม่ทำให้ control กลายเป็น `pass`
5. readiness ผูกกับ commit/build หนึ่งชุด ห้ามนำ report เก่ามาอ้างกับ source ชุดใหม่
6. `First Runnable` และ `Production Candidate` ต้องรายงานแยกกันเสมอ

## R0 — Prototype

เป้าหมาย: พิสูจน์แนวคิดและสื่อสาร flow หลัก

ต้องมี:

- source อยู่ใน version control หรือ snapshot ที่ระบุตัวตนได้
- มีวิธีเริ่มใช้งาน/เปิดดูที่ทำซ้ำได้
- primary flow อย่างน้อยหนึ่งเส้นพิสูจน์ได้

R0 ยังไม่รับรอง persistence, security, test coverage, deployment หรือ operations และห้ามเรียกว่า production-ready

## R1 — Functional

เป้าหมาย: ฟังก์ชัน happy path หลักทำงานจาก source ปัจจุบัน

ต้องเพิ่มจาก R0:

- build/compile/package สำเร็จตาม stack
- มี verify command มาตรฐานและผ่าน
- primary flow ใช้งานได้จาก implementation จริง ไม่ใช่ภาพหรือ mock อย่างเดียว

R1 อาจใช้ข้อมูลชั่วคราวและยังไม่มี boundary ด้านผู้ใช้/tenant ที่ครบ จึงเหมาะกับ developer demo

## R2 — MVP

เป้าหมาย: ให้ผู้ใช้กลุ่มจำกัดทดลองกับข้อมูลและขอบเขตจริงตาม application profile

ต้องเพิ่มจาก R1:

- requirement สำคัญ trace ไปยัง proof ได้
- automated tests ครอบคลุม business path และ failure สำคัญ
- persistence lifecycle ถูกกำหนด หรือระบุ `not-applicable` สำหรับแอปที่ไม่มี state จริง
- authentication/authorization/ownership boundary ถูกทดสอบ หรือระบุ `not-applicable` พร้อมเหตุผล
- CI รันชุดตรวจมาตรฐานจาก clean checkout

R2 ไม่ได้แปลว่ารับ production traffic ได้ เพราะ migration, rollback, observability และ supply-chain evidence อาจยังไม่ครบ

## R3 — Production Candidate

เป้าหมาย: ส่ง repository/artifact ให้ทีม platform ติดตั้งได้โดย **ไม่แก้ source code** เหลือเพียงกำหนด secrets, environment values และ infrastructure parameters

ต้องเพิ่มจาก R2:

- deployable package/image และ deployment manifest
- runtime configuration/secrets contract ที่ไม่ฝังค่าจริงใน source
- migration, compatibility และ rollback procedure ที่พิสูจน์ได้ตามชนิดระบบ
- secret, dependency และ security-control evidence
- end-to-end test บน production-like boundary
- health, logs/metrics/traces และ runbook ที่ใช้วินิจฉัยได้
- performance budget และ accessibility budget ตาม application profile
- SBOM และข้อมูล supply chain ที่ระบุตัว build
- clean-environment deployment rehearsal ผ่าน

รายละเอียด normative อยู่ใน [deployment-ready-contract.md](deployment-ready-contract.md)

คำว่า Production Candidate หมายถึง “พร้อมให้ owner/platform อนุมัติและ deploy” ไม่ได้หมายถึง Buaflow อนุมัติความเสี่ยงทางธุรกิจแทนคน หรือเป็นผู้ operate ระบบหลัง deploy

## R4 — Regulated

เป้าหมาย: ผ่านข้อควบคุมเฉพาะองค์กร อุตสาหกรรม หรือกฎหมายที่เลือกไว้

ต้องเพิ่มจาก R3:

- ระบุ compliance/control pack และเวอร์ชัน เช่น policy ขององค์กร, financial/health control set หรือ data residency
- evidence มี retention, access control และ auditability ตาม pack
- recovery/continuity test ผ่าน threshold ที่ pack กำหนด
- human approver ที่มีอำนาจรับรอง control set ลงนาม

R4 ไม่มี checklist สากลชุดเดียว เพราะ requirement ต่างกันตามข้อมูล เขตอำนาจ และองค์กร ห้ามอ้าง R4 โดยไม่ระบุ pack

## Promotion และ regression

- promote ได้เมื่อ control ของระดับเป้าหมายทุกตัวเป็น `pass` หรือ `not-applicable` ที่อนุญาต
- `fail`, `pending`, evidence หาย หรือ evidence ผูกกับ commit คนละชุด = ไม่ผ่าน
- source/dependency/config contract เปลี่ยน ต้องประเมิน control ที่ได้รับผลกระทบใหม่
- production incident หรือ rollback failure ลดระดับความเชื่อมั่นทันที จนกว่าจะมี evidence รอบใหม่

## คำสั่งอ้างอิง

หลังติดตั้งไฟล์ใน `claude-setup/` เป็น `.claude/`:

```bash
node .claude/readiness.js --file docs/evidence/readiness.json --level R3
node .claude/readiness.js --file docs/evidence/readiness.json --level R3 --json
```

validator รุ่นแรกตรวจโครง manifest, สถานะ, evidence declaration และ file evidence ที่อ้างถึง รุ่นถัดไปจะเชื่อม gate เพื่อสร้าง evidence จากการรันจริงแบบ fail-closed

