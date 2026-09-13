# การทดสอบและ Code Coverage

## 1. หลักการของโปรเจกต์นี้

| ชั้น | เขียนเมื่อไหร่ | ใครรับผิดชอบ |
|---|---|---|
| **Backend unit test** | **พร้อมกับ module เสมอ** อยู่ใน DoD ของ task นั้น | AI ตอนทำ task |
| **Frontend unit test** | **หลัง UI นิ่ง** (ผ่าน review เป็น done แล้ว) ผ่าน task `T-xxx-test` | AI ตอนทำ task test |
| **Integration (API)** | เมื่อ endpoint เสร็จ — Postman collection | AI ตอนทำ task |
| **E2E** | ตอนปิด feature ใหญ่ เฉพาะ critical path | AI |
| **Manual / UAT** | ก่อนขึ้น prd | คน |

> เหตุผลที่ frontend test ทำทีหลัง: ระหว่าง UI ยังปรับ การเขียนเทสไปด้วยจะทำให้ต้องรื้อเทสซ้ำๆ
> แต่ **ต้องเขียนจริง** ไม่ใช่ข้าม — จึงบังคับให้สร้าง task `-test` ตั้งแต่ตอนทำ UI

---

## 2. พีระมิดเทส (สัดส่วนที่ควรเป็น)

```
        E2E (Playwright)        ~5%   critical path เท่านั้น
    Integration (API/DB)       ~25%   endpoint + database จริง
  Unit (service/util/component) ~70%   เร็ว แยกอิสระ
```

อย่าทำกลับด้าน — E2E เยอะเกินไปจะช้า เปราะ และไล่หาสาเหตุยาก

---

## 3. เป้า Coverage

| ส่วน | Line | Branch | หมายเหตุ |
|---|---|---|---|
| Backend service / business logic | **≥ 85%** | ≥ 75% | นี่คือส่วนที่พังแล้วเจ็บ |
| Backend controller / route | ≥ 70% | ≥ 60% | เน้น validation + error path |
| Frontend component (หลัง UI นิ่ง) | ≥ 70% | ≥ 60% | |
| **โค้ดใหม่ในรอบนี้ (new code)** | **≥ 80%** | ≥ 70% | ← ตัวที่ Sonar quality gate ใช้จริง |

**ไม่นับ coverage ของ:** `components/ui/**` (shadcn generated), ไฟล์ config,
`*.spec.ts`, migration, ไฟล์ที่ generate อัตโนมัติ

> อย่าไล่ตาม % จนเขียนเทสขยะ เทสที่ไม่ assert อะไรเลยแต่ทำให้เลขสวยคือหนี้ ไม่ใช่ทรัพย์สิน
> เกณฑ์ที่ดีกว่าคือ **"ถ้าลบ logic บรรทัดนี้ทิ้ง มีเทสตัวไหน fail ไหม"**

---

## 4. เขียนเทสยังไงให้มีประโยชน์

### ต้องเทส
- business logic ทุกกิ่ง (เงื่อนไข, การคำนวณ, กติกาอนุมัติ)
- edge case: ค่าว่าง, null, 0, ค่าติดลบ, string ยาวเกิน, วันที่ข้ามเดือน/ปี, timezone
- error path และข้อความ error ที่ถูกต้อง
- สิทธิ์: role ที่ไม่มีสิทธิ์ต้องถูกปฏิเสธจริง
- บั๊กทุกตัวที่เคยเจอ (regression test)

### ไม่ต้องเทส
- library ของคนอื่น
- getter/setter ที่ไม่มี logic
- โค้ดที่ generate มา

### รูปแบบ
- ตั้งชื่อเทสเป็นประโยคที่อ่านแล้วรู้ว่าพังอะไร
  `it('ปฏิเสธการสมัครเมื่ออีเมลซ้ำ และตอบ code EMAIL_TAKEN')`
- โครง **Arrange → Act → Assert**
- 1 เทส 1 เรื่อง
- ห้ามเทสพึ่งลำดับการรัน หรือพึ่ง state จากเทสก่อนหน้า
- ใช้ factory/builder สร้างข้อมูลทดสอบ แทน fixture ยักษ์

---

## 5. Integration test กับ Postman

- เก็บที่ `docs/api/postman/`
  - `<project>.postman_collection.json`
  - `local.postman_environment.json`, `uat.postman_environment.json` (**ห้ามมี secret จริง**)
- ทุก endpoint ต้องมีอย่างน้อย: happy path, validation fail, unauthorized
- ใส่ test script ใน Postman ตรวจ status + โครง response + `error.code`
- รันทั้งชุดในเครื่องด้วย newman:
  ```
  npx newman run docs/api/postman/<project>.postman_collection.json \
    -e docs/api/postman/local.postman_environment.json
  ```
- ใช้ตัวแปร collection ส่ง token ต่อระหว่าง request (login แล้วเก็บ token)
- **รันทั้งชุดก่อนขึ้น uat ทุกครั้ง**

---

## 6. E2E ด้วย Playwright

ทำเฉพาะเส้นทางที่ "พังแล้วธุรกิจเจ็บ":
- สมัคร / เข้าสู่ระบบ / ออกจากระบบ
- flow หลักที่สร้างรายได้หรือเป็นหัวใจของระบบ
- flow การจ่ายเงิน (ถ้ามี)

ข้อควรทำ: ใช้ `data-testid` เฉพาะจุดที่หา element ด้วย role ไม่ได้,
รันบน docker compose ที่มีข้อมูล seed คงที่, เก็บ trace ไว้ตอน fail

---

## 7. คำสั่งที่ต้องมี

```
pnpm test              รันทั้งหมด
pnpm test:watch        ระหว่างพัฒนา
pnpm test:cov          + coverage report (lcov + text)
pnpm test:e2e          Playwright
pnpm test:api          newman
```

`coverage/lcov.info` คือไฟล์ที่ SonarQube ใช้ — ต้อง generate ก่อน scan เสมอ
