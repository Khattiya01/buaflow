# Buaflow Product Roadmap

> เอกสารแม่สำหรับพัฒนา Buaflow จาก AI-native SDLC kit ไปเป็นระบบผลิตแอปที่ตรวจสอบได้
>
> **สถานะที่เครื่องอ่าน:** `development/state.json`  
> **ตรวจความสอดคล้อง:** `node scripts/check-roadmap.js`  
> **กติกาส่งต่องาน:** อ่านหัวข้อ “วิธีรับช่วงต่อ” ก่อนเริ่มแก้ทุกครั้ง

## 1. วิสัยทัศน์

Buaflow จะเป็น **open, model-agnostic application production system** ที่รับแนวคิดซึ่งยังไม่เป็นระเบียบ แล้วสร้าง repository ของ web app หรือ mobile app ที่อยู่ในระดับ **Production Candidate**: นำไปติดตั้งบนสภาพแวดล้อมเป้าหมายได้โดยไม่ต้องแก้ source code เหลือเพียงใส่ secret, environment value และค่าของ infrastructure เท่านั้น

Buaflow ไม่จำเป็นต้องเป็นผู้ให้บริการ deploy เอง แต่ต้องส่งมอบสิ่งต่อไปนี้ครบ:

- source code และ dependency ที่ pin แล้ว
- migration และ seed ที่ทำซ้ำได้
- container/build artifact และ deployment manifest ที่ตรวจได้
- test, security, performance และ accessibility evidence ตามชนิดแอป
- observability, health check, runbook และ rollback procedure
- SBOM/provenance และ readiness report ที่เครื่องอ่านได้

### North-star metric

> **สัดส่วนโปรเจกต์ที่ติดตั้งใน clean environment ได้โดยไม่แก้ source code โดยใส่เพียง secrets และ infrastructure parameters**

ตัวชี้วัดประกอบ:

- Time to First Runnable (TFR)
- Time to Production Candidate (TPC)
- จำนวนคำถามที่มนุษย์ต้องตอบ และ reviewer-minutes ต่อโปรเจกต์
- first-pass gate rate
- requirement-to-proof coverage
- rework, escaped defect และ security finding
- deployment handoff success rate
- ต้นทุนต่อ Production-Qualified App

## 2. ขอบเขตผลิตภัณฑ์

### Buaflow ต้องเป็นเจ้าของ

1. การแปลง idea เป็น product intent และ assumptions ที่ตรวจสอบได้
2. การเลือก application profile, stack pack และ capability pack
3. contract ระหว่าง requirement, architecture, API, data, UI และ test
4. การ orchestrate งานของ agent โดยไม่ผูกกับโมเดลเดียว
5. deterministic hooks, gates และ independent verification
6. การรวมหลักฐานและตัดสิน readiness level
7. artifact handoff ที่อยู่ใน Git และย้าย provider ได้
8. plugin/MCP permission, versioning และ conformance contract

### Buaflow จะไม่สร้างในช่วงนี้

- IDE หรือ visual page editor ของตัวเอง
- cloud hosting/control plane ของตัวเอง
- foundation model ของตัวเอง
- framework ใหม่ที่บังคับทุกแอป
- marketplace ก่อน plugin contract และ conformance test จะนิ่ง
- การรองรับทุก stack ตั้งแต่วันแรก

## 3. หลักการที่ห้ามเสียระหว่างพัฒนา

