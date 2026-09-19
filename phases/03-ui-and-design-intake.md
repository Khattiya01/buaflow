# Phase 3 — UI, Theme และการรับ Design / โปรเจกต์เก่า

> เป้าหมาย: รู้ว่าจะมีกี่หน้า หน้าตายังไง ใช้สีอะไร component ไหนเป็น shared
> และถ้ามีของเดิม — รู้ว่าจะ**เอาอะไร ไม่เอาอะไร**
> **ยังไม่เขียน component จริง** Phase นี้ผลิตเอกสาร + ไฟล์ theme token เท่านั้น

เลือกทำเฉพาะ **เส้นทางที่ตรงกับโหมด** ที่บันทึกไว้ใน `_state.md`

---

## เส้นทาง A — `HAS_DESIGN` (มีไฟล์ design แนบมา)

1. อ่าน design ที่ผู้ใช้แนบ (HTML / รูป / PDF / Figma link)
2. สกัด **design token** ออกมาเป็นตาราง:
   | token | ค่าที่เจอ | ใช้ตรงไหน |
   - สี: primary / secondary / accent / destructive / muted / border / background / foreground
   - typography: font family, ขนาด h1–h6 + body + caption, line-height, font-weight
   - spacing scale, border-radius, shadow
   - breakpoint ที่ design เผื่อไว้
3. **แปลง token เป็น CSS variable ของ shadcn/ui** (ตามโครง `--background` `--primary` ฯลฯ)
   เขียนลง `docs/design/theme.md` — ยังไม่ต้องแตะ `globals.css` จริง
4. ทำ **inventory หน้าจอ**: หน้าไหนบ้าง แต่ละหน้าประกอบด้วย component อะไร
5. แมป component ที่เห็น → **ตัวไหนมีใน shadcn/ui registry แล้ว** (button, dialog, table, form, ...)
   ตัวไหนต้องประกอบเอง ตัวไหนต้องสร้างใหม่จริงๆ
6. จุดที่ design ไม่ครอบคลุม (empty state, loading, error, ข้อความ error, responsive มือถือ)
   → **ถามผู้ใช้** อย่าคิดเอง

---

## เส้นทาง B — `NO_DESIGN` (ยังไม่มี design)

**ห้ามออกแบบเองเงียบๆ** ต้องถามตามลำดับนี้:

1. "มีเว็บตัวอย่างที่อยากได้คล้ายๆ ไหม" (ขอ URL / รูป)
2. "โทนแบรนด์เป็นแนวไหน" — เสนอเป็นตัวเลือกที่จับต้องได้ 3 ชุด เช่น
   | ชุด | primary | บุคลิก | เหมาะกับ |
   |---|---|---|---|
   | Trust Blue | น้ำเงิน | น่าเชื่อถือ สุภาพ | ระบบองค์กร, การเงิน |
   | Fresh Emerald | เขียวมรกต | สดใหม่ เป็นมิตร | e-commerce, สุขภาพ |
   | Modern Slate | เทาเข้ม + accent | มินิมอล โฟกัสคอนเทนต์ | dashboard, SaaS |
3. "มี logo / สีแบรนด์ที่ใช้อยู่แล้วไหม" — ถ้ามี ให้ดึงสีจาก logo เป็น primary
4. "โหมดมืดเอาไหม" (แนะนำให้เตรียม token ไว้ตั้งแต่แรก ต่อให้ยังไม่เปิดใช้)
5. เสนอ **wireframe เป็นข้อความ** (ลำดับ section ของแต่ละหน้า) ให้ยืนยันก่อน
   ยังไม่ต้อง render จริง

> ถ้าผู้ใช้อยากเห็นภาพก่อนตัดสินใจ (และมี claude.ai design access) — เสนอเปลี่ยนไปทำตาม **เส้นทาง D**
> (`CLAUDE_DESIGN`) ด้านล่างแทน จะได้ mockup หลายหน้าจอบน canvas เดียวที่ยืนยันเป็นภาพจริง
> ไม่ใช่ wireframe เป็นข้อความ

---

## เส้นทาง C — `FROM_LEGACY` / โหมด `REBUILD` (เอา UI จากโปรเจกต์เก่า)

### C.0 หลักคิดที่ต้องยึด

> **เราต้องการ "หน้าตา" ไม่ได้ต้องการ "ทุกอย่าง"**

แยกของเดิมเป็น 3 ชั้น แล้วปฏิบัติต่างกัน:

