# Changelog ของ buaflow

> kit นี้เป็นมาตรฐานที่พัฒนาต่อเนื่อง ไม่ใช่ของใช้แล้วทิ้ง
> ทุกครั้งที่บทเรียนจากโปรเจกต์จริงถูกย้อนกลับมาที่นี่ (Phase 8.7) ให้เพิ่มบรรทัดในไฟล์นี้

## v3.6.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v3.5.0 → คัดลอกไฟล์ + **แปลง eval case เป็น JSON** ([UPGRADE.md](UPGRADE.md) หัวข้อ v3.5.0 → v3.6.0)
> **MINOR:** ไม่มี `docs/evals/*.json` = ไม่ถูกตรวจ · เคส Markdown เดิมยังอ่านได้ด้วยตา แค่ไม่มีอะไรตรวจให้

- **eval ที่รันซ้ำได้** (`schemas/eval-case.schema.json`, `schemas/eval-run.schema.json`,
  `claude-setup/eval-harness.js`, EV-004) — รูปแบบเดิมเป็น Markdown ที่ลงท้ายด้วยตาราง
  "ผลการรันล่าสุด" ซึ่งคนกรอกเอง และ**ไม่มีอะไรบอกได้ว่าแถวนั้นตัดสินเคสเวอร์ชันไหน** ⇒
  แก้เคสให้ง่ายลงเมื่อไหร่ แถวที่เขียนว่า "ผ่าน" ก็ยังอยู่ตรงนั้นและยังอ่านว่าผ่านอยู่ดี
- **run ตรึงเวอร์ชันของเคส** ด้วย `caseRevision` — แก้ `prompt` / `criteria` / `passWhen`
  เมื่อไหร่ run เก่า **stale ทันที** · แต่แก้ `title` หรือใส่ `retired` **ไม่** ทำให้ stale
  เพราะสองอย่างนั้นไม่ได้เปลี่ยนสิ่งที่เคสถาม — ถ้าการปลดเคสทำให้ประวัติเป็นโมฆะ ก็จะไม่มีใครปลด
- **คะแนนถูก derive ใหม่ทุกครั้ง** จาก verdict รายข้อ · run ที่สรุป `pass` ขณะที่ verdict
  ของตัวเองบอกตรงข้าม = ตก · ข้อ `must-not-happen` ที่ถูกละเมิด ตกทั้งเคสไม่ว่าคะแนนจะเท่าไหร่
  เว้นแต่เคสประกาศยอมไว้เอง
- **คนเขียนเคสตรวจเคสตัวเองไม่ได้** — `gradedBy` ต้องต่างจาก `authoredBy` และ
  `session: "continued"` ตกเสมอ · บทเรียนตรง ๆ จาก EV-009 ที่ eval 5 เคสถูกเตรียมให้โปรเจกต์จริง
  แล้วจงใจไม่รัน เพราะ session ที่เขียน config เป็น session เดียวกับที่จะตรวจ — รูปแบบเดิม
  **บันทึกข้อจำกัดนั้นไม่ได้เลย**
- **รายงานสิ่งที่ต้องดูข้าม run ถึงจะเห็น** — `ablation-inconclusive` (ปิด rule แล้วผลไม่เปลี่ยน
  ⇒ ไฟล์นั้นไม่ใช่ตัวที่ทำให้เกิดพฤติกรรม) และ `nondeterministic` (caseRevision + commit + model
  เดียวกันแต่ผลต่าง ⇒ ข้อมูลเกี่ยวกับ**เคส** ไม่ใช่โมเดล) · `unclear` เป็น verdict ที่ใช้ได้
  และนับเป็นไม่ผ่าน เพราะมันคือรายงานว่าเกณฑ์ข้อนั้นเขียนไม่ชัด
- **`--render`** พิมพ์เคสเป็น Markdown ให้คนอ่าน โดยตรวจตัวเองว่าไม่ตกค่าอะไรไป
  (เทคนิคเดียวกับ `product-graph.js`) — machine-readable ไม่ได้แปลว่าคนต้องอ่าน JSON
- **เคสตั้งต้น 4 เคสย้ายมาเป็น `.json` ครบ** พร้อมรอบ ablation ทุกเคส และ `npm run check`
  ตรวจว่า `tests[]` ของมันยังชี้ไฟล์ที่มีอยู่จริงในเรพนี้ — เคสจะอยู่ต่อจาก rule ที่ถูกลบไม่ได้
- ตัวตรวจรูปแบบไม่เรียกโมเดล จึงใส่ใน gate ปกติได้ ต่างจากการรันเคสจริง

## v3.5.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v3.4.0 → คัดลอกไฟล์ + migrate profile ([UPGRADE.md](UPGRADE.md) หัวข้อ v3.4.0 → v3.5.0)
> **MINOR:** profile 1.0 ยังอ่านได้ปกติ มันแค่ไม่มี budget · ไม่มี `docs/evidence/budgets.json` = ไม่ถูกตรวจ

- **Budget ที่มาจาก profile** (`application-profile` **1.1**, `schemas/budget-evidence.schema.json`,
  `claude-setup/budgets.js`, EP-007) — การวัดเสร็จไปนานแล้ว แต่คำว่า **profile-specific** ที่
  roadmap และ deployment-ready-contract ใช้ ไม่เคยมีจริง: profile schema ไม่มี threshold สักตัว
  ตัวเลข `budgetMs: 3000` ในหลักฐานของแอปจึงเป็นเลขที่แอปตั้งให้ตัวเองแล้วให้คะแนนตัวเอง
- **เพดานอยู่ที่ profile · ตัวเลขอยู่ที่แอป** — `budget-evidence` **ไม่มีช่องให้ใส่เพดานเลย**
  โดยตั้งใจ · เปลี่ยน `profile` ของแอปจาก `internal-crud` เป็น `content` แล้วเส้นเปลี่ยนตาม
  โดยไม่ต้องแตะตัวแอป — แอปที่โหลด 2200ms ผ่าน internal-crud และตก content
- **ตัวเลขถูก derive ใหม่จากไฟล์หลักฐาน** ทุกครั้ง (หลักการเดียวกับสรุป licence ของ EP-004) ·
  metric ที่ profile กำหนดเพดานไว้แต่ไม่มีใครวัด = **ตก** ไม่วัดไม่ใช่ผ่าน · ทุกการวัดต้องมีคำสั่ง
  ที่รันซ้ำได้และไฟล์ที่มีอยู่จริง
- **migrator เลื่อน profile 1.0 → 1.1 โดยไม่เติม budget ให้เอง** เพราะการเติมคือการตัดสินใจแทน
  เจ้าของ profile ว่ามาตรฐานของเขาคืออะไร — มีเทสบังคับข้อนี้ไว้
- **`buaflow budgets`** — คำสั่งใหม่ · เพดานของ profile ทั้งสามที่ ship มาอยู่ใน
  `standards/profile-budgets.md`

## v3.4.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v3.3.0 → คัดลอกไฟล์ทับ จบ ([UPGRADE.md](UPGRADE.md) หัวข้อ v3.3.0 → v3.4.0)
> **MINOR:** ไม่มี `docs/evidence/operational-readiness.json` = ไม่ถูกตรวจ

- **Operational readiness: restore ที่ซ้อมจริง + incident hook ที่เป็นสัญญา**
  (`schemas/operational-readiness.schema.json`, `claude-setup/operational-readiness.js`, EP-005)
- **ความขัดแย้งที่ถูกแก้** — `standards/deployment-ready-contract.md` เขียนไว้ว่า Buaflow ต้องส่งมอบ
  "backup/restore **procedure**" แต่ runbook ของ reference app ทั้งสามอ้างตารางเดียวกันนั้นแล้วบอกว่า
  "this repository has no automated backup step" ซึ่งอ่านตารางผิด · **procedure เป็นของเรา ·
  schedule/retention/data policy เป็นของ platform** ตอนนี้ runbook ทั้งสามพูดตรงกับสัญญาแล้ว
