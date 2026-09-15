# Changelog ของ project-kit

> kit นี้เป็นมาตรฐานที่พัฒนาต่อเนื่อง ไม่ใช่ของใช้แล้วทิ้ง
> ทุกครั้งที่บทเรียนจากโปรเจกต์จริงถูกย้อนกลับมาที่นี่ (Phase 8.7) ให้เพิ่มบรรทัดในไฟล์นี้

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
- `claude-setup/evals/` + `templates/eval-case.tpl.md` — regression test ของ config
- หมวด "สิ่งที่ AI ในโปรเจกต์นี้เคยทำผิด" ใน `AGENTS.md` + กฎเลื่อนชั้นเมื่อพลาดซ้ำ
- `standards/agent-config.md` — คู่มือว่ากฎข้อไหนควรไปอยู่ชั้นไหน
- Phase 8 ใช้ `/usage` (attribution ราย skill / subagent / MCP + flag พฤติกรรม) เป็นเครื่องมือตรวจ
  แทนการสร้าง dashboard เอง พร้อมตารางวิธีตีความตัวเลข

**ไม่ผูก vendor**
- `templates/AGENTS.md.tpl` เป็นแกน (มาตรฐานกลางที่ Codex/Cursor/Copilot/Gemini อ่านได้)
- `CLAUDE.md` เหลือเป็นชั้นบางที่ `@AGENTS.md` แล้วต่อด้วยของเฉพาะ Claude Code

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
