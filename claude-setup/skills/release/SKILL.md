---
name: release
description: ปล่อยของขึ้น uat หรือ prd ไล่ checklist ก่อนปล่อย เตรียม release note และแผน rollback ใช้ตอนปิด milestone ไม่ใช่ปล่อยทีละ task
argument-hint: "uat | prd"
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash(git *) Bash(pnpm *) Bash(docker *)
---

ปล่อยของขึ้น: $ARGUMENTS

## หลักการ

- **artifact เดียวกันไหลผ่านทุก env** build image ครั้งเดียว เปลี่ยนแค่ env var
  ห้าม build ใหม่ตอนขึ้น prd — ของที่เทสบน uat จะไม่ใช่ของที่ขึ้นจริง
- ปล่อยเป็น **รอบตาม milestone** ไม่ใช่ปล่อยทีละ task
- **AI เตรียมและตรวจ แต่คนเป็นคนสั่งปล่อย** ทุกครั้ง

## ก่อนขึ้น uat — ไล่ให้ครบ แล้วแปะผลจริง

- [ ] ทุก task ในรอบเป็น `done`
- [ ] `pnpm verify` ผ่าน (แปะผล)
- [ ] `pnpm test:cov` — coverage ถึงเป้า (แปะตัวเลข)
- [ ] รัน SonarQube local แล้วผ่าน quality gate — **ผู้ใช้รันเอง** AI แค่เตือนและรอผล
- [ ] รัน Postman collection ผ่านทั้งชุด (`pnpm test:api`)
- [ ] migration รันบน DB สำเนาของ uat ได้ และมีแผน rollback
- [ ] อัปเดต `docs/api/openapi.json` แล้ว
- [ ] `.env.example` ตรงกับตัวแปรที่ใช้จริง

**เขียน release note** ที่ `docs/releases/<version>.md`:
- มีอะไรใหม่ (เขียนให้คนทดสอบอ่านรู้เรื่อง ไม่ใช่ commit log)
- แก้อะไรไปบ้าง
- **ต้องทดสอบอะไรเป็นพิเศษ** — ระบุเป็นข้อ ๆ ให้คนไล่ได้
- อะไรที่เปลี่ยนแล้วอาจกระทบของเดิม

## บน uat ทำอะไร
ให้คนทดสอบจริงตาม release note, เก็บ bug เป็น task ใหม่,
ทดสอบ i18n ทั้งสองภาษา, ทดสอบบนมือถือจริง

## ก่อนขึ้น prd — ทุกข้อของ uat บวกเพิ่ม

- [ ] UAT อนุมัติแล้วเป็นลายลักษณ์อักษร
- [ ] `docs/standards/security-checklist.md` ผ่านทั้งชุด
- [ ] `pnpm audit` ไม่มีช่องโหว่ระดับสูง
- [ ] **backup ฐานข้อมูลก่อนรัน migration** และซ้อม restore มาแล้ว
- [ ] env var ของ prd ครบ และ secret ไม่ได้อยู่ใน git
- [ ] มี **แผน rollback** ที่ทำได้จริง — ระบุว่ากี่นาที
- [ ] `/health` และ `/ready` ตอบถูกต้อง
- [ ] ปิดหรือป้องกันหน้า `/docs` และ debug endpoint
- [ ] ตกลงเวลาปล่อย + ใครเฝ้าหลังปล่อย

**แล้วหยุด รอผู้ใช้สั่งปล่อย** — AI ไม่ปล่อยของขึ้น prd เอง

## หลังปล่อย
- เฝ้า log/error 30-60 นาที
- ทดสอบ flow หลักด้วยตัวเอง
- ติด **tag** เวอร์ชัน (`v1.2.0`) และอัปเดต CHANGELOG
- อัปเดต board + ปิด milestone

## Rollback — เตรียมคำตอบไว้ล่วงหน้า 2 ข้อ

1. **โค้ด** — กลับไป image tag ก่อนหน้าได้ภายในกี่นาที
2. **ฐานข้อมูล** — migration รอบนี้ย้อนกลับได้ไหม
   ถ้าย้อนไม่ได้ (เช่น drop column) → **ต้องทำแบบ expand/contract**:
   รอบที่ 1 เพิ่มของใหม่โดยของเก่ายังอยู่ → ปล่อย → รอบถัดไปค่อยลบของเก่า

> ถ้าตอบ 2 ข้อนี้ไม่ได้ **ยังไม่ต้องปล่อย**
