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

## 8. ยังเหลือ

- **ทีมยืนยัน A1-inventory** และตอบ 3 คำถาม (shadcn? · source of truth? · แก้ INDEX.md?)
- A.6 ตัดสิน source of truth แล้วบันทึกเป็น ADR
- import `docs/roadmap.md` เดิมเป็น intent
- Phase 7 ข้อ 7.11 — **eval baseline** ซึ่ง Phase A บอกว่าสำคัญเป็นพิเศษกับโปรเจกต์เดิม
  เพราะรอบแรกจะบอกทันทีว่า AI เข้าใจ convention ของโค้ดเดิมจริงหรือแค่เดา
- **reviewer-minutes และ TPC** — ยังวัดไม่ได้จนกว่าจะมีงานจริงไหลผ่าน loop

## 9. สรุปสำหรับทิศทางของ kit

1. **ข้อสรุปที่แรงที่สุด:** โปรเจกต์จริงที่ไม่เคยรู้จัก Buaflow ทำได้ **ดีกว่า** reference app
   ของ Buaflow ใน 3 control ที่ M4 เพิ่งบันทึกเป็นความเสี่ยงที่ยอมรับไว้ (REQ-014/102/104)
   ⇒ **reference app ไม่ใช่ตัวแทนของ "โปรเจกต์จริง" และไม่ควรถูกใช้เป็นตัวหารของ metric อีก**
2. สิ่งที่ Buaflow ให้ค่าจริง ๆ กับโปรเจกต์นี้คือ **สิ่งที่มองไม่เห็น**: ช่องโหว่ dependency ที่ไม่มีใคร
   เคยรายงาน, การไม่มี CI, และคำตอบว่าอยู่ที่ R เท่าไร — ไม่ใช่ convention หรือโครงสร้าง
   ซึ่งเขามีดีอยู่แล้ว
3. **K-2 คือของที่ควรทำต่อที่สุด** — ถ้า kit ประเมิน readiness เองได้จากการรันจริง
   (build/verify/persistence/access-control/ci ตรวจได้หมด) ค่าที่ adopter ได้ในนาทีแรกจะต่างกันมาก
