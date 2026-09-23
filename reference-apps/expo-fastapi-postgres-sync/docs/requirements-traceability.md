# Requirements → proof (requirements-traceability control)

This app's "requirements" are PP-005's own acceptance criteria (a mobile reference app
reaching R3 from a clean environment, including a documented sync/offline contract, that
produces a valid evidence bundle without app-specific special-casing) plus the `db`/`sync`-
relevant controls from `react-fastapi-postgres`'s pack contract it extends.

| Requirement | Source | Proof |
|---|---|---|
| A documented sync/offline contract exists | PP-005 acceptance | `docs/sync-contract.md` |
| Offline creation/edit is queued locally and durably persisted | PP-005 acceptance, sync contract | `mobile/src/sync/engine.test.ts` (12 pure unit tests: create/update/delete, merge, reconcile, conflict, mid-flight-edit race guard) |
| A task created while genuinely offline (real network-level offline emulation) survives and syncs once online | PP-005 acceptance, sync contract | `tests/e2e/offline-sync.spec.ts` — proved end to end through the real UI, the real localStorage-backed web store, and the real backend; also proves the push actually reached the server by clearing local storage and reloading |
| Conflict resolution (last-write-wins by server clock) | `docs/sync-contract.md` | `backend/tests/integration/test_sync.py` (`test_push_update_wins_when_client_edit_is_newer`, `test_push_update_conflicts_when_client_edit_is_stale`) |
| Persistence is real and lifecycle-tested (server side) | `react-fastapi-postgres` pack pattern, extended with sync semantics | `backend/tests/integration/test_sync.py` against a real Postgres; `evidence/migration-rollback-rehearsal.json` |
| Access control / ownership boundary enforced, including on sync pushes | Same profile-derived requirement PP-003/PP-004 satisfy | `backend/tests/integration/test_sync.py` (`test_member_cannot_push_a_change_to_another_members_task`, `test_admin_pull_sees_every_users_tasks`) |
| Accessibility budget kept on | Same deliberately-stricter choice PP-003/PP-004 made | `tests/e2e/accessibility.spec.ts`, `evidence/axe-login.json`, `evidence/axe-tasks.json` |
| Primary flow: sign in → manage own tasks → sign out | PP-005 acceptance | `tests/e2e/primary-flow.spec.ts` |
| Deployable as a pinned, reproducible web image | `expo-fastapi-postgres-sync` pack, `deployment-package` evidence | `Dockerfile` (multi-stage: mobile web export → Python runtime), `evidence/clean-environment-rehearsal.json` |
| The native (Android) distribution channel actually compiles and links | PP-005 acceptance (mobile reference app), `docs/runbook.md`'s "Native builds" | `.github/workflows/ci-expo-fastapi-postgres-sync.yml`'s `android` job (`expo prebuild` + `gradlew assembleDebug`) — see `docs/evidence/readiness.json`'s `build` control for the CI run URL |
| Database migrations are forward-and-back safe | `expo-fastapi-postgres-sync` pack, `database-migration` evidence | `backend/alembic/versions/8f3a1c9d2b47_init.py` (real `upgrade`/`downgrade`), `evidence/migration-rollback-rehearsal.json` |
| No secrets committed | R3 control set, `secrets-scan` | `.gitignore` (`.env` excluded), `evidence/gitleaks-report.json` |
| Production dependency trees have no unaddressed findings | R3 control set, `dependency-scan` | `evidence/pip-audit.json`, `evidence/npm-audit-mobile.json`, `docs/security-notes.md` (documents a real `uuid`/`xcode` finding that was fixed via an npm override, not hidden) |
| Build reproducible from a lockfile, SBOM available | R3 control set, `sbom` | `backend/requirements-lock.txt`, `mobile/package-lock.json`, `evidence/sbom-backend.cdx.json`, `evidence/sbom-mobile.cdx.json` |
| Observable: structured logs + health endpoint | R3 control set, `observability`/`health-check` | `backend/app/log.py`, `backend/app/routers/health.py`, exercised in `backend/tests/integration/test_sync.py` and `evidence/clean-environment-rehearsal.json` |
| Operable: deploy/diagnose/incident/recovery documented, including native-build steps | R3 control set, `runbook` | `docs/runbook.md` |
| Threat boundary and controls documented | R3 control set, `security-controls` | `docs/security-notes.md` |

## Materially different from PP-003/PP-004, by design (the actual new capability M3/PP-005 adds)

- A mobile (React Native, via Expo) client instead of a browser-only SPA — the same source
  also compiles to a native Android binary (`docs/runbook.md`), which neither web golden
  stack has to prove.
- An offline-first local store (SQLite on native, `localStorage` on the web export) instead
  of always-online CRUD — the app is fully usable with zero network connectivity.
- A pull/push sync API with explicit conflict resolution, instead of plain REST CRUD — see
  `docs/sync-contract.md`.
- Bearer-token authentication (in addition to the existing cookie path), since React
  Native's `fetch` has no cookie jar — see `docs/sync-contract.md`.

## Status

All 25 R0-R3 controls pass with real, checked evidence — see `docs/evidence/readiness.json`.
