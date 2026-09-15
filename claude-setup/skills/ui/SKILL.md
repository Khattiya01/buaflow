---
name: ui
description: เริ่มสร้าง UI component โดยถามก่อนเสมอ ไม่ออกแบบเอง ใช้ทุกครั้งก่อนสร้าง component หรือหน้าจอใหม่
argument-hint: "<ชื่อ component หรือหน้าจอ>"
allowed-tools: Read Glob Grep
---

จะทำ UI: $ARGUMENTS

## ห้ามเขียนโค้ดก่อนตอบ 4 ข้อนี้

### 1. มีของเดิมใช้ได้ไหม
- ค้น `components/shared/` และ `components/ui/` หาของที่ใกล้เคียง
- ค้น `docs/design/components.md` ดูทะเบียน component
- **รายงานสิ่งที่เจอ** เช่น "เจอ DataTable ใน shared ที่น่าจะใช้แทนได้"
- ถ้าของเดิมเกือบพอ → **เพิ่ม prop/variant ในตัวเดิม อย่าก๊อปไปทำเวอร์ชัน 2**

### 2. shadcn มีไหม
- ตรวจว่ามี component นี้ใน shadcn/ui registry ไหม
- ถ้ามี → **ติดตั้งจาก registry ห้ามเขียนเอง**
- ถ้าประกอบจาก primitive ที่มีได้ → บอกว่าจะประกอบจากอะไร

### 3. มี design ไหม
- ดู `docs/design/` และ design ที่ผู้ใช้แนบไว้ตอน planning
- ถ้าเป็นโหมด rebuild → ดูของเดิมในโปรเจกต์เก่า **แล้วถามว่าเอาแบบเดิมไหม หรืออยากแก้ตรงไหน**

### 4. ถ้าไม่มีทั้งหมด — หยุดถามผู้ใช้

> `<ชื่อ component>` ยังไม่มีทั้งใน shared และ shadcn และผมไม่เห็น design
> - ให้ผมออกแบบเองไหม (จะเสนอ 2 แบบให้เลือกก่อนลงมือ)
> - หรือคุณมี reference จะส่งมา

**ห้ามออกแบบเองโดยไม่ได้รับอนุญาต**

---

## เมื่อได้คำตอบครบแล้ว

### ก่อนเขียน — ตอบคำถามเรื่อง shared
"component นี้มีโอกาสใช้ซ้ำที่อื่นไหม"
- ใช้ตั้งแต่ 2 ที่ หรือเป็น pattern ที่เห็นซ้ำในระบบ → **สร้างใน `components/shared/` ตั้งแต่แรก**
- ผูกกับหน้าเดียวจริง ๆ → อยู่ใน `components/<feature>/`
- ยังไม่รู้ว่าจะใช้ที่อื่นยังไง → **อย่าเพิ่งยก** การ abstract เร็วเกินไปแย่กว่า duplicate 2 ครั้ง
- **บันทึกผลการตัดสินใจลง `docs/design/components.md` เสมอ**

### ตอนเขียน
- Server Component เป็นค่าเริ่มต้น ใส่ directive ของ client ที่ขอบเล็กที่สุด
- ทุกข้อความผ่าน i18n ครบ th + en (รวม placeholder, aria-label, error, empty state)
- ใช้ theme token เท่านั้น ห้ามสีดิบ
- ใช้ `cva` สำหรับ variant, รับ `className` และ merge ด้วย `cn()`
- ทำครบ: loading / empty / error / disabled

### หลังเขียน — พิสูจน์ด้วยของจริง ไม่ใช่ติ๊ก
- [ ] ทดสอบที่ ~390px และ 1280px
- [ ] ทดสอบ light และ dark
- [ ] ทดสอบสลับ th/en แล้ว layout ไม่พัง (ความยาวข้อความต่างกัน)
- [ ] a11y: label ครบ, Tab ไล่ได้, focus เห็นชัด
- [ ] อัปเดต `docs/design/components.md`
- [ ] สร้าง task `T-xxx-test` สำหรับ unit test (blocked ไว้ก่อน)

> ถ้ามี design/ภาพต้นแบบให้เทียบ: ถ่าย screenshot ผลลัพธ์ เทียบกับต้นแบบ
> **ไล่ความต่างออกมาเป็นข้อ ๆ แล้วแก้จนตรง** อย่าเดาว่าเหมือนแล้ว
