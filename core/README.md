# core — vendor-neutral workflow content (MT-001)

`core/` เป็น **ชั้น "canonical workflow protocol"** ตาม `BUAFLOW_PRODUCT_ROADMAP.md` หัวข้อ Model and
Tool Independence (MT-001) — เนื้อหาของ workflow (rule/skill/agent) เขียนที่นี่ **ครั้งเดียว** แล้วให้
generator ต่อ vendor แต่ละตัวสร้างรูปแบบเฉพาะของตัวเองออกไป แทนการเขียนซ้ำในแต่ละ `<vendor>-setup/`

## มีอะไรบ้างตอนนี้

| ชั้นย่อย | สถานะ | Generator |
|---|---|---|
| `core/rules/*.md` | ทำแล้ว (MT-001) | `scripts/generate-workflow-rules.js` → `claude-setup/rules/*.md` (MT-002) |
| `core/skills/*.md` | ทำแล้ว (MT-001) | `scripts/generate-workflow-skills.js` → `claude-setup/skills/*/SKILL.md` (MT-002) |
| `core/agents/*.md` | ทำแล้ว (MT-001) | `scripts/generate-workflow-agents.js` → `claude-setup/agents/*.md` (MT-002) |
| hooks / settings | ยังไม่ทำ | — |

**เริ่มจาก rules ก่อน** เพราะไฟล์เดิม (`claude-setup/rules/*.md`) มีแค่ frontmatter `paths:` + body
markdown ล้วน ไม่มี syntax ผูกกับ Claude Code เลย — เป็น vendor-neutral อยู่แล้วในทางเนื้อหา จึงพิสูจน์
pattern core→generator ได้ก่อนไปแตะของที่ซับซ้อนกว่า **skills/agents ทำต่อในรอบเดียวกัน** ด้วยหลักการ
เดียวกัน แต่ต้องออกแบบ neutral representation เพิ่มสำหรับ syntax ที่ผูกกับ Claude Code โดยตรง:

| Claude Code syntax | Neutral representation ใน core | ทำไมทำแบบนี้ |
|---|---|---|
| `$ARGUMENTS` ในบอดี้ | `{{ARGUMENTS}}` | concept "argument ของ slash command" มีในทุก CLI agent ที่รองรับ slash command — abstract ได้จริง |
| `` !`command` `` (inline bash execution ในบอดี้) | `{{shell: command}}` | concept "รันคำสั่งแล้วแทรกผลลัพธ์ก่อนส่ง prompt" พบได้ทั่วไปในเครื่องมือประเภทนี้ |
| `disable-model-invocation: true` | `invocation: human` (ค่า default คือ `human-or-model`) | concept "ใครเรียกได้" เป็นแนวคิดกลาง ไม่ผูกกับ syntax ของ Claude |
| `model: haiku\|sonnet\|opus` ของ subagent | `modelTier: fast\|balanced\|deep` | ทุกค่ายมี model ตระกูลเล็ก/กลาง/ใหญ่ — abstract เป็น tier ได้จริง |
| `allowed-tools` (permission DSL เช่น `Bash(git *)`) ของ skill | `claudeAllowedTools: [...]` (เก็บ token เดิมตรง ๆ ตามลำดับเดิม) | **ไม่ทำ neutral** — เป็น syntax เฉพาะ Claude Code ที่ไม่มี consumer ตัวที่สองมาพิสูจน์ neutral shape ที่ถูกต้อง การเดาไปก่อนเสี่ยงได้ schema ผิด |
| `tools:` ของ subagent (เช่น `Read, Grep, Glob, Bash`) | `claudeTools: [...]` (เก็บชื่อ tool เดิมตรง ๆ) | เหตุผลเดียวกับ `claudeAllowedTools` — สอดคล้องกันไว้ก่อน ดีกว่าทำ taxonomy ใหม่ที่พิสูจน์ไม่ได้ |

`hooks`/`settings.json` ยังไม่ทำ เพราะเป็นโค้ด (JS ที่รันจริง) + permission/event binding ของ Claude Code
เอง ไม่ใช่ "prompt/instruction" แบบ rule/skill/agent — ต้องคิดแยกว่า neutral shape ของมันคืออะไร

พิสูจน์ lossless ด้วยวิธีเดียวกันทุกครั้ง ไม่ว่าจะเป็นชั้นย่อยไหน: regenerate แล้ว `git diff` ต้องว่าง
(byte-for-byte) ไม่ใช่แค่ "ดูคล้ายกัน" — ดู `development/state.json` MT-001/MT-002 notes

## รูปแบบไฟล์ `core/rules/<id>.md`

