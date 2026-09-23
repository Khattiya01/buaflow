# Phase 7 — ส่งมอบ (Handoff) และเปิดใช้ระบบจริง

> เป้าหมาย: แปลงทุกอย่างที่วางแผนไว้ให้กลายเป็น **config ที่ทำงานจริง** ไม่ใช่แค่เอกสารที่หวังว่าจะมีคนอ่าน
> ใช้ได้ทั้งโปรเจกต์ใหม่ (มาจาก Phase 6) และโปรเจกต์เดิม (มาจาก Phase A) — โปรเจกต์เดิมให้ยึด `docs/planning/A1-inventory.md` เป็นแหล่งข้อมูลแทน Phase 1-6
> หลังจบ Phase นี้ โปรเจกต์จะเดินด้วยตัวเองผ่าน `intent → spec → plan → code → review → done`

## ของที่ต้องคายออกมา (แบ่งเป็น 4 ชั้น)

| ชั้น | ไฟล์ | ความแข็ง |
|---|---|---|
| ความรู้ที่ต้องรู้ตลอด | `AGENTS.md` + `CLAUDE.md` | แนะนำ |
| ข้อบังคับเฉพาะโซนไฟล์ | `.claude/rules/*.md` | แนะนำ ตรงจุด |
| ขั้นตอนที่ทำซ้ำ | `.claude/skills/*/SKILL.md` | แนะนำ เรียกได้ |
| **กฎที่ห้ามพัง** | `.claude/hooks/` + `.claude/settings.json` | **บังคับ** |

---

## 7.1 `docs/constitution.md` — ธรรมนูญโปรเจกต์ (ทำก่อนเพื่อน)

ใช้ `buaflow/templates/constitution.tpl.md` แล้วเติมมาตรา 9 จากผลการตัดสินใจใน Phase 1-5

ไฟล์นี้คือเกณฑ์ที่ `/spec`, `/plan`, `/review` และ `code-reviewer` จะใช้ตัดสิน —
ถ้าไม่มี ทุกอย่างที่เหลือจะไม่มีอะไรให้ยึด

**ต้องเติมให้ครบ:** `{{VERIFY_COMMAND}}` และเวลาที่ยอมรับได้ของมัน

## 7.2 `AGENTS.md` — กติกาหลัก (สำคัญที่สุด)

ใช้ `buaflow/templates/AGENTS.md.tpl` เติมค่าจริงจาก Phase 1-6

**ภาษา:** ไฟล์นี้ (และ `CLAUDE.md`, `REVIEW.md`, `.claude/rules/`, `.claude/skills/`, `.claude/agents/`) เป็น**ภาษาอังกฤษ** — AI อ่านทุก session และภาษาไทย tokenize แพงกว่า ~2 เท่า
ค่าที่เติม (ชื่อโปรเจกต์, คำอธิบาย, โครงโฟลเดอร์) เขียนอังกฤษให้สอดคล้อง หมวด "Language" ในไฟล์สั่งให้ AI ตอบผู้ใช้และเขียน `docs/` เป็นไทยอยู่แล้ว
หมวด "สิ่งที่ AI ในโปรเจกต์นี้เคยทำผิด" ในไฟล์ชื่อ **"Things the AI gets wrong in this project"** — เวลา Phase 8 / `/done` บอกให้เขียนลงหมวดนี้ หมายถึงหมวดนั้น

**กติกาการเขียน:**
- **สั้นและเป็นคำสั่ง** ไม่ใช่เอกสารอ้างอิง
- ยาวไม่เกิน **~200 บรรทัด** รายละเอียดให้ลิงก์ไป `docs/`
- เกณฑ์ตัดทุกบรรทัด: *"ถ้าลบบรรทัดนี้ AI จะทำผิดไหม"* ถ้าไม่ผิด → **ตัดทิ้ง**
- ของที่ผูกกับไฟล์บางกลุ่ม → ย้ายไป `.claude/rules/` **อย่ายัดเข้ามา**
- ขั้นตอนยาวเกิน ~30 บรรทัด → ย้ายไปเป็น skill

