# .gitlab-ci.yml — คัดลอกไปวางที่ราก repo เมื่อเลือก GitLab เป็น git host
# ด่านเดียวกับ pre-push hook และ /release
#
# ต้องทำเพิ่มบน GitLab: Settings → Merge requests → "Pipelines must succeed"
# และ Settings → Repository → Protected branches → main: ห้าม push ตรง
#
# ── เรื่องนาที CI ───────────────────────────────────────────────────────
# นาที CI มีจำกัด ถ้าหมดหรือ billing มีปัญหา: ตั้ง "ciMode": "local-only" ใน .claude/stack.json
# แล้วลบไฟล์นี้ทิ้ง — gate ยังบังคับอยู่ที่ pre-push hook เหมือนเดิม
#
# ไฟล์นี้รันเฉพาะ merge request (ไม่รันซ้ำตอน push เข้า main เพราะ merge ทุกครั้งผ่าน MR ที่เพิ่งตรวจไปแล้ว)
# ถ้ายังไม่ได้เปิด protected branch ให้เพิ่ม `- if: $CI_COMMIT_BRANCH == 'main'` กลับมาเพื่อจับ push ตรง
#
# หมายเหตุ: ที่นี่ไม่มีลูกเล่น --docs-only แบบฝั่ง GitHub เพราะ image node:alpine ไม่มี git
# จะเทียบว่าแตะแต่ docs ไม่ได้ — ถ้าอยากได้ ต้องลง git ในภาพเองซึ่งกินเวลาพอ ๆ กับที่ประหยัด

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
