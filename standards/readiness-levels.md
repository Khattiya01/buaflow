# ระดับความพร้อมของ Buaflow (R0–R4)

เอกสารนี้เป็นมาตรฐานกลางสำหรับตอบว่าแอป “พร้อมแค่ไหน” โดยไม่ใช้คำว่า prototype, MVP หรือ production แบบตีความเอง

## กติกากลาง

1. ระดับสูงรวมข้อกำหนดของระดับต่ำกว่าทั้งหมด
2. การผ่านมาจาก evidence ที่ตรวจซ้ำได้ ไม่ใช่ข้อความสรุปของผู้สร้างหรือ AI
3. `not-applicable` ใช้ได้เฉพาะ control ที่มาตรฐานกำหนดว่า conditional และต้องมีเหตุผลเฉพาะโปรเจกต์
4. exception/waiver เป็นการยอมรับความเสี่ยง ไม่ทำให้ control กลายเป็น `pass` — ที่ที่เขียน exception ลงไปคือ `docs/evidence/requirement-coverage.json` ดู `standards/requirement-exceptions.md` (EP-002) · ข้อนี้ประกาศไว้ตั้งแต่วันแรกและไม่มีอะไรบังคับมันจนถึง 3.1.0
5. readiness ผูกกับ commit/build หนึ่งชุด ห้ามนำ report เก่ามาอ้างกับ source ชุดใหม่
6. `First Runnable` และ `Production Candidate` ต้องรายงานแยกกันเสมอ

## R0 — Prototype

เป้าหมาย: พิสูจน์แนวคิดและสื่อสาร flow หลัก

ต้องมี:

- source อยู่ใน version control หรือ snapshot ที่ระบุตัวตนได้
- มีวิธีเริ่มใช้งาน/เปิดดูที่ทำซ้ำได้
- primary flow อย่างน้อยหนึ่งเส้นพิสูจน์ได้

R0 ยังไม่รับรอง persistence, security, test coverage, deployment หรือ operations และห้ามเรียกว่า production-ready

## R1 — Functional

เป้าหมาย: ฟังก์ชัน happy path หลักทำงานจาก source ปัจจุบัน

ต้องเพิ่มจาก R0:

- build/compile/package สำเร็จตาม stack
- มี verify command มาตรฐานและผ่าน
- primary flow ใช้งานได้จาก implementation จริง ไม่ใช่ภาพหรือ mock อย่างเดียว

R1 อาจใช้ข้อมูลชั่วคราวและยังไม่มี boundary ด้านผู้ใช้/tenant ที่ครบ จึงเหมาะกับ developer demo

## R2 — MVP

เป้าหมาย: ให้ผู้ใช้กลุ่มจำกัดทดลองกับข้อมูลและขอบเขตจริงตาม application profile

ต้องเพิ่มจาก R1:

- requirement สำคัญ trace ไปยัง proof ได้
- automated tests ครอบคลุม business path และ failure สำคัญ
- persistence lifecycle ถูกกำหนด หรือระบุ `not-applicable` สำหรับแอปที่ไม่มี state จริง
- authentication/authorization/ownership boundary ถูกทดสอบ หรือระบุ `not-applicable` พร้อมเหตุผล
- CI รันชุดตรวจมาตรฐานจาก clean checkout — hosted CI หรือ `buaflow ci` (clone ใหม่บนเครื่องตัวเอง แล้วรัน gate และบันทึก `docs/evidence/ci-run.json` ที่ระบุว่าเป็น `local-clean-checkout`) ก็ได้ สิ่งที่ R2 ต้องการคือ checkout ที่สะอาดกับบันทึกที่บอกได้ว่า commit ไหนผ่าน ไม่ใช่ผู้ให้บริการรายใดรายหนึ่ง · local run ไม่พิสูจน์ว่าเครื่องที่สองได้ผลเดียวกัน

R2 ไม่ได้แปลว่ารับ production traffic ได้ เพราะ migration, rollback, observability และ supply-chain evidence อาจยังไม่ครบ

## R3 — Production Candidate

เป้าหมาย: ส่ง repository/artifact ให้ทีม platform ติดตั้งได้โดย **ไม่แก้ source code** เหลือเพียงกำหนด secrets, environment values และ infrastructure parameters

ต้องเพิ่มจาก R2:

