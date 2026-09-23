# EV-009 — Trial 1: Bluepeak Hub

> **สถานะ: กำลังดำเนินการ** · เริ่ม 2026-09-24 · ยังไม่จบ Phase A
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

## 5. จุดที่ kit ผิด เงียบ หรือขวางทาง

> acceptance ข้อ 2 ของ EV-009 — บันทึกทุกจุดที่ kit ผิด เงียบ หรือขวางทาง

| # | สิ่งที่เจอ | ความรุนแรง |
|---|---|---|
| **K-1** | **`buaflow doctor` ไม่รู้ว่า project root อยู่ใน git repo หรือเปล่า** — มันเช็กแค่ `git --version` (ว่าเครื่องมี git ไหม) ตอนที่ชี้ไปที่ `frontend/` ซึ่ง git root อยู่สูงขึ้นไปหนึ่งชั้น kit ไม่ได้เอะใจเลย ทั้งที่ control `version-control` ที่ R0 ต้องการ commit identity | medium |
| **K-2** | **ไม่มีทางถามว่า "โปรเจกต์นี้อยู่ที่ R เท่าไร"** — `buaflow readiness` ต้องมี manifest ก่อน คำถามแรกของคนทำ brownfield คือ *"ตอนนี้ฉันอยู่ตรงไหน"* คำตอบของ kit คือ *"เขียนคำตอบมาก่อน แล้วเดี๋ยวฉันตรวจเลขให้"* → **kit ขวางทางตรงจุดที่ควรช่วยมากที่สุด** | **high** |
| **K-3** | **เพดาน verify ~30 วินาทีของ A.2 ไม่สอดคล้องกับของจริง** — `verify:all` ของเขา = **59s** คือ 2 เท่าของเพดาน และมันคือ pipeline ที่ดี ไม่ใช่ pipeline ที่ช้าเพราะเขียนแย่ · ฝั่ง frontend อย่างเดียว (`typecheck && lint`) = 24s เหลือที่ว่าง 6 วินาทีโดยที่ยังไม่มีเทสสักตัว → เลขนี้ kit ยืนยันไว้เองโดยไม่เคยมีข้อมูล และนี่คือข้อมูลชุดแรกที่ขัดกับมัน | medium |
| **K-4** | **A.1 บอกให้ใช้ built-in `/init` และ `/import` ก่อน** แต่ทั้งสองเป็นคำสั่ง interactive ของ Claude Code ที่ agent ใน session เดียวกันเรียกเองไม่ได้ → ขั้นแรกสุดของ Phase A เป็นขั้นที่ AI ทำตามไม่ได้ | low |
| **K-5** | **state ของ kit เองมี milestone ค้าง** — `EV-009` ถูก tag เป็น M4 ทั้งที่ roadmap จัดมันอยู่ M5 พอ `current.milestone` ขยับเป็น M5 แล้ว `check-roadmap` ถึงจับได้ · **gate ของ kit จับของตัวเองได้ ถือว่าทำงานถูก** แต่ก็แปลว่าฟิลด์นี้เคยผิดมาตลอดโดยไม่มีใครเห็น | low |

---

## 6. ยังไม่ได้ทำ

- A.1 `docs/planning/A1-inventory.md` (รวบรวมข้อมูลแล้ว ยังไม่ได้เขียนลงโปรเจกต์)
- A.3–A.8 (ADR ย้อนหลัง, ธรรมนูญ, `.claude/stack.json`, source of truth ของงาน)
- Phase 7 (ติดตั้ง `.claude/` ทั้งชุด)
- ประเมิน readiness level อย่างเป็นทางการ + `docs/evidence/readiness.json`
- **reviewer-minutes และ TPC** — ยังวัดไม่ได้จนกว่าจะจบ Phase A

## 7. สิ่งที่เขียนลงโปรเจกต์ผู้ใช้แล้ว

| ไฟล์ | สถานะ |
|---|---|
| `backend/.env` | สร้างจาก `.env.example` + JWT secret สุ่ม 2 ตัว · **git ignore อยู่แล้ว** |
| `frontend/node_modules/`, `backend/node_modules/` | ติดตั้งจาก lockfile · git ignore อยู่แล้ว |
| container `bphub_postgres` + volume `bphub_db_data` | สร้างใหม่ทั้งคู่ (ไม่มีมาก่อน) · migrate + seed แล้ว |

**ไม่มีไฟล์ที่ git ติดตามถูกแก้แม้แต่ไฟล์เดียว** — `git status` ว่างตลอดการทดลอง
