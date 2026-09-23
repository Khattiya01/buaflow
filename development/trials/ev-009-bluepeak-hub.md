# EV-009 — Trial 1: Bluepeak Hub

> **สถานะ: Phase A ครบ 7/7** · 2026-09-23 · ยังเหลือ Phase 7 ข้อ 7.11 (eval baseline)
> โปรเจกต์ทดลองตัวแรกที่ **Buaflow ไม่ได้เขียนเอง** — north-star metric ได้ตัวหารที่ไม่ใช่
> reference app ของตัวเองเป็นครั้งแรก

## โปรเจกต์ที่ทดลอง

| | |
|---|---|
| ที่อยู่ | `C:/Projects/BluePeak/Bluepeak_Hub` (= git root) |
| ชนิด | monorepo เต็ม — backend 216 ไฟล์ · frontend 222 ไฟล์ · docs 26 ไฟล์ |
| Backend | Express + Prisma + PostgreSQL + zod + helmet + express-rate-limit + jose + bcrypt + pino + AWS S3/Secrets Manager · **16 migrations** |
| Frontend | React 18 + TypeScript + Vite + Tailwind + Radix + TanStack Query + zustand + i18next · **195 ไฟล์ `.ts`/`.tsx`** |
| Track | EXTEND (brownfield) → `phases/A-adopt-existing.md` |

เป็นกรณีที่ EV-009 อ้างถึงพอดี: งานวิจัย METR ใน section 12 ของ roadmap บอกว่าความเร็วที่
**รู้สึก** กับเวลาที่ **วัดได้** แยกออกจากกันโดยเฉพาะใน codebase ที่โตแล้ว ซึ่งเป็นสภาพที่ kit
ไม่เคยถูกทดสอบด้วยเลย

---

## 1. Time to First Runnable — วัดจริงจาก clean environment

เครื่องเริ่มต้นแบบไม่มี `node_modules`, ไม่มี `.env`, ไม่มี database, ไม่มี container

| ขั้น | เวลา | ผล |
|---|---:|---|
| `npm ci` (frontend) | 23s | 320 packages, exit 0 |
| `npm ci` (backend) | 8s | 418 packages, exit 0 |
| คัดลอก `.env.example` → `.env` + สร้าง JWT secret 2 ตัว | ~0s | เหลือ `CHANGE_ME` **0 ค่า** |
| `docker compose up -d postgres` | 15s | `bphub_postgres` (port 5434) |
| `prisma generate` + `migrate deploy` | 5s | **16 migrations** ผ่านหมด |
| `npm run db:seed` | 3s | exit 0 |
| **`npm run verify:all`** | **59s** | **exit 0 — ผ่านหมดตั้งแต่ครั้งแรก** |
| **รวม TFR** | **≈ 113s** | |

### 🔴 ตัวเลขที่สำคัญที่สุดของการทดลองนี้

> **คำถามที่มนุษย์ต้องตอบเพื่อให้โปรเจกต์รันได้ = 0**

ไม่มีขั้นไหนที่ต้องเปิด source code เพื่อหาค่าที่ซ่อนอยู่ `.env.example` บอกครบแม้กระทั่ง
วิธีสร้าง secret (`openssl rand -hex 32`), ลำดับความสำคัญของค่า (`.env` ชนะ AWS secret),
และ kill-switch สำหรับปิดการต่อ AWS — **ซึ่งคือเกณฑ์ข้อ 2 ของ R3 เป๊ะ ๆ**
(*"กำหนด environment และ secrets จาก contract โดยไม่เปิด source เพื่อหา hidden value"*)

โปรเจกต์นี้ผ่านเกณฑ์นั้น **ดีกว่า reference app ทั้งสามตัวของ Buaflow เอง** โดยที่ไม่เคยรู้จัก
Buaflow มาก่อนเลย

---

## 2. A.2 — คำสั่งตรวจที่มีอยู่แล้ว

Phase A เรียกขั้นนี้ว่า *"สำคัญที่สุดและมักถูกข้าม"* และเขียนเผื่อกรณีที่โค้ดเดิม typecheck
ไม่ผ่านอยู่แล้ว 40 จุด ของจริงตรงกันข้าม:

| คำสั่ง | ผล | เวลา |
|---|---|---:|
| `frontend: typecheck` (tsc) | ✅ ผ่าน | 11s |
| `frontend: lint` (eslint) | ✅ ผ่าน · 0 errors, 16 warnings | 13s |
| `backend: typecheck` (tsc --noEmit) | ✅ ผ่าน | 8s |
| `backend: lint` (eslint) | ✅ ผ่าน · **0 warnings** | 11s |
| `backend: verify:all` | ✅ ผ่าน | 59s |
| **เทสอัตโนมัติ (unit)** | ❌ **ไม่มีเลย** — 0 ไฟล์เทสใน 195 ไฟล์ frontend, ไม่มี test runner ใน devDependencies ทั้งสองฝั่ง | — |