1. **เครื่องตัดสินสถานะ คนตัดสินความเสี่ยง** — completion/readiness มาจาก gate output; AI สรุปได้แต่ประกาศผ่านเองไม่ได้
2. **Markdown เป็นมุมมอง ไม่ใช่ฐานข้อมูล** — สถานะสำคัญต้องมี JSON/YAML schema และ generate มุมมองคนอ่านได้
3. **First Runnable ไม่เท่ากับ Production Candidate** — รายงานสองเวลานี้แยกกันเสมอ
4. **Model-agnostic core** — workflow contract เป็นกลาง; Claude/Codex/Copilot/Kiro เป็น adapter
5. **Golden paths ก่อน infinite flexibility** — ทำ stack ที่ผ่านการทดสอบลึก 2–3 แบบให้ดีกว่ารองรับกว้างแต่ไม่มีหลักฐาน
6. **Progressive rigor** — งานเล็กไม่แบกพิธีเท่า regulated system แต่ทุกระดับมีความหมายชัด
7. **Evidence over confidence** — ทุก claim สำคัญชี้กลับไปที่ command, file, report หรือ human approval
8. **Git-owned artifact** — output ต้องอยู่กับผู้ใช้และทำงานต่อได้แม้ vendor/tool หายไป
9. **Secure extension by default** — plugin และ MCP ใช้ least privilege, version pin และ audit log
10. **Brownfield เป็น first-class** — รับ output จาก generator อื่นหรือระบบเดิมผ่าน adoption/hardening track ได้

## 4. ภาพระบบเป้าหมาย

```text
Idea / existing repository
          │
          ▼
Intent Compiler ──► Product Graph + Assumptions + Decision Budget
          │
          ▼
Application Profile + Golden Stack Pack + Capability Packs
          │
          ▼
Contracts (requirements / data / API / UI / NFR / deployment)
          │
          ▼
Build Agents ──► isolated work ──► Convergence Engine
                                         │
                                         ▼
Independent Gates ──► Evidence Bundle ──► Readiness R0–R4
                                         │
                                         ▼
                       Git repo + package + manifests + runbook
```

## 5. Readiness model

| Level | ความหมาย | ใช้ตอบคำถาม |
|---|---|---|
| R0 Prototype | เปิดดูหรือทดลอง flow ได้ | แนวคิดสื่อสารได้หรือยัง |
| R1 Functional | happy path หลักทำงานและ build ได้ | ฟังก์ชันหลักมีจริงหรือยัง |
| R2 MVP | มี persistence, boundary, automated test และ CI ตาม profile | ให้กลุ่มผู้ใช้จำกัดทดลองได้หรือยัง |
| R3 Production Candidate | security, operations, migration, rollback, observability และ deploy artifact ครบ | ส่งให้ทีม platform ติดตั้งได้โดยไม่แก้ code หรือยัง |
| R4 Regulated | ผ่าน control pack ของอุตสาหกรรม/องค์กร | พร้อมกับข้อกำกับเฉพาะหรือยัง |

รายละเอียด normative อยู่ที่ `standards/readiness-levels.md` และ `standards/deployment-ready-contract.md`

## 6. Workstreams และลำดับทั้งหมด

`development/state.json` เป็น source of truth ของสถานะใน delivery horizon ปัจจุบัน ส่วนรายการนี้เป็น source of truth ของขอบเขตระยะยาวทั้งหมด เมื่อดึงงานระยะยาวเข้ามาเริ่ม ต้องเพิ่ม work item พร้อม acceptance/dependency ลง state ก่อนเสมอ

### Foundation — ทำให้การพัฒนา Buaflow ส่งต่อข้ามโมเดลได้

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| BF-001 | Product roadmap และ machine-readable state | เอกสารนี้ + state + validator |
| BF-002 | Readiness levels และ Deployment-Ready Contract | นิยาม R0–R4 ที่ไม่กำกวม |
| BF-003 | Readiness manifest validator v1 | ตรวจ claim/evidence แบบ deterministic |
| BF-004 | Core regression tests | test scripts, hooks, config loader และ gates |
| BF-005 | Fail-closed production mode | production mode ห้าม skip verify/scanner ที่ required |
| BF-006 | Canonical artifact schemas | schema versioning/migration policy สำหรับ state, intent, plan, proof |
| BF-007 | CLI shell | `buaflow init`, `doctor`, `verify`, `readiness`, `resume` |
| BF-008 | CI ของ kit เอง | workflow ที่รัน `npm run check` ทุก push/PR — gate/validator/adapter drift ของ Buaflow ถูกบังคับด้วยเครื่อง ไม่ใช่ด้วยความจำของคนรัน |

