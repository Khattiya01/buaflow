# งบ context และ token — ทำไมแต่ละขั้นอ่านอะไรได้แค่ไหน

ทีมที่เขียนโค้ดด้วย AI 100% มีต้นทุนหลักอยู่ 2 ที่: **token ที่อ่านซ้ำ** และ **งานที่ทำผิดทางแล้วต้องทำใหม่**
เอกสารนี้คุมอันแรกโดยไม่ทำให้อันที่สองแย่ลง

> ตัวเลขทั้งหมดตรวจได้จาก `/usage` (attribution ราย skill/subagent + flag "long context" / "cache miss") และ `/context`
> ไม่ต้องสร้าง dashboard

---

## 1. หลักการ: artifact แต่ละขั้นต้อง "บีบ" ไม่ใช่ "ส่งต่อ"

วงจร `intent → spec → plan → code → check` เดิมทำให้แต่ละขั้น**ขยาย** context (อ่านของขั้นก่อนหน้าทั้งหมด + เพิ่มของตัวเอง)
ผลคือ constitution / DoD / spec ถูกอ่าน 3-4 รอบต่อ 1 task ทั้งใน context หลักและใน subagent

กติกาใหม่:

| ขั้น | อ่านอะไร | คายอะไร |
|---|---|---|
| `/intent` | คำเล่าของผู้ใช้ | intent.md ที่ตอบ "ทำไม / วัดยังไง / ห้ามพัง" ครบ |
| `/spec` | **intent.md** (ไม่ถามซ้ำ) + constitution ม.4-6 + architecture เฉพาะหัวข้อที่เกี่ยว + schema.prisma | requirements / design / tasks |
| `/plan` | **ครั้งเดียวที่อ่านครบ**: task + spec + constitution + โค้ดเดิม + schema | plan.md ที่**คัด** AC + มาตรา + กติกา design + pattern ไว้ในหัวข้อ "ข้อกำหนดที่คัดมาแล้ว" |
| `/task` | **plan.md ไฟล์เดียว** + โค้ดที่จะแตะ | โค้ด + บรรทัดสรุป verify |
| `/check` | **plan.md ไฟล์เดียว** + diff | รายงานเฉพาะข้อที่ไม่ผ่าน |
| `code-reviewer` (subagent) | plan.md + diff + REVIEW.md **เท่านั้น** | 3 กลุ่ม ไม่เกิน 5 ข้อสังเกต |

**อะไรที่ไม่อยู่ใน plan.md = ไม่มีใครเห็นตอนลงมือ** — นี่คือเหตุผลที่ `/plan` ต้องละเอียดตรงหัวข้อนั้น

## 2. ของที่ตัดออกแล้ว (และทำไม)