- deployable package/image และ deployment manifest
- runtime configuration/secrets contract ที่ไม่ฝังค่าจริงใน source
- migration, compatibility และ rollback procedure ที่พิสูจน์ได้ตามชนิดระบบ
- secret, dependency และ security-control evidence
- end-to-end test บน production-like boundary
- health, logs/metrics/traces และ runbook ที่ใช้วินิจฉัยได้
- performance budget และ accessibility budget ตาม application profile
- SBOM และข้อมูล supply chain ที่ระบุตัว build
- clean-environment deployment rehearsal ผ่าน

รายละเอียด normative อยู่ใน [deployment-ready-contract.md](deployment-ready-contract.md)

คำว่า Production Candidate หมายถึง “พร้อมให้ owner/platform อนุมัติและ deploy” ไม่ได้หมายถึง Buaflow อนุมัติความเสี่ยงทางธุรกิจแทนคน หรือเป็นผู้ operate ระบบหลัง deploy

## R4 — Regulated

เป้าหมาย: ผ่านข้อควบคุมเฉพาะองค์กร อุตสาหกรรม หรือกฎหมายที่เลือกไว้

ต้องเพิ่มจาก R3:

- ระบุ compliance/control pack และเวอร์ชัน เช่น policy ขององค์กร, financial/health control set หรือ data residency
- evidence มี retention, access control และ auditability ตาม pack
- recovery/continuity test ผ่าน threshold ที่ pack กำหนด
- human approver ที่มีอำนาจรับรอง control set ลงนาม

R4 ไม่มี checklist สากลชุดเดียว เพราะ requirement ต่างกันตามข้อมูล เขตอำนาจ และองค์กร ห้ามอ้าง R4 โดยไม่ระบุ pack

## Promotion และ regression

- promote ได้เมื่อ control ของระดับเป้าหมายทุกตัวเป็น `pass` หรือ `not-applicable` ที่อนุญาต
- `fail`, `pending`, evidence หาย หรือ evidence ผูกกับ commit คนละชุด = ไม่ผ่าน
- source/dependency/config contract เปลี่ยน ต้องประเมิน control ที่ได้รับผลกระทบใหม่
- production incident หรือ rollback failure ลดระดับความเชื่อมั่นทันที จนกว่าจะมี evidence รอบใหม่

## Freshness — หลักฐานหมดอายุ (EP-010)

กติกาข้อ 5 ข้างบน (“readiness ผูกกับ commit/build หนึ่งชุด ห้ามนำ report เก่ามาอ้างกับ source ชุดใหม่”)
มีมาตั้งแต่ต้น แต่ไม่มีอะไรบังคับ — manifest ที่ผ่าน R3 เมื่อปีที่แล้วรายงาน `PASS` เสียงดังเท่ากับ
manifest ที่เพิ่งสร้างเมื่อเช้านี้ EP-010 เติมการบังคับนั้น

**ผลลัพธ์มีสามค่า ไม่ใช่สอง**

| ผลลัพธ์ | ความหมาย | exit code |
|---|---|---|
| `pass` | control ครบ และหลักฐานยังอยู่ในหน้าต่างที่ผู้ตรวจกำหนด | 0 |
| `expired` | control ครบทุกตัว **ตอนที่สร้างหลักฐาน** แต่วันนี้พิสูจน์ไม่ได้อีกแล้ว | 4 |
| `fail` | control ไม่ครบ หรือ manifest ผิดรูป | 1 |

`expired` ไม่ใช่ `fail` เพราะไม่มีใครทำอะไรผิด และไม่ใช่ `pass` เพราะคำกล่าวอ้างนั้นไม่เป็นจริงแล้ว
การบีบให้เหลือสองค่าบังคับให้ต้องโกหกทางใดทางหนึ่ง

**หน้าต่างเวลาเป็นนโยบายของผู้ตรวจ ไม่ใช่ของ manifest**

`--max-age-days` มาจากคนหรือ CI ที่ทำการตรวจ ไม่ใช่ field ใน `readiness.json` โดยเจตนา —
ถ้า manifest ประกาศวันหมดอายุของตัวเองได้ มันก็ประกาศว่าตัวเองไม่มีวันหมดอายุได้เช่นกัน
และ “หลักฐานอายุเท่าไรถึงยังเชื่อได้” เป็นเรื่องความเสี่ยงที่ผู้ตรวจรับได้ ไม่ใช่คุณสมบัติของตัวหลักฐาน
ระบบภายในกับระบบธนาคารมีคำตอบคนละแบบสำหรับ manifest หน้าตาเดียวกัน

