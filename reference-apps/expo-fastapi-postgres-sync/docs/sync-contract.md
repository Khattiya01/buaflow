# Sync / offline contract — expo-fastapi-postgres-sync

This is the PP-005 reference app: Buaflow's mobile golden stack. It adds one real capability
the two web golden stacks (PP-003 `nextjs-postgres-crud`, PP-004 `react-fastapi-postgres-crud`)
don't have to prove: a client that works fully offline and reconciles with the server once
connectivity returns. This document is the required, explicit description of that contract —
not just "it has offline support."

## Architecture

```
mobile/src/screens        UI: shows tasks, an offline banner, and an "N changes waiting" count
        │
mobile/src/hooks/useTasks  orchestrates: local store <-> sync engine <-> API client
        │
mobile/src/sync/engine.ts  PURE functions: merge, reconcile, conflict resolution (no I/O)
        │
mobile/src/storage/*       local persistence (platform-specific, see below)
        │
mobile/src/api/client.ts   fetch wrapper, bearer-token auth
        │
backend/app/routers/sync.py  GET /api/sync/pull, POST /api/sync/push
        │
PostgreSQL (tasks.updated_at / tasks.deleted_at)
```

## Why a sync API, not plain CRUD

The mobile client must be usable with no network at all: creating, editing, and completing
tasks all write to the local store first and are visible immediately. A plain REST CRUD API
(what PP-003/PP-004 use) has no way to express "this write happened locally, hasn't reached
the server yet, and might conflict with something that did." The sync API instead exposes:

- **`GET /api/sync/pull?since=<ISO8601 timestamp>`** — every task the caller can see whose
  `updated_at` is newer than `since` (omit `since` for a full pull). This includes
  soft-deleted tasks (`deleted_at` set), not just live ones, so the client can learn a task
  was removed and delete it locally instead of it lingering forever.
