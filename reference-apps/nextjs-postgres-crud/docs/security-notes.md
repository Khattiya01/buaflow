# Security notes — nextjs-postgres-crud

## Threat boundary

- **Trust boundary:** the HTTP API (`app/api/**`) and `proxy.ts`. Everything below `lib/db.ts` is
  trusted internal code; nothing downstream of Prisma re-checks authorization.
- **Actors:** `member` (owns and manages only their own tasks) and `admin` (full access to every
  task, per `claude-setup/tests/fixtures/profiles/internal-crud.json`'s access-control decision).
- **Untrusted input:** every request body, every path/query parameter. All are validated or typed
  before use (`app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`); malformed JSON and unknown
  enum values are rejected with `400`, never coerced or ignored silently.

## Controls in place and where they're tested

| Control | Where | Proof |
|---|---|---|
| Authentication | `lib/auth.ts` (scrypt password hashing, HMAC-signed session cookie, 8h TTL) | `tests/unit/auth.test.ts` |
| Session integrity | Tampered/expired cookies rejected (`decodeSession`) | `tests/unit/auth.test.ts` |
| Network-boundary auth check | `proxy.ts` redirects unauthenticated `/tasks*` requests before they reach a page | `tests/e2e/primary-flow.spec.ts` ("signing out blocks access") |
| Authorization / ownership | `lib/guard.ts` `canAccessTask` — every task route checks it | `tests/integration/api.test.ts` ("ownership boundary" suite) |
| Account enumeration resistance | Login returns the same `401` + generic message whether the email is unknown or the password is wrong; failed attempts are logged without the email | `app/api/auth/login/route.ts`, `tests/integration/api.test.ts` |
| Audit trail | Every task create/update/delete recorded with before/after snapshot, actor, timestamp | `lib/audit.ts`, verified manually against a live database during PP-003 |
| Secrets hygiene | `.env` is git-ignored; only `.env.example` (placeholder values) is tracked; `SESSION_SECRET` is generated locally per environment | `.gitignore`, `evidence/gitleaks-report.json` (clean) |
| Dependency vulnerabilities | Production dependency tree audited; findings that don't reach the shipped image documented | `evidence/npm-audit.json`, `evidence/dependency-scan-notes.md` |

## Known limitations (not fixed — documented instead of hidden)

- **No rate limiting on `/api/auth/login`.** A network-level or edge rate limiter is expected to
  sit in front of this app in production; it is not implemented in-app. Flagged here so it isn't
  mistaken for an oversight.
- **No CSRF token.** Mitigated by `sameSite: "lax"` on the session cookie (blocks the cookie being
  sent on cross-site POST navigations) and by every mutating request requiring
  `Content-Type: application/json`, which simple cross-site forms cannot send. A dedicated CSRF
  token would be the next hardening step if this app grew a form-based (non-JSON) mutation path.
- **Single session secret, no key rotation support.** Rotating `SESSION_SECRET` invalidates every
  session at once (see `docs/runbook.md`) rather than supporting a grace-period rollover with two
  valid keys. Acceptable for this app's size; revisit if downtime-sensitive rotation matters later.

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
  no frame-ancestors — and nothing clears the server-rendered DOM when the session ends (V14.3.1).
- **TLS and HSTS are left to an edge this app does not ship** (ASVS V3.4.1, V12.1.1, V12.2.1,
  V12.2.2, REQ-101), the same boundary the rate-limiting note above draws.
- **There is no change-password function** (ASVS V6.2.2, REQ-105).
- **The session cookie name carries no `__Host-` or `__Secure-` prefix** (ASVS V3.3.1, REQ-103).
  Adopting `__Host-` would require Secure on every response and break local HTTP development.
- **No document states how fast a vulnerable dependency must be replaced** (ASVS V15.1.1,
  REQ-107). The audit runs and fails the build; what it lacks is a deadline.
- **The SPA fallback question does not arise here**: static assets are served from the build output by the framework, so no request path is ever joined onto a filesystem path (ASVS V5 is excluded as a chapter for this app).

The CSRF defence above is also weaker than it reads: it rests on mutating endpoints requiring a
JSON content type, and no test proves a `text/plain` body is actually rejected (ASVS V3.5.2).
That is why the CSRF row is recorded as not met rather than mitigated.
