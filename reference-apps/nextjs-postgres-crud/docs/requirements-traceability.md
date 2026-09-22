# Requirements → proof (requirements-traceability control)

This app's "requirements" are the acceptance criteria of the contracts it was built to exercise:
IC-001 (Product Graph — not directly used by this app, out of scope here), PP-001 (Application
Profile — `internal-crud`) and PP-002 (Pack contract — `nextjs-postgres` + `auth-rbac`), plus
PP-003's own acceptance criteria.

| Requirement | Source | Proof |
|---|---|---|
| Persistence is real and lifecycle-tested | `internal-crud` profile, `persistence: required` | `tests/integration/api.test.ts` (task lifecycle suite) against a real Postgres; `evidence/migration-rollback-rehearsal.json` |
| Access control / ownership boundary enforced | `internal-crud` profile, `access-control: required` | `tests/integration/api.test.ts` ("ownership boundary" suite: member/admin, cross-user PATCH/DELETE → 403) |
| Accessibility budget not committed (internal tool) | `internal-crud` profile, `accessibility: not-applicable` in the profile fixture, but kept `required` in this app's own readiness manifest as a deliberately stricter choice — see `docs/evidence/readiness.json` notes | `tests/e2e/accessibility.spec.ts`, `evidence/axe-login.json`, `evidence/axe-tasks.json` |
| Audit trail: who changed what, when | `internal-crud` profile clarification question `audit-trail` | `prisma/schema.prisma` `AuditLog` model; manually verified against a live database during PP-003 (see session evidence — the `audit_logs` rows created by `create`/`update`/`delete` actions) |
| Primary flow: sign in → manage own tasks → sign out | PP-003 acceptance ("reference app reaches R3") | `tests/e2e/primary-flow.spec.ts` |
| Deployable as a pinned, reproducible image | `nextjs-postgres` pack, `deployment-package` evidence | `Dockerfile` (`output: "standalone"`), `evidence/clean-environment-rehearsal.json` |
| Database migrations are forward-and-back safe | `nextjs-postgres` pack, `database-migration` evidence | `prisma/migrations/20260922161307_init/{migration,rollback}.sql`, `evidence/migration-rollback-rehearsal.json` |
| No secrets committed | R3 control set, `secrets-scan` | `.gitignore` (`.env` excluded), `evidence/gitleaks-report.json` |
| Production dependency tree has no unaddressed high/critical findings | R3 control set, `dependency-scan` | `evidence/npm-audit.json`, `evidence/dependency-scan-notes.md` |
| Build reproducible from a lockfile, SBOM available | R3 control set, `sbom` | `package-lock.json`, `evidence/sbom.cdx.json` |
| Observable: structured logs + health endpoint | R3 control set, `observability`/`health-check` | `lib/log.ts`, `app/api/health/route.ts`, exercised in `tests/integration/api.test.ts` and `evidence/clean-environment-rehearsal.json` |
| Operable: deploy/diagnose/incident/recovery documented | R3 control set, `runbook` | `docs/runbook.md` |
| Threat boundary and controls documented | R3 control set, `security-controls` | `docs/security-notes.md` |

## Not yet closed (see `docs/evidence/readiness.json` for the authoritative status)

- **version-control**: this working tree has not been committed yet — pending the user's go-ahead
  (see PP-003 session notes / `development/state.json`).
- **ci**: `.github/workflows/ci.yml` exists and runs the exact same commands documented above, but
  no real GitHub Actions run has executed yet — that requires the repository to be pushed to a
  real remote, which has not been authorized.
