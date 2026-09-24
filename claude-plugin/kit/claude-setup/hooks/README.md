# Hooks — ชั้นที่บังคับได้จริง

## ทำไมต้องมี

กติกาใน `AGENTS.md` และ `.claude/rules/` เป็น **คำแนะนำ** — AI อ่านแล้วพยายามทำตาม แต่พลาดได้
เมื่อ context ยาวขึ้นหรือโจทย์กดดัน กฎที่เขียนไว้จะถูกมองข้ามเป็นครั้งคราว

hook ต่างออกไป: มันคือสคริปต์ที่ Claude Code รันเองที่จุดหนึ่งของ lifecycle
**ไม่ผ่านการตัดสินใจของโมเดล** พูดโน้มน้าวไม่ได้ ลืมไม่ได้ ข้ามไม่ได้

> เกณฑ์ตัดสิน: กฎข้อไหนที่ **พังแล้วเจ็บจริง** ต้องมี hook
> ถ้ามีแค่ข้อความว่า "ห้าม..." ในไฟล์ md ถือว่ายังไม่เสร็จ

## ที่มีให้

| ไฟล์ | event | ทำอะไร |
|---|---|---|
| `session-context.js` | `SessionStart` | ฉีด branch ปัจจุบัน + งานที่ค้างจาก board เข้า context ตั้งแต่ข้อความแรก |
| `guard-edit.js` | `PreToolUse` (Edit/Write) | บล็อกการแก้ไฟล์ตามรายการ `protected` ใน **`.claude/stack.json`** (ค่าเริ่มต้น: `components/ui/**`, `*.generated.*`, lockfile) และบล็อกการแก้ไฟล์เทสขณะอยู่บน branch `fix/` `hotfix/` |
| `guard-bash.js` | `PreToolUse` (Bash) | บล็อก `--no-verify` (commit และ push), การรัน sonar เอง, force push main, `git checkout .`, **`git merge` ขณะยืนบน main และ `git push` ที่ปลายทางเป็น main** (AI ไม่ merge งานตัวเอง — เปิด PR) |
| `guard-new-component.js` | `PreToolUse` (Write/Edit/MultiEdit) | บล็อกการเขียน/แก้ไฟล์ component ใต้ `components/**` (ยกเว้น `components/ui/**`) ที่เนื้อหาที่กำลังเขียนมีสี hex ดิบ/arbitrary value (`bg-[#...]`) และชื่อไฟล์ไม่ตรงกับแถวไหนใน `docs/design/components.md` แบบเป๊ะ — คือกรณี "คิด design ใหม่เอง" (ข้อ 4-5 ใน `standards/ui-component-rules.md`) เท่านั้น ครอบคลุมทั้งตอนสร้างไฟล์ใหม่และตอนแก้ไฟล์เดิม การประกอบจาก shared/shadcn/primitive เดิมล้วน ๆ (ข้อ 1-3) ผ่านได้เลยไม่ต้องรอ registry — match แบบ exact ต่อแถวตาราง ไม่ใช่ substring (กัน false positive เช่น "Tab" ไป match ติด "DataTable") |
| `format-changed.js` | `PostToolUse` (Edit/Write) | format + lint เฉพาะไฟล์ที่เพิ่งแก้ ตามรายการ `formatCommands` ใน `stack.json` และส่ง error ที่ autofix ไม่ได้กลับเข้า context |
| `usage-capture.js` | `SessionStart`, `PostToolUse` (Write/Edit/MultiEdit), `PreToolUse` (Bash) | เฉพาะโปรเจกต์ที่ยินยอมใน `.buaflow/usage.json`: บันทึก event ของ intent/plan/task ลง `.buaflow/usage/` (ไม่ commit) และแจ้ง 1 บรรทัดตอนเปิด session ว่ากำลังเก็บ · ไม่ยินยอม = อ่านไฟล์เดียวแล้วออก ไม่สร้างอะไร · ไม่บล็อกอะไรเลย (EV-011) |

`stack.json` ค่าเริ่มต้นของ `protected` รวม `docs/backlog/board.md` ด้วย เพราะเป็นไฟล์ generate จาก `board.js` — โปรเจกต์ที่ใช้ tracker ภายนอก (Phase A.6) ลบข้อนี้ได้

