# Troubleshooting

> ทุกอาการในไฟล์นี้**เกิดขึ้นจริง**ตอนนำ kit ไปใช้กับโปรเจกต์ที่ไม่ได้เขียนเอง (EV-009, Bluepeak Hub)
> ไม่ใช่ปัญหาที่คิดเอาเอง · เลข `K-n` ชี้กลับไปที่บันทึกใน
> [development/trials/ev-009-bluepeak-hub.md](development/trials/ev-009-bluepeak-hub.md)
> ข้อที่ kit แก้แล้วบอกเวอร์ชันไว้ — ถ้าเจอบนเวอร์ชันเก่ากว่านั้น [อัปเกรด](UPGRADE.md) ก่อน

อาการเรียงตามลำดับที่มักเจอ: รับโปรเจกต์เข้า → ตั้ง config → gate → AI ทำงานจริง

---

## รับโปรเจกต์เข้า kit

### "ฉันอยู่ที่ R เท่าไร" — แต่ `readiness` บอกว่าต้องมี manifest ก่อน (K-2)

`readiness` **ตรวจ**คำตอบที่เขียนไว้แล้ว ไม่ได้**หา**คำตอบ ใช้ `assess` แทน:

```bash
node buaflow/bin/buaflow.js assess
node buaflow/bin/buaflow.js assess --write docs/evidence/readiness.draft.json
```

ตัวที่สองเขียน draft manifest ให้ — `pending` ยังเป็น `pending` จึงตก `readiness` จนกว่าคุณจะปิดช่องว่างเอง
ซึ่งเป็นความตั้งใจ ไม่ใช่บั๊ก · kit 3.7.0+

### `readiness` / `audit` / `verify` ตอบ `UNAVAILABLE` (exit 3)

ยังไม่ได้ติดตั้ง `.claude/` (ทำใน Phase 7) — ไม่ใช่ความผิดพลาด ระหว่างนี้ใช้ `assess` และ `benchmark`
ซึ่งรันจาก kit โดยตรง หรือเรียกสคริปต์ของ kit ตรง ๆ:

```bash
node buaflow/claude-setup/readiness.js --root . --file docs/evidence/readiness.json --level R2
```

### `doctor` บอกว่า root เป็น subdirectory ของ git repository (K-1)

โปรเจกต์อยู่ใน monorepo เช่นชี้ไปที่ `frontend/` ทั้งที่ git root อยู่สูงกว่า — ใช้ได้ แต่:
pre-push hook และ CI ต้องติดตั้งที่ **git root** และ path ทุกตัวใน `.claude/stack.json` นับจาก root ที่คุณชี้
ถ้าไม่ได้ตั้งใจ ให้ชี้ไปที่ git root แทน · kit 3.7.0+

### AI ใน Phase A.1 บอกให้พิมพ์ `/init` หรือ `/import` แล้วทำต่อไม่ได้ (K-4)

สองคำสั่งนั้นเป็นคำสั่ง interactive ที่**คน**พิมพ์ใน Claude Code — agent เรียกเองไม่ได้
Phase A.1 ตั้งแต่ 3.7.0 เริ่มด้วย `doctor` + `assess` แทน ถ้าเอกสารในโปรเจกต์ยังเป็นรุ่นเก่า ให้ AI ข้ามสองคำสั่งนั้นไป

---

## ตั้ง config (Phase A.5)

### `check-config` บอกว่า `CLAUDE.md` ต้อง import `AGENTS.md` — แต่ `CLAUDE.md` ของเรามีของดีอยู่แล้ว (K-6)

**อย่ารื้อ** เติมบรรทัดเดียวไว้บนสุด เนื้อหาเดิมอยู่ต่อได้ทั้งหมด:

```text
@AGENTS.md

<เนื้อหา CLAUDE.md เดิมทั้งหมด>
```

ถ้ามี `@AGENTS.md` อยู่แล้วแต่ไม่ใช่บรรทัดแรก 3.7.0+ จะเตือน (ไม่ตก) ให้ย้ายขึ้นไป

### `guard-edit` บล็อกการแก้ `components/ui/*` และบอกให้ใช้ shadcn CLI (K-8)

ถ้า component ใน `ui/` **ถูกแก้ไปแล้ว** (design token, variant ของบริษัท — เคสปกติของโปรเจกต์เดิม)
ห้ามทำตามข้อความเก่านั้น: `shadcn add` **เขียนทับทั้งไฟล์ ไม่ merge** customization จะหายเงียบ ๆ

ทางที่ถูก: ลบ pattern `**/components/ui/**` ออกจาก `protected` ใน `.claude/stack.json` เพราะไฟล์เป็นของโปรเจกต์แล้ว
· 3.7.0+ `guard-bash` บล็อก `shadcn add --overwrite` ให้เอง · ถ้าอยากกันเข้มกว่านั้น
(บล็อก `shadcn add` ทุกรูปแบบ) ให้เพิ่มกฎใน `.claude/hooks/guard-bash.js` แบบที่ Bluepeak Hub ทำ

