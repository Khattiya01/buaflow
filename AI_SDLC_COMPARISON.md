# เปรียบเทียบ Buaflow กับ AI-DLC Starter Template

> วันที่ประเมิน: 22 กันยายน 2026  
> ขอบเขต: เปรียบเทียบ Buaflow ใน repository หลักกับ `aidlc-starter-template/` จากโครงสร้าง เอกสาร workflow, executable guardrails และ sample application ที่มีอยู่ใน snapshot นี้

## Executive Summary

ถ้าวัดว่า "ระบบไหนเหมาะใช้พัฒนาซอฟต์แวร์จริงต่อเนื่องจนขึ้น production" **Buaflow ดีกว่าอย่างชัดเจน**

- **Buaflow: 82/100**
- **AI-DLC Starter Template: 59/100**

อย่างไรก็ตาม ทั้งสองระบบไม่ได้มีเป้าหมายเหมือนกันทั้งหมด:

- **Buaflow** เป็น operating system สำหรับทีมพัฒนาที่ทำงานต่อเนื่อง ตั้งแต่ discovery, architecture, daily delivery, quality gate ไปจนถึง release และ feedback loop
- **AI-DLC Starter Template** เป็น workflow/template สำหรับพา feature หนึ่ง iteration จาก requirement ไป implementation โดยเน้นการตัดสินใจร่วมกับคน และเหมาะมากกับ workshop/onboarding

คำตัดสินโดยรวม:

- ด้าน **production delivery governance**: Buaflow ชนะ
- ด้าน **workshop, onboarding และ multi-tool support**: AI-DLC Starter ทำได้ดีกว่า
- แนวทางที่เหมาะที่สุดคือใช้ **Buaflow เป็นแกน** แล้วนำ decision record, tool-agnostic adapters, traceability และ workshop/reference implementation ของอีกทีมมาปรับใช้

---

## ความแตกต่างในระดับแนวคิด

| เรื่อง | Buaflow | AI-DLC Starter Template |
|---|---|---|
| แนวคิดหลัก | `intent → spec → plan → task → verify → review → PR → release` | `DECISIONS → PLAN → EXECUTE` ทุก phase |
| เป้าหมาย | ควบคุม lifecycle ทั้งโปรเจกต์และงานรายวัน | ควบคุมการทำ feature เป็น iteration |
| Enforcement | Hooks, scripts, gate, pre-push และ CI | ส่วนใหญ่เป็น prompt, rules และ Markdown |
| Human approval | อนุมัติตามจุดเสี่ยงและก่อน merge/release | อนุมัติ decision และ plan เกือบทุก phase |
| Architecture | Discovery, stack, UI, security, DB, deployment | เน้น DDD: domain decomposition, domain design และ logical design |
| Production operation | UAT, PRD, rollback, migration, backup, health/ready | มีถึงการสร้าง PR แต่ deployment/release ยังบาง |
| Brownfield | Phase A พร้อม baseline และกติกาของใหม่/ของเก่า | Reverse Engineering สรุป product/tech/structure |
| AI tools | เน้น Claude Code | Claude Code + GitHub Copilot |
| Context management | Scoped rules, skills, subagents และ context budget | อ่าน phase/audit/decision/plan กลับเข้ามา |
| UI quality | Design intake, prototype, pixel diff และ component guard | มี logical design/wireframe แต่ไม่มี visual gate |

---

## เทคนิคเด่นของ AI-DLC Starter Template

### 1. Decision-driven development

ทุก phase เริ่มด้วย decision record ที่ประกอบด้วย:

- ตัวเลือก 2–4 ทาง
- เหตุผลของแต่ละทาง
- ผลกระทบและ trade-off
- recommendation จาก AI
- ช่อง `Decision:` ที่ปล่อยให้คนเป็นผู้เลือก

จุดแข็งคือแยก "AI เสนอ" ออกจาก "คนตัดสินใจและรับความเสี่ยง" ได้ชัดเจน เหมาะกับ architecture, database, authentication, API contract และ dependency ใหม่