### Discovery and Validation — จับปัญหาให้ถูกก่อนเข้า Intent Compiler

> เพิ่มเข้ามาหลังทบทวนงานวิจัยภายนอก "AI-Native SDLC + Agentic Engineering" (22 กันยายน 2026) — ดู D-004
> Phase 1/Phase A เดิมเก็บ requirement/technical inventory แต่ไม่มีชั้นหลักฐาน/pain point ก่อนหน้านั้น workstream นี้เติมช่องว่างนั้น
> เป็น **ทางเลือกตามขนาดงาน** ไม่ใช่ของบังคับทุก `/intent` (ตาม principle "Progressive rigor" ข้อ 3)

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| DV-001 | Evidence และ pain-point discovery layer | evidence register, as-is/to-be process, pain-point register templates + Phase 1/Phase A เพิ่มขั้น Operational Discovery แบบ opt-in |
| DV-002 | Traceability ย้อนขึ้นไปถึง evidence/pain point | เชื่อม pain point → feature/intent เข้ากับ docs-lint แบบ warn ไม่ใช่ fail ให้ยังใช้ได้กับงานที่ไม่ผ่านชั้นนี้ |
| DV-003 | Business outcome review หลัง release | แยกจาก config-learning loop เดิมของ Phase 8 — วัดว่า pain point ถูกแก้จริงไหม ไม่ใช่แค่ config ปรับถูก |

### Intent Compiler — จาก idea ไปเป็น product graph

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| IC-001 | Product graph schema | actors, outcomes, capabilities, rules, entities, integrations, NFR, risk, assumptions, success, out-of-scope |
| IC-002 | Smart clarification + decision budget | ถามเฉพาะเรื่องที่เปลี่ยน architecture/security/cost materially |
| IC-003 | Idea intake adapters | plain text, interview, existing docs, issue tracker, generator output |
| IC-004 | Assumption/risk ledger | ทุกการเดามี owner, impact, expiry และ verification path |
| IC-005 | Intent-to-requirement compiler | EARS AC + NFR + traceability IDs |
| IC-006 | Change impact engine | intent เปลี่ยนแล้วชี้ artifact/contract/test ที่ต้องทบทวน |

### Profiles and Packs — จำกัดทางเลือกเพื่อให้ผลิตได้เร็วและเชื่อถือได้

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| PP-001 | Application profile contract | content, internal CRUD, SaaS, marketplace, booking, mobile/offline, AI app |
| PP-002 | Stack pack contract | architecture, generator, conventions, verification, upgrade and deploy output |
| PP-003 | Web golden stack #1 | เช่น Next.js + PostgreSQL พร้อม R3 reference app |
| PP-004 | API/web golden stack #2 | เช่น React + FastAPI + PostgreSQL พร้อม R3 reference app |
| PP-005 | Mobile golden stack | Expo หรือ Flutter + API + sync/offline contract |
| ~~PP-006~~ | ~~Capability pack contract~~ | **dropped (D-013)** — PP-002 รวม stack/capability เป็นสัญญาเดียวตั้งแต่แรก และ PP-010 เขียนใหม่เป็น v2 แล้ว ไม่มีสัญญาแยกให้เขียนอีก |
| PP-007 | Core capability packs | auth, RBAC/ownership, DB, storage, notification, background jobs, audit log |
| PP-008 | Commercial capability packs | payment, subscription, search, analytics, AI/RAG, i18n |
| PP-009 | Thailand packs | PDPA, PromptPay/payment providers, LINE integration, Thai localization |
| PP-011 | ผูก capability pack เข้ากับ reference app ที่พิสูจน์มันจริง | pack ที่ยังไม่มีอะไรพิสูจน์ต้อง "มองเห็นได้ด้วยเครื่อง" ไม่ใช่เขียนไว้ในเอกสารเฉย ๆ |
| PP-010 | Pack contract v2: recipe + assertion | pack ประกาศ "คำสั่ง CLI ของเจ้าของ framework ที่ต้องรัน (ไม่ pin เวอร์ชัน) + config + verification + ไฟล์ที่ต้องมีอยู่จริงหลังทำเสร็จ" แทนการเป็น template — ดู D-011 |