- **การซ้อมต้องทำลายของจริง** — `scripts/rehearse-backup-restore.mjs` ปั๊ม fingerprint ของทุกแถว
  ทุกตาราง, `pg_dump`, **`DROP SCHEMA public CASCADE`**, ยืนยันว่าเหลือ 0 ตาราง, `pg_restore`,
  แล้วเทียบ fingerprint ว่า**เท่าเดิมเป๊ะ** · การ restore ที่ได้ตารางเปล่ากลับมาจะผ่านการเช็ก
  "ตารางครบไหม" และตกข้อนี้ · จบด้วยการรันคำสั่ง migration ตามที่ runbook สั่ง เพื่อยืนยันว่าเป็น no-op
  · รันด้วย Docker อย่างเดียว ไม่ต้องมี Postgres client บนเครื่อง
- **transcript ถูกอ่านจริง ไม่ใช่แค่ชี้ถึง** — `ok` ต้องเป็น true, `fingerprint.identical` ต้องเป็น true,
  และ sha256 ถูกคำนวณใหม่ · รันซ้ำแล้วไม่อัปเดต record = ตก
- **incident hook** ต้องมี signal ที่เจาะจงพอจะสร้าง alert ได้, detector ที่ไฟล์ยังอยู่จริง, severity,
  **เจ้าของที่เป็นชื่อคน** และ `firstResponse` ที่ชี้ไป `ไฟล์.md#anchor` ซึ่ง**ตัวตรวจ resolve กับหัวข้อจริง**
  — ลิงก์ที่ชี้ไปหัวข้อที่ถูกเปลี่ยนชื่อจะพังตอนตีสองพอดี
- **ทุก trust boundary ของ EP-003 ต้องมี hook เฝ้า** — EP-005 ไม่เขียน threat boundary ใหม่
  แต่ทำให้ช่องว่างระหว่าง "รู้ว่ามีเขตแดนตรงนี้" กับ "รู้ว่าจะรู้ได้ยังไงว่ามันพัง" มองเห็นด้วยเครื่อง
- **`buaflow operations`** — คำสั่งใหม่
- หลักฐานจริง: ทั้งสามแอปซ้อมแล้วจริงในรอบนี้ ข้อมูลกลับมาเหมือนเดิมทุกตัว
  (`evidence/backup-restore-rehearsal.json`)

## v3.3.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v3.2.0 → คัดลอกไฟล์ทับ จบ ([UPGRADE.md](UPGRADE.md) หัวข้อ v3.2.0 → v3.3.0)
> **MINOR:** ไม่มี `docs/evidence/supply-chain.json` = ไม่ถูกตรวจ

- **Supply-chain evidence: licence / provenance / checksum** (`schemas/supply-chain.schema.json`,
  `claude-setup/supply-chain.js`, EP-004) — SBOM ตอบว่า "มีอะไรอยู่ในต้นไม้" แต่ไม่ตอบสามข้อที่
  ต้องตอบจริง: ของพวกนั้นอยู่ใต้ licence อะไรและมีใครรับรองหรือยัง, artifact มาจาก build ไหน,
  และผู้รับตรวจเองได้ไหม · คำว่า provenance/SLSA/license เคยมีอยู่แค่ใน roadmap เท่านั้น
- **สรุป licence เขียนเองไม่ได้** — `licenses.summary` ถูก **derive ใหม่จาก SBOM ทุกครั้ง**
  แล้วเทียบ ไม่ตรงคือตก ทั้งนับน้อยไปและใส่ licence ที่ไม่มีอยู่จริง · SBOM ถูก pin ด้วย `sha256`
  ที่คำนวณใหม่ แก้ SBOM แล้วสรุปเก่าใช้ไม่ได้ทันที ไม่ใช่เปลี่ยนตามเงียบ ๆ
- **licence ทุกตัวต้องมีคนรับรอง** — `policy.allowed` ทั้งกลุ่ม, review รายตัว, หรือ
  `accepted-risk` ที่ต้องชี้ไป approved exception ของ EP-002 · expression ที่ผิดรูป
  (`MIT and ISC`, `MIT | MIT`, `NONE`) ถูกเก็บตามตัวอักษร ไม่ normalise ทิ้ง
- **provenance ถูกเทียบกับของจริง** — repository/commit/workflow/runId/url ต้องตรงกับ
  `evidence/ci-run.json` และ commit ต้องเป็น revision เดียวกับที่ readiness manifest ตัดสิน ·
  run ที่ `conclusion` ไม่ใช่ `success` ถูกปฏิเสธ
- **checksum ต้องคำนวณใหม่ได้** — `subjects[]` ทุกตัวถูก sha256 ใหม่จากไฟล์จริง ของที่ให้ digest
  ไม่ได้ต้องอยู่ใน `notPublished` พร้อมเหตุผล (container image ที่ผู้ใช้ build เองไม่เคยถูก push
  ขึ้น registry จึงไม่มี digest ให้เทียบ)
- **`buaflow supply`** — คำสั่งใหม่
- **สิ่งที่ review ครั้งแรกเจอ** — component ที่หา licence ไม่เจอเลย 1 ตัวใน nextjs และ **30 ตัว**
  ในสอง FastAPI app (ฝั่ง Python) บันทึกเป็น REQ-201 · `(BSD-3-Clause OR GPL-2.0)` ถูกบันทึกว่า
  **เลือก BSD-3-Clause** เพราะถ้าไม่บันทึก ต้นไม้จะดูเหมือนมีโค้ด GPL-2.0 ที่มีภาระผูกพัน ·
  LGPL แบบ conjunctive สองข้อผ่านโดยมีเงื่อนไขเขียนไว้ว่า "ให้ทบทวนใหม่ถ้า image ถูก publish"

## v3.2.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v3.1.0 → คัดลอกไฟล์ทับ จบ ([UPGRADE.md](UPGRADE.md) หัวข้อ v3.1.0 → v3.2.0)
> **MINOR:** โปรเจกต์ที่ไม่มี `docs/evidence/security-baseline.json` ไม่ถูกตรวจข้อใหม่นี้เลย

- **Security baseline: threat boundary + control set ภายนอก** (`schemas/security-baseline.schema.json`,
  `claude-setup/security-baseline.js`, EP-003) — `standards/deployment-ready-contract.md` สั่งไว้ตั้งแต่
  วันแรกว่า control `security-controls` ต้องการ "threat boundary + applicable ASVS/control proof"
  แต่คำว่า ASVS มีอยู่แค่สองไฟล์ในเรพ และไม่มีอะไรผลิตหรือตรวจ mapping นั้น · ตอนนี้ threat boundary
  เป็น **ข้อมูล** (entry point + ไฟล์ที่บังคับกฎ ซึ่งต้องมีอยู่จริง) และทุก control ของ control set
  ต้องมีคำตอบ — ข้อที่หายไปเฉย ๆ ทำให้ตก
- **`standards/control-sets/owasp-asvs-5.0.0-l1.json`** — สำเนา OWASP ASVS 5.0.0 เฉพาะ Level 1
  (70 ข้อจาก 345 ข้อ ใน 15 บท) ดึงจาก tag `v5.0.0` ของ repo ต้นทาง พร้อม `sha256` ของไฟล์ต้นฉบับ
  รายบท **ไม่ใช่ checklist ที่เขียนเอง** — `standards/security-checklist.md` ยังอยู่ แต่ถูกระบุชัดว่า
  ใช้ review รายวัน ไม่ใช่ฐานของการอ้างว่าผ่านมาตรฐาน
- **`not-met` ต้องชี้ไป approved exception ของ EP-002 ที่มีอยู่จริง** — ช่องโหว่ที่ยอมรับแล้วมีที่อยู่
  ที่เดียวในโปรเจกต์ และหมดอายุด้วยกติกาเดียวกัน · ชี้ไป requirement ที่พิสูจน์แล้วถูกปฏิเสธ
  ไม่งั้น requirement ที่ผ่านจะถูกใช้ฟอก control ที่ไม่ผ่าน
