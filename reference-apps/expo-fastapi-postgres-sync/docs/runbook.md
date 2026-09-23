# Runbook — expo-fastapi-postgres-sync

This is the PP-005 reference app: Buaflow's mobile golden stack — an Expo (React Native +
TypeScript) client with an offline-first local store, synced against a FastAPI + PostgreSQL
backend via a pull/push sync API. See `docs/sync-contract.md` for the full sync/offline
contract. This runbook covers the **backend + web-export deployment**; the native
iOS/Android distribution channel is a separate concern (see "Native builds" below).

## Deploy (web / backend — the containerized artifact)

1. Build the image: `docker build -t expo-fastapi-postgres-sync:<tag> .` (multi-stage: the
   mobile app's web export, then the Python runtime that serves it).
2. Provision PostgreSQL 16+ and set `DATABASE_URL` (see `backend/.env.example`).
3. Generate a real `SESSION_SECRET`: `python -c "import secrets; print(secrets.token_hex(32))"`
   — never reuse the value in `.env.example` or between environments.
4. Apply migrations **before** starting new instances: `python -m alembic upgrade head`
   (run from `backend/`, with `DATABASE_URL`/`SESSION_SECRET` set in the environment).
5. Run the container: `docker run -e DATABASE_URL=... -e SESSION_SECRET=... -p 8000:8000 expo-fastapi-postgres-sync:<tag>`
6. Confirm `GET /api/health` returns `{"status":"ok","database":"up"}`.

First deploy only: seed initial users with `python scripts/seed.py` (run from `backend/`) or
create real accounts directly — the seeded admin/member passwords are public dev defaults,
never use them outside a local/disposable database.

## Native builds (iOS/Android)

A mobile binary is not something a container image runs — this is a separate build, not part
of the Dockerfile/deploy flow above.

- **Debug APK (unsigned, sideload-only):** `npx expo prebuild --platform android` then
  `cd android && ./gradlew assembleDebug`, from `mobile/`. Needs a JDK (17) and the Android
  SDK; no credentials required. This is what CI builds on every push
  (`.github/workflows/ci-expo-fastapi-postgres-sync.yml`'s `android` job) to prove the native
  source actually compiles and links — Buaflow does not hold or manage app-store credentials,
  so a real signed release build is out of this repository's scope (see
  `BUAFLOW_PRODUCT_ROADMAP.md` section 2).
- **Real app-store release build:** documented, not executed here — see `mobile/eas.json`'s
  `production` profile. Requires the app owner's own Expo/EAS account and signing
  credentials.
- Set `EXPO_PUBLIC_API_URL` to the backend's real reachable URL before building a native
  binary — see `mobile/.env.example`. The web export target does not need this (it's served
  by the same origin as the API — see `backend/app/main.py`).

## Diagnose

- **Health:** `GET /api/health` — `200` with `database: "up"` means the process is live and
  can reach Postgres; `503` with `database: "down"` means the app is up but the database is
  not.
- **Logs:** structured JSON lines on stdout (`backend/app/log.py`). Key events:
  `auth.login.success`, `auth.login.failed` (no email logged), `access.forbidden` (an
  authenticated user hit the ownership boundary on a sync push),
  `health.database_unreachable`.
- **Per-record history:** the `audit_logs` table records every create/update/delete on
  `tasks` with a before/after JSON snapshot, `user_id`, `action`, and `via` (`"api"` or
  `"sync"` — which channel made the change) — query it directly for "who changed this and
  when," independent of log retention.
- **A specific client's sync state is not server-visible.** The server only ever sees
  confirmed writes; a device's locally-queued (`dirty`) changes exist only on that device
  until pushed. There is nothing to diagnose server-side about "why hasn't this device
  synced yet" beyond the device's own connectivity.

## Incident response

- **Suspected credential compromise:** rotate `SESSION_SECRET`. Every existing session
  (cookie *and* bearer token — both are the same signed value) becomes invalid immediately
  (`backend/app/auth.py`'s `decode_session` rejects a bad signature via `itsdangerous`).
- **Suspected cross-tenant/ownership bug:** grep logs for `access.forbidden` around the
  incident window (includes `userId`, `role`, `taskId`); cross-reference with `audit_logs`
  for that `taskId`, including its `via` column, to see whether the change came through the
  sync path or a direct API call.
- **Database unreachable:** `health.database_unreachable` log entries plus `/api/health`
  returning `503` confirm it's the database, not the app.

## Rollback

Alembic supports a real `downgrade()` natively:

- Forward: `backend/alembic/versions/8f3a1c9d2b47_init.py`'s `upgrade()`
- Rollback: the same file's `downgrade()` — drops everything the forward migration created,
  in dependency-safe order.

Rehearsed procedure (`node scripts/rehearse-migration-rollback.mjs`, evidence at
`evidence/migration-rollback-rehearsal.json`): `alembic downgrade base` → verify the schema
is gone → `alembic upgrade head` to roll forward again → verify schema + seed data are back.

**Before rolling back schema in a real environment:** take a fresh backup first —
`downgrade()` is destructive (it drops tables). The backup and restore procedure this
repository owns is in "Backup and restore" below, and it is rehearsed; what belongs to the
platform is the schedule, the retention window and the production data policy.

**Rolling back the application** (bad deploy, not a schema problem): redeploy the previous
image tag. A mobile client that already has a newer app build cached/installed keeps working
against an older-but-compatible backend as long as the sync API's request/response shape is
unchanged — this is why `SyncChange`/`SyncPushResult`/`TaskOut` should be extended
additively, not modified in place, once this app has real users.

## Backup and restore

The **procedure** is this repository's to deliver, per `standards/deployment-ready-contract.md`'s
responsibility table; the **schedule, retention window and production data policy** belong to
whoever owns the database instance. Those are different things, and an earlier version of this
runbook collapsed them into "not our problem".

```bash
# backup (run against the database, not from inside the app container)
pg_dump -U app -d app -Fc -f backup.dump

# restore into an empty schema, then roll forward in case the snapshot predates a migration
pg_restore -U app -d app --no-owner backup.dump
python -m alembic upgrade head
```

**This has been rehearsed, not just written down.** `node scripts/rehearse-backup-restore.mjs` takes a real
dump against the local docker-compose Postgres, **drops the entire public schema**, restores from
the dump, and compares a content hash of every table before and after — a restore that recreated
empty tables would pass a "do the tables exist" check and fail this one. It then runs the
roll-forward command above to confirm it is a no-op against an up-to-date restore, because the
Recovery section below tells an operator to do exactly that.

The transcript is `evidence/backup-restore-rehearsal.json` and
`docs/evidence/operational-readiness.json` cites it by digest, so re-running the rehearsal without
updating that record fails the gate rather than going unnoticed.

## Recovery

- **Bad deploy:** redeploy the previous image tag (see Rollback above).
- **Corrupted/lost data:** restore Postgres from the platform's own backup/PITR mechanism
  (out of this repo's scope), then re-run `python -m alembic upgrade head` if the restored
  snapshot predates the latest migration.
- **Lost `SESSION_SECRET`:** not recoverable by design (sessions are stateless, signed, not
  stored server-side) — generate a new one; every user (and every device) simply signs in
  again. A device with locally-queued (`dirty`, not-yet-pushed) changes at the moment of
  forced sign-out keeps them in local storage and will push them once the user signs back in
  — nothing is lost by a forced re-authentication.
