# Operational readiness: restore ที่ซ้อมจริง และ incident hook ที่เป็นสัญญา (EP-005)

ครึ่งหนึ่งของ EP-005 เสร็จไปนานแล้วและถูกบังคับที่ R3: health endpoint, structured log และ runbook
มีครบทุกแอป ส่วนอีกครึ่ง — **backup/restore และ incident response** — เป็นย่อหน้า

## ความขัดแย้งที่ audit ไม่ได้เห็น

`standards/deployment-ready-contract.md` เขียนไว้ในตารางความรับผิดชอบว่า Buaflow ต้องส่งมอบ
**"migrations, rollback และ backup/restore procedure"** ส่วนเจ้าของระบบกำหนด "production data
window และ change approval"

แต่ runbook ของ reference app ทั้งสามเขียนว่า *"this repository has no automated backup step;
that is an infrastructure/platform responsibility"* โดยอ้างตารางเดียวกันนั้น — ซึ่งอ่านตารางผิด
**procedure เป็นของเรา · schedule, retention และ data policy เป็นของ platform** สองอย่างนี้ไม่ใช่
อันเดียวกัน และการยุบรวมกันทำให้คำกล่าวอ้างที่หนักที่สุดในโมเดล (ข้อมูลหายแล้วกู้คืนได้)
ไม่มีใครต้องพิสูจน์

## สัญญา

ไฟล์ `docs/evidence/operational-readiness.json` (`schemas/operational-readiness.schema.json`)
ตรวจด้วย `node .claude/operational-readiness.js` หรือ `buaflow operations`

### 1. restore ต้องถูกซ้อม และการซ้อมต้องทำลายของจริง

การซ้อมที่ไม่ได้ทำลายอะไรเลยไม่ได้พิสูจน์อะไรเลย `scripts/rehearse-backup-restore.mjs` จึง:

1. ปั๊ม fingerprint ของ **ทุกตารางทุกแถว** (md5 ของเนื้อหาที่เรียงแล้ว รวมเป็น sha256 ก้อนเดียว)
2. `pg_dump -Fc` แล้วดึงไฟล์ออกมาวัดขนาดและ sha256 — พิสูจน์ว่ามี artifact จริง
3. **`DROP SCHEMA public CASCADE`** แล้วยืนยันว่าเหลือ 0 ตาราง
4. `pg_restore`
5. ปั๊ม fingerprint ใหม่ — **ต้องเท่าเดิมเป๊ะ**
6. รันคำสั่ง migration ตามที่หัวข้อ Recovery ของ runbook สั่ง แล้วยืนยันว่ามันเป็น no-op

ข้อ 5 คือข้อที่ทำให้มันเป็นการทดสอบ **ข้อมูล** ไม่ใช่ schema — การ restore ที่สร้างตารางเปล่า
กลับมาจะผ่านการเช็ก "ตารางครบไหม" และตกข้อนี้

ตัวตรวจอ่าน transcript นั้นจริง ๆ: `ok` ต้องเป็น true, `fingerprint.identical` ต้องเป็น true,
และ `sha256` ถูกคำนวณใหม่ — **รันซ้ำแล้วไม่อัปเดต record = ตก** ไม่ใช่เปลี่ยนตามเงียบ ๆ

> รันด้วย Docker อย่างเดียวผ่าน `docker compose exec` ไม่ต้องมี Postgres client บนเครื่อง —
> เหตุผลเดียวกับที่ clean-environment rehearsal ใช้ Docker

### 2. incident hook เป็นสัญญา ไม่ใช่ bullet

| ฟิลด์ | ทำไมถึงบังคับ |
|---|---|
| `signal` | ต้องเจาะจงพอที่จะ**สร้าง alert ได้โดยไม่ต้องถามต่อ** ("it broke" ไม่ผ่าน) |
| `detectedBy` | ไฟล์ที่ผลิตสัญญาณนั้น และ**ต้องมีอยู่จริง** — hook ที่ชี้ไป detector ที่ถูกลบคือสัญญาณที่ไม่มีใครส่ง |
| `severity` | critical / high / medium / low |
| `owner` | ชื่อคน ไม่ใช่ชื่อทีม — incident ที่ทุกคนเป็นเจ้าของคือ incident ที่ไม่มีใครเป็นเจ้าของ |
| `firstResponse` | `ไฟล์.md#anchor` ที่ **มีหัวข้อนั้นอยู่จริง** |
| `boundary` | trust boundary ใน `security-baseline.json` ที่ hook นี้เฝ้าอยู่ |

`firstResponse` ถูกตรวจถึงระดับ anchor เพราะลิงก์ที่ชี้ไปหัวข้อที่ถูกเปลี่ยนชื่อไปแล้ว จะพังตอน
ตีสองพอดี ซึ่งเป็นเวลาที่แย่ที่สุดที่จะค้นพบมัน · ตัวสร้าง anchor ทำตามที่ renderer ทำจริง
รวมถึงหัวข้อซ้ำที่ได้ `-1`, `-2` ต่อท้าย และช่องว่างที่**ไม่ถูกยุบ** (`web / backend` → `web--backend`)

### 3. ทุก trust boundary ต้องมีคนเฝ้า

ถ้าโปรเจกต์มี `docs/evidence/security-baseline.json` **ทุก boundary ที่ประกาศไว้ต้องมี hook
อย่างน้อยหนึ่งตัวอ้างถึง** ที่ไหนที่ของไม่น่าเชื่อถือกลายเป็นของน่าเชื่อถือ ต้องมีคนตอบได้ว่า
"ถ้ามันพัง เราจะรู้ได้ยังไง"

ข้อนี้คือเหตุผลที่ไฟล์นี้**ไม่เขียน threat boundary ใหม่อีกรอบ** — มันใช้ของที่ EP-003 บันทึกไว้แล้ว
แล้วทำให้ช่องว่างระหว่าง *"รู้ว่ามีเขตแดนตรงนี้"* กับ *"รู้ว่าจะรู้ได้ยังไงว่ามันพัง"* มองเห็นด้วยเครื่อง
และ hook ที่อ้าง boundary ที่ไม่มีอยู่ก็ตกเช่นกัน

## additive

โปรเจกต์ที่ไม่มี `docs/evidence/operational-readiness.json` ไม่ถูกตรวจข้อนี้เลย — 3.4.0 จึงเป็น
MINOR ตาม `standards/release-policy.md`