จุดอ่อนคือถ้าใช้กับทุก phase และงานขนาดเล็ก จะเกิด approval fatigue และเพิ่มระยะเวลาส่งมอบโดยไม่จำเป็น

### 2. DDD-first inception

ลำดับหลักของเขาคือ:

```text
Requirement
  → Domain Decomposition
  → Domain Design
  → Logical Design
  → Test Cases
  → Dev Tasks
  → Implementation
```

ข้อดี:

- Trace จาก business requirement ไป code ได้ดี
- ช่วยกำหนด aggregate, invariant, bounded context และ repository interface
- เหมาะกับระบบ domain ซับซ้อน เช่น booking, finance, inventory และ order management

ข้อเสีย:

- CRUD ขนาดเล็กก็ต้องผ่านเอกสารหลายชุด
- เสี่ยง over-design และเสียเวลาหากใช้ DDD กับทุกงานโดยไม่มี risk-based shortcut

### 3. Tool-agnostic source of truth

Workflow หลักอยู่ใน `aidlc-workflow-config/` แล้วมี adapter สำหรับ Claude Code และ GitHub Copilot

ข้อดีคือทีมที่ใช้เครื่องมือ AI ต่างกันยังสามารถอ้างอิงกระบวนการชุดเดียวกันได้

ข้อจำกัดคือ adapter ยังคงเป็นไฟล์ข้อความหลายชุด และไม่มี automated parity test ยืนยันว่า adapter ทุกตัวไม่ drift จาก canonical workflow

### 4. Audit ต่อ iteration

แต่ละ iteration มี:

- decision files
- plan files
- outputs
- current phase
- next action
- phase history

แนวคิดนี้ดีต่อการ resume session และ audit ย้อนหลัง แต่ state ถูกเขียนเป็น Markdown โดย AI และยังไม่มี validator/state machine ตรวจความสอดคล้อง

### 5. Workshop และ reference application

มี facilitator guide, hands-on lab, cheat sheet และ sample full-stack application ทำให้เริ่มทดลอง workflow ได้ง่ายกว่า Buaflow

---

## ข้อดีของ AI-DLC Starter Template

1. แนวคิด `DECISIONS → PLAN → EXECUTE` เข้าใจง่ายและสื่อสารกับทีมได้เร็ว
2. Human-in-the-loop ชัดเจน ไม่ให้ AI ตัดสินใจแทนคน
3. Decision record อธิบาย trade-off ได้ดี
4. DDD และ logical design มีโครงสร้างที่เป็นระบบ
5. มี artifact ต่อ iteration ช่วย resume และ audit
6. รองรับ Claude Code และ GitHub Copilot
7. มี sample application และ workshop material พร้อมใช้
8. เหมาะกับการสอนทีมให้ทำงานกับ AI อย่างมีวินัย

## ข้อเสียของ AI-DLC Starter Template

1. กติกาส่วนใหญ่เป็น prompt/Markdown จึงบังคับใช้จริงไม่ได้
2. ไม่มี automated workflow validator หรือ state machine
3. Audit และสถานะของ artifact สามารถขัดกันเองได้
4. อนุมัติ decision และ plan ทุก phase ทำให้ ceremony สูง
5. ไม่มี context/cost management ชัดเท่า Buaflow
6. Production operation เช่น deployment, rollback, migration และ observability ยังไม่ครบ
7. CI เป็น optional ตามเอกสาร ไม่ใช่ mandatory gate
8. ไม่มี security/dependency/secret enforcement ที่ทำงานจริง
9. ไม่มี automated test ของ workflow/adapters
10. ตัวอย่าง application เป็น workshop MVP ไม่ใช่ production app

---

## จุดแข็งของ Buaflow

### 1. กฎสำคัญถูกบังคับด้วยโค้ด

Buaflow มี enforcement หลายชั้น:

1. `AGENTS.md` และ `CLAUDE.md`
2. Path-scoped rules
3. Skills ตามชนิดงาน
4. Pre/Post tool hooks
5. Verify command
6. Config validation และ docs lint
7. Pre-push/CI gate

Representative hook tests ที่รันในการประเมินครั้งนี้พบว่า:

- `git commit --no-verify` ถูกบล็อก
- direct push เข้า `main` ถูกบล็อก
- การแก้ protected UI component ถูกบล็อก
- คำสั่งปลอดภัยอย่าง `git status` ผ่านตามปกติ

### 2. ครอบคลุม production lifecycle มากกว่า

Buaflow มีแนวทางสำหรับ:

- local → UAT → PRD
- build artifact ครั้งเดียวแล้ว promote
- written UAT approval
- backup และ restore rehearsal
- migration rollback
- `/health` และ `/ready`
- dependency audit และ secret scan
- release note
- hotfix
- post-release feedback

### 3. ใช้งานรายวันและระยะยาวได้ดีกว่า

Daily workflow ครอบคลุม:

```text
intent → spec → plan → task → code → verify → check → PR → done
```

Phase 8 ทำหน้าที่ feed บทเรียนจากงานจริงกลับเข้า configuration ทำให้ workflow พัฒนาได้ต่อเนื่อง

### 4. จัดการ context และต้นทุน AI

มีแนวทางสำคัญ เช่น:

- โหลด rules เฉพาะ path ที่เกี่ยวข้อง
- ใช้ plan เป็น distilled context สำหรับ implementation
- ใช้ subagent กับงานอ่านไฟล์จำนวนมาก
- ทำงานหนึ่ง task ต่อ context
- สรุป verify output แทนการป้อน log จำนวนมากกลับเข้า context

### 5. Guardrails เฉพาะด้าน

ครอบคลุมเรื่อง:

- Authorization และ record ownership
- Expand/contract database migration
- i18n
- UI states
- Coverage target
- SonarQube
- API/OpenAPI
- Security checklist
- Prototype และ visual regression

---

## ข้อเสียและความเสี่ยงของ Buaflow

1. **Claude-centric** — configuration, skills และ hooks หลักผูกกับ `.claude/`
2. **ติดตั้งและปรับแต่งมากกว่า** — ต้องกำหนด stack, verify command, CI และ branch protection ให้ตรงโปรเจกต์จริง
3. **เรียนรู้ยากกว่า** — มี phases, standards, templates, skills, rules และ hooks หลายชั้น
4. **ไม่มี reference application เต็มวงจร** แบบที่อีกทีมมี
5. **framework scripts ยังไม่มี automated unit test suite** — ในการตรวจครั้งนี้ JavaScript ทั้ง 14 ไฟล์ผ่าน syntax check แต่ syntax check ไม่เท่ากับ behavior test
6. **บาง gate ยัง fail-open**:
   - `auditMode` เริ่มต้นเป็น `warn`
   - `secretsMode` อาจตั้งเป็น `required` แต่ถ้าไม่มี `gitleaks` จะถูก skip
   - หากไม่ตั้ง verify command ตัว gate สามารถ skip verify ได้
7. หากทีมติดตั้งไม่ครบหรือไม่เปิด branch protection จะมี false sense of safety
8. ปริมาณเอกสารและ configuration อาจมี maintenance cost สูง

---

## ผลตรวจ AI-DLC Starter Template จากของจริง

### ผล test และ static checks

- Backend Vitest: **11/11 tests ผ่าน**
- Backend TypeScript: **ผ่าน**
- Frontend TypeScript: **ผ่าน**
- Frontend Oxlint: **ผ่าน**

### ความไม่สอดคล้องของ workflow artifacts

พบว่า iteration ปัจจุบันระบุ:

- Current phase คือ `2.1 Implementation`
- Status คือ `Complete`
- Progress คือ `5/8 phases`
- Phase 1.2 ยังเป็น `In Progress`
- Phase 1.5 Test Case Design ถูกข้าม
- Phase 1.6 Test Script Design ถูกข้าม
- Phase 1.7 Dev Task Design ถูกข้าม
- Implementation decision file ยังมี status เป็น `Pending`
- Phase 2.2 Automated Testing ยังไม่เสร็จ
- Phase 2.3 Create Pull Request ยังไม่เสร็จ

