# Evidence bundle — nextjs-postgres-crud

commit: `ef0a5d196032c56478659deeb03c15512fdfc41a` · generated: 2026-09-23T02:20:59.039Z · level: R3 · PASS (25/25)

tool versions: node v24.12.0, win32/x64

Readiness manifest: `docs/evidence/readiness.json` (profile: internal-crud, target: R3)

## Controls

| control | status | evidence |
| --- | --- | --- |
| version-control | pass | command: git rev-parse HEAD |
| start-path | pass | command: npm run dev |
| primary-flow | pass | file: tests/e2e/primary-flow.spec.ts<br>command: npx playwright test tests/e2e/primary-flow.spec.ts |
| build | pass | command: npm run build |
| verification | pass | command: npm run verify |
| requirements-traceability | pass | file: docs/requirements-traceability.md |
| automated-tests | pass | command: npm test<br>command: npm run test:integration<br>command: npx playwright test |
| persistence | pass | file: prisma/schema.prisma<br>file: evidence/migration-rollback-rehearsal.json |
| access-control | pass | file: lib/guard.ts<br>command: npm run test:integration |
| ci | pass | url: https://github.com/Khattiya01/buaflow/actions/runs/35758419510 |
| deployment-package | pass | file: Dockerfile<br>file: evidence/clean-environment-rehearsal.json |
| runtime-config | pass | file: .env.example |
| database-migration | pass | file: evidence/migration-rollback-rehearsal.json |
| rollback | pass | file: prisma/migrations/20260922161307_init/rollback.sql<br>file: evidence/migration-rollback-rehearsal.json<br>file: docs/runbook.md |
| secrets-scan | pass | file: evidence/gitleaks-report.json |
| dependency-scan | pass | file: evidence/npm-audit.json<br>file: evidence/dependency-scan-notes.md |
| security-controls | pass | file: docs/security-notes.md |
| end-to-end-tests | pass | file: evidence/playwright-report.json<br>command: npx playwright test |
| observability | pass | file: lib/log.ts<br>file: app/api/health/route.ts |
| health-check | pass | file: evidence/clean-environment-rehearsal.json |
| performance | pass | file: evidence/performance-budget.json |
| accessibility | pass | file: evidence/axe-login.json<br>file: evidence/axe-tasks.json |
| sbom | pass | file: evidence/sbom.cdx.json |
| runbook | pass | file: docs/runbook.md |
| clean-environment | pass | file: evidence/clean-environment-rehearsal.json |
