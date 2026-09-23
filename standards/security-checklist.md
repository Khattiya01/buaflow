# Security Checklist

อิง OWASP Top 10 ปรับให้ใช้กับเว็บ TypeScript + Node + Prisma

> **นี่คือ checklist ที่เขียนขึ้นเองที่นี่** ใช้สำหรับ review รายวัน ไม่ใช่ฐานของการอ้างว่า "ผ่านมาตรฐาน"
> การอ้างมาตรฐานต้องทำผ่าน `standards/security-baseline.md` (EP-003) ซึ่ง map กับ control set
> ของเจ้าของจริงที่มีเวอร์ชัน แทนที่จะให้คะแนนตัวเองด้วยรายการที่ตัวเองเลือก
ใช้ตรวจ **ทุก task ที่แตะ backend** และ **ตรวจทั้งชุดก่อนขึ้น prd**

---

## 1. Authentication และ Session
- [ ] password hash ด้วย argon2id หรือ bcrypt (cost เหมาะสม) **ห้าม MD5/SHA1**
- [ ] session cookie ตั้ง `httpOnly` + `secure` + `sameSite=lax` (หรือ strict)
- [ ] token มีวันหมดอายุ และมีกลไก refresh / revoke
- [ ] logout ต้องทำให้ session ใช้ไม่ได้จริงที่ฝั่ง server
- [ ] rate limit หน้า login, reset password, OTP, endpoint ที่ส่งอีเมล
- [ ] ข้อความ error ตอน login ต้องไม่บอกว่าอีเมลมีอยู่จริงหรือไม่ (กัน user enumeration)
- [ ] reset password token ใช้ครั้งเดียว มีอายุสั้น สุ่มอย่างปลอดภัย
- [ ] พิจารณา 2FA สำหรับบัญชี admin

## 2. Authorization
- [ ] ตรวจสิทธิ์ **ที่ server ทุก endpoint** การซ่อนปุ่มใน UI ไม่ใช่ security
- [ ] ตรวจ **ownership ของ record** ไม่ใช่แค่ role (กัน IDOR — แก้ id ใน URL แล้วเห็นของคนอื่น)
- [ ] ค่าเริ่มต้นคือ "ปฏิเสธ" แล้วค่อยอนุญาตเป็นข้อๆ
- [ ] endpoint ของ admin แยกชัดและมี guard ของตัวเอง
- [ ] มีเทสที่พิสูจน์ว่า role ที่ไม่มีสิทธิ์ถูกปฏิเสธจริง

## 3. Input และ Output
- [ ] validate ทุก input ที่เข้าระบบด้วย zod/DTO (body, query, param, header ที่ใช้)
- [ ] allowlist ไม่ใช่ blocklist
- [ ] จำกัดขนาด payload และความยาว string
- [ ] escape/encode ตอนแสดงผล ห้ามใช้ dangerouslySetInnerHTML ถ้าไม่จำเป็น
  ถ้าจำเป็นต้อง sanitize ด้วย library ที่เชื่อถือได้
- [ ] ระวัง open redirect — ตรวจ URL ปลายทางก่อน redirect
- [ ] ระวัง SSRF ถ้ามีฟีเจอร์ให้ผู้ใช้ใส่ URL ให้ระบบไปเรียก

## 4. Database
- [ ] ใช้ Prisma (parameterized) เป็นหลัก
- [ ] ถ้าใช้ `$queryRaw` ต้องใช้แบบ parameterized เท่านั้น และ **ต้องถูก review เป็นพิเศษ**
- [ ] ไม่ส่ง object จาก ORM กลับไปตรงๆ — เลือกเฉพาะ field ที่ต้องการ (กัน password hash หลุด)
- [ ] บัญชี DB ของแอปมีสิทธิ์เท่าที่จำเป็น ไม่ใช่ superuser
- [ ] จำกัดผลลัพธ์ query ที่ผู้ใช้ควบคุมได้ (บังคับ pagination มี max limit)

