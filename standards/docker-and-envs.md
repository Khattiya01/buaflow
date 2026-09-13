# Docker และการจัดการ Environment

> **ยังไม่ตัดสินใจว่าจะ deploy ที่ไหน** จึงออกแบบให้เป็น **container-first ไม่ผูก vendor**
> ทำตามนี้แล้วย้ายไป VPS / Kubernetes / Cloud Run ทีหลังได้โดยไม่ต้องรื้อ

---

## 1. กฎ container-first (ทำตั้งแต่วันแรก)

1. **config มาจาก env var ล้วน** ไม่มีไฟล์ config ที่ต่างกันตาม env ฝังใน image
2. **ไม่เขียนไฟล์ถาวรลง local disk** ของ container (ไฟล์อัปโหลดไปเก็บที่ object storage หรือ volume ที่ประกาศไว้)
3. **log ออก stdout/stderr** เป็น JSON ไม่เขียนลงไฟล์เอง
4. **มี /health และ /ready** ตั้งแต่แรก
5. **stateless** ไม่เก็บ session ในหน่วยความจำของ process (ใช้ cookie / DB / redis)
6. **ปิดตัวอย่างสุภาพ** รับ SIGTERM แล้วปิด connection ให้เรียบร้อย
7. **build ครั้งเดียว ใช้ทุก env** เปลี่ยนแค่ env var
   (ของที่เทสบน uat ต้องเป็น image เดียวกับที่ขึ้น prd ไม่ใช่ build ใหม่)

---

## 2. Dockerfile แบบ multi-stage

โครงที่ต้องมี:

```
deps    ติดตั้ง dependency (จัด cache layer นี้ให้ดี)
build   build production
runtime image เล็ก (alpine/slim) copy เฉพาะ artifact รันด้วย non-root user
```

- pin เวอร์ชัน base image (node:22-alpine ไม่ใช่ node:latest)
- ห้ามรันด้วย root
- มี .dockerignore (node_modules, .next, .git, .env*, coverage, docs)
- ใส่ HEALTHCHECK
- **ห้าม COPY ไฟล์ .env เข้า image**

---

## 3. docker-compose.dev.yml

service ที่ควรมีตอนพัฒนา:

| service | ทำอะไร |
|---|---|
| app (และ api ถ้าแยก) | แอปเรา mount source เพื่อ hot reload |
| db | PostgreSQL |
| adminer หรือ pgadmin | ส่องฐานข้อมูล |
| mailpit | รับอีเมลทดสอบแทนการส่งจริง |
| sonarqube + sonar-db | สแกนคุณภาพโค้ด (ดู sonarqube-local.md) |
| minio | จำลอง S3 ในเครื่อง ถ้ามีระบบอัปโหลดไฟล์ |

ทุก service ตั้ง healthcheck และใช้ depends_on แบบ service_healthy
เพื่อไม่ให้แอปสตาร์ทก่อน DB พร้อม

---

## 4. Environment: local / uat / prd

| | local | uat | prd |
|---|---|---|---|
| ใครใช้ | dev | ผู้ทดสอบ/ลูกค้า | ผู้ใช้จริง |
| ข้อมูล | seed/mock | คล้ายจริงแต่ **ปกปิด PII แล้ว** | จริง |
| อีเมล | mailpit | ส่งจริงเฉพาะ whitelist | ส่งจริง |
| การจ่ายเงิน | mock | sandbox ของผู้ให้บริการ | จริง |
| /docs (API docs) | เปิด | เปิดแต่ใส่ auth | **ปิด** |
| log level | debug | info | info/warn |
| source map | เปิด | เปิด | ปิดหรือเก็บเป็น private |
| robots | noindex | **noindex** | index |

**ข้อที่พลาดกันบ่อย:**
- uat ต้อง noindex ไม่งั้น Google เก็บหน้า uat ไปแสดงในผลค้นหา
- uat ห้ามส่งอีเมล/SMS ไปหาลูกค้าจริง ต้องมี whitelist
- ถ้าเอาข้อมูลจาก prd มาใส่ uat **ต้อง mask PII ก่อนเสมอ**

---

## 5. Secrets

- ทุก secret มาจาก env var **ห้ามอยู่ใน git ทุกกรณี**
- .env.example มีครบทุกตัวแปร แต่ **ไม่มีค่าจริง** พร้อมคอมเมนต์ว่าแต่ละตัวคืออะไร
- .gitignore ต้องมี .env และ .env.* โดยยกเว้น .env.example
- แยก secret ต่อ env ห้ามใช้ค่าเดียวกันข้าม env
- มีแผน rotate: ถ้า key หลุด ต้องเปลี่ยนได้โดยไม่ต้อง deploy ใหม่ทั้งระบบ
- ก่อน commit ครั้งแรก สแกนว่าไม่มี secret หลุด (เช่นด้วย gitleaks)

---

## 6. Database migration ข้าม env

- **ห้ามใช้ prisma db push กับ uat/prd** ใช้ prisma migrate deploy เท่านั้น
- **backup ก่อนรัน migration บน prd ทุกครั้ง** และต้องเคยซ้อม restore มาแล้วอย่างน้อย 1 ครั้ง
- migration ที่ทำลายข้อมูลได้ (drop/rename column) ต้องทำแบบ **expand แล้วค่อย contract**:
  1. รอบที่ 1 เพิ่มคอลัมน์ใหม่ โดยของเก่ายังอยู่ (โค้ดเขียนทั้งสองที่)
  2. ย้ายข้อมูล
  3. รอบที่ 2 โค้ดอ่านของใหม่อย่างเดียว
  4. รอบที่ 3 ลบของเก่า

  ทำแบบนี้แล้ว rollback ได้ทุกจุด

---

## 7. คำสั่งที่ควรมี

```
pnpm docker:dev     ยกทุก service ขึ้น
pnpm docker:down    ปิด
pnpm docker:logs    ดู log
pnpm docker:reset   ล้างข้อมูลแล้วยกใหม่ (ต้องถามผู้ใช้ก่อนรันเสมอ)
```

---

## 8. เมื่อไหร่ค่อยตัดสินใจเรื่อง deploy target

ตัดสินใจได้ตอนใกล้ปิด **M2** (ก่อนขึ้น uat จริง) โดยดูจาก:
- ทราฟฟิกจริงที่คาดการณ์ได้แล้ว
- ข้อจำกัดเรื่องข้อมูล (ต้องอยู่ในประเทศไหม ต้อง on-prem ไหม)
- งบและคนที่จะดูแลระบบ

เมื่อตัดสินใจแล้ว เขียน ADR ใหม่ที่ supersede ADR-0007 (deployment-deferred)
