# i18n และ Theme

## ส่วนที่ 1 — i18n (บังคับ th + en ตั้งแต่วันแรก)

### 1.1 กติกาหลัก
- ภาษาเริ่มต้น **th**, ภาษารอง **en**
- **ห้าม hardcode ข้อความใดๆ ใน component** ไม่มีข้อยกเว้น
- ทุก key ต้องมีครบทั้ง 2 ภาษา — ขาดข้างใดข้างหนึ่ง = งานยังไม่ done

### 1.2 สิ่งที่คนมักลืมแปล (ต้องแปลด้วย)
- placeholder ของ input
- aria-label, alt, title
- ข้อความ validation ของ zod
- ข้อความ toast / notification
- empty state, loading text, ข้อความหน้า 404 / 500 / ไม่มีสิทธิ์
- ปุ่มในกล่องยืนยัน (ยืนยัน / ยกเลิก)
- หัวตาราง, ชื่อสถานะ (เช่น pending / approved)
- ข้อความใน email template
- title และ meta description ของแต่ละหน้า

### 1.3 โครง key

```
<namespace>.<screen หรือ component>.<element>

auth.login.title
auth.login.emailPlaceholder
auth.login.error.invalidCredentials
common.action.save
common.status.pending
order.list.emptyState
validation.email.invalid
```

แยกไฟล์ตาม namespace อย่าทำไฟล์เดียวยักษ์:

```
src/i18n/messages/
  th/common.json  th/auth.json  th/order.json  th/validation.json
  en/common.json  en/auth.json  en/order.json  en/validation.json
```

### 1.4 เรื่องที่ต้องวางแผนตั้งแต่แรก

| เรื่อง | วิธีทำ |
|---|---|
| วันที่/เวลา | เก็บเป็น UTC เสมอ แปลงตอนแสดง ใช้ formatter ของ i18n ไม่ต่อ string เอง |
| ปี พ.ศ. หรือ ค.ศ. | **ตัดสินใจตั้งแต่ต้น** ว่า th แสดงเป็น พ.ศ. ไหม แล้วทำ helper กลางตัวเดียว |
| ตัวเลข / สกุลเงิน | ใช้ Intl.NumberFormat ตาม locale |
| พหูพจน์ | ใช้ระบบ plural ของ i18n lib ไม่ใช่เขียนเงื่อนไขเอง |
| การเรียงลำดับ | ใช้ Intl.Collator สำหรับข้อความไทย |
| ความยาวข้อความต่างกัน | layout ต้องไม่พังเมื่อสลับภาษา — **ทดสอบทั้งสองภาษาทุกหน้า** |
| ฟอนต์ | ต้องมี glyph ไทยครบ (IBM Plex Sans Thai / Noto Sans Thai / Sarabun) + fallback |
| การตัดคำไทย | ไทยไม่มีเว้นวรรคระหว่างคำ ระวังการตัดข้อความและความสูงบรรทัด |
| error จาก backend | backend ส่ง error.code แล้ว **frontend แมปเป็น i18n key** ห้ามโชว์ message ดิบ |
| URL | /th/... และ /en/... พร้อม hreflang ถ้าต้องทำ SEO |

### 1.5 Checklist ต่อหน้า
- [ ] ไม่มีข้อความไทย/อังกฤษดิบอยู่ในไฟล์ tsx
- [ ] key ครบทั้ง th และ en
- [ ] เปิดหน้าด้วยทั้ง 2 ภาษาแล้ว layout ไม่พัง
- [ ] วันที่ ตัวเลข เงิน แสดงถูกตาม locale

---

## ส่วนที่ 2 — Theme

### 2.1 กติกาหลัก
- กำหนดชุดสีตั้งแต่ **Phase 3** ก่อนเขียน UI จริง
- ทุกสีอยู่ใน **CSS variable** ตามชื่อของ shadcn/ui
- **ห้ามใส่สีดิบใน component เด็ดขาด** (ไม่มีค่า hex, ไม่มี bg-blue-600)
- เตรียม dark mode ตั้งแต่แรกเสมอ แม้ยังไม่เปิดให้ผู้ใช้ใช้ เพราะเพิ่มทีหลังแพงกว่ามาก

### 2.2 Token ที่ต้องกำหนดครบ

```
--background / --foreground
--card / --card-foreground
--popover / --popover-foreground
--primary / --primary-foreground
--secondary / --secondary-foreground
--muted / --muted-foreground
--accent / --accent-foreground
--destructive / --destructive-foreground
--border / --input / --ring
--radius
```

กำหนดครบทั้งชุด light และ dark

### 2.3 สีสถานะ (ต้องเพิ่มเอง shadcn ไม่มีให้)

```
--success / --success-foreground
--warning / --warning-foreground
--info / --info-foreground
```

ใช้กับ badge สถานะ, toast, alert — **ตกลงตั้งแต่แรกว่าสถานะไหนใช้สีอะไร**
แล้วทำเป็น component เดียว (StatusBadge) ไม่ใช่ใส่สีมือทุกที่

### 2.4 Typography

กำหนดเป็นตารางและใช้ตามนี้ทั้งระบบ:

| ระดับ | ขนาด | น้ำหนัก | line-height | ใช้ตรงไหน |
|---|---|---|---|---|
| h1 | | | | หัวข้อหน้า |
| h2 | | | | หัวข้อ section |
| body | | | | เนื้อหา |
| small | | | | คำอธิบาย helper text |

**ข้อควรระวังของภาษาไทย:** สระบน-ล่างทำให้ต้องใช้ line-height สูงกว่าภาษาอังกฤษ
(ประมาณ 1.6-1.75 สำหรับ body) ไม่งั้นสระจะชนกัน

### 2.5 อย่างอื่น
- **Spacing** ยึด scale ของ Tailwind อย่าใส่ค่าแปลกๆ
- **Radius** คุมจาก --radius ตัวเดียว
- **Shadow และ z-index** กำหนดเป็นชั้นที่ตั้งชื่อไว้ (dropdown / sticky / modal / toast)
  อย่าใส่ z-index มั่ว
- **Contrast** ทุกคู่สีข้อความกับพื้นหลังต้องผ่าน WCAG AA (4.5:1 สำหรับข้อความปกติ)
  ตรวจทั้ง light และ dark

### 2.6 Checklist
- [ ] token ครบทั้ง light และ dark
- [ ] สลับโหมดแล้วทุกหน้าอ่านได้ ไม่มีสีจม
- [ ] contrast ผ่าน AA
- [ ] ไม่มีสีดิบหลงอยู่ในโค้ด (ลอง grep หาค่า hex และ class สีของ Tailwind ดู)
