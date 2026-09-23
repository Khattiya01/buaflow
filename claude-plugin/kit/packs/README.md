# Pack catalog

Stack และ capability pack ที่ Buaflow ดูแลเอง ตาม `schemas/pack.schema.json` (v2)

## ทำไมอยู่ตรงนี้

ก่อนหน้านี้ไฟล์ชุดนี้อยู่ที่ `claude-setup/tests/fixtures/packs/` ซึ่งเป็น path ของ **test fixture**
สำหรับสิ่งที่ตั้งใจให้เป็น **catalog ของผลิตภัณฑ์** — ที่อยู่ของไฟล์บอกสถานะจริงของมันตรง ๆ ว่า
"ยังเป็นแค่ตัวอย่างสำหรับทดสอบ schema" ย้ายมาที่ `packs/` เมื่อ 23 กันยายน 2026 (ดู D-012)

## สองที่ที่ pack อยู่ได้ และไม่ใช่ที่เดียวกัน

| ที่อยู่ | คืออะไร |
|---|---|
| `packs/*.json` (ที่นี่) | **catalog** ของ Buaflow — pack ทั้งหมดที่มีให้เลือก |
| `.claude/packs/*.json` ในโปรเจกต์ผู้ใช้ | **ชุดที่โปรเจกต์นั้นเลือกใช้จริง** คัดลอกมาเฉพาะที่เกี่ยวข้อง |

`schemas/registry.json` ประกาศทั้งสอง path เพราะเป็นคนละบทบาท การยุบรวมกันคือเหตุผลที่
catalog ไปจบอยู่ใต้โฟลเดอร์ test ตั้งแต่แรก

## pack v2 คืออะไร

**recipe + assertion ไม่ใช่ template** — pack ไม่ได้เก็บโค้ดไว้ปั๊มออกมา แต่บอกว่า

- `setup[]` ต้องรันคำสั่งอะไร (คำสั่งของเจ้าของ framework เอง **ห้าม pin เวอร์ชัน**)
- `requiredArtifacts[]` เมื่อเสร็จแล้วต้องมีไฟล์อะไรอยู่จริง
- `verification[]` คำสั่งไหนต้องผ่าน
- `operationalEvidence[]` ช่วย readiness control ตัวไหนได้จริง
- `implementedBy` reference app ตัวไหนพิสูจน์ pack นี้ (ถ้ามี)

เหตุผลเต็มอยู่ใน D-011 ของ `development/state.json` — สรุปสั้น: template generator แช่ dependency
ไว้ที่วันที่เขียน จึงผลิตของเก่าทุกครั้งที่รัน และขัดกับ `phases/06-scaffold.md` ที่สั่งไว้ตั้งแต่ต้นว่า
ให้ใช้ CLI ของเจ้าของ framework เสมอ

## catalog ปัจจุบัน

| id | kind | พิสูจน์โดย |
|---|---|---|
| `nextjs-postgres` | stack | `reference-apps/nextjs-postgres-crud` |
| `react-fastapi-postgres` | stack | `reference-apps/react-fastapi-postgres-crud` |
| `expo-fastapi-postgres-sync` | stack | `reference-apps/expo-fastapi-postgres-sync` |
| `auth-rbac` | capability | `reference-apps/nextjs-postgres-crud` |
| `audit-log` | capability | `reference-apps/nextjs-postgres-crud` |

**ทุก pack ใน catalog ผูกกับ reference app ที่พิสูจน์มันจริงแล้วทั้งหมด** — `npm run check` พิมพ์
`all 5 bound to a reference app` ทุกครั้ง และทุก path ใน `requiredArtifacts` ถูกตรวจว่ามีอยู่จริง

## สี่ pack ที่ถูกตัดทิ้ง และทำไม (D-014)

`db`, `storage`, `notification`, `background-jobs` เคยอยู่ใน catalog โดยไม่มี `implementedBy`
ตัดออกเมื่อ 23 กันยายน 2026 แทนที่จะลงทุนพิสูจน์

**หลักฐานที่ตัดสิน มาจากงานก่อนหน้านี้เองหนึ่งขั้น** ตอน PP-011 ผูก `auth-rbac` เข้ากับแอปจริง
พบทันทีว่า recipe ผิด — มันสั่งติดตั้ง `iron-session` กับ `bcrypt` ขณะที่แอปนั้นเซ็น session ด้วย
HMAC จาก `node:crypto` และแฮชด้วย scrypt โดยตั้งใจไม่เพิ่ม dependency เลย
**ผูกครั้งเดียว เจอ recipe ผิดหนึ่งอัน**