นี่แสดงให้เห็นว่ากฎ "ห้าม skip" และ "update audit ทุก phase" ยังเป็น soft rules และไม่มีเครื่องมือบังคับ consistency

### ความพร้อมของ sample application

Sample application ยังไม่พร้อม production เพราะ:

- ใช้ in-memory storage
- ไม่มี authentication/authorization
- ไม่มี API integration tests
- ไม่มี frontend automated tests
- ไม่มี active CI workflow สำหรับ application
- ไม่มี Docker/deployment configuration
- ไม่มี health/readiness endpoints
- ไม่มี structured logging, metrics หรือ observability
- CORS fallback เป็น `*`
- ไม่มี runtime request schema validation

Runtime test เพิ่มเติมพบว่าเมื่อส่ง `title` เป็น number แทน string API ตอบ `500 Internal Server Error` เพราะเรียก `title.trim()` โดยไม่ตรวจ runtime type ก่อน กรณีนี้ควรเป็น validation error `400`

ดังนั้น sample application เป็น workshop MVP ตาม requirement ของมันเอง ไม่ใช่ production application

---

## ตารางคะแนน

| เกณฑ์ | น้ำหนัก | Buaflow | AI-DLC Starter |
|---|---:|---:|---:|
| ความครอบคลุม lifecycle | 15 | 13.5 | 10.5 |
| Enforcement และ repeatability | 20 | 17.0 | 8.0 |
| Decision, audit และ traceability | 15 | 12.5 | 12.0 |
| Testing, security และ quality | 15 | 12.0 | 7.5 |
| Release, operation และ production | 15 | 12.0 | 4.5 |
| Multi-tool และ onboarding | 10 | 6.0 | 9.0 |
| Context efficiency และ team scaling | 10 | 9.0 | 7.0 |
| **รวม** | **100** | **82** | **59** |

คะแนนตามสถานการณ์:

| สถานการณ์ | Buaflow | AI-DLC Starter |
|---|---:|---:|
| Workshop/onboarding | 6.5/10 | 8.5/10 |
| Prototype/MVP อย่างมีขั้นตอน | 7.5/10 | 8.0/10 |
| Long-running team development | 8.5/10 | 6.0/10 |
| Production delivery governance | 8.2/10 | 4.8/10 |
| Multi-AI-tool team | 6.0/10 | 8.5/10 |

---

## สิ่งที่ควรนำจากอีกทีมมาปรับใช้กับ Buaflow

### Priority 1: Decision Record สำหรับเรื่องเสี่ยงสูง

เพิ่ม template ที่มี:

- Context
- Options
- Rationale
- Consequences
- Recommendation
- Human decision
- Decision owner/date

ไม่ควรใช้กับทุก task แต่ให้ trigger เมื่อแตะ:

- Architecture boundary
- Database schema/migration
- Authentication/authorization
- Public API contract
- New dependency/platform
- Deployment/rollback strategy

### Priority 2: Tool-agnostic workflow core

แยก workflow canonical ออกจาก Claude-specific implementation แล้วสร้าง thin adapters สำหรับ:

- Claude Code
- Codex/AGENTS.md
- GitHub Copilot
- เครื่องมืออื่นในอนาคต

ควรมี parity test ตรวจว่า adapter อ้างอิง workflow version เดียวกัน

### Priority 3: Machine-validated iteration state

เพิ่ม `state.json`, YAML หรือ frontmatter ที่กำหนด schema ชัดเจน เช่น:

```json
{
  "iteration": "iteration-1-example",
  "currentPhase": "implementation",
  "status": "in_progress",
  "completedPhases": ["requirements", "design"],
  "waivers": [],
  "nextAction": "run automated tests"
}
```

จากนั้น generate `audit.md` จาก state แทนการให้ AI แก้สถานะในหลายตำแหน่งเอง

Gate ต้องตรวจอย่างน้อยว่า:

- `complete` ใช้ไม่ได้หากมี required phase ค้าง
- decision status ต้องตรงกับ plan/audit
- output ที่ phase กำหนดต้องมีจริง
- phase ที่ skip ต้องมี waiver, owner, date และผลกระทบ
- test evidence ต้องอ้างอิง command/result จริง

