# EV-011 เก็บข้อมูลการใช้งานภายใน (opt-in) — Design

- requirements: [requirements.md](requirements.md) (อนุมัติแล้ว 2026-09-24)
- สถานะ: อนุมัติแล้ว (2026-09-24)

## ภาพรวมวิธีทำ

แบ่งเป็น 3 ชั้น แต่ละชั้นทำงานได้แม้ชั้นถัดไปจะล้มหรือยังไม่ได้ตั้งค่า:

1. **บันทึก (ในโปรเจกต์ผู้ใช้)** — มี hook ตัวใหม่ `usage-capture.js` ตัวเดียวที่ plugin ติดตั้งให้ มันดูการเขียนไฟล์ใน `docs/intents/`, `docs/plans/` และ `docs/backlog/tasks/` แล้วแปลงเป็น event ส่วนขั้นที่ไม่ทิ้งร่องรอยเป็นไฟล์ (ผล `/check`) ให้ skill เรียก `buaflow usage record` เอง และ `buaflow audit` บันทึกเองในตัว CLI ทุก event ถูกเขียนต่อท้ายไฟล์ JSONL ใน `.buaflow/usage/` ซึ่งเป็นโฟลเดอร์ที่ ignore ตัวเอง
2. **Sync (ต่อเครื่อง)** — ตอนเปิดและจบ session hook จะ spawn process เบื้องหลังที่แยกตัวออกไป (detached) เพื่อคัดลอกบรรทัดใหม่ไปไว้ใน clone ของ private git repo กลาง แล้ว commit และ push แต่ละเครื่องเขียนไฟล์ของตัวเองเท่านั้น จึงไม่มี merge conflict ข้ามเครื่อง
3. **ใช้ข้อมูล (ใน repo Buaflow)** — `buaflow usage report | show | eval-draft` อ่านจาก clone ของที่เก็บกลางอย่างเดียว

เลือกแบบนี้เพราะใช้ของที่ kit มีอยู่แล้วทั้งหมด (Node, git, กลไก hook ของ plugin, frontmatter parser ใน `convergence.js`) ไม่มี server และไม่มี dependency ใหม่ ส่วนการตรวจจับจาก "ไฟล์ที่เปลี่ยน" แทนการให้ทุก skill เรียกคำสั่งบันทึก ทำให้งานที่ทำด้วยมือนอก skill ก็ถูกนับด้วย และ skill ที่ลืมเรียกก็ไม่ทำให้ข้อมูลหาย

## ตรวจกับหลักของ repo นี้

repo นี้ไม่มี `docs/constitution.md` จึงตรวจกับหลักเดียวกันที่ kit ใช้กับโปรเจกต์ และกับ decision ที่เกี่ยวข้อง:

- [x] **เล็กก่อน** — ไม่มี server, ไม่มี database, ไม่มี dashboard แบบ real-time รายงานเป็น Markdown ไฟล์เดียว
- [x] **ไม่เผื่ออนาคต** — ไม่มี anonymize, ไม่มีระบบสิทธิ์ของตัวเอง, ไม่มีช่อง token/cost (อยู่นอกขอบเขตใน requirements)
- [x] **ไม่ห่อเกิน** — เรียก `git` ตรง ๆ ผ่าน `child_process` เหมือน `local-ci.js` และ `kit-lock.js`
- [x] **สัญญามาก่อน** — `usage-event.schema.json` 1.0 และ `usage-consent.schema.json` 1.0 กำหนดไว้ในไฟล์นี้ และลง `schemas/registry.json`
- [x] **D-011 (Claude Code ถือ session layer, Buaflow ถือ gate)** — การเก็บข้อมูลไม่แตะ gate, pre-push หรือ CI เลย (R6)
- [x] dependency ใหม่: **ไม่มี**

## Data contract (แทนหัวข้อ "ฐานข้อมูล" — feature นี้ไม่มี DB)

### 1. ไฟล์ยินยอม `.buaflow/usage.json` (อยู่ในโปรเจกต์, commit)

```json
{
  "$schema": "https://buaflow.dev/schemas/usage-consent-v1.json",
  "schemaVersion": "1.0",
  "enabled": true,
  "project": "bluepeak-hub",
  "decidedBy": "khattiya dokbua",
  "decidedAt": "2026-09-24"
}
```

- `project` มีค่าเริ่มต้นจากชื่อ repo ใน `git remote get-url origin` ถ้าไม่มี remote ใช้ชื่อโฟลเดอร์ แก้ได้ และใช้เป็นชื่อโฟลเดอร์ในที่เก็บกลาง
- `decidedBy` ใช้ `git config user.name`
- ไม่มีไฟล์ → ถือว่า "ยังไม่ตอบ" · อ่านไม่ได้หรือไม่ผ่าน schema → ถือว่า "ปิด" (ตามตารางกรณีขอบ)

### 2. Event `usage-event.schema.json` 1.0 (หนึ่งบรรทัด JSONL ต่อหนึ่ง event)

