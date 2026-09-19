---
project: <ชื่อโปรเจกต์>
status: draft | confirmed
confirmed_by: <ใครเป็นคนยืนยัน>
confirmed: YYYY-MM-DD
design_system_project: <projectId บน claude.ai/design — ว่างถ้ายังไม่ได้ push storybook>
last_storybook_sync: <commit sha ล่าสุดที่ design-sync push ขึ้นไป — ใช้เช็คว่า storybook stale ไหม>
---

# Design Brief: <ชื่อโปรเจกต์>

> **สัญญาที่ต้องเห็นชอบก่อนเปิด canvas ทุกครั้ง** เก็บที่ `docs/design/brief.md`
> ส่วนที่ 1 ทำครั้งเดียวต่อโปรเจกต์ (แก้ได้แต่ทุกการแก้ = token-level change กระทบทุกหน้า)
> ส่วนที่ 2 ทำใหม่ทุกครั้งที่สั่ง design — ตอบครบแล้วค่อยเปิด canvas
> **canvas ตอบแค่ "หน้าตา" ไม่ตอบ "พฤติกรรม"** — data / auth / validation มาจาก spec เสมอ
> **canvas ไม่มีคำตอบให้กับสิ่งที่ brief ไม่ได้ถาม** — มันจะเดาแทน และการเดานั้นคือสิ่งที่ทำให้โค้ด "ตรง 100%" ไม่ได้

---

## ส่วนที่ 1 — ระดับโปรเจกต์ (ทำครั้งเดียว)

### 1.1 Reference
- เว็บ/แอปที่ชอบ (URL + ชอบตรงไหน):
- logo (path):
- screenshot ของเดิม (rebuild):
- สิ่งที่ **ไม่เอา** แน่ ๆ:

### 1.2 Foundations — สี
> ทุกค่าต้องแมปเป็น CSS variable ของ shadcn/ui ได้ (`--primary` `--secondary` `--accent` `--destructive` `--muted` `--border` `--background` `--foreground`)
> ค่าสรุปสุดท้ายอยู่ที่ `docs/design/theme.md` — ไฟล์นี้บันทึกแค่ **การตัดสินใจ** ไม่ใช่ค่าตัวเลข

| ชุด | ตัดสินใจ |
|---|---|
| primary / secondary / accent | |
| semantic: success / warning / destructive / info | |
| neutral scale (background, muted, border) | |
| dark mode | ⬜ ทำตั้งแต่แรก / ⬜ เตรียม token ไว้แต่ยังไม่เปิด / ⬜ ไม่ทำ |

### 1.3 Typography
| เรื่อง | ตัดสินใจ |
|---|---|
| ฟอนต์ไทย (ต้องมี glyph ไทยครบ) | |
| ฟอนต์อังกฤษ | |
| fallback stack | |
| type scale (h1 → body → caption) | |

### 1.4 Shape & space
| เรื่อง | ตัดสินใจ |
|---|---|
| radius | |
| border / divider | |
| shadow | |
| spacing scale | |
| density | ⬜ compact / ⬜ comfortable |

### 1.5 Core components — ต้อง design เป็น storybook ก่อน ค่อยเอาไปประกอบหน้า
> ติ๊กเฉพาะตัวที่โปรเจกต์นี้ใช้จริง ตัวที่ไม่ติ๊ก = ไม่มีใน storybook = canvas ห้ามใช้
> สถานะที่ต้องมีทุกตัว: default / hover / focus / disabled / loading / error (ตามที่เกี่ยวข้อง)

| component | ใช้ | variants / sizes ที่ต้องมี |
|---|---|---|
| button | ⬜ | |
| input / form field (label, helper, error) | ⬜ | |
| select / combobox | ⬜ | |
| checkbox / radio / switch | ⬜ | |
| dialog / sheet / drawer | ⬜ | |
| table / data table | ⬜ | |
| card | ⬜ | |
| badge / status | ⬜ | |
| toast | ⬜ | |
| tabs | ⬜ | |
| pagination | ⬜ | |
| empty state | ⬜ | |
| skeleton / loading | ⬜ | |
| <เพิ่มเอง> | ⬜ | |

