# .github/workflows/gate.yml — คัดลอกไปวางเมื่อเลือก GitHub เป็น git host
# ด่านเดียวกับ pre-push hook และ /release — ไม่มีกฎที่ CI รู้แต่เครื่อง dev ไม่รู้
#
# ต้องทำเพิ่มบน GitHub หลังวางไฟล์นี้:
#   Settings → Branches → main → Require status checks: "gate"
#   (นี่คือสิ่งเดียวที่ทำให้ "AI ไม่ merge เอง" เป็นกฎแข็ง ไม่ใช่คำสัญญา)
#
# ── เรื่องนาที CI ───────────────────────────────────────────────────────
# Actions **ฟรีไม่จำกัดบน repo public** โควต้า 2,000 นาที/เดือนนับเฉพาะ repo private
# ถ้านาทีหมดหรือ billing มีปัญหา: ตั้ง "ciMode": "local-only" ใน .claude/stack.json แล้วลบไฟล์นี้ทิ้ง
# gate ยังบังคับอยู่ที่ pre-push hook เหมือนเดิม — เสียชั้นที่กันคนข้าม hook เท่านั้น ไม่ใช่ gate พัง
#
# ไฟล์นี้ตั้งให้ประหยัดไว้แล้ว 2 อย่าง:
#   1. รันเฉพาะ PR เข้า main (ไม่รันซ้ำตอน push เข้า main เพราะ merge ทุกครั้งผ่าน PR ที่เพิ่งตรวจไปแล้ว)
#      ถ้ายังไม่ได้เปิด branch protection ให้เพิ่ม `push: { branches: [main] }` กลับมาเพื่อจับ push ตรง
#   2. commit ที่แตะแต่ docs/ *.md → ข้าม `pnpm install` และรัน gate แบบ --docs-only
#      (ยังรันอยู่ ไม่ใช้ paths-ignore เพราะ required check ที่ไม่เคยรัน = PR ค้าง merge ไม่ได้ตลอดไป)

name: gate

on:
  pull_request:
    branches: [main]

concurrency:
  group: gate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres: # ลบทั้งบล็อกนี้ทิ้งถ้า verify ไม่ต้องใช้ DB — service container กินนาทีทุกครั้งที่รัน
        image: postgres:16-alpine
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app
          POSTGRES_DB: app_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U app" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://app:app@localhost:5432/app_test
      CI: 'true'
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # docs-lint / commitlint ต้องเห็นประวัติ

      - name: ดูว่าคอมมิตนี้แตะอะไรบ้าง
        id: scope
        run: |
          base='${{ github.event.pull_request.base.sha }}'
          changed=$(git diff --name-only "$base" HEAD 2>/dev/null || true)
          # ไม่รู้ว่าเปลี่ยนอะไร = รันเต็ม (ปลอดภัยไว้ก่อน อย่าเดาว่าเป็น docs)
          if [ -z "$base" ] || [ -z "$changed" ] || echo "$changed" | grep -qvE '^docs/|\.md$'; then
            echo 'docs_only=false' >> "$GITHUB_OUTPUT"
          else
            echo 'docs_only=true' >> "$GITHUB_OUTPUT"
            echo "แตะแต่เอกสาร -> ข้าม verify"
          fi

      - uses: pnpm/action-setup@v4
        with: { version: {{PNPM_VERSION}} }
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }

      - run: pnpm install --frozen-lockfile
        if: steps.scope.outputs.docs_only != 'true'

      - name: gate (verify + check-config + docs-lint + board)
        run: node .claude/gate.js ${{ steps.scope.outputs.docs_only == 'true' && '--docs-only' || '' }}

      - name: upload verify log
        if: failure()
        uses: actions/upload-artifact@v4
        with: { name: verify-log, path: .verify.log, if-no-files-found: ignore }
