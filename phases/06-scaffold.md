# Phase 6 — สร้างโปรเจกต์จริง (Scaffold)

> เป้าหมาย: ได้โปรเจกต์ที่ build ผ่าน, lint ผ่าน, `docker compose up` แล้วเปิดได้
> นี่คือ Phase แรกที่ได้แตะโค้ด

## กฎของ Phase นี้

1. **ใช้ CLI ของเจ้าของ framework เสมอ** อย่าสร้างไฟล์โครงเอง
   `create-next-app`, `nest new`, `shadcn init`, `prisma init`, `pnpm init`
   เหตุผล: ได้โครงที่เป็นมาตรฐานล่าสุดจริง ไม่ใช่โครงที่ AI จำมาจากปีก่อน
2. **ก่อนรันคำสั่ง CLI ทุกครั้ง ต้องแสดงคำสั่งเต็มให้ผู้ใช้ดูและถามก่อน**
   ระบุว่าจะได้อะไร และ flag แต่ละตัวคืออะไร
3. **เช็กเวอร์ชันจริงก่อนติดตั้ง** (`npm view <pkg> version`) อย่าเดาเลขเวอร์ชัน
4. **ทำทีละขั้น แล้ว verify** ขั้นไหนพัง หยุดแก้ก่อน อย่าไหลต่อ
5. commit เป็นช่วงๆ ตามขั้น ไม่ใช่ commit เดียวก้อนยักษ์

---

## ลำดับขั้น

### ขั้น 1 — รากฐาน repo
- `git init` (ถ้ายังไม่มี), `.gitignore` จาก `buaflow/templates/gitignore.tpl` (มี `.verify.log`, `settings.local.json`, `.env*` ครบ), `.editorconfig`, `.nvmrc`
- `.gitattributes` ตั้ง `* text=auto eol=lf` กันปัญหา CRLF บน Windows
- README ตั้งต้น
- verify: `git status` สะอาด

### ขั้น 2 — Scaffold ด้วย CLI
- สร้าง frontend / backend ตาม stack ที่ล็อกใน Phase 2
- ถ้าเป็น monorepo ตั้ง `pnpm-workspace.yaml` + `packages/shared`
- verify: `pnpm build` ผ่านทุก workspace

### ขั้น 3 — Tooling คุณภาพ
- ESLint (flat config) + Prettier **หรือ** Biome ตามที่เลือก
- TypeScript `strict: true` (แนะนำเพิ่ม `noUncheckedIndexedAccess`)
- husky + lint-staged + commitlint (`@commitlint/config-conventional`)
- npm scripts มาตรฐาน:
  `dev` `build` `start` `lint` `format` `typecheck` `test` `test:cov` `db:migrate` `db:seed` `docker:dev` `sonar`
- **`verify` — คำสั่งตรวจมาตรฐานตัวเดียว** (ตามที่ตัดสินใน Phase 2 รอบ B2):
  คัดลอก `buaflow/templates/verify.mjs.tpl` → `scripts/verify.mjs` ปรับ `STEPS` ให้ตรง stack แล้ว
  ```json
  "verify": "node scripts/verify.mjs"
  ```
  เพิ่ม `.verify.log` ลง `.gitignore` · ต้อง exit non-zero เมื่อพัง และรันจบในเวลาที่ตกลงไว้
- **gate + pre-push** — คัดลอก `buaflow/claude-setup/{gate,docs-lint,board,check-config,verify,run,stack-config}.js` และ `stack.json` → `.claude/` (Phase 7 จะทำซ้ำอยู่แล้ว แต่ต้องมีตั้งแต่ตอนนี้เพื่อให้ pre-push ทำงาน)
  แล้วตั้ง `verifyCommand` ใน `.claude/stack.json` ให้ตรงกับคำสั่งที่เพิ่งสร้าง — `gate.js` และ `/check` `/done` อ่านจากที่นี่
  และ `buaflow/claude-setup/ci/pre-push.tpl` → `.husky/pre-push`
  verify: แก้ไฟล์ให้ lint พังแล้วลอง `git push` → ต้องถูกปฏิเสธ
