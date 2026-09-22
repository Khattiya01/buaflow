# Buaflow development state

โฟลเดอร์นี้ติดตาม **การพัฒนาตัว Buaflow** ไม่ใช่ state ของโปรเจกต์ที่นำ Buaflow ไปใช้

- `state.json` — source of truth ของ milestone, work item, decision และ session handoff
- `state.schema.json` — contract ของไฟล์ state
- `../BUAFLOW_PRODUCT_ROADMAP.md` — ขอบเขตและเหตุผลเชิงผลิตภัณฑ์
- `../scripts/check-roadmap.js` — semantic checks ที่ JSON Schema อย่างเดียวตรวจไม่ได้

ก่อนเริ่มและก่อนจบงานให้รัน:

```bash
node scripts/check-roadmap.js
```

ก่อนส่งงานของตัว Buaflow ให้รันชุดตรวจ repository ทั้งหมด:

```bash
npm run check
```

คำสั่งนี้ตรวจ syntax, JSON, roadmap state และ regression tests โดยไม่ติดตั้ง dependency เพิ่ม

กติกาสำคัญ:

- ใช้ status เฉพาะ `backlog`, `ready`, `in_progress`, `blocked`, `done`, `dropped`
- งาน `done` ต้องมี `completedAt`, artifacts และ verification อย่างน้อยหนึ่งรายการ
- งาน `in_progress` ต้องมี dependency ที่เสร็จแล้ว และมี acceptance criteria
- ถ้าตัดสินใจเปลี่ยนทิศทาง ให้เพิ่ม decision ห้ามลบเหตุผลเก่า
- `lastSession` ต้องอัปเดตทุกครั้งที่มีการเปลี่ยนสถานะหรือส่งต่องาน
