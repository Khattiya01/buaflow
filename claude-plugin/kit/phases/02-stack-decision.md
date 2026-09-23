# Phase 2 — เลือก Tech Stack

> เป้าหมาย: ล็อก framework / ภาษา / library ทุกตัว พร้อมเหตุผล และออก ADR
> **ยังไม่ติดตั้งอะไรทั้งสิ้น** Phase นี้ผลิตแต่เอกสาร

## วิธีทำ

อ่าน `docs/planning/01-requirements.md` ก่อน แล้วเสนอ stack เป็นชุด
**เสนอ 1 ชุดที่แนะนำ + ทางเลือกสำรอง พร้อมเหตุผลอิงจาก requirement จริง**
ห้ามเสนอลอยๆ ต้องอ้าง requirement ข้อไหนที่ทำให้เลือกแบบนั้น

ถามเป็นรอบ รอบละไม่เกิน 4 ข้อ ตามลำดับ **A → B → C**

---

## รอบ A — การตัดสินใจใหญ่ 4 ข้อ

### A1. โครง repo
| ตัวเลือก | เหมาะเมื่อ |
|---|---|
| **Monorepo** (pnpm workspace, หรือ + Turborepo) | มี frontend + backend แยก อยากแชร์ type/zod schema, ทีมเล็ก |
| Single app | ใช้ Next.js ตัวเดียวจบ ไม่มี backend แยก |
| หลาย repo | ทีมใหญ่ แยก ownership ชัด, deploy คนละรอบ |

> แนะนำ: **Monorepo + pnpm workspace** ถ้ามี backend แยก — แชร์ type ได้ ซึ่งสำคัญมากเมื่อ AI เขียนโค้ด
> เพราะ type ที่แชร์กันคือสิ่งที่กัน AI หลอน API ที่ไม่มีจริง

### A2. Frontend
ค่าเริ่มต้น: **Next.js (App Router) + TypeScript (strict)**
- ทุก component เป็น Server Component โดยปริยาย ใส่ `'use client'` ที่ **ขอบเล็กที่สุด** (ปุ่ม/ฟอร์ม) ไม่ใช่ทั้งหน้า
- Client Component รับ Server Component เป็น `children` ได้ → ใช้เทคนิคนี้ดันขอบ client ให้เล็ก
- ใช้ route group `(marketing)` / `(app)` แยก layout
- colocate ไฟล์ที่เกี่ยวกับ route ไว้ข้าง route

ถามผู้ใช้ว่าจะใช้ Next.js หรือไม่ — ถ้า requirement ไม่ต้อง SEO/SSR เลยและเป็น internal tool
ทางเลือก **Vite + React + TanStack Router** ก็สมเหตุสมผลและเบากว่า ให้เสนอด้วย

### A3. Backend
| ตัวเลือก | เหมาะเมื่อ | ข้อควรระวัง |
|---|---|---|
| **Next.js Route Handlers + Server Actions** | CRUD ไม่ซับซ้อน, ทีมเล็ก, ไม่มี consumer อื่น | ทำ OpenAPI ยากกว่า ต้องตั้งใจทำ |
| **NestJS** | ธุรกิจซับซ้อน, มีหลาย module, ต้อง API docs สวยและ contract ชัด, มี mobile app มาใช้ด้วย | boilerplate เยอะ |
| **Express / Hono** | ต้องการเบา คุมเอง | ต้องวางโครงเองหมด ระวังโครงสร้างเละเมื่อ AI เขียนเยอะๆ |

> เกณฑ์ตัดสิน: **ถ้ามี consumer อื่นนอกจากเว็บตัวเอง (mobile / partner / ระบบภายใน) → แยก backend**
> ถ้าไม่มี และ feature เป็น CRUD เป็นหลัก → Next.js ตัวเดียวจบ แล้วค่อยแยกทีหลังเมื่อจำเป็น
>
> ถ้าแยก backend และ **เขียนด้วย AI 100% แนะนำ NestJS** เพราะโครงสร้างบังคับ (module/controller/service/dto)
> ทำให้ AI วางไฟล์ผิดที่ได้ยาก และ decorator ของมัน generate OpenAPI ได้ฟรี