- **`POST /api/sync/push`** — a batch of locally-made changes (`SyncChange`: id, title,
  description, status, `deleted`, and the client's local `updatedAt`). The server applies
  each independently and returns a per-change `outcome`: `"applied"` or `"conflict"`,
  together with the server's own authoritative copy of that task either way.

Task ids are **client-generated** (a UUID minted on-device at creation time), not
server-assigned — the whole point of offline creation is that the client cannot wait for a
round trip to learn an id before it can show the task in the list.

## Conflict resolution: last-write-wins by server clock

Each `Task` row carries `updated_at` (server-stamped, bumped on every accepted write) and
`deleted_at` (a soft-delete tombstone). When a push arrives for an existing task:

- If the server's `updated_at` is already the same age or newer than the client's submitted
  `updatedAt`, the server row already reflects an equal-or-later write (from this same
  client on a previous sync, another device, or a direct API call) — the push is rejected
  (`outcome: "conflict"`) and the server's row is returned so the client can overwrite its
  local copy.
- Otherwise the change is applied, and **the server stamps `updated_at` with its own clock**,
  never the client's — this is what stops client clock skew from making a stale write look
  newer on some future pull.

This is implemented once, on the server (`backend/app/routers/sync.py::_apply_change`), and
proven in `backend/tests/integration/test_sync.py` (`test_push_update_wins_when_client_edit_is_newer`,
`test_push_update_conflicts_when_client_edit_is_stale`) — not duplicated as client-side logic
the server has to trust.

## The client-side sync engine (`mobile/src/sync/engine.ts`)

Everything the client does with pulled/pushed data goes through pure, dependency-free
functions — no network, no storage, no platform API — so this is the one part of the
contract that's exhaustively unit-testable (`engine.test.ts`, 12 cases) without a device,
emulator, or running backend:

- `createLocalTask` / `updateLocalTask` / `softDeleteLocalTask` — local mutations, all mark
  the row `dirty: true` and stamp a local `updatedAt`.
- `collectDirtyChanges` — the push payload: every `dirty` task, mapped to `SyncChange`.
- `mergePulledTasks` — folds a pull response into the local set. **Never overwrites a dirty
  row** — an unconfirmed local edit is left alone until a push resolves it one way or the
  other, so a pull can never silently discard work in flight.
- `reconcilePushResults` — applies push outcomes, clearing `dirty`. Guards against a real
  race: if the user edits a task again while its push is still in flight, the local row has
  moved on (a newer `updatedAt`, still dirty) by the time the result comes back; a stale
  result is skipped rather than applied, and that newer edit is simply picked up by the next
  sync cycle instead of being silently lost.

## Sync triggers

`useTasks` runs a sync immediately after every local mutation and again every 15 seconds
while the app is open (`SYNC_INTERVAL_MS`), plus on demand via the visible "Sync now"
control. A sync always pushes any dirty changes first, then pulls. A failed sync (network
error) sets `isOffline: true`, shown as a banner — it never throws into the UI.

**Local persistence is durable, independent of the sync outcome.** Every mutation is written
to the on-device store synchronously with the state update, before any network attempt —
`isOffline` only reflects whether the *last sync round trip* succeeded, not whether the edit
itself was saved.

## Where local data actually lives (a deliberate platform split)

- **Native (iOS/Android): `expo-sqlite`** (`mobile/src/storage/sqliteStore.ts`) — a real
  embedded SQL database. This is what the "mobile golden stack" claim is actually about, and
  what the CI-built Android debug APK proves compiles and links against.
- **Web export: `localStorage`** (`mobile/src/storage/webStore.ts`). `expo-sqlite`'s web
  target needs cross-origin-isolation (COOP/COEP) headers for its WASM backend, which this
  app's dev/CI serving setup doesn't provide, and setting that up would be an unrelated
  yak-shave for a reference app. `localStorage` is still real, durable, per-origin storage —
  it's what `tests/e2e/offline-sync.spec.ts` proves the whole contract against end to end.

Metro's platform-extension convention (`localStore.native.ts` / `localStore.web.ts`) picks
the right one at bundle time — not a runtime `Platform.OS` branch, which would still
statically pull `expo-sqlite`'s WASM worker into the web bundle and break it (this failure
mode was hit and fixed while building this app; see `src/storage/types.ts`'s comment).

Session tokens follow the same split: `expo-secure-store` (OS keychain/keystore, encrypted)
on native, `localStorage` on web — see `mobile/src/storage/secureStorage.ts`.

## Authentication: bearer token, not a cookie

React Native's `fetch` has no browser-style cookie jar shared across requests, so
`POST /api/auth/login` returns the same signed session value both as a cookie (for the web
export, where cookies work normally) **and** in the JSON body as `token`. The mobile client
stores `token` and sends `Authorization: Bearer <token>` on every request
(`mobile/src/api/client.ts`); `backend/app/guard.py::require_session` accepts either. Proven
independently of the cookie path in `backend/tests/integration/test_sync.py::test_bearer_token_authenticates_without_the_cookie`.

## What this contract does not promise

- **No cross-device merge finer than whole-field last-write-wins.** Two devices editing the
  *same task* while both offline: whichever push reaches the server with the newer
  `updatedAt` wins entirely: title, description, and status together, not a per-field merge.
  Acceptable for a single-user task list; a collaborative document would need a real CRDT.
- **A page reload requires network, even for a "durably saved locally" task.** The mobile web
  export is a plain SPA with no service worker — reloading fetches `index.html`/the JS bundle
  over the network like any web page, so it cannot be exercised while the browser is
  genuinely offline (`tests/e2e/offline-sync.spec.ts` proves durability by reading
  `localStorage` directly instead, and notes this in its own comment). The **native app does
  not have this limitation** — its shell is bundled into the binary, not fetched — which is a
  genuine, real advantage of the native build over the web export, not a difference to
  paper over.
- **Local ids are `Math.random`-based, not a CSPRNG** (`mobile/src/hooks/useTasks.ts`'s
  `generateLocalId`). A collision is inconsequential here (ids only need to be unique
  per-device, and the server's create-if-absent logic handles a collision safely if one ever
  happened) — a deliberate choice to avoid a crypto dependency, not an oversight.
- **No binary/attachment sync.** Tasks are small JSON records; nothing here addresses
  syncing files or large blobs offline.
