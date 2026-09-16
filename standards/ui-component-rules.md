# กติกา UI Component

> กฎข้อแรกและสำคัญที่สุด: **ถามก่อนสร้างเสมอ** AI ห้ามออกแบบ component เองเงียบๆ

---

## 1. ลำดับการตัดสินใจก่อนสร้าง component (ห้ามข้าม)

```
ต้องการ component X
  │
  ├─ 1. มีใน components/shared/ อยู่แล้วไหม?
  │      ใช่ → ใช้ตัวนั้น (ถ้าต้องแก้ ให้เพิ่ม prop/variant ไม่ใช่ก๊อปไปทำใหม่)
  │
  ├─ 2. มีใน shadcn/ui registry ไหม?
  │      ใช่ → ติดตั้งจาก registry (shadcn CLI / MCP) ห้ามเขียนเอง
  │
  ├─ 3. ประกอบจาก primitive ที่มีอยู่ได้ไหม?
  │      ใช่ → ประกอบ แล้วถามว่าควรเก็บเป็น shared ไหม
  │
  ├─ 4. มี design ของ component นี้ไหม? (รูป / HTML / โปรเจกต์เก่า / canvas ที่ sync จาก claude.ai/design)
  │      ใช่ → ทำตาม design
  │
  └─ 5. ไม่มีทั้งหมด → ❗ หยุด แล้วถามผู้ใช้ก่อน
         "component นี้ยังไม่มีทั้งใน shared และ shadcn และไม่มี design
          ต้องการให้ผมออกแบบเองไหม หรือคุณมี reference จะส่งมา?"
```

> ข้อ 1-3 (ใช้ของเดิม/ประกอบจาก primitive) เป็น self-serve ทำได้เลยไม่ต้องรอ
> เฉพาะข้อ 4-5 (มีสี hex ดิบ/arbitrary value ที่ไม่ใช่ token เดิม = คิด design ใหม่เอง) ที่ถูกบังคับจริง
> ด้วย hook `guard-new-component.js` — ครอบคลุมทั้งตอนสร้างไฟล์ใหม่ (Write) และตอนแก้ไฟล์เดิม
> (Edit/MultiEdit) ที่เข้าเงื่อนไขนี้และชื่อยังไม่มีแถวใน `docs/design/components.md` จะถูกบล็อก
> (ดู `claude-setup/hooks/README.md`)

**เทมเพลตคำถามที่ AI ต้องถามทุกครั้งที่จะสร้าง component ใหม่:**

> จะทำ `<ชื่อ component>` ครับ ขอเช็กก่อน:
> 1. มีของเดิมใน `components/shared/` ที่ใช้แทนได้ไหม — ที่ผมเห็นใกล้เคียงคือ `<X>`
> 2. shadcn มี `<Y>` ที่ใช้เป็นฐานได้ — เอาตัวนี้ไหม
> 3. มี design/reference ให้ดูไหม หรือให้ผมเสนอแบบให้เลือก

---

## 2. เมื่อไหร่ต้องเป็น Shared Component

**ทุกครั้งที่เขียน component ต้องประเมินข้อนี้ แล้วบันทึกผล**

ยกขึ้นเป็น shared ถ้าเข้าข้อใดข้อหนึ่ง:
- มีโอกาสถูกใช้ **ตั้งแต่ 2 ที่ขึ้นไป** (แม้ตอนนี้ยังใช้ที่เดียว)
- เป็นรูปแบบที่โผล่ซ้ำในระบบ: page header, data table, empty state, confirm dialog,
  form field, status badge, file upload, date picker, ปุ่มยืนยันการลบ
- เป็นการห่อ shadcn เพื่อใส่กติกาของเรา (เช่น ปุ่มที่มี loading state มาตรฐาน)

**ยังไม่ต้องยกขึ้น shared ถ้า:**
- ผูกกับ business logic ของหน้าเดียวจริงๆ
- ยังไม่รู้ว่าจะใช้ที่อื่นยังไง — **การ abstract เร็วเกินไปแย่กว่าการ duplicate 2 ครั้ง**
- ถ้าเห็นซ้ำครั้งที่ 2 ค่อยยก (แต่ต้องยกจริง อย่าปล่อยให้ซ้ำครั้งที่ 3)

### ต้องบันทึกใน `docs/design/components.md` ทุกตัว
| component | ที่มา | shared? | ใช้ที่ไหน | หมายเหตุ |

---

## 3. โครงที่เก็บ

```
components/
  ui/           ← shadcn generated (แก้ได้ แต่จดไว้ว่าแก้อะไร กันตอน update ทับ)
  shared/       ← component กลางของเรา ใช้ข้าม feature
  <feature>/    ← component เฉพาะ feature นั้น
```
**ห้าม** `features/a/components` import จาก `features/b/components` — ถ้าต้องใช้ร่วม ให้ยกขึ้น `shared/`