- **`buaflow security`** — คำสั่งใหม่ที่ delegate ไป `.claude/security-baseline.js`
- **สิ่งที่ baseline ครั้งแรกเจอ** — map กับ reference app สามตัวแล้วพบ 7 ช่องที่ `docs/security-notes.md`
  ไม่เคยเขียนถึง เพราะ prose บอกได้แค่ว่าแอปทำอะไร ไม่เคยบอกว่าไม่ได้ทำอะไร: **logout ไม่ทำให้
  session token ที่ถูกดักไว้ใช้ไม่ได้** (V7.4.1, risk high), **บัญชี seed ที่รหัสผ่านอยู่ในเรพ**
  (V6.3.2, risk high), ไม่มี security header เลย, TLS/HSTS ฝากไว้กับ edge ที่ไม่ได้ ship,
  ไม่มีฟังก์ชันเปลี่ยนรหัสผ่าน, cookie ไม่มี `__Host-` prefix, ไม่มีกำหนดเวลาเปลี่ยน dependency
  ที่มีช่องโหว่ — ทั้งหมดถูกบันทึกเป็น exception ที่มีเจ้าของและหมดอายุ 2026-12-22 ตามการตัดสินใจ
  ของเจ้าของโปรเจกต์ ไม่ได้ถูกแก้
  > reference app ทั้งสามผ่าน R3 ครบทุก control อยู่แล้วก่อนหน้านี้ และยังผ่านอยู่ · baseline ไม่ได้
  > ทำให้แอปแย่ลง มันทำให้สิ่งที่เป็นจริงอยู่แล้วมองเห็นได้ — 30 met / 16 not-applicable / 15–16 not-met

## v3.1.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v3.0.0 → คัดลอกไฟล์ทับ จบ ([UPGRADE.md](UPGRADE.md) หัวข้อ v3.0.0 → v3.1.0)
> **MINOR:** ของเดิมทำงานเหมือนเดิมทุกอย่าง โปรเจกต์ที่ไม่มี `docs/evidence/requirement-coverage.json`
> ไม่ถูกตรวจข้อใหม่นี้เลย ไม่มี gate ไหนที่เคยผ่านแล้วกลายเป็นไม่ผ่าน

- **Requirement coverage + approved exception** (`schemas/requirement-coverage.schema.json`,
  `claude-setup/requirement-coverage.js`, EP-002) — requirement หนึ่งข้อตอบได้ด้วย **proof** หรือ
  **exception ที่มี `owner` / `reason` / `risk` / `acceptedOn` / `expiresOn`** อย่างใดอย่างหนึ่ง
  มีทั้งคู่ = อย่างใดอย่างหนึ่งโกหก · ไม่มีเลย = requirement ที่ไม่มีใครตอบ · **exception ที่เลยวัน
  หมดอายุทำให้ gate ตก** ไม่ใช่แค่เตือน · `proof` ที่เป็น manual ล้วนไม่นับเป็น proof เพราะถ้านับ
  กลไกนี้เลี่ยงได้ด้วยประโยคเดียว
  > ทำไมถึงต้องมี: `standards/readiness-levels.md` ข้อ 4 เขียนไว้ตั้งแต่วันแรกว่า exception/waiver
  > ไม่ทำให้ control กลายเป็น `pass` แต่ไม่เคยมีที่ให้เขียน exception ลงไปเลย ผลคือ reference app
  > ทั้งสามตัวเก็บ "Known limitations" ไว้เป็น prose ใน `docs/security-notes.md` — ซื่อสัตย์
  > แต่ไม่มีเจ้าของ ไม่มีวันหมดอายุ และไม่มี gate ไหนอ่านมัน ตอนนี้ของพวกนั้นเป็น exception จริง
  > 12 ข้อกระจายอยู่ในสามแอป และหมดอายุพร้อมกันวันที่ 2026-12-22
- **`buaflow requirements`** — คำสั่งใหม่ที่ delegate ไป `.claude/requirement-coverage.js`
  (ตั้งชื่อว่า `requirements` ไม่ใช่ `coverage` เพราะ `.claude/run.js coverage` หมายถึง test coverage อยู่แล้ว)
- **`--max-window-days N`** — เพดานว่า "รับความเสี่ยงล่วงหน้าได้นานที่สุดกี่วัน" เป็นนโยบายของ
  **ผู้ตรวจ** ไม่ใช่ของ record เหมือน `--max-age-days` ของ EP-010 · ไม่ใส่ = รายงาน ไม่ตัดสิน ·
  `npm run check` ของ kit ใช้ 90 วันกับ reference app ทั้งสามตัว
- `standards/requirement-exceptions.md` — สัญญาฉบับเต็มและเหตุผลว่าทำไมมันต่างจาก evidence-freshness
- สาระเพิ่ม: `CLI.md` เพิ่มแถว `audit` ที่ขาดหายไปตั้งแต่ v3.0.0 และ
  `reference-apps/nextjs-postgres-crud/docs/requirements-traceability.md` เลิกบอกว่า `version-control`
  กับ `ci` ยังไม่ปิด ทั้งที่ปิดไปแล้วทั้งคู่

## v3.0.0 — 2026-09-23

> โปรเจกต์ที่ใช้ v2.3.4 → **[UPGRADE.md](UPGRADE.md)** หัวข้อ v2.3.4 → v3.0.0
> **MAJOR ตัวแรกในรอบนี้ และเป็นรีลีสแรกที่อยู่ใต้ `standards/release-policy.md`**

รอบนี้ไม่ได้มาจากบทเรียนของโปรเจกต์ผู้ใช้ แต่มาจากการทบทวนทิศทางของ kit เอง (D-011 ถึง D-013)
ที่อ่านจากตัวเรพแทนที่จะอ่านจากเอกสารของตัวเอง แล้วพบว่าหลายอย่างในแผนไม่ตรงกับความจริง

**ทำไมเป็น MAJOR:** `pack` schema ขึ้นจาก 1.0 เป็น 2.0 และ migration เป็น `manual` —
โปรเจกต์ที่มี `.claude/packs/*.json` ต้องเขียนใหม่ด้วยมือ ผู้ใช้ต้องลงมือ จึงเป็น MAJOR

- **Pack contract v2 — pack คือ recipe + assertion ไม่ใช่ template** (`schemas/pack.schema.json`, D-011/PP-010)
  Buaflow จะไม่สร้าง generator ที่ปั๊มโค้ดออกมาจาก pack เพราะ template generator แช่ dependency ไว้
  ที่วันที่เขียน จึงผลิตของเก่าทุกครั้งที่รัน และขัดกับ `phases/06-scaffold.md` ที่สั่งไว้ตั้งแต่ต้นว่า
  ให้ใช้ CLI ของเจ้าของ framework เสมอ · `setup[]` คือคำสั่งที่ต้องรัน (scaffolder **ห้าม pin เวอร์ชัน**
  และ `pack.js` ปฏิเสธให้เองโดยดูจากรูปคำสั่ง) · `generatedArtifacts` เปลี่ยนชื่อเป็น `requiredArtifacts`
  พร้อมเปลี่ยนความหมายเป็น "ไฟล์ที่ต้องมีอยู่จริงเมื่อเสร็จ" · `implementedBy` ผูก pack เข้ากับ reference
  app ที่พิสูจน์มัน · `upgrade[]` ถูกถอดออก (ว่างเปล่าทั้ง 9 pack ตั้งแต่วันแรก)
- **Independent verifier** (`claude-setup/verifier.js`, `buaflow audit`, BC-006) — ตัดสินจาก artifact
  และผลการรันจริงเท่านั้น ไม่เคยอ่าน `control.status` เป็นข้อมูลเข้า · ผลลัพธ์มีสามค่า: confirmed /
  refuted / **unverifiable** เพราะ "ยังไม่ได้ตรวจ" กับ "ตรวจแล้วจริง" ต้องไม่ถูกยุบเป็นอันเดียวกัน
- **Evidence freshness** (EP-010) — `readiness.js` มีผลลัพธ์ที่สาม `EXPIRED` (exit 4) เมื่อหลักฐาน
  เก่ากว่าหน้าต่างที่ผู้ตรวจกำหนด (`--max-age-days`) หรือ commit ไม่ใช่บรรพบุรุษของ HEAD อีกแล้ว
  หน้าต่างเป็นนโยบายของผู้ตรวจ ไม่ใช่ field ใน manifest จึงไม่ต้องแก้ schema และของเก่าทำงานเหมือนเดิม
