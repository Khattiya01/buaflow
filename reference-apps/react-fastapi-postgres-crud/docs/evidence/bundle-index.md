# Evidence bundle — react-fastapi-postgres-crud

commit: `0867902176e09cbc43159d5076723f39969c3faa` · generated: 2026-09-23T06:59:21.334Z · level: R3 · PASS (25/25)

tool versions: node v24.12.0, win32/x64

Readiness manifest: `docs/evidence/readiness.json` (profile: internal-crud, target: R3)

## Controls

| control | status | evidence |
| --- | --- | --- |
| version-control | pass | command: git rev-parse HEAD<br>file: evidence/ci-run.json |
| start-path | pass | command: docker compose up -d<br>command: python -m uvicorn app.main:app --reload<br>file: evidence/clean-environment-rehearsal.json |
| primary-flow | pass | file: tests/e2e/primary-flow.spec.ts<br>command: npx playwright test primary-flow.spec.ts |
| build | pass | command: docker build -t react-fastapi-postgres-crud .<br>file: evidence/ci-run.json |
| verification | pass | command: pytest<br>command: ruff check app scripts tests<br>command: mypy app<br>command: npm run typecheck && npm run lint && npm run build<br>file: evidence/ci-run.json |
| requirements-traceability | pass | file: docs/requirements-traceability.md |
| automated-tests | pass | command: pytest<br>command: npx playwright test<br>file: evidence/ci-run.json<br>file: evidence/playwright-report.json |
| persistence | pass | file: backend/app/models.py<br>file: evidence/migration-rollback-rehearsal.json |
| access-control | pass | file: backend/app/guard.py<br>command: pytest tests/integration |
| ci | pass | url: https://github.com/Khattiya01/buaflow/actions/runs/35765907597<br>file: evidence/ci-run.json |
| deployment-package | pass | file: Dockerfile<br>file: evidence/clean-environment-rehearsal.json |
| runtime-config | pass | file: backend/.env.example |
| database-migration | pass | file: evidence/migration-rollback-rehearsal.json |
| rollback | pass | file: backend/alembic/versions/2e65734c6b45_init.py<br>file: evidence/migration-rollback-rehearsal.json<br>file: docs/runbook.md |
| secrets-scan | pass | file: evidence/gitleaks-report.json |
| dependency-scan | pass | file: evidence/pip-audit.json<br>file: evidence/npm-audit.json |
| security-controls | pass | file: docs/security-notes.md |
| end-to-end-tests | pass | file: evidence/playwright-report.json<br>command: npx playwright test |
| observability | pass | file: backend/app/log.py<br>file: backend/app/routers/health.py |
| health-check | pass | file: evidence/clean-environment-rehearsal.json |
| performance | pass | file: evidence/performance-budget.json |
| accessibility | pass | file: evidence/axe-login.json<br>file: evidence/axe-tasks.json |
| sbom | pass | file: evidence/sbom-backend.cdx.json<br>file: evidence/sbom-frontend.cdx.json |
| runbook | pass | file: docs/runbook.md |
| clean-environment | pass | file: evidence/clean-environment-rehearsal.json |