**ต้องมี 2 อย่างนี้เสมอ:**
1. **ตัวอย่างผลลัพธ์ตอนที่ทุกอย่างผ่าน** ของ `{{VERIFY_COMMAND}}` — วางผลจริงที่รันได้ตอน Phase 6
   (AI ต้องรู้ว่า "ผ่าน" หน้าตาเป็นยังไง ไม่งั้นมันเดาเอง)
2. **หมวด "สิ่งที่ AI ในโปรเจกต์นี้เคยทำผิด"** — เริ่มว่างไว้ได้ แต่ต้องมีหัวข้อรอ

## 7.3 `CLAUDE.md` — ชั้นบางสำหรับ Claude Code

ใช้ `buaflow/templates/CLAUDE.md.tpl`

บรรทัดแรกต้องเป็น `@AGENTS.md` (import) แล้วต่อด้วยเฉพาะของที่เป็นของ Claude Code:
รายการ skills, ตาราง rules, ตาราง hooks, การจัดการ context

**ห้ามเขียนกติกาซ้ำใน 2 ไฟล์** — ถ้าซ้ำแล้วขัดกัน AI จะเลือกเองแบบสุ่ม

> ทำไมต้องแยก: `AGENTS.md` เป็นมาตรฐานกลางที่ Codex / Cursor / Copilot / Gemini อ่านได้ด้วย
> วันที่เปลี่ยนเครื่องมือ ความรู้โปรเจกต์ไม่หายไปกับ Claude Code

## 7.4 ติดตั้ง `.claude/` ทั้งชุด

```
buaflow/claude-setup/skills/*        →  .claude/skills/
buaflow/claude-setup/rules/*         →  .claude/rules/
buaflow/claude-setup/agents/*        →  .claude/agents/
buaflow/claude-setup/hooks/*         →  .claude/hooks/
buaflow/claude-setup/check-config.js →  .claude/check-config.js
buaflow/claude-setup/docs-lint.js    →  .claude/docs-lint.js      ตรวจว่า artifact chain ยังตรงกัน
buaflow/claude-setup/readiness.js    →  .claude/readiness.js      ตรวจ R0-R4 จาก evidence manifest
buaflow/claude-setup/verifier.js     →  .claude/verifier.js       ตรวจซ้ำ evidence ของ manifest นั้นอย่างอิสระ ไม่เชื่อคำประกาศของผู้สร้าง (BC-006)
buaflow/claude-setup/failure-taxonomy.js → .claude/failure-taxonomy.js  หมวดความล้มเหลว + ตรวจ failure record (EV-003)
buaflow/claude-setup/board.js        →  .claude/board.js          generate board.md จากไฟล์ task
buaflow/claude-setup/prototype.js    →  .claude/prototype.js      click-through prototype จาก canvas baseline (เฉพาะโปรเจกต์ที่ใช้ canvas)
buaflow/claude-setup/pixel.js        →  .claude/pixel.js          เทียบหน้าจริงกับ canvas baseline เป็นตัวเลข (เฉพาะโปรเจกต์ที่ใช้ canvas · ต้องมี pixelmatch + pngjs + Playwright เป็น dev dependency)
buaflow/claude-setup/gate.js         →  .claude/gate.js           ด่านเดียว: verify + audit + secrets + check-config + docs-lint
buaflow/claude-setup/verify.js       →  .claude/verify.js         ทางเข้าเดียวของคำสั่งตรวจ
buaflow/claude-setup/run.js          →  .claude/run.js            คำสั่งรอง: coverage / audit / apiTest
buaflow/claude-setup/stack-config.js →  .claude/stack-config.js   ตัวอ่าน stack.json ที่สคริปต์อื่นใช้ร่วมกัน
buaflow/claude-setup/stack.json      →  .claude/stack.json        stack ของโปรเจกต์นี้ (แทน protected-paths.json เดิม)
buaflow/claude-setup/ci/pre-push.tpl →  .husky/pre-push
buaflow/claude-setup/ci/*.yml.tpl    →  .github/workflows/gate.yml และ/หรือ .gitlab-ci.yml
buaflow/claude-setup/settings.json.tpl  →  .claude/settings.json
buaflow/templates/readiness-manifest.tpl.json → docs/evidence/readiness.json
buaflow/templates/failure-record.tpl.json → docs/evidence/failures/F-00x.json (เมื่อมีเรื่องให้บันทึก)
```

