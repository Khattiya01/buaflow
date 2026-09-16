# .github/workflows/gate.yml — คัดลอกไปวางเมื่อเลือก GitHub เป็น git host
# ด่านเดียวกับ .husky/pre-push และ /release — ไม่มีกฎที่ CI รู้แต่เครื่อง dev ไม่รู้
#
# ต้องทำเพิ่มบน GitHub หลังวางไฟล์นี้:
#   Settings → Branches → main → Require status checks: "gate"
#   (นี่คือสิ่งเดียวที่ทำให้ "AI ไม่ merge เอง" เป็นกฎแข็ง ไม่ใช่คำสัญญา)
name: gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: gate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres: # ลบทิ้งถ้า verify ไม่ต้องใช้ DB
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
      - uses: pnpm/action-setup@v4
        with: { version: {{PNPM_VERSION}} }
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: gate (verify + check-config + docs-lint + board)
        run: node .claude/gate.js
      - name: upload verify log
        if: failure()
        uses: actions/upload-artifact@v4
        with: { name: verify-log, path: .verify.log, if-no-files-found: ignore }
