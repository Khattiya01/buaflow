# Production-Qualified App benchmark (EV-002)

> คำสั่ง: `buaflow benchmark --root <project>` · หลายโปรเจกต์พร้อมกัน: `node buaflow/claude-setup/benchmark.js --root a --root b`
> ไม่รันคำสั่งของโปรเจกต์ ไม่เขียนไฟล์ ชี้ไปที่ repo ไหนก็ได้ รวมถึงโปรเจกต์ที่ไม่ได้เกิดจาก Buaflow

north-star metric นับ **"แอปที่ Production-Qualified"** แต่ก่อน EV-002 คำนี้มีแค่ความหมายเดียวคือ
`readiness --level R3` ผ่านหรือไม่ผ่าน — บอกไม่ได้ว่าแอปที่ไม่ผ่านห่างแค่ไหน และตัดสินจาก manifest
ที่ผู้สร้างเขียนเอง benchmark นี้ให้คะแนนสามมิติที่ roadmap กำหนดไว้ จาก artifact ที่มีอยู่แล้วเท่านั้น

## สามมิติ

control ทุกตัวของ R0–R3 อยู่ในมิติเดียวพอดี (เทสบังคับไว้) บวก artifact ของ EP-002..007 และ eval ของ EV-004

| มิติ | control ของ readiness | artifact ที่ตัวตรวจของมันเองตัดสิน |
|---|---|---|
| **functional** | start-path · primary-flow · build · verification · requirements-traceability · persistence · access-control · end-to-end-tests | `requirement-coverage` (EP-002) |
| **engineering** | version-control · automated-tests · ci · dependency-scan · secrets-scan · security-controls · sbom | `security-baseline` (EP-003) · `supply-chain` (EP-004) · **agent evals** (EV-004) |
| **operations** | deployment-package · runtime-config · database-migration · rollback · observability · health-check · runbook · clean-environment · performance · accessibility | `operational-readiness` (EP-005) · `budgets` (EP-007) |

คะแนนของมิติ = ค่าเฉลี่ยของทุกข้อในมิตินั้น (0–1)

## คะแนนของแต่ละข้อ — ไม่มีช่องให้ใครพิมพ์ตัวเลข

| สถานการณ์ | คะแนน | ทำไม |
|---|---:|---|
| ประกาศ `pass` และ `verifier.js` ยืนยันหลักฐานได้อย่างน้อยหนึ่งชิ้นจากที่นี่ | 1 | มีสิ่งที่ตรวจซ้ำได้จริง |
| ประกาศ `pass` แต่หลักฐานตรวจจากที่นี่ไม่ได้ (คำสั่งที่ไม่ได้รัน, URL) | 0.5 | คำพูดของผู้สร้างไม่ได้คะแนนเต็มเอง |
| ประกาศ `pass` ด้วยหลักฐาน **manual อย่างเดียว** (เช่น screenshot) | **0** | EV-002 ระบุว่า screenshot อย่างเดียวไม่นับ |
| ประกาศ `pass` แต่ verifier **หักล้าง** | 0 | และทำให้ไม่ qualify ทั้งแอป |
| ผู้สร้างประกาศ `fail` / `pending` เอง | 0 | ไม่มีใครพูดเกินเรื่องช่องว่างของตัวเอง |
| ไม่มี manifest → ใช้ probe ของ `assess` | pass 1 · pending 0.5 · fail 0 | โปรเจกต์ที่ไม่มี manifest ยังวัดด้วยคำสั่งเดียวกันได้ |
| artifact ของ EP-00x ผ่านตัวตรวจของมัน | 1 | ตัดสินโดย validator ของมันเอง ไม่ใช่ benchmark |
| artifact **ไม่มีไฟล์** | 0 | ไม่มีหลักฐานคือคำตอบ ไม่ใช่ข้อยกเว้น — เหมือนกันทุกแอป |
| agent evals | สัดส่วนเคสที่มี baseline run **ของ revision ปัจจุบัน** ที่ตรวจผ่าน `gradeRun` สะอาดและ derive ได้ `pass` | ตัวตรวจเดียวกับ gate ปฏิเสธ run ที่คนเขียนเคสตรวจเอง |
| `not-applicable` ที่ readiness อนุญาตและมีเหตุผล ≥ 20 ตัวอักษร | ตัดออกจากตัวหาร | ข้อยกเว้นเดียวของ "ไม่มี = 0" |

