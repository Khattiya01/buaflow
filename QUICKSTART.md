# Quickstart — 10 นาทีแรกกับ Buaflow

> สำหรับคนที่เพิ่งได้ kit มาและอยากรู้ว่า**มันทำอะไรให้โปรเจกต์ของฉันได้บ้าง** ก่อนจะอ่านอะไรยาว ๆ
> ทุกคำสั่งในไฟล์นี้ถูกตรวจโดย `npm run check` ว่ามีอยู่จริงและสะกดตรงกับที่ kit ใช้
> ติดตรงไหน → [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · อยากเห็นทั้งเส้นทางพร้อมผลจริง → [examples/worked-sample.md](examples/worked-sample.md)

## 0. สิ่งที่ต้องมี

- Node.js **22 ขึ้นไป** และ Git — ไม่ต้อง `npm install` อะไรเลย kit เป็น Node ล้วน
- วางโฟลเดอร์นี้ไว้ใน root ของโปรเจกต์เป็น `buaflow/`

```text
your-project/
├── buaflow/     ← repository นี้
└── ...          ← โค้ดของคุณ
```

ทุกคำสั่งข้างล่างรันจาก root ของโปรเจกต์

## 1. เครื่องพร้อมไหม

```bash
node buaflow/bin/buaflow.js doctor
```

บอก Node, Git, ว่า root อยู่ใน git work tree ไหม และเป็น **git root หรือ subdirectory**
(ถ้าเป็น subdirectory ของ monorepo — hook กับ CI ติดตั้งที่ git root ไม่ใช่ที่นี่)
คำเตือนเรื่อง `.claude` ยังไม่ติดตั้งเป็นเรื่องปกติจนกว่าจะถึง Phase 7

## 2. โปรเจกต์นี้อยู่ที่ระดับไหน — ถามได้เลย ไม่ต้องเขียนอะไรก่อน

```bash
node buaflow/bin/buaflow.js assess
```

ได้ตาราง control ของ R0–R3 ทุกตัวเป็น `pass` / `pending` / `fail` พร้อมเหตุผล และตอบสองอย่าง:

| คำตอบ | แปลว่า |
|---|---|
| **proven** | ระดับสูงสุดที่ทุก control ผ่านแล้วจริง |
| **reachable** | ระดับสูงสุดที่ยังไม่มีอะไร `fail` — ที่เหลือเป็น `pending` ที่คนปิดได้ |
| **blocking** | สิ่งที่ต้องแก้จริงก่อนขยับขึ้นระดับถัดไป |

`assess` ไม่รันโค้ดของคุณ ถ้าอยากให้มันรัน build / verify / test ที่หาเจอจริง:

```bash
node buaflow/bin/buaflow.js assess --execute
```

> ⚠️ `--execute` มี side effect เท่ากับ `npm run build` ของโปรเจกต์คุณ — อย่าชี้ไปที่โปรเจกต์ที่คุณไม่กล้ารันเทส

## 3. ห่างจาก Production-Qualified แค่ไหน

```bash
node buaflow/bin/buaflow.js benchmark
```

คะแนน **functional · engineering · operations** จากหลักฐานที่มีอยู่จริงในโปรเจกต์ ไม่มีช่องให้ใครพิมพ์ตัวเลข
แอปที่ Buaflow ไม่ได้สร้างก็วัดได้ด้วยคำสั่งเดียวกัน · คะแนนต่ำแปลว่า**หลักฐาน**น้อย ไม่ได้แปลว่าโค้ดแย่ —
อ่าน [standards/production-qualified-benchmark.md](standards/production-qualified-benchmark.md) ก่อนเอาตัวเลขไปเทียบ

## 4. เริ่มใช้กับ AI

เก็บ metadata กลางของโปรเจกต์ไว้ก่อน (ไม่แตะโค้ด ไม่แตะ config ของ AI tool):

```bash
node buaflow/bin/buaflow.js init --mode extend    # มีโค้ดอยู่แล้ว
node buaflow/bin/buaflow.js init --mode new       # โปรเจกต์ใหม่
```

แล้วเปิด Claude Code ที่ root ของโปรเจกต์ พิมพ์:

```text
อ่าน buaflow/START-HERE.md แล้วทำตาม เริ่ม Phase 0
```

- **มีโค้ดอยู่แล้ว** → ตอบโหมดเป็น `EXTEND` แล้ว AI จะพาเข้า [Phase A](phases/A-adopt-existing.md):
  สำรวจของเดิม ตั้งคำสั่ง verify ปรับ config ให้ตรงของจริง — **ไม่แก้โค้ดโปรดักชัน**
- **โปรเจกต์ใหม่** → Phase 1–7 ทีละ phase และ AI จะหยุดรอคุณตัดสินใจทุกครั้งที่จบ phase

## 5. หลังติดตั้ง (Phase 7) — ประตูเดียวก่อนเข้า main

```bash
node .claude/gate.js
```

verify + audit + secrets + check-config + docs-lint + หลักฐานของ EP ที่มีไฟล์ + eval ในคำสั่งเดียว
รันเองจาก pre-push hook และ CI · ถ้า verify ตกแล้วผ่านเมื่อรันซ้ำโดยไม่มีอะไรเปลี่ยน gate จะบอกว่า **FLAKY**
และจดไว้ใน `.verify-flakes.jsonl` แทนที่จะสอนให้คุณกด retry

กลับมาทำต่อใน session ใหม่ (AI ตัวไหนก็ได้):

```bash
node buaflow/bin/buaflow.js resume
```

## ต่อจากนี้

| อยาก | ไปที่ |
|---|---|
| เห็นทุกขั้นพร้อม output จริง | [examples/worked-sample.md](examples/worked-sample.md) |
| แก้อาการที่เจอ | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| รู้ว่าแต่ละคำสั่งทำอะไร เขียนไฟล์ไหม exit code อะไร | [CLI.md](CLI.md) |
| อัปเกรดจากเวอร์ชันเก่า | [UPGRADE.md](UPGRADE.md) |
| ภาพรวมทั้งระบบ | [README.md](README.md) |