- **Failure taxonomy** (EV-003) — 9 หมวดที่ทุกหมวดชี้ไปที่ความล้มเหลวจริงในเรพนี้ พร้อม citation
  ที่ test บังคับว่าต้อง resolve ได้ · ไม่มีหมวด operations เพราะที่นี่ยังไม่เคยรันอะไรใน production
  และประกาศช่องว่างนั้นไว้แทนการเติมหมวดลอย ๆ
- **CI ของ kit เอง** (BF-008) — `npm run check` ไม่เคยถูก workflow ไหนรันเลย ทั้งที่ตรวจ roadmap state,
  artifact contract, core→adapter drift และสวีตทั้งหมด
- **pack catalog ย้ายจาก `claude-setup/tests/fixtures/packs/` มาที่ `packs/`** (D-012) — ที่อยู่ของไฟล์
  บอกว่าโปรเจกต์คิดว่ามันคืออะไร และ catalog ของผลิตภัณฑ์ไม่ควรอยู่ใต้โฟลเดอร์ test
- **release policy ของ kit เอง** (`standards/release-policy.md`, EV-007) — เลขเวอร์ชันของ Buaflow
  แปลว่าอะไรกับผู้ใช้ พร้อม support matrix ที่เครื่องอ่าน (`schemas/compatibility.json`) และตัวตรวจ
  ที่ทำให้มันโกหกไม่ได้

## v2.3.4 — 2026-09-21

> โปรเจกต์ที่ใช้ v2.3.3 → **[UPGRADE.md](UPGRADE.md)** หัวข้อ v2.3.3 → v2.3.4 (copy ไฟล์เดียว)

บทเรียนจากโปรเจกต์จริง (ต่อจาก v2.3.3): board.md ไม่ conflict แล้วก็จริง แต่ยังมีช่องว่างอีกจุด — task file
เปลี่ยนเป็น `status: in-progress` ตอน `/task` ก็จริง แต่การแก้นั้นอยู่แค่บน branch ของคนที่ทำ ไม่ถึง `main`
จนกว่า PR จะ merge (ปกติคือตอนจบงานทั้งหมด) ระหว่างนั้นคนอื่น `git pull main` แล้ว generate board จะยังเห็นว่า
task นั้น `todo` อยู่ — จับจองไม่ทัน อาจมีคนหยิบไปทำซ้ำโดยไม่รู้ตัว

- **`/task` step 5 เปิด draft PR ทันทีตอน claim งาน** (`claude-setup/skills/task/SKILL.md`) — แทนที่จะรอ
  จนจบงานค่อยเปิด PR (แบบเดิม) ตอนนี้พอ set `status: in-progress` เสร็จ จะ commit เฉพาะการแก้ task file,
  push branch, แล้ว `gh pr create --draft` ทันที ทำให้คนอื่นเห็นว่า task นี้ถูกจับจองแล้วผ่าน PR list ของ
  git host โดยไม่ต้องรอ merge หรือพึ่ง board.md บน main เลย
- **`/done` เปลี่ยนจาก "เปิด PR" เป็น "push + `gh pr ready`"** (`claude-setup/skills/done/SKILL.md` ข้อ 2)
  เพราะ PR เปิดไว้แล้วตั้งแต่ `/task` — ยังมี fallback เปิด PR ใหม่ให้กรณี task เก่าก่อนอัปเดตนี้ หรือตอน claim
  ไม่มี `gh`/`glab`
- คนที่อยากทำต่อจาก task ที่คนอื่นเริ่มค้างไว้: ดู `branch:` ในไฟล์ task (หรือดู draft PR) แล้ว
  `git fetch origin <branch> && git checkout <branch>` ทำต่อได้เลย — ไม่เกี่ยวกับ board.md
- **เจอบั๊กระหว่างทาง: ไม่มี skill ไหนเคยตั้ง `assignee:` ในไฟล์ task เลย** ทั้งที่ template มี field นี้อยู่แล้ว
  ผลคือคอลัมน์ "ใครทำ" ใน board.md ว่างเปล่าเสมอ และ `docs-lint.js` (เช็ค WIP เกิน 1 ต่อคน) เก็บทุกคนไว้
  bucket เดียวกัน (`(ไม่ระบุ)`) — แก้โดยให้ `/task` step 5 ตั้ง `assignee:` จาก `git config user.name`
  (fallback `user.email`) เป็นแค่ label ไว้บอกว่างานนี้ใครถือ ไม่ได้ให้ AI เอาไปตัดสินใจอะไร
- **step 1 เปลี่ยนจาก "สแกน board หาว่ามี WIP ของใครค้างอยู่" เหลือแค่ "เช็ค task ที่ขอทำตัวเดียว"**
  (`claude-setup/skills/task/SKILL.md`) — ตัดสินตอนแรกคือให้ AI เทียบ `assignee:` กับ git identity
  เพื่อแยกว่า WIP อื่นที่เห็นในบอร์ดเป็นของเราเองหรือของเพื่อนร่วมทีม แต่พิจารณาใหม่แล้วไม่จำเป็น: ผู้ใช้สั่ง
  `/task <ID>` มาตรงๆ อยู่แล้ว รู้ดีอยู่แล้วว่าจะทำอะไร ไม่ต้องให้ AI เดาจากบอร์ดว่า "นี่ใช่งานที่ user ค้างไว้ไหม"
  เลย — ยิ่งเดายิ่งเสี่ยงเข้าใจผิด ตอนนี้เช็คแค่ว่า **task ที่ขอทำตัวเดียวกัน** ถูกจับจองไปแล้วหรือยัง (ข้อเท็จจริง
  ล้วนๆ ไม่ต้องตีความ) ถ้าใช่ → บอกว่าใครถือแล้วหยุด ถ้าไม่ใช่ → ทำต่อได้เลย ไม่สนใจ WIP อื่นในบอร์ดทั้งหมด

## v2.3.3 — 2026-09-21

> โปรเจกต์ที่ใช้ v2.3.2 → **[UPGRADE.md](UPGRADE.md)** หัวข้อ v2.3.2 → v2.3.3 (copy ไฟล์ + 1 คำสั่ง)

บทเรียนจากโปรเจกต์จริง: ทำงานหลาย task พร้อมกันคนละ branch แล้วเปิดหลาย PR — ทุกครั้งที่ PR แรก merge
เข้า main, PR ที่เหลือ conflict ที่ `docs/backlog/board.md` ตลอด เพราะ `/done` สั่งให้ regenerate ทั้งไฟล์
แล้ว commit คู่กับ task file — ไฟล์นี้เป็น derived view ล้วน ๆ (generate จาก `docs/backlog/tasks/*.md`)
พอหลาย branch generate คนละเวอร์ชันแล้วมา merge กัน จึงชนกันทุกรอบไม่ว่าจะ rebase บ่อยแค่ไหน

- **`docs/backlog/board.md` เข้า `.gitignore`** (`templates/gitignore.tpl`) — ไม่ track ในgitอีกต่อไป ไม่มีทาง conflict เพราะไม่เคยอยู่ใน diff
- **`/done` ไม่สั่ง commit board.md แล้ว** (`claude-setup/skills/done/SKILL.md` ข้อ 4) — ยัง `node .claude/board.js` เหมือนเดิม แค่ไม่เอาเข้า git
- **`.husky/post-merge` + `.husky/post-checkout` ใหม่** (`claude-setup/ci/{post-merge,post-checkout}.tpl`) — เพราะพอ board.md ไม่ commit
  แล้ว ถ้าไม่มีอะไร regenerate ให้ พอ `git pull` เอา task ที่คนอื่นปิดจบเข้ามา จะไม่เห็นสถานะจนกว่าจะเปิด Claude Code ก่อน
  สอง hook นี้รัน `node .claude/board.js` อัตโนมัติทันทีหลัง pull/merge/switch branch (scaffold ใหม่ติดตั้งให้เลย, โปรเจกต์เก่าดู UPGRADE.md)
- **`session-context.js` regenerate board.md ให้อัตโนมัติตอนเปิด session** ถ้าไฟล์ยังไม่มีหรือเก่ากว่า task ล่าสุด — แก้ปัญหาที่ไฟล์ไม่มีให้อ่านตอน clone ใหม่ หรือค้างจาก branch อื่น
- **`session-context.js` แก้บั๊ก worktree เดียวกับที่เคยแก้ใน `guard-edit.js`/`guard-bash.js`** — เดิมใช้ `CLAUDE_PROJECT_DIR`
  (ชี้ primary checkout เสมอ) แทน `process.cwd()` ทำให้ subagent ที่รันใน git worktree แยก (`isolation: "worktree"`)
  เห็น branch/board/task ของ checkout หลักผิดตัวตอนเปิด session ตอนนี้ทั้ง 3 hook สอดคล้องกัน
