---
description: Testing rules — auto-loaded when touching test files
triggerPaths: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/tests/**", "**/e2e/**"]
---

# Testing rules (auto-loaded when touching test files)

## Is this test worth anything?

> **"If I deleted this line of logic, would any test fail?"**

If the answer is no, the test only makes the coverage number look good — that is debt, not an asset.

## Must test

- Every branch of business logic (conditions, calculations, approval rules)
- Edge cases: empty, null, 0, negative, overly long strings, dates crossing month/year, timezones
- Error paths and the correct `error.code`
- Authorization: an unauthorized role is actually rejected
- **Every bug ever found** (regression test)

## Don't test

Third-party libraries / getters-setters with no logic / generated code

## Shape

- Name tests as sentences that say what broke — best when translated straight from an AC
  `it('rejects registration when the email is taken and returns code EMAIL_TAKEN')`
- Arrange → Act → Assert
- One test, one thing
- Tests must not depend on run order or state from previous tests
- Use factories/builders for test data instead of giant fixtures
- Frontend: accessible queries (`getByRole`, `getByLabelText`), not `getByTestId` everywhere

## Forbidden

- **Never edit a test to make it pass while fixing a bug** — a hook blocks this.
  If the existing test really is wrong, **stop and tell the user first**, explaining why the test is wrong
- Never write a test that asserts nothing real
- Never leave a skipped test without a follow-up task

## When tests are written

| Layer | When |
|---|---|
| Backend unit | **Together with the module, always** — part of DoD |
| Frontend unit | After the UI is stable, via the `T-xxx-test` task |
| Integration (API) | When the endpoint is done — Postman collection |
| E2E | When closing a large feature, critical path only |

**Bug fixes: always write the failing test first**, then make it pass.

Full detail: `docs/standards/testing-and-coverage.md`
