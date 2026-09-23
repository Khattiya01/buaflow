# core — vendor-neutral workflow content (MT-001)

`core/` เป็น **ชั้น "canonical workflow protocol"** ตาม `BUAFLOW_PRODUCT_ROADMAP.md` หัวข้อ Model and
Tool Independence (MT-001) — เนื้อหาของ workflow (rule/skill/agent) เขียนที่นี่ **ครั้งเดียว** แล้วให้
generator ต่อ vendor แต่ละตัวสร้างรูปแบบเฉพาะของตัวเองออกไป แทนการเขียนซ้ำในแต่ละ `<vendor>-setup/`

## มีอะไรบ้างตอนนี้

| ชั้นย่อย | สถานะ | Generator |
|---|---|---|
| `core/rules/*.md` | ทำแล้ว (MT-001) | `scripts/generate-workflow-rules.js` → `claude-setup/rules/*.md` (MT-002) |
| skills | ยังไม่ทำ | — |
| agents | ยังไม่ทำ | — |
| hooks / settings | ยังไม่ทำ | — |

**เหตุผลที่เริ่มจาก rules อย่างเดียว:** rule ไฟล์เดิม (`claude-setup/rules/*.md`) มีแค่ frontmatter
`paths:` + body markdown ล้วน ไม่มี syntax ผูกกับ Claude Code เลย จึงเป็น vendor-neutral อยู่แล้วในทางเนื้อหา
ต่างจาก skill/agent ที่ผูกกับ Claude Code โดยตรง (`$ARGUMENTS`, inline bash execution ในบอดี้ผ่าน
`` !`command` ``, `allowed-tools` permission string, `model:` hint ของ subagent) — สิ่งเหล่านี้ต้องออกแบบ
neutral representation ของตัวเองก่อนถึงจะย้ายเข้า core ได้โดยไม่เสียความหมาย ไม่ใช่แค่ตัดแปะ ทำแบบเดา ๆ
ในรอบนี้จะเสี่ยงได้ core ที่ผิด — ปล่อยเป็น follow-up (ดู `development/state.json`, MT-001 notes)

## รูปแบบไฟล์ `core/rules/<id>.md`

```markdown
---
description: ประโยคเดียวบอกว่า rule นี้คุมอะไร
triggerPaths: ["**/glob/**/*.ts", "**/other/**"]
---

<body markdown — เนื้อหาที่จะไปอยู่ใน rule ของทุก vendor ที่รองรับ path-scoped rule>
```

- `<id>` มาจากชื่อไฟล์ (ไม่มี field `id` ซ้ำในตัวไฟล์)
- `description` และ `triggerPaths` เป็น **JSON array บรรทัดเดียว** (ไม่ใช่ YAML block list) — ผู้ parse
  (`scripts/generate-workflow-rules.js`) เป็น regex + `JSON.parse` ล้วน ไม่มี YAML dependency
- body คือ markdown ปกติ ไม่มี syntax เฉพาะ vendor ใด ๆ

## วิธีใช้

```bash
node scripts/generate-workflow-rules.js --check    # ตรวจว่า claude-setup/rules/*.md ตรงกับ core/rules/*.md ไหม (อยู่ใน npm run check)
node scripts/generate-workflow-rules.js --write     # generate claude-setup/rules/*.md ใหม่จาก core/rules/*.md
```

**แก้ rule ต้องแก้ที่ `core/rules/<id>.md` แล้วรัน `--write`** — ห้ามแก้ `claude-setup/rules/*.md` ตรง ๆ
(`--check` จะจับว่าไม่ตรงกันและ fail `npm run check`)

## เพิ่ม adapter ค่ายอื่น (Codex/Copilot/…) ในอนาคต

เขียน generator ใหม่ที่อ่าน `core/rules/*.md` ชุดเดียวกันนี้ แล้ว render เป็นรูปแบบที่ vendor นั้นต้องการ
(เช่น AGENTS.md ของ Codex) — **ไม่ต้องแตะ `core/` เลย** นี่คือทั้งหมดของสิ่งที่ MT-001/MT-002 พิสูจน์:
core หนึ่งชุด สร้างได้หลาย adapter รอบนี้พิสูจน์ด้วย consumer เดียว (Claude Code) ตาม
`BUAFLOW_PRODUCT_ROADMAP.md` หลักการข้อ 4 (golden path ก่อน infinite flexibility) — Codex/Copilot
adapter ยังไม่ถูกเรียกใช้งานจริงจนกว่าจะมีคนขอ (ดู decision D-006 ใน `development/state.json`)