**ไม่ส่ง `--max-age-days` = ไม่ตัดสิน** รายงานอายุให้ดูเฉย ๆ ผลลัพธ์ไม่เปลี่ยน
manifest ทุกไฟล์ที่เขียนก่อน control นี้มีอยู่จึงทำงานเหมือนเดิมทุกประการ (additive ตามนโยบายใน BF-006)
และไม่ต้องแก้ schema เลย

**สองสัญญาณที่ทำให้หมดอายุ**

1. **อายุ** — `generatedAt` เก่ากว่าหน้าต่างที่กำหนด
2. **สายเลือดของ commit** — commit ใน manifest ไม่ใช่บรรพบุรุษของ HEAD อีกต่อไป (ถูก rebase ทิ้ง,
   force-push ทับ หรือมาจาก branch ที่ไม่เคย merge) แปลว่าหลักฐานอธิบาย source ที่ไม่มีอยู่แล้ว

สิ่งที่ตรวจไม่ได้จะเป็น `unknown` เสมอ ไม่ใช่ `fail` — ไม่มี git, ไม่ใช่ git work tree หรือ shallow clone
ที่ไม่มี commit นั้น ล้วนถูกรายงานตามจริงโดยไม่ลงโทษสภาพแวดล้อมที่ไม่ครบ
และการตรวจสายเลือดจะรันก็ต่อเมื่อมีการส่ง `--max-age-days` มาเท่านั้น (ประหยัด subprocess)

**Cadence** — `.github/workflows/evidence-freshness.yml` ถามคำถามนี้ทุกสัปดาห์กับ reference app ทั้งสาม
ส่วน workflow ของแต่ละ reference app เองก็รัน verification ชุดจริงซ้ำตามรอบเดียวกัน
dependency เน่าหรือ advisory ใหม่ประกาศออกมาโดยไม่มีใครแตะโค้ด — CI แดงคือวิธีที่ผู้ใช้จะรู้

## Independent verification — ใครเป็นคนพูดว่าผ่าน (BC-006)

กติกาข้อ 2 ข้างบนบอกว่า "การผ่านมาจาก evidence ที่ตรวจซ้ำได้ ไม่ใช่ข้อความสรุปของผู้สร้างหรือ AI"
แต่จนถึง BC-006 ยังไม่มีอะไรตรวจซ้ำจริง — `readiness.json` ถูกเขียนโดยคนที่สร้างงานเอง และ
`readiness.js` ตรวจแค่ว่า **ประกาศถูกรูปแบบไหม** กับไฟล์ที่อ้างมีอยู่ไหม ส่วน command evidence
อย่าง `npm test` ไม่เคยถูกรันซ้ำเลยสักครั้ง แปลว่าหลักฐานของ control เหล่านั้นคือ "คำพูดของผู้สร้าง"

`claude-setup/verifier.js` (`buaflow audit`) ตัดสินใหม่จาก artifact และผลการรันจริงเท่านั้น
และ **ไม่อ่าน `control.status` เป็นข้อมูลเข้าในการตัดสินของตัวเอง** — ตัดสินก่อน แล้วค่อยเทียบ
สิ่งที่รายงานออกมาคือ "ตรงกันหรือไม่" ไม่ใช่ "เชื่อตามหรือไม่"

| คำตัดสิน | ความหมาย |
|---|---|
| `confirmed` | ทำซ้ำได้จริงจากที่นี่ — คำสั่ง exit 0 หรือไฟล์หลักฐานมีอยู่และไม่ว่าง |
| `refuted` | ทำซ้ำแล้วไม่จริง — คำสั่ง exit ไม่เป็นศูนย์, ไฟล์หาย, ไฟล์ว่าง, หรือไม่มี evidence แนบเลย |
| `unverifiable` | ตรวจจากที่นี่ไม่ได้ — URL ภายนอก, human attestation, ไม่ได้ส่ง `--execute`, หรือคำสั่งที่ไม่มีวันจบ |

