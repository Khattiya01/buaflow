# Changelog ของ project-kit

> kit นี้เป็นมาตรฐานที่พัฒนาต่อเนื่อง ไม่ใช่ของใช้แล้วทิ้ง
> ทุกครั้งที่บทเรียนจากโปรเจกต์จริงถูกย้อนกลับมาที่นี่ (Phase 8.7) ให้เพิ่มบรรทัดในไฟล์นี้

## v2.2 — 2026-09-19

เลิก hardcode ชื่อเครื่องมือไว้ในสคริปต์ — **ไม่ใช่การเพิ่ม feature แต่คือการแก้ "เขียวปลอม"**
อาการเดิม: สคริปต์ฝัง `pnpm` / `\.tsx?$` / `prettier` / `.husky` เป็น regex ตายตัว โปรเจกต์ที่ไม่ตรงค่าเริ่มต้น
(รวม **JS/TS ที่ใช้ npm แทน pnpm หรือ Biome แทน Prettier** ไม่ใช่แค่ stack อื่น) จะเจอ hook ที่ exit 0 เงียบ ๆ เหมือนทำงานปกติ

- **`claude-setup/stack-config.js` + `stack.json`** — ที่เดียวที่รู้ว่าโปรเจกต์ใช้เครื่องมืออะไร
  (`verifyCommand`, `codeFilePattern`, `formatCommands`, `preflightHookPath`, `protected`)
  ใช้กติกาเดียวกับ `guard-edit.js`/`protected-paths.json` ซึ่งเป็นต้นแบบ: DEFAULTS ในสคริปต์ = ค่าเดิมเป๊ะ ๆ,
  ทับรายคีย์, ไฟล์พังก็ถอยไปค่าเริ่มต้นเงียบ ๆ → **โปรเจกต์ JS/TS เดิมไม่มีอะไรเปลี่ยน**
  **แทน `protected-paths.json`** (ไฟล์เดิมยังอ่านได้เป็น fallback — ดู UPGRADE.md)
- **`claude-setup/verify.js`** — ทางเข้าเดียวของคำสั่งตรวจ
  `allowed-tools: Bash(pnpm verify*)` เป็นกฎที่บังคับจริง ไม่ใช่ข้อความ — โปรเจกต์ที่ไม่ใช้ pnpm จึงรัน verify ของตัวเองไม่ได้เลย
  ทุก skill ที่เกี่ยวมี `Bash(node .claude/*)` อยู่แล้ว เรียกผ่านไฟล์นี้จึงผ่าน permission โดยไม่ต้องแก้ frontmatter
- **`claude-setup/run.js`** — คำสั่งรองตามชื่อ (`coverage`, `audit`, `apiTest`) อ่านจาก `commands` ใน `stack.json`
  เหตุผลเดียวกับ verify.js: `/release` มี `Bash(pnpm *)` ซึ่งใช้ไม่ได้กับ stack อื่น · คำสั่งที่ไม่ได้ตั้ง = บอกตรง ๆ แล้ว exit 1 ไม่ใช่เงียบแล้วผ่าน
- **`check-config.js` เลิกรายงานผ่านทั้งที่ไม่ได้ทดสอบ** — เดิมใช้ path สมมติ (`src/components/ui/button.tsx`)
  เป็น fixture ตอนทดสอบ hook ซึ่ง hook ตัดสินจาก pattern ล้วน จึงได้ exit ตามที่คาดเสมอแล้วขึ้น `ok`
  ตอนนี้ใช้เฉพาะไฟล์ที่มีอยู่จริง ไม่มีก็ `warn` ว่าข้ามเทส · เพิ่มการตรวจว่า `format-changed.js` มี formatter ที่ match จริงไหม
  · rule ตายพร้อมกันทุกไฟล์ → พิมพ์บรรทัดวินิจฉัยว่าเป็นเรื่อง stack ไม่ตรง ไม่ใช่พิมพ์ผิดทีละอัน

## v2.1 — 2026-09-17

> โปรเจกต์ที่ใช้ v1.0 อยู่ → **[UPGRADE.md](UPGRADE.md)** (ไม่ต้องรัน Phase ใหม่ ~1 session)

ปิดวงจรให้ใช้ production ได้จริง + ลด token ที่ซ้ำ ~30-40% ต่อ task cycle
จากการ audit ทั้ง kit เทียบกับ Claude Code official docs (memory/rules, skills, hooks, costs, commands)
**ทุกฟีเจอร์ที่ v2.0 อ้างว่ามีในเอกสารทางการ ตรวจแล้วมีจริงทั้งหมด** — ที่เปลี่ยนคือส่วนที่ยังเป็นกฎอ่อนหรือซ้ำซ้อน

### ปิดช่องโหว่ระดับ production (P0)

- **`claude-setup/gate.js`** — ด่านเดียว verify + check-config + docs-lint + board --check
  รันจาก `.husky/pre-push` (`ci/pre-push.tpl`) และ CI (`ci/github-actions.yml.tpl`, `ci/gitlab-ci.yml.tpl` เตรียมไว้ทั้งคู่)
  → กฎของ kit เป็น**กฎแข็งนอก session ของ Claude** ตั้งแต่ Phase 6 ไม่ต้องรอเลือก git host (เดิม "CI-ready" = honor system)