| ชั้น | ตัวอย่าง | ทำยังไง |
|---|---|---|
| **1. Look & flow** | layout, ลำดับ element, ข้อความ, สี, พฤติกรรมปุ่ม | ✅ **หยิบมา** (นี่คือของที่ต้องการ) |
| **2. Business logic** | สูตรคำนวณ, เงื่อนไข validation, flow อนุมัติ | ⚠️ **ถามทีละอัน** ว่าเอาไหม / ยังถูกต้องอยู่ไหม |
| **3. โครงสร้างโค้ด** | โครงโฟลเดอร์, global css, pattern เดิม, lib เดิม, routing เดิม | ❌ **ไม่หยิบ** ใช้ของโปรเจกต์ใหม่ |

ตัวอย่างที่ต้องระวัง: ของเดิมเป็น React + Tailwind มี `global.css` แบบหนึ่ง
แต่ของใหม่เป็น Next.js App Router + shadcn/ui
→ **หน้าตาต้องเหมือนเดิม แต่โครงสร้างต้องเป็นของใหม่ทั้งหมด**
→ ห้าม copy `global.css` เดิมมาวาง ให้ **แปลงค่าสี/ขนาดเดิมเป็น CSS variable ของ shadcn** แทน
→ ห้าม copy ไฟล์ component มาทั้งดุ้น ให้ **เขียนใหม่ให้ผลลัพธ์ทางสายตาเหมือนเดิม**

### C.1 อ่านโปรเจกต์เก่า (read-only เท่านั้น)

เปิด path ที่ผู้ใช้ให้ แล้วสำรวจ — **อย่าอ่านทั้งโปรเจกต์รวดเดียว** ให้ไล่เป็นชั้น:
1. `package.json` → รู้ stack เดิมและ lib ที่ใช้
2. โครง route/page → ได้รายการหน้า
3. โฟลเดอร์ component → ได้รายการ component + ตัวที่ถูกใช้ซ้ำบ่อย (ตัวเลือก shared)
4. ไฟล์ style/theme → ได้สีและ typography เดิม
5. API layer / service → ได้รายการ endpoint และ business logic
6. schema/model → ได้โครงข้อมูลเดิม

> ถ้าโปรเจกต์เก่าใหญ่มาก ให้ใช้ subagent `legacy-explorer` ทำ inventory
> เพื่อไม่ให้ context หลักบวมด้วยโค้ดเก่า

### C.2 ทำ Inventory + ตารางให้ผู้ใช้ติ๊ก

เขียน `docs/planning/03-legacy-inventory.md` เป็น **3 ตาราง** แล้ว **ถามผู้ใช้ทีละตาราง**
(อย่ายิง 3 ตารางพร้อมกัน — ยาวเกินไป ผู้ใช้จะตอบไม่ครบ)

**ตาราง 1 — หน้าจอ**
| # | หน้าเดิม | path เดิม | สรุปว่าทำอะไร | เอาไหม | เปลี่ยนอะไร |
|---|---|---|---|---|---|
| 1 | Login | /login | ... | ⬜ เอา / ⬜ ไม่เอา / ⬜ เอาแต่แก้ | |

**ตาราง 2 — Component**
| # | component เดิม | ใช้ที่หน้าไหน | ใช้ซ้ำกี่ที่ | มีใน shadcn แล้วไหม | เอาไหม | เป็น shared ไหม |
|---|---|---|---|---|---|---|

**ตาราง 3 — Function / Business logic**
| # | ฟังก์ชัน/flow | อยู่ไฟล์ไหน | ทำอะไร | เอาไหม | ต้องแก้กติกาไหม |
|---|---|---|---|---|---|

สำหรับทุกแถวที่ตอบ **"เอาแต่แก้"** ต้องถามต่อว่า *แก้อะไร* แล้วจดให้ชัด
เพราะบรรทัดนี้จะกลายเป็น acceptance criteria ตอนเขียนโค้ด

### C.3 คำถามที่ต้องถามเพิ่มเสมอในโหมดนี้
1. "มีหน้าไหนที่ **ไม่ชอบ** ของเดิม อยากให้ออกแบบใหม่ไหม"
2. "feature ใหม่ที่ของเดิมไม่มี มีอะไรบ้าง"
3. "ข้อมูลเดิมต้อง migrate มาไหม หรือเริ่มใหม่"
4. "ของเดิมมีบั๊ก/ข้อจำกัดอะไรที่ห้ามติดมาด้วย"

