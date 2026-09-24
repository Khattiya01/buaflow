# Discovery and Validation — ชั้นหลักฐานก่อน Intent Compiler

เอกสารนี้ตอบคำถามเดียว: **"งานนี้ต้องเก็บหลักฐาน/แมป process ก่อนเปิด `/intent` ไหม หรือข้ามไปเลยได้"**

> เพิ่มเข้ามาหลังทบทวนงานวิจัยภายนอก "AI-Native SDLC + Agentic Engineering" (22 กันยายน 2026 — ดู `development/state.json` D-005)
> Phase 1 (`phases/01-discovery.md`) เก็บ requirement ระดับ MoSCoW และ Phase A (`phases/A-adopt-existing.md`)
> เก็บ technical inventory ของโค้ดเดิม — ทั้งสองไม่มีชั้นที่เก็บ **หลักฐานของปัญหา** และ **process จริงที่คนทำอยู่**
> ก่อนเริ่มเขียน requirement เอกสารนี้เติมช่องว่างนั้น

## หลักการที่ห้ามลืม

**ชั้นนี้เป็นทางเลือกตามขนาดงาน ไม่ใช่ของบังคับทุก `/intent`** — ตาม principle "Progressive rigor"
ใน `BUAFLOW_PRODUCT_ROADMAP.md` ข้อ 3 (งานเล็กไม่แบกพิธีเท่า regulated system) ถ้าทำให้เป็นข้อบังคับทุกงาน
คนจะเลิกใช้ทั้งระบบเหมือนที่ `workflow-lifecycle.md` เตือนไว้เรื่อง track: trivial

## เมื่อไหร่ต้องทำ (required)

ทำชั้นนี้ก่อนเปิด `/intent` เมื่อเข้าเงื่อนไข **ข้อใดข้อหนึ่ง**:

| เงื่อนไข | ตัวอย่าง |
|---|---|
| **New-product** — เริ่มจากศูนย์ ยังไม่มีระบบเดิมให้ดู | ทำแอปใหม่ทั้งก้อนให้ธุรกิจที่ไม่เคยมีระบบมาก่อน |
| **Major initiative** — กระทบหลาย workflow/role พร้อมกัน และคาดว่าใช้เวลาเกินหนึ่ง milestone | ปรับกระบวนการอนุมัติทั้งสายงาน, รวมสองระบบเดิมเข้าด้วยกัน |
| **ปัญหายังเป็นแค่ความเห็น** — ไม่มีใครในห้องบอกตัวเลข/หลักฐานของปัญหาได้ตอนนี้ | "ผู้ใช้บ่นว่าช้า" โดยไม่มีใครรู้ว่าช้าตรงไหน ช้าแค่ไหน บ่อยแค่ไหน |

เข้าเงื่อนไขข้อใดข้อหนึ่ง → ทำ evidence register + process flow (as-is อย่างน้อย) + pain-point register
**ก่อน** เปิด `/intent` — `/intent` ที่ตามมาอ้างอิงกลับมาที่ pain point id เหล่านี้

## เมื่อไหร่ข้ามได้ (optional — ค่าเริ่มต้น)

ข้ามชั้นนี้แล้วเปิด `/intent` ตรง ๆ ได้เมื่อ:

- เพิ่ม/แก้ feature ใน product ที่เข้าใจอยู่แล้ว ไม่ใช่ major initiative
- ปัญหามีหลักฐานชัดอยู่แล้ว (มาจาก incident, metric ที่ track อยู่แล้ว, user บ่นพร้อมรายละเอียดเจาะจง) —
  เขียนหลักฐานนั้นลงใน `/intent` ตรงหัวข้อ "หลักฐาน" พอ ไม่ต้องเปิดทะเบียนแยก
- bug, งานเล็ก, งานที่เข้าเกณฑ์ `track: trivial` อยู่แล้ว (ดู `/intent` ขั้น 0 ใน `core/skills/intent.md`)

**ค่าเริ่มต้นคือข้าม** — ต้องมีเหตุผลชัดเจนตามตารางด้านบนถึงจะทำชั้นนี้ ไม่ใช่ทำ "เผื่อไว้"

