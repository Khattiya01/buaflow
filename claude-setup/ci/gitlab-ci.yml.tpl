# .gitlab-ci.yml — คัดลอกไปวางที่ราก repo เมื่อเลือก GitLab เป็น git host
# ด่านเดียวกับ .husky/pre-push และ /release
#
# ต้องทำเพิ่มบน GitLab: Settings → Merge requests → "Pipelines must succeed"
# และ Settings → Repository → Protected branches → main: ห้าม push ตรง

stages: [gate]

gate:
  stage: gate
  image: node:{{NODE_MAJOR}}-alpine
  services:
    - name: postgres:16-alpine # ลบทิ้งถ้า verify ไม่ต้องใช้ DB
      alias: postgres
  variables:
    POSTGRES_USER: app
    POSTGRES_PASSWORD: app
    POSTGRES_DB: app_test
    DATABASE_URL: postgresql://app:app@postgres:5432/app_test
    CI: 'true'
  rules:
    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
    - if: $CI_COMMIT_BRANCH == 'main'
  cache:
    key: { files: [pnpm-lock.yaml] }
    paths: [.pnpm-store]
  before_script:
    - corepack enable && corepack prepare pnpm@{{PNPM_VERSION}} --activate
    - pnpm config set store-dir .pnpm-store
    - pnpm install --frozen-lockfile
  script:
    - node .claude/gate.js
  artifacts:
    when: on_failure
    paths: [.verify.log]
    expire_in: 7 days