- `docs-sync.md` อัปเดตข้อความให้ตรง (never commit ไม่ใช่แค่ never hand-edit)
- **เอา step `board --check` ออกจาก `gate.js`** — เดิมเช็คว่า board.md ที่ commit มาตรงกับที่ควร generate ไหม (v2.1)
  ไม่ใช่ `warnOnly` แปลว่าถ้า fail คือ**บล็อก push จริง** พอ board.md ไม่ถูก commit อีกต่อไป ไฟล์นี้จะไม่มีในเครื่องที่ยังไม่เคยรัน
  hook สักครั้ง (เช่น fresh clone ก่อน pre-push แรก) → เช็คจะ fail แล้วบล็อกทุกคนโดยไม่เกี่ยวกับคุณภาพโค้ดเลย ตัดทิ้งไปเลย
  (`node .claude/board.js --check` ยังใช้ตรวจมือได้อยู่ แค่ไม่ผูกกับ gate อัตโนมัติแล้ว)

## v2.3.2 — 2026-09-20

> โปรเจกต์ที่ใช้ v2.3.1 → **[UPGRADE.md](UPGRADE.md)** หัวข้อ v2.3.1 → v2.3.2 (copy ไฟล์เดียว)

บทเรียนจากโปรเจกต์จริง (Phase 8.7): canvas 1 ลิงก์ที่ design หลายหน้า + theme + global component รวมกัน
แล้วสั่ง "เขียนโค้ดให้ตรง design" รวดเดียวทุกหน้า ได้ผลไม่ตรง เพราะไม่มี baseline ต่อหน้าให้เทียบ และเพราะ build ไปก่อนแล้วค่อยปรับ UI ทีหลัง
สวนทางลำดับที่ kit ตั้งใจ (theme/shadcn ล็อกก่อน → build ทีละหน้าเทียบ baseline → pixel diff ผ่านค่อยไปหน้าถัดไป)

- **`claude-setup/skills/ui/SKILL.md` เส้นทาง canvas เขียนชัดขึ้น** — เดิมบอกแค่ "save each artboard's HTML" กำกวมว่าต้องแยกไฟล์ก่อน build จริงจังแค่ไหน
  ตอนนี้ระบุตรง ๆ ว่า 1 canvas link ออกแบบหลายหน้า/theme/component รวมกันได้ (ปกติ) แต่**ต้อง extract เป็น `.dc.html` แยกไฟล์ต่อหน้าก่อนเสมอ** — ลิงก์รวมไม่ใช่ build reference
  และเพิ่มกฎ **"หนึ่งหน้าต่อครั้งเสมอ"**: แม้มี baseline หลายหน้าพร้อมแล้ว ห้ามรับคำสั่ง "เขียนโค้ดให้ตรง design" เป็น batch ทุกหน้า ต้อง build → pixel diff → ปิดงาน ทีละหน้า

## v2.3.1 — 2026-09-20

> โปรเจกต์ที่ใช้ v2.3 → **[UPGRADE.md](UPGRADE.md)** หัวข้อ v2.3 → v2.3.1 (copy ไฟล์ ~5 นาที)

ปิดช่องที่ "กฎยังเป็นแค่ข้อความ" ในสามจุด — security scan, secret, และ pixel diff

- **`gate.js` เรียก `audit` จริง** — เดิม `commands.audit` มีใน `stack.json` แต่ gate ไม่เรียก = security scan ไม่ได้บังคับก่อน merge
  ค่าเริ่มต้น `auditMode: "warn"` (รายงานแต่ไม่บล็อก — โปรเจกต์เก่ามีหนี้ช่องโหว่สะสม จะได้ไม่ถูกขวางวันแรก) และกรองเฉพาะ
  `--audit-level=high` · เคลียร์ high/critical หมดแล้วสลับเป็น `"required"` · **กระทบ `/release`** ที่เรียก audit ผ่าน `run.js` ตัวเดียวกัน (เกณฑ์ high ขึ้นไป)
- **`gate.js` สแกน secret ด้วย gitleaks** — 50 commit ล่าสุด (`--redact`) `secretsMode: "required"` เป็นค่าเริ่มต้น
  ไม่มี gitleaks ในเครื่อง = skip พร้อมบอกวิธีติดตั้ง ไม่ fail (kit ยังไม่มี dependency นอก Node) · สลับ `warn` / `off` ได้ใน `stack.json`
- **`claude-setup/pixel.js` + `docs/design/pixel.json`** — ขั้น pixel diff ของ `/ui` เดิมเป็นคำสั่งให้ AI ประกอบ screenshot + diff เอง
  (ผลไม่คงที่ · ไม่มีอะไรบังคับ · เปิดภาพเข้า context ทุกรอบ) ตอนนี้สคริปต์ทำทุกคู่ viewport/theme แบบเดียวกัน
  แล้วคืน **% ที่ต่าง + ขนาดไม่เท่ากัน + พิกัด y/x ของบริเวณที่ต่าง** — AI แก้จากตัวเลข เปิดภาพเฉพาะตอนสงสัย
  ไม่ได้เขียน diff เอง: ใช้ Playwright + pixelmatch + pngjs ของโปรเจกต์ (dev dependency ติดตั้งใน Phase 6)
  · ยังไม่ผูกเข้า `gate.js` (ต้องเปิดแอปและ browser ช้าเกินด่าน pre-push) · เกณฑ์เป็น % ของทั้งหน้า ส่วนเล็กอย่างปุ่มผิดสีอาจต่ำกว่าเกณฑ์ 0.5% — ตั้ง `maxDiffPercent` ให้เข้ม (template ใช้ 0.1)

## v2.3 — 2026-09-19

> โปรเจกต์ที่ใช้ v2.2 อยู่ → **[UPGRADE.md](UPGRADE.md)** หัวข้อ v2.2 → v2.3 (~10 นาที copy ไฟล์ ไม่มีอะไรต้องตัดสินใจ)

ปิด loop ฝั่ง design: **design → prototype ที่กดได้ → โค้ดที่ตรง design 100%** โดยมี canvas เป็น source of truth เดียวตลอดทาง

- **`/ui` ต่อกับ Claude Design ได้ตรง ๆ แล้ว** — เดิมเส้นทาง D (canvas) มีแค่ตอน intake Phase 3 กับ drift sync 8.8
  พอสั่ง `/ui` หน้าใหม่ที่ไม่มี design มันเสนอ 2 option เป็น text เท่านั้น ตอนนี้ถาม **text หรือ canvas** และ canvas ต้องผ่าน 3 ด่านก่อน:
  `docs/design/brief.md` (ใหม่: `templates/design-brief.tpl.md` — สัญญาระดับโปรเจกต์ครั้งเดียว + ระดับงานทุกครั้ง เพราะ canvas
  ไม่มีคำตอบให้กับสิ่งที่ไม่ได้ถาม มันจะเดา) · แนบ Design System project เดิมให้ประกอบจาก component ที่มีจริง · storybook ต้องไม่ stale
  (`last_storybook_sync` เทียบ HEAD → `/design-sync` ก่อน) · theme "เดิม/ปรับ/ใหม่" ให้ผลต่างกัน — ปรับ = token-level, ใหม่ทั้งที่มีหน้าแล้ว = intent + ADR
- **"ตรง design 100%" วัดได้ ไม่ใช่ดูด้วยตา** — `ui-component-rules.md` ข้อ 8: screenshot ที่ viewport เดียวกับ artboard → pixel diff
  (`pixelmatch`/`odiff`) → ไล่แก้จน diff เหลือเฉพาะแถว `deviation` (คอลัมน์ใหม่ใน `docs/design/components.md`) ที่ผู้ใช้ตกลง
  และ **deviation ต้องย้อนไปแก้ canvas ให้ตรงโค้ด** commit baseline ใหม่ทันที — ไม่งั้น 8.8 รอบหน้าอ่านเป็น "คนแก้ canvas" แล้วย้อนโค้ด วน ping-pong ไม่จบ
