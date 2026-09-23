# Security notes — expo-fastapi-postgres-sync

## Threat boundary

- **Trust boundary:** the HTTP API (`backend/app/routers/**`). Everything below
  `backend/app/db.py` is trusted internal code; nothing downstream of SQLAlchemy re-checks
  authorization.
- **Actors:** `member` (owns and manages only their own tasks) and `admin` (full access to
  every task). The same ownership boundary applies uniformly to the plain API and to sync
  pushes — `backend/app/routers/sync.py::_apply_change` calls the same `can_access_task`
  guard as any other route, so a sync push cannot bypass the ownership check a direct API
  call would hit.
- **Untrusted input:** every request body, every path/query parameter. All are validated
  through Pydantic schemas (`backend/app/schemas.py`) before use.
- **A device is not a trust boundary by itself.** The server never trusts a client's claimed
  `updatedAt` for anything except conflict-resolution *ordering* — the actual persisted
  `updated_at` is always server-stamped (see `docs/sync-contract.md`), so a malicious or
  buggy client cannot forge a task's timestamp into the future to always win conflicts.

## Controls in place and where they're tested

| Control | Where | Proof |
|---|---|---|
| Authentication | `backend/app/auth.py` (bcrypt password hashing, `itsdangerous`-signed token, 8h TTL) | `backend/tests/unit/test_auth.py` |
| Dual auth transport (cookie for web, bearer token for native — see `docs/sync-contract.md`) | `backend/app/guard.py::require_session` | `backend/tests/integration/test_sync.py::test_bearer_token_authenticates_without_the_cookie` |
| Session integrity | Tampered/expired tokens rejected (`decode_session`) | `backend/tests/unit/test_auth.py` |
| Authorization / ownership, including on sync pushes | `backend/app/guard.py` `can_access_task` — called from both `sync.py` and any future plain route | `backend/tests/integration/test_sync.py` (`test_member_cannot_push_a_change_to_another_members_task`, `test_admin_pull_sees_every_users_tasks`) |
| Account enumeration resistance | Login returns the same `401` + generic message whether the email is unknown or the password is wrong; failed attempts are logged without the email | `backend/app/routers/auth.py` |
| Audit trail (including which channel: API vs. sync) | Every task create/update/delete recorded with before/after snapshot, actor, timestamp, `via` | `backend/app/audit.py`, `backend/app/models.py::AuditLog.via` |
| Client token storage | OS keychain/keystore (`expo-secure-store`) on native; `localStorage` on the web export — the same tradeoff a browser cookie session already makes there | `mobile/src/storage/secureStorage.ts` |
| Secrets hygiene | `.env` files are git-ignored; only `.env.example` (placeholder values) is tracked | `.gitignore`, `evidence/gitleaks-report.json` (clean) |
| Dependency vulnerabilities | Production dependency trees (backend + mobile) audited; a real finding was caught and fixed, not just checked | `evidence/pip-audit.json`, `evidence/npm-audit-mobile.json` — see below |

### A real dependency-scan finding, and how it was resolved

`npm audit --omit=dev` against the mobile app initially reported 10 moderate-severity
findings, all tracing to a single root cause: `uuid@7.0.3` (a "Missing buffer bounds check in
v3/v5/v6 when `buf` is provided" advisory), pulled in transitively via `xcode` (used by
`@expo/config-plugins` for native iOS project generation during `expo prebuild`) — a
build-time tooling path, not application code that ships to end users, but still present in
the audited `dependencies` tree because `expo` (the runtime package) depends on it. Rather
than document-and-ignore, `mobile/package.json` adds `"overrides": { "uuid": "^11.1.1" }` to
force the whole tree onto a patched version; `npm audit` now reports zero vulnerabilities
(`evidence/npm-audit-mobile.json`), and the web export and typecheck were re-verified to
still succeed after the override. This is the intended shape of the `dependency-scan`
control: a real scan that can actually fail, not a check that always passes — same posture
PP-004 established with its `starlette` finding.

## Known limitations (not fixed — documented instead of hidden)

- **No rate limiting on `/api/auth/login`.** A network-level or edge rate limiter is expected
  to sit in front of this app in production; not implemented in-app.
- **No CSRF token on the cookie-auth (web) path.** Mitigated by `samesite="lax"` on the
  session cookie and by every mutating request requiring `Content-Type: application/json`.
  The native app doesn't have this concern at all — it never sends the cookie, only the
  bearer token, which a cross-site request cannot forge.
- **Single session secret, no key rotation support.** Rotating `SESSION_SECRET` invalidates
  every session (cookie and bearer token alike) at once rather than supporting a
  grace-period rollover with two valid keys.
- **Last-write-wins conflict resolution can silently discard a losing edit's content.** See
  `docs/sync-contract.md`'s "What this contract does not promise" — this is a design
  tradeoff appropriate for a single-user task list, documented there rather than here since
  it's a data-model concern, not a security boundary.
- **Local task ids are `Math.random`-based (`mobile/src/hooks/useTasks.ts::generateLocalId`),
  not a CSPRNG.** Deliberate — see `docs/sync-contract.md`. Not a security concern: ids are
  not used as capability tokens or secrets anywhere in this system, only as row identifiers.
