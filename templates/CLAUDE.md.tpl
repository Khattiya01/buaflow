# CLAUDE.md — {{PROJECT_NAME}}

> กติกาสำหรับ Claude Code ในโปรเจกต์นี้ อ่านทุก session
> เขียนสั้นและเป็นคำสั่ง รายละเอียดลิงก์ไป docs/

## โปรเจกต์นี้คืออะไร
{{หนึ่งย่อหน้า: เว็บอะไร ให้ใคร แก้ปัญหาอะไร}}

## Stack
- Frontend: {{...}}
- Backend: {{...}}
- DB/ORM: {{PostgreSQL + Prisma}}
- UI: **shadcn/ui + Radix + Tailwind** (ห้ามใช้ UI library อื่น)
- i18n: {{next-intl}} — **th (default) + en**
- Test: {{Vitest + Testing Library + Playwright}}
- Docker สำหรับ dev และ deploy

## โครงโฟลเดอร์ (ไฟล์ใหม่วางที่ไหน)
```
{{ผังจริง พร้อมคำอธิบายสั้นๆ ว่าอะไรวางตรงไหน}}
```
- `components/ui/` = shadcn generated
- `components/shared/` = component กลางของเรา
- `components/<feature>/` = เฉพาะ feature
- ห้าม feature หนึ่ง import component ของอีก feature — ถ้าต้องใช้ร่วมให้ยกขึ้น shared

## คำสั่งที่ใช้บ่อย
```
pnpm dev            รันโหมดพัฒนา
pnpm build          build
pnpm typecheck      ตรวจ type
pnpm lint           lint
pnpm test           รันเทส
pnpm test:cov       เทส + coverage
pnpm db:migrate     รัน migration
pnpm db:seed        ใส่ข้อมูลตั้งต้น
pnpm docker:dev     ยก docker compose
pnpm sonar          สแกน SonarQube (ผู้ใช้รันเอง — Claude ห้ามรัน)
```

---

## กติกาที่ต้องทำตามเสมอ

### 1. เริ่มงานทุกครั้ง
1. อ่าน `docs/backlog/board.md` และไฟล์ task ที่จะทำ
2. **สรุปความเข้าใจให้ผู้ใช้ฟังก่อน แล้วถามสิ่งที่ไม่ชัด** อย่าเริ่มเขียนทันที
3. ย้ายสถานะ task เป็น `in-progress` และทำทีละ task เท่านั้น

### 2. ก่อนสร้าง UI component — ต้องถามเสมอ
ถามตามลำดับ: มีใน `components/shared/` แล้วไหม → มีใน shadcn registry ไหม →
ประกอบจากของที่มีได้ไหม → มี design ไหม → **ถ้าไม่มีทั้งหมด หยุดถามผู้ใช้ก่อนออกแบบเอง**
และทุกครั้งต้องประเมินว่า **ควรเป็น shared component ไหม** (ใช้ซ้ำ ≥ 2 ที่ = ทำเป็น shared)
รายละเอียด: `docs/standards/ui-component-rules.md`

### 3. ห้ามเด็ดขาด
- ข้อความ hardcode — ทุกข้อความผ่าน i18n และต้องมีครบทั้ง th และ en
- สี/ขนาดดิบ — ใช้ theme token เท่านั้น
- ติดตั้ง UI library อื่นนอกจาก shadcn/Radix
- commit ที่ไม่ใช่ Conventional Commits
- รัน SonarQube scan เอง (ผู้ใช้รันเอง แล้วเอาผลมาให้แก้)
- ทำงานนอก scope ของ task โดยไม่ถาม
- ใช้ `git commit --no-verify`

### 4. Backend
- **เขียน unit test พร้อมกับ module เสมอ** อยู่ใน DoD ไม่เลื่อน
- validate input ด้วย zod/DTO ทุกทางเข้า
- error ตอบตาม envelope กลาง พร้อม `code` ที่ frontend แมป i18n ได้
- ตรวจสิทธิ์ที่ server เสมอ และตรวจ ownership ของ record ไม่ใช่แค่ role
- อัปเดต OpenAPI + Postman collection ทุกครั้งที่ API เปลี่ยน

### 5. Frontend
- unit test **เขียนทีหลังเมื่อ UI นิ่ง** แต่ต้อง **สร้าง task `T-xxx-test` ไว้ตั้งแต่ตอนทำ UI**
- ทำครบทุกสถานะ: loading / empty / error / ไม่มีสิทธิ์
- ทดสอบทั้ง th/en, light/dark และที่ความกว้าง ~390px

### 6. จบงานทุกครั้ง
รันจริง: `pnpm typecheck && pnpm lint && pnpm test` →
ตรวจตาม `docs/standards/definition-of-done.md` → `/review` → อัปเดต board

### 7. ถ้าแผนเปลี่ยน
แก้เอกสารต้นทางก่อนเสมอ (spec / requirements / ADR / board) แล้วค่อยแก้โค้ด
**ห้ามปล่อยให้โค้ดกับเอกสารไม่ตรงกัน**

### 8. ถ้าไม่แน่ใจ
ถาม อย่าเดา — โดยเฉพาะเรื่อง UI, business rule, และการเปลี่ยน API contract

---

## เอกสารอ้างอิง
| เรื่อง | ไฟล์ |
|---|---|
| วงจรการทำงาน / การปล่อยของ | `docs/workflow.md` |
| Definition of Done | `docs/standards/definition-of-done.md` |
| กติกา UI component | `docs/standards/ui-component-rules.md` |
| i18n และ theme | `docs/standards/i18n-and-theme.md` |
| การทดสอบและ coverage | `docs/standards/testing-and-coverage.md` |
| security checklist | `docs/standards/security-checklist.md` |
| commit และ branch | `docs/standards/commit-and-branch.md` |
| docker และ env | `docs/standards/docker-and-envs.md` |
| SonarQube | `docs/standards/sonarqube-local.md` |
| สถาปัตยกรรม | `docs/planning/04-architecture.md` |
| การตัดสินใจเชิงสถาปัตยกรรม | `docs/adr/` |
| backlog | `docs/backlog/board.md` |
| theme และ component | `docs/design/` |

## Slash commands
```
/spec <F-xx>    ทำ spec ของ feature ใหญ่ (requirements → design → tasks)
/task [T-xxx]   หยิบ task มาทำ
/ui <ชื่อ>       เริ่มสร้าง UI component (จะถามก่อนเสมอ)
/review         รีวิวงานที่ทำ
/hotfix         ขั้นตอน hotfix
/done           ปิด task และอัปเดต board
```