### 1.6 App shell & layout
| เรื่อง | ตัดสินใจ |
|---|---|
| shell | ⬜ sidebar / ⬜ topbar / ⬜ ทั้งคู่ / ⬜ ไม่มี (landing) |
| viewports ที่ต้องมี artboard **ทุกหน้า** | ⬜ 390 (mobile) · ⬜ 768 (tablet) · ⬜ 1280 (desktop) |
| max-width ของ content | |
| grid / columns | |

### 1.7 Icon set
- ⬜ lucide (default ของ shadcn) / ⬜ อื่น: ___
- canvas **ห้ามวาด icon เอง** — ใช้จาก set นี้เท่านั้น ไม่มีตัวที่ต้องการ → บอกก่อน

### 1.8 Motion & interaction (canvas เป็นภาพนิ่ง — ตกลงเป็นกติกากลาง ไม่ตกลงต่อหน้า)
| เรื่อง | ตัดสินใจ |
|---|---|
| hover | |
| focus ring | |
| transition duration / easing | |
| การเปิด/ปิด dialog, sheet, toast | |

### 1.9 Content & i18n
- ภาษาใน mockup: ⬜ th / ⬜ en / ⬜ ทั้งคู่ (แนะนำ: **ภาษาที่ข้อความยาวกว่า** เพื่อให้ layout รอดทั้งสอง)
- ข้อมูลตัวอย่างต้อง **ยาวเท่าของจริง** (ชื่อ 40 ตัวอักษร, ตัวเลข 7 หลัก, วันที่เต็ม) ไม่ใช่ "ชื่อ" 3 ตัว
- รูปแบบวันที่ / ตัวเลข / สกุลเงิน:

---

## ส่วนที่ 2 — ระดับงาน (ทำใหม่ทุกครั้งที่สั่ง design)

> copy บล็อกนี้ต่อท้ายไฟล์ทุกครั้ง หรือเก็บใน task/plan ที่เกี่ยวข้อง — แต่ต้องตอบครบ **ก่อน** เปิด canvas

### งาน: <ชื่อ component / หน้า / flow> — YYYY-MM-DD

| ถาม | คำตอบ |
|---|---|
| **Scope** | ⬜ component เดียว / ⬜ หน้าเดียว / ⬜ flow หลายหน้า (ระบุ: ___) / ⬜ theme อย่างเดียว |
| **Theme** | ⬜ ใช้เดิม / ⬜ เดิมแต่ปรับ: ___ (= token-level กระทบทุกหน้า ต้องยืนยัน) / ⬜ ออกแบบใหม่ (มีหน้าที่ build แล้ว → ต้องเป็น intent + ADR ไม่ใช่งานนี้) |
| **Output** | ⬜ text wireframe / ⬜ canvas — default: component เดี่ยวที่ประกอบจาก shadcn → text พอ · หน้าเต็ม/flow → canvas |
| **Viewports** | ⬜ 390 · ⬜ 768 · ⬜ 1280 · ⬜ dark ด้วย |
| **States ที่ต้องมี artboard** | ⬜ empty · ⬜ loading · ⬜ error · ⬜ unauthorized · ⬜ ใช้ pattern กลางจาก storybook (ไม่ต้องวาดใหม่) |
| **Content** | ภาษาใน mockup: ___ · ข้อมูลตัวอย่างยาวเท่าของจริงแล้ว ⬜ |
| **Deviation policy** | ⬜ ตรง canvas 100% / ⬜ อนุญาตปรับเฉพาะ: ___ (จุดที่ไม่ได้ระบุ = ต้องตรง) |
| **Storybook ล่าสุดกว่าโค้ดไหม** | `last_storybook_sync` = ___ · HEAD = ___ · ⬜ ตรง / ⬜ ต้อง `design-sync` ก่อนเปิด canvas |

**ผล:**
- canvas URL + version ที่ confirm:
- baseline: `docs/design/canvas/<screen-name>.dc.html` @ commit ___
- deviation ที่ตกลงระหว่าง build (ต้องไปอยู่ใน `docs/design/components.md` คอลัมน์ deviation และ **แก้ canvas ให้ตามแล้ว** ⬜):
