# Project Kit — มาตรฐานการตั้งและดำเนินโปรเจกต์เว็บด้วย Claude Code

ชุดนี้ทำ 2 อย่าง:

1. **พา Claude วางแผนโปรเจกต์ใหม่ให้ครบวงจร** (Phase 0–6) แล้วคายโค้ดที่ build ผ่านออกมา
2. **ติดตั้งระบบการทำงานถาวร** (Phase 7) — `AGENTS.md`, `.claude/skills`, `.claude/rules`,
   `.claude/hooks`, ธรรมนูญโปรเจกต์, นโยบายรีวิว, และชุด eval

จากนั้น **Phase 8 ทำซ้ำเรื่อย ๆ** เพื่อเอาบทเรียนจากการทำงานจริงย้อนกลับเข้า config
kit นี้จึง **ไม่ใช่ของใช้แล้วทิ้ง** — เป็นมาตรฐานที่พัฒนาไปพร้อมกับทีม

---

## หลักการออกแบบ

1. **Artifact ต่อกันเป็นทอด** — ทุกขั้นคายไฟล์ที่ขั้นถัดไปอ่านได้ และทุกไฟล์อยู่ใน git
   ```
   intent → spec (requirements/design/tasks) → plan → code → verify → review → done
   ```
   ผลคือตรวจย้อนได้ว่า *ใครขออะไร → ตกลงอะไรไว้ → วางแผนยังไง → ทำอะไรไป → ใครอนุมัติ*

2. **Config เป็นการควบคุม ไม่ใช่แค่เอกสาร** — กฎแบ่งเป็น 4 ชั้นตามความแข็ง
   กฎที่ห้ามพังต้องมี hook ไม่ใช่แค่ข้อความว่า "ห้าม..."

3. **AI ต้องตรวจงานตัวเองได้ก่อนคนเห็น** — ทุกโปรเจกต์ต้องมี `pnpm verify` คำสั่งเดียว
   ที่รันเร็วพอให้ AI วนซ้ำได้ และทุกงานต้องระบุ **Proof** ว่าอะไรพิสูจน์ว่าเสร็จ

4. **ห้ามเดา** — จุดที่ไม่ชัดต้องเขียน `[NEEDS CLARIFICATION: ...]` ไม่ใช่เติมค่าที่ดูสมเหตุสมผล
   เอกสารที่ยังเหลือ marker ผ่าน gate ไม่ได้

5. **คนอยู่ที่ประตู ไม่ใช่กลางสายพาน** — AI ทำงานที่ไม่ต้องใช้วิจารณญาณ
   คนตัดสินเรื่องที่ต้องใช้ (รับความเสี่ยงไหม ขึ้น prd ไหม) และ **AI ไม่อนุมัติงานตัวเอง**

6. **ไม่ยิงทีเดียวจบ** — แบ่งเป็น Phase สั่งทีละอัน เพื่อให้ context ไม่บวมและแก้ทิศได้ตลอด

---

## วิธีใช้

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
/plan T-001                 วางแผนก่อนลงมือ
/task T-001                 ลงมือ
/review                     รีวิว
/done T-001                 ปิดงาน
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
│   └── 08-tune-and-evolve.md        ♻️ ทบทวนและปรับ config (ทำซ้ำ)
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
│   └── sonarqube-local.md
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
│   ├── AGENTS.md.tpl                กติกาหลัก (มาตรฐานกลาง)
│   ├── CLAUDE.md.tpl                ชั้นบางเฉพาะ Claude Code
│   └── REVIEW.tpl.md                นโยบายการรีวิว
│
└── claude-setup/               ← จะถูกคัดลอกไป .claude/ ตอน Phase 7
    ├── skills/                      /intent /spec /plan /task /ui /review /done /hotfix /release
    ├── rules/                       กฎที่โหลดตาม paths ของไฟล์ที่แตะ
    ├── agents/                      code-reviewer, test-writer, legacy-explorer
    ├── hooks/                       ⭐ ชั้นที่บังคับได้จริง (Node ล้วน ไม่มี dependency)
    ├── check-config.js              ⭐ ตรวจว่า config ทำงานจริง (paths match ไหม / hook คืน exit code ถูกไหม)
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
└── settings.json              ← permissions + hooks
docs/
├── constitution.md            ← ธรรมนูญโปรเจกต์
├── intents/                   ← ประตูเข้าของงานใหม่
├── plans/                     ← แผนก่อนลงมือ ราย task
├── specs/<feature>/           ← requirements / design / tasks
├── evals/                     ← regression test ของ config
├── planning/                  ← ผลลัพธ์ Phase 1-5 (แช่แข็งไว้อ้างอิง)
├── adr/                       ← Architecture Decision Records
├── backlog/board.md           ← กระดานงาน (source of truth)
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