- **`/prototype` + `claude-setup/prototype.js`** — click-through prototype ให้ทีม/ลูกค้ากดดู flow ก่อนเขียนโค้ด
  ไม่วาดอะไรใหม่เลย: copy artboard `.dc.html` ทั้งก้อนแล้วฉีด `<script>` ท้าย `</body>` เป็น overlay (hotspot + mock data)
  → ตรง canvas 100% **โดยโครงสร้าง** ไม่ใช่โดยความพยายาม · `flow.json` (`templates/prototype-flow.tpl.json`) บอกว่าหน้าไหนกดอะไรไปไหน
  + `bindings` ใส่ mock data จาก `data/*.json` (เขียนมือ หรือ export จาก DB แบบ sanitize — ห้ามข้อมูลลูกค้าจริงเข้า repo)
  · shell มี viewport / state / dark / back / present mode · ⚠ ถ้า selector ไม่เจอใน artboard · `--check` fail ถ้าอ้างไฟล์/หน้าที่ไม่มี
  · `dist/` generate ล้วน ห้ามแก้มือ ห้าม commit · **baseline เปลี่ยน = regenerate** ไม่งั้นทีมคุยกับ design ที่ไม่มีอยู่แล้ว

## v2.2 — 2026-09-19

เลิก hardcode ชื่อเครื่องมือไว้ในสคริปต์ — **ไม่ใช่การเพิ่ม feature แต่คือการแก้ "เขียวปลอม"**
อาการเดิม: สคริปต์ฝัง `pnpm` / `\.tsx?$` / `prettier` / `.husky` เป็น regex ตายตัว โปรเจกต์ที่ไม่ตรงค่าเริ่มต้น
(รวม **JS/TS ที่ใช้ npm แทน pnpm หรือ Biome แทน Prettier** ไม่ใช่แค่ stack อื่น) จะเจอ hook ที่ exit 0 เงียบ ๆ เหมือนทำงานปกติ

- **`claude-setup/stack-config.js` + `stack.json`** — ที่เดียวที่รู้ว่าโปรเจกต์ใช้เครื่องมืออะไร
  (`verifyCommand`, `codeFilePattern`, `formatCommands`, `preflightHookPath`, `protected`)
  ใช้กติกาเดียวกับ `guard-edit.js`/`protected-paths.json` ซึ่งเป็นต้นแบบ: DEFAULTS ในสคริปต์ = ค่าเดิมเป๊ะ ๆ,
  ทับรายคีย์, ไฟล์พังก็ถอยไปค่าเริ่มต้นเงียบ ๆ → **โปรเจกต์ JS/TS เดิมไม่มีอะไรเปลี่ยน**
  **แทน `protected-paths.json`** (ไฟล์เดิมยังอ่านได้เป็น fallback — ดู UPGRADE.md)
- **`claude-setup/verify.js`** — ทางเข้าเดียวของคำสั่งตรวจ
  `allowed-tools: Bash(pnpm verify*)` เป็นกฎที่บังคับจริง ไม่ใช่ข้อความ — โปรเจกต์ที่ไม่ใช้ pnpm จึงรัน verify ของตัวเองไม่ได้เลย
  ทุก skill ที่เกี่ยวมี `Bash(node .claude/*)` อยู่แล้ว เรียกผ่านไฟล์นี้จึงผ่าน permission โดยไม่ต้องแก้ frontmatter
- **`claude-setup/run.js`** — คำสั่งรองตามชื่อ (`coverage`, `audit`, `apiTest`) อ่านจาก `commands` ใน `stack.json`
  เหตุผลเดียวกับ verify.js: `/release` มี `Bash(pnpm *)` ซึ่งใช้ไม่ได้กับ stack อื่น · คำสั่งที่ไม่ได้ตั้ง = บอกตรง ๆ แล้ว exit 1 ไม่ใช่เงียบแล้วผ่าน
- **`ciMode` — CI เป็น "ระดับ" ไม่ใช่มี/ไม่มี** (`required` / `pr-only` / `local-only`)
  เดิม kit สมมติว่ามี CI เสมอ แต่นาที Actions มีจำกัด (ฟรีไม่จำกัดเฉพาะ repo public) และบางโปรเจกต์ไม่มี remote เลย
  `local-only` = ไม่มี CI โดยตั้งใจ → `check-config` เลิกเตือนเรื่องไฟล์ CI แต่**เปลี่ยน pre-push ที่หายไปจาก warn เป็น FAIL**
  เพราะเมื่อไม่มี CI แล้ว hook ตัวนั้นคือด่านเดียวที่เหลือนอก session ของ Claude
- **ลดนาที CI ใน template** — `github-actions.yml.tpl` เดิมรัน 2 รอบต่องาน (`pull_request` + `push: main`)
  ทั้งที่ merge ทุกครั้งผ่าน PR ที่เพิ่งตรวจไปแล้ว · ตัด `push` ออก และเพิ่มการตรวจว่าแตะแต่ `docs/` `*.md` ไหม
  ถ้าใช่ข้าม `pnpm install` แล้วรัน `gate.js --docs-only` (โหมดที่ `gate.js` มีอยู่แล้วแต่ CI ไม่เคยเรียก)
  ไม่ใช้ `paths-ignore` เพราะ required check ที่ไม่เคยรัน = PR ค้าง merge ไม่ได้ตลอดไป · `.gitlab-ci.yml.tpl` ตัด rule ซ้ำเหมือนกัน
- **`check-config.js` เลิกรายงานผ่านทั้งที่ไม่ได้ทดสอบ** — เดิมใช้ path สมมติ (`src/components/ui/button.tsx`)
  เป็น fixture ตอนทดสอบ hook ซึ่ง hook ตัดสินจาก pattern ล้วน จึงได้ exit ตามที่คาดเสมอแล้วขึ้น `ok`
  ตอนนี้ใช้เฉพาะไฟล์ที่มีอยู่จริง ไม่มีก็ `warn` ว่าข้ามเทส · เพิ่มการตรวจว่า `format-changed.js` มี formatter ที่ match จริงไหม
  · rule ตายพร้อมกันทุกไฟล์ → พิมพ์บรรทัดวินิจฉัยว่าเป็นเรื่อง stack ไม่ตรง ไม่ใช่พิมพ์ผิดทีละอัน

## v2.1 — 2026-09-17

> โปรเจกต์ที่ใช้ v1.0 อยู่ → **[UPGRADE.md](UPGRADE.md)** (ไม่ต้องรัน Phase ใหม่ ~1 session)

ปิดวงจรให้ใช้ production ได้จริง + ลด token ที่ซ้ำ ~30-40% ต่อ task cycle
จากการ audit ทั้ง kit เทียบกับ Claude Code official docs (memory/rules, skills, hooks, costs, commands)
**ทุกฟีเจอร์ที่ v2.0 อ้างว่ามีในเอกสารทางการ ตรวจแล้วมีจริงทั้งหมด** — ที่เปลี่ยนคือส่วนที่ยังเป็นกฎอ่อนหรือซ้ำซ้อน

### ปิดช่องโหว่ระดับ production (P0)

- **`claude-setup/gate.js`** — ด่านเดียว verify + check-config + docs-lint + board --check
  รันจาก `.husky/pre-push` (`ci/pre-push.tpl`) และ CI (`ci/github-actions.yml.tpl`, `ci/gitlab-ci.yml.tpl` เตรียมไว้ทั้งคู่)
  → กฎของ kit เป็น**กฎแข็งนอก session ของ Claude** ตั้งแต่ Phase 6 ไม่ต้องรอเลือก git host (เดิม "CI-ready" = honor system)
- **`claude-setup/docs-lint.js`** — เปลี่ยนกฎอ่อน 6 ข้อเรื่อง "เอกสารต้องตรงกัน" เป็นกฎแข็ง 1 ข้อ:
  task ที่ทำงานอยู่ → intent/spec/plan ต้องมีจริง, spec ต้องไม่เหลือ `[NEEDS CLARIFICATION]`, done ต้องมี commit,
  WIP ≤ 1, intent accepted ต้องมีปลายทาง, `--release <M>` บังคับทุก task done และ**ไม่มี `-test` ค้าง** (ปิดหนี้เทส frontend)
