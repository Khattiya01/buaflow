# Deployment-Ready Contract (R3)

เอกสารนี้กำหนดสัญญาที่ Buaflow ใช้ส่งมอบ **Production Candidate** แยกจากรายละเอียดของ cloud provider และไม่สัญญาว่าจะ deploy แทนผู้ใช้

## คำรับรอง R3

แอปผ่าน R3 เมื่อบุคคลหรือระบบที่ไม่ใช่ผู้สร้างสามารถนำ artifact ไปยัง clean environment แล้ว:

1. ติดตั้ง dependency/build ได้จากไฟล์ที่ commit
2. กำหนด environment และ secrets จาก contract โดยไม่เปิด source เพื่อหา hidden value
3. สร้างหรือ migrate data store อย่างทำซ้ำได้
4. deploy ด้วย package/image/manifests ที่ส่งมอบ
5. ตรวจ health และ primary end-to-end flow ได้
6. เห็น telemetry ที่จำเป็นต่อการวินิจฉัย
7. rollback หรือใช้ recovery procedure ได้โดยไม่คิดวิธีใหม่ในเวลาฉุกเฉิน

ถ้าต้องแก้ source code หลังรับมอบจึงจะ deploy ได้ ให้ถือว่ายังไม่ผ่าน R3

## ขอบเขตความรับผิดชอบ

| Buaflow ต้องส่งมอบ | เจ้าของระบบ/platform ต้องกำหนด |
|---|---|
| code, lockfile, build definition | account/subscription และสิทธิ์ cloud |
| configuration schema และ secret names | secret values จริง |
| image/package + checksum/identity | registry/project/region/network parameters |
| deployment manifests หรือ documented target interface | capacity, budget และ production approval |
| migrations, rollback และ backup/restore procedure | production data window และ change approval |
| health/telemetry contract | monitoring backend, alert routing และ on-call owner |
| readiness evidence | การยอมรับ residual business/compliance risk |

## Control set ขั้นต่ำ

ตารางนี้ map กับ control ID ใน `readiness.json`

| Control | หลักฐานขั้นต่ำ | Conditional |
|---|---|:---:|
| `version-control` | commit/build identity | ไม่ |
| `start-path` | repeatable start or preview command | ไม่ |
| `primary-flow` | flow test/report | ไม่ |
| `build` | successful build command/report | ไม่ |
| `verification` | standard verify result | ไม่ |
| `requirements-traceability` | accepted requirement-to-proof map | ไม่ |
| `automated-tests` | automated test report | ไม่ |
| `persistence` | data lifecycle/persistence test | ใช่ |
| `access-control` | authn/authz/ownership tests | ใช่ |
| `ci` | clean-checkout CI run | ไม่ |
| `deployment-package` | image/package identity + manifest | ไม่ |
| `runtime-config` | config schema/example without live secrets | ไม่ |
| `database-migration` | forward/backward/compatibility evidence | ใช่ |
| `rollback` | rehearsed rollback/recovery report | ไม่ |
| `secrets-scan` | scanner result for relevant history/artifact | ไม่ |
| `dependency-scan` | dependency vulnerability report/policy | ไม่ |
| `security-controls` | threat boundary + applicable ASVS/control proof | ไม่ |
| `end-to-end-tests` | production-like E2E result | ไม่ |
| `observability` | log/metric/trace contract and smoke evidence | ไม่ |
| `health-check` | startup/readiness/liveness behavior as applicable | ไม่ |
| `performance` | profile-specific budget result | ไม่ |
| `accessibility` | UI accessibility result | ใช่ |
| `sbom` | CycloneDX/SPDX or equivalent tied to build | ไม่ |
| `runbook` | deploy, diagnose, incident and recovery steps | ไม่ |
| `clean-environment` | independent deployment rehearsal result | ไม่ |

## รูปแบบ evidence

Evidence ใน manifest มีชนิด:

- `command` — คำสั่งที่ใช้สร้างผล เช่น `npm test`; รุ่นแรกบันทึก declaration รุ่น fail-closed ต้องเก็บ exit code/time/output digest
- `file` — path ภายใน repository; validator ตรวจว่าไฟล์มีจริงและไม่ชี้ออกนอกรากโปรเจกต์
- `url` — CI/report URL ที่เข้าถึงตามนโยบายของทีม
- `manual` — human observation/approval; ใช้ประกอบได้ แต่ใช้เป็นหลักฐานเดียวกับ control ที่ต้อง machine-verifiable ไม่ได้

หลักฐานที่ดีต้องตอบได้ว่าใคร/อะไรสร้าง เมื่อไร จาก commit/build ไหน ใช้คำสั่ง/config อะไร และผลถูกแก้ภายหลังได้หรือไม่

## `not-applicable` และ waiver

`not-applicable` เป็นคำอธิบาย architecture ไม่ใช่ทางลัด เช่น static content site อาจไม่มี database migration แต่ต้องเขียนว่าไม่มี persistent data store ใดอยู่ใน runtime boundary

- ใช้ได้เฉพาะ control ที่ marked conditional
- ต้องมี rationale เฉพาะระบบ ความยาวและรายละเอียดพอให้ reviewer โต้แย้งได้
- profile/architecture เปลี่ยนแล้วต้องประเมินใหม่

Waiver หมายถึง control ใช้จริงแต่ยังไม่ผ่าน โดยมีผู้มีอำนาจยอมรับความเสี่ยง Waiver ต้องอยู่ใน risk record และ **ไม่เปลี่ยน R3 เป็น pass**; report อาจแสดง “conditionally accepted for deployment” เป็นการตัดสินของ owner แยกต่างหาก

## Portability rules

- application runtime ห้ามต้องเรียก Buaflow control plane เพื่อทำงาน เว้นแต่ผู้ใช้เลือก capability นั้นอย่างชัดเจน
- provider-specific manifest มีได้ แต่ต้องมี config boundary และ exportable source
- build ต้องอิง lockfile/digest; ห้ามพึ่ง latest แบบไม่ pin ใน production path
- secret ห้ามอยู่ใน source, image layer, example file หรือ evidence output
- migration ต้องแยกจาก process startup เมื่อความเสี่ยง concurrency/data loss มีนัยสำคัญ

## สิ่งที่ R3 ไม่รับรอง

- product-market fit หรือความถูกต้องของ business decision
- capacity สำหรับ traffic ที่ไม่มีการระบุเป้าหมาย
- compliance ที่ยังไม่ได้เลือก R4 pack
- uptime หลัง deploy ถ้า operator ไม่ทำตาม runbook/monitoring contract
- ช่องโหว่ที่ยังไม่รู้จักในอนาคต

## การบังคับด้วย Buaflow gate

ช่วงรับระบบเข้ามาใช้ให้คง `assuranceMode: "adoption"` เพื่อมองเห็น gap โดยยังไม่หยุดทุกการส่งงาน เมื่อจะอ้าง R3 ให้เปลี่ยนเป็น `production` ซึ่งบังคับว่า:

- `verifyCommand` ต้องมีและผ่าน
- dependency audit และ secret scan ต้องตั้ง `required`, executable ต้องมี และผลต้องผ่าน
- `readinessLevel` ต้องเป็น R3 หรือ R4
- readiness manifest ต้องผ่าน validator
- ห้ามใช้ `--docs-only` ซึ่งเป็น flag ที่ผู้เรียกเลือกเองเป็นทางข้ามด่าน

การเปลี่ยนกลับเป็น adoption คือการลดระดับ assurance และต้องเห็นได้ใน config review/ประวัติ Git
