# Project Kit — มาตรฐานการตั้งและดำเนินโปรเจกต์เว็บด้วย Claude Code

ชุดนี้ทำ 2 อย่าง:

1. **พา Claude วางแผนโปรเจกต์ใหม่ให้ครบวงจร** (Phase 0–6) แล้วคายโค้ดที่ build ผ่านออกมา
2. **ติดตั้งระบบการทำงานถาวร** (Phase 7) — `AGENTS.md`, `.claude/skills`, `.claude/rules`,
   `.claude/hooks`, ธรรมนูญโปรเจกต์, นโยบายรีวิว, และชุด eval

จากนั้น **Phase 8 ทำซ้ำเรื่อย ๆ** เพื่อเอาบทเรียนจากการทำงานจริงย้อนกลับเข้า config
kit นี้จึง **ไม่ใช่ของใช้แล้วทิ้ง** — เป็นมาตรฐานที่พัฒนาไปพร้อมกับทีม

---

## kit นี้รองรับแค่ไหน (อ่านก่อนเอาไปใช้)

แบ่งเป็น 2 ชั้นที่รองรับไม่เท่ากัน — **บอกไว้ตรง ๆ ดีกว่าให้ไปเจอเองตอนติดตั้งแล้ว**

| ชั้น | รองรับ | คืออะไร |
|---|---|---|
| **ชั้น process** | **ทุก stack ทุกภาษา** | artifact chain (intent → spec → plan → task → check → done), `board.js`, `docs-lint.js`, `gate.js`, `verify.js`, guard hooks เรื่อง git, Conventional Commits, ธรรมนูญ, eval — เป็น Node ล้วนที่ทำงาน**รอบ ๆ** โค้ด ไม่ได้อ่านโค้ดของแอป |
| **ชั้น stack** | **JS/TS + เว็บเป็นหลัก** | `rules/*.md` ที่อ้าง shadcn / Prisma / next-intl, `skills/ui/`, `guard-new-component.js`, Phase 2–6 ที่เขียนโดยสมมติ Next.js |

- **stack อื่น (Python, .NET, Go, Laravel)** ใช้ได้ผ่าน **[Phase A](phases/A-adopt-existing.md)** — ตั้งค่าที่ `.claude/stack.json` ไฟล์เดียว
  (คำสั่ง verify, pattern ไฟล์โค้ด, formatter, ไฟล์ที่ห้ามแก้) แต่ **ต้องเขียน `.claude/rules/` เองตาม convention ของ stack นั้น** เพราะของที่มากับ kit อ้าง library ของฝั่ง JS
- **แอป desktop / CLI / mobile** — ชั้น process ใช้ได้เต็ม ส่วน Phase 3 (design token) กับขั้น Docker/OpenAPI ใน Phase 6 ข้ามได้ ไม่ใช่ทุกขั้นจะเกี่ยว
- ยังไม่มีโปรไฟล์สำเร็จรูปของ stack อื่นให้ — จะทำเมื่อมีโปรเจกต์จริงที่ใช้ เพื่อให้เขียนจาก convention ที่เจอจริง ไม่ใช่เดาเอา

---

## หลักการออกแบบ

1. **Artifact ต่อกันเป็นทอด** — ทุกขั้นคายไฟล์ที่ขั้นถัดไปอ่านได้ และทุกไฟล์อยู่ใน git
   ```
   intent → spec (requirements/design/tasks) → plan → code → verify → check → PR → done
   ```
   ผลคือตรวจย้อนได้ว่า *ใครขออะไร → ตกลงอะไรไว้ → วางแผนยังไง → ทำอะไรไป → ใครอนุมัติ*
   และ **แต่ละขั้นบีบ ไม่ส่งต่อ** — `plan.md` คัดทุกอย่างที่ต้องใช้ไว้ ขั้นถัดไปอ่านไฟล์เดียว

2. **Config เป็นการควบคุม ไม่ใช่แค่เอกสาร** — กฎแบ่งเป็น 4 ชั้นตามความแข็ง
   กฎที่ห้ามพังต้องมี hook ไม่ใช่แค่ข้อความว่า "ห้าม..." และกฎที่ต้องอยู่**นอก session ของ Claude** ต้องอยู่ใน gate
   (`gate.js` = verify + check-config + docs-lint รันจาก pre-push และ CI — main รับของผ่าน PR เท่านั้น)

