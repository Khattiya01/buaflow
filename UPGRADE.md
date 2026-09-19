# อัปเกรดโปรเจกต์ที่ใช้ kit เวอร์ชันเก่า

**เลือกเส้นทางตามเวอร์ชันที่โปรเจกต์ใช้อยู่:**

| ใช้อยู่ | ไปที่ | ใช้เวลา |
|---|---|---|
| **v2.2** | [v2.2 → v2.3](#v22--v23-copy-ไฟล์อย่างเดียว) ข้างล่างนี้ | ~10 นาที |
| **v2.1** | [v2.1 → v2.2](#v21--v22-เล็ก-ทำได้ระหว่าง-task) แล้วต่อด้วย v2.3 | ~15 นาที |
| **v1.0** | [v1.0 → v2.1](#v10--v21) แล้วต่อด้วย v2.2, v2.3 | ~1 session |

---

## v2.2 → v2.3 (copy ไฟล์อย่างเดียว)

v2.3 เพิ่มฝั่ง design: `/ui` ถาม text/canvas ได้, `/prototype` ใหม่, กติกา "โค้ดต้องตรง design 100%" (`ui-component-rules.md` ข้อ 8)
**โปรเจกต์ที่ไม่ได้ใช้ claude.ai/design ไม่มีอะไรเปลี่ยน** — `/ui` ยังเสนอ 2 option แบบ text เหมือนเดิมถ้าเลือก text

```bash
# 1. วาง project-kit เวอร์ชันใหม่ทับของเดิม
# 2. คัดลอกของใหม่
cp project-kit/claude-setup/prototype.js .claude/
cp -r project-kit/claude-setup/skills/ui project-kit/claude-setup/skills/prototype .claude/skills/
cp project-kit/claude-setup/rules/frontend-ui.md .claude/rules/
cp project-kit/templates/design-brief.tpl.md project-kit/templates/prototype-flow.tpl.json docs/templates/
cp project-kit/standards/ui-component-rules.md docs/standards/
```

แล้วทำ 3 ข้อนี้ (Claude ทำได้ ไม่ต้องตัดสินใจอะไร):
1. เติม `"Bash(node .claude/prototype.js*)"` ใน `.claude/settings.json` → `permissions.allow`
2. เพิ่มคอลัมน์ `deviation จาก design` ท้ายตาราง `docs/design/components.md` (ว่างไว้ — hook `guard-new-component` match ชื่อในคอลัมน์แรกอย่างเดียว ไม่กระทบ)
3. โปรเจกต์ที่ใช้ canvas อยู่แล้ว (มี `docs/design/canvas/`) → สร้าง `docs/design/brief.md` จาก template โดย**ถอดค่าจาก `theme.md` + `components.md` ที่มีอยู่** ไม่ต้องถามใหม่
   เติม `design_system_project` (projectId ใน `_state.md`) และ `last_storybook_sync` = commit ล่าสุดที่ push storybook · ไม่ได้ใช้ canvas → ข้าม ทำตอนเปิด canvas ครั้งแรก

รัน `node .claude/check-config.js` ต้องได้ `ต้องแก้: 0`

---

## v2.1 → v2.2 (เล็ก ทำได้ระหว่าง task)

v2.2 ไม่เปลี่ยน workflow เลย — เปลี่ยนแค่ "ที่อยู่ของการตั้งค่า" จากที่ฝังในสคริปต์มาเป็น `.claude/stack.json`
**ไม่ทำก็ยังใช้งานได้ปกติ** แต่จะไม่ได้ผลของการแก้ "เขียวปลอม" (hook ที่ตายแล้วบอกว่ายังไม่ตาย)

```bash
# 1. วาง project-kit เวอร์ชันใหม่ทับของเดิม
# 2. คัดลอกไฟล์ใหม่ + ไฟล์ที่แก้ เข้า .claude/
cp project-kit/claude-setup/{stack-config,verify,run,check-config,gate}.js .claude/
cp project-kit/claude-setup/stack.json .claude/
cp project-kit/claude-setup/hooks/{format-changed,guard-edit}.js .claude/hooks/
cp -r project-kit/claude-setup/skills project-kit/claude-setup/agents .claude/
```

แล้วเปิด Claude Code ที่ราก repo พิมพ์:

```
อ่าน project-kit/UPGRADE.md หัวข้อ v2.1 → v2.2 แล้วทำตาม
```

**ถึง Claude — ทำ 4 ข้อนี้ตามลำดับ:**

1. **ย้าย `protected-paths.json` → `stack.json`** (ไม่บังคับ แต่ควรทำ) — ยกค่า `protected` / `testFilePattern` /
   `bugfixBranchPattern` ของเดิมไปใส่ `stack.json` แล้วลบไฟล์เก่า · ถ้าไม่ย้ายก็ยังอ่านได้ (`stack.json` ชนะถ้ามีทั้งคู่)
2. **ตั้งค่าใน `stack.json` ให้ตรงของจริง** — `verifyCommand` (คำสั่งที่ `package.json` มีอยู่),
   `codeFilePattern`, `formatCommands` (formatter ที่โปรเจกต์ใช้จริง), `preflightHookPath`, `commands.coverage`/`audit`/`apiTest`
3. **`ciMode`** — **ถามผู้ใช้** ว่านาที CI เป็นยังไง แล้วตั้งเป็น `required` / `pr-only` / `local-only` (ดูตารางข้างล่าง)
4. **เติม permissions** ใน `.claude/settings.json` → `permissions.allow`:
   `"Bash(node .claude/verify.js*)"` และ `"Bash(node .claude/run.js*)"`

จบแล้วรัน `node .claude/check-config.js` ต้องได้ `ต้องแก้: 0` **แปะผลให้ผู้ใช้ดู**

### เลือก `ciMode` ยังไง

| สถานการณ์ | ตั้งเป็น | ผลที่ได้ |
|---|---|---|
| repo public | `required` | Actions ฟรีไม่จำกัด ใช้เหมือนเดิม |
| repo private ยังมีโควต้าเหลือ | `pr-only` | template ใหม่รันครั้งเดียวต่องาน (เดิม 2) + ข้าม verify เมื่อแตะแต่ docs |
| **นาทีหมด / billing ติด / ไม่มี remote** | `local-only` | ลบไฟล์ CI ทิ้ง ใช้ pre-push เป็นด่านเดียว |

> ⚠️ **ถ้าเปลี่ยนเป็น `local-only` และเคยเปิด branch protection ไว้** — ต้องไปเอา required status check `gate`
> ออกจาก Settings → Branches ด้วย ไม่งั้น PR จะค้าง merge ไม่ได้ตลอดไป เพราะรอ check ที่ไม่มีวันรัน
>
> และเมื่อเป็น `local-only` แล้ว **pre-push hook ต้องติดตั้งจริง** — `check-config.js` จะขึ้น `FAIL` ถ้าไม่มี
> เพราะไม่เหลือด่านไหนบังคับเลยนอก session ของ Claude (เดิมเป็นแค่ warn)

---

## v1.0 → v2.1

> สำหรับโปรเจกต์ที่ผ่าน Phase 0–7 ของ **v1.0 (2026-09-13)** มาแล้วและกำลังทำงานอยู่
> **ไม่ใช่ Phase A** — Phase A สำหรับโปรเจกต์ที่ไม่เคยใช้ kit; ของคุณมี `docs/planning/`, ADR, spec, task, board อยู่แล้ว เก็บไว้ทั้งหมด
> ใช้เวลา ~1 session ทำบน branch `chore/kit-v2.1` **ระหว่าง task** (หลัง `/done` ก่อน `/task` ถัดไป) ไม่ทำกลางงาน
>
> **ถึง Claude:** ทำทีละข้อตามลำดับ 1 → 10 หยุดถามผู้ใช้ตรงที่ระบุ **(ถาม)** เท่านั้น ข้ออื่นทำเลยแล้วรายงานสั้น ๆ
> ห้ามแก้โค้ดโปรดักชัน ห้ามแก้ `docs/planning/*` `docs/adr/*` `docs/specs/*` (ยกเว้นเติมหัวข้อ 4.4b ในข้อ 6)
> ไฟล์ task แก้ได้เฉพาะ frontmatter ตามข้อ 7 · ตอบผู้ใช้เป็นไทย · ทุกไฟล์ที่เขียนใหม่ใน `.claude/` `AGENTS.md` `REVIEW.md` เป็นอังกฤษตาม template

## จุดเริ่มต้น — ทำแค่นี้ก่อน

```bash
# 1. จบ task ที่ค้างอยู่ให้ถึง /done (ของ v1) ก่อน — อย่าอัปเกรดกลาง task
# 2. วาง project-kit เวอร์ชันใหม่ทับของเดิม (หรือ git pull ถ้าเป็น submodule)
# 3. เปิด Claude Code ที่ราก repo แล้วพิมพ์:
อ่าน project-kit/UPGRADE.md แล้วทำตาม เริ่มข้อ 1
```

Claude จะทำข้อ 1–10 ให้ โดยหยุดถามคุณ 4 จุด: ยืนยันการแยก CLAUDE.md (ข้อ 2), ผล check-config รอบแรก (ข้อ 4), มาตรา 9 ของธรรมนูญ (ข้อ 6), diff ของ board ก่อน/หลัง generate (ข้อ 7)

## สิ่งที่ต่างระหว่าง v1.0 กับ v2.1 ที่กระทบโปรเจกต์คุณ

| v1.0 ในโปรเจกต์คุณ | v2.1 | ทำอะไร |
|---|---|---|
| `CLAUDE.md` ก้อนเดียว ภาษาไทย | `AGENTS.md` (อังกฤษ, มาตรฐานกลาง) + `CLAUDE.md` = `@AGENTS.md` + ชั้นบาง | แยกไฟล์ (ข้อ 2) |
| `.claude/commands/{task,review,spec,ui,done,hotfix}.md` | `.claude/skills/*/SKILL.md` 9 ตัว (`/review` → `/check`, เพิ่ม `/intent` `/plan` `/release`) | **ลบ commands ทิ้ง** แล้วติดตั้ง skills (ข้อ 3) |
| `.claude/agents/` 3 ตัว ภาษาไทย | 3 ตัวเดิม เพิ่ม `model:` เป็นอังกฤษ อ่านแค่ plan+diff | แทนที่ (ข้อ 3) |
| ไม่มี | `.claude/rules/` `hooks/` `settings.json` `stack.json` | ติดตั้งใหม่ (ข้อ 4) |
| ไม่มี | `check-config.js` `docs-lint.js` `board.js` `gate.js` `verify.js` `stack-config.js` + pre-push + CI templates | ติดตั้งใหม่ (ข้อ 4) |
| `verify` เป็น `tsc && eslint && vitest` | `scripts/verify.mjs` พิมพ์สรุปสั้น | ครอบของเดิม (ข้อ 5) |
| ไม่มี | `docs/constitution.md` `REVIEW.md` | เขียนจากการตัดสินใจที่มีอยู่แล้ว (ข้อ 6) |
| `board.md` เขียนมือ + `import.csv` | ไฟล์ task = source of truth, board generate, ไม่มี csv | ย้ายข้อมูลลง task แล้ว generate (ข้อ 7) |
| ไม่มี `docs/intents/` `docs/plans/` `docs/evals/` | มี + templates intent/plan/eval | สร้าง (ข้อ 8) |
| task ไม่มี `intent:` `plan:` `track:` `commit:` | มี — `docs-lint` ใช้ตัดสิน | task เก่าใส่ `intent: legacy` (ข้อ 7) |
| `docs/standards/` 9 ไฟล์ v1 | 10 ไฟล์ (DoD ย่อ, เพิ่ม `context-budget.md`, `workflow-lifecycle.md` ใหม่) | แทนที่ (ข้อ 9) |
| ไม่มี Phase 8 | Phase 8 ทบทวน config | เพิ่มแถวใน `_state.md` (ข้อ 10) |

**ของที่ไม่ต้องแตะ:** `docs/planning/*`, `docs/adr/*`, `docs/specs/*`, `docs/backlog/tasks/*` (แค่เติม frontmatter), โค้ด, git history

---

## ขั้นตอน

### 1. เตรียม

```bash
git switch -c chore/kit-v2.1
cat project-kit/templates/gitignore.tpl >> .gitignore   # แล้วลบบรรทัดที่ซ้ำกับของเดิม — ต้องมี .verify.log และ .claude/settings.local.json
# เอา project-kit เวอร์ชันล่าสุดมาวางข้าง ๆ (หรือ git pull ถ้าเป็น submodule / โฟลเดอร์ใน repo)
node project-kit/claude-setup/check-config.js   # ดู baseline ก่อนแก้ — จะ FAIL หลายข้อ ปกติ
```

### 2. แยก `CLAUDE.md` → `AGENTS.md` + `CLAUDE.md` **(ถาม: แสดงร่าง AGENTS.md ให้ผู้ใช้ยืนยันก่อนเขียนทับ)**

1. เปิด `CLAUDE.md` เดิม เก็บ 4 อย่างนี้ไว้: ย่อหน้า "โปรเจกต์นี้คืออะไร", Stack, โครงโฟลเดอร์, **หมวด "สิ่งที่ AI เคยทำผิด"** (ถ้ามี — นี่คือของมีค่าที่สุด)
2. สร้าง `AGENTS.md` จาก `project-kit/templates/AGENTS.md.tpl` — เติม 4 อย่างนั้นเป็น**ภาษาอังกฤษ** (AI อ่านอย่างเดียว; หมวด Language ในไฟล์สั่งให้ตอบผู้ใช้เป็นไทยแล้ว)
   หมวด "เคยทำผิด" ย้ายไปใต้ `## Things the AI gets wrong in this project` แปลเป็นอังกฤษ
3. เขียน `CLAUDE.md` ใหม่จาก `templates/CLAUDE.md.tpl` — บรรทัดแรก `@AGENTS.md`
4. กติกาใน `CLAUDE.md` เดิมที่**ผูกกับไฟล์บางกลุ่ม** (UI, API, DB) → ไม่ต้องย้ายเข้า AGENTS.md เพราะ `.claude/rules/` มีอยู่แล้ว (ข้อ 4) — ถ้ามีกฎเฉพาะโปรเจกต์ที่ rules ไม่ครอบ ให้เติมใน rule ที่ตรงกัน

### 3. commands → skills, agents

```bash
rm -rf .claude/commands            # ห้ามเหลือ — /review เดิมชนกับ built-in และ /check ใหม่
cp -r project-kit/claude-setup/skills .claude/
cp -r project-kit/claude-setup/agents .claude/     # ทับของเดิม (ถ้าเคยแก้ agent เอง ให้ย้ายส่วนที่แก้เข้าตัวใหม่)
```

ปรับตาม Phase 7.4: คำสั่งใน skills ต้องมีจริงในโปรเจกต์ (`test:cov`, `test:api`) — คำสั่ง verify ไม่ต้องแก้ เรียกผ่าน `node .claude/verify.js`

### 4. ชั้นบังคับ + สคริปต์ gate

```bash
cp -r project-kit/claude-setup/rules project-kit/claude-setup/hooks .claude/
cp project-kit/claude-setup/{check-config,docs-lint,board,gate,verify,run,stack-config}.js project-kit/claude-setup/stack.json .claude/
cp project-kit/claude-setup/settings.json.tpl .claude/settings.json      # ลบ $comment, แก้ ${CLAUDE_PROJECT_DIR} ไม่ต้อง — Claude Code แทนให้
cp project-kit/claude-setup/ci/pre-push.tpl .husky/pre-push
cp project-kit/claude-setup/ci/github-actions.yml.tpl .github/workflows/gate.yml   # และ/หรือ gitlab-ci.yml.tpl
```

> **โปรเจกต์ที่มี `.claude/protected-paths.json` อยู่แล้ว:** ไม่ต้องรีบย้าย — `stack-config.js` ยังอ่านไฟล์เดิมเป็น fallback
> อยากรวมเป็นไฟล์เดียว: คัดลอก `stack.json` มา แล้วย้าย `protected` / `testFilePattern` / `bugfixBranchPattern` ของเดิมเข้าไป แล้วลบไฟล์เก่าทิ้ง
> (ถ้ามีทั้งสองไฟล์ `stack.json` ชนะ) · `check-config.js` จะเตือนให้เองว่ายังใช้ไฟล์เก่าอยู่

แล้วทำตาม **Phase A.5** (ตารางปรับ config ให้ตรงของจริง): **`stack.json` ก่อนเพื่อน** (คำสั่ง verify, pattern ไฟล์โค้ด, formatter, ไฟล์ที่ generate), แล้วค่อย `paths:` ของ rules ให้ตรงโครงจริง
`node .claude/check-config.js` จนได้ `ต้องแก้: 0` **(ถาม: แปะผลรอบแรกให้ผู้ใช้ดู — pattern ไหนที่ไม่ match ต้องให้ผู้ใช้ยืนยันว่าลบได้)**

### 5. verify

`verify` เดิมของคุณใช้ได้อยู่แล้ว (v1 บังคับให้มี) — ครอบด้วย `templates/verify.mjs.tpl` → `scripts/verify.mjs` ปรับ `STEPS` ให้เรียกของเดิม
เปลี่ยน `"verify": "node scripts/verify.mjs"`, เพิ่ม `.verify.log` ใน `.gitignore`, รันแล้วเอาบรรทัดสรุปตอนผ่านไปแทนบล็อก "หน้าตาของผ่าน" ใน `AGENTS.md`

### 6. ธรรมนูญ + REVIEW.md (ไม่ต้องตัดสินใจใหม่ — บันทึกของที่ตัดสินไปแล้ว) **(ถาม: มาตรา 9 ต้องให้ผู้ใช้ยืนยันว่าตรงกับที่ใช้จริง)**

- `docs/constitution.md` จาก `templates/constitution.tpl.md`: มาตรา 1–8 ปรับถ้อยคำ, **มาตรา 9 เติมจาก `docs/planning/02-tech-stack.md` + `04-architecture.md`** ที่มีอยู่แล้ว (UI library, i18n, theme, error envelope, pagination, auth)
  ถ้ามีโค้ดที่เขียนก่อนมาตรฐานเหล่านี้ → เปิดมาตรา 9.1 (ของใหม่ vs ของเก่า)
- `REVIEW.md` จาก `templates/REVIEW.tpl.md` วางที่ราก
- **Data model:** เพิ่มหัวข้อ "§ 4.4b Data model" ใน `docs/planning/04-architecture.md` สั้น ๆ: `prisma/schema.prisma` คือ source of truth ตั้งแต่วันนี้ + การตัดสินใจเรื่อง ID / soft delete / tenancy ที่ใช้อยู่จริง (อ่านจาก schema ไม่ต้องคิดใหม่)

### 7. backlog: ไฟล์ task เป็น source of truth

ข้อมูลที่อยู่**เฉพาะ**ใน `board.md` เดิม (วันปิด, commit ของ Done) ต้องย้ายลงไฟล์ task ก่อน ไม่งั้นหายตอน generate:

1. task ที่ `done`: เติม `closed:` และ `commit:` — หาได้จาก `git log --oneline --grep T-0xx`
2. task ที่ `blocked`: เติม `blocked_reason:`
3. **ทุก task ที่มีอยู่ก่อนอัปเกรด: เติม `intent: legacy`** (docs-lint ยอมรับค่านี้ = งานที่เกิดก่อนมีระบบ intent ไม่ต้องย้อนเขียน)
4. `rm docs/backlog/import.csv` (ไม่มีใครใช้ — ถ้าเคย import ไป Jira แล้ว ตัดสิน source of truth ตาม Phase A.6)
5. `node .claude/board.js` → เทียบกับ board เดิม (`git diff`) ว่าไม่มีอะไรหาย **(ถาม: แสดง diff ให้ผู้ใช้ดูก่อน commit)**
6. **task ใหม่หลังจากนี้**ต้องมี `intent:` จริง (ผ่าน `/intent`) หรือ `track: trivial`

### 8. artifact chain ที่เพิ่มมา

```bash
mkdir -p docs/intents docs/plans docs/evals docs/incidents docs/releases && touch docs/{intents,plans,incidents,releases}/.gitkeep
cp project-kit/templates/{intent,plan,eval-case}.tpl.md docs/templates/
cp project-kit/claude-setup/evals/*.md docs/evals/
```

### 9. standards + workflow

```bash
cp project-kit/standards/*.md docs/standards/     # ทับ — v2.1 เปลี่ยน definition-of-done, workflow-lifecycle, เพิ่ม context-budget, agent-config
```
`docs/workflow.md` ที่ v1 คัดจาก `workflow-lifecycle.md` → คัดใหม่ (flow เปลี่ยนเป็น intent → … → check → PR → done)
`CONTRIBUTING.md`: เพิ่มว่า merge ผ่าน PR + gate เท่านั้น และคำสั่ง `node .claude/gate.js`

### 10. ปิด

- `_state.md`: เพิ่มแถว `| 8 Tune | ♻️ | … |` และบรรทัด "อัปเกรด kit v1.0 → v2.1 เมื่อ <วันที่>"
- `node .claude/gate.js` ผ่านทุกด่าน (แปะผล)
- ทดสอบมือตาม Phase 7.10 ชั้น config: `/context` เห็น AGENTS.md, พิมพ์ `/` เห็น 9 skills, ยืนบน main สั่ง merge → ถูกบล็อก
- รัน eval EV-001…004 ใน session สะอาด — **สำคัญ**: ทดสอบว่า AI ยังทำตามกติกาเดิมได้หลังกติกาย้ายจาก CLAUDE.md ไทยไป AGENTS.md อังกฤษ
- เปิด PR `chore/kit-v2.1` → คนกด merge → `/clear`

## หลังอัปเกรด — สิ่งที่จะรู้สึกต่างใน 3 วันแรก

| จะเจอ | เพราะ |
|---|---|
| `/task` บ่นว่าไม่มี plan สำหรับงานที่แตะ > 3 ไฟล์ | `/plan` เป็นขั้นใหม่ — ทำครั้งแรกจะรู้สึกช้า แต่ `/check` จะเร็วขึ้นเพราะอ่าน plan.md ไฟล์เดียว |
| งานเล็กที่เคยทำเลย ตอนนี้ต้อง `/intent` | ใช้ trivial track (`track: trivial`) สำหรับ typo/copy/log — ไม่ต้อง intent |
| `git merge` ถูกบล็อก | ตั้งใจ — เปิด PR แล้วกด merge เอง 10 วินาที |
| `docs-lint` warn เรื่อง task เก่าไม่มี intent | ใส่ `intent: legacy` ตามข้อ 7 |
| verify พิมพ์สั้นลงมาก | log เต็มอยู่ `.verify.log` |