`verify:all` ของเขาไม่ใช่ placeholder: มันร้อย typecheck + lint + **smoke 14 ตัว** +
**gate 4 ประตู** เข้าด้วยกัน ปลุก server จริง แล้ว login จริงทุก role, เช็ก sidebar ตรงสิทธิ์,
เช็ก 403 `PERMISSION_DENIED` และยืนยันว่า error นั้น**ไม่ใช่ sentinel ที่ทำให้ FE เตะผู้ใช้ออก**

---

## 3. สิ่งที่โปรเจกต์นี้ทำอยู่แล้ว — และทำได้ดีกว่า reference app ของ Buaflow

นี่คือผลที่ไม่ได้คาดไว้ และเป็นข้อมูลที่มีค่าที่สุดสำหรับทิศทางของ kit

| สิ่งที่ Buaflow กำหนด | Bluepeak Hub | reference app ของ Buaflow |
|---|---|---|
| คำสั่ง verify เดียวที่ตัดสินว่างานพัง | ✅ `verify:all` (14 smokes + 4 gates) | ✅ |
| Rate limiting ที่ auth endpoint | ✅ `express-rate-limit` **3 ตัวแยกกัน** (general / login / refresh) | ❌ **REQ-014 — ความเสี่ยงที่ยอมรับไว้** |
| Security headers | ✅ `app.use(helmet())` (`src/server.ts:47`) | ❌ **REQ-102 — ไม่มี header เลย** |
| logout ทำให้ session ใช้ไม่ได้จริง | ✅ ทะเบียน session ฝั่ง server + `revoked_at` + `last_seen_at` | ❌ **REQ-104 — risk `high`** |
| สัญญา env ที่กรอกได้โดยไม่เปิด source | ✅ `.env.example` ที่อธิบาย precedence + kill-switch | ⚠️ มีแต่บางกว่ามาก |
| เอกสาร data model / permission / ADR | ✅ `docs/` 26 ไฟล์ + decision ที่มีเลขอ้างอิง | ⚠️ |

### ⭐ ข้อที่ควรอ่านซ้ำ

`backend/src/modules/auth/authRepository.ts:154-155` มีคอมเมนต์ว่า:

> *"ถ้าตั้งแค่ `revoked_at` แล้วไม่ล้างตัวชี้ access token ที่ logout ไปแล้วจะยังใช้ได้"*

เขา **เจอและแก้บั๊กตัวเดียวกันเป๊ะ** กับที่ EP-003 เพิ่งบันทึกเป็น **REQ-104 ความเสี่ยงระดับ
`high`** ใน reference app ทั้งสามตัวของ Buaflow เอง — โปรเจกต์จริงของผู้ใช้แก้ไปแล้ว ส่วน
reference app ที่ Buaflow ใช้พิสูจน์ตัวเองยังไม่แก้

**นี่คือหลักฐานตรง ๆ ว่าทำไม north-star metric ที่มีตัวหารเป็น reference app ของตัวเองถึงเชื่อไม่ได้**

---

## 4. สิ่งที่ Buaflow หาเจอ และโปรเจกต์นี้ยังไม่มี

### 4.1 🔴 ช่องโหว่ใน dependency ที่ production ใช้จริง — ไม่มีอะไรเคยรายงาน

ไม่มี CI, ไม่มีขั้น audit → ไม่เคยมีใครถูกบอก

**Backend — 1 high + 4 moderate**

| Package | ระดับ | เรื่อง |
|---|---|---|
| `multer <=2.2.0` | **high** | DoS 3 ทาง + **file size limit bypass จาก race condition ใน async fileFilter** |
| `qs` (ผ่าน `body-parser`) | moderate | DoS 3 advisories |
| `uuid <11.1.1` (ผ่าน `exceljs`) | moderate | buffer bounds check หาย |

`multer` คือตัวที่รับไฟล์สัญญา/ใบเสร็จ/สลิปขึ้น S3 → **ข้อ size-limit bypass ตรงกับการใช้งานจริง**
`npm audit fix` แก้ `qs`/`body-parser` ได้โดยไม่ breaking · `multer` ต้องขึ้น 2.4.0

**Frontend — 5 high**

| Package | เรื่อง |
|---|---|
| `axios` | DoS จาก recursion ใน `formDataToJSON` |
| `postcss` | XSS + **path traversal อ่านไฟล์ `.map` ได้ตามใจ** (4 advisories) |

> ⚠️ `postcss` ประกาศเป็น devDependency แต่ยังโผล่ใน `npm audit --omit=dev` — ควรตรวจว่ามันติดไป
> กับ production tree จริงไหม ตัวเลขนี้รายงานตามที่ audit บอก ไม่ได้ตีความแทน

### 4.2 ไม่มี CI เลย

