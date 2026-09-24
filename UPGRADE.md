# อัปเกรดโปรเจกต์ที่ใช้ kit เวอร์ชันเก่า

> เวอร์ชันล่าสุด: **v3.13.0** · ไม่รู้ว่าโปรเจกต์ใช้รุ่นไหน → `node buaflow/bin/buaflow.js lock` (ถ้ามี `.buaflow/lock.json`)
> หรือดูแถวสัญญาณใน [START-HERE.md](START-HERE.md) ข้อ 2.1 · **ใช้ Buaflow จาก plugin?** พิมพ์ `/buaflow:start` — มันพาทำหัวข้อทางลัดนี้ให้

**จาก v2.3.4 ขึ้นไป → ใช้ [ทางลัดรอบเดียว](#fast-path) ได้เลย** ไม่ต้องไล่ทีละรุ่น · ตารางข้างล่างมีไว้สำหรับคนที่อยากขยับทีละขั้น
หรืออยากรู้ว่าแต่ละรุ่นเปลี่ยนอะไร

| ใช้อยู่ | ไปที่ | ใช้เวลา |
|---|---|---|
| **v2.3.4 – v3.12.1** | [ทางลัด: ไป v3.13.0 ในรอบเดียว](#fast-path) | ~5 นาที + ขั้นที่ต้องลงมือถ้าเข้าเงื่อนไข |
| **v3.12.x** | [v3.12.1 → v3.13.0](#v3121--v3130-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที (+ เปิดการเก็บข้อมูลถ้าเป็นเครื่องภายใน) |
| **v3.12.0** | [v3.12.0 → v3.12.1](#v3120--v3121-patch--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที |
| **v3.11.x** | [v3.11.1 → v3.12.0](#v3111--v3120-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที |
| **v3.11.0** | [v3.11.0 → v3.11.1](#v3110--v3111-patch--ไม่ต้องคัดลอกอะไร) ข้างล่างนี้ | 0 นาที |
| **v3.10.0** | [v3.10.0 → v3.11.0](#v3100--v3110-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที |
| **v3.9.0** | [v3.9.0 → v3.10.0](#v390--v3100-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~2 นาที |
| **v3.8.x** | [v3.8.1 → v3.9.0](#v381--v390-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที |
| **v3.7.0** | [v3.7.0 → v3.8.0](#v370--v380-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที |
| **v3.6.0** | [v3.6.0 → v3.7.0](#v360--v370-minor--คัดลอกไฟล์ทับ-จบ) ข้างล่างนี้ | ~1 นาที |
| **v3.5.0** | [v3.5.0 → v3.6.0](#v350--v360-minor--คัดลอกไฟล์--แปลง-eval-case) ข้างล่างนี้ | ~5 นาที |
| **v3.4.0** | [v3.4.0 → v3.5.0](#v340--v350-minor--คัดลอกไฟล์--migrate-profile) แล้วต่อด้วย v3.6.0 | ~3 นาที |
| **v3.3.0** | [v3.3.0 → v3.4.0](#v330--v340-minor--คัดลอกไฟล์-จบ) แล้วต่อด้วย v3.5.0 | ~2 นาที |
| **v3.2.0** | [v3.2.0 → v3.3.0](#v320--v330-minor--คัดลอกไฟล์-จบ) แล้วต่อด้วย v3.4.0 | ~2 นาที |
| **v3.1.0** | [v3.1.0 → v3.2.0](#v310--v320-minor--คัดลอกไฟล์-จบ) แล้วต่อด้วย v3.3.0 | ~2 นาที |
| **v3.0.0** | [v3.0.0 → v3.1.0](#v300--v310-minor--คัดลอกไฟล์-จบ) แล้วต่อด้วย v3.2.0, v3.3.0 | ~3 นาที |
| **v2.3.4** | [v2.3.4 → v3.0.0](#v234--v300-major--ต้องลงมือถ้าเคยใช้-pack) แล้วต่อด้วย v3.1.0, v3.2.0 | ~2 นาที หรือนานกว่านั้นถ้ามี pack |
| **v2.3.3** | [v2.3.3 → v2.3.4](#v233--v234-copy-ไฟล์เดียว) แล้วต่อด้วย v3.0.0 ขึ้นไป | ~1 นาที |
| **v2.3.2** | [v2.3.2 → v2.3.3](#v232--v233-copy-ไฟล์--1-คำสั่ง) แล้วต่อด้วย v2.3.4 | ~3 นาที |
| **v2.3.1** | [v2.3.1 → v2.3.2](#v231--v232-copy-ไฟล์เดียว) แล้วต่อด้วย v2.3.3, v2.3.4 | ~4 นาที |
| **v2.3** | [v2.3 → v2.3.1](#v23--v231-copy-ไฟล์อย่างเดียว) แล้วต่อด้วย v2.3.2 | ~5 นาที |
| **v2.2** | [v2.2 → v2.3](#v22--v23-copy-ไฟล์อย่างเดียว) แล้วต่อด้วย v2.3.1 | ~15 นาที |
| **v2.1** | [v2.1 → v2.2](#v21--v22-เล็ก-ทำได้ระหว่าง-task) แล้วต่อด้วย v2.3 | ~15 นาที |
| **v1.0** | [v1.0 → v2.1](#v10--v21) แล้วต่อด้วย v2.2, v2.3 | ~1 session |

---

<a id="fast-path"></a>

## ทางลัด: จาก v2.3.4 หรือ 3.x รุ่นไหนก็ได้ → v3.13.0 ในรอบเดียว

ทำได้เพราะทุกรุ่นหลัง v3.0.0 เป็น MINOR/PATCH ([release policy](standards/release-policy.md)): ของเดิมทำงานเหมือนเดิม
และตัวตรวจใหม่ทำงาน**เฉพาะเมื่อโปรเจกต์มีไฟล์หลักฐานนั้น** ⇒ การอัปเกรดคือ "วางไฟล์ควบคุมชุดล่าสุด" บวกขั้นที่ต้องลงมือ
**เฉพาะโปรเจกต์ที่เข้าเงื่อนไขในข้อ 4**

> มาจาก v2.3.3 หรือเก่ากว่า → ทำตามหัวข้อของรุ่นนั้นจนถึง v2.3.4 ก่อน แล้วค่อยกลับมาที่นี่

### 1. เริ่มจาก tree ที่สะอาด แล้ววางเวอร์ชันใหม่

```bash
git status                     # ต้องไม่มีงานค้าง — ทุกขั้นข้างล่างย้อนกลับได้ด้วย git
```

- **ใช้โฟลเดอร์ `buaflow/`** → วางเวอร์ชันใหม่ทับของเดิม · **`git clone`/`git pull` ดีที่สุด** เพราะข้อ 2 ใช้ประวัติ git ของ kit
  แยกไฟล์รุ่นเก่าออกจากไฟล์ที่ทีมแก้เอง
- **ใช้ plugin** → `/plugin update buaflow@buaflow` แล้ว `/buaflow:start` · คำสั่งข้างล่างใช้ path ของ kit ใน plugin แทน `buaflow/`
  และเติม `--plugin` ทุกครั้ง

### 2. ดูก่อนว่าจะเปลี่ยนอะไร

```bash
node buaflow/bin/buaflow.js install
```

dry run — ไม่เขียนอะไร · บอกทุกไฟล์ว่าจะเป็นอะไร:

| สถานะ | แปลว่า |
|---|---|
| `create` | ยังไม่มีในโปรเจกต์ (ของที่รุ่นใหม่เพิ่มเข้ามา) |
| `update` | เป็นไฟล์ของ kit รุ่นเก่า — ตรงกับ `.buaflow/lock.json` หรือหาเจอในประวัติ git ของ kit → ทับได้ปลอดภัย |
| `unchanged` / `kept` | ตรงแล้ว · หรือเป็นของโปรเจกต์ที่ kit แค่ seed ให้ (`stack.json`, `rules/`, `settings.json`, `docs/templates/`) ซึ่งไม่ถูกแตะ |
| **`conflict`** | ไม่เคยเป็นไฟล์ของ kit รุ่นไหน = **ทีมแก้เอง** → ไม่ถูกทับ |

> ถ้า `buaflow/` ไม่ใช่ git checkout และโปรเจกต์ยังไม่มี lock ไฟล์เก่าของ kit จะขึ้น `conflict` ด้วย —
> ดูว่าไฟล์ไหนทีมแก้จริงด้วย `git log --oneline -- .claude/<ไฟล์>` ของโปรเจกต์

### 3. วางชุดใหม่

```bash
node buaflow/bin/buaflow.js install --write
```

คัดลอกทุกอย่างที่เป็น `create`/`update`, บันทึก `.buaflow/lock.json` และข้ามไฟล์ `conflict` · สำหรับแต่ละ `conflict`:
merge การแก้ของทีมเข้ากับไฟล์ใน kit ด้วยมือ **หรือ** ถ้าแน่ใจว่าไม่ต้องการการแก้นั้นแล้ว รันซ้ำด้วย `--force`

ของโปรเจกต์ที่ `install` ไม่แตะ — เปิดเทียบกับ `buaflow/claude-setup/` แล้วยกมาเฉพาะที่เกี่ยว:

- `stack.json` — ข้อความ reason ของ `components/ui/**` ฉบับใหม่ (ไม่สั่งให้รัน shadcn ทับของเดิมแล้ว) และ `commands.ciSetup`
  ถ้าจะใช้ `buaflow ci`
- `settings.json` — `permissions.allow` ต้องเป็นคำสั่งของ package manager ที่โปรเจกต์ใช้จริง

### 4. ขั้นที่ต้องลงมือ — เฉพาะเมื่อเข้าเงื่อนไข

| ถ้าโปรเจกต์มี | ต้องทำ | อ่าน |
|---|---|---|
| `.claude/packs/*.json` (pack 1.0) | เขียนใหม่เป็น pack 2.0 ด้วยมือ — ไม่มีตัวแปลงโดยตั้งใจ | [v2.3.4 → v3.0.0 ข้อ 2](#v234--v300-major--ต้องลงมือถ้าเคยใช้-pack) |
| `.claude/profiles/*.json` (profile 1.0) | `migrate-artifact.js --type application-profile --write` แล้วใส่เพดาน budget เอง (ไม่บังคับ — 1.0 ยังอ่านได้) | [v3.4.0 → v3.5.0 ข้อ 2](#v340--v350-minor--คัดลอกไฟล์--migrate-profile) |
| `docs/evals/*.md` (eval แบบเก่า) | แปลงเป็น `.json` ทีละเคส · ผลเก่าในตารางทิ้ง | [v3.5.0 → v3.6.0](#v350--v360-minor--คัดลอกไฟล์--แปลง-eval-case) |
| `Bash(*)` หรือ `bypassPermissions` ใน `settings.json` ที่ commit · secret ใน `.mcp.json` | เอาออก — `check-config` ตกตั้งแต่ 3.11.0 | [v3.10.0 → v3.11.0](#v3100--v3110-minor--คัดลอกไฟล์ทับ-จบ) |
| เปลี่ยนมาใช้ plugin แทนการคัดลอก | `install --plugin --write` แล้วลบรายการ hook ของ Buaflow ออกจาก block `hooks` ใน `.claude/settings.json` (`install` และ `doctor` เตือนให้) ไม่งั้น hook รันสองรอบ · ลบ `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` ที่มาจาก kit ได้ | [v3.11.1 → v3.12.0](#v3111--v3120-minor--คัดลอกไฟล์ทับ-จบ) |
| ติดตั้งแบบ `.claude/` (ไม่ใช้ plugin) และจะเปิดการเก็บข้อมูลการใช้งานภายใน | เพิ่ม hook `usage-capture` เองใน 4 จุดของ block `hooks` ใน `.claude/settings.json` — `install` seed ไฟล์นี้ครั้งเดียวจึงไม่เติมให้ · ไม่เพิ่ม = ยินยอมแล้วก็ไม่มีอะไรถูกบันทึก | [v3.12.1 → v3.13.0](#v3121--v3130-minor--คัดลอกไฟล์ทับ-จบ) |

ไม่มีข้อไหนตรง = ข้ามข้อนี้ทั้งข้อ

### 5. ตรวจ

```bash
node buaflow/bin/buaflow.js doctor
node .claude/gate.js
```

gate ผ่านเหมือนก่อนอัปเกรด = จบ · ของใหม่ที่อยากเริ่มใช้ (หลักฐานแต่ละชนิด, `buaflow ci`, `assess`, `benchmark`)
เริ่มทีละชิ้นได้ตามหัวข้อของรุ่นที่เพิ่มมันเข้ามาข้างล่าง ไม่ต้องทำพร้อมกัน

---

## v3.12.1 → v3.13.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
node buaflow/bin/buaflow.js install --write     # ใช้ plugin: เติม --plugin
```

ได้ `.claude/usage.js` และ hook `usage-capture` (ทาง plugin ได้ hook อัตโนมัติ) · **ไม่มีอะไรถูกบันทึกจนกว่าโปรเจกต์จะตอบรับ**
จึงไม่ต้องทำอะไรต่อถ้าไม่ได้ใช้ภายใน

**โปรเจกต์ที่ติดตั้งแบบ `.claude/` (ไม่ใช้ plugin):** `settings.json` ถูก seed ครั้งเดียว `install` จึงไม่เติม hook ให้ · อยากให้บันทึกได้
ต้องเพิ่มคำสั่ง `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/usage-capture.js"` (timeout 5) เองใน 4 จุดของ block `hooks`:
`SessionStart` (matcher `startup|resume|clear`), `SessionEnd` (ไม่มี matcher), `PostToolUse` (`Edit|Write|MultiEdit`) และ
`PreToolUse` (`Bash`) — ดูตัวอย่างใน `claude-setup/settings.json.tpl`

### เปิดการเก็บข้อมูล (เฉพาะเครื่องและโปรเจกต์ภายใน)

1. clone private repo ที่เก็บกลางไว้ในเครื่อง แล้วบอก Buaflow ครั้งเดียวต่อเครื่อง:
   ```bash
   node buaflow/bin/buaflow.js usage setup --store <path ของ clone>
   ```
2. เปิดโปรเจกต์แล้ว `/buaflow:start` — ถามครั้งเดียวว่าจะเก็บไหม (เครื่องที่ยังไม่ทำข้อ 1 จะไม่ถูกถาม) · หรือสั่งเอง:
   `node buaflow/bin/buaflow.js usage consent --enable`
3. commit `.buaflow/usage.json` — คำตอบใช้กับทุกคนในโปรเจกต์ · ปิดเมื่อไรก็ได้ด้วย `enabled: false` หรือ
   `usage consent --disable` ข้อมูลที่เก็บไปแล้วไม่หาย
4. ตรวจ: `usage status` บอกว่ายินยอมไหม ค้างกี่ event และ store อยู่ไหน · `usage sync` ส่งทันที

---

## v3.12.0 → v3.12.1 (PATCH — คัดลอกไฟล์ทับ จบ)

```bash
node buaflow/bin/buaflow.js install --write     # ใช้ plugin: เติม --plugin
```

`supply-chain.js` และ `operational-readiness.js` ยอมรับ digest ของไฟล์ข้อความที่ต่างกันแค่ line ending — record ที่เขียนบน Windows
(CRLF) เคยตกบน CI ที่เป็น Linux (LF) · ไฟล์ binary ยังเทียบทีละ byte และไฟล์ที่เนื้อหาเปลี่ยนจริงยังตกเหมือนเดิม ·
digest ที่ตัวตรวจรายงานในข้อความ error ตอนนี้เป็นแบบ LF ซึ่งเป็นค่าที่ควรบันทึก

---

## v3.11.1 → v3.12.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
node buaflow/bin/buaflow.js install --write
```

ของที่เปลี่ยนในโปรเจกต์: `check-config.js` รู้จักโปรเจกต์ที่ใช้ plugin, `security-baseline.js` หา control set ที่
`.claude/control-sets/` ก่อน และ `install` วาง control set ไว้ที่นั่นให้ CI ตรวจได้โดยไม่ต้องมี kit · ที่เหลืออยู่ฝั่ง kit
(`buaflow install`, `doctor`, plugin ที่มี kit ทั้งชุด + `/buaflow:start`)

**อยากย้ายมาใช้ plugin (ไม่บังคับ):**

```text
/plugin marketplace add Khattiya01/buaflow
/plugin install buaflow@buaflow
```

```bash
node buaflow/bin/buaflow.js install --plugin --write   # เติม enabledPlugins + extraKnownMarketplaces ให้ทีม
```

แล้วลบ hook ของ Buaflow ออกจาก block `hooks` ใน `.claude/settings.json` · หลังจากนั้นลบโฟลเดอร์ `buaflow/` ออกจากโปรเจกต์ได้
เพราะ gate และตัวตรวจอยู่ใน `.claude/` แล้ว และ kit มากับ plugin · เพื่อนร่วมทีมแต่ละคนรัน `/plugin install buaflow@buaflow`
ครั้งเดียว (marketplace ถูกเพิ่มให้อัตโนมัติจาก settings ของโปรเจกต์ แต่ plugin ไม่ถูกติดตั้งให้เอง) — gate ป้องกัน `main`
ได้เหมือนเดิมไม่ว่าใครจะลง plugin หรือไม่

---

## v3.11.0 → v3.11.1 (PATCH — ไม่ต้องคัดลอกอะไร)

ทั้งสองข้อแก้อยู่ในฝั่ง kit (`bin/buaflow.js`, `claude-setup/kit-lock.js`) ซึ่งรันจาก `buaflow/` โดยตรง — วางเวอร์ชันใหม่ทับ จบ

- `buaflow lock --write` เคยไม่เขียนอะไรเลยโดยไม่ error — ถ้าเคยรันแล้วไม่มี `.buaflow/lock.json` ให้รันอีกครั้ง
- lock เคยเรียกไฟล์ของ kit รุ่นเก่าว่า `customized` — ตอนนี้แยกเป็น `outdated` ได้เมื่อ `buaflow/` เป็น git checkout

---

## v3.10.0 → v3.11.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
cp buaflow/claude-setup/check-config.js .claude/check-config.js
node buaflow/bin/buaflow.js lock --write
```

สิ่งที่อาจเห็นต่าง: `check-config` **ตก** ถ้า `settings.json` ที่ commit มี `Bash(*)` หรือ `defaultMode: bypassPermissions`
หรือ `.mcp.json` ฝัง secret ตรง ๆ — สามอย่างนี้ไม่เคยเป็น config ที่ปลอดภัย · ถ้าจะใช้ plugin แทนการคัดลอก hooks ให้ลบ block `hooks`
ออกจาก `.claude/settings.json` ของโปรเจกต์ ไม่งั้น hook รันสองรอบ

---

## v3.9.0 → v3.10.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
for f in assumption-ledger.js change-proposal.js docs-lint.js gate.js; do cp buaflow/claude-setup/$f .claude/$f; done
cp -r buaflow/claude-setup/skills/* .claude/skills/
cp buaflow/templates/assumption-ledger.tpl.json buaflow/templates/change-proposal.tpl.json docs/templates/
```

สิ่งที่อาจเห็นต่าง: docs-lint มี warning ใหม่สำหรับ `[NEEDS CLARIFICATION: …]` ที่ไม่มี tag และ AC ที่ไม่ใช่ EARS — ไม่มีอะไรตก

---

## v3.8.1 → v3.9.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
cp buaflow/claude-setup/check-config.js .claude/check-config.js
```

`buaflow ci` ไม่ต้องคัดลอก — รันจาก kit · ถ้าจะใช้: ตั้ง `commands.ciSetup` ใน `.claude/stack.json` (ติดตั้ง dependency
และคัดลอกไฟล์ที่ไม่อยู่ใน git ด้วย `{source}/…`) แล้ว **commit** ก่อนรัน เพราะ clone เห็นแค่สิ่งที่ commit แล้ว

---

## v3.7.0 → v3.8.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
for f in check-config.js docs-lint.js board.js; do cp buaflow/claude-setup/$f .claude/$f; done
```

`buaflow benchmark` ไม่ต้องคัดลอก — มันรันจาก kit โดยตรง · สิ่งที่อาจเห็นต่าง: `check-config` อาจมี warn ใหม่ถ้า
`permissions.allow` ยังมีคำสั่ง `pnpm`/`yarn`/`bun` ที่โปรเจกต์ไม่ได้ใช้ — แทนด้วยคำสั่งจริงของโปรเจกต์ (warn ไม่บล็อก)

---

## v3.6.0 → v3.7.0 (MINOR — คัดลอกไฟล์ทับ จบ)

```bash
for f in readiness.js gate.js check-config.js stack-config.js; do cp buaflow/claude-setup/$f .claude/$f; done
cp buaflow/claude-setup/hooks/guard-bash.js buaflow/claude-setup/hooks/guard-edit.js .claude/hooks/
echo .verify-flakes.jsonl >> .gitignore
```

`buaflow assess` ไม่ต้องคัดลอก — มันรันจาก kit โดยตรง

**สิ่งที่อาจเห็นต่างจากเดิม:**

- `readiness` ตก ถ้า `generatedAt` ของ manifest อยู่ในอนาคตเกิน 5 นาที — แก้นาฬิกาเครื่องหรือ timestamp
  ไม่มีทางอื่นที่ manifest แบบนั้นจะเป็นของจริง
- verify ที่ตกใน gate จะถูกรันซ้ำหนึ่งครั้ง — ถ้า verify ของคุณช้าและอยากให้ตกทันที ตั้ง `BUAFLOW_NO_FLAKE_CHECK=1`
- `stack.json` ที่คัดลอกข้อความ reason ของ `components/ui/**` จาก kit ไปไว้ ยังใช้ได้ แต่ข้อความเดิมแนะนำทางที่
  เขียนทับ component ที่แก้แล้ว — คัดลอก reason ใหม่จาก `buaflow/claude-setup/stack.json` หรือถอด pattern ออก
  ถ้า `ui/` ของคุณถูกแก้ไปแล้ว

---

## v3.5.0 → v3.6.0 (MINOR — คัดลอกไฟล์ + แปลง eval case)

**ใครได้รับผลกระทบจริง:** โปรเจกต์ที่มี `docs/evals/*.md` · ไฟล์เดิมไม่พัง มันแค่ไม่มีอะไรตรวจให้
ถ้าไม่มีโฟลเดอร์ `docs/evals/` เลย ข้ามหัวข้อนี้ได้ทั้งหัวข้อ

### 1. คัดลอกไฟล์

```bash
cp buaflow/claude-setup/eval-harness.js       .claude/eval-harness.js
cp buaflow/templates/eval-case.tpl.json       docs/templates/
cp buaflow/templates/eval-run.tpl.json        docs/templates/
cp buaflow/claude-setup/evals/README.md       docs/evals/README.md
mkdir -p docs/evals/runs
```

### 2. แปลงเคสเดิมเป็น JSON

ไม่มี migrator ให้ และนั่นคือความตั้งใจ — เคส Markdown เก็บ checklist ไว้เป็นบรรทัดร้อยแก้ว
ที่ไม่มี id · การแปลงอัตโนมัติจะต้อง**ตั้ง id ให้เกณฑ์แต่ละข้อเอง** ซึ่งเป็นสิ่งที่ทั้งรูปแบบนี้
ตั้งอยู่บนมัน ⇒ ให้คน (หรือ agent ที่เปิดไฟล์เดิมอยู่ตรงหน้า) เป็นคนตัดสิน

เปิด `docs/templates/eval-case.tpl.json` แล้วย้ายทีละเคส:

| ของเดิม | ไปเป็น |
|---|---|
| หัวข้อ "สิ่งที่ต้องเกิด" | `criteria[]` ที่ `kind: "must-happen"` |
| หัวข้อ "สิ่งที่ต้องไม่เกิด" | `criteria[]` ที่ `kind: "must-not-happen"` |
| หัวข้อ "ที่มา" | `origin` + `observedIn` (ถ้าเป็นความพลาดจริง) |
| `tests:` ใน frontmatter | `tests[]` — **ต้องเป็น path ที่มีอยู่จริง** |
| หัวข้อ "รอบเปรียบเทียบ" | `ablation` |
| ตาราง "ผลการรันล่าสุด" | **ทิ้ง** — ดูข้อ 3 |

```bash
node .claude/eval-harness.js --cases docs/evals --root .
node .claude/eval-harness.js --render docs/evals/EV-001.json   # ทานกับของเดิม
```

### 3. ผลเก่าในตารางนั้นแปลงไม่ได้ และไม่ควรแปลง

แถวเดิมไม่ได้บอกว่าตัดสิน**เคสเวอร์ชันไหน** ไม่ได้บอกว่า**ใครตัดสิน** และไม่ได้บอกว่า
**session สะอาดไหม** — สามอย่างนี้คือทั้งหมดที่ทำให้ผลมีความหมาย

⇒ **เริ่ม run record ใหม่จากศูนย์** แล้วเก็บไฟล์ `.md` เดิมไว้เป็นบันทึกประวัติถ้าอยากเก็บ
การยกตัวเลขเก่ามาใส่ในรูปแบบใหม่ คือการทำให้ข้อมูลที่ตรวจกลับไม่ได้ดูเหมือนตรวจกลับได้

> ⛔ ถ้าคนที่แปลงเคสคือคนเดียวกับที่เขียน `AGENTS.md`/rules อยู่ตอนนี้
> **อย่าเพิ่งรันเอง** — `gradedBy` ต้องไม่ใช่ `authoredBy` และ harness ปฏิเสธให้เอง

### 4. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
```

---

## v3.4.0 → v3.5.0 (MINOR — คัดลอกไฟล์ + migrate profile)

**ใครได้รับผลกระทบจริง:** โปรเจกต์ที่มี `.claude/profiles/*.json` จะได้ประโยชน์ แต่ไม่ถูกบังคับ —
profile 1.0 ยังอ่านได้ปกติ มันแค่ไม่มี budget

### 1. คัดลอกไฟล์

```bash
cp buaflow/claude-setup/budgets.js            .claude/budgets.js
cp buaflow/claude-setup/application-profile.js .claude/application-profile.js
cp buaflow/claude-setup/gate.js               .claude/gate.js
```

### 2. เลื่อน profile เป็น 1.1 แล้วใส่เพดานเอง

```bash
node buaflow/scripts/migrate-artifact.js --type application-profile --file .claude/profiles/<id>.json --write
```

migrator เลื่อนเลขเวอร์ชันให้อย่างเดียว **ไม่เติม budget ให้** และนั่นคือความตั้งใจ — การเติมคือ
การตัดสินใจแทนคุณว่ามาตรฐานของแอปชนิดนี้คืออะไร เปิด `standards/profile-budgets.md` แล้วดู
ตารางเพดานของ `content` / `saas` / `internal-crud` เป็นจุดตั้งต้น

### 3. (ถ้าต้องการใช้) สร้าง budget record

```bash
cp buaflow/templates/budget-evidence.tpl.json docs/evidence/budgets.json
node .claude/budgets.js --file docs/evidence/budgets.json
```

> ตัวตรวจ derive ตัวเลขจากไฟล์หลักฐานที่คุณชี้ให้เอง แล้วบอกค่าจริงมาในข้อความ error
> ถ้าที่กรอกไว้ไม่ตรง — ไม่ต้องคัดลอกตัวเลขด้วยมือ

### 4. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
```

---

## v3.3.0 → v3.4.0 (MINOR — คัดลอกไฟล์ จบ)

**ใครได้รับผลกระทบจริง:** ไม่มีใครถูกบังคับ — ไม่มี `docs/evidence/operational-readiness.json` = ไม่ถูกตรวจ

### 1. คัดลอกไฟล์

```bash
cp buaflow/claude-setup/operational-readiness.js .claude/operational-readiness.js
cp buaflow/claude-setup/gate.js                  .claude/gate.js
```

### 2. ซ้อม restore ก่อน แล้วค่อยเขียน record

ลอก `reference-apps/nextjs-postgres-crud/scripts/rehearse-backup-restore.mjs` มาปรับให้ตรงกับ
ฐานข้อมูลของโปรเจกต์ — มันทำงานผ่าน `docker compose exec` ทั้งหมด จึงไม่ต้องมี Postgres client
บนเครื่อง สิ่งที่ห้ามตัดออกคือ **ขั้นที่ drop schema จริง** และ **ขั้นเทียบ fingerprint ก่อน/หลัง**
การซ้อมที่ไม่ได้ทำลายอะไรเลยไม่ได้พิสูจน์อะไรเลย

```bash
docker compose up -d db
node scripts/rehearse-backup-restore.mjs
cp buaflow/templates/operational-readiness.tpl.json docs/evidence/operational-readiness.json
node .claude/operational-readiness.js --file docs/evidence/operational-readiness.json
```

> ตัวตรวจบอก sha256 ที่ถูกต้องมาให้ในข้อความ error ไม่ต้องคำนวณเอง

ถ้าโปรเจกต์มี `security-baseline.json` (จาก 3.2.0) **ทุก trust boundary ต้องมี hook เฝ้า**
อ่าน `standards/operational-readiness.md` ก่อนเขียน hook ตัวแรก

### 3. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
```

---

## v3.2.0 → v3.3.0 (MINOR — คัดลอกไฟล์ จบ)

**ใครได้รับผลกระทบจริง:** ไม่มีใครถูกบังคับ — ไม่มี `docs/evidence/supply-chain.json` = ไม่ถูกตรวจ

### 1. คัดลอกไฟล์

```bash
cp buaflow/claude-setup/supply-chain.js .claude/supply-chain.js
cp buaflow/claude-setup/gate.js         .claude/gate.js
```

`supply-chain.js` `require` `requirement-coverage.js` (จาก 3.1.0) เพื่อใช้ทะเบียน exception ชุดเดียวกัน

### 2. (ถ้าต้องการใช้) สร้าง supply-chain record

ต้องมี SBOM อยู่ก่อน (control `sbom` ที่ R3 บังคับอยู่แล้ว) จากนั้น:

```bash
cp buaflow/templates/supply-chain.tpl.json docs/evidence/supply-chain.json
node .claude/supply-chain.js --file docs/evidence/supply-chain.json
```

> **ไม่ต้องนั่งนับ licence เอง** — รันครั้งแรกแล้วตัวตรวจจะบอกว่าแต่ละ licence expression มีกี่ตัว
> และข้อไหนยังไม่มีคนรับรอง เอาตัวเลขจาก error มาเติม แล้วรันซ้ำ · `sha256` ก็เหมือนกัน
> ตัวตรวจบอกค่าจริงมาให้ในข้อความ error

อ่าน `standards/supply-chain-evidence.md` ก่อนตัดสินใจเรื่อง licence ข้อแรก
ตัวอย่างจริงอยู่ที่ `reference-apps/*/docs/evidence/supply-chain.json` ทั้งสามตัว

### 3. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
```

---

## v3.1.0 → v3.2.0 (MINOR — คัดลอกไฟล์ จบ)

**ใครได้รับผลกระทบจริง:** ไม่มีใครถูกบังคับ — ไม่มี `docs/evidence/security-baseline.json` = ไม่ถูกตรวจ

### 1. คัดลอกไฟล์

```bash
cp buaflow/claude-setup/security-baseline.js .claude/security-baseline.js
cp buaflow/claude-setup/gate.js             .claude/gate.js
```

`security-baseline.js` `require` ทั้ง `readiness.js` และ `requirement-coverage.js` (ที่คัดลอกไปแล้วใน 3.1.0)
เพื่อใช้กติกา "อะไรนับเป็นหลักฐาน" และทะเบียน exception ชุดเดียวกัน ต้องมีครบทั้งสามไฟล์ใน `.claude/`

### 2. (ถ้าต้องการใช้) สร้าง security baseline

```bash
cp buaflow/templates/security-baseline.tpl.json docs/evidence/security-baseline.json
node .claude/security-baseline.js --file docs/evidence/security-baseline.json
```

ตัวตรวจจะหา control set จาก `standards/control-sets/` หรือ `../buaflow/standards/control-sets/` เอง
(ใส่ `--control-sets <dir>` ถ้าโครงสร้างต่างจากนี้) · kit ให้มา 1 ชุด: `owasp-asvs-5.0.0-l1`

> **เตรียมใจไว้ว่ารอบแรกจะตก** และนั่นคือจุดประสงค์ — baseline บังคับให้ตอบ **ทุก** control
> ข้อที่ตอบไม่ได้ว่า met ต้องกลายเป็น `not-met` ที่ชี้ไป approved exception ใน
> `requirement-coverage.json` ซึ่งมีเจ้าของและวันหมดอายุ ตอนที่ทำกับ reference app ของ kit เอง
> มันเจอ 7 ช่องที่เอกสาร prose ไม่เคยเขียนถึง รวมถึงข้อที่ risk = high สองข้อ

อ่าน `standards/security-baseline.md` ก่อนเริ่ม

### 3. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
```

---

## v3.0.0 → v3.1.0 (MINOR — คัดลอกไฟล์ จบ)

**ใครได้รับผลกระทบจริง:** ไม่มีใครถูกบังคับ — ถ้าโปรเจกต์ไม่มี `docs/evidence/requirement-coverage.json`
ไม่มีอะไรเปลี่ยนเลย ทั้ง `gate.js` และ `readiness.js` ทำงานเหมือนเดิมทุกอย่าง

### 1. คัดลอกไฟล์

```bash
cp buaflow/claude-setup/requirement-coverage.js .claude/requirement-coverage.js
cp buaflow/claude-setup/gate.js                 .claude/gate.js
cp buaflow/claude-setup/readiness.js            .claude/readiness.js
```

`readiness.js` เปลี่ยนแค่การ export `validateEvidence` ออกมาให้ `requirement-coverage.js` ใช้
กติกา "อะไรนับเป็นหลักฐาน" ชุดเดียวกัน — พฤติกรรมของ `readiness.js` เองไม่เปลี่ยน แต่ต้องคัดลอกไปด้วย
เพราะ `requirement-coverage.js` `require` มันตรง ๆ

### 2. (ถ้าต้องการใช้) สร้าง requirement coverage record

```bash
cp buaflow/templates/requirement-coverage.tpl.json docs/evidence/requirement-coverage.json
node .claude/requirement-coverage.js --file docs/evidence/requirement-coverage.json
```

ที่มันแก้: ก่อนหน้านี้ถ้าโปรเจกต์มีช่องโหว่ที่**รู้อยู่แล้วและยอมรับแล้ว** มีแค่สามทาง —
ประกาศ `pass` (โกหก), ใช้ `not-applicable` (ผิดความหมาย ใช้ได้แค่ 4 conditional control),
หรือเขียนไว้ใน prose (ไม่มีเจ้าของ ไม่หมดอายุ ไม่มีใครถูกเตือน) ตอนนี้มีทางที่สี่ที่เครื่องอ่านได้
อ่าน `standards/requirement-exceptions.md` ก่อนเขียน exception ข้อแรก

ตัวอย่างจริงที่ลอกได้อยู่ที่ `reference-apps/*/docs/evidence/requirement-coverage.json` ทั้งสามตัว

### 3. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
```

---

## v2.3.4 → v3.0.0 (MAJOR — ต้องลงมือถ้าเคยใช้ pack)

**ใครได้รับผลกระทบจริง:** เฉพาะโปรเจกต์ที่มีไฟล์ใน `.claude/packs/` เท่านั้น
ถ้าไม่เคยสร้าง pack เลย การอัปเกรดนี้เป็นแค่การคัดลอกไฟล์ (~2 นาที)

### 1. คัดลอกไฟล์ควบคุมชุดใหม่

```bash
cp buaflow/claude-setup/verifier.js         .claude/verifier.js
cp buaflow/claude-setup/failure-taxonomy.js .claude/failure-taxonomy.js
cp buaflow/claude-setup/readiness.js        .claude/readiness.js
cp buaflow/claude-setup/pack.js             .claude/pack.js
cp buaflow/claude-setup/pack-composition.js .claude/pack-composition.js
```

### 2. ถ้ามี `.claude/packs/*.json` — ต้องเขียนใหม่ด้วยมือ

ไม่มีตัวแปลงอัตโนมัติ และนั่นเป็นการตัดสินใจ ไม่ใช่ความขี้เกียจ: pack v1 ไม่เคยบันทึกคำสั่ง setup
ไว้ที่ไหนเลย (มันสมมติว่าจะมี generator เขียนไฟล์ให้) จึงไม่มีอะไรให้ derive เป็น recipe ได้
recipe ที่เครื่องเดาขึ้นมาคือคำโกหกที่ validate ผ่าน

```bash
node buaflow/scripts/migrate-artifact.js --type pack --file .claude/packs/<id>.json
# -> pack 1.0 -> 2.0 is a manual migration
```

สิ่งที่ต้องแก้ในแต่ละไฟล์:

| v1 | v2 |
|---|---|
| `"schemaVersion": "1.0"` | `"schemaVersion": "2.0"` |
| `generatedArtifacts` | `requiredArtifacts` — ความหมายเปลี่ยนเป็น "ไฟล์ที่ต้องมีอยู่จริงเมื่อเสร็จ" |
| *(ไม่มี)* | `setup[]` — คำสั่ง CLI ของเจ้าของ framework ที่ต้องรัน **ห้าม pin เวอร์ชัน scaffolder** |
| *(ไม่มี)* | `implementedBy` — ไม่บังคับ ใส่เมื่อมีโปรเจกต์จริงพิสูจน์ pack นั้น |
| `upgrade[]` | **ลบทิ้ง** — ถูกแทนด้วย evidence-freshness control (EP-010) |

ตัวอย่างจริงที่ลอกได้เลยอยู่ที่ `buaflow/packs/` และ template อยู่ที่ `buaflow/templates/pack.tpl.json`

```bash
node .claude/pack.js --dir .claude/packs        # ตรวจว่าเขียนใหม่ถูกแล้ว
```

### 3. ตรวจว่ายังผ่านเหมือนเดิม

```bash
node .claude/gate.js
node .claude/verifier.js --root .               # ของใหม่: ตรวจซ้ำหลักฐาน ไม่เชื่อคำประกาศ
```

> `verifier.js --execute` จะ **รันคำสั่งจริงของโปรเจกต์** และคำสั่งพวกนั้นเขียนไฟล์ทับได้
> เคยทำหลักฐานหายมาแล้ว 238 บรรทัด — รันบน working tree ที่สะอาด และดู `git status` หลังรันเสมอ

---

## v2.3.2 → v2.3.3 (copy ไฟล์ + 1 คำสั่ง)

แก้ conflict ที่ `docs/backlog/board.md` ตลอดเวลาที่มีหลาย PR พร้อมกัน — board.md เป็น derived view จาก
`docs/backlog/tasks/*.md` ทั้งไฟล์ ไม่ควร track ใน git ต่อไปแล้ว **แต่ก็เลยต้องมีวิธี regenerate ให้เอง
โดยไม่ต้องพึ่งเปิด Claude Code ก่อน** — เพิ่ม git hook `post-merge`/`post-checkout` ให้ทำแทน

```bash
cp -r buaflow/claude-setup/hooks .claude/
cp -r buaflow/claude-setup/skills/done .claude/skills/
cp buaflow/claude-setup/gate.js .claude/gate.js
cp buaflow/claude-setup/ci/post-merge.tpl .husky/post-merge
cp buaflow/claude-setup/ci/post-checkout.tpl .husky/post-checkout
chmod +x .husky/post-merge .husky/post-checkout   # Windows git จัดการเอง ข้ามได้
```

`gate.js` ตัดด่าน `board --check` ออกด้วย — ด่านเดิมเช็คว่า board.md ที่ commit มาตรงกับที่ควร generate ไหม
ไม่ใช่ `warnOnly` เลย**บล็อก push จริง** พอ board.md ไม่ถูก commit อีกต่อไป เครื่องที่ยังไม่เคยรัน hook (เช่น
clone ใหม่) จะโดนบล็อกทุก push โดยไม่เกี่ยวกับคุณภาพโค้ดเลยถ้าไม่ตัดด่านนี้ออก

1. เติมบรรทัดนี้ใน `.gitignore` ของโปรเจกต์ (ดู `buaflow/templates/gitignore.tpl` เป็นตัวอย่าง):
   ```
   docs/backlog/board.md
   ```
2. เอาไฟล์ที่เคย track ออกจาก git แต่เก็บของในเครื่องไว้:
   ```bash
   git rm --cached docs/backlog/board.md
   git add .gitignore .claude/hooks .claude/skills/done .husky/post-merge .husky/post-checkout
   git commit -m "chore: stop tracking generated board.md, regenerate via post-merge/post-checkout hook"
   ```
3. บอกทุกคนในทีมให้ `git pull` แล้ว **รันคำสั่งข้อ 2 ในข้อ setup ใหม่ (copy hook) ที่เครื่องตัวเองด้วย** —
   git hook ไม่ sync ผ่าน pull อัตโนมัติ ทุกคนต้องติดตั้งเองครั้งเดียว ไม่งั้น pull แล้วจะไม่มี board.md ให้ดูจนกว่าจะเปิด Claude Code
4. เริ่ม branch ใหม่หลังจากนี้เท่านั้น — branch เก่าที่แตกก่อนอัปเกรดยังมี board.md ค้างอยู่ใน diff ของตัวเอง

ตรวจว่าใช้ได้: `git pull` (หรือสลับ branch) แล้วดู `docs/backlog/board.md` ในเครื่อง — ควรถูก regenerate
ให้ทันทีโดยไม่ต้องเปิด Claude Code ก่อน (ถ้ายังไม่ติดตั้ง hook สำเร็จ, session-context.js ก็ยัง regenerate
ให้ตอนเปิด session อยู่ดี เป็น fallback อีกชั้น)

---

## v2.3.3 → v2.3.4 (copy ไฟล์เดียว)

board.md ไม่ conflict แล้ว แต่ยังมีช่องว่าง: task file เปลี่ยนเป็น `in-progress` แค่บน branch ของคนทำ ไม่ถึง
`main` จนกว่า PR จะ merge (ปกติคือตอนจบงาน) — ระหว่างนั้นคนอื่นเห็น task นั้นเป็น `todo` อยู่ อาจหยิบไปทำซ้ำ

```bash
cp -r buaflow/claude-setup/skills/task buaflow/claude-setup/skills/done .claude/skills/
```

ไม่มีอะไรต้องตั้งค่าเพิ่ม — `/task` จะ push branch + เปิด draft PR ทันทีตอน claim งาน (ต้องมี `gh`/`glab` CLI
login ไว้แล้ว) แทนที่จะรอเปิดตอน `/done` เหมือนเดิม `/done` เปลี่ยนไปแค่ `gh pr ready` แทนการเปิด PR ใหม่
(ยัง fallback เปิด PR ให้ถ้าไม่มีอยู่ก่อน เช่น task เก่าก่อนอัปเกรดนี้)

พ่วงบั๊กที่เจอระหว่างทาง: `/task` ไม่เคยตั้ง `assignee:` ในไฟล์ task มาก่อน (แก้ในไฟล์เดียวกันนี้แล้ว) —
ทำให้คอลัมน์ "ใครทำ" ใน board.md ว่างมาตลอด และ AI ไม่มีทางแยกว่า task ที่เห็น `in-progress` เป็นของเรา
หรือของเพื่อนร่วมทีม ไม่ต้องทำอะไรเพิ่ม แค่ copy ไฟล์ข้างบนก็ได้ของใหม่ไปด้วย

ตรวจว่าใช้ได้: `/task T-xxx` แล้วเช็คว่ามี draft PR เปิดขึ้นจริงหลัง commit แรกที่ claim งาน (ก่อนเริ่มเขียนโค้ดจริงด้วยซ้ำ)
และไฟล์ task มี `assignee:` เป็นชื่อ/อีเมลจริง ไม่ใช่ placeholder

---

## v2.3.1 → v2.3.2 (copy ไฟล์เดียว)

เนื้อหาเปลี่ยนแค่ `ui/SKILL.md` (ข้อความชี้แจงเส้นทาง canvas ให้ชัดขึ้น) — ไม่มีไฟล์ใหม่ ไม่มีอะไรต้องตั้งค่าเพิ่ม

```bash
cp -r buaflow/claude-setup/skills/ui .claude/skills/
```

---

## v2.3 → v2.3.1 (copy ไฟล์อย่างเดียว)

```bash
cp buaflow/claude-setup/gate.js buaflow/claude-setup/stack-config.js .claude/
cp buaflow/claude-setup/pixel.js .claude/                              # เฉพาะโปรเจกต์ที่ใช้ canvas
cp -r buaflow/claude-setup/skills/ui .claude/skills/
cp buaflow/templates/pixel.tpl.json docs/templates/
cp buaflow/standards/ui-component-rules.md docs/standards/
```

1. `.claude/stack.json` → เติม `"auditMode": "warn"`, `"secretsMode": "required"` และใน `commands`: `"audit": "pnpm audit --audit-level=high"`, `"secrets": "gitleaks git --no-banner --redact --log-opts=-50"`
   (ไม่เติมก็ได้ — ค่าเริ่มต้นใน `stack-config.js` เหมือนกัน แต่ถ้า stack.json เดิมมี `commands.audit` เป็นค่าเก่าอยู่ ค่านั้นจะชนะ)
2. ติดตั้ง gitleaks ถ้าต้องการ (ไม่ติดตั้ง = ด่าน `secrets` ขึ้น skip) — หรือตั้ง `"secretsMode": "off"`
3. เฉพาะโปรเจกต์ที่ใช้ canvas: เติม `"Bash(node .claude/pixel.js*)"` ใน `permissions.allow` · `pnpm add -D pixelmatch pngjs` · สร้าง `docs/design/pixel.json` จาก template แล้ว `node .claude/pixel.js --check`

รัน `node .claude/gate.js` — ด่าน `audit` ควรขึ้น `pass` หรือ `warn` (ไม่ใช่ `fail`)

---

## v2.2 → v2.3 (copy ไฟล์อย่างเดียว)

v2.3 เพิ่มฝั่ง design: `/ui` ถาม text/canvas ได้, `/prototype` ใหม่, กติกา "โค้ดต้องตรง design 100%" (`ui-component-rules.md` ข้อ 8)
**โปรเจกต์ที่ไม่ได้ใช้ claude.ai/design ไม่มีอะไรเปลี่ยน** — `/ui` ยังเสนอ 2 option แบบ text เหมือนเดิมถ้าเลือก text

```bash
# 1. วาง buaflow เวอร์ชันใหม่ทับของเดิม
# 2. คัดลอกของใหม่
cp buaflow/claude-setup/prototype.js .claude/
cp -r buaflow/claude-setup/skills/ui buaflow/claude-setup/skills/prototype .claude/skills/
cp buaflow/claude-setup/rules/frontend-ui.md .claude/rules/
cp buaflow/templates/design-brief.tpl.md buaflow/templates/prototype-flow.tpl.json docs/templates/
cp buaflow/standards/ui-component-rules.md docs/standards/
```

แล้วทำ 3 ข้อนี้ (Claude ทำได้ ไม่ต้องตัดสินใจอะไร):
1. เติม `"Bash(node .claude/prototype.js*)"` ใน `.claude/settings.json` → `permissions.allow`
2. เพิ่มคอลัมน์ `deviation จาก design` ท้ายตาราง `docs/design/components.md` (ว่างไว้ — hook `guard-new-component` match ชื่อในคอลัมน์แรกอย่างเดียว ไม่กระทบ)
3. โปรเจกต์ที่ใช้ canvas อยู่แล้ว (มี `docs/design/canvas/`) → สร้าง `docs/design/brief.md` จาก template โดย**ถอดค่าจาก `theme.md` + `components.md` ที่มีอยู่** ไม่ต้องถามใหม่
   เติม `design_system_project` (projectId ใน `_state.md`) และ `last_storybook_sync` = commit ล่าสุดที่ push storybook · ไม่ได้ใช้ canvas → ข้าม ทำตอนเปิด canvas ครั้งแรก

รัน `node .claude/check-config.js` ต้องได้ `ต้องแก้: 0`

---

## v2.1 → v2.2 (เล็ก ทำได้ระหว่าง task)

v2.2 ไม่เปลี่ยน workflow เลย — เปลี่ยนแค่ "ที่อยู่ของการตั้งค่า" จากที่ฝังในสคริปต์มาเป็น `.claude/stack.json`
**ไม่ทำก็ยังใช้งานได้ปกติ** แต่จะไม่ได้ผลของการแก้ "เขียวปลอม" (hook ที่ตายแล้วบอกว่ายังไม่ตาย)

```bash
# 1. วาง buaflow เวอร์ชันใหม่ทับของเดิม
# 2. คัดลอกไฟล์ใหม่ + ไฟล์ที่แก้ เข้า .claude/
cp buaflow/claude-setup/{stack-config,verify,run,check-config,gate}.js .claude/
cp buaflow/claude-setup/stack.json .claude/
cp buaflow/claude-setup/hooks/{format-changed,guard-edit}.js .claude/hooks/
cp -r buaflow/claude-setup/skills buaflow/claude-setup/agents .claude/
```

แล้วเปิด Claude Code ที่ราก repo พิมพ์:

```
อ่าน buaflow/UPGRADE.md หัวข้อ v2.1 → v2.2 แล้วทำตาม
```

**ถึง Claude — ทำ 4 ข้อนี้ตามลำดับ:**

1. **ย้าย `protected-paths.json` → `stack.json`** (ไม่บังคับ แต่ควรทำ) — ยกค่า `protected` / `testFilePattern` /
   `bugfixBranchPattern` ของเดิมไปใส่ `stack.json` แล้วลบไฟล์เก่า · ถ้าไม่ย้ายก็ยังอ่านได้ (`stack.json` ชนะถ้ามีทั้งคู่)
2. **ตั้งค่าใน `stack.json` ให้ตรงของจริง** — `verifyCommand` (คำสั่งที่ `package.json` มีอยู่),
   `codeFilePattern`, `formatCommands` (formatter ที่โปรเจกต์ใช้จริง), `preflightHookPath`, `commands.coverage`/`audit`/`apiTest`
3. **`ciMode`** — **ถามผู้ใช้** ว่านาที CI เป็นยังไง แล้วตั้งเป็น `required` / `pr-only` / `local-only` (ดูตารางข้างล่าง)
4. **เติม permissions** ใน `.claude/settings.json` → `permissions.allow`:
   `"Bash(node .claude/verify.js*)"` และ `"Bash(node .claude/run.js*)"`

จบแล้วรัน `node .claude/check-config.js` ต้องได้ `ต้องแก้: 0` **แปะผลให้ผู้ใช้ดู**

### เลือก `ciMode` ยังไง

| สถานการณ์ | ตั้งเป็น | ผลที่ได้ |
|---|---|---|
| repo public | `required` | Actions ฟรีไม่จำกัด ใช้เหมือนเดิม |
| repo private ยังมีโควต้าเหลือ | `pr-only` | template ใหม่รันครั้งเดียวต่องาน (เดิม 2) + ข้าม verify เมื่อแตะแต่ docs |
| **นาทีหมด / billing ติด / ไม่มี remote** | `local-only` | ลบไฟล์ CI ทิ้ง ใช้ pre-push เป็นด่านเดียว |

> ⚠️ **ถ้าเปลี่ยนเป็น `local-only` และเคยเปิด branch protection ไว้** — ต้องไปเอา required status check `gate`
> ออกจาก Settings → Branches ด้วย ไม่งั้น PR จะค้าง merge ไม่ได้ตลอดไป เพราะรอ check ที่ไม่มีวันรัน
>
> และเมื่อเป็น `local-only` แล้ว **pre-push hook ต้องติดตั้งจริง** — `check-config.js` จะขึ้น `FAIL` ถ้าไม่มี
> เพราะไม่เหลือด่านไหนบังคับเลยนอก session ของ Claude (เดิมเป็นแค่ warn)

---

## v1.0 → v2.1

> สำหรับโปรเจกต์ที่ผ่าน Phase 0–7 ของ **v1.0 (2026-09-13)** มาแล้วและกำลังทำงานอยู่
> **ไม่ใช่ Phase A** — Phase A สำหรับโปรเจกต์ที่ไม่เคยใช้ kit; ของคุณมี `docs/planning/`, ADR, spec, task, board อยู่แล้ว เก็บไว้ทั้งหมด
> ใช้เวลา ~1 session ทำบน branch `chore/kit-v2.1` **ระหว่าง task** (หลัง `/done` ก่อน `/task` ถัดไป) ไม่ทำกลางงาน
>
> **ถึง Claude:** ทำทีละข้อตามลำดับ 1 → 10 หยุดถามผู้ใช้ตรงที่ระบุ **(ถาม)** เท่านั้น ข้ออื่นทำเลยแล้วรายงานสั้น ๆ
> ห้ามแก้โค้ดโปรดักชัน ห้ามแก้ `docs/planning/*` `docs/adr/*` `docs/specs/*` (ยกเว้นเติมหัวข้อ 4.4b ในข้อ 6)
> ไฟล์ task แก้ได้เฉพาะ frontmatter ตามข้อ 7 · ตอบผู้ใช้เป็นไทย · ทุกไฟล์ที่เขียนใหม่ใน `.claude/` `AGENTS.md` `REVIEW.md` เป็นอังกฤษตาม template

## จุดเริ่มต้น — ทำแค่นี้ก่อน

```bash
# 1. จบ task ที่ค้างอยู่ให้ถึง /done (ของ v1) ก่อน — อย่าอัปเกรดกลาง task
# 2. วาง buaflow เวอร์ชันใหม่ทับของเดิม (หรือ git pull ถ้าเป็น submodule)
# 3. เปิด Claude Code ที่ราก repo แล้วพิมพ์:
อ่าน buaflow/UPGRADE.md แล้วทำตาม เริ่มข้อ 1
```

Claude จะทำข้อ 1–10 ให้ โดยหยุดถามคุณ 4 จุด: ยืนยันการแยก CLAUDE.md (ข้อ 2), ผล check-config รอบแรก (ข้อ 4), มาตรา 9 ของธรรมนูญ (ข้อ 6), diff ของ board ก่อน/หลัง generate (ข้อ 7)

## สิ่งที่ต่างระหว่าง v1.0 กับ v2.1 ที่กระทบโปรเจกต์คุณ

| v1.0 ในโปรเจกต์คุณ | v2.1 | ทำอะไร |
|---|---|---|
| `CLAUDE.md` ก้อนเดียว ภาษาไทย | `AGENTS.md` (อังกฤษ, มาตรฐานกลาง) + `CLAUDE.md` = `@AGENTS.md` + ชั้นบาง | แยกไฟล์ (ข้อ 2) |
| `.claude/commands/{task,review,spec,ui,done,hotfix}.md` | `.claude/skills/*/SKILL.md` 9 ตัว (`/review` → `/check`, เพิ่ม `/intent` `/plan` `/release`) | **ลบ commands ทิ้ง** แล้วติดตั้ง skills (ข้อ 3) |
| `.claude/agents/` 3 ตัว ภาษาไทย | 3 ตัวเดิม เพิ่ม `model:` เป็นอังกฤษ อ่านแค่ plan+diff | แทนที่ (ข้อ 3) |
| ไม่มี | `.claude/rules/` `hooks/` `settings.json` `stack.json` | ติดตั้งใหม่ (ข้อ 4) |
| ไม่มี | `check-config.js` `docs-lint.js` `board.js` `gate.js` `verify.js` `stack-config.js` + pre-push + CI templates | ติดตั้งใหม่ (ข้อ 4) |
| `verify` เป็น `tsc && eslint && vitest` | `scripts/verify.mjs` พิมพ์สรุปสั้น | ครอบของเดิม (ข้อ 5) |
| ไม่มี | `docs/constitution.md` `REVIEW.md` | เขียนจากการตัดสินใจที่มีอยู่แล้ว (ข้อ 6) |
| `board.md` เขียนมือ + `import.csv` | ไฟล์ task = source of truth, board generate, ไม่มี csv | ย้ายข้อมูลลง task แล้ว generate (ข้อ 7) |
| ไม่มี `docs/intents/` `docs/plans/` `docs/evals/` | มี + templates intent/plan/eval | สร้าง (ข้อ 8) |
| task ไม่มี `intent:` `plan:` `track:` `commit:` | มี — `docs-lint` ใช้ตัดสิน | task เก่าใส่ `intent: legacy` (ข้อ 7) |
| `docs/standards/` 9 ไฟล์ v1 | 10 ไฟล์ (DoD ย่อ, เพิ่ม `context-budget.md`, `workflow-lifecycle.md` ใหม่) | แทนที่ (ข้อ 9) |
| ไม่มี Phase 8 | Phase 8 ทบทวน config | เพิ่มแถวใน `_state.md` (ข้อ 10) |

**ของที่ไม่ต้องแตะ:** `docs/planning/*`, `docs/adr/*`, `docs/specs/*`, `docs/backlog/tasks/*` (แค่เติม frontmatter), โค้ด, git history

---

## ขั้นตอน

### 1. เตรียม

```bash
git switch -c chore/kit-v2.1
cat buaflow/templates/gitignore.tpl >> .gitignore   # แล้วลบบรรทัดที่ซ้ำกับของเดิม — ต้องมี .verify.log และ .claude/settings.local.json
# เอา buaflow เวอร์ชันล่าสุดมาวางข้าง ๆ (หรือ git pull ถ้าเป็น submodule / โฟลเดอร์ใน repo)
node buaflow/claude-setup/check-config.js   # ดู baseline ก่อนแก้ — จะ FAIL หลายข้อ ปกติ
```

### 2. แยก `CLAUDE.md` → `AGENTS.md` + `CLAUDE.md` **(ถาม: แสดงร่าง AGENTS.md ให้ผู้ใช้ยืนยันก่อนเขียนทับ)**

1. เปิด `CLAUDE.md` เดิม เก็บ 4 อย่างนี้ไว้: ย่อหน้า "โปรเจกต์นี้คืออะไร", Stack, โครงโฟลเดอร์, **หมวด "สิ่งที่ AI เคยทำผิด"** (ถ้ามี — นี่คือของมีค่าที่สุด)
2. สร้าง `AGENTS.md` จาก `buaflow/templates/AGENTS.md.tpl` — เติม 4 อย่างนั้นเป็น**ภาษาอังกฤษ** (AI อ่านอย่างเดียว; หมวด Language ในไฟล์สั่งให้ตอบผู้ใช้เป็นไทยแล้ว)
   หมวด "เคยทำผิด" ย้ายไปใต้ `## Things the AI gets wrong in this project` แปลเป็นอังกฤษ
3. เขียน `CLAUDE.md` ใหม่จาก `templates/CLAUDE.md.tpl` — บรรทัดแรก `@AGENTS.md`
4. กติกาใน `CLAUDE.md` เดิมที่**ผูกกับไฟล์บางกลุ่ม** (UI, API, DB) → ไม่ต้องย้ายเข้า AGENTS.md เพราะ `.claude/rules/` มีอยู่แล้ว (ข้อ 4) — ถ้ามีกฎเฉพาะโปรเจกต์ที่ rules ไม่ครอบ ให้เติมใน rule ที่ตรงกัน

### 3. commands → skills, agents

```bash
rm -rf .claude/commands            # ห้ามเหลือ — /review เดิมชนกับ built-in และ /check ใหม่
cp -r buaflow/claude-setup/skills .claude/
cp -r buaflow/claude-setup/agents .claude/     # ทับของเดิม (ถ้าเคยแก้ agent เอง ให้ย้ายส่วนที่แก้เข้าตัวใหม่)
```

ปรับตาม Phase 7.4: คำสั่งใน skills ต้องมีจริงในโปรเจกต์ (`test:cov`, `test:api`) — คำสั่ง verify ไม่ต้องแก้ เรียกผ่าน `node .claude/verify.js`

### 4. ชั้นบังคับ + สคริปต์ gate

```bash
cp -r buaflow/claude-setup/rules buaflow/claude-setup/hooks .claude/
cp buaflow/claude-setup/{check-config,docs-lint,board,gate,verify,run,stack-config}.js buaflow/claude-setup/stack.json .claude/
cp buaflow/claude-setup/settings.json.tpl .claude/settings.json      # ลบ $comment, แก้ ${CLAUDE_PROJECT_DIR} ไม่ต้อง — Claude Code แทนให้
cp buaflow/claude-setup/ci/pre-push.tpl .husky/pre-push
cp buaflow/claude-setup/ci/github-actions.yml.tpl .github/workflows/gate.yml   # และ/หรือ gitlab-ci.yml.tpl
```

> **โปรเจกต์ที่มี `.claude/protected-paths.json` อยู่แล้ว:** ไม่ต้องรีบย้าย — `stack-config.js` ยังอ่านไฟล์เดิมเป็น fallback
> อยากรวมเป็นไฟล์เดียว: คัดลอก `stack.json` มา แล้วย้าย `protected` / `testFilePattern` / `bugfixBranchPattern` ของเดิมเข้าไป แล้วลบไฟล์เก่าทิ้ง
> (ถ้ามีทั้งสองไฟล์ `stack.json` ชนะ) · `check-config.js` จะเตือนให้เองว่ายังใช้ไฟล์เก่าอยู่

แล้วทำตาม **Phase A.5** (ตารางปรับ config ให้ตรงของจริง): **`stack.json` ก่อนเพื่อน** (คำสั่ง verify, pattern ไฟล์โค้ด, formatter, ไฟล์ที่ generate), แล้วค่อย `paths:` ของ rules ให้ตรงโครงจริง
`node .claude/check-config.js` จนได้ `ต้องแก้: 0` **(ถาม: แปะผลรอบแรกให้ผู้ใช้ดู — pattern ไหนที่ไม่ match ต้องให้ผู้ใช้ยืนยันว่าลบได้)**

### 5. verify

`verify` เดิมของคุณใช้ได้อยู่แล้ว (v1 บังคับให้มี) — ครอบด้วย `templates/verify.mjs.tpl` → `scripts/verify.mjs` ปรับ `STEPS` ให้เรียกของเดิม
เปลี่ยน `"verify": "node scripts/verify.mjs"`, เพิ่ม `.verify.log` ใน `.gitignore`, รันแล้วเอาบรรทัดสรุปตอนผ่านไปแทนบล็อก "หน้าตาของผ่าน" ใน `AGENTS.md`

### 6. ธรรมนูญ + REVIEW.md (ไม่ต้องตัดสินใจใหม่ — บันทึกของที่ตัดสินไปแล้ว) **(ถาม: มาตรา 9 ต้องให้ผู้ใช้ยืนยันว่าตรงกับที่ใช้จริง)**

- `docs/constitution.md` จาก `templates/constitution.tpl.md`: มาตรา 1–8 ปรับถ้อยคำ, **มาตรา 9 เติมจาก `docs/planning/02-tech-stack.md` + `04-architecture.md`** ที่มีอยู่แล้ว (UI library, i18n, theme, error envelope, pagination, auth)
  ถ้ามีโค้ดที่เขียนก่อนมาตรฐานเหล่านี้ → เปิดมาตรา 9.1 (ของใหม่ vs ของเก่า)
- `REVIEW.md` จาก `templates/REVIEW.tpl.md` วางที่ราก
- **Data model:** เพิ่มหัวข้อ "§ 4.4b Data model" ใน `docs/planning/04-architecture.md` สั้น ๆ: `prisma/schema.prisma` คือ source of truth ตั้งแต่วันนี้ + การตัดสินใจเรื่อง ID / soft delete / tenancy ที่ใช้อยู่จริง (อ่านจาก schema ไม่ต้องคิดใหม่)

### 7. backlog: ไฟล์ task เป็น source of truth

ข้อมูลที่อยู่**เฉพาะ**ใน `board.md` เดิม (วันปิด, commit ของ Done) ต้องย้ายลงไฟล์ task ก่อน ไม่งั้นหายตอน generate:

1. task ที่ `done`: เติม `closed:` และ `commit:` — หาได้จาก `git log --oneline --grep T-0xx`
2. task ที่ `blocked`: เติม `blocked_reason:`
3. **ทุก task ที่มีอยู่ก่อนอัปเกรด: เติม `intent: legacy`** (docs-lint ยอมรับค่านี้ = งานที่เกิดก่อนมีระบบ intent ไม่ต้องย้อนเขียน)
4. `rm docs/backlog/import.csv` (ไม่มีใครใช้ — ถ้าเคย import ไป Jira แล้ว ตัดสิน source of truth ตาม Phase A.6)
5. `node .claude/board.js` → เทียบกับ board เดิม (`git diff`) ว่าไม่มีอะไรหาย **(ถาม: แสดง diff ให้ผู้ใช้ดูก่อน commit)**
6. **task ใหม่หลังจากนี้**ต้องมี `intent:` จริง (ผ่าน `/intent`) หรือ `track: trivial`

### 8. artifact chain ที่เพิ่มมา

```bash
mkdir -p docs/intents docs/plans docs/evals docs/incidents docs/releases && touch docs/{intents,plans,incidents,releases}/.gitkeep
cp buaflow/templates/{intent,plan,eval-case}.tpl.md docs/templates/
cp buaflow/claude-setup/evals/*.json docs/evals/ && mkdir -p docs/evals/runs
```

### 9. standards + workflow

```bash
cp buaflow/standards/*.md docs/standards/     # ทับ — v2.1 เปลี่ยน definition-of-done, workflow-lifecycle, เพิ่ม context-budget, agent-config
```
`docs/workflow.md` ที่ v1 คัดจาก `workflow-lifecycle.md` → คัดใหม่ (flow เปลี่ยนเป็น intent → … → check → PR → done)
`CONTRIBUTING.md`: เพิ่มว่า merge ผ่าน PR + gate เท่านั้น และคำสั่ง `node .claude/gate.js`

### 10. ปิด

- `_state.md`: เพิ่มแถว `| 8 Tune | ♻️ | … |` และบรรทัด "อัปเกรด kit v1.0 → v2.1 เมื่อ <วันที่>"
- `node .claude/gate.js` ผ่านทุกด่าน (แปะผล)
- ทดสอบมือตาม Phase 7.10 ชั้น config: `/context` เห็น AGENTS.md, พิมพ์ `/` เห็น 9 skills, ยืนบน main สั่ง merge → ถูกบล็อก
- รัน eval EV-001…004 ใน session สะอาด — **สำคัญ**: ทดสอบว่า AI ยังทำตามกติกาเดิมได้หลังกติกาย้ายจาก CLAUDE.md ไทยไป AGENTS.md อังกฤษ
- เปิด PR `chore/kit-v2.1` → คนกด merge → `/clear`

## หลังอัปเกรด — สิ่งที่จะรู้สึกต่างใน 3 วันแรก

| จะเจอ | เพราะ |
|---|---|
| `/task` บ่นว่าไม่มี plan สำหรับงานที่แตะ > 3 ไฟล์ | `/plan` เป็นขั้นใหม่ — ทำครั้งแรกจะรู้สึกช้า แต่ `/check` จะเร็วขึ้นเพราะอ่าน plan.md ไฟล์เดียว |
| งานเล็กที่เคยทำเลย ตอนนี้ต้อง `/intent` | ใช้ trivial track (`track: trivial`) สำหรับ typo/copy/log — ไม่ต้อง intent |
| `git merge` ถูกบล็อก | ตั้งใจ — เปิด PR แล้วกด merge เอง 10 วินาที |
| `docs-lint` warn เรื่อง task เก่าไม่มี intent | ใส่ `intent: legacy` ตามข้อ 7 |
| verify พิมพ์สั้นลงมาก | log เต็มอยู่ `.verify.log` |
