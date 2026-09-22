# Machine-readable artifact versioning

มาตรฐานนี้กำหนด contract สำหรับไฟล์ที่ Buaflow เป็นเจ้าของและมีโปรแกรมอ่านโดยตรง เพื่อให้ CLI, agent adapter และโปรเจกต์คนละรุ่นแลกเปลี่ยนข้อมูลกันโดยไม่เดารูปแบบ

## Registry

`schemas/registry.json` เป็นรายการ canonical ของ artifact type, เวอร์ชันล่าสุด, schema, path ปกติ และ migration support

| Artifact type | Classification | ตำแหน่งในโปรเจกต์ | v1 schema |
|---|---|---|---|
| `stack-config` | public | `.claude/stack.json` | `schemas/stack-config.schema.json` |
| `readiness-manifest` | public | `docs/evidence/readiness.json` | `schemas/readiness-manifest.schema.json` |
| `prototype-flow` | public | `docs/design/prototype/flow.json` | `schemas/prototype-flow.schema.json` |
| `pixel-config` | public | `docs/design/pixel.json` | `schemas/pixel-config.schema.json` |
| `project-manifest` | public | `.buaflow/project.json` | `schemas/project-manifest.schema.json` |
| `product-graph` | public | `docs/planning/product-graph.json` | `schemas/product-graph.schema.json` |
| `application-profile` | public | `.claude/profiles/*.json` | `schemas/application-profile.schema.json` |
| `pack` | public | `.claude/packs/*.json` | `schemas/pack.schema.json` |
| `product-development-state` | internal | `development/state.json` | `development/state.schema.json` |

ไฟล์ที่ไม่อยู่ภายใต้ Buaflow schema:

- `.claude/settings.json` เป็น contract ของ Claude Code; Buaflow ให้ template แต่ไม่อ้าง ownership
- `package.json` เป็น contract ของ package manager
- prototype data JSON เป็นข้อมูลโดเมนของแต่ละโปรเจกต์
- Markdown/frontmatter ของ intent/spec/plan/task ยังเป็น legacy semi-structured artifact — `IC-001` กำหนด canonical model ของผลลัพธ์ Intent Compiler แล้ว (`product-graph`) แต่ยังไม่ผูกเข้ากับ intent/spec/plan/task จนกว่า IC-002/IC-003/PP-001 จะเชื่อมต่อ; BF-006 ไม่เปลี่ยนความหมายของมันแบบครึ่งทาง

## Required metadata

Public JSON artifact ทุกไฟล์ต้องมี:

```json
{
  "$schema": "<path หรือ URI ของ JSON Schema>",
  "schemaVersion": "1.0"
}
```

- `schemaVersion` เป็นข้อมูลที่ runtime/migrator เชื่อ ใช้รูป `MAJOR.MINOR`
- `$schema` เป็น discoverability/editor hint และอาจเป็น relative path; ห้ามใช้แทน `schemaVersion`
- canonical identity ของ schema อยู่ใน `$id` ภายใน schema

## Compatibility rules

### Major

เพิ่มเมื่อการเปลี่ยนแปลงทำให้ consumer เดิมตีความผิด เช่น rename/remove field, เปลี่ยนหน่วยหรือความหมาย, เปลี่ยน required structure

- reader ต้องปฏิเสธ major ที่ไม่รู้จัก
- ต้องมี explicit migrator หรือระบุ `manual`
- migration ต้องมี fixture ก่อน/หลังและ regression test

### Minor

เพิ่มเมื่อเป็น additive optional field หรือเพิ่ม enum/capability ที่ consumer เดิมไม่จำเป็นต้องใช้

- runtime reader ใน major เดียวกันควร ignore field ที่ไม่รู้จัก แต่ qualification validator เช่น readiness ต้องปฏิเสธ minor ที่ใหม่กว่าจนกว่าจะรู้จัก control ล่าสุด เพื่อไม่รายงานผ่านแบบขาดเงื่อนไขใหม่
- validator ต้องใช้ schema ของ minor ที่ artifact ประกาศ ไม่ใช่ schema เก่า
- การทำ field เดิมให้ required ถือเป็น breaking change เว้นแต่ migrator เติมค่า deterministic ได้ก่อน validation

ไม่มี patch version ใน artifact เพราะแก้คำอธิบาย/schema bug ที่ไม่เปลี่ยนข้อมูลไม่ควรบังคับ rewrite ทุก repository เวอร์ชัน release ของตัว Buaflow ใช้ SemVer แยกต่างหาก

## Reader behavior

1. ไม่มี `schemaVersion` = legacy/unversioned; อ่านได้เฉพาะ adapter ที่ประกาศรองรับ และต้องรายงานว่าควร migrate
2. major สูงกว่าที่รู้จัก = fail พร้อมข้อความ upgrade; ห้ามเดา
3. major ต่ำกว่า = migrate ก่อนใช้ feature ใหม่
4. artifact malformed = fail; ห้าม fallback ไป default แบบเงียบสำหรับ readiness claim
5. config ที่เกี่ยวกับ editor convenience อาจ fail-open ระหว่าง adoption ได้ แต่ production gate ต้อง fail-closed ตาม `assuranceMode`

## Migration rules

ใช้:

```bash
# preview ไป stdout; ไม่แก้ไฟล์
node scripts/migrate-artifact.js --type stack-config --file .claude/stack.json

# ตรวจอย่างเดียว: exit 0 = canonical, exit 1 = ต้อง migrate
node scripts/migrate-artifact.js --type stack-config --file .claude/stack.json --check

# เขียนแบบ atomic เมื่อผู้ใช้สั่งชัดเจน
node scripts/migrate-artifact.js --type stack-config --file .claude/stack.json --write
```

ข้อบังคับของ migrator:

- default เป็น preview ไม่เขียนทับ
- `--write` เท่านั้นที่เปลี่ยนไฟล์ และเขียน temp file แล้ว rename ใน directory เดียวกัน
- preserve field ที่ไม่เกี่ยวและไม่สร้างค่าธุรกิจขึ้นเอง
- idempotent: migrate ซ้ำต้องไม่เปลี่ยนผล
- ปฏิเสธ future version ที่ไม่รู้จัก
- schema validation/semantic validator ต้องรันหลัง migration

## การเพิ่ม artifact หรือ version ใหม่

1. เพิ่ม/แก้ schema โดยมี `$id` ใหม่
2. เพิ่ม registry entry หรือเปลี่ยน `latestVersion`
3. เพิ่ม before/after fixtures
4. เพิ่ม migration function และ idempotence test
5. ปรับ template/generator ก่อน reader
6. เพิ่ม upgrade note และ compatibility test กับเวอร์ชันก่อนหน้า
7. ห้ามลบ migrator เก่าจนพ้น support window ที่ประกาศไว้