```markdown
---
description: ประโยคเดียวบอกว่า rule นี้คุมอะไร
triggerPaths: ["**/glob/**/*.ts", "**/other/**"]
---

<body markdown — เนื้อหาที่จะไปอยู่ใน rule ของทุก vendor ที่รองรับ path-scoped rule>
```

## รูปแบบไฟล์ `core/skills/<id>.md`

```markdown
---
description: ประโยคเดียวบอกว่า skill นี้ทำอะไร
argumentHint: <บอกรูปแบบ argument ที่คาดหวัง>
invocation: human-or-model          # ไม่ใส่ = default นี้ · ใส่ human เมื่อ side effect ย้อนยาก (release/hotfix/…)
claudeAllowedTools: ["Read","Glob","Grep","Bash(git *)"]
---

<คำสั่งแรก>: {{ARGUMENTS}}

<body markdown — ใช้ {{shell: <command>}} แทนตำแหน่งที่ต้อง inline ผลลัพธ์คำสั่งก่อนส่ง prompt>
```

## รูปแบบไฟล์ `core/agents/<id>.md`

```markdown
---
description: ประโยคเดียวบอกว่า subagent นี้ทำอะไร
modelTier: fast | balanced | deep
claudeTools: ["Read","Grep","Glob","Bash"]
---

<body markdown>
```

- `<id>` มาจากชื่อไฟล์เสมอ (ไม่มี field `id` ซ้ำในตัวไฟล์ ทั้ง 3 ชนิด)
- field แบบ list (`triggerPaths`, `claudeAllowedTools`, `claudeTools`) เป็น **JSON array บรรทัดเดียว**
  (ไม่ใช่ YAML block list) — ผู้ parse เป็น regex + `JSON.parse` ล้วน ไม่มี YAML dependency
- body คือ markdown ปกติ — เฉพาะ skill เท่านั้นที่มี placeholder พิเศษ (`{{ARGUMENTS}}`, `{{shell: ...}}`)
  rule/agent ไม่มี syntax เฉพาะ vendor ใด ๆ ในบอดี้เลย

## วิธีใช้

```bash
node scripts/generate-workflow-rules.js --check     # อยู่ใน npm run check ทั้ง 3 คำสั่ง
node scripts/generate-workflow-skills.js --check
node scripts/generate-workflow-agents.js --check

node scripts/generate-workflow-rules.js --write      # generate claude-setup/rules/*.md ใหม่จาก core/rules/*.md
node scripts/generate-workflow-skills.js --write     # generate claude-setup/skills/*/SKILL.md ใหม่จาก core/skills/*.md
node scripts/generate-workflow-agents.js --write     # generate claude-setup/agents/*.md ใหม่จาก core/agents/*.md
```

**แก้ rule/skill/agent ต้องแก้ที่ `core/` แล้วรัน `--write`** — ห้ามแก้ไฟล์ใน `claude-setup/` ตรง ๆ
(`--check` จะจับว่าไม่ตรงกันและ fail `npm run check`)

## เพิ่ม adapter ค่ายอื่น (Codex/Copilot/…) ในอนาคต

เขียน generator ใหม่ที่อ่าน `core/rules|skills|agents/*.md` ชุดเดียวกันนี้ แล้ว render เป็นรูปแบบที่
vendor นั้นต้องการ (เช่น AGENTS.md ของ Codex) — **ไม่ต้องแตะ `core/` เลย** นี่คือทั้งหมดของสิ่งที่
MT-001/MT-002 พิสูจน์: core หนึ่งชุด สร้างได้หลาย adapter รอบนี้พิสูจน์ด้วย consumer เดียว (Claude Code)
ตาม `BUAFLOW_PRODUCT_ROADMAP.md` หลักการข้อ 4 (golden path ก่อน infinite flexibility) — Codex/Copilot
adapter ยังไม่ถูกเรียกใช้งานจริงจนกว่าจะมีคนขอ (ดู decision D-006 ใน `development/state.json`)

ถ้า adapter ใหม่นั้นต้องการ field ที่ `claudeAllowedTools`/`claudeTools` ยังไม่ครอบคลุม (เช่น permission
model ที่หน้าตาต่างจาก Claude Code มาก) — นั่นคือสัญญาณว่าถึงเวลาออกแบบ neutral shape จริงสำหรับ
tool-permission scope แล้ว (ตอนนี้มี consumer แค่ตัวเดียวเลยยังไม่ทำ ดูตารางด้านบน) อย่าเดาทำไว้ก่อน
ไม่มี consumer ตัวที่สองพิสูจน์
