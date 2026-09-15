# Phase 4 — สถาปัตยกรรม, ความปลอดภัย และคุณภาพโค้ด

> เป้าหมาย: ได้พิมพ์เขียวที่ AI หยิบไปเขียนโค้ดได้โดยไม่ต้องตัดสินใจเอง
> **ยังไม่สร้างโปรเจกต์จริง** Phase นี้ผลิตเอกสาร + ADR

ก่อนเริ่ม อ่าน: `01-requirements.md`, `02-tech-stack.md`, `03-ui-design.md`
และ standards: `security-checklist.md`, `testing-and-coverage.md`, `docker-and-envs.md`, `sonarqube-local.md`

---

## 4.1 โครงสร้างโฟลเดอร์

เขียนโครงจริงที่จะใช้ ระดับไฟล์ ไม่ใช่คำอธิบายลอยๆ และอธิบาย **กติกาว่าอะไรวางตรงไหน**
เพราะข้อนี้คือสิ่งที่กัน AI วางไฟล์มั่ว

ตัวอย่างโครง monorepo (ปรับตาม stack ที่เลือกจริง):

```
apps/
  web/                      Next.js
    src/app/
      [locale]/
        (marketing)/        layout สาธารณะ
        (app)/              layout หลังล็อกอิน
      api/                  route handler (ถ้ามี)
    src/components/
      ui/                   shadcn (generated — แก้ได้แต่ระวัง)
      shared/               component กลางของเรา  ← ตัวที่ใช้ซ้ำ
      <feature>/            component เฉพาะ feature
    src/features/<feature>/ logic ฝั่ง client ของ feature นั้น
    src/lib/                utility, client ของ api, config
    src/i18n/               messages/th/*.json, messages/en/*.json
  api/                      NestJS (ถ้ามี backend แยก)
    src/modules/<module>/   controller / service / dto / entity / *.spec.ts
    src/common/             filter, interceptor, guard, pipe
packages/
  shared/                   zod schema + type ที่ FE/BE ใช้ร่วมกัน  ← สำคัญมาก
  config/                   eslint/ts config ที่แชร์กัน
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/
docker/
```

**กติกาที่ต้องเขียนให้ชัด:**
- ไฟล์ใหม่ต้องวางที่ไหน ตัดสินจากอะไร
- อะไรห้าม import ข้ามกัน (เช่น `features/a` ห้าม import จาก `features/b` ต้องผ่าน `shared`)
- `components/ui/` คือของ shadcn — แก้ได้แต่ต้องจดไว้ว่าแก้อะไร

---

## 4.2 การแบ่งชั้น (layering)

เลือกระดับความเข้มให้เหมาะกับขนาดงาน **อย่า over-engineer**
- โปรเจกต์เล็ก–กลาง: `route/controller → service → repository(Prisma)` พอ
- ซับซ้อนจริง: เพิ่มชั้น domain/use-case แยกออกมา

กฎที่ต้องมีเสมอ ไม่ว่าขนาดไหน:
1. **controller/route ห้ามมี business logic** — รับ input, validate, เรียก service, map response
2. **service ห้ามรู้จัก HTTP** (ไม่รับ `req`/`res`) → เทสได้ง่าย
3. **การเข้าถึง DB อยู่ที่เดียว** ไม่กระจาย Prisma call ทั่วโค้ด
4. **validate ที่ขอบระบบเสมอ** ด้วย zod/DTO — อย่าเชื่อ input จาก client

---

## 4.3 API Contract

ต้องกำหนดและเขียนเป็นเอกสาร:
- **รูปแบบ URL**: `/api/v1/<resource>` (พหูพจน์, kebab-case)
- **Versioning**: อยู่ใน path, ระบุ policy ว่าจะ breaking change ยังไง
- **Error envelope** — รูปแบบเดียวทั้งระบบ:
  ```json
  { "error": { "code": "USER_NOT_FOUND", "message": "...", "details": [], "traceId": "..." } }
  ```
  `code` เป็นค่าคงที่ให้ frontend เอาไปแมป i18n key ได้ (**อย่าให้ frontend อ่าน message ดิบ**)