### `check-config` เตือนว่า `permissions.allow` มีคำสั่งของ `pnpm` แต่ไม่มี lockfile (K-11)

`settings.json` ยังเป็นค่าจาก template · ผลจริงที่เจอ: คำสั่ง verify ของโปรเจกต์ (npm) **ไม่ได้รับอนุญาตเลย**
ใน session ที่ไม่มีคนกดอนุญาต (eval, CI, agent เบื้องหลัง) คำสั่งถูกปฏิเสธเงียบ ๆ และ AI บอกว่า "ยังรัน verify ไม่ได้"
แก้: แทนที่รายการ `Bash(pnpm …)` ด้วยคำสั่งที่โปรเจกต์ใช้จริง เช่น `Bash(npm --prefix backend run verify:all*)`
· `Bash(node .claude/verify.js*)` อยู่ใน allow อยู่แล้ว — บอก AI ใน `AGENTS.md` ให้ใช้ตัวนี้เป็นทางหลัก · kit 3.8.0+

### hook lint หลังแก้ไฟล์ฟ้องว่า ESLint หา config ไม่เจอ ทั้งที่ `npm run lint` ผ่าน (K-12)

monorepo ที่ `formatCommands` ใช้ `npm --prefix backend exec -- eslint {file}` — คำสั่งรันจาก root และ ESLint 9
หา flat config จาก cwd ⇒ หาไม่เจอทุกครั้ง แก้ใน `.claude/stack.json` ด้วยการส่ง config ให้ชัด:

```json
"args": ["--prefix", "backend", "exec", "--", "eslint", "--config", "backend/eslint.config.mjs", "--fix", "{file}"]
```

### `check-config .` เตือนเรื่องที่ตั้งไว้แล้วใน `stack.json` (ไม่มี `.husky/pre-push`, ไม่มี CI, formatter ไม่ match) (K-13)

รุ่นก่อน 3.8.0 เมื่อส่ง root เป็น path แบบ relative (`.`) มันอ่าน `stack.json` ของโปรเจกต์ไม่ได้เลย
และ guard-edit self-test ก็ตกผิด ๆ ด้วย · แก้: อัปเกรด หรือรันโดยไม่ส่ง argument (`node .claude/check-config.js`)

### rule กับ `AGENTS.md` พูดไม่ตรงกัน (K-14)

AI จะเลือกเชื่อข้างใดข้างหนึ่งแบบสุ่ม — ใน eval ของ Bluepeak Hub AI เป็นคนทักเองว่า `frontend-ui.md` บอกว่า
`components/ui/**` ถูกล็อก ขณะที่ `AGENTS.md` บอกว่าไม่ได้ล็อก · rule ที่มากับ kit ต้องแก้เนื้อหาให้ตรงของจริง
ใน A.5 ไม่ใช่แค่แก้ `paths:` — ไม่มีเครื่องมือไหนจับข้อนี้ได้ ต้องอ่าน

---

## gate

### verify ใช้เวลาเกิน ~30 วินาทีที่เอกสารแนะนำ (K-3)

เลข 30 วินาทีเป็น**เป้าตั้งต้นของโปรเจกต์ใหม่** ไม่ใช่ข้อมูลที่วัดมา · โปรเจกต์เดิมตัวแรกที่วัดจริงใช้ 67–86 วินาที
กับ pipeline ที่ดี **อย่าตัดการตรวจจริงออกเพื่อให้ทันเลข** ถ้าช้าจนขวางการวนแก้ ให้แยก verify เร็ว
(typecheck + lint + unit) ไว้ใช้ระหว่างทำงาน และให้ pre-push/CI รันชุดเต็ม

### pre-push ตก แล้วลองใหม่ก็ผ่านโดยไม่ได้แก้อะไร (K-9)

นี่คือ gate ที่ตกแบบสุ่ม — อันตรายกว่าไม่มี gate เพราะสอนให้กด retry แทนการอ่าน error
3.7.0+ gate รัน verify ที่ตกซ้ำหนึ่งครั้งให้เอง:

| ผล | แปลว่า | ทำอะไร |
|---|---|---|
| ตกทั้งสองรอบ | **reproducible** | อ่าน error ข้างบน อย่าลองใหม่ |
| ตกแล้วผ่าน | **FLAKY** — เทสหรือสภาพแวดล้อมมีปัญหา ไม่ใช่งานนี้ | ดู `.verify-flakes.jsonl` แล้วไล่สาเหตุ (ที่เจอจริง: smoke ที่เปิด server เองแล้วรอบก่อนยังปล่อย port ไม่ทัน) |

adoption mode ไม่บล็อก flaky · production mode บล็อก · ปิดการรันซ้ำได้ด้วย `BUAFLOW_NO_FLAKE_CHECK=1`