## 5. Secrets และ Config
- [ ] ไม่มี secret ใน git (สแกนด้วย gitleaks ก่อน commit แรก)
- [ ] ทุก secret มาจาก env var
- [ ] .env.example ไม่มีค่าจริง
- [ ] key ต่าง env ไม่ซ้ำกัน
- [ ] ไม่มี debug endpoint / default credential หลงเหลือบน prd

## 6. HTTP Headers และ Transport
- [ ] HTTPS เท่านั้นบน uat/prd (HSTS)
- [ ] Content-Security-Policy (เริ่มจากเข้มแล้วค่อยผ่อนตามที่จำเป็นจริง)
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] X-Frame-Options / frame-ancestors กัน clickjacking
- [ ] CORS เป็น allowlist ต่อ env **ห้ามใช้ * คู่กับ credentials**
- [ ] ไม่เปิดเผยเวอร์ชัน framework ผ่าน header

## 7. File Upload (ถ้ามี)
- [ ] จำกัดชนิดไฟล์ด้วย allowlist และ **ตรวจ magic number ไม่ใช่แค่นามสกุล**
- [ ] จำกัดขนาดไฟล์
- [ ] ตั้งชื่อไฟล์ใหม่เอง ห้ามใช้ชื่อจากผู้ใช้ตรงๆ (กัน path traversal)
- [ ] เก็บนอก web root หรือบน object storage
- [ ] เสิร์ฟไฟล์ด้วย Content-Type ที่ถูกต้อง + Content-Disposition
- [ ] สแกนไวรัสถ้ารับไฟล์จากคนนอก

## 8. Logging และ Monitoring
- [ ] **ห้าม log**: password, token, cookie, เลขบัตรประชาชน, เลขบัตรเครดิต, PII
- [ ] log เหตุการณ์ด้านความปลอดภัย: login สำเร็จ/ล้มเหลว, เปลี่ยนสิทธิ์, ลบข้อมูลสำคัญ
- [ ] มี traceId ผูก request เดียวกันได้
- [ ] error ที่ตอบผู้ใช้ต้องไม่มี stack trace หรือ path ภายในระบบ

## 9. Dependency
- [ ] `pnpm audit` ก่อนขึ้น uat/prd
- [ ] pin เวอร์ชัน (มี lockfile เข้า git)
- [ ] ไม่ติดตั้ง package ที่ไม่จำเป็น
- [ ] ก่อนเพิ่ม dependency ใหม่ ให้ดูว่ายัง maintain อยู่ไหม และมีคนใช้จริงไหม

## 10. PDPA / ข้อมูลส่วนบุคคล (ถ้ามี)
- [ ] เก็บเท่าที่จำเป็นจริง (data minimization)
- [ ] มีหน้า/กลไกขอความยินยอม และบันทึกว่ายินยอมเมื่อไหร่
- [ ] รองรับสิทธิ์ของเจ้าของข้อมูล: ขอสำเนา, ขอแก้ไข, ขอลบ
- [ ] กำหนดระยะเวลาเก็บข้อมูล (retention) และวิธีลบเมื่อครบกำหนด
- [ ] เข้ารหัสข้อมูลอ่อนไหวที่เก็บในฐานข้อมูล
- [ ] มี audit log ว่าใครเข้าถึงข้อมูลส่วนบุคคลเมื่อไหร่
- [ ] ถ้าเอาข้อมูลจริงไปใช้ที่ uat ต้อง mask ก่อน

---

## รันเมื่อไหร่
| เมื่อ | ตรวจอะไร |
|---|---|
| ทุก task ที่แตะ backend | ข้อ 1-4 เฉพาะส่วนที่เกี่ยว |
| ก่อนปิด milestone | ทั้งหมด |
| ก่อนขึ้น prd | ทั้งหมด + `pnpm audit` + สแกน secret |
| หลังเพิ่ม integration ภายนอก | ข้อ 3, 5, 9 |

> ใช้ `/security-review` ของ Claude Code ช่วยตรวจ diff ได้ แต่ **ไม่ใช่ตัวแทนการตรวจตามรายการนี้**