> **ทิศทางของ pack เปลี่ยนที่ D-011 (23 กันยายน 2026)** — Buaflow จะ **ไม่** สร้าง generator ที่ stamp โค้ดออกมาจาก pack
> template generator แช่แข็ง dependency ไว้ที่วันที่เขียน จึงผลิต staleness ทุกครั้งที่รัน และขัดกับ `phases/06-scaffold.md`
> ที่สั่งไว้ตั้งแต่ต้นว่าให้ใช้ CLI ของเจ้าของ framework เสมอและเช็กเวอร์ชันจริงก่อนติดตั้ง
> สินทรัพย์ที่ทนต่อเวลาคือ **ชุด assertion และ verification** ไม่ใช่โค้ด — AI รุ่นไหนก็ได้เป็นคนลงมือ Buaflow เป็นคนพิสูจน์
> ผลที่ตามมา: PP-006/PP-008/PP-009 ต้องทบทวนให้อยู่ในรูป recipe + assertion ก่อนลงมือ โดยเฉพาะ payment/subscription/PDPA/PromptPay/LINE
> ซึ่งเป็นเนื้อหาที่เก่าเร็วที่สุดในแผนทั้งหมด และไม่ควรถูกแช่ไว้เป็นโค้ดตัวอย่าง

### Build and Convergence — ให้หลาย agent ทำเร็วโดยไม่ประกอบกันแล้วพัง

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| BC-001 | Agent task I/O contract | input/output schema, allowed scope, proof, retry/abort rules |
| BC-002 | Work isolation adapter | branch/worktree/container strategy ตาม environment |
| BC-003 | Parallel scheduler | dependency graph, concurrency budget, conflict prevention |
| BC-004 | Convergence graph | requirement ↔ design ↔ data/API ↔ UI ↔ tests ↔ deployment |
| BC-005 | Contract mismatch detectors | schema/API/migration/UI/requirement drift checks |
| BC-006 | Independent verifier role | verifier ไม่ใช้ self-report จาก builder เป็นหลักฐานเดียว |
| BC-007 | Repair loop with limits | classify failure, retry budget, escalate with minimal question |

> เมื่อดึง BC-* เข้ามาทำจริงที่ M3 ให้อ้างอิงรายละเอียด agent contract (permission/write-scope/budget/stop_when),
> autonomy/risk tier (A0–A4) และ agent-run-record format จากงานวิจัย "AI-Native SDLC + Agentic Engineering"
> ที่ทบทวนไว้ใน D-004 — เนื้อหาตรงกับขอบเขต BC-001/BC-002/BC-006 อยู่แล้ว ไม่ต้องคิดใหม่ แค่ทำให้ concrete ขึ้น

