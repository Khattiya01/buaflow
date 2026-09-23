# Worked sample — จากคำถาม "อยู่ตรงไหน" ถึง "Production-Qualified" พร้อมผลจริง

> ทำตามได้ทันทีจาก root ของ repository นี้ ไม่ต้องติดตั้งอะไร ไม่ต้องมี database
> output ทุกชิ้นข้างล่างคัดมาจากการรันจริงเมื่อ 2026-09-23 (kit 3.8.0) — ตัวเลข commit/อายุหลักฐานของคุณจะต่างไป
> ทุกคำสั่งถูกตรวจโดย `npm run check` ว่ามีอยู่จริงและสะกดตรงกับ kit

ตัวอย่างนี้ใช้ `reference-apps/nextjs-postgres-crud` — แอป R3 ที่ Buaflow สร้างและพิสูจน์เอง
ท้ายไฟล์มีกรณีที่สอง: โปรเจกต์จริงที่ Buaflow **ไม่ได้**เขียน เพื่อให้เห็นว่าคำสั่งชุดเดียวกันตอบอะไรกับของจริง

```bash
cd buaflow        # root ของ repository นี้
```

---

## ขั้น 1 — เครื่องพร้อมไหม

```bash
node bin/buaflow.js doctor --root reference-apps/nextjs-postgres-crud
```

```text
buaflow doctor: OK — environment is usable with setup gaps
  warn: project-manifest: missing .buaflow/project.json; run buaflow init
  warn: controls: no .claude controls installed yet; this is normal before Phase 7
  warn: planning-state: missing docs/planning/_state.md; start or resume the lifecycle before implementation
```

**อ่านว่า:** exit 0 — ใช้งานได้ · สามคำเตือนคือสิ่งที่แอปนี้ไม่ได้ใช้ (มันเป็น reference app ไม่ใช่โปรเจกต์ที่เดิน lifecycle)
เพิ่ม `--json` เพื่อดูเช็กที่ผ่านด้วย รวมถึง `repository` ที่บอกว่า root นี้เป็น subdirectory ของ git repo

## ขั้น 2 — อยู่ที่ระดับไหน โดยยังไม่เชื่อ manifest ที่มีอยู่

```bash
node bin/buaflow.js assess --root reference-apps/nextjs-postgres-crud
```

```text
assess: proven none · reachable R3  (probes only — add --execute to run build/verify/tests)
  note: project root is not the git root (C:/Projects/buaflow); hooks and CI install at the git root
  R0  pass 2/3  pending 1  fail 0
      pass    version-control — HEAD is 067f9e92adc0
      pass    start-path — README.md documents a start command
      pending primary-flow — end-to-end tooling found (playwright.config.ts); which spec proves the primary flow is a human choice
  R1  pass 0/2  pending 2  fail 0
      pending build — build script found
      pending verification — a verify script was found
  R2  pass 2/5  pending 3  fail 0
      ...
      pass    ci — <git root>/.github/workflows/ci-nextjs-postgres-crud.yml has a recorded successful run (evidence/ci-run.json)
  R3  pass 0/15  pending 15  fail 0
      pending deployment-package — candidate found (Dockerfile)
      ...
```

**อ่านว่า:** probe เจอของที่ R3 ต้องการครบทุกข้อ (**reachable R3**) แต่พิสูจน์เองได้แค่ 4 ข้อ (**proven none**)
เพราะ `assess` ไม่เชื่อว่า "มีไฟล์" = "ผ่าน" · สิ่งที่ต้องใช้คนตัดสิน (เช่น spec ไหนพิสูจน์ primary flow)
ถูกบอกไว้ตรง ๆ ว่าเป็นดุลพินิจ · manifest ที่แอปนี้มีอยู่แล้วคือคำตอบของคำถามเหล่านั้น — ขั้นต่อไปตรวจมัน

## ขั้น 3 — ตรวจคำตอบที่เขียนไว้

```bash
node claude-setup/readiness.js --root reference-apps/nextjs-postgres-crud --file docs/evidence/readiness.json --level R3
```

```text
readiness R3: PASS (25/25 controls, 0d old)
  warn: evidence-freshness: no --max-age-days was supplied, so the evidence age is reported but not judged
```

**อ่านว่า:** manifest ประกาศครบและถูกรูปแบบ · ยังไม่ได้ตัดสินว่าหลักฐานเก่าเกินไปไหม — ส่ง `--max-age-days 90`
ถ้าต้องการ (หน้าต่างเวลาเป็นนโยบายของ**คนตรวจ** ไม่ใช่ของ manifest)

> ในโปรเจกต์ที่ติดตั้ง `.claude/` แล้ว คำสั่งเดียวกันคือ `node bin/buaflow.js readiness --level R3`

## ขั้น 4 — ไม่เชื่อคนเขียน manifest: ตรวจซ้ำจากหลักฐาน

```bash
node claude-setup/verifier.js --root reference-apps/nextjs-postgres-crud --level R3
```