---

## 4. มาตรฐานการเขียน component

- TypeScript + props มี type ชัดเจน ไม่ใช้ `any`
- **Server Component เป็นค่าเริ่มต้น** ใส่ `'use client'` ที่ขอบเล็กที่สุดเท่าที่จำเป็น
- variant ใช้ `cva` (class-variance-authority) แบบเดียวกับ shadcn ไม่ใช่ `if` ต่อ className
- รับ `className` และ merge ด้วย `cn()` เสมอ เพื่อให้ผู้เรียกปรับได้
- forward ref เมื่อห่อ element ที่ต้องใช้ ref
- **ไม่ fetch ข้อมูลใน shared component** — รับข้อมูลผ่าน props ให้ผู้เรียกจัดการ
- ต้องรองรับ: `loading`, `disabled`, `error`, `empty` ตามที่เกี่ยวข้อง

---

## 5. ข้อห้ามเด็ดขาด

| ห้าม | ให้ทำแทน |
|---|---|
| ข้อความ hardcode (`"บันทึก"`) | `t('common.save')` |
| สี hex ดิบ (`#1e40af`, `bg-blue-600`) | token (`bg-primary`, `text-muted-foreground`) |
| `style={{...}}` ค่าคงที่ | Tailwind class ที่อิง token |
| ติดตั้ง UI library ตัวใหม่โดยไม่มี ADR | ใช้ตัวที่ล็อกในธรรมนูญมาตรา 9 (ค่าเริ่มต้น React: shadcn/ui + Radix — ผ่านเกณฑ์ 5 ข้อใน Phase 2 รอบ B0) |
| `px` ดิบนอก scale | spacing scale ของ Tailwind |
| `dangerouslySetInnerHTML` | render ปกติ หรือ sanitize ถ้าจำเป็นจริง |
| ก๊อป component ไปแก้เป็นเวอร์ชัน 2 | เพิ่ม prop/variant ในตัวเดิม |

---

## 6. การหยิบ UI จากโปรเจกต์เก่า

> **เราเอา "หน้าตา" ไม่ได้เอา "โค้ด"**

| ของเดิม | ทำยังไงกับของใหม่ |
|---|---|
| layout, ลำดับ element, ระยะห่าง | ✅ ทำให้เหมือน |
| ข้อความ | ✅ เอามา แต่ต้องแปลงเป็น i18n key ทั้ง th/en |
| สี/ฟอนต์ | ⚠️ **แปลงเป็น token** ไม่ใช่ copy ค่าดิบ |
| พฤติกรรม/validation | ⚠️ ถามก่อนว่ายังถูกต้องอยู่ไหม |
| โครงโฟลเดอร์, routing, global css เดิม | ❌ ใช้ของโปรเจกต์ใหม่ |
| lib เดิมที่ซ้ำกับ shadcn | ❌ ตัดทิ้ง ใช้ shadcn |
| class เดิมที่อิง config Tailwind เก่า | ❌ เขียนใหม่ตาม token ใหม่ |

**ขั้นตอนที่ถูกต้อง:**
1. ดู component เก่า → สรุปเป็น "คำอธิบายหน้าตาและพฤติกรรม"
2. ถามผู้ใช้ยืนยันว่าเอาแบบนี้จริงไหม / อยากแก้ตรงไหน
3. **เขียนใหม่** ด้วย shadcn + token + i18n ของโปรเจกต์ใหม่
4. เทียบผลกับของเดิมด้วยตา แล้วให้ผู้ใช้ยืนยัน

ห้าม copy ไฟล์จากโปรเจกต์เก่ามาวางแล้วค่อยไล่แก้ — วิธีนั้นจะลาก pattern เก่าเข้ามาทั้งหมดโดยไม่รู้ตัว

---

## 7. Checklist ก่อนปิด component
- [ ] ตอบคำถามข้อ 1 ครบก่อนเริ่ม
- [ ] ประเมินเรื่อง shared แล้วและบันทึกใน `docs/design/components.md`
- [ ] ข้อความทั้งหมดผ่าน i18n ครบ th + en
- [ ] ใช้ token ไม่มีสี/ขนาดดิบ
- [ ] ครบทุกสถานะที่เกี่ยวข้อง (loading / empty / error / disabled)
- [ ] responsive ที่ ~390px ไม่พัง
- [ ] light + dark ใช้ได้ทั้งคู่
- [ ] a11y: role/label ครบ, Tab ไล่ได้, focus เห็นชัด