ไม่มี `.github/` ที่ระดับไหนเลย → `verify:all` ที่ดีมากนั้น**รันเมื่อมีคนนึกได้เท่านั้น**
gate 4 ประตูที่เขียนไว้อย่างดี ไม่มีอะไรบังคับให้รันก่อน merge

### 4.3 ไม่มีเทสอัตโนมัติระดับ unit

frontend 195 ไฟล์ · **0 เทส** · smoke ของ backend เป็น integration ที่ต้องมี DB + server จริง
ซึ่งดีมากแต่รันช้า (59s) และครอบเฉพาะ path ที่ smoke เขียนถึง

### 4.4 ไม่มี SBOM / secrets scan / readiness evidence

ไม่มีอะไรตอบได้ว่า *"วันนี้โปรเจกต์นี้อยู่ที่ R เท่าไร"* แบบที่เครื่องตรวจได้

---

## 5. Phase A — ทำจนจบแล้ว

| ขั้น | ผล |
|---|---|
| A.1 inventory | ✅ `docs/planning/A1-inventory.md` |
| A.2 verify | ✅ ผ่านทั้งสองฝั่งตั้งแต่ครั้งแรก → ตั้งเป็น `verifyCommand` |
| A.3 ADR ย้อนหลัง | ✅ **โดยการไม่เขียน** — `docs/architecture.md` มีทะเบียน Decision 43+ ข้ออยู่แล้ว |
| A.4 ธรรมนูญ | ✅ มาตรา 9 จากของจริง + 9.1 เปิดใช้ |
| A.5 config | ✅ `check-config` → **ต้องแก้: 0** |
| A.6 source of truth | ✅ **`docs/backlog/`** — ทีมเลือกใช้โครง Buaflow · `roadmap.md` ถอดบทบาทแต่ไม่ลบ เพราะ gate script 5 ไฟล์อ้าง §3/§5 |
| A.7 intents | ✅ I-001…I-004 |
| A.8 checklist | ✅ **7/7 ครบ** |

### gate เต็มของ Buaflow รันบนโปรเจกต์จริง — ผ่าน

```
gate
  pass  verify  (54.5s)      warn  audit   (0.9s)     skip  secrets
  pass  check-config (4.1s)  pass  docs-lint (0.0s)
ผ่านทุกด่าน                                            exit 0 · 60s
```

`audit` เป็น warn ถูกต้องแล้ว — ยังมี high ค้างจริง และตั้ง `auditMode: warn` ไว้ตามที่
A.5 แนะนำสำหรับโปรเจกต์เดิม · `secrets` skip เพราะยังไม่ได้ติดตั้ง gitleaks

### 🎯 คำตอบที่ EV-009 ต้องการ: โปรเจกต์นี้อยู่ที่ระดับไหน

```
readiness --level R1  →  PASS 5/5
readiness --level R2  →  FAIL 9/10
```

> **R1 ผ่านเต็ม · R2 ติดข้อเดียวคือ `ci`**
>
> ไม่มี `.github/` เลยทั้ง repo ⇒ `verify:all` กับ `gate:phase0` ที่เขียนไว้ดีพอจะเป็น
> CI pipeline อยู่แล้ว **รันเมื่อมีคนนึกได้เท่านั้น** · แก้ข้อเดียวนี้ = ถึง R2

นี่คือตัวเลขแรกของ north-star metric ที่ตัวหารไม่ใช่ reference app ของ Buaflow เอง

---

### 3 คำถามที่ค้าง — ทีมตอบแล้ว 2026-09-23

| คำถาม | คำตอบ | ผลที่ตามมา |
|---|---|---|
| `components/ui/**` shadcn ไหม | **ใช่ แต่แก้ไปไกลแล้ว** | ไม่ใส่ `protected` · บล็อก `shadcn add` ที่ guard-bash แทน → **K-8** |
| source of truth ของงาน | **`docs/backlog/`** (โครง Buaflow) | `roadmap.md` ถอดบทบาท **แต่ไม่ลบ** — code 5 ไฟล์อ้าง §3/§5 เป็นนิยามประตูผ่าน |
| `docs/INDEX.md` | **ลบ** | ย้ายหน้าที่ 3 อย่างออกครบก่อน → `AGENTS.md` / `constitution.md` มาตรา 9 / `_state.md` |

> ข้อที่สองคือเคสที่ **"ลบของเก่าให้หมด" เป็นคำสั่งที่ทำตามตรง ๆ ไม่ได้** — โปรเจกต์เดิมมัก
> มีเอกสารที่ทำหน้าที่สองอย่างพร้อมกัน (ติดตามงาน + นิยามกฎ) Buaflow แทนที่ได้แค่อย่างแรก
> การแยกสองอย่างนี้ออกจากกันก่อนลบ คือสิ่งที่ Phase A ควรบอกให้ทำ แต่ไม่ได้บอก

