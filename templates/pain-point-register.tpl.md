# ทะเบียน Pain Point — <ชื่อโปรเจกต์>

> **เก็บที่ `docs/discovery/pain-point-register.md`** — ใช้คู่กับ `evidence-register.tpl.md` และ
> `process-flow.tpl.md` (ช่อง pain-point id ของฝั่ง as-is จะโยงมาที่ ID ในทะเบียนนี้)
> เงื่อนไขเมื่อไหร่ต้องใช้: `docs/standards/discovery-and-validation.md`
>
> **หลักการ:** pain point หนึ่งข้อต้องมี `evidence_id` อย่างน้อยหนึ่งรายการที่มีจริงในทะเบียนหลักฐาน
> ห้ามเขียน pain point จากความรู้สึกล้วน ๆ — ถ้ายังไม่มีหลักฐานให้ไปเก็บหลักฐานก่อน หรือระบุ confidence เป็น `assumed`
> อย่างตรงไปตรงมาแล้วตั้งเป็นสิ่งที่ต้องตรวจสอบก่อนลงมือทำใหญ่

## กฎ
- 1 แถว = ปัญหา 1 อย่างที่เกิดที่ step ใด step หนึ่งของ workflow (ไม่ใช่ 1 feature request)
- **`root_cause` ต้องแยกจาก `symptom`** — อาการที่เห็นกับสาเหตุจริงมักไม่ใช่เรื่องเดียวกัน
  ยังไม่รู้ root cause จริง → เขียนว่า "ไม่ทราบ — ต้องสอบเพิ่ม" อย่าเดา
- `priority` ตัดสินจาก `frequency` × `impact` ร่วมกัน ไม่ใช่จากใครพูดเสียงดังที่สุด

## ระดับ

| field | ค่า | ความหมาย |
|---|---|---|
| `frequency` | `every-time` \| `often` \| `sometimes` \| `rare` | เกิดบ่อยแค่ไหนต่อรอบการใช้งานปกติ |
| `impact` | `blocking` \| `high` \| `medium` \| `low` | ถ้าไม่แก้ ผลเสียแค่ไหน (`blocking` = ทำงานต่อไม่ได้เลย) |
| `confidence` | `measured` \| `observed` \| `reported` \| `assumed` | เหมือนทะเบียนหลักฐาน — ความเชื่อมั่นว่านี่คือปัญหาจริง |
| `priority` | `P0` \| `P1` \| `P2` \| `P3` | สรุปจาก frequency + impact ให้คนอ่านเร็ว ไม่ต้องคำนวณเอง |

---

## ทะเบียน

| ID | workflow/step | symptom | evidence_id | frequency | impact | workaround ปัจจุบัน | root_cause | confidence | priority |
|---|---|---|---|---|---|---|---|---|---|
| PP-000 | <ชื่อ workflow — ชื่อ step> | <อาการที่เห็น ไม่ใช่สาเหตุ> | EVD-xxx | every-time \| often \| sometimes \| rare | blocking \| high \| medium \| low | <ผู้ใช้ทำยังไงตอนนี้เพื่อเลี่ยงปัญหา — ไม่มีก็เขียนว่าไม่มี> | <สาเหตุจริง หรือ "ไม่ทราบ — ต้องสอบเพิ่ม"> | measured \| observed \| reported \| assumed | P0 \| P1 \| P2 \| P3 |

<!-- เพิ่มแถวใหม่ต่อท้าย ห้ามลบแถวเดิม — pain point ที่แก้แล้วให้ขีดฆ่าหรือเติมคอลัมน์ "แก้แล้วเมื่อ" แทนการลบ -->

---

> **กติกา:** pain point ที่ไม่มี `evidence_id` อ้างอิงได้จริง คือความเห็น ไม่ใช่ปัญหาที่พิสูจน์แล้ว —
> ถ้ายังไม่มีหลักฐาน ให้เก็บหลักฐานก่อนแล้วค่อยเขียนแถวนี้ อย่าใส่ EVD-xxx มั่ว ๆ เพื่อให้ผ่าน