```json
{
  "schemaVersion": "1.0",
  "id": "<crypto.randomUUID()>",
  "type": "task.status",
  "at": "2026-09-24T10:12:03.120Z",
  "project": "bluepeak-hub",
  "task": "T-012",
  "model": "claude-opus-5-5",
  "kitVersion": "3.13.0",
  "commit": "aa4d660",
  "sessionId": "<จาก hook หรือ null>",
  "machine": "<machine id จาก config ของเครื่อง>",
  "data": { "from": "review", "to": "in-progress" }
}
```

| `type` | เกิดจาก | `data` | AC |
|---|---|---|---|
| `intent.opened` | hook: ไฟล์ `docs/intents/I-*.md` ใหม่ที่ยังไม่เคยเห็น | `{ path, content }` | AC-6 |
| `plan.approved` | hook: `approved_by:` ในไฟล์ `docs/plans/T-*.md` เปลี่ยนจากว่างหรือ `<...>` เป็นค่าจริง | `{ path, approvedBy, content }` | AC-7 |
| `task.created` | hook: ไฟล์ `docs/backlog/tasks/T-*.md` ใหม่ | `{ path, acceptance: [..], estimate, fixes, content }` | AC-8 |
| `task.status` | hook: `status:` ต่างจากค่าล่าสุดที่เคยเห็น | `{ from, to }` | AC-9 |
| `check.result` | skill `/check` เรียก `buaflow usage record check` | `{ verdict: "pass"\|"fail", findings: [..], level }` | AC-10 |
| `verifier.audit` | `buaflow audit` บันทึกหลังได้ผล | `{ level, ok, executed, counts, verdicts, generatedAt }` — `generatedAt` อ่านจาก manifest ที่ audit ตรวจจริง | AC-11, AC-23 |
| `task.done` | hook: `task.status` ที่ `to: done` | `{ commit, started, closed, sessions }` | AC-12 |
| `readiness.snapshot` | hook ตอน SessionStart: เนื้อหา `docs/evidence/readiness.json` เปลี่ยนจากรอบก่อน (เทียบ JSON ที่ parse แล้ว จัดรูปใหม่ไม่นับ) และครั้งแรกที่เจอโปรเจกต์ | `{ level, generatedAt, manifestCommit, outcome, passed, required }` — `manifestCommit` คือ commit ที่ manifest บอกว่าประเมิน ต่างจาก `commit` ของ event ที่เป็น HEAD ตอนบันทึก | AC-23 |

- `readiness.snapshot` ไม่ได้อยู่ใน requirements แต่ต้องมีเพื่อให้ AC-23 ใช้ได้ในโปรเจกต์ที่ไม่ค่อยรัน `buaflow audit`
- ตัดสินตอนทำ EV-011.3: `readiness.snapshot` บันทึกตั้งแต่ครั้งแรกที่เจอโปรเจกต์ด้วย (readiness เป็นสถานะปัจจุบัน ไม่ใช่ประวัติ) และมี `manifestCommit`, `passed`, `required` เพิ่ม · `outcome` มาจาก `validateManifest` ของ `readiness.js` แบบไม่มี `--max-age-days` จึงไม่รัน git หรือคำสั่งใน evidence · อ่าน JSON ไม่ได้ → `outcome: "unreadable"` · `verifier.audit` มี `ok` และ `executed` เพิ่ม และบันทึกเฉพาะเมื่อสั่งผ่าน `buaflow audit` (ไม่ใช่ `node .claude/verifier.js` ตรง ๆ)
- `sessions` ใน `task.done` = จำนวน `sessionId` ที่ไม่ซ้ำกันใน state ของ task นั้น ถ้าไม่มีเลยให้เป็น `null` (R8)
- `content` คือเนื้อหาไฟล์เอกสารตามจริง และก่อนเขียนจะผ่าน `redact()` ที่แทนรูปแบบ secret ชัด ๆ (`-----BEGIN .* PRIVATE KEY-----`, `AKIA[0-9A-Z]{16}`, `sk-[A-Za-z0-9_-]{20,}`, `ghp_[A-Za-z0-9]{36}`) ด้วย `[REDACTED]`

### 3. ที่เก็บในเครื่อง `.buaflow/usage/` (ในโปรเจกต์, ไม่ commit)

```
.buaflow/usage/
  .gitignore              ← "*" — สร้างก่อนเขียนไฟล์แรก (AC-20 โดยไม่ต้องแก้ .gitignore ของโปรเจกต์)
  events/2026-09-24.jsonl ← เขียนต่อท้ายอย่างเดียว
  state.json              ← { seen: {path: {status, approvedBy}}, sessions: {task: [sessionId]}, synced: {file: bytes}, readinessHash, baselineAt }
  marker.json             ← { sessionId, model, at } — แยกไฟล์เพื่อให้ hook Bash ที่รันขนานกับ hook Write ไม่เขียนทับ `seen`
```