---

## เส้นทาง D — `CLAUDE_DESIGN` (ออกแบบผ่าน claude.ai/design ก่อน แบบ hybrid, ตัวเลือกเสริม)

> ใช้แทนข้อ 5 ของเส้นทาง B เมื่อผู้ใช้อยากได้หน้าตาที่ **confirm เป็นภาพจริงก่อนลงมือ** ไม่ใช่แค่ wireframe เป็นข้อความ
> และมี claude.ai login ที่มี design scope (ต้องเปิด `/design-login` ถ้ายังไม่เคย)
> **ไม่ใช่ default** — ถ้าไม่มี access ตรงนี้ ให้กลับไปใช้เส้นทาง B ข้อ 5 ตามปกติ

### D.0 หลักคิดที่ต้องยึด

Canvas (`.dc.html` artboard) เป็น mockup ภาพ/HTML ไม่ใช่ component จริง — **ห้าม copy โค้ด/สไตล์จาก canvas มาวางตรงๆ**
ต้องแปลงเป็น shadcn + theme token + i18n เสมอ เหมือนกติกาการหยิบ UI จากโปรเจกต์เก่า
(ดู `standards/ui-component-rules.md` ข้อ 6) — canvas ให้แค่ "หน้าตาที่ยืนยันแล้ว" ไม่ใช่ source code

**canvas ไม่มีคำตอบให้กับสิ่งที่ไม่ได้ถาม** — ถ้าเปิด canvas โดยไม่ล็อกสี/ฟอนต์/icon/states/viewports ไว้ก่อน
มันจะเดาแทนทุกหน้าไม่เหมือนกัน แล้วโค้ดจะ "ตรง 100%" ไม่ได้ตั้งแต่ต้น → ต้องมี **Design Brief** ที่เห็นชอบก่อนเสมอ

### D.1 ขั้นตอน

1. **ทำ Design Brief ส่วนที่ 1 (ระดับโปรเจกต์)** จาก `project-kit/templates/design-brief.tpl.md` → `docs/design/brief.md`
   ถามทีละหมวดให้ผู้ใช้ตอบ (reference · สี · typography · shape/space · core components · shell/viewports · icon set · motion · content/i18n)
   — ข้อ 1–4 ของเส้นทาง B รวมอยู่ในหมวด reference/สี แล้ว ไม่ต้องถามซ้ำ
   ต้องได้ `status: confirmed` ก่อนไปข้อถัดไป **แก้ brief ส่วนที่ 1 ทีหลัง = token-level change กระทบทุกหน้า**
2. **design storybook ก่อน ไม่ใช่ design หน้าก่อน** — ใช้ skill `design` สร้าง canvas ของ core components ที่ติ๊กไว้ใน brief 1.5
   (button, input, dialog, table, ... ครบทุก variant/state) ให้ผู้ใช้ยืนยันเป็นภาพ แล้วค่อยเอาชุดนี้ไปประกอบหน้า
   ถ้า design หน้าก่อนแล้วค่อยแกะ component ทีหลัง จะได้ปุ่มคนละแบบในแต่ละหน้า
3. **ตอบ brief ส่วนที่ 2 (ระดับงาน)** สำหรับชุดหน้าที่จะ design รอบนี้: scope · viewports (ทุกหน้าต้องมี artboard ครบตาม brief 1.6
   ไม่ใช่แค่ desktop — มือถือที่ไม่มี artboard จะถูก "เดา" ตอนเขียนโค้ด) · states (empty/loading/error หรือใช้ pattern กลางจาก storybook)
   · content (ภาษา + ข้อมูลตัวอย่างยาวเท่าของจริง) · deviation policy
4. ใช้ skill `design` สร้าง canvas ของหน้าจอ **โดยประกอบจาก storybook ในข้อ 2** วาง artboard ตามจำนวนหน้า × viewport × state ที่ตกลง
5. ส่ง URL canvas ให้ผู้ใช้ (หรือ UX/UI) ไปแก้เองที่เว็บ (click-to-select, properties panel) จนพอใจ แล้ว publish
6. อ่าน canvas เวอร์ชันที่ confirm แล้วกลับมา สกัด token + ทำ inventory หน้าจอ/component เหมือนเส้นทาง A ข้อ 2–6
   **สีหรือฟอนต์ที่โผล่ใน canvas แต่ไม่อยู่ใน brief** → ถามว่าจะเพิ่มเป็น token หรือแก้ canvas ห้ามเงียบ ๆ เพิ่ม token เอง