- **AI ไม่ merge เข้า main** — `guard-bash.js` บล็อก `git merge` บน main / `git push` เข้า main / `push --no-verify`
  `/done` เปิด PR แทน คนกด merge (ทำงานคนเดียวก็ทำ — ได้ประวัติผู้อนุมัติและ gate ได้รันจริง) + `EV-004-no-self-merge`
- **`/release` รันจบได้ตั้งแต่ยังไม่มี deploy target** — gate --release → build image ครั้งเดียว + digest → release note → แผน rollback
- **Data model v1 (Phase 4.4b)** — ล็อก core entities / ID / tenancy / soft delete / audit ก่อน scaffold
  `prisma/schema.prisma` = source of truth ตัวเดียว, `/spec` design.md เขียน DB change เป็น diff เทียบ schema
  (เดิมไม่มีโมเดลกลาง → feature หลังสร้างตารางซ้ำกับ feature ก่อนโดยไม่มีอะไรจับ)
  + เกณฑ์ diagram: ERD core / auth sequenceDiagram / topology **ตาราง** คุ้ม — C4 ครบชั้น / infra poster ไม่คุ้ม

### ลด token (`standards/context-budget.md` ใหม่ — อธิบายทุกข้อว่าตัดอะไรเพราะอะไร และอะไรห้ามตัด)

- **plan.md เป็นตัวบีบอัด** — หัวข้อใหม่ "ข้อกำหนดที่คัดมาแล้ว" (AC + มาตราธรรมนูญ + กติกา design + pattern)
  `/task` `/check` `code-reviewer` อ่าน plan.md **ไฟล์เดียว** ไม่ย้อนอ่าน spec/constitution/DoD ซ้ำ (เดิมอ่าน 3-4 รอบต่อ task)
- **`templates/verify.mjs.tpl`** — verify ที่พิมพ์สรุป ≤ 25 บรรทัด log เต็มลง `.verify.log` → "แปะผลจริง" ยังบังคับอยู่ในราคา 1/10
- **ไฟล์ task = source of truth ตัวเดียว** — `board.js` generate `board.md` (hook บล็อกแก้มือ), **ตัด `import.csv`**
  (เดิม `/done` เขียนข้อเท็จจริงเดียวกัน 3 ที่ทุกครั้ง)
- **DoD ราย type ย้ายไป `.claude/rules/`** ที่โหลดเองตาม path — `definition-of-done.md` เหลือหน้าจอเดียว (เดิม 7.6KB ถูก Read 2-3 ครั้ง/task)
- `/check` รายงาน**เฉพาะข้อที่ไม่ผ่าน** (`DoD: N/M — ไม่ผ่าน: …`) ส่งผลของ built-in/subagent ผ่านตามที่มันเขียน ไม่สรุปซ้ำ
- "ป้อนกลับเข้า config" ถามที่ `/done` ที่เดียว (เดิม `/review` + `/done` ถามซ้ำ)
- `code-reviewer` อ่านแค่ plan + diff + REVIEW.md (เดิม 7 เอกสาร) และ**ไม่**ไล่หาบั๊กทั่วไปเพราะ `/code-review` ทำไปแล้ว
- **`model:` ในทุก agent** — legacy-explorer: haiku, test-writer/code-reviewer: sonnet + ตารางโมเดลต่อขั้นใน AGENTS.md.tpl
- **trivial track** — typo/copy/log/chore ไม่ต้อง intent/plan (`track: trivial` ในไฟล์ task) กันคนเลิกใช้ระบบเพราะงานจิ๋วต้องผ่าน 5 skill
- `/done` → `/clear` เสมอ + compact instructions ใน CLAUDE.md.tpl
- `` !`…` `` ทุกตัวต่อท้าย `|| true` (docs: คำสั่งที่ fail จะ abort ทั้ง skill — repo ที่ยังไม่มี commit พัง)

### ไฟล์ที่ AI อ่านอย่างเดียวเป็นภาษาอังกฤษ

`AGENTS.md.tpl`, `CLAUDE.md.tpl`, `REVIEW.tpl.md`, `claude-setup/rules/*`, `claude-setup/skills/*`, `claude-setup/agents/*`, ข้อความ stderr/additionalContext ของ hooks,
`reason` ใน `stack.json` — ภาษาไทย tokenize แพงกว่าอังกฤษ ~2 เท่า และไฟล์กลุ่มนี้ถูกโหลดทุก session
ทุกไฟล์มีคำสั่ง "reply to the user in Thai / write docs/ artifacts in full Thai" ไฟล์ที่คนอ่าน (phases, standards, docs templates, START-HERE, README) ยังเป็นไทย
(กฎเหล็กข้อ 6 ใน START-HERE ระบุข้อยกเว้นนี้แล้ว)

### ใช้ built-in ของ Claude Code แทนเขียนเอง

- **`/review` → `/check`** — `/review` เป็น alias ของ built-in `/code-review` ชื่อชนกัน (`check-config.js` ตรวจชื่อชน built-in แล้ว)
- `/check` เรียก **`/code-review [low|medium|high]`** + **`/security-review`** (เมื่อแตะ auth/api/db) ก่อน subagent ของเรา
  → subagent เหลือตรวจเฉพาะสิ่งที่ built-in ไม่รู้ (ตรงกับ plan ไหม / กติกาโปรเจกต์)
- Phase 8 เพิ่ม **`/doctor`** (หา skill/MCP ไม่ได้ใช้, hook ช้า, เสนอตัด CLAUDE.md), **`/insights`** (รายงาน friction รายเดือน), `/context`
- Phase 7 เพิ่ม **`fewer-permission-prompts`** (สแกน transcript แล้วเสนอ allowlist แทนนั่งเดา), `update-config`
- Phase A เพิ่ม **`/init` (`CLAUDE_CODE_NEW_INIT=1`)** + **`/import`** ทำ A.1 ครึ่งหนึ่งให้
- evals: `claude plugin eval` + `skill-creator` สำหรับรันอัตโนมัติเมื่อเคสเกิน ~10
- `/ui` ใช้ skill `run` ถ่าย screenshot เทียบ design

### check-config.js เพิ่มตรวจ

ชื่อ skill ชน built-in / `!`…`` ไม่มี `|| true` / agents ไม่มี `model:` / มี docs-lint, board, gate / pre-push เรียก gate / มีไฟล์ CI /
hook เคสใหม่: push เข้า main, push --no-verify, merge บน main, แก้ board.md

### ยังไม่ทำ (ตั้งใจ)

| เรื่อง | เหตุผล |
|---|---|
| `Stop` hook บังคับ verify | pre-push gate ทำหน้าที่นี้ที่ขอบ repo แล้ว — เปิดเมื่อ verify < 30 วิ และทีมอยากได้ต่อเทิร์น |
| CI รัน Claude แบบ non-interactive (`claude -p`) | ต้องเลือก git host ก่อน — gate ตอนนี้ไม่ต้องใช้โมเดล จึงต่อได้ทันที |
| ERD generate อัตโนมัติใน CI | ใส่ `prisma-erd-generator` ตอน release ก็พอ — อย่าให้ diagram เป็นของที่ต้อง maintain |
| git worktree / agent teams | WIP = 1 ยังเป็นกติกา — docs ระบุ agent teams กิน token ~7 เท่า |

## v2.0 — 2026-09-15

ยกเครื่องตาม **Anthropic AI-Native SDLC Playbook** + Claude Code official docs
+ แนวทางจาก GitHub Spec Kit และ AWS Kiro

### เพิ่มใหม่

**ปิดวงจรให้ครบ (หัวและท้ายที่ขาดไป)**
- `templates/intent.tpl.md` + skill `/intent` — ประตูเข้าเดียวของงานใหม่ จับ "ทำไม" ก่อน "ทำอะไร"
- `templates/plan.tpl.md` + skill `/plan` — บังคับวางแผนใน plan mode และ commit ก่อนแตะโค้ด
- skill `/release` — ขั้นตอนปล่อยของที่แยกจาก `/done`
- `phases/08-tune-and-evolve.md` — รอบทบทวน config ที่ทำซ้ำเรื่อย ๆ

