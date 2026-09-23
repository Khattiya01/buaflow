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
| `db` | capability | — |
| `auth-rbac` | capability | — |
| `storage` | capability | — |
| `notification` | capability | — |
| `background-jobs` | capability | — |
| `audit-log` | capability | — |

capability pack ทั้งหกยังไม่มี `implementedBy` — **นั่นคือสัญญาณที่ตั้งใจให้เห็น** ไม่ใช่ช่องที่ลืมกรอก
มันแปลว่ายังไม่มี reference app ตัวไหนพิสูจน์ว่า recipe เหล่านั้นใช้ได้จริง ต่างจาก stack pack ทั้งสาม
ที่ทุก path ใน `requiredArtifacts` ถูกตรวจว่ามีอยู่จริงทุกครั้งที่ `npm run check` รัน

## คำสั่ง

```bash
node claude-setup/pack.js --dir packs --repo-root .                        # ตรวจทุก pack + binding
node claude-setup/pack.js --file packs/nextjs-postgres.json --repo-root .  # ตรวจตัวเดียว
node claude-setup/pack-composition.js --dir packs --ids nextjs-postgres,auth-rbac
```

`npm run check` รันคำสั่งแรกให้อยู่แล้ว และ CI (`.github/workflows/kit-check.yml`) รัน `npm run check`