- **`claude-setup/docs-lint.js`** — เปลี่ยนกฎอ่อน 6 ข้อเรื่อง "เอกสารต้องตรงกัน" เป็นกฎแข็ง 1 ข้อ:
  task ที่ทำงานอยู่ → intent/spec/plan ต้องมีจริง, spec ต้องไม่เหลือ `[NEEDS CLARIFICATION]`, done ต้องมี commit,
  WIP ≤ 1, intent accepted ต้องมีปลายทาง, `--release <M>` บังคับทุก task done และ**ไม่มี `-test` ค้าง** (ปิดหนี้เทส frontend)
- **AI ไม่ merge เข้า main** — `guard-bash.js` บล็อก `git merge` บน main / `git push` เข้า main / `push --no-verify`
  `/done` เปิด PR แทน คนกด merge (ทำงานคนเดียวก็ทำ — ได้ประวัติผู้อนุมัติและ gate ได้รันจริง) + `EV-004-no-self-merge`
- **`/release` รันจบได้ตั้งแต่ยังไม่มี deploy target** — gate --release → build image ครั้งเดียว + digest → release note → แผน rollback
- **Data model v1 (Phase 4.4b)** — ล็อก core entities / ID / tenancy / soft delete / audit ก่อน scaffold
  `prisma/schema.prisma` = source of truth ตัวเดียว, `/spec` design.md เขียน DB change เป็น diff เทียบ schema
  (เดิมไม่มีโมเดลกลาง → feature หลังสร้างตารางซ้ำกับ feature ก่อนโดยไม่มีอะไรจับ)
  + เกณฑ์ diagram: ERD core / auth sequenceDiagram / topology **ตาราง** คุ้ม — C4 ครบชั้น / infra poster ไม่คุ้ม

### ลด token (`standards/context-budget.md` ใหม่ — อธิบายทุกข้อว่าตัดอะไรเพราะอะไร และอะไรห้ามตัด)

- **plan.md เป็นตัวบีบอัด** — หัวข้อใหม่ "ข้อกำหนดที่คัดมาแล้ว" (AC + มาตราธรรมนูญ + กติกา design + pattern)
  `/task` `/check` `code-reviewer` อ่าน plan.md **ไฟล์เดียว** ไม่ย้อนอ่าน spec/constitution/DoD ซ้ำ (เดิมอ่าน 3-4 รอบต่อ task)
- **`templates/verify.mjs.tpl`** — verify ที่พิมพ์สรุป ≤ 25 บรรทัด log เต็มลง `.verify.log` → "แปะผลจริง" ยังบังคับอยู่ในราคา 1/10
- **ไฟล์ task = source of truth ตัวเดียว** — `board.js` generate `board.md` (hook บล็อกแก้มือ), **ตัด `import.csv`**
  (เดิม `/done` เขียนข้อเท็จจริงเดียวกัน 3 ที่ทุกครั้ง)
- **DoD ราย type ย้ายไป `.claude/rules/`** ที่โหลดเองตาม path — `definition-of-done.md` เหลือหน้าจอเดียว (เดิม 7.6KB ถูก Read 2-3 ครั้ง/task)
- `/check` รายงาน**เฉพาะข้อที่ไม่ผ่าน** (`DoD: N/M — ไม่ผ่าน: …`) ส่งผลของ built-in/subagent ผ่านตามที่มันเขียน ไม่สรุปซ้ำ
- "ป้อนกลับเข้า config" ถามที่ `/done` ที่เดียว (เดิม `/review` + `/done` ถามซ้ำ)
- `code-reviewer` อ่านแค่ plan + diff + REVIEW.md (เดิม 7 เอกสาร) และ**ไม่**ไล่หาบั๊กทั่วไปเพราะ `/code-review` ทำไปแล้ว
- **`model:` ในทุก agent** — legacy-explorer: haiku, test-writer/code-reviewer: sonnet + ตารางโมเดลต่อขั้นใน AGENTS.md.tpl
- **trivial track** — typo/copy/log/chore ไม่ต้อง intent/plan (`track: trivial` ในไฟล์ task) กันคนเลิกใช้ระบบเพราะงานจิ๋วต้องผ่าน 5 skill
- `/done` → `/clear` เสมอ + compact instructions ใน CLAUDE.md.tpl
- `` !`…` `` ทุกตัวต่อท้าย `|| true` (docs: คำสั่งที่ fail จะ abort ทั้ง skill — repo ที่ยังไม่มี commit พัง)

### ไฟล์ที่ AI อ่านอย่างเดียวเป็นภาษาอังกฤษ