- เขียน state/marker แบบเขียนไฟล์ชั่วคราวแล้ว rename จึงไม่มีใครอ่านเจอไฟล์ครึ่งเดียว
- ข้อจำกัดที่ยอมรับ (EV-011.2 /check): ถ้า PostToolUse 2 ตัวบนไฟล์ใน 3 โฟลเดอร์เกิดพร้อมกันจริง ตัวที่เขียนทีหลังทับ `seen` ของอีกตัว → อาจได้ event ซ้ำ 1 ครั้ง · ไม่ทำ lock เพราะเกิดยากและ report นับรายการซ้ำได้ ดีกว่าให้ hook รอ lock
- ราก project (ทั้ง hook และ `buaflow usage`) = repo ที่ใกล้ที่สุดเหนือ `cwd` ที่มีไฟล์ยินยอม ถ้าไม่มีเลยใช้ repo ที่ใกล้ที่สุด · cwd ตาม `cd` ของ session แต่ต้องไม่ใช่ `CLAUDE_PROJECT_DIR` เพราะ session ใน worktree ต้องบันทึกกับ worktree นั้น · นับเฉพาะโฟลเดอร์ที่มี `.git` เพราะ `~/.buaflow/usage.json` คือ config ของเครื่อง ไม่ใช่ไฟล์ยินยอม

### 4. Config ต่อเครื่อง `~/.buaflow/usage.json`

```json
{ "schemaVersion": "1.0", "store": "D:/repos/buaflow-telemetry", "machine": "devteam1-laptop", "lastReviewAt": null }
```

ตั้งค่าด้วย `buaflow usage setup --store <path ของ clone>` (ผู้ใช้ clone private repo เองก่อน · `machine` มีค่าเริ่มต้นจาก `os.hostname()`)

### 5. ที่เก็บกลาง (private git repo)

```
events/<project>/<machine>/<YYYY-MM-DD>.jsonl   ← เครื่องเดียวเขียนไฟล์ของตัวเอง → ไม่ชนกันข้ามเครื่อง
reports/                                        ← ผลของ report (ถ้าสั่ง --out ลงที่นี่)
evals/drafts/                                   ← ผลของ eval-draft
```

**Rollback:** ปิดด้วย `enabled: false` หรือลบ `.buaflow/usage.json` ได้ทันที ข้อมูลที่เก็บไปแล้วไม่หาย (AC-4) · ถอด feature ทั้งหมดได้ด้วยการเอา hook ออกจาก `settings.json.tpl` แล้ว regenerate plugin เพราะไม่มีอะไรไปแตะ gate หรือ state ของโปรเจกต์

## CLI (แทนหัวข้อ API)

ทุกคำสั่งคืนผลใน `envelope()` เดิมของ `bin/buaflow.js` และรองรับ `--json`

| คำสั่ง | ทำอะไร | exit code | AC |
|---|---|---|---|
| `buaflow usage consent --enable\|--disable [--project <name>]` | เขียน `.buaflow/usage.json` (skill `/buaflow:start` เรียกหลังถามผู้ใช้) | 0 · 1 ถ้า root ไม่ใช่ git repo | AC-1, AC-4 |
| `buaflow usage record check --task <id> --verdict pass\|fail [--findings <file\|->] [--level <l>]` | บันทึก `check.result` (ถ้าไม่ได้ยินยอมจะไม่ทำอะไรและคืน 0) | 0 เสมอ · 2 ถ้า argument ผิด | AC-10 |
| `buaflow usage setup --store <path> [--machine <id>]` | เขียน config ของเครื่อง · store ต้องเป็น git work tree | 0 · 1 ถ้าไม่ใช่ git repo | AC-18 |
| `buaflow usage sync` | sync ทันที (foreground) และบอกจำนวนที่ส่ง/ค้าง | 0 · 3 ถ้า push ไม่สำเร็จ (event ยังอยู่ครบ) | AC-16, AC-17 |
| `buaflow usage status` | ยินยอมไหม · ค้างกี่ event · store อยู่ไหน | 0 | AC-5, AC-18 |
| `buaflow usage report [--out <file>] [--since <date>]` | Markdown ไฟล์เดียว: ตามโมเดล / ตามโปรเจกต์ / task ที่ควรดู · อัปเดต `lastReviewAt` | 0 | AC-22, 23, 25, 26 |
| `buaflow usage show <project>/<task>` | timeline ของ task นั้น | 0 · 1 ถ้าไม่เจอ | AC-24 |
| `buaflow usage eval-draft --task <project>/<task> [--out <dir>]` | ร่าง eval case ลง `evals/drafts/` | 0 · 1 ถ้าไม่เจอ task | AC-21 |

เพิ่มใน `COMMANDS`, `usage()`, `parse()` และ dispatch ของ `bin/buaflow.js` · logic ทั้งหมดอยู่ใน `claude-setup/usage.js` (module เดียว export ฟังก์ชันให้ทั้ง CLI และ hook)