---

## 6. จุดที่ kit ผิด เงียบ หรือขวางทาง

> acceptance ข้อ 2 ของ EV-009 — บันทึกทุกจุดที่ kit ผิด เงียบ หรือขวางทาง

| # | สิ่งที่เจอ | ความรุนแรง |
|---|---|---|
| **K-1** | **`buaflow doctor` ไม่รู้ว่า project root อยู่ใน git repo หรือเปล่า** — เช็กแค่ `git --version` (ว่าเครื่องมี git ไหม) · ตอนชี้ไปที่ `frontend/` ซึ่ง git root อยู่สูงขึ้นไปหนึ่งชั้น kit ไม่เอะใจเลย ทั้งที่ control `version-control` ที่ R0 ต้องการ commit identity | medium |
| **K-2** | **ไม่มีทางถามว่า "โปรเจกต์นี้อยู่ที่ R เท่าไร"** — `buaflow readiness` ต้องมี manifest ก่อน คำถามแรกของคนทำ brownfield คือ *"ตอนนี้ฉันอยู่ตรงไหน"* คำตอบของ kit คือ *"เขียนคำตอบมาก่อน เดี๋ยวตรวจเลขให้"* · **ผมต้องเขียน manifest 10 control ด้วยมือเพื่อให้ได้คำตอบ ซึ่งเครื่องควรประเมินเองได้เกือบหมด** (build/verify/persistence/access-control/ci ล้วนตรวจได้จากการรันจริง) | **high** |
| **K-3** | **เพดาน verify ~30 วินาทีของ A.2 ไม่สอดคล้องกับของจริง** — verify เต็มของโปรเจกต์นี้ **วัดได้ 67 วินาที** = 2.2 เท่าของเพดาน และเป็น pipeline ที่ดี ไม่ใช่ช้าเพราะเขียนแย่ · ฝั่ง frontend ลำพัง 24s เหลือที่ว่าง 6 วินาทีโดยยังไม่มีเทสสักตัว → เลขนี้ kit ยืนยันไว้เองโดยไม่เคยมีข้อมูล นี่คือข้อมูลชุดแรกที่ขัดกับมัน | medium |
| **K-4** | **A.1 บอกให้เริ่มด้วย `/init` และ `/import`** ซึ่งเป็นคำสั่ง interactive ของ Claude Code ที่ agent เรียกเองไม่ได้ → ขั้นแรกสุดของ Phase A เป็นขั้นที่ AI ทำตามไม่ได้ | low |
| **K-5** | **state ของ kit เองมี milestone ค้าง** — `EV-009` ถูก tag เป็น M4 ทั้งที่ roadmap จัดอยู่ M5 · `check-roadmap` จับได้ตอน `current.milestone` ขยับเป็น M5 — **gate ของ kit จับของตัวเองได้ ถือว่าทำงานถูก** แต่แปลว่าฟิลด์นี้ผิดมาตลอดโดยไม่มีใครเห็น | low |
| **K-6** | **`check-config` บังคับให้บรรทัดแรกของ `CLAUDE.md` เป็น `@AGENTS.md`** — โปรเจกต์นี้มี `CLAUDE.md` ที่ดูแลมาอย่างดี 153 บรรทัด (สถานะรายเฟสที่แม่นกว่า `docs/INDEX.md` เสียอีก + ตาราง "5 กฎที่ห้ามละเมิด") · kit มองว่า `CLAUDE.md` เป็นชั้นบาง ๆ เหนือ `AGENTS.md` ซึ่งถูกสำหรับโปรเจกต์ใหม่ แต่สำหรับ brownfield ที่ลงทุนกับ `CLAUDE.md` ไปแล้ว มันคือคำสั่งให้รื้อ · **A.5 ไม่เตือนเรื่องนี้เลย** — แก้ด้วยการเติมบรรทัด import ไว้ข้างบนโดยไม่ลบของเดิม แต่ kit ควรบอกทางนี้เอง | **high** |
| **K-7** | **`readiness.js` รับหลักฐานที่ลงวันที่ในอนาคตโดยไม่ทักเลย** — manifest ลงวันที่ 2026-09-24 บนเครื่องที่นาฬิกาเป็น 2026-09-23 · รายงานว่า `-2d old` แล้ว **PASS** · EP-010 สร้าง freshness control ไว้จับ "เก่าเกินไป" แต่ไม่จับ "ใหม่เกินกว่าจะเป็นไปได้" ซึ่งเป็นได้ทั้งนาฬิกาเพี้ยนและ timestamp ที่แต่งขึ้น — ไม่ควรผ่านเงียบ ๆ ทั้งสองกรณี | medium |
| **K-8** | **`protected` ที่ kit ให้มาสำหรับ `components/ui/**` แนะนำทางที่ทำลายของ** — ข้อความเหตุผลเขียนว่า *"shadcn generates it. Correct path: install/update through the shadcn CLI"* · แต่ shadcn **ไม่ใช่ generator และไม่ใช่ dependency** มันคือ copy-in-you-own-it และ `shadcn add` **เขียนทับทั้งไฟล์ ไม่ merge** ⇒ สำหรับ component ที่ถูกแก้ไปแล้ว (ซึ่งเป็นเคสปกติ) คำแนะนำนี้คือการสั่งให้ลบ customization ทิ้ง · ที่ Bluepeak Hub `button.tsx` มี design token ของบริษัท, variant `success` และ `Loader2` ที่ต้นฉบับไม่มี · **ทางที่ถูกคือไม่ protect (ไฟล์เป็นของโปรเจกต์) แล้วบล็อก `shadcn add` แทน** ซึ่งตรงข้ามกับที่ kit ตั้งมา | **high** |
| **K-9** | **pre-push gate ตกแบบสุ่ม แล้วผ่านตอน retry โดยไม่ได้แก้อะไร** — push ถูกบล็อกเพราะ `verify` ตกใน 68s · รัน `verify:all` ซ้ำทันทีได้ exit 0 · push ซ้ำผ่าน · สาเหตุที่น่าจะเป็นคือ smoke ที่ยิง HTTP ปลุก server เองและรอบก่อนยังปล่อย port ไม่ทัน (โปรเจกต์นี้ใช้ `SMOKE_PORT` แยกอยู่แล้วเพื่อกันปัญหานี้ แต่ยังชนกันเอง) · **gate ที่ตกแบบสุ่มอันตรายกว่า gate ที่ไม่มี** เพราะมันสอนให้คน "ลองใหม่" แทนที่จะ "อ่าน error" ซึ่งคือจุดเริ่มของนิสัยมองข้าม error ที่ A.2 เตือนไว้เอง · kit ไม่มีอะไรช่วยแยก "ตกเพราะโค้ดพัง" ออกจาก "ตกเพราะสภาพแวดล้อม" | **high** |
| **K-10** | **Phase A บอกว่า eval baseline สำคัญเป็นพิเศษกับโปรเจกต์เดิม แล้วลืมบอกให้ปรับเคส** — A.5 มีตารางว่าต้องปรับอะไรให้ตรงของจริง (stack.json, rules, skills, settings, AGENTS.md, verify.mjs, .gitignore, pre-push, board) · **ไม่มี `evals/` อยู่ในตารางนั้นเลย** ทั้งที่ A ปิดท้ายด้วยประโยคว่า *"7.11 สำคัญเป็นพิเศษสำหรับโปรเจกต์เดิม เพราะ eval รอบแรกจะบอกทันทีว่า AI เข้าใจ convention ของโค้ดเดิมจริงหรือแค่เดา"* · ของจริง: `EV-001` ที่ kit แจกมา hard-code `components/shared/` และสั่งให้ใช้ shadcn CLI ซึ่งที่นี่ไม่มีโฟลเดอร์นั้นและ `shadcn add` ถูกบล็อก ⇒ **เคสจะแดงด้วยเหตุผลที่ไม่เกี่ยวกับ config เลย** ขณะที่ 7.11 บอกว่า *"เคสไหนไม่ผ่านตั้งแต่วันแรก แปลว่า config ยังไม่ดีพอ"* · kit จึงชี้ให้ adopter แก้ของที่ไม่ได้ผิด | **high** |