3. **AI ต้องตรวจงานตัวเองได้ก่อนคนเห็น** — ทุกโปรเจกต์ต้องมี **คำสั่งตรวจคำสั่งเดียว** (เรียกผ่าน `node .claude/verify.js` คำสั่งจริงอยู่ใน `.claude/stack.json`)
   ที่รันเร็วพอให้ AI วนซ้ำได้ **พิมพ์สรุปสั้นพอที่จะแปะได้ทุกครั้ง** (log เต็มแยกไฟล์) และทุกงานต้องระบุ **Proof** ว่าอะไรพิสูจน์ว่าเสร็จ

4. **ห้ามเดา** — จุดที่ไม่ชัดต้องเขียน `[NEEDS CLARIFICATION: ...]` ไม่ใช่เติมค่าที่ดูสมเหตุสมผล
   เอกสารที่ยังเหลือ marker ผ่าน gate ไม่ได้

5. **คนอยู่ที่ประตู ไม่ใช่กลางสายพาน** — AI ทำงานที่ไม่ต้องใช้วิจารณญาณ
   คนตัดสินเรื่องที่ต้องใช้ (รับความเสี่ยงไหม ขึ้น prd ไหม) และ **AI ไม่อนุมัติงานตัวเอง**

6. **ไม่ยิงทีเดียวจบ** — แบ่งเป็น Phase สั่งทีละอัน เพื่อให้ context ไม่บวมและแก้ทิศได้ตลอด

7. **ใช้ของที่ Claude Code มีให้ก่อนเขียนเอง** — `/code-review` `/security-review` `/simplify` `/doctor` `/insights` `/init` `/import`
   เป็น built-in ที่ kit เรียกใช้ (ดู `standards/context-budget.md` และ Phase 8) — เขียนเองเฉพาะส่วนที่รู้กติกาโปรเจกต์

---

## วิธีใช้

### โปรเจกต์ที่ใช้ kit เวอร์ชันเก่าอยู่แล้ว
วาง `project-kit/` เวอร์ชันนี้ทับของเดิมในโปรเจกต์ แล้วพิมพ์:

```
อ่าน project-kit/UPGRADE.md แล้วทำตาม
```

[UPGRADE.md](UPGRADE.md) จะเลือกเส้นทางให้ตามเวอร์ชันที่ใช้อยู่ — **v2.1 → v2.2** ~15 นาที (แค่ย้ายการตั้งค่าไป `stack.json`)
หรือ **v1.0 → v2.1 → v2.2** ~1 session · ทั้งคู่ทำระหว่าง task (หลัง `/done` ก่อน `/task` ถัดไป)
ไม่ต้องรัน Phase ใหม่ เก็บ planning/ADR/spec/task ไว้ทั้งหมด

### โปรเจกต์ที่มีโค้ดอยู่แล้ว (ไม่เคยใช้ kit)
ตอบ Phase 0 ว่าโหมด `EXTEND` แล้ว kit จะพาไป **Phase A** (สำรวจของเดิม ตั้ง verify ธรรมนูญแบบของใหม่/ของเก่า)
แทน Phase 1–6 จากนั้นติดตั้ง config ที่ Phase 7 เหมือนกัน — จากนั้นเพิ่ม feature ใหม่ผ่าน `/intent` ได้เลย

### โปรเจกต์ใหม่ — ครั้งแรก
เปิด Claude Code ที่ root ของโปรเจกต์ แล้วพิมพ์:

```
อ่าน project-kit/START-HERE.md แล้วทำตาม เริ่ม Phase 0
```

### ทำ Phase ถัดไป
```
ทำ Phase ต่อไป
```

### เปิด session ใหม่มาทำต่อ
```
อ่าน project-kit/START-HERE.md และ docs/planning/_state.md แล้วทำต่อจากที่ค้างไว้
```

### หลังจบ Phase 7 — ทำงานประจำวัน
```
/intent <เรื่องที่อยากทำ>    เปิดงานใหม่
/spec F-01                  ทำ spec ของ feature ใหญ่
/plan T-001                 วางแผนก่อนลงมือ (plan.md คัดทุกอย่างที่ต้องใช้ไว้)
/task T-001                 ลงมือ
/check T-001                ตรวจ (verify + เทียบ plan + /code-review + /security-review)
/done T-001                 เปิด PR + ปิดงาน (คนกด merge)
```

