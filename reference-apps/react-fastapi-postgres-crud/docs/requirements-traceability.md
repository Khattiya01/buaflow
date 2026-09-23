# Requirements → proof (requirements-traceability control)

This app's "requirements" are the acceptance criteria of the contracts it was built to
exercise: PP-001 (Application Profile — `internal-crud`), PP-002 (Pack contract —
`react-fastapi-postgres`), and PP-004's own acceptance criteria (a second, materially
different golden stack reaching R3).

| Requirement | Source | Proof |
|---|---|---|
| Persistence is real and lifecycle-tested | `internal-crud` profile, `persistence: required` | `backend/tests/integration/test_api.py` (task lifecycle tests) against a real Postgres; `evidence/migration-rollback-rehearsal.json` |
| Access control / ownership boundary enforced | `internal-crud` profile, `access-control: required` | `backend/tests/integration/test_api.py` (ownership-boundary tests: member/admin, cross-user GET/PATCH/DELETE → 403) |
| Accessibility budget kept on (internal tool) | `internal-crud` profile, `accessibility: not-applicable` in the profile fixture, but kept `required` in this app's own readiness manifest — same deliberately stricter choice PP-003 made | `tests/e2e/accessibility.spec.ts`, `evidence/axe-login.json`, `evidence/axe-tasks.json` |
| Audit trail: who changed what, when | `internal-crud` profile clarification question `audit-trail` | `backend/app/models.py`'s `AuditLog`; proven in `backend/tests/integration/test_api.py::test_delete_is_soft_and_recorded_in_audit_log` |
| Primary flow: sign in → manage own tasks → sign out | PP-004 acceptance ("reference app reaches R3") | `tests/e2e/primary-flow.spec.ts` |
| Deployable as a pinned, reproducible image | `react-fastapi-postgres` pack, `deployment-package` evidence | `Dockerfile` (multi-stage: frontend build → Python runtime), `evidence/clean-environment-rehearsal.json` |
| Database migrations are forward-and-back safe | `react-fastapi-postgres` pack, `database-migration` evidence | `backend/alembic/versions/2e65734c6b45_init.py` (real `upgrade`/`downgrade`), `evidence/migration-rollback-rehearsal.json` |
| No secrets committed | R3 control set, `secrets-scan` | `.gitignore` (`.env` excluded), `evidence/gitleaks-report.json` |
| Production dependency trees have no unaddressed findings | R3 control set, `dependency-scan` | `evidence/pip-audit.json`, `evidence/npm-audit.json`, `docs/security-notes.md` (documents a real starlette finding that was fixed, not hidden) |
| Build reproducible from a lockfile, SBOM available | R3 control set, `sbom` | `backend/requirements-lock.txt`, `frontend/package-lock.json`, `evidence/sbom-backend.cdx.json`, `evidence/sbom-frontend.cdx.json` |
| Observable: structured logs + health endpoint | R3 control set, `observability`/`health-check` | `backend/app/log.py`, `backend/app/routers/health.py`, exercised in `backend/tests/integration/test_api.py` and `evidence/clean-environment-rehearsal.json` |
| Operable: deploy/diagnose/incident/recovery documented | R3 control set, `runbook` | `docs/runbook.md` |
| Threat boundary and controls documented | R3 control set, `security-controls` | `docs/security-notes.md` |

## Materially different from PP-003, by design (proves the pack contract generalizes)

- Python/FastAPI/SQLAlchemy backend instead of Node/Next.js — different language, web
  framework, and ORM.
- Alembic migrations with a real `downgrade()`, instead of Prisma (forward-only) plus a
  hand-written `rollback.sql` companion.
- React SPA (Vite, client-rendered, React Router) instead of Next.js App Router SSR —
  different rendering model, and a genuinely different security trade-off around the
  route guard (see `docs/security-notes.md`'s "Known limitations").
- Two separate dependency ecosystems audited (pip + npm) instead of one.

## Machine-readable form (EP-002)

`docs/evidence/requirement-coverage.json` carries the same content as the table above in a form a
gate can read: every requirement answers with either reproducible proof or an **approved
exception** carrying an owner, a reason, a risk level and an expiry date.

```bash
node .claude/requirement-coverage.js --file docs/evidence/requirement-coverage.json
```

Four of this app's seventeen requirements are covered by an exception. All four are the entries
already written under "Known limitations" in `docs/security-notes.md` — no in-app rate limiting
(REQ-014), no CSRF token (REQ-015), no session-key rotation (REQ-016), and the client-side route
guard that ships the app shell to an unauthenticated browser before redirecting it (REQ-017).
They were already documented honestly; what they lacked was an owner, a risk level, and a date
anyone would be reminded of.

## Status

All 25 R0-R3 controls pass with real, checked evidence — see
`docs/evidence/readiness.json`. `ci` closed on the first push, with a real green run at
<https://github.com/Khattiya01/buaflow/actions/runs/35765907597>.