### สถานะการแก้ (EV-010 · kit 3.7.0)

| # | แก้ที่ | หลักฐาน |
|---|---|---|
| K-1 | `doctor` มีเช็ก `repository` — ไม่อยู่ใน git = warn · subdirectory = บอก git root | `claude-setup/tests/cli.test.js` |
| **K-2** | **`buaflow assess`** — probe repo เอง ไม่ต้องมี manifest · รันบน Bluepeak Hub (`--execute`, 66s, tree สะอาดหลังรัน) ได้ **proven: none (primary-flow ต้องให้คนชี้) · R1: build + verify ผ่านจริง · R2 ติด `ci` ข้อเดียว** = ผลเดียวกับที่หาด้วยมือในหัวข้อ 5 | `claude-setup/tests/assess.test.js` |
| K-3 | A.2 และ Phase 2 บอกแล้วว่าเลข ~30 วินาทีเป็นเป้าตั้งต้น และข้อมูลจริงชุดแรกคือ 67 วินาที | `phases/A-adopt-existing.md` |
| K-4 | A.1 เปิดด้วย `doctor` + `assess` · `/init` `/import` ถูกย้ายเป็นทางเลือกเมื่อ**คน**รัน session | `phases/A-adopt-existing.md` |
| K-5 | แก้ไปแล้วตอนเจอ (checker จับได้เอง) | — |
| K-6 | `check-config` บอกให้เติม `@AGENTS.md` บรรทัดเดียว ไม่รื้อ · A.5 มีแถว `CLAUDE.md` เดิม | `claude-setup/tests/check-config.test.js` |
| K-7 | manifest ที่ลงวันที่ในอนาคตเกิน 5 นาที = ตก | `claude-setup/tests/readiness.test.js` |
| K-8 | reason ของ `components/ui/**` เขียนใหม่ · `guard-bash` บล็อก `shadcn add --overwrite` · A.5 บอกให้ถอด protection เมื่อ `ui/` ถูกแก้แล้ว | `claude-setup/tests/hooks.test.js` |
| K-9 | gate รัน verify ที่ตกซ้ำหนึ่งครั้ง · ตกแล้วผ่าน = `flaky` + `.verify-flakes.jsonl` | `claude-setup/tests/gate.test.js` |
| K-10 | แก้ไปแล้วใน A.5 (commit `2041812`) | — |