### ทบทวนและปรับ config
```
อ่าน project-kit/phases/08-tune-and-evolve.md แล้วทำตาม
```
ทำตอนปิด milestone, หลัง incident, หรือเมื่อเปลี่ยนโมเดล

---

## โครงไฟล์

```
project-kit/
├── README.md                   ← ไฟล์นี้
├── UPGRADE.md                  ← อัปเกรดโปรเจกต์จาก v1.0 → v2.1
├── VERSION.md                  ← changelog ของตัว kit
├── START-HERE.md               ← prompt หลัก (ตัวคุม flow ทั้งหมด)
│
├── phases/                     ← prompt ราย Phase (Claude อ่านทีละไฟล์)
│   ├── 01-discovery.md              เก็บ requirement
│   ├── 02-stack-decision.md         เลือก stack + คำสั่ง verify
│   ├── 03-ui-and-design-intake.md   UI, theme, design, โปรเจกต์เก่า
│   ├── 04-architecture.md           สถาปัตยกรรม + security + ADR + ธรรมนูญ
│   ├── 05-backlog-and-roadmap.md    แตก Epic/Feature/Task + board
│   ├── 06-scaffold.md               สร้างโปรเจกต์จริงด้วย CLI
│   ├── 07-handoff.md                ติดตั้ง config ทั้งชุด + รัน eval baseline
│   ├── 08-tune-and-evolve.md        ♻️ ทบทวนและปรับ config (ทำซ้ำ)
│   └── A-adopt-existing.md          🔁 โปรเจกต์ที่มีโค้ดอยู่แล้ว — แทน Phase 1-6
│
├── standards/                  ← ความรู้ที่จะถูก compile ลงเป็น rules/skills
│   ├── agent-config.md              ⭐ กฎข้อไหนควรไปอยู่ชั้นไหน
│   ├── workflow-lifecycle.md        วงจรงาน + การปล่อยของ
│   ├── definition-of-done.md
│   ├── testing-and-coverage.md
│   ├── security-checklist.md
│   ├── ui-component-rules.md
│   ├── i18n-and-theme.md
│   ├── commit-and-branch.md
│   ├── docker-and-envs.md
│   ├── sonarqube-local.md
│   └── context-budget.md            ⭐ งบ token: ขั้นไหนอ่านอะไร โมเดลไหน อะไรตัดไปแล้วเพราะอะไร
│
├── templates/                  ← แม่แบบเอกสาร
│   ├── constitution.tpl.md          ธรรมนูญโปรเจกต์ (หลักการที่ห้ามละเมิด)
│   ├── intent.tpl.md                ประตูเข้าของงานใหม่
│   ├── plan.tpl.md                  แผนก่อนลงมือ
│   ├── spec.tpl.md                  spec 3 ไฟล์ (EARS + gate)
│   ├── task.tpl.md
│   ├── adr.tpl.md
│   ├── backlog-board.tpl.md
│   ├── eval-case.tpl.md
│   ├── design-brief.tpl.md          สัญญาก่อนเปิด canvas (theme/components/viewports/states/deviation)
│   ├── AGENTS.md.tpl                กติกาหลัก (มาตรฐานกลาง)
│   ├── CLAUDE.md.tpl                ชั้นบางเฉพาะ Claude Code
│   ├── REVIEW.tpl.md                นโยบายการรีวิว
│   ├── gitignore.tpl                .gitignore ที่ kit ต้องการ (.verify.log, settings.local.json, .env*)
│   └── verify.mjs.tpl               ⭐ verify ที่พิมพ์สรุปสั้น log เต็มลง .verify.log
│
└── claude-setup/               ← จะถูกคัดลอกไป .claude/ ตอน Phase 7
    ├── skills/                      /intent /spec /plan /task /ui /check /done /hotfix /release
    ├── rules/                       กฎที่โหลดตาม paths ของไฟล์ที่แตะ
    ├── agents/                      code-reviewer, test-writer, legacy-explorer
    ├── hooks/                       ⭐ ชั้นที่บังคับได้จริง (Node ล้วน ไม่มี dependency)
    ├── check-config.js              ⭐ ตรวจว่า config ทำงานจริง (paths match ไหม / hook คืน exit code ถูกไหม / ชื่อ skill ชน built-in ไหม)
    ├── docs-lint.js                 ⭐ ตรวจว่า artifact chain ยังตรงกัน (spec โกหก / task ลอย / WIP / หนี้เทส)
    ├── board.js                     generate board.md จากไฟล์ task
    ├── gate.js                      ⭐ ด่านเดียว: verify + check-config + docs-lint — pre-push และ CI รันตัวเดียวกัน
    ├── verify.js                    ทางเข้าเดียวของคำสั่งตรวจ — skill เรียกตัวนี้ ไม่ผูกกับ pnpm
    ├── run.js                       คำสั่งรองตามชื่อ (coverage / audit / apiTest) อ่านจาก stack.json
    ├── stack-config.js              ⭐ ตัวอ่าน stack.json ที่สคริปต์อื่นใช้ร่วมกัน
    ├── stack.json                   ⭐ stack ของโปรเจกต์: คำสั่ง verify, pattern ไฟล์โค้ด, formatter, ไฟล์ที่ห้าม AI แก้
    ├── ci/                          pre-push + GitHub Actions + GitLab CI templates
    ├── settings.json.tpl            permissions + การผูก hooks
    └── evals/                       ชุดเคสทดสอบ config
```