> ถ้าทำ Phase 6 ขั้น 3 แล้ว 4 สคริปต์แรกกับ pre-push จะมีอยู่แล้ว — ตรวจว่าเป็นเวอร์ชันเดียวกับ kit

**ต้องปรับระหว่างคัดลอก (ห้ามคัดดิบ):**

| ไฟล์ | ปรับอะไร |
|---|---|
| `stack.json` | **ปรับตัวนี้ก่อนเพื่อน** — สคริปต์ที่เหลืออ่านค่าจากไฟล์นี้: `verifyCommand`, `codeFilePattern`, `formatCommands`, `preflightHookPath`, `protected` · stack ที่ไม่ใช่ JS/TS แก้ที่นี่ที่เดียว |
| `rules/*.md` | `paths:` ต้องตรงกับโครงโฟลเดอร์จริงที่ scaffold ไว้ |
| `skills/*/SKILL.md` | คำสั่งต้องเป็นคำสั่งที่มีจริงในโปรเจกต์ (คำสั่ง verify ไม่ต้องแก้ — เรียกผ่าน `node .claude/verify.js` แล้ว) |
| `settings.json` | `permissions.allow` ตามคำสั่งจริง, `deny` ตามไฟล์ลับจริง — **อย่านั่งเดา**: หลังใช้ 1-2 สัปดาห์รัน skill `fewer-permission-prompts` มันสแกน transcript แล้วเสนอ allowlist ให้ / แก้ hook หรือ settings ทีหลังใช้ skill `update-config` |
| `skills/check/` | ชื่อคือ `/check` **ไม่ใช่ `/review`** — `/review` เป็น alias ของ built-in `/code-review` ที่ `/check` เรียกใช้ข้างใน |
| `stack.json` → `protected` | รายการไฟล์ที่ generate อัตโนมัติของโปรเจกต์นี้ — ถ้าไม่ได้ใช้ shadcn ให้ลบ `components/ui/**` ออก (ไม่ต้องแก้สคริปต์ hook) |

ถ้ามี `stack.json`, `pixel.json` หรือ prototype `flow.json` จาก Buaflow รุ่นก่อนที่ยังไม่มี
`schemaVersion` ให้อ่าน `standards/artifact-versioning.md` และใช้ migrator แบบ preview ก่อน `--write`
ห้ามเติม version ใหม่ด้วยมือโดยไม่ตรวจ diff เพราะ version คือ contract ที่โปรแกรมใช้ตัดสิน compatibility

**แล้วรันตัวตรวจ** — ห้ามข้าม:

```bash
node .claude/check-config.js
```

มันตรวจให้ ~10 หมวด: โครงสร้างครบไหม / `AGENTS.md` ยาวเกินหรือมี placeholder ค้างไหม / ชื่อ skill ชน built-in ไหม / agents มี `model:` ไหม / มี gate scripts + pre-push + CI ไหม /
**`paths:` ของแต่ละ rule match ไฟล์จริงกี่ไฟล์** / ไฟล์โค้ดที่ไม่มี rule คุ้มครอง /
skills มี description และความยาวโอเคไหม / hook ผูกใน `settings.json` และมีไฟล์จริงไหม /
**รัน hook ด้วย input จำลองแล้วเช็ก exit code จริง** / โฟลเดอร์ artifact chain ครบไหม