## Production-Qualified คืออะไร

ต้องจริง**ทั้งสามข้อพร้อมกัน** และทุกข้อที่ไม่จริงถูกรายงาน:

1. readiness manifest เป้า R3 (หรือ R4) และผ่าน `readiness --level R3`
2. `verifier.js` ไม่หักล้างคำประกาศ `pass` ข้อไหนเลย — control ที่ไม่ได้ประกาศเป็นช่องว่าง (ได้ 0) ไม่ใช่คำโกหก
3. ทุกมิติได้อย่างน้อย **0.8**

## ผลรอบแรก — 2026-09-23 · kit 3.8.0

| โปรเจกต์ | functional | engineering | operations | overall | PQA |
|---|---:|---:|---:|---:|:---:|
| nextjs-postgres-crud (Buaflow เขียน) | 1.00 | 0.90 | 1.00 | 0.97 | ✅ |
| react-fastapi-postgres-crud (Buaflow เขียน) | 1.00 | 0.90 | 1.00 | 0.97 | ✅ |
| expo-fastapi-postgres-sync (Buaflow เขียน) | 1.00 | 0.90 | 1.00 | 0.97 | ✅ |
| **bluepeak-hub (โปรเจกต์จริง · EV-009)** | 0.72 | 0.24 | 0.21 | 0.39 | ❌ |

- reference app ทั้งสามเสียคะแนน engineering ข้อเดียวกัน: **ไม่มี agent eval เลย** — kit บอกทุกโปรเจกต์ให้ทำ
  eval baseline (Phase 7.11) แต่แอปของตัวเองไม่มีสักเคส
- Bluepeak Hub: R2 ติด `ci` (GitHub billing) · ไม่มี artifact ของ EP-002..007 เลย · eval 2/5 เคสผ่าน

## สิ่งที่ benchmark นี้มองไม่เห็น และไม่ได้อ้างว่าเห็น

**ตัวเลขนี้วัด "หลักฐานที่ตรวจได้" ไม่ได้วัด "คุณภาพของสิ่งที่หลักฐานพูดถึง"** — ข้อนี้เห็นชัดจากตารางข้างบน:

- Bluepeak Hub มี rate limit ที่ auth, security headers และ logout ที่ทำให้ session ใช้ไม่ได้จริง ซึ่ง
  reference app ทั้งสามของ Buaflow **ไม่มี** (REQ-014/102/104 เป็น exception ที่ยอมรับไว้) แต่ reference app
  ได้ 0.97 และ Bluepeak ได้ 0.39 เพราะ reference app **เขียนหลักฐานไว้ครบ** ว่ามันขาดอะไร
- reference app สองตัวที่เป็น Python **ไม่มีคำสั่ง verify เดียว** ตามที่ Phase A.2 ของ kit กำหนด
  (`buaflow assess` เจอ) แต่ได้ `verification` 1.0 เพราะ manifest อ้าง `evidence/ci-run.json` ที่ยืนยันได้
- test suite ที่ผ่านโดยไม่ assert อะไร · หลักฐานที่มีจริงแต่ไม่เกี่ยวกับ control — เหมือนที่ `verifier.js` จับไม่ได้

⇒ **อย่าใช้ตัวเลขนี้เทียบว่าแอปไหน "ปลอดภัยกว่า"** ใช้เพื่อตอบว่า "ส่งให้ทีม platform ได้โดยมีหลักฐานครบแค่ไหน"
ซึ่งเป็นคำถามของ R3 · คุณภาพของ control ต้องใช้คนอ่าน หรือ eval ที่ถาม AI แทนคน (EV-004)
