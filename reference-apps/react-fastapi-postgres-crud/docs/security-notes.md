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

## Machine-readable form (EP-003)

`docs/evidence/security-baseline.json` carries this page as data: the threat boundary above as
structured entry points and enforcement files, and every Level 1 requirement of **OWASP ASVS
5.0.0** answered as met, not met, or not applicable. The control set is a pinned copy of the
published standard at tag `v5.0.0`, not a checklist written here — see
`buaflow/standards/security-baseline.md`.

```bash
node .claude/security-baseline.js --file docs/evidence/security-baseline.json
```

### What the first mapping found that this page never said

The "Known limitations" section above is honest about what this app chose not to do. It was
silent about these, because prose lists what an app does and rarely what it omits. Each one is
now an accepted risk with an owner and a 2026-12-22 expiry in
`docs/evidence/requirement-coverage.json`, which is what the `not-met` rows point at:

- **Signing out does not invalidate the session token** (ASVS V7.4.1, REQ-104, risk **high**).
  The session is a self-contained signed token and logout only deletes the cookie, so a token
  captured beforehand keeps working for the rest of its 8-hour life. Re-authenticating does not
  terminate the previous one either (V7.2.4).
- **Seeded accounts with published passwords ship with this repository** (ASVS V6.3.2, REQ-106,
  risk **high**). They are what the E2E suites sign in as; anyone who runs the seed against a
  reachable instance has handed out an admin account.
- **No security headers at all** (ASVS V3.2.1, REQ-102) — no CSP, no nosniff, no Referrer-Policy,
  no frame-ancestors — and nothing clears the SPA's in-memory state when the session ends (V14.3.1).
- **TLS and HSTS are left to an edge this app does not ship** (ASVS V3.4.1, V12.1.1, V12.2.1,
  V12.2.2, REQ-101), the same boundary the rate-limiting note above draws.
- **There is no change-password function** (ASVS V6.2.2, REQ-105).
- **The session cookie name carries no `__Host-` or `__Secure-` prefix** (ASVS V3.3.1, REQ-103).
  Adopting `__Host-` would require Secure on every response and break local HTTP development.
- **No document states how fast a vulnerable dependency must be replaced** (ASVS V15.1.1,
  REQ-107). The audit runs and fails the build; what it lacks is a deadline.
- **The SPA fallback joins the request path onto the static directory** to decide whether a real file exists (`backend/app/main.py`). Starlette is expected to normalise traversal sequences first, and nothing here tests that it does — recorded as unverified (REQ-108) rather than claimed as safe.

The CSRF defence above is also weaker than it reads: it rests on mutating endpoints requiring a
JSON content type, and no test proves a `text/plain` body is actually rejected (ASVS V3.5.2).
That is why the CSRF row is recorded as not met rather than mitigated.
