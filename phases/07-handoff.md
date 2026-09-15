# Phase 7 — ส่งมอบ (Handoff) และเปิดใช้ระบบจริง

> เป้าหมาย: แปลงทุกอย่างที่วางแผนไว้ให้กลายเป็น **config ที่ทำงานจริง** ไม่ใช่แค่เอกสารที่หวังว่าจะมีคนอ่าน
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

ใช้ `project-kit/templates/constitution.tpl.md` แล้วเติมมาตรา 9 จากผลการตัดสินใจใน Phase 1-5

ไฟล์นี้คือเกณฑ์ที่ `/spec`, `/plan`, `/review` และ `code-reviewer` จะใช้ตัดสิน —
ถ้าไม่มี ทุกอย่างที่เหลือจะไม่มีอะไรให้ยึด

**ต้องเติมให้ครบ:** `{{VERIFY_COMMAND}}` และเวลาที่ยอมรับได้ของมัน

## 7.2 `AGENTS.md` — กติกาหลัก (สำคัญที่สุด)

ใช้ `project-kit/templates/AGENTS.md.tpl` เติมค่าจริงจาก Phase 1-6

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

ใช้ `project-kit/templates/CLAUDE.md.tpl`

บรรทัดแรกต้องเป็น `@AGENTS.md` (import) แล้วต่อด้วยเฉพาะของที่เป็นของ Claude Code:
รายการ skills, ตาราง rules, ตาราง hooks, การจัดการ context

**ห้ามเขียนกติกาซ้ำใน 2 ไฟล์** — ถ้าซ้ำแล้วขัดกัน AI จะเลือกเองแบบสุ่ม

> ทำไมต้องแยก: `AGENTS.md` เป็นมาตรฐานกลางที่ Codex / Cursor / Copilot / Gemini อ่านได้ด้วย
> วันที่เปลี่ยนเครื่องมือ ความรู้โปรเจกต์ไม่หายไปกับ Claude Code

## 7.4 ติดตั้ง `.claude/` ทั้งชุด

```
project-kit/claude-setup/skills/*     →  .claude/skills/
project-kit/claude-setup/rules/*      →  .claude/rules/
project-kit/claude-setup/agents/*     →  .claude/agents/
project-kit/claude-setup/hooks/*      →  .claude/hooks/
project-kit/claude-setup/settings.json.tpl  →  .claude/settings.json
```

**ต้องปรับระหว่างคัดลอก (ห้ามคัดดิบ):**

| ไฟล์ | ปรับอะไร |
|---|---|
| `rules/*.md` | `paths:` ต้องตรงกับโครงโฟลเดอร์จริงที่ scaffold ไว้ |
| `skills/*/SKILL.md` | คำสั่งต้องเป็นคำสั่งที่มีจริงใน `package.json` |
| `settings.json` | `permissions.allow` ตามคำสั่งจริง, `deny` ตามไฟล์ลับจริง |
| `hooks/guard-edit.js` | path ของ shadcn generated ถ้าไม่ได้อยู่ที่ `components/ui/` |

**แล้วทดสอบว่า hook ทำงานจริง** (ดู `claude-setup/hooks/README.md`):

```bash
echo '{"tool_input":{"file_path":"src/components/ui/button.tsx"}}' | node .claude/hooks/guard-edit.js; echo $?   # ต้องได้ 2
echo '{"tool_input":{"command":"git commit --no-verify -m x"}}' | node .claude/hooks/guard-bash.js; echo $?      # ต้องได้ 2
echo '{}' | node .claude/hooks/session-context.js                                                                # ต้องได้ JSON
```

ถ้าข้อไหนไม่ได้ผลตามนี้ **หยุดแก้ก่อน** — hook ที่ไม่ทำงานอันตรายกว่าไม่มี hook เพราะทำให้เข้าใจผิดว่ามีการป้องกันอยู่

## 7.5 `REVIEW.md` — นโยบายการรีวิว

ใช้ `project-kit/templates/REVIEW.tpl.md` วางที่ราก repo
ปรับเพดานข้อสังเกตและรายการ "ไม่ต้องรายงาน" ให้ตรงโปรเจกต์

## 7.6 คัดลอก standards และ templates เข้าโปรเจกต์

```
project-kit/standards/*.md                 →  docs/standards/
project-kit/templates/intent.tpl.md        →  docs/templates/
project-kit/templates/plan.tpl.md          →  docs/templates/
project-kit/templates/spec.tpl.md          →  docs/templates/
project-kit/templates/task.tpl.md          →  docs/templates/
project-kit/templates/adr.tpl.md           →  docs/templates/
project-kit/templates/eval-case.tpl.md     →  docs/templates/
project-kit/claude-setup/evals/*.md        →  docs/evals/
```

ระหว่าง copy ให้ **ปรับเนื้อหาให้ตรงกับ stack จริง** อย่า copy ดิบ ๆ

สร้างโฟลเดอร์เปล่าพร้อม `.gitkeep`: `docs/intents/`, `docs/plans/`, `docs/incidents/`, `docs/releases/`

## 7.7 `CONTRIBUTING.md` และ `README.md` ของโปรเจกต์

- `CONTRIBUTING.md` — สำหรับคน: setup เครื่อง, รัน docker, รัน test, รัน sonar, branch/commit convention, ขั้นตอนรีวิว
- `README.md` — ภาพรวม, stack, **3 บรรทัดแรกต้องรันได้จริง**, ผังโฟลเดอร์, ลิงก์เอกสารสำคัญ

## 7.8 `docs/workflow.md` — วงจรการทำงานประจำวัน

คัดจาก `project-kit/standards/workflow-lifecycle.md` มาปรับให้ตรงโปรเจกต์

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
| เปิด session ใหม่แล้ว `/context` เห็น `CLAUDE.md` และ `AGENTS.md` โหลดจริง | ⬜ |
| พิมพ์ `/` แล้วเห็น skills ทั้ง 9 ตัว | ⬜ |
| เปิดไฟล์ใน `components/` แล้ว rule `frontend-ui` โหลดเข้ามาจริง | ⬜ |
| hook ทั้ง 3 ตัวทดสอบผ่านตามข้อ 7.4 | ⬜ |
| เปิด session ใหม่แล้วเห็นสถานะ board ถูกฉีดเข้ามาอัตโนมัติ | ⬜ |

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

รัน `docs/evals/EV-001` ถึง `EV-003` ใน session ใหม่ที่สะอาด แล้วบันทึกผล
**นี่คือ baseline** ที่จะใช้เทียบทุกครั้งที่แก้ config ในอนาคต

ถ้าเคสไหนไม่ผ่านตั้งแต่วันแรก แปลว่า config ยังไม่ดีพอ — แก้ก่อนปิด Phase

## 7.12 ปิดงาน

1. commit ทั้งหมด
2. บอกผู้ใช้ว่า **จากนี้ทำงานผ่าน skills ไม่ต้องเปิด `project-kit/` อีก**
   แต่ **อย่าลบ kit** — Phase 8 จะกลับมาใช้ทุกครั้งที่ปรับ config
   (ถ้าไม่อยากให้เกะกะ ย้ายไป `docs/_archive/project-kit/` ได้)
3. แสดง **3 คำสั่งแรกที่ควรใช้ในวันถัดไป**:
   ```
   /intent <เรื่องที่อยากทำ>    เปิดงานใหม่
   /task                       หยิบ task ถัดไปจาก board
   /plan T-xxx                 วางแผนก่อนลงมือ
   ```
4. บอกว่าเมื่อไหร่ควรกลับมาทำ **Phase 8** (ทบทวนและปรับ config)