- **Pagination** — เลือกแบบเดียวใช้ทั้งระบบ (cursor แนะนำเมื่อข้อมูลเยอะ, offset พอสำหรับ admin table)
- **HTTP status ที่ใช้**: 200/201/204/400/401/403/404/409/422/429/500
- **วันที่เป็น ISO 8601 UTC เสมอ** แปลง timezone ที่ชั้นแสดงผล
- **ชื่อ field** เลือก camelCase หรือ snake_case แล้วใช้ให้ตลอด

### API Docs (บังคับมีเสมอเมื่อมี API)
- สเปกคือ **OpenAPI 3.1** และต้องเป็นผลพลอยได้จากโค้ด ไม่ใช่เขียนมือ
  - NestJS → `@nestjs/swagger` decorator บน DTO/controller
  - Next.js route handler / Express / Hono → generate จาก zod (`zod-to-openapi` หรือเทียบเท่า)
- แสดงผลด้วย **Scalar** ที่ `/docs` (มี API client ในตัว) — เสิร์ฟเฉพาะ local/uat, ปิดหรือใส่ auth บน prd
- export spec เป็นไฟล์ `docs/api/openapi.json` และ **commit เข้า git**
  → diff ของไฟล์นี้คือสัญญาณ breaking change ที่มองเห็นตอน review
- ทำ **Postman collection** `docs/api/postman/` สำหรับ integration test

---

## 4.4 Data & Prisma
- naming convention ของ model/field
- ทุกตารางมี `id`, `createdAt`, `updatedAt` และพิจารณา `deletedAt` (soft delete) เป็นนโยบายเดียวทั้งระบบ
- index ที่ต้องมีตั้งแต่แรก (foreign key, field ที่ค้นบ่อย, unique constraint)
- **migration policy**: ห้ามแก้ migration ที่ merge แล้ว, ห้ามใช้ `db push` กับ uat/prd
- **seed** — ต้องมีข้อมูลตั้งต้นสำหรับ dev/test ที่รันซ้ำได้ (idempotent)
- แผน backup/restore (แม้ยังไม่รู้ว่า deploy ที่ไหน ก็ระบุว่าต้องมี)

---

## 4.5 Auth & Authorization
- flow login/logout/refresh เป็น sequence
- session เก็บที่ไหน (cookie httpOnly + secure + sameSite แนะนำ) อายุเท่าไหร่
- **RBAC matrix** — ตาราง role × action:
  | Action | Guest | User | Admin |
  |---|---|---|---|
- บังคับสิทธิ์ **ที่ server เสมอ** การซ่อนปุ่มใน UI ไม่ใช่ security
- password: bcrypt/argon2, นโยบายความยาว, rate limit, lockout

---

## 4.6 Security (ดู `standards/security-checklist.md` ประกอบ)
ต้องระบุมาตรการต่อ OWASP Top 10 อย่างน้อย:
- Input validation ทุก endpoint (zod/DTO)
- SQL injection — Prisma parameterized; ถ้าใช้ `$queryRaw` ต้อง review พิเศษ
- XSS — ห้าม `dangerouslySetInnerHTML` ถ้าจำเป็นต้อง sanitize
- CSRF — สำหรับ cookie-based auth
- Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy
- CORS — allowlist ต่อ env ไม่ใช่ `*`
- Rate limiting — login, OTP, endpoint ที่แพง
- File upload — จำกัดชนิด/ขนาด, ตรวจ magic number ไม่ใช่แค่นามสกุล, เก็บนอก web root
- **Secrets** — ทุกอย่างมาจาก env, มี `.env.example` ที่ไม่มีค่าจริง, `.env*` อยู่ใน `.gitignore`
- Audit log — ใครทำอะไรกับข้อมูลสำคัญเมื่อไหร่
- PDPA (ถ้ามีข้อมูลส่วนบุคคล): consent, สิทธิขอลบ/ขอสำเนา, retention, ไม่ log ข้อมูลอ่อนไหว

---