**ข้อค้นพบใหม่จากการรัน `assess` กับ reference app ของ kit เอง:** `react-fastapi-postgres-crud` และ
`expo-fastapi-postgres-sync` **ไม่มีคำสั่ง verify เดียว** — การตรวจกระจายอยู่ใน step ของ CI 8–10 step
ซึ่งขัดกับ A.2 ของ kit เอง ("คำสั่งเดียวที่บอกได้ว่างานพัง") · `expo-fastapi-postgres-sync` ไม่มี README
ที่ root · โปรเจกต์จริงที่ไม่รู้จัก Buaflow ทำสองข้อนี้ได้ดีกว่า reference app อีกครั้ง

### ข้อที่ kit ทำได้ดี (ต้องบันทึกด้วย ไม่ใช่เก็บแต่ข้อเสีย)

- **hook ทำงานถูกทั้งหมดกับ repo จริง** — `guard-edit` บล็อกการแก้ migration ตาม `protected` ที่ตั้งใหม่,
  `guard-bash` ปล่อยคำสั่ง verify ที่ยาวผ่าน, บล็อก push เข้า main, บล็อก `--no-verify`
- **`check-config` วินิจฉัยตรงจุด** — บอกว่า rule ไหน `paths:` ไม่ match อะไรเลย พร้อมบอกว่า
  pattern ไหนตาย ⇒ ทำให้ลบ `testing.md` และตัด 6 pattern ที่ตายเงียบได้อย่างมั่นใจ
- **`check-roadmap` จับ milestone ที่ค้างของตัวเองได้** (K-5)

---

## 7. สิ่งที่เขียนลงโปรเจกต์ผู้ใช้

อยู่บน branch `buaflow/phase-a-adoption` · commit `b828385` · **ไม่แตะ production code เลย**

| | |
|---|---|
| แก้ไฟล์เดิม | **2 ไฟล์เท่านั้น** — `.gitignore` (เติม 4 บรรทัด) · `CLAUDE.md` (เติม `@AGENTS.md` ข้างบน เนื้อหาเดิม 153 บรรทัดอยู่ครบ) |
| เพิ่มใหม่ | `.claude/` ทั้งชุด · `AGENTS.md` · `REVIEW.md` · `docs/constitution.md` · `docs/planning/{A1-inventory,_state}.md` · `docs/intents/I-001..004` · `docs/evidence/readiness.json` · โฟลเดอร์ artifact chain |
| ไม่ได้ commit | `backend/.env` (gitignore) · `node_modules/` · container `bphub_postgres` + volume |

---

## 9. ยังเหลือ

- **ทีมยืนยัน A1-inventory** และตอบ 3 คำถาม (shadcn? · source of truth? · แก้ INDEX.md?)
- A.6 ตัดสิน source of truth แล้วบันทึกเป็น ADR
- import `docs/roadmap.md` เดิมเป็น intent
- Phase 7 ข้อ 7.11 — **eval baseline** ซึ่ง Phase A บอกว่าสำคัญเป็นพิเศษกับโปรเจกต์เดิม
  เพราะรอบแรกจะบอกทันทีว่า AI เข้าใจ convention ของโค้ดเดิมจริงหรือแค่เดา
- **reviewer-minutes และ TPC** — ยังวัดไม่ได้จนกว่าจะมีงานจริงไหลผ่าน loop

---

## 10. หลัง Phase A — งานจริงที่ไหลผ่าน loop ของ kit

ส่วนนี้คือคำตอบของ *"แล้ว kit ให้ค่าอะไรกับงานจริง"* ไม่ใช่แค่ตอนรับโปรเจกต์

### 10.1 ช่องโหว่ที่ปิดไปแล้ว — production tree สะอาดทั้งสองฝั่ง

| | ก่อน | หลัง |
|---|---|---|
| backend (prod tree) | 1 high + 4 moderate | **0 high** · 2 moderate |
| frontend (prod tree) | 5 high | **0 high** · 2 moderate |

