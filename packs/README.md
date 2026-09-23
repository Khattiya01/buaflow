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
| `db` | capability | **ยังไม่มี** |
| `storage` | capability | **ยังไม่มี** |
| `notification` | capability | **ยังไม่มี** |
| `background-jobs` | capability | **ยังไม่มี** |

## pack ที่ยังไม่มีอะไรพิสูจน์

pack ที่ไม่มี `implementedBy` คือ **recipe ที่ยังไม่มีใครเดินจนจบสักครั้ง** — เขียนไว้ดีกว่าไม่มี
แต่ห้ามให้มันหายไปในสายตา ตัวเลขนี้ถูกบังคับด้วยเครื่อง ไม่ใช่ด้วยเอกสาร:

- `npm run check` พิมพ์ `5/9 bound to a reference app; unproven: ...` ทุกครั้ง
- test ใน `claude-setup/tests/pack.test.js` **ปักรายชื่อ 4 ตัวนี้ไว้** — ผูก pack เพิ่มแล้ว test จะแดง
  จนกว่าจะลดรายชื่อ และเพิ่ม pack ใหม่ที่ยังไม่มีใครพิสูจน์ก็แดงจนกว่าจะเขียนลงไปว่ามันยังไม่ถูกพิสูจน์
- pack ที่ผูกแล้วถูกตรวจทุก path ใน `requiredArtifacts` ว่ามีอยู่จริงใน app ที่มันอ้าง ทุกครั้งที่ CI รัน

**ทำไมการผูกถึงสำคัญ ไม่ใช่แค่พิธี** ตอนผูก `auth-rbac` เข้ากับแอปจริงพบว่า recipe ที่ PP-010 เขียนไว้
สั่งติดตั้ง `iron-session` กับ `bcrypt` — แต่แอปเดียวที่ implement capability นี้จริง **ไม่ใช้ทั้งสองตัว**
มันเซ็น session cookie ด้วย HMAC จาก `node:crypto` และแฮชรหัสผ่านด้วย scrypt โดยตั้งใจ
เพื่อไม่เพิ่ม dependency และไม่เพิ่ม supply-chain surface เลย recipe เดิมจึงจะพาโปรเจกต์ถัดไป
ไปติดตั้งของที่ไม่ต้องใช้สองตัว — นี่คือสิ่งที่ `implementedBy` มีไว้จับ

**ข้อจำกัดที่รู้อยู่ ยังไม่ได้แก้** capability pack ทั้งหกเขียน artifact เป็น path ของ Node/Next.js
(`lib/*.ts`, `app/api/**/route.ts`) จึงใช้ได้เฉพาะบน `nextjs-postgres` เท่านั้น ไม่ได้กับ
`react-fastapi-postgres` หรือ `expo-fastapi-postgres-sync` — แต่มีเพียง `auth-rbac` ที่ประกาศ
`requiresPacks` ไว้จริง ส่วน `db` หนักกว่านั้น: มันประกาศ `conflictsWithPacks: ["nextjs-postgres"]`
คือตั้งใจเติม persistence ให้ Node stack ที่ยังไม่มี — ซึ่ง **ไม่มี stack แบบนั้นอยู่ใน catalog เลย**
การแก้ให้ถูกต้องต้องมี dependency แบบ capability-based (“ต้องมีอะไรสักอย่างที่ให้ persistence”)
ซึ่งยังไม่มีในสัญญา — ดู `templates/pack.tpl.json` ข้อว่าด้วย identity-based requiresPacks

## คำสั่ง

```bash
node claude-setup/pack.js --dir packs --repo-root .                        # ตรวจทุก pack + binding
node claude-setup/pack.js --file packs/nextjs-postgres.json --repo-root .  # ตรวจตัวเดียว
node claude-setup/pack-composition.js --dir packs --ids nextjs-postgres,auth-rbac
```

`npm run check` รันคำสั่งแรกให้อยู่แล้ว และ CI (`.github/workflows/kit-check.yml`) รัน `npm run check`