| เดิม | ปัญหา | ตอนนี้ |
|---|---|---|
| `/review` ข้อ 8 + `/done` ข้อ 5 ถาม "ป้อนกลับเข้า config" ทั้งคู่ | คำถามเดียวกัน 2 ครั้งต่อ task | ถามที่ `/done` ที่เดียว |
| board.md + tasks/*.md + import.csv | ข้อเท็จจริงเดียวเขียน 3 ที่ทุกครั้งที่ปิดงาน และ csv ไม่มีใครใช้ | ไฟล์ task = source of truth, board generate, csv ตัดทิ้ง |
| `/review` ไล่ DoD ~40 ข้อเป็นร้อยแก้ว | output token ที่ไม่เพิ่มความถูกต้อง และฝึกให้โมเดลติ๊กเพื่อให้ครบ | รายงาน `DoD: N/M — ไม่ผ่าน: …` |
| subagent รายงาน → main เขียนใหม่ให้ผู้ใช้ | สรุปของสรุป | ส่งผ่านตามที่ subagent เขียน เติมบรรทัดตัดสินอย่างเดียว |
| `definition-of-done.md` 7.6KB ถูก Read 2-3 ครั้ง/task | ~4k token × 3 | ย่อเหลือหน้าจอเดียว, DoD ราย type ย้ายไป `.claude/rules/` ที่โหลดเองตาม path |
| แปะ output เต็มของ verify ตอนพัง | tsc+eslint+vitest พัง = หลายพันบรรทัดเข้า context | `verify.mjs` พิมพ์สรุป ≤ 25 บรรทัด, log เต็มลง `.verify.log` |
| subagent อ่าน AGENTS + constitution + DoD + spec + task + plan + diff | 5 เอกสารที่ถูกคัดไว้ใน plan แล้ว | ส่งแค่ plan + diff |
| ไม่มี `model:` ใน agents | ทุก subagent ใช้โมเดลหลัก | haiku สำหรับสำรวจ, sonnet สำหรับรีวิว/เทส |

## 3. ของที่**ไม่**ตัด — อย่าไปตัด

- **`/task` ข้อ 4 ยืนยันความเข้าใจก่อนเขียน** — ~300 token กัน implementation ผิดทาง 50k token นี่คือ ROI สูงสุดในระบบ
- **"แปะผลจริง ห้ามบอกว่าผ่านเฉย ๆ"** — แค่เปลี่ยนจาก log เต็มเป็นบรรทัดสรุปที่ `verify.mjs` พิมพ์ ความน่าเชื่อถือไม่ลด
- **1 phase ต่อ 1 prompt แล้วหยุด** ในช่วง planning
- **session-context hook** — ตัดที่ 40 บรรทัด / 15 ไฟล์แล้ว ถูก
- **plan mode สำหรับ `/plan`** — docs ของ Claude Code เองแนะนำเพื่อกัน rework

## 4. โมเดลต่อขั้น

| ขั้น | โมเดล | ทำไม |
|---|---|---|
| `/intent`, `/spec` design, `/plan`, Phase 1-4 | **Opus** | งานคิด ผิดตรงนี้แพงกว่าทุกที่ |
| `/task` ลงมือตามแผน, `/done`, hotfix ที่รู้สาเหตุแล้ว | **Sonnet** | ทำตามของที่คัดมาแล้ว |
| `Explore`, `legacy-explorer`, `test-writer`, `code-reviewer` | **Haiku / Sonnet** (ตั้งใน `model:` ของ agent) | อ่านเยอะ ตัดสินน้อย |
| `/check` | `/code-review medium` · diff แตะ auth/เงิน/migration → `high` + Opus | |

งานยาวที่ไม่ต้องคิดลึก (ไล่แก้ lint, rename) → ลด `/effort` ได้

## 5. กติกา session

- **`/done` แล้ว `/clear`** — 1 task = 1 session context ของงานเก่าไม่ช่วยงานใหม่แต่ถูกส่งไปทุกเทิร์น
- แก้จุดเดิมไม่ผ่าน 2 ครั้งติด → หยุด → `/clear` → เริ่มใหม่ด้วยโจทย์ที่ชัดกว่า (context ที่เต็มไปด้วยทางที่ล้มเหลวทำให้รอบต่อไปแย่ลง)
- ไปผิดทาง → `/rewind` ถูกกว่าแก้ย้อน
- `/compact` ใช้ instructions ใน CLAUDE.md (เก็บ task/branch/AC ที่เหลือ/verify ล่าสุด/การตัดสินใจ — ทิ้งเนื้อไฟล์และ log)
- พักเกิน 1 ชม. แล้วกลับมา = cache miss ทั้งก้อน ปกติ ไม่ต้องแก้ แต่ถ้าเป็น session ยาวมาก `/clear` แล้วเริ่มจาก plan.md ถูกกว่า

## 6. อ่านตัวเลขจาก `/usage` ยังไง (Phase 8.3)

| เห็น | แปลว่า | ทำ |
|---|---|---|
| skill ตัวหนึ่งกินสัดส่วนสูงผิดปกติ | ยาวเกิน หรือ trigger ผิดจังหวะ | ตัด / แก้ `description` ให้แคบ |
| subagent กินเยอะแต่ผลสั้น | อ่านทั้งโปรเจกต์ | ระบุขอบเขต + ส่ง context ที่คัดแล้วให้แทน |
| flag **long context** | ไม่ `/clear` ระหว่าง task | บังคับข้อ 5 |
| flag **cache miss** บ่อย | tool definitions เปลี่ยน / MCP เปิดปิด / พักนาน | `/mcp` ปิดตัวที่ไม่ใช้ |
| MCP กินสูงทั้งที่ไม่ค่อยใช้ | เปิดค้าง | ปิด — ใช้ CLI (`gh`, `docker`) แทนเมื่อทำได้ |

รัน `/doctor` คู่กัน: มันหา skill/MCP ที่ไม่ได้ใช้, hook ที่ช้า, และเสนอตัด CLAUDE.md ที่ยาวเกิน
รัน `/insights` รายเดือน: รายงานว่าเสียเวลาไปกับอะไร จุดที่ AI เข้าใจผิดบ่อย — นี่คือ "ตัวเลขที่ควรดู" ที่ไม่ต้องสร้างเอง

## 7. plugin ภายนอกอย่าง caveman — เอาอะไรมาใช้ อะไรไม่เอา

[caveman](https://github.com/JuliusBrussee/caveman) มี 2 กลไก:

| กลไก | ทำอะไร | ตัวเลขจริง | สำหรับ kit นี้ |
|---|---|---|---|
| **skill** ตอบสั้นแบบ caveman | ตัด article/filler/เกริ่น ในร้อยแก้ว (โค้ด/commit/PR ไม่ย่อ) | ผู้เขียนบอก ~65-75% ของ **output** · JetBrains วัดจริง 86 งาน: **8.5% output, ~10% ค่าใช้จ่าย** ไม่มีผลต่อคุณภาพ | output token เป็นแค่ ~10-15% ของบิล Claude Code (ส่วนใหญ่คือ input/context) → ได้จริงราว 5-10% **หลักการเอามาแล้ว** ในหมวด "รูปแบบคำตอบ" ของ CLAUDE.md.tpl (5 บรรทัด ไม่ใช่ 2,100 คำ และไม่ผูกกับภาษาอังกฤษ) ตัว skill เต็มเพิ่ม ~1,000 input token/call — ให้แต่ละคนติดตั้งระดับ user (`~/.claude`) เองถ้าชอบ ไม่ใส่ในโปรเจกต์ |
| **proxy** บีบ input | proxy ในเครื่องย่อ log / test output / JSON / diff ก่อนถึงโมเดล | ~33% input ในเคสที่มี log ยาว | แนวคิดเดียวกับ `verify.mjs` + hook กรอง output (ข้อ 8) แต่ทำแบบ generic ผ่าน `ANTHROPIC_BASE_URL` — **ไม่แนะนำสำหรับทีม**: เป็น man-in-the-middle ของทุก request, ต้องดูแล, และ subscription login อาจไม่ผ่าน proxy ใช้ `verify.mjs` + hook เฉพาะคำสั่งที่รู้ว่ายาวแทน ได้ 80% ของผลในราคา 0 |

เครื่องมือย่อยที่ทับกับของที่มีอยู่แล้ว: `caveman learn` (หา token sink) ≈ `/usage` + `/insights` · `/caveman-compress <file>` ≈ `/doctor` ตัด CLAUDE.md

**[pordee](https://github.com/kerlos/pordee) — caveman ฉบับภาษาไทย** (ตัด ครับ/ค่ะ, อาจจะ/น่าจะ, ที่/ซึ่ง/ว่า, การ-/ความ-) ทำงานผ่าน SessionStart + UserPromptSubmit hook ที่ฉีดกฎเข้าทุก prompt
ข้อที่ต่างจาก caveman และ**เกี่ยวกับ kit นี้โดยตรง**: ภาษาไทย tokenize แพงกว่าอังกฤษ ~2-3 เท่าต่อคำ ดังนั้น
- การย่อ output ภาษาไทยได้ผลมากกว่าอังกฤษจริง (แต่ยังเป็น output ที่เป็นส่วนน้อยของบิลอยู่ดี)
- **ไฟล์ที่ AI อ่านอย่างเดียว (AGENTS.md, CLAUDE.md, REVIEW.md, rules, skills, agents, ข้อความ hook) เป็นภาษาอังกฤษตั้งแต่ v2.1** เพราะเหตุผลนี้ — ประหยัด ~2 เท่าทุกครั้งที่โหลด ส่วน `docs/` (คนอ่าน) และคำตอบต่อผู้ใช้ยังเป็นไทย ทุกไฟล์ในกลุ่มอังกฤษมีคำสั่ง "reply in Thai / write docs in Thai" กำกับไว้

วิธีใช้ pordee กับ kit ถ้าจะใช้:
| ช่วง | โหมด | เพราะ |
|---|---|---|
| `/task` `/check` `/done` `/hotfix` | lite ได้ | คำตอบในแชท ย่อได้ |
| `/intent` `/spec` `/plan` Phase 1-5 | **off** | กำลังเขียน artifact ที่คนและ session อื่นอ่านซ้ำ — full mode ตัด ที่/ซึ่ง/ว่า ทำให้ AC กำกวม |
| full mode | ไม่แนะนำ | บล็อกสรุปของ `/task` ข้อ 4 และ `/check` ข้อ 5 ต้องอ่านแล้วตัดสินได้ ตัดคำเชื่อมแล้วเสี่ยงอ่านผิด |
ติดตั้งระดับ user (`~/.pordee`) ไม่ใส่ในโปรเจกต์ และรัน EV-002 / EV-003 ซ้ำหลังเปิด เพื่อยืนยันว่าไฟล์ที่ AI เขียนยังเป็นภาษาเต็ม

**สรุป:** ของที่คุ้มคือ *หลักการ* (ไม่เกริ่น ไม่ทวน ไม่แปะ log) ซึ่ง kit ใส่เป็นกฎใน CLAUDE.md.tpl แล้ว — ตัว plugin (caveman/pordee) เป็นความชอบส่วนตัว ไม่ใช่ config ของโปรเจกต์

## 8. hook ที่ช่วยเรื่อง token (เลือกใส่)

`PreToolUse` บน Bash แก้คำสั่งก่อนรันได้ (`updatedInput`) — ใช้กรอง output ของคำสั่งที่รู้ว่ายาว เช่น
`pnpm test` → ต่อท้าย `| grep -A5 -E "FAIL|Error"` ก่อนที่ output จะเข้า context
ไม่จำเป็นถ้าใช้ `verify.mjs` แล้ว แต่มีประโยชน์กับคำสั่งอื่นที่ AI รันเอง (docker logs, migration output)