- verify: ลอง commit ที่ผิดรูปแบบแล้วต้องถูกปฏิเสธ
- verify: รัน `pnpm verify` แล้ว **เก็บ output ตอนที่ทุกอย่างเขียวไว้** — จะเอาไปใส่ `AGENTS.md` ใน Phase 7
  (AI ต้องรู้ว่า "ผ่าน" หน้าตาเป็นยังไง ไม่งั้นมันเดาเอง)

### ขั้น 4 — UI foundation
- `shadcn init` (เลือก base primitive ตาม ADR ซึ่งล็อกไว้ที่ Radix)
- ใส่ **theme token จาก `docs/design/theme.md`** ลง `globals.css` ทั้ง light และ dark
- ตั้งฟอนต์ไทย/อังกฤษ + fallback stack
- ติดตั้ง component พื้นฐานที่ใช้แน่ๆ (button, input, form, dialog, table, sonner)
- สร้างโครง `components/shared/` พร้อม README อธิบายกติกา
- verify: หน้า demo แสดง component + สลับ light/dark ได้
- **ถ้า Phase 3 ใช้เส้นทาง D (`CLAUDE_DESIGN`)**: หลัง component ชุดแรกผ่าน verify แล้ว
  ทำไฟล์ preview HTML ต่อ component (มี marker `<!-- @dsCard group="..." -->` บรรทัดแรก ระบุกลุ่มตาม
  หมวดใน `docs/design/components.md`) แล้วใช้ `design-sync` push ขึ้น Design System project บน
  claude.ai/design ครั้งแรก (สร้าง project ใหม่ถ้ายังไม่มี) — นี่คือจุดตั้งต้นของ storybook ที่จะใช้เทียบ
  ความสอดคล้องใน Phase 8 ต่อไป บันทึก `projectId` ไว้ใน `_state.md` และ `design_system_project` +
  `last_storybook_sync` (commit ปัจจุบัน) ใน `docs/design/brief.md` — `/ui` ใช้สองค่านี้แนบ DS project และเช็ค stale ก่อนเปิด canvas
- **ถ้า Phase 3 ใช้เส้นทาง D**: ติดตั้ง Playwright + pixelmatch + pngjs เป็น dev dependency
  (`pnpm add -D @playwright/test pixelmatch pngjs && pnpm exec playwright install chromium --with-deps`)
  ไว้ให้ `.claude/pixel.js` เทียบ canvas กับหน้า local (ตอน `/ui` และ Phase 8.8) — แค่ใช้ render ภาพเทียบ
  ไม่ต้องตั้ง test suite เต็มรูปแบบ ไม่ต้องเขียนไฟล์ `.spec.ts` ตอนนี้
  แล้วสร้าง `docs/design/pixel.json` จาก `docs/templates/pixel.tpl.json`
  verify: `pnpm exec playwright --version` รันได้ และ `node .claude/pixel.js --check` ได้ `เครื่องมือครบ`

### ขั้น 5 — i18n
- ติดตั้ง next-intl (หรือตามที่เลือก) + routing `/th` `/en`
- โครง `messages/th/*.json`, `messages/en/*.json` แยกตาม namespace
- ตัวสลับภาษา + จำค่าที่เลือก
- verify: สลับภาษาแล้วข้อความเปลี่ยนจริงทั้งสองภาษา

### ขั้น 6 — Database
- `prisma init`, เขียน schema **จาก Data model v1 ใน `04-architecture.md` § 4.4b** (ไม่ใช่คิดใหม่ตรงนี้), migration แรก, `seed.ts`
- ตั้งแต่บรรทัดนี้ `prisma/schema.prisma` คือ source of truth ของ data model — spec ทุกตัวหลังจากนี้เขียน DB change เป็น diff เทียบไฟล์นี้
- verify: `pnpm db:migrate` และ `pnpm db:seed` ผ่าน และเปิด adminer เห็นตาราง