## ความสัมพันธ์กับขั้นอื่น

```
Discovery and Validation (ทางเลือก — เฉพาะ new-product/major-initiative)
   evidence-register → process-flow (as-is → to-be) → pain-point-register
              │
              ▼
Phase 1 (โปรเจกต์ใหม่) / Phase A (โปรเจกต์เดิม)
   อ่าน pain-point-register ประกอบตอนถามกลุ่ม B (ขอบเขต) — ไม่ต้องถามซ้ำสิ่งที่ทะเบียนตอบแล้ว
              │
              ▼
/intent  (อ้าง pain-point id ในหัวข้อ "หลักฐาน" ถ้ามี · ถาม brief: open | fixed)
              │
              ▼
/elaborate  (เฉพาะ brief: open — IC-007)
              │
              ▼
/spec หรือ task ตรง ๆ  →  ...เหมือนเดิมตาม workflow-lifecycle.md
```

ชั้นนี้กับ `/elaborate` ตอบคนละคำถาม: discovery หาว่า **ผู้ใช้เจ็บตรงไหนจริง** จากหลักฐานของผู้ใช้เอง ·
`/elaborate` หาว่า **คำขอที่ได้มาขาดอะไรไปจากเป้าหมาย** จากความรู้ของโดเมน การ research และระบบที่มีอยู่
แล้วเสนอให้คนตัดสิน · งานที่ลูกค้าให้ requirement มาตรง ๆ ส่วนใหญ่ต้องใช้แค่อย่างหลัง

ชั้นนี้ผลิตแค่ 3 อย่าง (ดู `templates/`):

| ไฟล์ | เทมเพลต | เก็บที่ |
|---|---|---|
| ทะเบียนหลักฐาน | `templates/evidence-register.tpl.md` | `docs/discovery/evidence-register.md` |
| Process flow ต่อ workflow | `templates/process-flow.tpl.md` | `docs/discovery/process-flow/PF-xxx-<slug>.md` |
| ทะเบียน pain point | `templates/pain-point-register.tpl.md` | `docs/discovery/pain-point-register.md` |

## กติกาคุณภาพ (ทำแล้วต้องทำให้ถูก ไม่ใช่แค่ทำ)

1. **pain point ทุกข้อต้องมี evidence id อ้างอิงได้จริง** — pain point ที่ไม่มีหลักฐานคือความเห็น
2. **as-is ต้องให้เจ้าของ process ยืนยันก่อนเขียน to-be** — เสนอทางแก้ก่อนเข้าใจปัญหาจริงคือสาเหตุอันดับต้น ๆ
   ที่ระบบใหม่ไปไม่โดนปัญหาจริง (ดู `templates/process-flow.tpl.md`)
3. **`confidence` ต้องตรงความจริง** — `assumed` ไม่ใช่คำที่ต้องเลี่ยง ถ้ายังไม่มีหลักฐานจริงให้บอกตรง ๆ
4. **to-be ทุกแถวต้องตอบได้ว่าแก้ pain point ข้อไหน** — ถ้าตอบไม่ได้คือ scope creep ไม่ใช่ discovery

## สิ่งที่ยังไม่ทำในชั้นนี้ (DV-001 เท่านั้น)

- **Traceability อัตโนมัติ** (docs-lint เตือนถ้า intent ไม่อ้าง pain point) — เป็น DV-002
- **Business outcome review หลัง release** (วัดว่า pain point ถูกแก้จริงไหมหลังส่งมอบ) — เป็น DV-003 แยกจาก
  config-learning loop เดิมของ Phase 8
- **schema/validator แบบเครื่องอ่านได้** ของทะเบียนเหล่านี้ — ตอนนี้เป็น markdown ล้วนตามเทมเพลต
  ยังไม่มี JSON schema/registry แบบ artifact อื่นใน `schemas/` เพราะยังไม่มีเครื่องมือไหนต้อง parse มันอัตโนมัติ
  (ต่างจาก `state.json`/`readiness.json` ที่ gate ต้องอ่าน) — ถ้า DV-002 ต้องการ parse จริงจัง ค่อยพิจารณาตอนนั้น
