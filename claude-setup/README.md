# claude-setup — config ที่จะถูกติดตั้งลงโปรเจกต์

โฟลเดอร์นี้คือ **ชั้น "configuration as control"** ของ kit
Phase 7 จะคัดลอกทุกอย่างในนี้ไปไว้ที่ `.claude/` ของโปรเจกต์จริง

โฟลเดอร์นี้คือ Claude Code adapter (MT-002) ของ Buaflow — `rules/*.md`, `skills/*/SKILL.md` และ
`agents/*.md` generate มาจาก `core/rules|skills|agents/*.md` (vendor-neutral core, MT-001) แล้ว
`node scripts/generate-workflow-{rules,skills,agents}.js --check` ตรวจไม่ให้สองฝั่งเพี้ยนจากกัน
(อยู่ใน `npm run check` ทั้งสามคำสั่ง) **แก้เนื้อหา rule/skill/agent ต้องแก้ที่ `core/` แล้วรัน `--write`
— ห้ามแก้ไฟล์ในนี้ตรง ๆ** hooks/settings ในนี้ยังเป็น Claude-Code-specific content ที่เขียนตรงในนี้
(ยังไม่ผ่าน core) — ดูเหตุผลใน `core/README.md`

## แผนที่การติดตั้ง

```
claude-setup/skills/*/SKILL.md   →  .claude/skills/*/SKILL.md   generate จาก core/skills/*.md — ดู core/README.md, ห้ามแก้ไฟล์นี้ตรง ๆ
claude-setup/rules/*.md          →  .claude/rules/*.md          generate จาก core/rules/*.md — ดู core/README.md, ห้ามแก้ไฟล์นี้ตรง ๆ
claude-setup/agents/*.md         →  .claude/agents/*.md         generate จาก core/agents/*.md — ดู core/README.md, ห้ามแก้ไฟล์นี้ตรง ๆ
claude-setup/hooks/*.js          →  .claude/hooks/*.js
claude-setup/check-config.js     →  .claude/check-config.js
claude-setup/docs-lint.js        →  .claude/docs-lint.js       artifact chain ตรงกันไหม (CI รันได้)
claude-setup/readiness.js        →  .claude/readiness.js       ตรวจ readiness R0-R4 จาก evidence manifest
claude-setup/requirement-coverage.js →  .claude/requirement-coverage.js  requirement ทุกข้อมี proof หรือ approved exception ที่ยังไม่หมดอายุ (EP-002)
claude-setup/board.js            →  .claude/board.js           generate board.md จากไฟล์ task
claude-setup/gate.js             →  .claude/gate.js            ด่านเดียว: verify + check-config + docs-lint + requirement-coverage
claude-setup/verify.js           →  .claude/verify.js          ทางเข้าเดียวของคำสั่งตรวจ (อ่านคำสั่งจริงจาก stack.json)
claude-setup/run.js              →  .claude/run.js             คำสั่งรอง: coverage / audit / apiTest
claude-setup/stack-config.js     →  .claude/stack-config.js    ตัวอ่าน stack.json ที่สคริปต์อื่นใช้ร่วมกัน
claude-setup/stack.json          →  .claude/stack.json         stack ของโปรเจกต์นี้: คำสั่ง, pattern ไฟล์, formatter, ไฟล์ที่ห้ามแก้
claude-setup/ci/pre-push.tpl     →  .husky/pre-push
claude-setup/ci/*.yml.tpl        →  .github/workflows/gate.yml | .gitlab-ci.yml
claude-setup/settings.json.tpl   →  .claude/settings.json
claude-setup/evals/*.md          →  docs/evals/*.md
templates/readiness-manifest.tpl.json → docs/evidence/readiness.json
templates/requirement-coverage.tpl.json → docs/evidence/requirement-coverage.json
```

**ระหว่างคัดลอกต้องปรับให้ตรง stack จริง** อย่าคัดลอกดิบ ๆ — **เริ่มที่ `stack.json` ก่อนเสมอ** เพราะสคริปต์ที่เหลืออ่านค่าจากไฟล์นี้:
- `stack.json` — `verifyCommand`, `codeFilePattern`, `formatCommands`, `preflightHookPath`, `protected`
  ค่าเริ่มต้นเป็น JS/TS + pnpm · stack อื่น (Python, .NET, Go) แก้ที่ไฟล์นี้ที่เดียว ไม่ต้องแตะไส้สคริปต์
- `stack.json` เป็น public artifact v1 มี `$schema` และ `schemaVersion` — ไฟล์จาก Buaflow รุ่นเก่า migrate ได้ด้วย `node buaflow/scripts/migrate-artifact.js --type stack-config --file .claude/stack.json` (default เป็น preview)
- `protected` ต้องเป็นรายการไฟล์ที่ generate อัตโนมัติ**ของโปรเจกต์นี้** — ไม่ได้ใช้ shadcn ก็ลบ `components/ui/**` ทิ้ง
- `paths:` ใน rules ต้องตรงกับโครงโฟลเดอร์จริง (ไม่งั้น rule จะเงียบไปเลยโดยไม่มี error)
- คำสั่งใน skills และ `settings.json` ต้องเป็นคำสั่งที่มีจริงในโปรเจกต์
- ตัดส่วนที่ไม่เกี่ยวกับ stack ที่เลือกออก — เช่น ใช้ App Router ก็ลบ pattern `**/pages/**` ทิ้ง