> **hook ที่ไม่มีอะไรให้ทำ = exit 0 ทุกครั้ง แยกไม่ออกจาก "ทำงานแล้วไม่เจอปัญหา"**
> `guard-new-component.js` ใช้ได้เฉพาะโปรเจกต์ที่มี component tree แบบเว็บ และ `format-changed.js` ต้องมี `formatCommands` ที่ match โปรเจกต์จริง
> stack ที่ไม่เข้าเงื่อนไข **ให้ถอดออกจาก `settings.json` ไปเลย** อย่าปล่อยไว้เฉย ๆ — `check-config.js` ข้อ 6 จะฟ้องให้ว่า formatter ตัวไหนทำงานอยู่จริงบ้าง

> **guard-bash เป็น regex กันอุบัติเหตุของ AI เอง ไม่ใช่ security boundary** — เลี่ยงได้ด้วยตัวแปร/subshell
> ของที่ต้องกันจริง (คน, AI ตัวอื่น) อยู่ที่ branch protection บน git host + `gate.js` ใน CI

**ปรับรายการไฟล์ที่ห้ามแก้ที่ `stack.json` ไม่ต้องแก้สคริปต์** — ถ้าไฟล์นั้นหายหรือ JSON พัง hook จะถอยไปใช้ค่าเริ่มต้นเงียบ ๆ (ตั้งใจ: hook เสียต้องไม่ทำให้ทำงานไม่ได้) และ `check-config.js` จะเตือน
(`protected-paths.json` เดิมยังอ่านได้อยู่เพื่อความเข้ากันได้ — `stack.json` ชนะถ้ามีทั้งคู่)

ทุกตัวเขียนด้วย **Node ล้วน ไม่มี dependency** เพราะโปรเจกต์มี Node อยู่แล้ว
และรันได้เหมือนกันทั้ง Windows, macOS, Linux, และใน container

## กติกาของ exit code

| exit | ผล |
|---|---|
| `0` | ผ่าน (ถ้าพิมพ์ JSON ออก stdout จะถูกใช้เป็น decision หรือ additionalContext) |
| `2` | **บล็อก** — ข้อความใน stderr ถูกส่งให้ Claude อ่านเป็นเหตุผล |
| อื่น ๆ | ถือว่า hook พังเอง งานเดินต่อ (จงใจ: hook เสียต้องไม่ทำให้ทำงานไม่ได้) |

ข้อความที่เขียนใน stderr สำคัญมาก — **ต้องบอกว่าทางที่ถูกคืออะไร** ไม่ใช่แค่ว่าห้าม
ไม่งั้น Claude จะพยายามหาทางอ้อมแทนที่จะทำให้ถูก

## ทดสอบ hook

วิธีปกติ — `node .claude/check-config.js` รันเทสชุดนี้ให้อยู่แล้วพร้อมเช็ก exit code

ถ้าอยากยิงทีละตัวตอน debug:

```bash
# จำลอง input ที่ Claude Code ส่งให้
echo '{"tool_input":{"file_path":"src/components/ui/button.tsx"}}' | node .claude/hooks/guard-edit.js
echo $?   # ต้องได้ 2

echo '{"tool_input":{"command":"git commit --no-verify -m test"}}' | node .claude/hooks/guard-bash.js
echo $?   # ต้องได้ 2

echo '{"tool_input":{"command":"git push origin HEAD:main"}}' | node .claude/hooks/guard-bash.js
echo $?   # ต้องได้ 2 — push ตรงเข้า main

git switch main
echo '{"tool_input":{"command":"git merge feat/x"}}' | node .claude/hooks/guard-bash.js
echo $?   # ต้องได้ 2 — merge ขณะยืนบน main (บน branch อื่นต้องได้ 0)
git switch -

echo '{"tool_input":{"file_path":"src/components/shared/NewWidget.tsx","content":"<div className=\"bg-[#1e40af]\">x</div>"}}' | node .claude/hooks/guard-new-component.js
echo $?   # ต้องได้ 2 — มี arbitrary color ดิบ และ docs/design/components.md ยังไม่มีแถวของ NewWidget

echo '{"tool_input":{"file_path":"src/components/shared/NewWidget.tsx","content":"<Button variant=\"outline\">x</Button>"}}' | node .claude/hooks/guard-new-component.js
echo $?   # ต้องได้ 0 — ประกอบจาก primitive เดิม ไม่มีสี/ค่าดิบ ถือเป็น self-serve

echo '{"tool_input":{"file_path":"src/components/shared/OldWidget.tsx","old_string":"x","new_string":"<div className=\"bg-[#00ff00]\">x</div>"}}' | node .claude/hooks/guard-new-component.js
echo $?   # ต้องได้ 2 — Edit เข้า component เดิมที่ยังไม่ลงทะเบียน แล้วเติมสีดิบเข้าไป ก็ถูกจับเหมือนกัน

echo '{}' | node .claude/hooks/session-context.js   # ต้องได้ JSON ที่มี additionalContext
```

