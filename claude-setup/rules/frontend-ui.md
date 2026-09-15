---
paths:
  - "**/components/**/*.{tsx,jsx}"
  - "**/app/**/*.{tsx,jsx}"
  - "**/pages/**/*.{tsx,jsx}"
---

# กติกา UI (โหลดอัตโนมัติเมื่อแตะไฟล์ component)

## ก่อนสร้าง component ใหม่ — ถามตามลำดับนี้ ห้ามข้าม

1. มีใน `components/shared/` แล้วไหม → ถ้ามี **เพิ่ม prop/variant ในตัวเดิม ห้ามก๊อปไปทำเวอร์ชัน 2**
2. มีใน shadcn/ui registry ไหม → ถ้ามี **ติดตั้งจาก registry ห้ามเขียนเอง**
3. ประกอบจาก primitive ที่มีอยู่ได้ไหม
4. มี design ไหม (รูป / HTML / โปรเจกต์เก่า)
5. ไม่มีทั้งหมด → **หยุด ถามผู้ใช้ก่อนออกแบบเอง**

## ห้ามเด็ดขาด

| ห้าม | ให้ทำแทน |
|---|---|
| ข้อความ hardcode | i18n key ครบ th + en |
| สี hex ดิบ / `bg-blue-600` | token: `bg-primary`, `text-muted-foreground` |
| `style={{...}}` ค่าคงที่ | Tailwind class ที่อิง token |
| ติดตั้ง UI library ตัวใหม่ | ใช้ตัวที่ล็อกในธรรมนูญมาตรา 9 (ค่าเริ่มต้น: shadcn/ui + Radix) — จะเพิ่มตัวอื่นต้องเปิด intent + ADR ก่อน |
| แก้ไฟล์ที่ registry/generator สร้าง (`components/ui/**`) | มี hook บล็อกไว้ตาม `.claude/protected-paths.json` — ติดตั้งใหม่ผ่าน CLI หรือห่อใน `shared/` |
| feature หนึ่ง import component ของอีก feature | ยกขึ้น `components/shared/` |

## ตอนเขียน

- Server Component เป็นค่าเริ่มต้น ใส่ client directive ที่ขอบเล็กที่สุด
- variant ใช้ `cva` ไม่ใช่ `if` ต่อ className
- รับ `className` และ merge ด้วย `cn()` เสมอ
- **ไม่ fetch ข้อมูลใน shared component** — รับผ่าน props
- ทำครบทุกสถานะที่เกี่ยวข้อง: loading / empty / error / disabled / ไม่มีสิทธิ์

## shared หรือไม่ — ต้องตัดสินทุกครั้งและบันทึก

- ใช้ตั้งแต่ 2 ที่ หรือเป็น pattern ที่เห็นซ้ำ → `components/shared/` ตั้งแต่แรก
- ยังไม่รู้ว่าจะใช้ที่อื่นยังไง → **อย่าเพิ่งยก** abstract เร็วเกินไปแย่กว่า duplicate 2 ครั้ง
- บันทึกผลลง `docs/design/components.md` **ทุกครั้ง**

## ก่อนปิดงาน UI

- [ ] ทดสอบ ~390px, light + dark, สลับ th/en แล้ว layout ไม่พัง
- [ ] a11y: label ครบ, Tab ไล่ได้, focus เห็นชัด
- [ ] สร้าง task `T-xxx-test` แล้ว (unit test เขียนทีหลังเมื่อ UI นิ่ง)

รายละเอียดเต็ม: `docs/standards/ui-component-rules.md`