### การหา model (AC-13, AC-14)

1. hook ได้ `session_id` และ `transcript_path` จาก stdin เสมอ → อ่าน **64 KB ท้ายไฟล์** transcript หา `"model":"claude-…"` ของข้อความ assistant ล่าสุด · ถ้า input มีช่อง `model` (SessionStart) ใช้ค่านั้นก่อน
2. ทุกครั้งที่ hook ทำงาน จะเขียน `marker = {sessionId, model, at}` ลง `state.json` · hook ฝั่ง PreToolUse `Bash` อัปเดต marker ก่อนทุกคำสั่ง shell
3. `buaflow usage record` และ `buaflow audit` ใช้ `marker.model` เฉพาะเมื่อ `at` ห่างจากตอนนี้ไม่เกิน 60 วินาที ถ้าเกินหรือไม่มี marker → `unknown` (R8)

> ข้อจำกัดที่ยอมรับ: ถ้ามี 2 session ในโปรเจกต์เดียวกันเรียก shell ภายใน 60 วินาทีเดียวกัน event จาก CLI อาจติด model ของอีก session · event จาก hook ไม่มีปัญหานี้เพราะใช้ `session_id` ของตัวเอง

### รายงาน (AC-22, 23, 25, 26)

- อ่านทุกไฟล์ใน `events/**` → **ตัดตัวซ้ำด้วย `id`** → ข้าม `schemaVersion` ที่ไม่รู้จักและนับไว้
- **ตามโมเดล:** model ของ task = model ที่พบบ่อยที่สุดใน event ของ task นั้น (ไม่นับ `unknown`) · คอลัมน์: จำนวน task, อัตรา `check.result` ที่ fail, จำนวน task ที่สถานะย้อนกลับ, จำนวน task ที่ถูกชี้ด้วย `fixes:`
- **ลำดับสถานะ** สำหรับตัดสิน "ย้อนกลับ": `backlog < todo < in-progress < review < done` (`blocked` ไม่นับ)
- **ตามโปรเจกต์:** readiness ล่าสุดจาก `verifier.audit` หรือ `readiness.snapshot` ที่ใหม่กว่า + อายุ `generatedAt` เป็นวัน + วันที่มี event ล่าสุด
- **task ที่ควรดู:** คะแนน = (จำนวน check fail) + (จำนวนครั้งที่ย้อนกลับ) + 2 × (จำนวน task ที่ `fixes:` ชี้มา) เรียงมากไปน้อย แถวละ 1 คำสั่ง `eval-draft` ที่ copy ไปรันได้

### ร่าง eval case (AC-21)

ให้ผ่าน `eval-case.schema.json` ในทางโครงสร้าง โดยจงใจให้คนต้องแก้ก่อนใช้จริง:

- `origin: "observed-failure"` · `observedIn: "<project>/<task>"`
- `prompt` = เนื้อหา intent (ถ้ามี) หรือส่วน "ทำอะไร" ของ task
- `criteria` = AC ของ task แปลงเป็น `must-happen` ทีละข้อ (C1, C2, …) และ findings ของ `check.result` ที่ fail แปลงเป็น `must-not-happen`
- `tests` = ไฟล์ skill ของขั้นที่มีปัญหา (`skills/check/SKILL.md` ถ้า check fail, `skills/plan/SKILL.md` ถ้าสถานะย้อนจาก review เป็นต้น)
- `authoredBy` = `git config user.name` ของคนที่สั่ง — ต้องไม่เป็นคนเดียวกับคนตรวจ ตามกติกา EV-004 เดิม
- `passWhen: { minScore: 0.8 }` · ไฟล์ลงที่ `evals/drafts/` ไม่ได้ลงโฟลเดอร์เคสจริง คนต้องย้ายเองหลังแก้

## Hook (แทนหัวข้อ UI — feature นี้ไม่มี UI)

`claude-setup/hooks/usage-capture.js` ตัวเดียว เลือกงานตาม `hook_event_name` และลงทะเบียนใน `claude-setup/settings.json.tpl` (generator แปลงเป็น `hooks.json` ของ plugin ให้เอง):