**backend (T-002):** `multer 2.2.0 → 2.4.0`

> ⚠️ **แก้คำประเมินของตัวเอง** — ตอนเปิด intent ผมเขียนว่า advisory *size-limit bypass*
> "ตรงกับการใช้งานจริง" **ซึ่งไม่จริง** อ่านโค้ดละเอียดแล้วพบว่า `fileFilter` เป็น **sync**
> (advisory เป็นเรื่อง async) และ `fileService.ts:188` **ตรวจขนาดซ้ำที่ service** อยู่แล้ว
> ⇒ ไม่โดนข้อนั้น ที่โดนจริงคือ DoS 3 ข้อระดับ parser ซึ่งโค้ดเขากันไม่ได้
>
> **ทีมนี้ทำ defence in depth ไว้ดีกว่าที่ผมประเมินตอนแรก** และการอ่านโค้ดก่อนเชื่อ
> ตัวเลข severity คือสิ่งที่ทำให้เห็น

**frontend (T-003):** เจอสิ่งที่น่าสนใจกว่าตัวเลข

1. `postcss` 4 advisories โผล่ใน `--omit=dev` เพราะ **`tailwindcss-animate` ถูกประกาศ
   ใน `dependencies`** ทั้งที่ถูก import ที่เดียวคือ `tailwind.config.ts` ⇒ ลาก
   `tailwindcss` → `postcss` เข้า production tree ทั้งสาย · **นี่คือการจัดประเภท
   dependency ผิด ไม่ใช่ช่องโหว่ production 4 ข้อ** · ย้ายไป devDeps แล้วหายทั้งสาย
2. พอตัวอื่นถูกเคลียร์ **ของที่ถูกบังก็โผล่** และกลายเป็นตัวที่สำคัญที่สุด:
   `@remix-run/router` ผ่าน `react-router-dom` — **XSS ผ่าน open redirect**
   (`GHSA-2w69-qvjg-hvjx`) และ **protocol-relative URL ทำให้เกิด open redirect**
   (`GHSA-2j2x-hqr9-3h42`) · แอปนี้ redirect ตอน auth อยู่จริง (`/login?from=`)
   ⇒ **ตรงกับการใช้งานจริง** · fix อยู่ใน major เดิม (6.30.6)

> **บทเรียนสำหรับ kit:** `npm audit` แสดงผลแบบ "ชั้นบนสุดก่อน" ⇒ การเคลียร์ทีละตัวแล้วรันซ้ำ
> เป็นสิ่งจำเป็น ไม่ใช่การรันครั้งเดียวจบ · EP-004 ที่ derive licence จาก SBOM ทุกครั้งเข้าใจ
> หลักการนี้อยู่แล้ว แต่ `commands.audit` ของ kit เป็นคำสั่งเดียวที่รันครั้งเดียว

### 10.2 `auditMode` เลื่อนจาก `warn` เป็น `required` ได้จริง

`stack.json` เขียนเงื่อนไขไว้เองตอน Phase A ว่า *"สลับเป็น required เมื่อเคลียร์หมด
ไม่ใช่ก่อนหน้านั้น"* — พอ high หมดก็สลับได้ทันที และ gate step `audit` เปลี่ยนจาก
`warn` เป็น `pass` **นี่คือ config ที่บอกเงื่อนไขการยกระดับของตัวเองไว้ล่วงหน้า และมันใช้ได้จริง**

### 10.3 CI — ตัวขวางไม่ใช่สิ่งที่คิด

เขียน `.github/workflows/ci.yml` (ประตูเดียวคือ `node .claude/gate.js`) แล้ว push branch
ขึ้น origin จริง **GitHub สร้าง job ให้ = parse ไฟล์ผ่าน แต่ job ไม่เคยเริ่มเลยแม้แต่ step เดียว:**

> *The job was not started because recent account payments have failed or your spending
> limit needs to be increased*

⇒ ตัวขวางเปลี่ยนจาก "ไม่มี workflow" เป็น **"billing ของ GitHub account"** ซึ่งอยู่นอกมือ repo
**control `ci` ยังเป็น `fail`** เพราะ workflow ที่ไม่เคยรันพิสูจน์อะไรไม่ได้ · I-003 → `deferred`

> ⭐ ข้อนี้ทำให้ `ciMode: local-only` ที่ตั้งไว้ตั้งแต่ Phase A **กลายเป็นค่าที่ถูกต้องพอดี**
> kit เขียนเผื่อกรณีนี้ไว้ตรง ๆ ว่า *"นาที CI มีจำกัด และบางโปรเจกต์ไม่มี remote เลย"*
> — เจอเคสนั้นจริงในการทดลองแรก

### 10.4 สรุปสถานะโปรเจกต์

