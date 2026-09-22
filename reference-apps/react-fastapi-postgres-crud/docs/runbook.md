# Runbook — react-fastapi-postgres-crud

This is the PP-004 reference app: the same task-tracker domain as PP-003
(`reference-apps/nextjs-postgres-crud`), rebuilt on a materially different stack — React
(Vite SPA) + FastAPI + SQLAlchemy/Alembic + PostgreSQL — from the `react-fastapi-postgres`
stack pack (`claude-setup/tests/fixtures/packs/react-fastapi-postgres.json`), targeting the
`internal-crud` application profile. Unlike PP-003, this app has no capability-pack
equivalent of `auth-rbac` yet (v1's pack contract can't express "requires persistence from
any pack" in a capability-based way — see PP-007's notes in `development/state.json`); auth
and RBAC are built directly into `backend/app/`, not generated from a separate pack.

## Deploy

1. Build the image: `docker build -t react-fastapi-postgres-crud:<tag> .`
2. Provision PostgreSQL 16+ and set `DATABASE_URL` (see `backend/.env.example`).
3. Generate a real `SESSION_SECRET`: `python -c "import secrets; print(secrets.token_hex(32))"`
   — never reuse the value in `.env.example` or between environments.
4. Apply migrations **before** starting new instances: `python -m alembic upgrade head`
   (run from `backend/`, with `DATABASE_URL`/`SESSION_SECRET` set in the environment).
5. Run the container: `docker run -e DATABASE_URL=... -e SESSION_SECRET=... -p 8000:8000 react-fastapi-postgres-crud:<tag>`
6. Confirm `GET /api/health` returns `{"status":"ok","database":"up"}`.

First deploy only: seed initial users with `python scripts/seed.py` (run from `backend/`) or
create real accounts directly — the seeded admin/member passwords are public dev defaults,
never use them outside a local/disposable database.

## Diagnose

- **Health:** `GET /api/health` — `200` with `database: "up"` means the process is live and
  can reach Postgres; `503` with `database: "down"` means the app is up but the database is
  not.
- **Logs:** structured JSON lines on stdout (`backend/app/log.py`). Key events:
  `auth.login.success`, `auth.login.failed` (no email logged — see security notes below),
  `access.forbidden` (an authenticated user hit the ownership boundary),
  `health.database_unreachable`.
- **Per-record history:** the `audit_logs` table records every create/update/delete on
  `tasks` with a before/after JSON snapshot, `user_id` and `action` — query it directly for
  "who changed this and when" during an incident, independent of log retention.

## Incident response

- **Suspected credential compromise:** rotate `SESSION_SECRET`. Every existing session is
  signed with the old secret and becomes invalid immediately (`backend/app/auth.py`'s
  `decode_session` rejects a bad signature via `itsdangerous`) — this is the fastest way to
  force every session to re-authenticate.
- **Suspected cross-tenant/ownership bug:** grep logs for `access.forbidden` around the
  incident window (includes `userId`, `role`, `taskId`); cross-reference with `audit_logs`
  for that `taskId` to see the actual before/after state of every change.
- **Database unreachable:** `health.database_unreachable` log entries plus `/api/health`
  returning `503` confirm it's the database, not the app. Standard Postgres diagnostics
  apply from there (the app has no custom failover logic).

## Rollback

Unlike PP-003 (Prisma Migrate is forward-only, so that app hand-writes a companion
`rollback.sql`), Alembic supports a real `downgrade()` natively:

- Forward: `backend/alembic/versions/2e65734c6b45_init.py`'s `upgrade()`
- Rollback: the same file's `downgrade()` — drops everything the forward migration
  created, in dependency-safe order, generated (and reviewed) alongside the migration
  itself rather than hand-written after the fact.

Rehearsed procedure (`node scripts/rehearse-migration-rollback.mjs`, evidence at
`evidence/migration-rollback-rehearsal.json`): `alembic downgrade base` → verify the schema
is gone → `alembic upgrade head` to roll forward again → verify schema + seed data are back.
Every future migration gets the same rehearsal run before being trusted.

**Before rolling back schema in a real environment:** take a fresh backup first —
`downgrade()` is destructive (it drops tables) and this repository has no automated backup
step; that is an infrastructure/platform responsibility per
`standards/deployment-ready-contract.md`'s responsibility table, not something this app
manages itself.

**Rolling back the application** (bad deploy, not a schema problem): redeploy the previous
image tag. Additive schema changes (new nullable columns, new tables) are safe to leave in
place while running an older image version; only revert the schema itself if the new
migration is the actual cause.

## Recovery

- **Bad deploy:** redeploy the previous image tag (see Rollback above).
- **Corrupted/lost data:** restore Postgres from the platform's own backup/PITR mechanism
  (out of this repo's scope — see `standards/deployment-ready-contract.md`), then re-run
  `python -m alembic upgrade head` if the restored snapshot predates the latest migration.
- **Lost `SESSION_SECRET`:** not recoverable by design (sessions are stateless, signed, not
  stored server-side) — generate a new one; every user simply signs in again.