| Event | matcher | ทำอะไร | ต้องจบภายใน |
|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear` | อัปเดต marker · reconcile: สแกน task/plan/readiness ทั้งหมด หา status ที่เปลี่ยนนอก session (บันทึกด้วย `sessionId: null`, `model: unknown`) · พิมพ์ 1 บรรทัดแจ้งสถานะ (AC-5, AC-18, AC-27) · spawn sync แบบ detached | 1 s |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | ถ้า `tool_input.file_path` อยู่ใน 3 โฟลเดอร์ที่สนใจ → อ่านไฟล์ เทียบกับ `state.seen` → บันทึก event | 200 ms |
| `PreToolUse` | `Bash` | อัปเดต marker เท่านั้น · ไม่ block อะไร | 100 ms |
| `SessionEnd` | — | spawn sync แบบ detached | 1 s |

- **ถ้ายังไม่ได้ยินยอม: hook return ทันทีหลังอ่านไฟล์ยินยอม** ไม่สร้างไฟล์หรือโฟลเดอร์ใด ๆ (AC-2)
- ทุก path ของ hook ห่อด้วย `try/catch` ทั้งตัว และ **exit 0 เสมอ** ตามแบบ `session-context.js` (non-functional "ไม่ล้ม")
- hook หา `usage.js` จาก 2 ที่: `../usage.js` (ติดตั้งแบบ `.claude/`) หรือ `../kit/claude-setup/usage.js` (plugin) ถ้าหาไม่เจอให้ออกเงียบ ๆ
- ข้อความ AC-27 แสดงเฉพาะเมื่อ root คือ repo Buaflow (`package.json` มี `"name": "buaflow"` และมี `development/state.json`) · นับจากไฟล์ใน clone ของ store ณ การ pull ล่าสุด

### Sync

1. สร้าง lock `<store>/.git/buaflow-usage.lock` (ถือว่าค้างถ้าเก่ากว่า 5 นาที) → ถ้ามีคนถืออยู่ให้ออก
2. `git -C <store> pull --rebase --quiet` (ล้มก็ทำต่อ — ไฟล์ของเครื่องนี้ไม่มีใครแก้)
3. ในแต่ละไฟล์ `events/*.jsonl` ของโปรเจกต์ อ่านจาก byte ที่ `state.synced[file]` → append ต่อ `<store>/events/<project>/<machine>/<date>.jsonl`
4. `git add` + `git commit -m "usage: <project> <n> events"` → บันทึก `state.synced` **หลัง commit สำเร็จ**
5. `git push` · ล้ม → commit ค้างอยู่ใน clone และถูก push รอบหน้า (AC-17)
- ถ้าตาย ระหว่างข้อ 3–4 อาจ append ซ้ำ → ไม่เป็นไร เพราะ report ตัดตัวซ้ำด้วย `id` (AC-19)
- ตัดสินตอนทำ EV-011.4:
  - `synced` แยกไปไฟล์ `synced.json` ที่ sync เขียนคนเดียว (เหตุผลเดียวกับ `marker.json`: hook ที่เขียน state พร้อมกันจะไม่ย้อน offset)
  - commit ล้ม (เช่น store ไม่มี user.name) → ตัดไฟล์ที่เพิ่ง append กลับขนาดเดิม ไม่ให้รอบหน้า append ซ้ำบนของที่ค้าง
  - ส่งเฉพาะบรรทัดที่จบด้วย `\n` · lock อยู่ใน `git rev-parse --absolute-git-dir` (ใช้ได้กับ store ที่เป็น worktree) · git ที่ออกเน็ตตั้ง `GIT_TERMINAL_PROMPT=0` และ timeout 60 วินาที
  - push ทุกรอบแม้ไม่มีอะไรใหม่ เพื่อส่ง commit ที่ค้างจากรอบที่ push ล้ม · sync เฉพาะเมื่อยินยอม `enabled`
  - ถ้ามีคนกำลัง rebase/merge อยู่ใน store (เช่นกำลังแก้ conflict ตามที่ข้อความบอก) sync ไม่แตะ แค่รายงาน · pull ของ sync เองล้ม → `rebase --abort` เฉพาะ rebase ที่ reflog มีป้าย `buaflow-usage-sync` (sync ตั้ง `GIT_REFLOG_ACTION` ให้ git ที่ออกเน็ต) คนที่เริ่ม rebase เองในวินาทีเดียวกันจะเป็น `pull --rebase` จึงไม่ถูก abort ห้ามปล่อย clone ค้างกลาง rebase · ไม่ append เลยถ้า store ไม่ได้อยู่บน branch, กำลัง rebase/merge อยู่ หรือ pull ล้มขณะที่ remote มี commit ที่ rebase เข้ามาไม่ได้ (เช่น 2 เครื่องใช้ชื่อ machine ซ้ำ) → exit 3 พร้อมบอกวิธีแก้ offset ไม่ขยับ event อยู่ในโปรเจกต์ครบ (EV-011.4 /check) · offline ธรรมดายังทำงานตามเดิม
  - SessionEnd เริ่ม sync อย่างเดียว ไม่เขียน marker (session ที่กำลังจบไม่ได้ทำงานอะไรแล้ว)
  - ข้อความตอนเปิด session ยังเป็น 1 บรรทัด: แจ้งว่ากำลังเก็บ + ยังไม่ได้ตั้งค่าที่เก็บกลาง (ถ้าไม่มี) + ค้าง sync n event (ถ้ามี)
- spawn แบบ detached: `spawn(process.execPath, [usage.js, 'sync', '--root', root], {detached: true, stdio: 'ignore', windowsHide: true}).unref()`

## การเปลี่ยนแปลงใน skill และ template

| ไฟล์ต้นทาง | เปลี่ยน | AC |
|---|---|---|
| `plugin-src/skills/start/SKILL.md` | เพิ่มข้อ "ความยินยอม": ถ้า `usage status` บอกว่ายังไม่ตอบ ให้ถาม 1 ครั้ง (ทั้ง 3 path: เริ่มใหม่ / resume / upgrade) แล้วเรียก `usage consent` | AC-1, AC-3 |
| `core/skills/check` (ต้นทางของ `/check`) | ขั้นสุดท้าย: เรียก `node .claude/usage.js record check … --findings -` ส่ง findings ทาง stdin (ไม่มีไฟล์ชั่วคราวให้ต้องลบ) ทุกรายการของทั้ง 3 หมวดใน summary บรรทัดละข้อ นำหน้าด้วย `must-fix:` / `should-fix:` / `separate-task:` · verdict `fail` เมื่อมี must-fix · ถ้าคำสั่งล้มให้ข้ามได้ ห้ามทำให้ `/check` ล้ม · ใช้ `.claude/usage.js` แทน CLI เพราะติดตั้งในโปรเจกต์ทั้ง 2 โหมด (EV-011.7) | AC-10 |
| `core/skills/plan` (ต้นทางของ `/plan`) | ขั้นปิด: เติม `approved_by:` ด้วยชื่อผู้อนุมัติจริงก่อน commit plan | AC-7 |
| `templates/task.tpl.md` | เพิ่ม `fixes: <T-xxx ที่งานนี้แก้ — ถ้าไม่ใช่งานแก้ให้ลบบรรทัดนี้>` | AC-15 |
| `claude-setup/install.js` | เพิ่ม `usage.js` และ `hooks/usage-capture.js` ในรายการไฟล์ที่ติดตั้งลง `.claude/` (ทาง non-plugin) | — |

ทางที่ generate skill (`generate-workflow-skills.js`, `generate-claude-plugin.js --write`) ต้องรันหลังแก้ต้นทาง ไม่แก้ `claude-plugin/` ด้วยมือ

## Flow ตัวอย่าง

1. `/buaflow:start` → `usage status` = ยังไม่ตอบ → ถาม → ผู้ใช้ตอบ "เปิด" → `usage consent --enable` → commit `.buaflow/usage.json`
2. `/intent` เขียน `docs/intents/I-004-x.md` → PostToolUse → `intent.opened`
3. `/plan T-020` แล้วผู้ใช้อนุมัติ → skill เติม `approved_by` → `plan.approved`
4. `/task` เปลี่ยน status เป็น `in-progress` → `task.status {todo→in-progress}`
5. `/check` ตก → `usage record check --verdict fail` → `check.result` · กลับไปแก้ → status `review→in-progress` → `task.status` (ย้อนกลับ)
6. `/done` merge → `task.status {review→done}` + `task.done`
7. จบ session → sync เบื้องหลัง → push เข้า private repo
8. สัปดาห์ถัดมาเปิด repo Buaflow → "มี event ใหม่ 143 รายการตั้งแต่ review 2026-09-17" → `usage report` → เลือก T-020 → `usage eval-draft` → วงจร EV-006

## ผลกระทบต่อของเดิม

- **ไฟล์ใหม่:**
  - `claude-setup/usage.js`
  - `claude-setup/hooks/usage-capture.js`
  - `schemas/usage-event.schema.json`
  - `schemas/usage-consent.schema.json`
  - `claude-setup/tests/usage.test.js`
  - `claude-setup/tests/usage-capture.test.js`
- **ไฟล์ที่แก้:**
  - `bin/buaflow.js`
  - `claude-setup/settings.json.tpl` (hooks block)
  - `claude-setup/install.js`
  - `schemas/registry.json`
  - `templates/task.tpl.md`
  - `plugin-src/skills/start/SKILL.md`
  - skill ต้นทางของ check/plan ใน `core/`
  - `CLI.md`
  - `VERSION.md`
  - `UPGRADE.md`
  - `claude-plugin/**` (regenerate)
- **breaking change:** ไม่มี
  - โปรเจกต์ที่ไม่ตอบรับได้พฤติกรรมเดิมทุกอย่าง แค่ hook อ่านไฟล์ยินยอม 1 ครั้งต่อ event
  - `fixes:` เป็นช่องเสริม และ docs-lint ไม่ปฏิเสธ key ที่ไม่รู้จัก
- **hook เพิ่ม 3 จุด:** ต้นทุนเวลาของโปรเจกต์ที่ไม่ได้ยินยอม = spawn node + อ่านไฟล์ 1 ไฟล์ (~50 ms) ต่อ Write/Edit/Bash · วัดจริงในเทส NF
- **เวอร์ชัน:** kit 3.13.0 (feature ใหม่แบบ additive) พร้อม UPGRADE ส่วน "เปิดการเก็บข้อมูล"

## ความปลอดภัย

- **input ที่ต้อง validate:**
  - `tool_input.file_path` ต้อง resolve แล้วอยู่ใต้ project root และตรง 3 โฟลเดอร์ที่สนใจเท่านั้น (กัน path traversal เช่น `../../.env`)
  - argument ของ `usage record` ผ่าน `parse()`
  - `--store` ต้องเป็น git work tree
- **ไม่อ่านไฟล์อื่นนอก 3 โฟลเดอร์** + readiness.json + transcript (ท้าย 64 KB เพื่อหา model เท่านั้น ไม่เก็บเนื้อหา transcript)
- **คำสั่ง git** เรียกด้วย `execFileSync('git', [...args])` ไม่ผ่าน shell · ชื่อ `project`/`machine` ที่ใช้เป็น path ถูก sanitize เป็น `[a-z0-9._-]`
- **ข้อมูลอ่อนไหว:**
  - เนื้อหาเอกสารเก็บเต็มตาม R1 แต่ผ่าน `redact()` ก่อน
  - private repo กลางคือขอบเขตสิทธิ์ (ใช้สิทธิ์ของ git host)

## แผนการทดสอบ — map กับ AC

ทุกเทสใช้ `node:test` ใน `claude-setup/tests/` · hook ทดสอบด้วย `runNode(hook, {input, cwd})` บน `temporaryProject()` · ที่เก็บกลางจำลองด้วย bare repo ในโฟลเดอร์ชั่วคราว

| AC | พิสูจน์ด้วยอะไร | ระดับ |
|---|---|---|
| AC-1 | `usage.test.js` "consent --enable เขียนไฟล์พร้อม decidedBy/decidedAt/project" + ตรวจ `start/SKILL.md` มีข้อความยินยอม (สแกนข้อความใน `skills.test`) | unit + doc |
| AC-2 | `usage-capture.test.js` "ไม่มีไฟล์ยินยอม → เขียน task แล้วไม่มี `.buaflow/usage/`" และ "enabled:false → เหมือนกัน" | integration (hook) |
| AC-3 | `usage.test.js` "`status` คืน decided=true เมื่อมีไฟล์" + ตรวจ skill ว่าถามเฉพาะเมื่อ decided=false | unit + doc |
| AC-4 | "เปิด → บันทึก 1 → ปิด → เขียนอีก → event ยังเป็น 1 และไฟล์เดิมไม่ถูกลบ" | integration |
| AC-5 | "SessionStart ขณะเปิด → additionalContext มีบรรทัดแจ้งและวิธีปิด" | integration |
| AC-6 | "Write `docs/intents/I-001-x.md` ใหม่ → `intent.opened` มี content" · "เขียนไฟล์เดิมซ้ำ → ไม่มี event ใหม่" | integration |
| AC-7 | "`approved_by: <ใครอนุมัติ>` → ไม่มี event · เปลี่ยนเป็นชื่อจริง → `plan.approved`" | integration |
| AC-8 | "task ใหม่ที่มี `fixes: T-003` → `task.created` มี acceptance, estimate, fixes" | integration |
| AC-9 | "`todo→in-progress` และ `review→in-progress` → 2 event มี from/to ถูก" · "SessionStart reconcile จับ status ที่แก้นอก session" | integration |
| AC-10 | `usage.test.js` "`record check --verdict fail --findings f.json` → `check.result`" · "ไม่ยินยอม → exit 0 ไม่มีไฟล์" | unit |
| AC-11 | `cli.test.js` "`audit` บน fixture ที่ยินยอม → `verifier.audit` มี counts ตรงกับผล verifier" | integration |
| AC-12 | "`review→done` → มีทั้ง `task.status` และ `task.done` พร้อม commit/started/closed/sessions" | integration |
| AC-13 | "ทุก event ผ่าน `usage-event.schema.json` และมีครบทุกช่อง" (ตรวจทุก event ที่เทสอื่นสร้าง) | unit |
| AC-14 | "transcript ไม่มี model และไม่มี marker → `model: unknown`" · "marker เก่ากว่า 60 s → unknown" · "transcript มี `claude-sonnet-5` → ได้ค่านั้น" | unit |
| AC-15 | `docs-lint` บน task ที่มี `fixes:` ผ่าน + template มีบรรทัด `fixes:` | unit |
| AC-16 | "สร้าง 3 event → `usage sync` → bare repo มี 3 บรรทัดใน `events/<p>/<m>/<date>.jsonl`" | integration |
| AC-17 | "store ชี้ไป path ที่ push ไม่ได้ → exit 3, event ในเครื่องครบ, sync รอบถัดไปหลังแก้ส่งครบ" · "hook SessionEnd คืน exit 0 ภายใน 1 s" | integration |
| AC-18 | "ไม่มี `~/.buaflow/usage.json` (ใช้ `HOME` ชั่วคราว) → SessionStart แจ้ง 1 บรรทัดพร้อมคำสั่ง setup · event ยังอยู่ในเครื่อง" | integration |
| AC-19 | "sync 2 รอบติด → ไม่มีบรรทัดซ้ำ" · "จำลองตายหลัง append ก่อนบันทึก offset → report นับ id เดียว" · "2 machine → 2 ไฟล์ ไม่ชน" | integration |
| AC-20 | "หลังบันทึก event แรก `git status --porcelain` ของโปรเจกต์ไม่มีอะไรใต้ `.buaflow/usage/`" | integration |
| AC-21 | "`eval-draft` → ผลผ่าน `eval-case.schema.json` · origin/observedIn ชี้ task ต้นทาง · criteria มาจาก AC" | unit |
| AC-22 | "fixture store 2 model → ตาราง model มีอัตรา fail, จำนวนย้อนกลับ, จำนวน fixes ถูกต้อง" | unit |
| AC-23 | "fixture มี `verifier.audit` และ `readiness.snapshot` → ใช้ตัวที่ใหม่กว่า และอายุเป็นวันถูก" | unit |
| AC-24 | "`show p/T-1` → event เรียงตามเวลา ตั้งแต่ intent.opened ถึง task.done" | unit |
| AC-25 | "มี event `schemaVersion: 9.0` → report ไม่ล้มและแสดง 'ข้ามไป 1 รายการ'" | unit |
| AC-26 | "task ที่ fail 1 + ย้อน 1 + ถูก fixes 1 อยู่อันดับแรก และมีคำสั่ง eval-draft ที่ parse ได้ด้วย `parse()`" | unit |
| AC-27 | "root เป็น fixture ของ repo Buaflow + store มี event หลัง `lastReviewAt` → SessionStart แจ้งจำนวนและวันที่" · "root อื่น → ไม่แจ้ง" | integration |
| NF เวลา | "PostToolUse บน 1 task ใช้ < 200 ms (ค่ากลางของ 5 รอบ)" · "ไม่ยินยอม → < 100 ms" | integration |
| NF ความปลอดภัย | "`file_path: ../../.env` → ไม่อ่าน ไม่บันทึก" · "content ที่มี `AKIA…` ถูกแทนเป็น `[REDACTED]`" | unit |
| wiring | `claude-plugin.test.js`: hooks.json มี usage-capture ใน SessionStart/PostToolUse/PreToolUse/SessionEnd · `npm run check` ผ่าน | unit |

## ทางเลือกที่พิจารณาแล้วไม่เอา

| ทางเลือก | ทำไมไม่เอา |
|---|---|
| sync ตอน pre-push หรือใน `buaflow ci` | ทำให้ gate ช้าและมีโอกาสล้มเพราะเรื่องที่ไม่เกี่ยวกับโค้ด และคนที่ไม่ push ไม่ถูก sync (R6) |
| ให้ทุก skill เรียก `usage record` แทน hook | skill ที่ลืมเรียกหรือแก้ไฟล์ด้วยมือ = ข้อมูลหาย · hook เห็นทุกการเขียนโดยไม่ขึ้นกับ AI ใช้เฉพาะ `/check` ที่ไม่มีไฟล์ให้ดู |
| server HTTP / SQLite กลาง | ต้องดูแล server และต้องมี dependency · เจ้าของเลือก private git repo แล้ว |
| ไฟล์เดียวต่อโปรเจกต์ในที่เก็บกลาง | หลายเครื่องเขียนไฟล์เดียวกัน = merge conflict ทุกครั้ง · แยกต่อเครื่องทำให้ไม่มีวันชน |
| อ่าน transcript ทั้งหมดเพื่อสร้าง event | transcript ใหญ่และรูปแบบเป็นของ Claude Code ที่เปลี่ยนได้ · ใช้เพียงหา model จากท้ายไฟล์ |
| OpenTelemetry ของ Claude Code | ให้ token/cost/tool metrics แต่ไม่รู้จัก intent/plan/task/check ของ Buaflow และ cost อยู่นอกขอบเขต |
| ยินยอมรายคนแทนรายโปรเจกต์ | ขัดกับ R2/R3 ที่เจ้าของเลือก — คนที่มาทีหลังได้แจ้งเตือนแทน |
| ให้ skill ระบุ `--model` เอง | เป็นคำอ้างของ AI เกี่ยวกับตัวเอง · marker จาก transcript ตรวจซ้ำได้ ตรงกับหลัก BC-006 |

## คำถามที่ยังไม่มีคำตอบ

ไม่มี

## Gate ก่อนไป tasks

- [x] ไม่เหลือ [NEEDS CLARIFICATION]
- [x] ผ่านการตรวจกับหลักของ repo ครบทุกข้อ
- [x] ทุก AC มีวิธีพิสูจน์ (AC-1 ถึง AC-27 + NF + wiring)
- [x] มีแผน rollback (ปิดด้วยไฟล์ยินยอม / ถอด hook)
- [x] ผู้ใช้อนุมัติแล้ว (2026-09-24)
