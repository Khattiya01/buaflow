# claude-setup — config ที่จะถูกติดตั้งลงโปรเจกต์

โฟลเดอร์นี้คือ **ชั้น "configuration as control"** ของ kit
Phase 7 จะคัดลอกทุกอย่างในนี้ไปไว้ที่ `.claude/` ของโปรเจกต์จริง

## แผนที่การติดตั้ง

```
claude-setup/skills/*/SKILL.md   →  .claude/skills/*/SKILL.md
claude-setup/rules/*.md          →  .claude/rules/*.md
claude-setup/agents/*.md         →  .claude/agents/*.md
claude-setup/hooks/*.js          →  .claude/hooks/*.js
claude-setup/settings.json.tpl   →  .claude/settings.json
claude-setup/evals/*.md          →  docs/evals/*.md
```

**ระหว่างคัดลอกต้องปรับให้ตรง stack จริง** อย่าคัดลอกดิบ ๆ:
- `paths:` ใน rules ต้องตรงกับโครงโฟลเดอร์จริง (ไม่งั้น rule จะเงียบไปเลยโดยไม่มี error)
- คำสั่งใน skills และ `settings.json` ต้องเป็นคำสั่งที่มีจริงใน `package.json`
- ตัดส่วนที่ไม่เกี่ยวกับ stack ที่เลือกออก

## 4 ชั้น ต่างกันยังไง

| ชั้น | โหลดเมื่อ | กิน context | ใช้กับ |
|---|---|---|---|
| **rules** | เมื่อ Claude แตะไฟล์ที่ match `paths:` | เฉพาะตอนที่เกี่ยว | ข้อบังคับเฉพาะโซน (UI, API, migration, เทส) |
| **skills** | เมื่อถูกเรียก `/ชื่อ` หรือเมื่อ Claude เห็นว่าเกี่ยวจาก `description` | description ทุก session, เนื้อเต็มตอนใช้ | ขั้นตอนที่ทำซ้ำ (`/task`, `/review`, `/done`) |
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
| `/review` | คน + Claude | รีวิวงาน (ดึง git diff มาให้ในตัว) |
| `/done` | **คนเท่านั้น** | ปิดงาน merge อัปเดต board |
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

**ข้อแลกเปลี่ยนที่ต้องรู้ก่อนย้าย:** skill จะถูก namespace เป็น `/project-kit:task`
และการแก้ config รายโปรเจกต์จะยากขึ้น (ต้องแก้ที่ต้นทางแล้ว publish)
ตอนที่ยังปรับ kit บ่อย ๆ อยู่ **การคัดลอกเข้าโปรเจกต์ตรง ๆ เหมาะกว่า**