**แล้วรัน `node .claude/gate.js`** (= verify + `check-config.js` + `docs-lint.js`) — ส่วน `check-config.js` จะบอกว่า pattern ไหนไม่ match อะไรเลย,
rule ไหนตายเงียบ, ไฟล์โค้ดกลุ่มไหนไม่มี rule คุ้มครอง, hook ผูกครบและคืน exit code ถูกไหม
และ `AGENTS.md` ยังมี placeholder ค้างอยู่ไหม

ต้องได้ `ต้องแก้: 0` ก่อนถือว่าติดตั้งเสร็จ รันซ้ำทุกครั้งที่ปรับ config (Phase 8)

`readiness.js` แยกจาก gate ปกติใน v1 เพื่อไม่ทำให้โปรเจกต์เดิม fail ระหว่าง adoption ใช้คำสั่งนี้ประเมินระดับที่ต้องการ:

```bash
node .claude/readiness.js --file docs/evidence/readiness.json --level R3
```

ดูนิยามระดับและหลักฐานที่ต้องมีใน `standards/readiness-levels.md` กับ `standards/deployment-ready-contract.md`

เมื่อเก็บ R3 evidence ครบแล้ว ให้เปลี่ยนค่าต่อไปนี้ใน `stack.json`:

```json
{
  "assuranceMode": "production",
  "readinessLevel": "R3",
  "readinessManifest": "docs/evidence/readiness.json",
  "auditMode": "required",
  "secretsMode": "required"
}
```

จากนั้น `gate.js` จะ fail-closed: verify/scanner/readiness ขาดหรือถูก skip ไม่ได้ และ `--docs-only` ใช้เป็น bypass ไม่ได้ ส่วนค่าเริ่มต้น `adoption` ยังคงพฤติกรรมเดิมเพื่อให้รับช่วงโปรเจกต์เก่าได้

## 4 ชั้น ต่างกันยังไง

| ชั้น | โหลดเมื่อ | กิน context | ใช้กับ |
|---|---|---|---|
| **rules** | เมื่อ Claude แตะไฟล์ที่ match `paths:` | เฉพาะตอนที่เกี่ยว | ข้อบังคับเฉพาะโซน (UI, API, migration, เทส) |
| **skills** | เมื่อถูกเรียก `/ชื่อ` หรือเมื่อ Claude เห็นว่าเกี่ยวจาก `description` | description ทุก session, เนื้อเต็มตอนใช้ | ขั้นตอนที่ทำซ้ำ (`/task`, `/check`, `/done`) |
| **agents** | เมื่อถูก delegate | แยก context ของตัวเอง | งานที่อ่านเยอะแต่คายนิดเดียว |
| **hooks** | ทุกครั้งที่ event ตรง | 0 (รันนอก context) | **กฎที่ห้ามพัง** |

## Skills ที่มีให้

| skill | ใครเรียกได้ | ทำอะไร |
|---|---|---|
| `/intent` | คน + Claude | เปิดงานใหม่ จับ "ทำไม" ก่อน |
| `/spec` | คน + Claude | spec ของ feature ใหญ่ (3 ไฟล์ 3 gate) |
| `/plan` | คน + Claude | วางแผนใน plan mode แล้ว commit ก่อนแตะโค้ด |
| `/task` | คน + Claude | หยิบงานมาทำ |
| `/ui` | คน + Claude | สร้าง component (ถามก่อนเสมอ) |
| `/check` | คน + Claude | ตรวจงาน: verify + เทียบ plan + เรียก built-in `/code-review` `/security-review` + subagent ตรวจกติกาโปรเจกต์ (ชื่อไม่ใช่ `/review` เพราะชนกับ alias ของ built-in) |
| `/done` | **คนเท่านั้น** | เปิด PR (ไม่ merge เอง) อัปเดตไฟล์ task แล้ว generate board |
| `/hotfix` | **คนเท่านั้น** | ขั้นตอน hotfix |
| `/release` | **คนเท่านั้น** | ปล่อยของขึ้น uat/prd |

3 ตัวท้ายตั้ง `disable-model-invocation: true` เพราะมี side effect ที่ย้อนยาก —
Claude เรียกเองไม่ได้ ต้องให้คนสั่ง

## เตรียมไว้ให้ทำเป็น plugin ทีหลัง

โครงในโฟลเดอร์นี้ตรงกับโครงของ Claude Code plugin อยู่แล้ว
วันที่มีโปรเจกต์ที่ใช้ kit นี้ตั้งแต่ 3 โปรเจกต์ขึ้นไป และมี git host แล้ว
การเปลี่ยนเป็น plugin เหลือแค่:

1. เพิ่ม `.claude-plugin/plugin.json` (name, version, description)
2. เพิ่ม `.claude-plugin/marketplace.json` ที่ราก repo
3. ทุกโปรเจกต์ติดตั้งด้วย `/plugin` แล้ว `git pull` ทีเดียวได้ config ใหม่ทั้งหมด

**ข้อแลกเปลี่ยนที่ต้องรู้ก่อนย้าย:** skill จะถูก namespace เป็น `/buaflow:task`
และการแก้ config รายโปรเจกต์จะยากขึ้น (ต้องแก้ที่ต้นทางแล้ว publish)
ตอนที่ยังปรับ kit บ่อย ๆ อยู่ **การคัดลอกเข้าโปรเจกต์ตรง ๆ เหมาะกว่า**
