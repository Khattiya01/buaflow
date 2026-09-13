# Project Kit — ชุด prompt สำหรับเริ่มโปรเจกต์เว็บด้วย Claude Code

ชุดไฟล์นี้ใช้ **เฉพาะตอนเริ่มโปรเจกต์** เพื่อพา Claude ทำ planning ให้ครบวงจร
แล้ว "คาย" ไฟล์ถาวร (`CLAUDE.md`, `docs/`, `.claude/`) ออกมาให้ใช้ทำงานจริงต่อ
พอจบ Phase 7 แล้ว **เลิกใช้โฟลเดอร์นี้ได้** (จะลบหรือเก็บไว้อ้างอิงก็ได้)

## หลักการออกแบบชุดนี้

1. **ไม่ยิงทีเดียวจบ** — แบ่งเป็น 7 Phase สั่งทีละอัน เพื่อให้ context ไม่บวมและคุณแก้ทิศได้ตลอด
2. **ไม่ล็อก tech stack ตั้งแต่แรก** — เลือก framework/ภาษาใน Phase 2 หลังรู้ requirement แล้ว
3. **มี state file** — `docs/planning/_state.md` จำว่าทำถึงไหน ปิด session แล้วเปิดใหม่ทำต่อได้
4. **ห้ามเขียนโค้ดก่อน Phase 6** — Phase 1–5 คือเอกสารล้วน
5. **Spec-Driven** — feature ใหญ่ต้องมี spec ก่อนโค้ด, task ย่อย/hotfix ใช้ template สั้น

## วิธีใช้

### ครั้งแรก
เปิด Claude Code ที่ root ของโปรเจกต์ แล้วพิมพ์:

```
อ่าน project-kit/START-HERE.md แล้วทำตาม เริ่ม Phase 0
```

### ทำ Phase ถัดไป
```
ทำ Phase ต่อไป
```
หรือระบุตรงๆ `ทำ Phase 3`

### เปิด session ใหม่มาทำต่อ
```
อ่าน project-kit/START-HERE.md และ docs/planning/_state.md แล้วทำต่อจากที่ค้างไว้
```

## โครงไฟล์

```
project-kit/
├── README.md                  ← ไฟล์นี้
├── START-HERE.md              ← prompt หลัก (ตัวคุม flow ทั้งหมด)
├── phases/                    ← prompt ราย Phase (Claude อ่านทีละไฟล์)
│   ├── 01-discovery.md            เก็บ requirement
│   ├── 02-stack-decision.md       เลือก framework / ภาษา / library
│   ├── 03-ui-and-design-intake.md UI, theme, design ที่แนบมา, โปรเจกต์เก่า
│   ├── 04-architecture.md         สถาปัตยกรรม + security + ADR
│   ├── 05-backlog-and-roadmap.md  แตก Epic/Feature/Task + board
│   ├── 06-scaffold.md             สร้างโปรเจกต์จริงด้วย CLI
│   └── 07-handoff.md              คาย CLAUDE.md / .claude / docs แล้วจบ
├── standards/                 ← มาตรฐานที่จะถูกฝังลง CLAUDE.md
│   ├── workflow-lifecycle.md      วงจรงาน + การปล่อยของ local/uat/prd
│   ├── commit-and-branch.md
│   ├── definition-of-done.md
│   ├── testing-and-coverage.md
│   ├── security-checklist.md
│   ├── ui-component-rules.md
│   ├── i18n-and-theme.md
│   ├── docker-and-envs.md
│   └── sonarqube-local.md
├── templates/                 ← แม่แบบเอกสารที่จะถูก copy ไป docs/
│   ├── CLAUDE.md.tpl
│   ├── spec.tpl.md
│   ├── task.tpl.md
│   ├── adr.tpl.md
│   └── backlog-board.tpl.md
└── claude-setup/              ← จะถูก copy ไป .claude/ ตอน Phase 7
    ├── commands/              /spec /task /ui /review /hotfix /done
    └── agents/                code-reviewer, test-writer, legacy-explorer
```

## สิ่งที่ได้หลังจบ Phase 7

```
CLAUDE.md                      ← กติกาโปรเจกต์ (Claude อ่านทุก session)
CONTRIBUTING.md
.claude/commands/*.md          ← /spec /task /review /ui /hotfix /done
.claude/agents/*.md            ← code-reviewer, test-writer, legacy-explorer
docs/
├── planning/                  ← ผลลัพธ์ Phase 1–5 (แช่แข็งไว้อ้างอิง)
├── adr/                       ← Architecture Decision Records
├── specs/<feature>/           ← requirements.md / design.md / tasks.md
├── backlog/board.md           ← กระดาน agile ในไฟล์
├── backlog/tasks/*.md
├── design/theme.md
└── api/                       ← OpenAPI + Postman collection
docker-compose.dev.yml
sonar-project.properties
```