**ชั้นควบคุมที่บังคับได้จริง (เดิมมีแต่ข้อความว่า "ห้าม")**
- `claude-setup/hooks/` — 4 hooks เขียนด้วย Node ล้วน รันได้ทุก OS
  - `session-context.js` ฉีดสถานะ board เข้า context ตอนเปิด session
  - `guard-edit.js` บล็อกการแก้ `components/ui/**` และไฟล์เทสขณะแก้บั๊ก
  - `guard-bash.js` บล็อก `--no-verify`, การรัน sonar เอง, force push main
  - `format-changed.js` format + lint เฉพาะไฟล์ที่แก้ แล้วส่ง error กลับเข้า context
- `claude-setup/settings.json.tpl` — permissions allow/deny + การผูก hooks
- `claude-setup/rules/` — 6 rules ที่โหลดเฉพาะตอนแตะไฟล์ที่ตรง `paths:`
- **`claude-setup/check-config.js`** — ตรวจสุขภาพ config 8 หมวด ที่สำคัญที่สุดคือ
  **`paths:` ของแต่ละ rule match ไฟล์จริงกี่ไฟล์** และ **รัน hook ด้วย input จำลองแล้วเช็ก exit code**
  เพราะ config ของ AI พังแบบเงียบได้ ต่างจากโค้ดที่พังแล้วมี error
  ใช้ใน Phase 7 (ตอนติดตั้ง) และ Phase 8 (ทุกรอบทบทวน)

**เกณฑ์การตัดสินที่เป็นไฟล์ ไม่ใช่ความทรงจำ**
- `templates/constitution.tpl.md` — ธรรมนูญ 9 มาตราที่ `/spec` `/plan` `/review` ใช้ตัดสิน
- `templates/REVIEW.tpl.md` — นโยบายรีวิว แยกจากวิธีรีวิว พร้อมเพดานข้อสังเกตและกฎกัน over-engineering

**ทำให้ config เรียนรู้ได้**
- `claude-setup/evals/` + `templates/eval-case.tpl.json` — regression test ของ config
- หมวด "สิ่งที่ AI ในโปรเจกต์นี้เคยทำผิด" ใน `AGENTS.md` + กฎเลื่อนชั้นเมื่อพลาดซ้ำ
- `standards/agent-config.md` — คู่มือว่ากฎข้อไหนควรไปอยู่ชั้นไหน
- Phase 8 ใช้ `/usage` (attribution ราย skill / subagent / MCP + flag พฤติกรรม) เป็นเครื่องมือตรวจ
  แทนการสร้าง dashboard เอง พร้อมตารางวิธีตีความตัวเลข

**ไม่ผูก vendor**
- `templates/AGENTS.md.tpl` เป็นแกน (มาตรฐานกลางที่ Codex/Cursor/Copilot/Gemini อ่านได้)
- `CLAUDE.md` เหลือเป็นชั้นบางที่ `@AGENTS.md` แล้วต่อด้วยของเฉพาะ Claude Code

**ใช้กับโปรเจกต์ที่มีโค้ดอยู่แล้ว**
- `phases/A-adopt-existing.md` — โหมด `EXTEND` มีตัวเลือกอยู่ใน Phase 0 ตั้งแต่ v1 แต่ไม่มี Phase ไหนรองรับ
  ตอนนี้แทน Phase 1–6 ด้วยขั้นเดียว: สำรวจไม่ตัดสิน → ตั้ง `verify` ให้ผ่านก่อน → ADR ย้อนหลัง →
  ธรรมนูญแบบ "ของใหม่ vs ของเก่า" → ปรับ config ให้ตรงของจริง → ตัดสิน source of truth ของงาน
- ธรรมนูญมาตรา 9.1 — กฎของใหม่/ของเก่า กัน AI refactor ทั้งระบบเพราะเห็นว่าโค้ดเดิมขัดมาตรฐาน
- `claude-setup/protected-paths.json` — `guard-edit.js` อ่านรายการไฟล์ที่ห้ามแก้จาก config
  แทน hardcode `components/ui/` (โปรเจกต์เดิมอาจไม่มี path นี้เลย) ถ้าไฟล์หายหรือพัง hook ถอยไปใช้ค่าเริ่มต้น
- START-HERE §5 แยกเป็น "นโยบาย" (ใช้ทุกโปรเจกต์) กับ "ค่าเริ่มต้นทางเทคนิค" (ของจริงชนะ)
  และ **UI library เปลี่ยนจากล็อกยี่ห้อเป็นเกณฑ์ 5 ข้อ** (ซอร์สในโปรเจกต์ / registry / a11y / token / training data)
  เพราะการล็อก shadcn ก่อน Phase 2 = แอบตัดสินว่าเป็น React และ AI ไม่รู้เหตุผล — Phase 2 รอบ B0 ประเมินตามเกณฑ์นี้

### เปลี่ยน

- **`claude-setup/commands/` → `claude-setup/skills/`** ตามที่ Claude Code รวม custom command
  เข้ากับ skills แล้ว ได้ frontmatter ควบคุมการเรียก (`disable-model-invocation`,
  `allowed-tools`, `context: fork`) และ dynamic context injection
  (`/review` ดึง `git status`/`diff` มาให้ในตัว)
- `spec.tpl.md` — AC เปลี่ยนเป็น **EARS notation**, เพิ่ม `[NEEDS CLARIFICATION]`,
  เพิ่ม gate checklist ท้ายทุกไฟล์, เพิ่มตาราง map AC กับวิธีพิสูจน์
- `definition-of-done.md` — เพิ่มข้อ "แปะผลลัพธ์จริง", "ทำ Proof ครบ", "diff ตรงกับ plan"
- `task.tpl.md` — เพิ่ม `intent:`, `plan:` และหมวด Proof
- `code-reviewer.md` — อ่าน `REVIEW.md` + ธรรมนูญ, เทียบ diff กับ plan,
  เพิ่มกฎกันการรายงานเกินจำเป็น
- `agents/README.md` — อธิบายลำดับชั้น 4 ชั้น และเหตุผลที่ไม่ทำ agent ตามตำแหน่งงาน
- กฎเหล็ก CI/CD: จาก "ยังไม่ทำ" → **"ยังไม่ต่อ แต่ต้อง CI-ready"**
- Phase 2 เพิ่มการตัดสิน `pnpm verify` พร้อมเกณฑ์เวลา (~30 วินาที)
- Phase 6 เพิ่มการเก็บ output ตอนที่ทุกอย่างผ่าน ไปใส่ `AGENTS.md`
- Phase 7 เขียนใหม่ทั้งไฟล์ — ติดตั้ง config 4 ชั้น + ทดสอบ hook จริง + รัน eval baseline

### ยังไม่ทำ (ตั้งใจ)

| เรื่อง | เหตุผล |
|---|---|
| `Stop` hook บังคับ verify | รอให้ `pnpm verify` เร็วพอ (< 30 วิ) ก่อน ไม่งั้นรอทุกเทิร์น |
| CI ที่รัน Claude แบบ non-interactive | **รอแค่ตัดสินใจ git host — ไม่ใช่เรื่องเงิน** ตรวจแล้วว่า `claude setup-token` ให้ OAuth token ที่ใช้ subscription รันใน CI ได้ ไม่ต้องซื้อ API credit (เหลือแค่ค่า runner minutes และการที่ CI จะแย่งโควต้า seat กับงาน interactive) |
| monitoring → intent อัตโนมัติ (control band) | ยังไม่มี metric ที่เก็บจริง — ตั้ง metric ง่าย แต่ไม่มีใครให้ dashboard |
| git worktree ทำงานขนาน | กติกายังเป็นทำทีละ 1 task — เปิดเมื่อทีมโตกว่านี้ |
| managed settings / sandbox / plugin marketplace | เหมาะกับองค์กรที่มี platform team ทีมเล็กใส่แล้วขวางตัวเอง |

## v1.0 — 2026-09-13

- 7 Phase สำหรับตั้งโปรเจกต์ใหม่ (discovery → stack → UI → architecture → backlog → scaffold → handoff)
- 9 standards, 5 templates
- 6 slash commands, 3 subagents
