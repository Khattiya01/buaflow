---
paths:
  - "**/api/**/*.ts"
  - "**/modules/**/*.ts"
  - "**/server/**/*.ts"
  - "**/routes/**/*.ts"
  - "**/services/**/*.ts"
---

# Backend / API rules (auto-loaded when touching server-side files)

## Every endpoint needs all five

1. **Validate every input** with zod/DTO — body, query, params, headers you use.
   Allowlist, not blocklist. Cap payload size and string length.
2. **Authorize on the server** — hiding a button in the UI is not security.
3. **Check record ownership, not just role** — prevents IDOR (change the id in the URL and see someone else's data).
4. **Errors use the shared envelope** with a `code` the frontend maps to an i18n key.
   Never send raw messages or stack traces.
5. **Unit tests are written together with the module** — not deferred, not a separate task — including error paths.

## Never

- Return ORM objects directly → select only the fields you need (prevents password hashes leaking)
- Non-parameterized raw queries
- Log sensitive data: passwords, tokens, cookies, card numbers, PII
- Hardcoded secrets or config → must come from env
- User-controlled queries without pagination + a max limit

## Every time an API changes

- [ ] Update OpenAPI + export `docs/api/openapi.json`
- [ ] Update the Postman collection for that endpoint
- [ ] Breaking change → stop and discuss versioning first

## DoD: Backend (this is the DoD for this work type — `/check` reports **only failing items**, never the whole list)

In addition to the core DoD in `docs/standards/definition-of-done.md`:
- [ ] All five items above hold for every endpoint touched
- [ ] Unit tests included, covering error paths and "unauthorized role is rejected"
- [ ] Coverage of touched files not below target / overall coverage not lower
- [ ] Checked for N+1 queries or missing indexes
- [ ] OpenAPI exported + Postman updated (if the API changed)
- [ ] Touches the DB → see the DoD in `db-migration.md`

Full detail: `docs/standards/security-checklist.md`, `docs/standards/testing-and-coverage.md`