```
readiness R1  PASS 5/5
readiness R2  FAIL 9/10   ← ติด ci ข้อเดียว ซึ่งตอนนี้ติดที่ billing ไม่ใช่ที่โค้ด
gate          ผ่านทุกด่าน · verify pass · audit pass · check-config pass · docs-lint pass
```

branch `buaflow/phase-a-adoption` 6 commits · `main` ไม่ถูกแตะเลยตามที่เจ้าของสั่ง


### 10.5 Phase 7.11 eval baseline — เตรียมครบ แต่**จงใจไม่รัน**

เคยที่ kit แจกมา 4 เคสใช้ดิบ ๆ ไม่ได้ (ดู K-10) ⇒ เขียนใหม่ให้ตรงของจริงทั้ง 4
แล้วเพิ่มเคสที่ 5 ที่เป็นของโปรเจกต์นี้โดยเฉพาะ (ห้ามรัน `shadcn add` ทับ component ที่แก้แล้ว)

**ไม่รันโดยตั้งใจ** — 7.11 บอกว่าต้องรัน *"ใน session ใหม่ที่สะอาด"* แต่ session ที่เตรียมเคส
คือ session เดียวกับที่เขียน `AGENTS.md`, `constitution.md`, `stack.json` และอ่านโค้ดทั้ง
โปรเจกต์มาแล้ว

> **ให้มันตัดสินเอง = คนออกข้อสอบมาตรวจข้อสอบตัวเอง** ซึ่งเป็นปัญหาเดียวกับที่ทำให้ metric
> ของ Buaflow เชื่อไม่ได้มาตลอด และเป็นเหตุผลที่ EV-009 มีอยู่ ⇒ ผลที่ได้จะไม่มีความหมาย

**ช่องว่างที่เหลือของ EV-009:** `reviewer-minutes` และ `TPC` ยังวัดไม่ได้ ต้องมีงานจริง
ไหลผ่าน loop โดยคนอื่นที่ไม่ใช่ session นี้


## 11. สรุปสำหรับทิศทางของ kit

1. **ข้อสรุปที่แรงที่สุด:** โปรเจกต์จริงที่ไม่เคยรู้จัก Buaflow ทำได้ **ดีกว่า** reference app
   ของ Buaflow ใน 3 control ที่ M4 เพิ่งบันทึกเป็นความเสี่ยงที่ยอมรับไว้ (REQ-014/102/104)
   ⇒ **reference app ไม่ใช่ตัวแทนของ "โปรเจกต์จริง" และไม่ควรถูกใช้เป็นตัวหารของ metric อีก**
2. สิ่งที่ Buaflow ให้ค่าจริง ๆ กับโปรเจกต์นี้คือ **สิ่งที่มองไม่เห็น**: ช่องโหว่ dependency ที่ไม่มีใคร
   เคยรายงาน, การไม่มี CI, และคำตอบว่าอยู่ที่ R เท่าไร — ไม่ใช่ convention หรือโครงสร้าง
   ซึ่งเขามีดีอยู่แล้ว
3. **K-2 คือของที่ควรทำต่อที่สุด** — ถ้า kit ประเมิน readiness เองได้จากการรันจริง
   (build/verify/persistence/access-control/ci ตรวจได้หมด) ค่าที่ adopter ได้ในนาทีแรกจะต่างกันมาก
4. **สิ่งที่ kit ให้ค่ามากที่สุดหลังรับโปรเจกต์แล้ว คือ `auditMode` ที่เลื่อนระดับได้** —
   config ที่เขียนเงื่อนไขการยกระดับของตัวเองไว้ล่วงหน้า (`warn` จนกว่าจะเคลียร์ แล้วค่อย
   `required`) ทำให้โปรเจกต์เดิมเข้าระบบได้โดยไม่ต้องหยุดงานมาไล่แก้ก่อน **รูปแบบนี้ควรมีกับ
   control อื่นด้วย** ไม่ใช่แค่ audit
5. **K-10 ชี้ช่องว่างเชิงโครงสร้างของ Phase A** — A.5 บอกให้ปรับ rules/skills/settings ให้ตรง
   stack จริง แต่ลืม `evals/` ซึ่งเป็นอาร์ทิแฟกต์เดียวที่ 7.11 ถือว่า **"แดง = config ยังไม่ดีพอ"**
   ⇒ kit ชี้ให้ adopter ไปแก้ของที่ไม่ได้ผิด · แก้ง่ายมาก: เพิ่มหนึ่งแถวในตาราง A.5
6. **K-9 (gate ตกแบบสุ่ม) อาจสำคัญกว่าที่ดู** — kit ไม่มีทางแยก "ตกเพราะโค้ดพัง" ออกจาก
   "ตกเพราะสภาพแวดล้อม" เลย ทั้งที่ทั้งหมดที่ kit สร้างมาตั้งอยู่บนสมมติฐานว่า gate ที่แดง
   แปลว่ามีอะไรผิดจริง