## สิ่งที่ได้หลังจบ Phase 7

```
AGENTS.md                      ← กติกาหลัก (เครื่องมืออื่นอ่านได้ด้วย)
CLAUDE.md                      ← @AGENTS.md + ของเฉพาะ Claude Code
REVIEW.md                      ← นโยบายการรีวิว
CONTRIBUTING.md
.claude/
├── skills/*/SKILL.md          ← 9 skills
├── rules/*.md                 ← กฎที่โหลดตามไฟล์ที่แตะ
├── agents/*.md                ← 3 subagents
├── hooks/*.js                 ← ชั้นบังคับ
├── check-config.js            ← ตรวจสุขภาพ config (รันทุกครั้งที่ปรับ)
├── docs-lint.js  board.js  gate.js  verify.js  run.js  stack-config.js
├── stack.json                 ← stack ของโปรเจกต์ + ไฟล์ที่ห้าม AI แก้
└── settings.json              ← permissions + hooks
.husky/pre-push                ← node .claude/gate.js
.github/workflows/gate.yml | .gitlab-ci.yml
scripts/verify.mjs             ← verify ที่พิมพ์สรุปสั้น
docs/
├── constitution.md            ← ธรรมนูญโปรเจกต์
├── intents/                   ← ประตูเข้าของงานใหม่
├── plans/                     ← แผนก่อนลงมือ ราย task
├── specs/<feature>/           ← requirements / design / tasks
├── evals/                     ← regression test ของ config
├── planning/                  ← ผลลัพธ์ Phase 1-5 (แช่แข็งไว้อ้างอิง)
├── adr/                       ← Architecture Decision Records
├── backlog/tasks/*.md         ← source of truth ของงาน (board.md generate จากตรงนี้)
├── standards/                 ← มาตรฐานฉบับเต็ม
├── incidents/  releases/  design/  api/  templates/
docker-compose.dev.yml
sonar-project.properties
```

---

## ที่มาของแนวทาง

kit นี้สังเคราะห์จาก:
- **Anthropic — The AI-Native SDLC Playbook** (artifact chain, configuration as control, feedback loop, tiered autonomy)
- **Claude Code official docs** (skills/rules/hooks/subagents, verification ladder, context management)
- **GitHub Spec Kit** (constitution, `[NEEDS CLARIFICATION]`, gate ระหว่างขั้น, track แยกสำหรับ bug/idea)
- **AWS Kiro** (spec 3 ไฟล์, EARS notation, steering ที่ผูกกับ path)
- **AGENTS.md** (มาตรฐานกลางที่ไม่ผูก vendor)

และจงใจ **ไม่** ทำตามแนวทางที่จำลองทีม agile ด้วย agent หลายบทบาท (PM/QA/architect)
เพราะเพิ่มชั้นประสานงานโดยไม่เพิ่มคุณภาพผลลัพธ์ — สิ่งที่ได้ผลจริงคือ artifact ที่ต่อกัน
และกฎที่บังคับได้ ไม่ใช่จำนวนบทบาทที่จำลองขึ้น