`AGENTS.md.tpl`, `CLAUDE.md.tpl`, `REVIEW.tpl.md`, `claude-setup/rules/*`, `claude-setup/skills/*`, `claude-setup/agents/*`, ข้อความ stderr/additionalContext ของ hooks,
`reason` ใน `stack.json` — ภาษาไทย tokenize แพงกว่าอังกฤษ ~2 เท่า และไฟล์กลุ่มนี้ถูกโหลดทุก session
ทุกไฟล์มีคำสั่ง "reply to the user in Thai / write docs/ artifacts in full Thai" ไฟล์ที่คนอ่าน (phases, standards, docs templates, START-HERE, README) ยังเป็นไทย
(กฎเหล็กข้อ 6 ใน START-HERE ระบุข้อยกเว้นนี้แล้ว)

### ใช้ built-in ของ Claude Code แทนเขียนเอง

- **`/review` → `/check`** — `/review` เป็น alias ของ built-in `/code-review` ชื่อชนกัน (`check-config.js` ตรวจชื่อชน built-in แล้ว)
- `/check` เรียก **`/code-review [low|medium|high]`** + **`/security-review`** (เมื่อแตะ auth/api/db) ก่อน subagent ของเรา
  → subagent เหลือตรวจเฉพาะสิ่งที่ built-in ไม่รู้ (ตรงกับ plan ไหม / กติกาโปรเจกต์)
- Phase 8 เพิ่ม **`/doctor`** (หา skill/MCP ไม่ได้ใช้, hook ช้า, เสนอตัด CLAUDE.md), **`/insights`** (รายงาน friction รายเดือน), `/context`
- Phase 7 เพิ่ม **`fewer-permission-prompts`** (สแกน transcript แล้วเสนอ allowlist แทนนั่งเดา), `update-config`
- Phase A เพิ่ม **`/init` (`CLAUDE_CODE_NEW_INIT=1`)** + **`/import`** ทำ A.1 ครึ่งหนึ่งให้
- evals: `claude plugin eval` + `skill-creator` สำหรับรันอัตโนมัติเมื่อเคสเกิน ~10
- `/ui` ใช้ skill `run` ถ่าย screenshot เทียบ design

### check-config.js เพิ่มตรวจ

ชื่อ skill ชน built-in / `!`…`` ไม่มี `|| true` / agents ไม่มี `model:` / มี docs-lint, board, gate / pre-push เรียก gate / มีไฟล์ CI /
hook เคสใหม่: push เข้า main, push --no-verify, merge บน main, แก้ board.md

### ยังไม่ทำ (ตั้งใจ)

| เรื่อง | เหตุผล |
|---|---|
| `Stop` hook บังคับ verify | pre-push gate ทำหน้าที่นี้ที่ขอบ repo แล้ว — เปิดเมื่อ verify < 30 วิ และทีมอยากได้ต่อเทิร์น |
| CI รัน Claude แบบ non-interactive (`claude -p`) | ต้องเลือก git host ก่อน — gate ตอนนี้ไม่ต้องใช้โมเดล จึงต่อได้ทันที |
| ERD generate อัตโนมัติใน CI | ใส่ `prisma-erd-generator` ตอน release ก็พอ — อย่าให้ diagram เป็นของที่ต้อง maintain |
| git worktree / agent teams | WIP = 1 ยังเป็นกติกา — docs ระบุ agent teams กิน token ~7 เท่า |

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

**ใช้กับโปรเจกต์ที่มีโค้ดอยู่แล้ว**
- `phases/A-adopt-existing.md` — โหมด `EXTEND` มีตัวเลือกอยู่ใน Phase 0 ตั้งแต่ v1 แต่ไม่มี Phase ไหนรองรับ
  ตอนนี้แทน Phase 1–6 ด้วยขั้นเดียว: สำรวจไม่ตัดสิน → ตั้ง `verify` ให้ผ่านก่อน → ADR ย้อนหลัง →
  ธรรมนูญแบบ "ของใหม่ vs ของเก่า" → ปรับ config ให้ตรงของจริง → ตัดสิน source of truth ของงาน
- ธรรมนูญมาตรา 9.1 — กฎของใหม่/ของเก่า กัน AI refactor ทั้งระบบเพราะเห็นว่าโค้ดเดิมขัดมาตรฐาน
- `claude-setup/protected-paths.json` — `guard-edit.js` อ่านรายการไฟล์ที่ห้ามแก้จาก config
  แทน hardcode `components/ui/` (โปรเจกต์เดิมอาจไม่มี path นี้เลย) ถ้าไฟล์หายหรือพัง hook ถอยไปใช้ค่าเริ่มต้น
- START-HERE §5 แยกเป็น "นโยบาย" (ใช้ทุกโปรเจกต์) กับ "ค่าเริ่มต้นทางเทคนิค" (ของจริงชนะ)
  และ **UI library เปลี่ยนจากล็อกยี่ห้อเป็นเกณฑ์ 5 ข้อ** (ซอร์สในโปรเจกต์ / registry / a11y / token / training data)
  เพราะการล็อก shadcn ก่อน Phase 2 = แอบตัดสินว่าเป็น React และ AI ไม่รู้เหตุผล — Phase 2 รอบ B0 ประเมินตามเกณฑ์นี้

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