7. บันทึก source HTML ของแต่ละ artboard ที่ confirm แล้วลง `docs/design/canvas/<screen-name>.dc.html` แล้ว commit เข้า repo —
   นี่คือ baseline ตั้งต้นที่ Phase 8.8 จะ diff ด้วยทุกครั้งที่มีการแก้ canvas ต่อไป
8. บันทึก URL canvas + เวอร์ชันล่าสุดที่ sync แล้วไว้ใน `docs/design/brief.md` (ส่วน "ผล") และ `_state.md`
   — จะใช้เป็นจุดอ้างอิงตอนวน loop ปรับ UI ใน Phase 8 (ข้อ "UI drift sync ผ่าน Claude Design")
   `design_system_project` ใน brief จะได้ค่าตอน Phase 6 push storybook ครั้งแรก

> หลังจบ Phase นี้ **ทุกหน้าใหม่ที่เพิ่มทีหลัง** ต้องผ่าน `/ui` ซึ่งจะถาม brief ส่วนที่ 2 และแนบ Design System project เดิม
> ให้ canvas ประกอบจาก component ที่มีจริง — ไม่ต้องกลับมาทำ Phase 3 ซ้ำ (ดู `claude-setup/skills/ui/SKILL.md`)

---

## ทำทุกเส้นทาง (หลังจบเส้นทางของตัวเอง)

### 1. Theme — `docs/design/theme.md`
ต้องสรุปให้ครบและ **ผู้ใช้ยืนยันแล้ว**:
- ชุดสี light + dark เป็น CSS variable ตามชื่อของ shadcn/ui
- font (ไทย + อังกฤษ) — **ต้องเลือก font ที่มี glyph ไทยครบ** เช่น IBM Plex Sans Thai, Noto Sans Thai, Sarabun
  และระบุ fallback stack
- ขนาด/น้ำหนักตัวอักษร, spacing scale, radius, shadow
- กติกา: **ห้ามใส่สี hex ดิบใน component ทุกกรณี** ต้องอ้าง token เท่านั้น

### 2. i18n — `docs/design/i18n.md`
- ภาษาเริ่มต้น `th`, มี `en` (ล็อกไว้แล้ว)
- โครง key: `<namespace>.<screen>.<element>` เช่น `auth.login.submitButton`
- แยกไฟล์ตาม namespace ไม่ใช่ไฟล์ยักษ์ไฟล์เดียว
- กติกา **ห้าม hardcode ข้อความใน component** รวมถึง placeholder, aria-label, ข้อความ error, toast
- วางแผนเรื่องที่คนมักลืม: รูปแบบวันที่/เวลา, สกุลเงิน, ตัวเลข, พหูพจน์, ข้อความ validation ของ zod
- ความยาวข้อความไทย/อังกฤษไม่เท่ากัน → layout ต้องไม่พังเมื่อสลับภาษา

### 3. Component inventory — `docs/design/components.md`
| component | ที่มา (shadcn / ประกอบเอง / สร้างใหม่) | shared หรือเฉพาะหน้า | ใช้ที่ไหนบ้าง | สถานะ | deviation จาก design |

คอลัมน์ `deviation` ว่างไว้ตอนนี้ — ใช้ตอน build (Phase 7+) เมื่อผู้ใช้ตกลงให้โค้ดต่างจาก canvas/design ตรงจุดไหน
(รายละเอียดใน `project-kit/standards/ui-component-rules.md` ข้อ 8)

กติกาการตัดสินว่าเป็น shared: **ถ้ามีโอกาสถูกใช้ ≥ 2 ที่ → ทำเป็น shared ตั้งแต่แรก**
(รายละเอียดเต็มใน `project-kit/standards/ui-component-rules.md`)

### 4. `docs/planning/03-ui-design.md`
รวม: รายการหน้าจอทั้งหมด, sitemap/flow, การตัดสินใจเรื่อง theme, ประเด็นที่ยังค้าง

## ก่อนจบ Phase
อัปเดต `_state.md` → สรุปจำนวนหน้า/component/shared → ระบุสิ่งที่ยังไม่มี design
→ บอกให้พิมพ์ `ทำ Phase ต่อไป` → **หยุด**