### Priority 4: Traceability matrix

เชื่อม artifact chain ให้ตรวจได้:

```text
Requirement → Acceptance Criteria → Design → Task → Test → Evidence
```

ควรมี ID ที่ stable และ validator ตรวจ orphan/missing links

### Priority 5: Reference project และ workshop

สร้าง project ตัวอย่างที่ผ่าน Buaflow ครบวงจร:

- Phase 0–7
- Daily task workflow
- Gate และ CI
- UAT release
- Production checklist
- Phase 8 retrospective

สิ่งนี้จะช่วยทั้ง onboarding และเป็น integration test ของ Buaflow เอง

### Priority 6: Production profile แบบ fail-closed

เพิ่ม profile เช่น `mode: workshop | standard | production`

เมื่อเป็น production:

- ไม่มี verify command → fail
- ไม่มี secret scanner → fail
- dependency audit มี high/critical → fail
- CI/branch protection ไม่พร้อม → fail หรือรายงาน blocker ชัดเจน
- required test/evidence หาย → fail
- status/artifact ขัดกัน → fail

### Priority 7: Automated test ของ Buaflow scripts

ควรเพิ่ม behavior tests ให้:

- `gate.js`
- `check-config.js`
- `docs-lint.js`
- `guard-bash.js`
- `guard-edit.js`
- `guard-new-component.js`
- `board.js`
- `stack-config.js`

ครอบคลุมทั้ง success, failure และ fail-open scenarios

---

## สิ่งที่ไม่ควรนำมาใช้ตรง ๆ

1. บังคับ DDD เต็มชุดกับ CRUD หรืองานเล็กทุกชิ้น
2. บังคับ decision และ plan approval ทุก phase โดยไม่พิจารณาความเสี่ยง
3. ใช้ Markdown audit เป็น state หลักโดยไม่มี validator
4. อนุญาตให้ข้าม test/dev-task phase แล้วใช้สถานะ Complete โดยไม่มี waiver
5. ใช้ local-first/in-memory workshop defaults เป็น production defaults
6. ถือว่า prompt/rule เป็น enforcement โดยไม่มี hook หรือ CI รองรับ

---

## Roadmap ที่แนะนำ

### ระยะสั้น

1. เพิ่ม decision record template แบบ risk-based
2. ทำ production mode ให้ verify, audit และ secret scan fail-closed
3. เพิ่ม state validator เข้า `gate.js`
4. เพิ่ม automated tests ให้ hooks/gate

### ระยะกลาง

1. เพิ่ม traceability matrix
2. ทำ canonical workflow ที่ tool-agnostic
3. เพิ่ม Codex/Copilot adapters
4. สร้าง reference application

### ระยะยาว

1. ทำ installation CLI/plugin
2. เพิ่ม workflow conformance tests ข้าม AI tools
3. เก็บ metrics เช่น lead time, rework, escaped defects และ gate failure rate
4. ใช้ข้อมูลจาก production จริงมาปรับ Phase 8

---

## บทสรุปสุดท้าย

**Buaflow เหมาะเป็นฐานหลักมากกว่าและมีความพร้อมสำหรับ production delivery สูงกว่า** เพราะมี executable enforcement, CI/release/rollback/security และ daily delivery loop ที่ครบกว่า

**AI-DLC Starter Template มีจุดแข็งจริง** ในด้าน human decision, DDD, multi-tool และ onboarding แต่ในสภาพปัจจุบันเหมาะกับ workshop และ MVP มากกว่าการเป็น production delivery system

ข้อเสนอสุดท้าย:

> ใช้ Buaflow เป็นแกน แล้วนำ Decision Record, tool-agnostic adapters, traceability matrix และ workshop/reference implementation ของอีกทีมมาเสริม พร้อมเปลี่ยน production gate ให้ fail-closed

หากทำรายการ Priority 1–7 ได้ครบ คะแนนความพร้อมของ Buaflow มีโอกาสเพิ่มจากประมาณ **82/100 เป็น 90/100 หรือสูงกว่า**