### Evidence and Production Qualification

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| EP-001 | Evidence bundle format | `readiness.json` + report index + immutable run metadata |
| EP-002 | Requirement coverage | **เหลือเฉพาะ approved exception** (owner/reason/risk/expiry ที่หมดอายุแล้วทำให้ gate ตก) — ส่วน coverage เสร็จแล้วผ่าน requirements-traceability + docs-lint + DV-002 |
| EP-003 | Security baseline | **เหลือเฉพาะ ASVS mapping + threat boundary ที่เป็น artifact** — ส่วน scan เสร็จและถูกบังคับใน production gate แล้ว |
| EP-004 | Supply-chain evidence | **เหลือ licenses + provenance + checksums** — lockfile และ SBOM (CycloneDX จริงทั้ง 3 แอป) เสร็จแล้ว · evidence/ci-run.json จาก EP-011 เป็นฐานของ provenance ได้เลย |
| EP-005 | Operational readiness | **เหลือ restore rehearsal + incident hooks ที่เป็นสัญญา** — health/logs/runbook เสร็จและถูกบังคับที่ R3 แล้ว · ลอกแบบจาก EP-006 ได้ |
| EP-006 | Migration/rollback qualification | ✅ **done (บันทึกย้อนหลังที่ D-013)** — ส่งมอบใน PP-003 และขยายผลโดย PP-004/PP-005 |
| EP-007 | Performance/accessibility budgets | **เหลือเฉพาะ threshold ที่มาจาก profile** — การวัดเสร็จแล้ว แต่ application-profile.schema.json ยังไม่มี threshold เลย ทุก budget จึงเป็นเลขที่แต่ละแอปเลือกเอง |
| EP-008 | Deployable handoff | ✅ **done (บันทึกย้อนหลังที่ D-013)** — ขอบเขตที่ rehearsal ประกาศไว้เองคือ docker build/boot จากศูนย์ ไม่ใช่ fresh git clone ส่วนที่เหลือเป็นของ EV-009 |
| EP-009 | R3 qualification gate | ✅ **done (บันทึกย้อนหลังที่ D-013)** — BF-005 (fail-closed) + readiness.js + EP-001 (report) ครอบไว้ครบแล้ว |
| EP-011 | หลักฐานที่เครื่องตรวจได้สำหรับ control พื้นฐาน | ทุก control ต้องมี artifact ที่ตรวจได้จาก repository เอง ไม่ใช่มีแค่คำสั่งหรือ URL ที่ต้องเชื่อ |
| EP-010 | Evidence freshness | control `evidence-freshness` + scheduled re-verify — หลักฐานที่เก่าเกินหน้าต่างที่ประกาศไว้ หรือผูกกับ commit ที่ไม่ใช่บรรพบุรุษของ HEAD จะเป็น `expired` ไม่ใช่ `pass` |

### Model and Tool Independence

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| MT-001 | Canonical workflow protocol | vendor-neutral prompts/contracts/events |
| MT-002 | Claude adapter | skills/hooks/settings จาก core เดียวกัน |
| MT-003 | Codex adapter | AGENTS/skills/automation จาก core เดียวกัน |
| MT-004 | Copilot/Kiro adapters | instruction/spec/hook mapping พร้อม capability matrix |
| ~~MT-005~~ | ~~Model capability registry~~ | **dropped (D-013)** — ตารางที่ค่ายโมเดลทำให้ผิดเองทุกเดือน และผิดแบบเงียบ ๆ ความต้องการที่ทนเวลาคือ MT-007 |
| ~~MT-006~~ | ~~Eval-driven model routing~~ | **dropped (D-013)** — ต้องมี EV-004 และ EV-009 ก่อน ไม่งั้นคือเลือกโมเดลจากตัวเลขที่ reference app ของเราเองผลิต · เปิดใหม่ได้เมื่อมีข้อมูลจริง |
| MT-007 | Graceful degradation | ไม่มี MCP/agent feature บางตัวแล้วยังทำงานแบบ manual/serial ได้ |

### Plugin and MCP Ecosystem

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| PE-001 | Plugin manifest v1 | id/version/compatibility/capability/permission/input/output/verification |
| PE-002 | Lockfile and resolver | pin version, checksum, dependency conflict, reproducible install |
| PE-003 | Permission model | filesystem/network/secret/tool scope + explicit consent |
| PE-004 | MCP gateway policy | server trust, OAuth/token boundary, tool allowlist, audit event |
| PE-005 | Plugin conformance kit | schema, fixture, security and lifecycle tests |
| PE-006 | Trusted tiers/signing | local, verified publisher, signed/trusted distribution |
| PE-007 | Catalog v1 | discovery metadata หลัง contract/conformance นิ่งแล้ว |