### `readiness` ตกเพราะ `generatedAt` อยู่ในอนาคต (K-7)

นาฬิกาเครื่องผิด หรือ timestamp ไม่ได้มาจากการรันจริง — ก่อน 3.7.0 มันผ่านเงียบ ๆ พร้อมรายงานว่า "-2d old"
ยอมให้คลาดได้ 5 นาที · แก้เวลาในไฟล์ให้เป็นเวลาที่สร้างหลักฐานจริง

### `ci` ยังเป็น `fail` ทั้งที่ push workflow ขึ้นไปแล้ว

workflow ที่ไม่เคยรันจนจบพิสูจน์อะไรไม่ได้ · ที่เจอจริง: GitHub สร้าง job แต่ไม่เริ่มสัก step เพราะ
**billing ของ account** — ตัวขวางอยู่นอก repo · ระหว่างนั้นตั้ง `"ciMode": "local-only"` ใน `stack.json`
แล้วให้ pre-push เป็นด่านเดียว (ต้องติดตั้งจริง) · `ci` จะผ่านเมื่อมี run ที่สำเร็จบันทึกไว้ เช่น `evidence/ci-run.json`

---

## AI ทำงานจริง (สิ่งที่ eval ของโปรเจกต์จริงเจอ)

### eval แดงตั้งแต่วันแรกด้วยเหตุผลที่ไม่เกี่ยวกับ config (K-10)

เคสตั้งต้นของ kit อ้าง `components/shared/` และ shadcn CLI — โปรเจกต์ที่ไม่มีของพวกนั้นจะแดงผิดเรื่อง
**เขียนเคสใหม่ให้ตรง stack จริง** (A.5 แถว `docs/evals/*.json`) ก่อนเชื่อว่า "แดง = config ยังไม่ดี"

### จะรัน eval ยังไงให้ผลมีความหมาย

session ที่เขียน config **ห้าม**เป็นคนตรวจ — harness ปฏิเสธ run ที่ `gradedBy` = `authoredBy` ให้เอง
วิธีที่ใช้จริงกับ Bluepeak Hub: `claude -p` ใหม่หนึ่ง session ต่อเคสใน clone ที่ลบ `docs/evals/` ออก
แล้วให้ `claude -p` อีก session ที่เห็นแค่เคสกับ transcript เป็นคนตรวจ · สิ่งที่ต้องระวัง:

- **ทุกอย่างใน repo คือ input ของการสอบ** — รวมถึง commit message ที่ใช้เตรียม sandbox (เคยรั่วมาแล้ว)
  และตารางสรุปเคสใน `_state.md`
- clone ใหม่ไม่ใช่ workspace ที่ trust ⇒ `permissions.allow` ถูกเมิน ส่งรายการเดียวกันผ่าน `--allowedTools` แทน
- **n = 1 ไม่พอ** — ablation สองเคสได้ผลดีกว่า baseline ด้วยเหตุผลที่ไม่เกี่ยวกับไฟล์ที่ปิด · คนตรวจสอง session
  ให้ผลไม่ตรงกัน 6% ของข้อ ⇒ คำเตือน `ablation-inconclusive` เป็นสัญญาณ ไม่ใช่เหตุผลพอจะลบไฟล์

### ขอให้ AI merge เข้า main แล้วมันเสนอจะทำให้ "ถ้าอนุญาต"

เจอจริงใน EV-004: AI ไม่อ้างกฎ "AI ไม่ merge งานตัวเอง" เลย ให้คำสั่ง `git merge` กับผู้ใช้ และสิ่งเดียวที่กันไว้คือ
`deny: Bash(git merge *)` ใน `settings.json` · **อย่าถอด deny นั้น** และเขียนกฎไว้ใน `AGENTS.md`
(ไฟล์ที่ AI โหลดทุก session) ไม่ใช่แค่ใน `docs/constitution.md`

### `benchmark` ให้คะแนนโปรเจกต์ของเราต่ำ ทั้งที่ security ดีกว่า reference app

ถูกต้องตามที่มันวัด — benchmark วัด**หลักฐานที่ตรวจได้** ไม่ได้วัดคุณภาพของสิ่งที่หลักฐานพูดถึง
Bluepeak Hub มี rate limit, security header และ session revocation ที่ reference app ไม่มี แต่ได้ 0.39 เทียบ 0.97
เพราะยังไม่มี artifact ของ EP-002..007 · อ่าน [standards/production-qualified-benchmark.md](standards/production-qualified-benchmark.md)
หัวข้อ "สิ่งที่ benchmark นี้มองไม่เห็น"

---

## ไม่เจออาการของคุณ?

เปิดบันทึกใน `development/trials/` แบบเดียวกับ EV-009 — อาการที่เกิดจริงคือสิ่งเดียวที่ควรเข้ามาอยู่ในไฟล์นี้
