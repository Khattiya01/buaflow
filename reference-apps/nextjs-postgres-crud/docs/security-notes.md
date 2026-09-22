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
