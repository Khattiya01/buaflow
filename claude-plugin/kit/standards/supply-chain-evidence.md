# Supply-chain evidence: licence, provenance, checksum (EP-004)

แถวเดิมของ EP-004 ขอสี่อย่าง: **lockfile · SBOM · licence · provenance/checksum**
สองอย่างแรกเสร็จไปแล้วและถูกบังคับที่ R3 ตั้งแต่ก่อน audit ของ D-013 ส่วนคำว่า
`provenance`, `SLSA` และ `license` ปรากฏอยู่ใน roadmap เท่านั้น — ไม่มีที่ไหนในเรพผลิตหรือตรวจมัน

## ทำไม SBOM อย่างเดียวไม่พอ

SBOM ตอบว่า *"มีอะไรอยู่ในต้นไม้บ้าง"* แต่ไม่มีใครอ่านมัน 500 บรรทัดทุกครั้ง คำถามที่ต้องตอบจริงคือ
สามข้อที่ SBOM ไม่ได้ตอบเอง:

1. **ของพวกนั้นอยู่ใต้ licence อะไร และมีใครรับรองหรือยัง**
2. **artifact ที่ส่งมอบมาจาก build ไหน commit ไหน**
3. **ผู้รับตรวจเองได้ไหมว่าไฟล์ที่ได้คือไฟล์เดียวกับที่ประกาศ**

## สัญญา

ไฟล์ `docs/evidence/supply-chain.json` (`schemas/supply-chain.schema.json`)
ตรวจด้วย `node .claude/supply-chain.js` หรือ `buaflow supply`

### 1. สรุป licence ถูก derive ใหม่ทุกครั้ง เขียนเองไม่ได้

`licenses.summary` คือจำนวน component ต่อ licence expression และตัวตรวจ **อ่าน SBOM แล้วนับใหม่
ทุกครั้ง** แล้วเทียบ — ไม่ตรงคือตก ทั้งกรณีนับน้อยไปและกรณีใส่ licence ที่ไม่มีอยู่จริง

ตัวเลขที่เขียนด้วยมือคือตัวเลขที่ค่อย ๆ เพี้ยน ที่นี่มันโกหกไม่ได้เลย

`sboms[]` ผูกด้วย `sha256` ที่ตัวตรวจคำนวณใหม่ — แก้ SBOM แล้ว **สรุปเก่าใช้ไม่ได้ทันที**
ไม่ใช่เปลี่ยนตามอย่างเงียบ ๆ ข้อความ error ตั้งใจพูดถึงอาการที่พบบ่อยที่สุดตรง ๆ:
*"ไฟล์ถูก regenerate แล้วลืมอัปเดต digest"*

### 2. licence ทุกตัวต้องมีคนรับรอง

| ทาง | แปลว่า |
|---|---|
| `policy.allowed` | licence ที่อนุญาตล่วงหน้าทั้งกลุ่ม (permissive ที่มีภาระแค่ attribution) |
| `reviewed[]` decision `allowed` | ดูเป็นรายตัวแล้วผ่าน พร้อมเหตุผลว่าภาระคืออะไรและทำไมถึงไม่ติด |
| `reviewed[]` decision `accepted-risk` | **ต้องชี้ไป approved exception ของ EP-002** ที่มีเจ้าของและวันหมดอายุ |

licence ที่ไม่อยู่ในสามทางนี้ = ตก · จำนวนใน `reviewed[]` ต้องตรงกับที่ derive ได้ ·
และ licence ที่อยู่ใน `policy.allowed` แล้วยังมาเขียน review อีก = ตก เพราะพูดสองอย่างพร้อมกัน

> **expression ที่ผิดรูปถูกเก็บไว้ตามจริง ไม่ทำให้สวย** — `"MIT and ISC"` (SPDX ต้องใช้ `AND`
> ตัวใหญ่), `"MIT | MIT"` (ประกาศซ้ำ) และ `NONE` ถูกนับเป็นค่าของมันเอง การ normalise
> มันทิ้งคือการซ่อนว่า publisher คนนั้น ship licence field ที่ parse ไม่ได้

### 3. provenance ต้องตรงกับหลักฐานที่มีอยู่แล้ว

`provenance` ไม่ได้เชื่อตัวเอง มันถูกเทียบกับของจริงสองอย่างที่โปรเจกต์มีอยู่แล้ว:

- **`evidence/ci-run.json`** (ของ EP-011) — repository, commit, workflow, runId, url ต้องตรงกันหมด
  และถ้า run นั้น `conclusion` ไม่ใช่ `success` ก็ตก เพราะ build ที่พังไม่ได้ผลิตของที่เชื่อถือได้
- **`docs/evidence/readiness.json`** — commit ต้องเป็น revision เดียวกับที่ manifest ตัดสินว่าผ่าน

provenance ที่ชี้ไป build คนละตัวกับที่ประกาศว่าผ่าน คือเอกสารสองใบที่พูดถึงคนละซอฟต์แวร์

### 4. checksum ต้องคำนวณใหม่ได้ ไม่ใช่พิมพ์ไว้

`provenance.subjects[]` ทุกตัวต้องเป็นไฟล์ในเรพที่ตัวตรวจ **คำนวณ sha256 ใหม่** แล้วตรงกัน
ของที่ให้ digest ไม่ได้ต้องอยู่ใน `notPublished` พร้อมเหตุผล — เช่น container image ที่ผู้ใช้
build เองจาก Dockerfile ไม่เคยถูก push ขึ้น registry จึงไม่มี digest ให้เทียบ การเขียนไว้ตรง ๆ
ว่า "ไม่มี และเพราะอะไร" ดีกว่าปล่อยให้ผู้อ่านคิดว่าลืม

## สิ่งที่การ review ครั้งแรกเจอจริง

| ที่เจอ | จำนวน | ผลการตัดสิน |
|---|---|---|
| component ที่ SBOM หา licence ไม่เจอเลย | 1 (nextjs) · 30 (สอง FastAPI app) | **accepted-risk** REQ-201 — component ที่ไม่มี licence ไม่ใช่ permissive แต่คือของที่ไม่มีสิทธิ์อะไรให้เลย |
| `(BSD-3-Clause OR GPL-2.0)` | 1 | allowed โดย**บันทึกว่าเลือก BSD-3-Clause** — ถ้าไม่บันทึก ต้นไม้จะดูเหมือนมีโค้ด GPL-2.0 ที่มีภาระผูกพัน |
| `Apache-2.0 AND LGPL-3.0-or-later (AND MIT)` | 2 | allowed — ใช้แบบไม่แก้ไข และแอปนี้ถูก deploy ไม่ได้ถูก redistribute ให้บุคคลที่สาม · **ให้ทบทวนใหม่ถ้าวันหนึ่ง image ถูก publish** |
| `MPL-2.0`, `EPL-2.0` | 4 + 1 | allowed — weak copyleft ระดับไฟล์ ใช้แบบไม่แก้ไข ภาระจึงผูกกับไฟล์ที่โปรเจกต์ไม่เคยแตะ |
| `MIT and ISC`, `MIT | MIT` | 2 | allowed — ทั้งคู่ permissive แต่บันทึกตามตัวอักษรเพื่อให้เห็นว่า metadata ต้นทางเสีย |

## additive

โปรเจกต์ที่ไม่มี `docs/evidence/supply-chain.json` ไม่ถูกตรวจข้อนี้เลย — 3.3.0 จึงเป็น MINOR
ตาม `standards/release-policy.md`