```text
verifier R3: NO DISAGREEMENT (25 confirmed, 0 refuted, 0 unverifiable; commands not re-run — pass --execute)
```

**อ่านว่า:** verifier ตัดสินใหม่จากไฟล์หลักฐาน **โดยไม่อ่าน status ที่ประกาศ** แล้วค่อยเทียบ — ไม่มีข้อไหนขัดกัน
คำสั่งในหลักฐานยังไม่ได้ถูกรันซ้ำ ใส่ `--execute` ถ้าต้องการ (มี side effect จริง — อ่านคำเตือนใน CLI.md ก่อน)

## ขั้น 5 — หลักฐานที่อยู่นอก manifest

```bash
node claude-setup/requirement-coverage.js --root reference-apps/nextjs-postgres-crud --file docs/evidence/requirement-coverage.json
node claude-setup/security-baseline.js --root reference-apps/nextjs-postgres-crud --file docs/evidence/security-baseline.json --control-sets standards/control-sets
```

```text
requirement-coverage nextjs-postgres-crud: PASS (24 requirements — 12 proven, 12 excepted, 0 expired, 0 uncovered)
  accepted risk: 2 high, 5 medium, 5 low
  next to expire: REQ-004 on 2026-12-22 (90 days)
security-baseline nextjs-postgres-crud: PASS — OWASP Application Security Verification Standard 5.0.0 L1
  61 answered (30 met, 15 not met with an exception, 16 not applicable), 9 in 2 excluded chapter(s)
```

**อ่านว่า:** ครึ่งหนึ่งของ requirement **ไม่ได้พิสูจน์** แต่มี exception ที่มีเจ้าของ ระดับความเสี่ยง และวันหมดอายุ —
รวมถึงความเสี่ยงระดับ high สองข้อ · "PASS" ตรงนี้แปลว่า**ช่องว่างทุกข้อถูกยอมรับอย่างเป็นทางการ** ไม่ได้แปลว่าไม่มีช่องว่าง

## ขั้น 6 — Production-Qualified ไหม

```bash
node bin/buaflow.js benchmark --root reference-apps/nextjs-postgres-crud
```

```text
buaflow benchmark: OK — functional 1.00 · engineering 0.90 · operations 1.00 · production-qualified
  overall: 0.967
  qualified: true

project                        functional  engineering  operations  overall  PQA
nextjs-postgres-crud           1.00        0.90         1.00        0.97     yes
```

**อ่านว่า:** engineering เสีย 0.1 จากข้อเดียว — `agent-evals`: แอปนี้**ไม่มี eval สักเคส** ทั้งที่ kit บอกทุกโปรเจกต์ให้ทำ
ดูรายข้อได้ด้วย `--json`

---

## กรณีที่สอง — โปรเจกต์ที่ Buaflow ไม่ได้เขียน (EV-009)

คำสั่งชุดเดียวกันบน Bluepeak Hub (monorepo Express + Prisma + React, 16 migrations, ไม่เคยรู้จัก Buaflow)
บันทึกเต็มอยู่ที่ [development/trials/ev-009-bluepeak-hub.md](../development/trials/ev-009-bluepeak-hub.md)

| ขั้น | ผล |
|---|---|
| `assess --execute` (66 วินาที, tree สะอาดหลังรัน) | build + verify **ผ่านจริง** · **reachable R1 · R2 ติด `ci` ข้อเดียว** (CI ติด billing ของ GitHub) — ผลเดียวกับที่ trial หาด้วยมือด้วยการเขียน manifest 10 control |
| gate เต็ม | ผ่านทุกด่านใน 98 วินาที (verify 86 วินาที) |
| eval baseline 5 เคส (คนตอบและคนตรวจเป็นคนละ session) | **2/5 ผ่าน** · เจอข้อบกพร่องของ config 4 ข้อที่อ่านไฟล์แล้วไม่เห็น (K-11..K-14) |
| `benchmark` | functional 0.72 · engineering 0.24 · operations 0.21 · **overall 0.39** · ไม่ qualified |

ตัวเลข 0.39 เทียบกับ 0.97 **ไม่ได้แปลว่าโค้ดแย่กว่า** — Bluepeak Hub มี rate limit, security header และ logout
ที่ทำให้ session ใช้ไม่ได้จริง ซึ่ง reference app ข้างบนยอมรับเป็นความเสี่ยง (exception ในขั้น 5) · สิ่งที่ขาดคือ
**หลักฐานที่ตรวจได้** ของ R3: SBOM, rehearsal, runbook, security baseline — นั่นคือสิ่งที่ Buaflow ให้ค่าจริงกับโปรเจกต์นี้

## ลองกับโปรเจกต์ของคุณ

```bash
node buaflow/bin/buaflow.js assess
node buaflow/bin/buaflow.js benchmark
```

แล้วต่อที่ [QUICKSTART.md](../QUICKSTART.md) ข้อ 4
