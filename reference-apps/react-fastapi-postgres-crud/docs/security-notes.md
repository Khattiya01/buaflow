# Security notes — react-fastapi-postgres-crud

## Threat boundary

- **Trust boundary:** the HTTP API (`backend/app/routers/**`). Everything below
  `backend/app/db.py` is trusted internal code; nothing downstream of SQLAlchemy re-checks
  authorization.
- **Actors:** `member` (owns and manages only their own tasks) and `admin` (full access to
  every task, per `claude-setup/tests/fixtures/profiles/internal-crud.json`'s
  access-control decision).
- **Untrusted input:** every request body, every path/query parameter. All are validated
  through Pydantic schemas (`backend/app/schemas.py`) before use; malformed JSON and
  unknown enum values are rejected with `400`/`422`, never coerced or ignored silently.

## Controls in place and where they're tested

| Control | Where | Proof |
|---|---|---|
| Authentication | `backend/app/auth.py` (bcrypt password hashing, `itsdangerous`-signed session cookie, 8h TTL) | `backend/tests/unit/test_auth.py` |
| Session integrity | Tampered/expired cookies rejected (`decode_session`) | `backend/tests/unit/test_auth.py` |
| Client-side route guard | `frontend/src/pages/Tasks.tsx` redirects to `/login` on a `401` from `/api/tasks` | `tests/e2e/primary-flow.spec.ts` ("signing out blocks access") |
| Authorization / ownership | `backend/app/guard.py` `can_access_task` — every task route checks it | `backend/tests/integration/test_api.py` (ownership-boundary tests) |
| Account enumeration resistance | Login returns the same `401` + generic message whether the email is unknown or the password is wrong; failed attempts are logged without the email | `backend/app/routers/auth.py`, `backend/tests/integration/test_api.py` |
| Audit trail | Every task create/update/delete recorded with before/after snapshot, actor, timestamp | `backend/app/audit.py`, `backend/tests/integration/test_api.py::test_delete_is_soft_and_recorded_in_audit_log` |
| Secrets hygiene | `.env` files are git-ignored; only `.env.example` (placeholder values) is tracked; `SESSION_SECRET` is generated locally per environment | `.gitignore`, `evidence/gitleaks-report.json` (clean) |
| Dependency vulnerabilities | Production dependency trees (backend + frontend) audited; a real finding was caught and fixed, not just checked | `evidence/pip-audit.json`, `evidence/npm-audit.json` — see below |

### A real dependency-scan finding, and how it was resolved

The initial `pip-audit` run against the pinned lockfile found 7 known advisories
(PYSEC-2026-161/248/249/1941/1942/2280/2281) in `starlette==0.46.2`, pulled in transitively
by `fastapi`'s loose `starlette>=0.46.0` bound. Rather than document-and-ignore, `starlette`
was pinned directly to `>=1.6,<1.7` in `backend/pyproject.toml` (see the comment there) and
`backend/requirements-lock.txt` regenerated; `pip-audit` now reports zero known
vulnerabilities (`evidence/pip-audit.json`). This is the intended shape of the
`dependency-scan` control: a real scan that can actually fail, not a check that always
passes.

## Known limitations (not fixed — documented instead of hidden)

- **No rate limiting on `/api/auth/login`.** A network-level or edge rate limiter is
  expected to sit in front of this app in production; it is not implemented in-app. Flagged
  here so it isn't mistaken for an oversight.
- **No CSRF token.** Mitigated by `samesite="lax"` on the session cookie (blocks the cookie
  being sent on cross-site POST navigations) and by every mutating request requiring
  `Content-Type: application/json`, which simple cross-site forms cannot send. A dedicated
  CSRF token would be the next hardening step if this app grew a form-based (non-JSON)
  mutation path.
- **Single session secret, no key rotation support.** Rotating `SESSION_SECRET` invalidates
  every session at once (see `docs/runbook.md`) rather than supporting a grace-period
  rollover with two valid keys. Acceptable for this app's size; revisit if
  downtime-sensitive rotation matters later.
- **Client-side auth guard, not a server-side redirect.** PP-003's Next.js middleware
  (`proxy.ts`) denies an unauthenticated `/tasks` request at the edge before any HTML ships.
  This SPA instead always serves `index.html` for `/tasks` (FastAPI can't distinguish
  routes inside a static bundle) and relies on the React app's `useEffect` calling
  `/api/tasks`, getting a `401`, and redirecting client-side. The real API-layer
  authorization boundary is identical and equally enforced (`backend/app/guard.py`); what
  differs is that an unauthenticated browser briefly receives the app shell HTML/JS before
  being redirected, rather than never receiving it. Accepted for this reference app; a
  stricter deployment could add an edge/proxy rule keyed on the session cookie if that
  distinction mattered.