### A4. Database + ORM
ค่าเริ่มต้น: **PostgreSQL + Prisma**
- Prisma schema เป็น single source of truth ของ data model
- migration แบบ file-based เข้า git
- ถ้าข้อมูลเป็น document จริงๆ หรือ schema ไม่นิ่งเลย ค่อยพิจารณา MongoDB
- ถามว่ามี DB เดิมที่ต้องต่อไหม → ถ้ามี ใช้ `prisma db pull` แล้ววาง policy ว่าใครเป็นเจ้าของ schema

---

## รอบ B0 — UI library: ประเมินตามเกณฑ์ ไม่ใช่ตามยี่ห้อ

UI library เป็นข้อที่กระทบ AI มากที่สุด เพราะ AI จะแตะมันทุก task ที่มีหน้าจอ
ให้ประเมินตัวเลือกกับ **5 เกณฑ์** นี้ แล้วแสดงตารางให้ผู้ใช้เห็น:

| # | เกณฑ์ | ทำไมสำคัญกับการเขียนโค้ดด้วย AI |
|---|---|---|
| ① | component เป็น**ซอร์สในโปรเจกต์** ไม่ใช่ npm กล่องดำ | AI อ่านและแก้ได้จริง ไม่ต้องเดา API จากความจำที่อาจเก่า |
| ② | มี **registry / CLI** | AI **ติดตั้ง** แทนการเขียนเอง → ได้ของมาตรฐานล่าสุด ไม่ใช่เวอร์ชันที่จำมา |
| ③ | สร้างบน primitive ที่ทำ **a11y** ให้แล้ว | keyboard/aria/focus คือจุดที่ AI พลาดบ่อยสุดถ้าต้องทำเอง |
| ④ | style ด้วย utility class + **CSS variable token** | AI generate ได้แบบ deterministic และ theme เปลี่ยนได้โดยไม่แตะ component |
| ⑤ | อยู่ใน training data มากพอ | AI รู้จักดี ไม่ต้องอธิบายซ้ำทุกครั้ง |

| ตัวเลือก | ① | ② | ③ | ④ | ⑤ | สรุป |
|---|---|---|---|---|---|---|
| shadcn/ui + Radix (React) | ✅ | ✅ | ✅ | ✅ | ✅ | **ค่าเริ่มต้นสำหรับ React** |
| shadcn-vue / shadcn-svelte | ✅ | ✅ | ✅ | ✅ | 🟡 | ค่าเริ่มต้นสำหรับ Vue / Svelte |
| MUI / Antd / Chakra / Mantine | ❌ | ❌ | ✅ | ❌ | ✅ | ตกเกณฑ์ ① ② ④ — ไม่แนะนำสำหรับโปรเจกต์ใหม่ |
| Headless UI / Radix ล้วน + เขียนเอง | 🟡 | ❌ | ✅ | ✅ | ✅ | ได้ แต่ AI ต้องเขียน component เองทุกตัว |

- ถ้าผู้ใช้อยากใช้ตัวที่ตกเกณฑ์ → ได้ แต่ต้องบันทึกเหตุผลลง ADR และธรรมนูญมาตรา 9
  (เหตุผลที่ฟังขึ้น: ทีมมีของเดิม / บริษัทบังคับ / ต้องการ component เฉพาะทางที่ shadcn ไม่มี)
- **ผลที่เลือกต้องไปอยู่ในธรรมนูญมาตรา 9 พร้อมเหตุผล** ไม่ใช่แค่ "ล็อกไว้แล้ว"

## รอบ B — library รอบตัว (เสนอชุดเดียว ให้ผู้ใช้ยืนยัน/แก้)

