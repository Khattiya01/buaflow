---
paths:
  - "**/api/**/*.ts"
  - "**/modules/**/*.ts"
  - "**/server/**/*.ts"
  - "**/routes/**/*.ts"
  - "**/services/**/*.ts"
---

# กติกา Backend / API (โหลดอัตโนมัติเมื่อแตะไฟล์ฝั่ง server)

## ทุก endpoint ต้องมีครบ 5 อย่างนี้

1. **validate input ทุกทางเข้า** ด้วย zod/DTO — body, query, param, header ที่ใช้
   allowlist ไม่ใช่ blocklist / จำกัดขนาด payload และความยาว string
2. **ตรวจสิทธิ์ที่ server** — การซ่อนปุ่มใน UI ไม่ใช่ security
3. **ตรวจ ownership ของ record ไม่ใช่แค่ role** — กัน IDOR (แก้ id ใน URL แล้วเห็นของคนอื่น)
4. **error ตอบตาม envelope กลาง** พร้อม `code` ที่ frontend แมป i18n ได้
   ห้ามส่ง message ดิบหรือ stack trace ออกไป
5. **unit test เขียนพร้อมกับ module นี้เลย** ไม่เลื่อน ไม่แยก task — ครอบ error path ด้วย

## ห้าม

- ส่ง object จาก ORM กลับไปตรง ๆ → เลือกเฉพาะ field ที่ต้องการ (กัน password hash หลุด)
- raw query ที่ไม่ parameterized
- log ข้อมูลอ่อนไหว: password, token, cookie, เลขบัตร, PII
- secret หรือค่า config hardcode → ต้องมาจาก env
- query ที่ผู้ใช้ควบคุมได้โดยไม่มี pagination + max limit

## ทุกครั้งที่ API เปลี่ยน

- [ ] อัปเดต OpenAPI + export `docs/api/openapi.json`
- [ ] อัปเดต Postman collection ของ endpoint นั้น
- [ ] ถ้าเป็น breaking change → หยุดคุยเรื่อง version ก่อน

## ก่อนปิดงาน

- [ ] ไล่ดู query ที่อาจเป็น N+1 หรือขาด index
- [ ] มีเทสที่พิสูจน์ว่า role ที่ไม่มีสิทธิ์ถูกปฏิเสธจริง
- [ ] coverage ของไฟล์ที่แตะไม่ต่ำกว่าเป้า และไม่ทำให้ coverage รวมลดลง

รายละเอียดเต็ม: `docs/standards/security-checklist.md`, `docs/standards/testing-and-coverage.md`