recipe ที่ไม่เคยมีใครเดินจนจบจึงไม่ใช่ของกลาง ๆ — มันคือ `guidance-defect` ที่รอคนมาทำตาม
(หมวดนี้อยู่ใน `standards/failure-taxonomy.md` โดยใช้เคส auth-rbac เป็น citation พอดี)

และการพิสูจน์ก็ไม่ถูก: ต้องเพิ่ม S3, SMTP, queue พร้อม worker process เข้าไปใน reference app
ซึ่งกินเวลาหลายวัน และทำให้ reference app หนักขึ้นสวนทางกับทิศทางตั้งแต่ D-011 ที่จะหยุดขยายมัน

`db` หนักกว่าเพื่อน: มันประกาศ `conflictsWithPacks: ["nextjs-postgres"]` คือเล็ง Node stack ที่ยัง
ไม่มี persistence — ซึ่ง **ไม่มี stack แบบนั้นใน catalog เลย** มันจึงประกอบกับอะไรไม่ได้สักอย่าง

### เหตุผลเชิงออกแบบที่เก็บไว้ ไม่ได้ทิ้งไปพร้อมไฟล์

สิ่งที่มีค่าจริงใน pack เหล่านั้นไม่ใช่ recipe แต่เป็นข้อจำกัดที่มันยืนยัน — บันทึกไว้ใน D-014:

- **storage** — presigned upload/download เท่านั้น ห้ามให้ byte ของไฟล์วิ่งผ่าน app server
- **notification** — ทางออกเดียว `send()` เพื่อให้ทุก notification ผ่านที่เดียวที่ test/log/rate-limit ได้
- **background-jobs** — worker ต้องเป็น process ของตัวเอง ไม่ใช่ thread ใน web server เพื่อให้
  deployment manifest มีคำสั่งให้ชี้
- **db** — persistence ที่เติมทีหลังก็ยังต้องมาทาง migration ไม่ใช่แก้ schema ตรง ๆ

pack ตัวใหม่สำหรับความสามารถเหล่านี้ ควรเริ่มจากข้อจำกัดพวกนี้ **และจากโปรเจกต์ที่ implement มันจริง**

### สิ่งที่บังคับด้วยเครื่อง ไม่ใช่ด้วยเอกสาร

- `npm run check` พิมพ์ `all 5 bound to a reference app` ทุกครั้ง
- test ใน `claude-setup/tests/pack.test.js` ปักรายชื่อ pack ที่ยังไม่ถูกพิสูจน์ไว้ และตอนนี้ **ว่างเปล่า**
  → pack ใหม่ที่ไม่มี `implementedBy` จะทำให้ CI แดงจนกว่าจะมีคนเขียนลงไปว่ามันยังไม่ถูกพิสูจน์
  ซึ่งเป็นการตัดสินใจ ไม่ใช่การหลุดรอด
- ทุก path ใน `requiredArtifacts` ของ pack ที่ผูกแล้ว ถูกตรวจว่ามีอยู่จริงทุกครั้งที่ CI รัน

**ข้อจำกัดที่รู้อยู่ ยังไม่ได้แก้** capability pack ที่เหลือทั้งสองเขียน artifact เป็น path ของ Node/Next.js
จึงใช้ได้เฉพาะบน `nextjs-postgres` — `auth-rbac` ประกาศ `requiresPacks` ไว้จริง ส่วน `audit-log`
ปล่อยว่างเพราะมันต้องการ "pack อะไรก็ได้ที่ให้ persistence" ซึ่ง `requiresPacks` แบบ identity-based
เขียนไม่ได้ · หลังตัด `db` ออก คำตอบเดียวที่เหลือคือ `nextjs-postgres` ทำให้ **capability-based
dependency กลายเป็นช่องว่างของสัญญาที่ควรแก้จริง ไม่ใช่เชิงอรรถที่ไม่มีใครทำอะไรกับมัน**

## คำสั่ง

```bash
node claude-setup/pack.js --dir packs --repo-root .                        # ตรวจทุก pack + binding
node claude-setup/pack.js --file packs/nextjs-postgres.json --repo-root .  # ตรวจตัวเดียว
node claude-setup/pack-composition.js --dir packs --ids nextjs-postgres,auth-rbac
```

`npm run check` รันคำสั่งแรกให้อยู่แล้ว และ CI (`.github/workflows/kit-check.yml`) รัน `npm run check`