| หมวด | ตัวที่แนะนำ | เหตุผล |
|---|---|---|
| UI | ตามผล B0 (ค่าเริ่มต้น React: **shadcn/ui + Radix + Tailwind**) | ผ่านเกณฑ์ทั้ง 5 ข้อ |
| ติดตั้ง component | `shadcn` CLI (+ shadcn MCP ถ้ามี) | ให้ AI ดึงจาก registry แทนเขียนเอง |
| i18n | **next-intl** (ถ้า Next.js) | รองรับ App Router + Server Component, routing แบบ `/th` `/en` |
| ฟอร์ม | **react-hook-form + zod** | validation schema เดียวใช้ทั้ง client และ server |
| Validation | **zod** ทั้ง FE/BE | infer type ได้ ลดการเขียน type ซ้ำ → กัน AI เขียน type เพี้ยน |
| Data fetching (client) | **TanStack Query** | ใช้เฉพาะส่วนที่ต้อง client จริงๆ ที่เหลือให้ RSC fetch |
| Global state | ให้ **หลีกเลี่ยง** ก่อน ถ้าจำเป็นใช้ Zustand | state ส่วนใหญ่อยู่ที่ server ได้ |
| ตาราง | TanStack Table + shadcn data-table | |
| วันที่ | date-fns | |
| Logging (BE) | **pino** + request id | log เป็น JSON พร้อม correlate |
| API docs | **OpenAPI 3.1 + Scalar** | Scalar เป็นตัวเลือกหลักของโปรเจกต์ใหม่ปี 2026 มี API client ในตัว dark mode ครบ; Swagger UI ใช้ได้แต่หน้าตาเก่ากว่า |
| Test (unit) | **Vitest** + Testing Library | เร็วกว่า Jest มาก config ร่วมกับ Vite/Next ได้ |
| Test (API integration) | **Supertest** หรือ Postman/newman collection | |
| Test (E2E) | **Playwright** | เฉพาะ critical path |
| Lint/Format | **ESLint 9 flat config + Prettier** (หรือ **Biome** ถ้าอยากเร็วและรวมเป็นตัวเดียว) | ถามผู้ใช้เลือก |
| Git hook | **husky + lint-staged + commitlint** | บังคับ Conventional Commits |
| Package manager | **pnpm** (pin ผ่าน `packageManager` ใน package.json) | |
| Node | pin เวอร์ชันใน `.nvmrc` + `engines` | กัน "เครื่องผมรันได้" |
| Auth | ถามแยก (ดูด้านล่าง) | |

### Auth — ถามเป็นข้อแยก
| ตัวเลือก | เหมาะเมื่อ |
|---|---|
| **Auth.js (NextAuth)** | Next.js เป็นหลัก ต้องการ social login เร็วๆ |
| **Better Auth** | อยากคุม schema เอง มี session/organization/2FA ในตัว |
| **JWT เองบน NestJS** | มี backend แยกและต้องเสิร์ฟ client หลายตัว |
| **Keycloak / SSO องค์กร** | องค์กรบังคับ |

---

## รอบ B2 — คำสั่งตรวจมาตรฐาน (ตัดสินตรงนี้ ห้ามข้าม)

ต้องได้คำสั่ง **เดียว** ที่รันแล้วบอกได้ว่างานใช้ได้หรือไม่ ปกติคือ:

```json
"verify": "node scripts/verify.mjs"
```

ใช้ `buaflow/templates/verify.mjs.tpl` (ปรับ STEPS ให้ตรง stack) — มันรัน typecheck → lint → test เหมือน `&&` แต่:
- **ผ่าน**: พิมพ์ ~3 บรรทัด (นี่คือ "หน้าตาของผ่าน" ที่จะไปอยู่ใน AGENTS.md)
- **พัง**: พิมพ์เฉพาะบรรทัด error ≤ 25 บรรทัด + บอกว่า log เต็มอยู่ `.verify.log`
- หยุดที่ขั้นแรกที่พัง (ขั้นถัดไปมักพังตามและกิน context เปล่า)

> ทำไมไม่ใช้ `&&` เฉย ๆ: กฎ "แปะผลลัพธ์จริง" ถูก แต่ tsc + eslint + vitest ที่พังพร้อมกันคือหลายพันบรรทัดเข้า context ทุกรอบ
> `verify.mjs` ทำให้แปะผลจริงได้ในราคา 1/10 โดยความน่าเชื่อถือไม่ลด (ดู `standards/context-budget.md`)

เกณฑ์ที่ต้องคุมให้ได้:

