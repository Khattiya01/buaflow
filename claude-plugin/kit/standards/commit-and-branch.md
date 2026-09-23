# Commit, Branch และการรวมโค้ด

ใช้ได้กับ Git host ทุกเจ้า (ยังไม่ตัดสินใจว่าจะใช้ตัวไหน)

---

## 1. Conventional Commits (บังคับ)

```
<type>(<scope>): <หัวข้อ>

<รายละเอียด — ทำไมถึงแก้ ไม่ใช่แก้อะไร>

Refs: T-012
```

### type ที่ใช้ได้
| type | ใช้เมื่อ | ขึ้นเวอร์ชัน |
|---|---|---|
| `feat` | เพิ่มความสามารถที่ผู้ใช้รับรู้ได้ | minor |
| `fix` | แก้บั๊ก | patch |
| `refactor` | จัดโค้ดใหม่ **โดยพฤติกรรมเหมือนเดิม** | - |
| `perf` | ทำให้เร็วขึ้น | patch |
| `test` | เพิ่ม/แก้เทสอย่างเดียว | - |
| `docs` | เอกสาร, OpenAPI, README | - |
| `style` | format อย่างเดียว ไม่แตะ logic | - |
| `chore` | ตั้งค่า, อัปเดต dependency, tooling | - |
| `build` | Dockerfile, build config | - |
| `ci` | pipeline (ยังไม่ใช้ตอนนี้) | - |
| `security` | แก้ช่องโหว่ | patch |

### scope
ใช้ชื่อโมดูล/พื้นที่จริงในโปรเจกต์: `auth` `user` `order` `ui` `db` `api` `i18n` `theme` `docker`

### หัวข้อ (subject)
- ภาษาอังกฤษ, ขึ้นต้นด้วยกริยา present tense, ไม่ต้องขึ้นต้นตัวใหญ่, ไม่ต้องมีจุดท้าย
- ไม่เกิน 72 ตัวอักษร
- บอก **ผลลัพธ์** ไม่ใช่ชื่อไฟล์

### Breaking change
```
feat(api)!: change error response shape to include traceId

BREAKING CHANGE: ทุก client ต้องอ่าน error.code แทน error.message
```

### ตัวอย่างที่ดี / ไม่ดี
```
✅ feat(auth): add email verification flow with 24h token
✅ fix(order): prevent duplicate submit on slow network
✅ refactor(user): extract validation into shared zod schema
✅ chore(deps): upgrade prisma to 6.x

❌ update code
❌ fix bug
❌ feat: T-012
❌ แก้หน้า login          (subject ต้องเป็นอังกฤษ)
❌ feat(auth): add login, fix table style, update readme   (ปนหลายเรื่อง)
```

---

## 2. กติกาขนาด commit

- **1 commit = 1 เรื่อง** ถ้าอธิบายต้องใช้คำว่า "และ" แปลว่าควรแยก
- แยก **refactor** กับ **เปลี่ยนพฤติกรรม** ออกจากกันเสมอ (ไม่งั้น review ไม่ได้)
- ทุก commit ควร build ผ่านด้วยตัวเอง
- **ห้าม commit**: `.env`, secret, `node_modules/`, ไฟล์ build, ข้อมูลจริงของลูกค้า,
  ไฟล์ dump ฐานข้อมูล, รูป/วิดีโอขนาดใหญ่ที่ไม่จำเป็น

---

## 3. Branch

```
<type>/<task-id>-<คำอธิบายสั้น-อังกฤษ-kebab>

feat/T-012-user-registration
fix/T-045-order-duplicate-submit
hotfix/T-099-payment-timeout
chore/T-003-setup-eslint
```

### โครง branch
| branch | คืออะไร |
|---|---|
| `main` | โค้ดที่พร้อมปล่อย เป็นความจริงเสมอ |
| `<type>/<task-id>-...` | แตกจาก `main` งานเดียวจบ แล้วลบทิ้ง |
| `hotfix/...` | แตกจาก **tag ที่อยู่บน prd** ไม่ใช่จาก main |

> ยังไม่ต้องมี `develop` — ทีมเล็กที่ใช้ AI เขียนโค้ดควรใช้ trunk-based
> (branch อายุสั้น merge บ่อย) เพราะ branch อายุยาวจะ conflict หนักมากเมื่อ AI แก้หลายไฟล์
> ถ้าต้องการกันของที่ยังไม่พร้อมปล่อย ให้ใช้ **feature flag** แทนการค้าง branch

---

## 4. การรวมโค้ด

- **Squash merge** เป็นค่าเริ่มต้น — ประวัติบน `main` สะอาด 1 task = 1 commit
- ข้อความ commit ตอน squash ต้องเป็น Conventional Commit และอ้าง task id
- ก่อน merge ต้อง: typecheck + lint + test ผ่าน และผ่าน review

### ถ้าทำงานหลายคน
- เปิด PR พร้อมคำอธิบาย: ทำอะไร, ทำไม, ทดสอบยังไง, มีอะไรต้องระวัง
- อย่างน้อย 1 คนอนุมัติ
- ถ้าทำคนเดียว: ใช้ `/check` แล้ว `/done` เปิด PR → คุณกด merge เองใน UI หลัง gate ผ่าน — flow เหมือนกัน แค่คนอนุมัติคือคุณ (AI ไม่ merge เอง hook บล็อกไว้)

---

## 5. Tag และ CHANGELOG

- ใช้ **Semantic Versioning** `vMAJOR.MINOR.PATCH`
- ติด tag ทุกครั้งที่ขึ้น prd
- CHANGELOG generate จาก commit ได้ (เพราะใช้ Conventional Commits) — อีกเหตุผลที่ต้องเขียนให้ถูก

---

## 6. บังคับใช้ด้วยเครื่องมือ
- `commitlint` + `husky` (`commit-msg` hook) → commit ผิดรูปแบบจะถูกปฏิเสธ
- `lint-staged` (`pre-commit` hook) → lint + format เฉพาะไฟล์ที่แก้
- ถ้า hook ปฏิเสธ → **แก้ที่ต้นเหตุ ห้ามใช้ `--no-verify`**