**เส้นที่ต้องทดสอบด้วยมือ** (ตัวตรวจทำแทนไม่ได้เพราะต้องสลับ branch):

```bash
git switch -c fix/T-000-ทดสอบ
echo '{"tool_input":{"file_path":"src/foo.spec.ts"}}' | node .claude/hooks/guard-edit.js
echo $?   # ต้องได้ 2 — บล็อกการแก้เทสระหว่างแก้บั๊ก
git switch - && git branch -D fix/T-000-ทดสอบ
```

ดูว่า hook ไหนโหลดอยู่จริงใน session: `/hooks`
ดู log ตอน debug: `CLAUDE_DEBUG=1 claude`

## จะเพิ่ม hook ใหม่เมื่อไหร่

| สถานการณ์ | ทำ |
|---|---|
| เขียนกฎไว้ใน `AGENTS.md` แล้ว AI ยังพลาดซ้ำ | เลื่อนชั้นเป็น hook |
| มี incident ที่เกิดจากการทำสิ่งที่ห้ามไว้ | เขียน hook + เขียน eval |
| กฎที่ผูกกับไฟล์บางกลุ่มแต่ยังไม่ถึงขั้นห้ามเด็ดขาด | ใช้ `.claude/rules/` + `paths:` ก่อน ยังไม่ต้อง hook |

**อย่าใส่ hook เกินจำเป็น** — hook ที่บล็อกงานปกติบ่อย ๆ จะทำให้คนปิดมันทิ้งทั้งชุด
ซึ่งแย่กว่าไม่มีตั้งแต่แรก ทุกครั้งที่ hook บล็อกแล้วปรากฏว่าเป็นกรณีที่ควรผ่าน
ให้ถือเป็นบั๊กของ hook แล้วแก้เงื่อนไขให้แคบลง

## ที่ยังไม่ได้ใส่ไว้ (พิจารณาทีหลัง)

| hook | ทำอะไร | ทำไมยังไม่ใส่ |
|---|---|---|
| `Stop` บังคับ verify | ไม่ให้จบเทิร์นจนกว่า `pnpm verify` ผ่าน | ทำให้ DoD บังคับได้ 100% แต่ถ้าเทสช้าจะรอทุกเทิร์น — เปิดเมื่อ verify เร็วพอ (< 30 วิ) ตอนนี้ pre-push gate ทำหน้าที่นี้ที่ขอบ repo แทน |
| `PreToolUse` Bash กรอง output | ต่อท้าย `\| grep -E "FAIL\|Error"` ให้คำสั่งที่รู้ว่ายาว (`updatedInput`) | `verify.mjs` แก้เคสหลักแล้ว — ใส่ถ้า AI ยังรัน `docker logs` / migration แล้ว output ท่วม context |
| `PreToolUse` กันแก้ไฟล์ migration ที่รันไปแล้ว | กันการแก้ประวัติศาสตร์ของ DB | ต้องรู้ก่อนว่า migration ไหนขึ้น env ไหนแล้ว |
| `SubagentStop` เก็บผลรีวิว | สะสม finding ไว้ดูแนวโน้ม | ยังไม่มีที่เก็บ/ที่ดู ทำไปก็ไม่มีใครอ่าน |