| เรื่อง | เป้า | ทำไม |
|---|---|---|
| เวลารันทั้งชุด | **ไม่เกิน ~30 วินาที** ตอนโปรเจกต์ยังเล็ก — เป็นเป้าตั้งต้น ไม่ใช่ตัวเลขที่วัดมา · โปรเจกต์จริงตัวแรกที่วัด (EV-009) ใช้ 67 วินาทีกับ pipeline ที่ดี | ถ้าช้ากว่านี้ AI จะไม่วนรันซ้ำระหว่างแก้ = feedback loop ตาย · แต่อย่าตัดการตรวจจริงออกเพื่อให้ทันเลข |
| exit code | ต้อง non-zero เมื่อมีอะไรพัง | ไม่งั้น AI อ่านไม่ออกว่าผ่านหรือไม่ |
| output | สรุปสั้น อ่านออกว่าอะไรพัง log เต็มแยกไฟล์ | ผลจริงต้องแปะได้โดยไม่กิน context |

**บันทึกไว้ใน ADR ว่าถ้าเทสเริ่มช้าเกินเกณฑ์จะทำยังไง** (เช่น แยก `verify` เร็วกับ `verify:full`)

## รอบ C — ยืนยันสิ่งที่ "ยังไม่ตัดสินใจ"

ย้ำกับผู้ใช้และบันทึกเป็น ADR สถานะ `Proposed`:
- **CI/CD** — ยังไม่เลือก git host **แต่ gate ต้องมีตั้งแต่วันแรก** (ไม่ใช่แค่ "CI-ready"):
  `node .claude/gate.js` = verify + check-config + docs-lint รันจาก `.husky/pre-push` ตั้งแต่ Phase 6
  และมี `.github/workflows/gate.yml` + `.gitlab-ci.yml` เตรียมไว้ทั้งคู่ (`buaflow/claude-setup/ci/`)
  วันที่เลือก host เหลือแค่เปิด branch protection — **นี่คือสิ่งเดียวที่ทำให้กฎของ kit เป็นกฎแข็งนอก session ของ Claude**
- **Deploy target** — ยังไม่ตัดสินใจ ⇒ ออกแบบให้เป็น **container-first**:
  แอปต้องอ่าน config จาก env ล้วน, ไม่เขียนไฟล์ลง local disk แบบถาวร, มี `/health`
  ทำแบบนี้แล้วย้ายไป VPS / K8s / Cloud Run ทีหลังได้โดยไม่ต้องรื้อ
- **Git host** — ยังไม่ตัดสินใจ ⇒ ใช้ Conventional Commits + branch naming ที่เป็นกลาง

---

## ผลลัพธ์ที่ต้องเขียน

### 1. `docs/planning/02-tech-stack.md`
```markdown
# Tech Stack

## สรุปการตัดสินใจ
| หมวด | เลือก | เวอร์ชัน | เหตุผล (อ้าง requirement) | ทางเลือกที่ตัดทิ้ง + เพราะอะไร |

## โครง repo
<diagram โฟลเดอร์ระดับบน>

## สิ่งที่ยังไม่ตัดสินใจ
| เรื่อง | จะตัดสินใจเมื่อไหร่ | อะไรที่ต้องเตรียมไว้ให้เปลี่ยนใจได้ |

## เวอร์ชันที่ pin
- Node: ...
- pnpm: ...
- (ตัวอื่นๆ)
```

> **สำคัญ:** ก่อนเขียนเลขเวอร์ชันลงไฟล์ ให้เช็กเวอร์ชันจริง ณ ตอนนั้นก่อน
> (`npm view next version` ฯลฯ) อย่าเขียนจากความจำ

### 2. ADR หนึ่งไฟล์ต่อหนึ่งการตัดสินใจใหญ่
ใช้ `buaflow/templates/adr.tpl.md` เขียนลง `docs/adr/`
อย่างน้อยต้องมี:
- `0001-repo-structure.md`
- `0002-frontend-framework.md`
- `0003-backend-approach.md`
- `0004-database-and-orm.md`
- `0005-auth-strategy.md`
- `0006-ui-library.md` (บันทึกว่าทำไมล็อก shadcn/Radix)
- `0007-deployment-deferred.md` (สถานะ Proposed — ยังไม่ตัดสินใจ)

## ก่อนจบ Phase
อัปเดต `_state.md` → สรุป stack 10 บรรทัด → บอกให้พิมพ์ `ทำ Phase ต่อไป` → **หยุด**