### Evaluation, Learning and Product Operations

| ID | งาน | ผลลัพธ์ |
|---|---|---|
| EV-001 | Reference app matrix | greenfield/brownfield, web/mobile, simple/complex |
| EV-002 | Production-Qualified App benchmark | วัด functional + engineering + operations ไม่ใช่ screenshot อย่างเดียว |
| EV-003 | Failure taxonomy | spec, implementation, integration, security, operations, tool failure |
| EV-004 | Reproducible eval harness | fixed tasks, seeds where possible, artifact retention, score rubric |
| ~~EV-005~~ | ~~Opt-in telemetry~~ | **dropped (D-013)** — ยังไม่มีผู้ใช้ให้เก็บ เหลือแต่เราวัดตัวเอง ซึ่ง north-star metric ก็ติดปัญหานี้อยู่แล้ว |
| EV-006 | Feedback-to-change loop | evidence → proposal → eval → rollout/rollback |
| EV-007 | Compatibility and release policy | semver, migration, deprecation, support matrix |
| EV-008 | Documentation/onboarding | quickstart, workshop, troubleshooting และ complete sample |
| EV-009 | Trial บนโปรเจกต์ที่ Buaflow ไม่ได้เขียนเอง | north-star metric ได้ตัวหารที่ไม่ใช่ reference app ของตัวเอง พร้อมตัวเลขคำถาม/เวลา/จุดที่ kit ผิดหรือเงียบ |

## 7. Milestones

> **ปรับนิยาม M3–M6 เมื่อ 23 กันยายน 2026 (D-013)** — นิยามเดิมของ M3 และ M4 ขัดกับการตัดสินใจที่บันทึกไว้แล้ว
> จนปิดไม่ได้ทั้งคู่: M3 ต้องการ parallel scheduler ที่ D-011 จงใจพักไว้ ส่วน M4 ต้องการ adapter สามค่าย
> และ plugin/MCP ecosystem ซึ่งกฎข้อ 9.4 ของเอกสารนี้เองห้ามเปิดก่อน contract ด้านล่างนิ่ง
> milestone ที่ปิดไม่ได้ตามนิยามของตัวเองไม่ได้วัดอะไรเลย

### M0 — Verifiable Foundation ✅

เสร็จเมื่อ BF-001 ถึง BF-005 ผ่าน เป้าคือหยุดการใช้ Markdown status แบบเชื่อด้วยใจ และทำให้คำว่า R3 มี contract ที่ตรวจได้

### M1 — One Golden Path to R3 ✅

เสร็จเมื่อ CLI ขั้นต้น, product graph v1, profile/pack contract และ web reference app หนึ่งตัวผ่าน R3 ใน clean environment

### M2 — Repeatable Web Production ✅

เสร็จเมื่อมี web stack อย่างน้อยสองแบบ, core capability packs, convergence check ชุดแรก และ evidence bundle ครบ

### M3 — Mobile + Independent Verification ✅

เสร็จเมื่อ mobile reference app ผ่าน R3 และ **independent verifier จับ seeded defects ได้ตาม threshold ที่ประกาศไว้**

> เดิมข้อนี้ต้องการ parallel scheduler ด้วย ตัดออกตาม D-011: verifier ให้คุณค่าด้วย agent ตัวเดียว
> ส่วน BC-001/002/003 รองรับ parallel build ที่ยังไม่มีใครรัน การผูก milestone ไว้กับ infrastructure
> ที่จงใจไม่ทำ แปลว่า milestone นั้นจะไม่มีวันปิด

### M4 — Evidence Maturity (เป้าหมายปัจจุบัน)

เสร็จเมื่อคำว่า "พิสูจน์แล้ว" แข็งแรงพอจะทนการถูกตรวจซ้ำ:

- **failure taxonomy** ที่ตั้งอยู่บนความล้มเหลวที่เกิดขึ้นจริงในที่นี่ ไม่ใช่หมวดหมู่ที่ลอกมา (EV-003)
- **release policy ของ kit เอง** — เลขเวอร์ชันของ Buaflow ต้องแปลว่าอะไรสักอย่างกับผู้ใช้ (EV-007)
- **change impact + convergence graph** — รู้ว่าอะไรกระทบเมื่อของเปลี่ยน และอะไรไม่เชื่อมกับอะไรเลย (IC-006, BC-004)
- **ส่วนที่เหลือจริงของ EP** หลัง audit: exception ที่มีวันหมดอายุ, ASVS mapping, provenance/licenses,
  restore rehearsal, budget ที่มาจาก profile (EP-002, EP-003, EP-004, EP-005, EP-007)

### M5 — Proven Outside

เสร็จเมื่อ Buaflow ถูกใช้กับโปรเจกต์ที่ **ไม่ได้เขียนเอง** และมีตัวเลขจากของจริง:
EV-009 (trial แรก), EV-004 (eval harness ที่ทำซ้ำได้), EV-002 (Production-Qualified App benchmark), EV-008 (onboarding)

> north-star metric วันนี้มีตัวหารเป็น reference app ที่ Buaflow เขียนเอง ตรวจเอง ให้คะแนนเอง
> M5 คือ milestone ที่ทำให้ตัวเลขนั้นเริ่มมีความหมาย และเป็นเงื่อนไขเปิดของ M6

### M6 — Open Ecosystem (ยังไม่เปิด)

เดิมคือ M4 เสร็จเมื่อ adapter อย่างน้อยสามค่าย, plugin/MCP permission model, conformance kit และ catalog รุ่นแรกทำงานได้

> **เงื่อนไขเปิดที่ชัดเจน: M5 ต้องมีข้อมูลจากผู้ใช้จริงก่อน** ตามกฎข้อ 9.4 ของเอกสารนี้เอง
> ("ไม่สร้าง ecosystem surface ก่อน contract ด้านล่างจะนิ่ง") การเปิด PE-001…007 ตอนนี้คือการสร้าง
> marketplace ให้ contract ที่ยังไม่เคยถูกใครนอกจากเราใช้

### M7 — Domain Advantage

เสร็จเมื่อ Thailand/domain packs (PP-008, PP-009) อยู่ในรูป recipe + assertion ตาม D-011 และมีข้อมูลจากโปรเจกต์จริงพอให้ roadmap อิง evidence

## 8. ลำดับ 12–24 เดือนโดยประมาณ

| ช่วง | สิ่งที่ให้ความสำคัญ | สิ่งที่ยังไม่เปิด |
|---|---|---|
| 0–3 เดือน | M0, CLI shell, schema, R3 reference web app | marketplace, broad stack support |
| 3–6 เดือน | intent compiler v1, profiles, 2–3 packs, convergence | fully autonomous parallel agents |
| 6–12 เดือน | mobile, evidence bundle, adapters, plugin SDK | hosted control plane |
| 12–24 เดือน | conformance/catalog, domain packs, telemetry/evals, model routing | ลงทุนเรื่อง IDE/hosting เว้นแต่ข้อมูลพิสูจน์ความจำเป็น |

เวลานี้เป็น planning horizon ไม่ใช่ commitment; dependency และ acceptance criteria ใน state สำคัญกว่าวันปฏิทิน

## 9. กติกาการเลือกงานรอบถัดไป

เลือกรายการที่:

1. dependency เป็น `done` ทั้งหมด
2. ลดความเสี่ยงต่อ north-star metric มากที่สุด
3. มี acceptance criteria ที่พิสูจน์ใน repository ได้
4. ไม่สร้าง ecosystem surface ก่อน contract ด้านล่างจะนิ่ง
5. จำกัด WIP: `in_progress` ไม่เกิน 2 งาน และต้องอยู่ milestone ปัจจุบัน เว้นแต่บันทึกเหตุผล