### ขั้น 7 — Docker
- `docker-compose.dev.yml`: app, postgres, sonarqube + sonar-db, adminer, mailpit
- `Dockerfile` แบบ multi-stage รันด้วย non-root user
- `.env.example` ครบทุกตัวแปร ไม่มีค่าจริง
- verify: `docker compose -f docker-compose.dev.yml up -d` แล้วเปิดเว็บ, `/health`, และ SonarQube ที่พอร์ต 9000 ได้

### ขั้น 8 — Test, Coverage, Sonar config
- ติดตั้ง Vitest + Testing Library + ตั้ง coverage reporter เป็น `lcov` และ `text`
- เขียน smoke test 1 ตัวให้เห็นว่าระบบ test ทำงาน
- `sonar-project.properties` ชี้ `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
  (ใช้ key นี้ทั้ง JS และ TS เพราะ `sonar.typescript.lcov.reportPaths` เลิกใช้แล้ว)
- ตั้ง exclusions: `**/node_modules/**`, `**/*.spec.ts`, `**/components/ui/**`, `.next/**`, `dist/**`
- verify: `pnpm test:cov` ได้ไฟล์ `coverage/lcov.info`
- **AI ไม่รัน sonar scan** เขียนคำสั่งไว้ใน README ให้ผู้ใช้รันเอง

### ขั้น 9 — API + Docs (ถ้ามี backend)
- โครง module ตัวอย่าง 1 ตัว + error envelope กลาง + request id + logger
- `/health` และ `/ready`
- generate OpenAPI + เสิร์ฟด้วย Scalar ที่ `/docs` + export `docs/api/openapi.json`
- Postman collection เริ่มต้น
- verify: เปิด `/docs` เห็น endpoint และยิงทดสอบได้

### ขั้น 10 — โครงโฟลเดอร์เอกสาร + CI templates
สร้างโฟลเดอร์เปล่าพร้อม `.gitkeep` ให้พร้อมรับของใน Phase 7:
```
docs/intents/  docs/plans/  docs/evals/  docs/incidents/  docs/releases/
docs/specs/    docs/adr/    docs/design/ docs/standards/  docs/templates/
```
วาง CI ไว้ทั้งสองแบบ (ยังไม่เลือก host — เลือกแล้วลบอีกอัน): `claude-setup/ci/github-actions.yml.tpl` → `.github/workflows/gate.yml`,
`claude-setup/ci/gitlab-ci.yml.tpl` → `.gitlab-ci.yml` เติม `{{PNPM_VERSION}}` `{{NODE_MAJOR}}` จาก `.nvmrc` / `packageManager`

> **ถามผู้ใช้เรื่องนาที CI ก่อนวาง** แล้วบันทึกเป็น `ciMode` ใน `.claude/stack.json`:
> `required` (repo public = Actions ฟรีไม่จำกัด หรือมีโควต้าเหลือ) · `pr-only` (มีโควต้าจำกัด) · `local-only` (นาทีหมด / ไม่มี remote → **ไม่ต้องวางไฟล์ CI เลย**)
> ด่านจริงอยู่ที่ pre-push อยู่แล้ว CI เป็นชั้นที่กันคนข้าม hook — เลือก `local-only` ไม่ได้แปลว่าไม่มี gate
> แต่ถ้าเลือก `local-only` แล้ว **pre-push ต้องติดตั้งจริง** ไม่งั้น `check-config.js` จะขึ้น FAIL เพราะไม่เหลือด่านไหนเลย

### ขั้น 11 — Commit และปิด M0
- commit ตาม Conventional Commits ทีละขั้น
- ไฟล์ task ของ M0 → `status: done` + `commit:` แล้ว `node .claude/board.js`
- `node .claude/gate.js` ต้องผ่าน (แปะผล)

---

## ก่อนจบ Phase
รายงานผล verify ทุกขั้นตามจริง — **ขั้นไหนไม่ผ่านต้องบอก อย่ารายงานว่าเสร็จถ้ายังไม่ผ่าน**
และ **แปะ output จริงของ `pnpm verify` ตอนที่ผ่านทั้งหมด** เก็บไว้ใช้ใน Phase 7
อัปเดต `_state.md` → บอกให้พิมพ์ `ทำ Phase ต่อไป` เพื่อส่งมอบ → **หยุด**
