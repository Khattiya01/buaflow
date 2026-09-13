# SonarQube — สแกนเองในเครื่อง (manual)

> **กติกาที่ตกลงไว้: AI ไม่รัน scan เอง**
> AI มีหน้าที่เตรียม config, เขียนคำสั่งไว้ให้ และ **แก้ issue ตามผลที่ผู้ใช้เอามาให้**

---

## 1. รัน SonarQube ด้วย Docker

ใส่ service นี้ใน `docker-compose.dev.yml`:

```yaml
services:
  sonarqube:
    image: sonarqube:community
    depends_on: [sonar-db]
    ports: ["9000:9000"]
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://sonar-db:5432/sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: sonar
      SONAR_ES_BOOTSTRAP_CHECKS_DISABLE: "true"
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_logs:/opt/sonarqube/logs
      - sonarqube_extensions:/opt/sonarqube/extensions

  sonar-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: sonar
      POSTGRES_DB: sonar
    volumes:
      - sonar_db:/var/lib/postgresql/data

volumes:
  sonarqube_data:
  sonarqube_logs:
  sonarqube_extensions:
  sonar_db:
```

ครั้งแรก: เปิด http://localhost:9000 → ล็อกอิน `admin` / `admin` → เปลี่ยนรหัส →
สร้าง project แบบ manual → สร้าง **token** เก็บใส่ `.env.local` เป็น `SONAR_TOKEN`
(**ห้าม commit token**)

> ถ้า SonarQube ไม่ขึ้น ให้ดู log ก่อน — สาเหตุที่พบบ่อยคือ Elasticsearch ต้องการ
> `vm.max_map_count` สูงพอ (บน Windows/WSL ปรับใน WSL) และ RAM ควรมีอย่างน้อย 2 GB ให้ container

---

## 2. `sonar-project.properties`

```properties
sonar.projectKey=<project-key>
sonar.projectName=<Project Name>
sonar.sources=apps,packages
sonar.tests=apps,packages
sonar.test.inclusions=**/*.spec.ts,**/*.spec.tsx,**/*.test.ts,**/*.test.tsx
sonar.sourceEncoding=UTF-8

# coverage (ใช้ key นี้ทั้ง JS และ TS — sonar.typescript.lcov.reportPaths เลิกใช้แล้ว)
sonar.javascript.lcov.reportPaths=coverage/lcov.info

sonar.exclusions=**/node_modules/**,**/.next/**,**/dist/**,**/build/**,\
**/components/ui/**,**/*.config.*,**/prisma/migrations/**,**/messages/**
sonar.coverage.exclusions=**/*.spec.*,**/*.test.*,**/*.config.*,\
**/components/ui/**,**/prisma/**,**/e2e/**
```

> `components/ui/**` คือ component ที่ shadcn generate มา — ไม่ใช่โค้ดเรา ไม่ควรถูกนับ

---

## 3. ขั้นตอนสแกน (ผู้ใช้รันเอง)

```bash
# 1) สร้าง coverage ก่อนเสมอ
pnpm test:cov

# 2) สแกน
docker run --rm --network host \
  -e SONAR_HOST_URL="http://localhost:9000" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$PWD:/usr/src" \
  sonarsource/sonar-scanner-cli
```

หรือใส่เป็น npm script:
```json
"sonar": "pnpm test:cov && docker run --rm --network host -e SONAR_HOST_URL=http://localhost:9000 -e SONAR_TOKEN=$SONAR_TOKEN -v \"$PWD:/usr/src\" sonarsource/sonar-scanner-cli"
```

> บน Windows ถ้า `--network host` ไม่ทำงาน ให้ใช้ `-e SONAR_HOST_URL=http://host.docker.internal:9000` แทน

---

## 4. Quality Gate ที่ใช้

เริ่มจาก **Sonar way** แล้วปรับข้อ coverage ให้ตรงกับที่ตกลงไว้:

| เงื่อนไขบน **new code** | เกณฑ์ |
|---|---|
| Coverage | ≥ 80% |
| Duplicated lines | ≤ 3% |
| Maintainability rating | A |
| Reliability rating | A |
| Security rating | A |
| Security hotspots reviewed | 100% |

> ใช้เกณฑ์กับ **new code** ไม่ใช่โค้ดทั้งหมด — โค้ดเก่าค่อยๆ ปรับ ไม่ต้องหยุดทุกอย่างมาไล่แก้

---

## 5. เอาผล scan มาให้ AI แก้ยังไง

วางให้ AI แบบนี้จะทำงานได้ทันที:
```
ผล Sonar รอบนี้ไม่ผ่าน:
- Coverage on new code 64% (ต้อง 80%)
- 3 Code Smells: <ไฟล์:บรรทัด — ข้อความ>
- 1 Security Hotspot: <ไฟล์:บรรทัด — ข้อความ>
ช่วยแก้ทีละข้อ เริ่มจาก security ก่อน
```

**ลำดับที่ AI ต้องแก้:** Security Hotspot / Vulnerability → Bug → Code Smell → Coverage → Duplication

**ข้อห้าม:** ห้ามแก้ปัญหาด้วยการเพิ่ม exclusion หรือใส่ `// NOSONAR`
เพื่อให้ผ่าน gate — ถ้าจะยกเว้นจริงต้องมีเหตุผลและผู้ใช้อนุมัติ

---

## 6. รันเมื่อไหร่
- ก่อนปิด milestone
- ก่อนขึ้น uat ทุกครั้ง
- อย่างน้อยสัปดาห์ละครั้ง
- หลัง refactor ก้อนใหญ่