ต้องได้ `ต้องแก้: 0` ก่อนไปต่อ ส่วน `ควรดู:` ไล่ให้หมดเท่าที่ทำได้

สร้าง `docs/evidence/readiness.json` จาก template แล้วเลือกระดับปัจจุบันตาม
`standards/readiness-levels.md` — ตอนเริ่มใช้งาน control ส่วนใหญ่เป็น `pending` ได้ แต่ห้ามอ้างว่า
ผ่านระดับนั้นจนคำสั่งต่อไปคืน exit code 0:

```bash
node .claude/readiness.js --file docs/evidence/readiness.json --level R0
```

R3 ต้องผูก manifest กับ commit SHA จริง และหลักฐานชนิด `file` ต้องมีอยู่ภายใน repository
ส่วนการบังคับ R3 ใน release gate ให้เปิดเมื่อโปรเจกต์ตั้ง production mode แล้ว ไม่ควรทำให้ adoption รอบแรกพังเพราะยังเก็บ evidence ไม่ครบ

เมื่อ evidence ครบและทีมกำลังจะส่งมอบ Production Candidate ให้ตั้ง `assuranceMode: "production"`,
`readinessLevel: "R3"`, `auditMode: "required"` และ `secretsMode: "required"` ใน `stack.json`
แล้วรัน full gate เท่านั้น โหมดนี้จะบล็อก scanner/verify ที่หาย, manifest ที่ไม่ผ่าน และ `--docs-only`

**แล้วรัน gate ทั้งด่าน** — นี่คือคำสั่งเดียวกับที่ pre-push และ CI จะรัน:

```bash
node .claude/gate.js
```

ถ้าผ่านที่นี่แต่ CI ไม่ผ่าน = env ต่างกัน (DB, node version) ไม่ใช่กฎต่างกัน

**สิ่งที่มันจะจับได้แน่ ๆ ตอนติดตั้งครั้งแรก:**

| จะเห็น | แปลว่า | ทำ |
|---|---|---|
| `AGENTS.md ยังมี placeholder {{...}}` | ยังไม่ได้เติมค่าจริง | เติมให้ครบ |
| `rule ... มี pattern ที่ไม่ match อะไรเลย` | คัดลอกมาดิบ ๆ โดยไม่ปรับให้ตรงโครง | **ลบ pattern ที่ไม่ใช้ออก** (เช่น ใช้ App Router ก็ไม่ต้องมี `**/pages/**`) |
| `rule ... ไม่ match ไฟล์ไหนเลย` | **rule ตายเงียบ** — อันตรายที่สุด | แก้ `paths:` ให้ตรงโครงจริง |
| `ไฟล์โค้ด ... ไม่มี rule ไหนคุ้มครอง` | มักเจอกับ `packages/*` ใน monorepo | ตัดสินว่าต้องมี rule ไหม แล้วเพิ่ม pattern |

> hook ที่ไม่ทำงาน **อันตรายกว่าไม่มี hook** เพราะทำให้เข้าใจผิดว่ามีการป้องกันอยู่
> rule ที่ `paths:` ไม่ตรงก็เหมือนกัน — มันเงียบไปเลยโดยไม่มี error บอก

## 7.5 `REVIEW.md` — นโยบายการรีวิว

ใช้ `buaflow/templates/REVIEW.tpl.md` วางที่ราก repo
ปรับเพดานข้อสังเกตและรายการ "ไม่ต้องรายงาน" ให้ตรงโปรเจกต์

## 7.6 คัดลอก standards และ templates เข้าโปรเจกต์

