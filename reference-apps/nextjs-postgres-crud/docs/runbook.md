# Runbook — nextjs-postgres-crud

This is the PP-003 reference app: a small internal task tracker built from the `nextjs-postgres`
stack pack and the `auth-rbac` capability pack (`claude-setup/tests/fixtures/packs/`), targeting
the `internal-crud` application profile (`claude-setup/tests/fixtures/profiles/internal-crud.json`).

## Deploy

1. Build the image: `docker build -t nextjs-postgres-crud:<tag> .`
2. Provision PostgreSQL 16+ and set `DATABASE_URL` (see `.env.example`).
3. Generate a real `SESSION_SECRET`: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
   — never reuse the value in `.env.example` or between environments.
4. Apply migrations **before** starting new instances: `npx prisma migrate deploy`.
5. Run the container: `docker run -e DATABASE_URL=... -e SESSION_SECRET=... -p 3000:3000 nextjs-postgres-crud:<tag>`
6. Confirm `GET /api/health` returns `{"status":"ok","database":"up"}`.

First deploy only: seed initial users with `node --env-file=.env prisma/seed.mjs` (or create real
accounts directly — the seeded admin/member passwords are public dev defaults, never use them
outside a local/disposable database).

## Diagnose

- **Health:** `GET /api/health` — `200` with `database: "up"` means the process is live and can
  reach Postgres; `503` with `database: "down"` means the app is up but the database is not.
- **Logs:** structured JSON lines on stdout (`lib/log.ts`). Key events: `auth.login.success`,
  `auth.login.failed` (no email logged — see security notes below), `access.forbidden` (an
  authenticated user hit the ownership boundary), `health.database_unreachable`.
- **Per-record history:** the `audit_logs` table records every create/update/delete on `tasks`
  with a before/after JSON snapshot, `userId` and `action` — query it directly for "who changed
  this and when" during an incident, independent of log retention.

## Incident response

- **Suspected credential compromise:** rotate `SESSION_SECRET`. Every existing session is signed
  with the old secret and becomes invalid immediately (`lib/auth.ts` `decodeSession` rejects a bad
  signature) — this is the fastest way to force every session to re-authenticate.
- **Suspected cross-tenant/ownership bug:** grep logs for `access.forbidden` around the incident
  window (includes `userId`, `role`, `taskId`); cross-reference with `audit_logs` for that
  `taskId` to see the actual before/after state of every change.
- **Database unreachable:** `health.database_unreachable` log entries plus `/api/health` returning
  `503` confirm it's the database, not the app. Standard Postgres diagnostics apply from there
  (the app has no custom failover logic).

## Rollback

Prisma Migrate is forward-only; this app ships a hand-written companion for the one migration that
exists so far:

- Forward: `prisma/migrations/20260922161307_init/migration.sql`
- Rollback: `prisma/migrations/20260922161307_init/rollback.sql` (drops everything the forward
  migration created, in dependency-safe order)

Rehearsed procedure (`node --env-file=.env scripts/rehearse-migration-rollback.mjs`, evidence at
`evidence/migration-rollback-rehearsal.json`): apply rollback.sql → verify the schema is gone →
`prisma migrate deploy` to roll forward again → verify schema + seed data are back. Every future
migration must ship its own `rollback.sql` alongside `migration.sql` before it ships to production,
and get the same rehearsal run before being trusted.

**Before rolling back schema in a real environment:** take a fresh backup first — `rollback.sql`
is destructive (it drops tables) and this repository has no automated backup step; that is an
infrastructure/platform responsibility per `standards/deployment-ready-contract.md`'s
responsibility table, not something this app manages itself.

**Rolling back the application** (bad deploy, not a schema problem): redeploy the previous image
tag. Additive schema changes (new nullable columns, new tables) are safe to leave in place while
running an older image version; only revert the schema itself if the new migration is the actual
cause.

## Recovery

- **Bad deploy:** redeploy the previous image tag (see Rollback above).
- **Corrupted/lost data:** restore Postgres from the platform's own backup/PITR mechanism (out of
  this repo's scope — see `standards/deployment-ready-contract.md`), then re-run
  `npx prisma migrate deploy` if the restored snapshot predates the latest migration.
- **Lost `SESSION_SECRET`:** not recoverable by design (sessions are stateless, HMAC-signed, not
  stored server-side) — generate a new one; every user simply signs in again.