ห้ามเปลี่ยนงานเป็น `done` จากการเขียนเอกสารอย่างเดียว ถ้า acceptance criteria ระบุ code/test/evidence

## 10. วิธีรับช่วงต่อ (สำหรับคนหรือ AI ทุกตัว)

เริ่ม session ใหม่ด้วยลำดับนี้:

1. อ่าน `BUAFLOW_PRODUCT_ROADMAP.md`
2. อ่าน `development/state.json`
3. รัน `node scripts/check-roadmap.js`
4. ดู `current.focus` และงาน `in_progress`
5. อ่านไฟล์ที่อยู่ใน `artifacts` ของงานนั้นและ `git diff` ก่อนแก้
6. ทำ acceptance criteria ทีละข้อ พร้อม test/evidence
7. อัปเดต `development/state.json` ใน commit/การเปลี่ยนแปลงเดียวกับงาน
8. รัน validation ของงาน + `node scripts/check-roadmap.js`
9. เขียน `lastSession.summary`, `lastSession.next` และ `lastSession.verifiedAt`

ถ้าทิศทางเปลี่ยน:

- ห้ามเขียนทับเหตุผลเดิมแบบเงียบ ๆ
- เพิ่มรายการใน `decisions` ของ state พร้อมวันที่ เหตุผล และผลกระทบ
- ปรับ roadmap เมื่อขอบเขตผลิตภัณฑ์เปลี่ยนจริง ไม่ใช่เพราะ implementation detail

## 11. Definition of done ของแต่ละ work item

งานหนึ่งรายการจะ `done` ได้เมื่อ:

- acceptance criteria ทุกข้อเป็นจริงและมี artifact/evidence อ้างอิง
- tests ที่เกี่ยวข้องผ่านและบันทึก command ใน `verification`
- เอกสารผู้ใช้และ upgrade note ถูกปรับถ้าพฤติกรรม public เปลี่ยน
- ไม่มี placeholder หรือ hidden manual step ที่ทำให้ claim หลักไม่จริง
- state ผ่าน `node scripts/check-roadmap.js`
- next item รับช่วงต่อได้โดยไม่ต้องเดาประวัติจากบทสนทนา

## 12. Research baseline ที่กำหนดทิศทางนี้

- [DORA 2025](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report): AI เป็นตัวขยายคุณภาพของระบบเดิม จึงต้องลงทุน platform, testing และ feedback loop
- [METR early-2025 study](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf): ความเร็วที่รู้สึกได้ไม่เท่ากับเวลาจริงใน mature codebase จึงต้องวัด end-to-end และ rework
- [SWE-WebDevBench](https://arxiv.org/abs/2605.04637): spec/integration/production readiness ยังเป็นหน้าผาหลักของระบบสร้างแอป
- [GitHub Spec Kit](https://github.com/github/spec-kit/blob/main/docs/index.md), [OpenSpec](https://github.com/Fission-AI/openspec), [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) และ [Kiro](https://kiro.dev/docs/): spec, adaptive rigor, role separation และ extensibility มีคุณค่า แต่ต้องมี deterministic enforcement
- [v0](https://v0.dev/docs/full-stack-apps), [Bolt](https://support.bolt.new/building/intro-bolt) และ [Replit](https://docs.replit.com/replitai/assistant/): UX จาก idea ไป first runnable เร็วมาก; จุดต่างของ Buaflow ต้องเป็น qualification, hardening และ portable handoff
- [MCP](https://modelcontextprotocol.io/specification/draft/server/index): เหมาะกับ tool/context integration แต่ไม่แทน runtime SDK หรือ application integration contract
- [OWASP ASVS](https://owasp.org/projects/asvs), [CycloneDX](https://www.cyclonedx.org/) และ [SLSA](https://slsa.dev/spec/v1.2/): ใช้เป็นฐาน security/supply-chain evidence แทนการคิด checklist เองทั้งหมด

รายละเอียดการเปรียบเทียบเดิมอยู่ใน `AI_SDLC_COMPARISON.md`