```
buaflow/standards/*.md                 →  docs/standards/
buaflow/templates/intent.tpl.md        →  docs/templates/
buaflow/templates/plan.tpl.md          →  docs/templates/
buaflow/templates/spec.tpl.md          →  docs/templates/
buaflow/templates/task.tpl.md          →  docs/templates/
buaflow/templates/adr.tpl.md           →  docs/templates/
buaflow/templates/eval-case.tpl.md     →  docs/templates/
buaflow/templates/design-brief.tpl.md  →  docs/templates/
buaflow/templates/prototype-flow.tpl.json →  docs/templates/
buaflow/templates/evidence-register.tpl.md    →  docs/templates/
buaflow/templates/process-flow.tpl.md         →  docs/templates/
buaflow/templates/pain-point-register.tpl.md  →  docs/templates/
buaflow/templates/outcome-review.tpl.md       →  docs/templates/
buaflow/claude-setup/evals/*.md        →  docs/evals/
```

ระหว่าง copy ให้ **ปรับเนื้อหาให้ตรงกับ stack จริง** อย่า copy ดิบ ๆ

สร้างโฟลเดอร์เปล่าพร้อม `.gitkeep`: `docs/intents/`, `docs/plans/`, `docs/incidents/`, `docs/releases/`, `docs/discovery/`
(`docs/discovery/` ใช้เฉพาะตอนเข้าเงื่อนไข `docs/standards/discovery-and-validation.md` — ส่วนใหญ่จะว่างเปล่าตลอด และไม่เป็นไร)

## 7.7 `CONTRIBUTING.md` และ `README.md` ของโปรเจกต์

- `CONTRIBUTING.md` — สำหรับคน: setup เครื่อง, รัน docker, รัน test, รัน sonar, branch/commit convention, ขั้นตอนรีวิว
- `README.md` — ภาพรวม, stack, **3 บรรทัดแรกต้องรันได้จริง**, ผังโฟลเดอร์, ลิงก์เอกสารสำคัญ

## 7.8 `docs/workflow.md` — วงจรการทำงานประจำวัน

คัดจาก `buaflow/standards/workflow-lifecycle.md` มาปรับให้ตรงโปรเจกต์

## 7.9 แช่แข็งผลงาน planning

- `docs/planning/*` เก็บไว้เป็นหลักฐานการตัดสินใจ **อย่าลบ**
- ถ้าการตัดสินใจเปลี่ยนภายหลัง → **เขียน ADR ใหม่ที่ supersede อันเก่า** อย่าไปแก้ ADR เดิม

## 7.10 ตรวจก่อนปิด

**ชั้นเอกสาร**
| ข้อ | ผ่าน |
|---|---|
| `docs/constitution.md` มีครบ และมาตรา 9 ตรงกับที่ตกลงจริง | ⬜ |
| `AGENTS.md` ไม่เกิน 200 บรรทัด และมีตัวอย่างผลลัพธ์ตอนผ่าน | ⬜ |
| `CLAUDE.md` บรรทัดแรกเป็น `@AGENTS.md` และไม่มีกติกาซ้ำ | ⬜ |
| `REVIEW.md` อยู่ที่ราก repo | ⬜ |
| `docs/backlog/board.md` มี task พร้อมหยิบทำ | ⬜ |