## 4.7 คุณภาพโค้ดและการทดสอบ
สรุปจาก `standards/testing-and-coverage.md` ให้เข้ากับโปรเจกต์นี้:
- **Backend**: เขียน unit test **พร้อมกับ** module นั้นเสมอ (ไม่ใช่ทีหลัง) — เป็นส่วนหนึ่งของ DoD
- **Frontend**: unit test เขียน **ทีหลังเมื่อ UI นิ่งแล้ว** (หลังผ่าน review) — สร้าง task แยกอัตโนมัติ
- **Integration**: Postman collection + newman รันในเครื่อง
- **E2E**: Playwright เฉพาะ critical path (login, flow หลักที่ทำเงิน)
- เป้า coverage + quality gate ของ SonarQube (ดู 4.9)

---

## 4.8 Docker และ Environment
- `docker-compose.dev.yml` — app, postgres, **sonarqube + sonar db**, adminer/pgadmin, mailpit (ทดสอบอีเมล)
- `Dockerfile` แบบ multi-stage (deps → build → runtime slim, non-root user)
- ตาราง env var ต่อ environment:
  | ตัวแปร | local | uat | prd | ใครถือค่า | เป็นความลับไหม |
- `.env.example` ต้องมีครบทุกตัวและ **ห้ามมีค่าจริง**
- `/health` (liveness) และ `/ready` (เช็ค DB) — ต้องมีตั้งแต่วันแรก ไม่ว่า deploy ที่ไหน
- ระบุชัดว่า **ยังไม่เลือก deploy target** → ห้ามผูก vendor API ใดๆ, ห้ามเขียนไฟล์ถาวรลง local disk

---

## 4.9 SonarQube (local manual)
- เตรียม `sonar-project.properties` (project key, sources, exclusions, path ของ lcov)
- เพิ่ม service sonarqube ใน compose
- กำหนด quality gate ที่จะใช้ (ค่าเริ่มต้น Sonar way + coverage ตามที่ตกลง)
- **AI ไม่รัน scan เอง** — AI เตรียม config + เขียนคำสั่งไว้ใน README ให้ผู้ใช้รัน
  และเมื่อผู้ใช้เอาผล scan มาวาง AI ค่อยแก้ issue ตามที่รายงาน

---

## 4.10 Observability
- log เป็น JSON มี `traceId` ผูก request เดียวกันได้
- **ห้าม log**: password, token, เลขบัตร, PII
- level: error / warn / info / debug และใช้เมื่อไหร่
- error tracking — ยังเลือกทีหลังได้ แต่ให้รวม error handler ไว้ที่เดียวเผื่อเสียบทีหลัง

---

## 4.11 ร่างธรรมนูญโปรเจกต์

ใช้ `project-kit/templates/constitution.tpl.md` สร้าง `docs/constitution.md`

มาตรา 1-8 เป็นหลักการกลางที่ใช้ได้ทุกโปรเจกต์ — **อ่านแล้วปรับถ้อยคำให้ตรงบริบท แต่อย่าตัดทิ้ง**
ส่วนที่ต้องเติมเองคือ:

- **มาตรา 3** — เติม `{{VERIFY_COMMAND}}` และเวลาที่ยอมรับได้ (จาก Phase 2 รอบ B2)
- **มาตรา 9** — สรุปข้อกำหนดที่ล็อกแล้วจาก Phase 1-4 (UI library, i18n, theme, backlog, docker, CI/CD)

ไฟล์นี้จะกลายเป็นเกณฑ์ที่ `/spec`, `/plan`, `/review` และ subagent `code-reviewer` ใช้ตัดสินจริง
ไม่ใช่เอกสารประดับ — เขียนเฉพาะข้อที่ **ตั้งใจจะบังคับจริง**

## ผลลัพธ์ที่ต้องเขียน
1. `docs/planning/04-architecture.md` — รวมทุกหัวข้อข้างบน
2. `docs/adr/` — ADR เพิ่มสำหรับการตัดสินใจใน Phase นี้ (error format, auth flow, soft delete, pagination, ฯลฯ)
3. `docs/api/README.md` — กติกา API contract ฉบับย่อสำหรับเปิดดูเร็ว
4. `docs/constitution.md` — ธรรมนูญโปรเจกต์ (ร่างแรก จะถูกตรวจซ้ำอีกครั้งใน Phase 7)

## ก่อนจบ Phase
อัปเดต `_state.md` → สรุปการตัดสินใจสถาปัตยกรรม + ความเสี่ยงทางเทคนิค
→ บอกให้พิมพ์ `ทำ Phase ต่อไป` → **หยุด**