**`unverifiable` ต้องไม่ถูกปัดเป็น `confirmed`** "ยังไม่ได้ตรวจ" กับ "ตรวจแล้วจริง" เป็นคนละเรื่อง
และการยุบสองอย่างนี้เข้าด้วยกันคือวิธีที่ระบบตรวจสอบตายเงียบ ๆ

**สิ่งที่ตั้งใจให้เป็นแบบนี้**

- **ไฟล์ว่าง = `refuted` ไม่ใช่ `confirmed`** — `touch evidence/report.json` ผ่านการเช็ค "มีไฟล์ไหม"
  ได้สบาย นี่คือวิธีที่ถูกที่สุดที่ placeholder จะปลอมเป็นหลักฐาน
- **คำสั่งที่ไม่มีวันจบ = `unverifiable` ไม่ใช่ `refuted`** — reference app อ้าง `npm run dev` เป็น
  หลักฐานของ `start-path` จริง ๆ exit status ใช้เป็นหลักฐานกับคำสั่งที่ไม่ควรจบไม่ได้ การตัดสินว่า
  "ตก" จึงผิดพอ ๆ กับการตัดสินว่า "ผ่าน"
- **`not-applicable` ไม่ถูกตัดสินใหม่** — ขอบเขตเป็นดุลพินิจของคน เครื่องที่รันคำสั่งซ้ำไม่มีอำนาจตรงนี้
- **ไม่ส่ง `--execute` = ไม่รันคำสั่ง** ค่าเริ่มต้นจึงปลอดภัย และ command evidence กลายเป็น
  `unverifiable` แทนที่จะเป็น `confirmed` ซึ่งยังรักษาหลักการไว้ครบ: ไม่มีอะไรถูกนับว่าผ่าน
  เพราะผู้สร้างบอกว่าผ่าน

> **`--execute` มี side effect** คำสั่งที่รันคือคำสั่งจริงของโปรเจกต์ และหลายคำสั่งเขียนไฟล์ทับของเดิม
> ตอนพัฒนา BC-006 เจอเข้าจริง ๆ: รัน `--execute` กับ `reference-apps/nextjs-postgres-crud` แล้ว
> Playwright เขียน `evidence/playwright-report.json` ทับ หลักฐาน R3 หายไป 238 บรรทัด
> **ตัวตรวจที่ทำลายสิ่งที่มันกำลังตรวจคืออันตรายจริง** — รันบน working tree ที่สะอาด และดู `git status` หลังรันเสมอ
>
> **ขอบเขตความเชื่อถือ** `--execute` รันคำสั่งที่เขียนอยู่ในไฟล์ของโปรเจกต์ที่กำลังตรวจ ผ่าน shell
> ระดับความเชื่อถือเท่ากับ `npm test` ของโปรเจกต์นั้นเอง — อย่าชี้ไปที่โปรเจกต์ที่คุณไม่กล้ารัน `npm test`

**สิ่งที่ verifier นี้จับไม่ได้ และไม่ได้อ้างว่าจับได้**

- test suite ที่ผ่านโดยไม่ assert อะไรเลย
- หลักฐานที่มีอยู่จริงแต่ไม่เกี่ยวกับ control ที่มันถูกแนบไว้
- คำสั่งที่ผ่านที่นี่แต่จะพังในสภาพแวดล้อมอื่น

สามข้อนี้ต้องใช้คนอ่าน หรือชั้น mutation testing ซึ่งไฟล์นี้ไม่ได้เป็น — `claude-setup/tests/verifier.test.js`
คือ seeded-defect corpus ที่เป็นหลักฐานว่า "verifier ทำงาน" โดยมีเกณฑ์คือ **จับได้ทุกข้อในชุดนั้น**

## คำสั่งอ้างอิง

หลังติดตั้งไฟล์ใน `claude-setup/` เป็น `.claude/`:

```bash
node .claude/readiness.js --file docs/evidence/readiness.json --level R3
node .claude/readiness.js --file docs/evidence/readiness.json --level R3 --json
node .claude/readiness.js --file docs/evidence/readiness.json --max-age-days 90
node .claude/verifier.js --root . --execute
buaflow audit --root . --execute --json
```

validator รุ่นแรกตรวจโครง manifest, สถานะ, evidence declaration และ file evidence ที่อ้างถึง รุ่นถัดไปจะเชื่อม gate เพื่อสร้าง evidence จากการรันจริงแบบ fail-closed