**ชั้น config — ต้องทดสอบจริง ไม่ใช่ติ๊ก**
| ข้อ | ผ่าน |
|---|---|
| `node .claude/check-config.js` ได้ `ต้องแก้: 0` (แปะผลจริง) | ⬜ |
| เปิด session ใหม่แล้ว `/context` เห็น `CLAUDE.md` และ `AGENTS.md` โหลดจริง | ⬜ |
| พิมพ์ `/` แล้วเห็น skills ทั้ง 9 ตัว | ⬜ |
| เปิดไฟล์ใน `components/` แล้ว rule `frontend-ui` โหลดเข้ามาจริง | ⬜ |
| เปิด session ใหม่แล้วเห็นสถานะ board ถูกฉีดเข้ามาอัตโนมัติ | ⬜ |
| `git pull`/`git switch` แล้ว `docs/backlog/board.md` regenerate เองโดยไม่ต้องเปิด Claude Code (`.husky/post-merge`, `post-checkout` ติดตั้งแล้ว) | ⬜ |
| แตก branch `fix/...` แล้วลองให้ Claude แก้ไฟล์เทส → ต้องถูกบล็อก | ⬜ |
| ยืนบน main แล้วสั่ง `git merge <branch>` → ต้องถูกบล็อก (hook) | ⬜ |
| แก้ไฟล์ให้ lint พังแล้ว `git push` → pre-push ปฏิเสธ | ⬜ |
| `node .claude/gate.js` ผ่านทุกด่าน (แปะผล) | ⬜ |
| `node .claude/board.js --check` ตรงกับไฟล์ task | ⬜ |

> 3 ข้อล่างต้องทดสอบด้วยมือใน session จริง เพราะ `check-config.js` ตรวจได้แค่ว่า
> ไฟล์ถูกที่และ hook คืน exit code ถูก แต่ตรวจไม่ได้ว่า Claude Code **โหลด**มันเข้า context จริงไหม

**ชั้นโค้ด**
| ข้อ | ผ่าน |
|---|---|
| `{{VERIFY_COMMAND}}` ผ่านทั้งหมด | ⬜ |
| `docker compose up` จากศูนย์แล้วเปิดเว็บได้ | ⬜ |
| `.env.example` ครบ และไม่มี secret หลุดเข้า git | ⬜ |
| `/health` ตอบ 200 | ⬜ |
| API docs เปิดได้ (ถ้ามี backend) | ⬜ |
| สลับ th/en และ light/dark ได้ | ⬜ |

## 7.11 รัน eval ชุดแรก

รัน `docs/evals/EV-001` ถึง `EV-004` ใน session ใหม่ที่สะอาด แล้วบันทึกผล
**นี่คือ baseline** ที่จะใช้เทียบทุกครั้งที่แก้ config ในอนาคต

ถ้าอยากให้รันซ้ำได้โดยไม่ต้องนั่งวาง prompt เอง: ใช้ skill `skill-creator` แปลงเคสเป็น eval suite แล้วรันด้วย `claude plugin eval` (ดู `docs/evals/README.md`)

ถ้าเคสไหนไม่ผ่านตั้งแต่วันแรก แปลว่า config ยังไม่ดีพอ — แก้ก่อนปิด Phase

## 7.12 ปิดงาน

1. commit ทั้งหมด
2. บอกผู้ใช้ว่า **จากนี้ทำงานผ่าน skills ไม่ต้องเปิด `buaflow/` อีก**
   และ **ทุก merge เข้า main ผ่าน PR** — hook บล็อก merge ในเครื่องแล้ว เหลือแค่เปิด branch protection บน git host ตอนเลือกได้
   แต่ **อย่าลบ kit** — Phase 8 จะกลับมาใช้ทุกครั้งที่ปรับ config
   (ถ้าไม่อยากให้เกะกะ ย้ายไป `docs/_archive/buaflow/` ได้)
3. แสดง **3 คำสั่งแรกที่ควรใช้ในวันถัดไป**:
   ```
   /intent <เรื่องที่อยากทำ>    เปิดงานใหม่ (งานจิ๋ว → trivial track ไม่ต้อง intent)
   /task                       หยิบ task ถัดไปจาก board
   /plan T-xxx                 วางแผนก่อนลงมือ
   ```
   และ 3 คำสั่งที่ **ไม่ต้องทำเอง** เพราะ built-in มีให้: `/code-review` `/security-review` (ถูกเรียกจาก `/check`), `/doctor` (Phase 8)
4. บอกว่าเมื่อไหร่ควรกลับมาทำ **Phase 8** (ทบทวนและปรับ config)
