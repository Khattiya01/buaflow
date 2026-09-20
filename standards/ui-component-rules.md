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
          คุณมี reference จะส่งมาไหม หรือให้ผมออกแบบ — เป็น text (เสนอ 2 แบบ) หรือบน canvas (claude.ai/design)?"
         text   → เสนอ 2 แบบจาก shadcn + token ให้เลือก
         canvas → ต้องมี docs/design/brief.md ก่อน + แนบ Design System project เดิม (ดูข้อ 8)
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
> 3. มี design/reference ให้ดูไหม หรือให้ผมเสนอแบบให้เลือก — เป็น text หรือ canvas

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
| component | ที่มา | shared? | ใช้ที่ไหน | หมายเหตุ | deviation จาก design |

คอลัมน์ `deviation`: จุดที่ผู้ใช้ **ตกลงแล้ว** ให้โค้ดต่างจาก canvas/design + เหตุผล (ว่าง = ต้องตรง 100%) — ดูข้อ 8

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
- [ ] มี design → pixel diff เหลือเฉพาะ `deviation` ที่ตกลง และ canvas ถูกแก้ให้ตรงโค้ดแล้ว (ข้อ 8)

---

## 8. Design เป็น source of truth ของ "หน้าตา" — โค้ดต้องตรง 100%

> ใช้กับทุก design ไม่ว่าจะเป็น canvas จาก claude.ai/design, รูป, HTML หรือโปรเจกต์เก่า
> **ตรงในเชิงภาพ ไม่ใช่ตรงในเชิง markup** — ห้าม copy โค้ด/สไตล์จาก canvas (กติกาเดียวกับข้อ 6)

### 8.1 ก่อนเปิด canvas — ต้องมีสัญญาก่อน
- **`docs/design/brief.md`** (จาก `docs/templates/design-brief.tpl.md`) ส่วนที่ 1 ต้อง `confirmed` ก่อนเปิด canvas ครั้งแรกของโปรเจกต์
  และตอบส่วนที่ 2 (scope · theme · viewports · states · content · deviation policy) ทุกครั้งที่สั่ง design
  เหตุผล: canvas ไม่มีคำตอบให้กับสิ่งที่ brief ไม่ได้ถาม มันจะเดาแทน และการเดาคือสิ่งที่ทำให้ตรง 100% ไม่ได้
- **แนบ Design System project เดิมเสมอ** (`design_system_project` ใน brief) ให้ canvas ประกอบจาก button/input/dialog ที่มีจริง
  ไม่ใช่วาดใหม่ — canvas ห้ามใช้สี/ฟอนต์/icon นอก token และ storybook
- **storybook ต้องใหม่กว่าโค้ด** — เทียบ `last_storybook_sync` ใน brief กับ commit ล่าสุดที่แตะ `components/`
  ถ้าโค้ดใหม่กว่า → `/design-sync` ก่อน ไม่งั้น canvas จะประกอบจากชิ้นส่วนเก่า
- ลำดับที่ถูก: **storybook → canvas → โค้ด** ไม่ใช่ design หน้าก่อนแล้วค่อยแกะ component ทีหลัง

### 8.2 Theme: ใช้เดิม / ปรับ / ใหม่ — ผลต่างกัน
| คำตอบ | ทำอะไร |
|---|---|
| ใช้เดิม | แนบ DS project → canvas ประกอบจากของเดิมล้วน ๆ |
| เดิมแต่ปรับ X | เป็น **token-level change** กระทบทุกหน้า → ยืนยันก่อน · แก้ `docs/design/theme.md` + `globals.css` ที่เดียว · push storybook · แล้วค่อยเปิด canvas |
| ออกแบบใหม่ทั้งหมด | มีหน้าที่ build แล้ว ≥ 1 → ไม่ใช่งาน `/ui` ต้องเป็น intent + ADR (ธรรมนูญมาตรา 9) เพราะทุกหน้าต้องตามไป · ยังไม่มีหน้าไหน → ทำ brief ส่วนที่ 1 ใหม่ |

### 8.3 หลังเขียนโค้ด — พิสูจน์ด้วย pixel diff ไม่ใช่ "ดูแล้วเหมือน"
1. ลงทะเบียนหน้าใน `docs/design/pixel.json` (route → artboard ทุก viewport + `:dark` ตาม brief) แล้วรัน `node .claude/pixel.js`
   สคริปต์ screenshot หน้า local (Playwright) และ baseline `.dc.html` **แบบเดียวกันทุกครั้ง ที่ viewport เดียวกับ artboard** — ห้าม AI เขียนโค้ด screenshot/diff เอง ผลจะไม่คงที่
   ภาพเก็บนอก repo **ห้าม commit รูป**
2. รายงานเป็น % ที่ต่าง + ขนาดไม่เท่ากัน + **พิกัด y/x ของบริเวณที่ต่าง** (pixelmatch ข้างใน) — แก้จากตัวเลข เปิดภาพ diff เฉพาะตอนพิกัดไม่พอจะอธิบาย
   แล้วไล่อธิบายความต่างทีละจุด (ระยะ, ขนาด, น้ำหนัก, สี, state ที่หาย)
3. แก้แล้ววนซ้ำ **จนผ่านเกณฑ์** — diff ที่อธิบายไม่ได้คือบั๊กของโค้ด ไม่ใช่ของ canvas · ห้ามขยาย `maxDiffPercent` เพื่อให้ผ่าน:
   ความต่างที่ผู้ใช้ตกลงคือ deviation (8.4) ไม่ใช่การผ่อนเกณฑ์กลาง
4. สีใน canvas ที่ไม่มี token → **หยุดถาม**: เพิ่ม token (theme-level กระทบทั้งระบบ) หรือแก้ canvas — ห้ามใส่ hex ดิบเพื่อให้ตรง

### 8.4 Deviation — ปรับได้ แต่ต้องเป็นลายลักษณ์อักษร และ canvas ต้องตามโค้ด
- ผู้ใช้ตกลงระหว่าง build ว่า "เอาแบบนี้แทน" = deviation → บันทึกใน `docs/design/components.md` คอลัมน์ `deviation` พร้อมเหตุผล
- **แล้วแก้ canvas ให้ตรงโค้ดทันที** commit `.dc.html` ใหม่เป็น baseline — **canvas กับโค้ดต้องเท่ากันเสมอหลังปิดงาน มี source of truth เดียว**
  ไม่ทำ → Phase 8.8 รอบหน้าจะเห็น diff แล้วเข้าใจว่าคนแก้ canvas → ย้อนโค้ดกลับ → วน ping-pong ไม่จบ
- push preview HTML ของ component (`<!-- @dsCard group="..." -->` บรรทัดแรก) ขึ้น `/design-sync` แล้วอัปเดต `last_storybook_sync`
- มี prototype (`prototype_url` ใน brief) → `/prototype` regenerate ทับ URL เดิม — prototype เป็น view ของ baseline ห้ามค้าง

### 8.5 สิ่งที่ canvas ไม่ตอบ — ห้ามเอาจาก canvas
data fetching · auth · validation · business rule → มาจาก spec เท่านั้น canvas ตอบแค่ "หน้าตา"
hover / focus / transition → ใช้กติกากลางใน brief 1.8 ไม่ตีความจากภาพนิ่ง
