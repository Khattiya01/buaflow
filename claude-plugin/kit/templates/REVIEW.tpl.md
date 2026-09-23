# Review policy — {{PROJECT_NAME}}

<!-- ภาษาอังกฤษโดยตั้งใจ — อ่านโดย skill /check และ subagent code-reviewer เท่านั้น -->

> This file is the **decision rules** of review, separate from the **procedure** (which lives in the `/check` skill + built-in `/code-review`).
> Lives at the repo root as `REVIEW.md` — version-controlled and changed through review like code.
> Owner: {{tech lead / project owner}}
> Read by: the `/check` skill and the `code-reviewer` subagent

## Passes (every pass, every PR, no exceptions)

| Pass | Looks for |
|---|---|
| **1. Correctness** | wrong logic, off-by-one, inverted conditions, edge cases (null / empty / 0 / negative / empty array), un-awaited async, swallowed errors, race conditions, double-click, **all task ACs met?** |
| **2. Security** | unvalidated input, server-side authorization and **record ownership (IDOR)**, sensitive data leaking in responses or logs, hardcoded secrets, non-parameterized raw queries, raw HTML rendering |
| **3. Matches what was agreed** | matches `plan.md`? (anything extra / missing), matches the spec?, violates any article of `docs/constitution.md`? |
| **4. Project standards** | i18n complete th+en, tokens not raw colors, no other UI library, files in the right place, components that should be shared, logic duplicating existing code |
| **5. Tests** | backend: unit tests included, error paths covered? / frontend: `-test` task created? / any test that asserts nothing real? |

## Severity

| Level | Definition | Effect on merge |
|---|---|---|
| **Must fix before merge** | broken behavior / data leak / constitution violation / AC not met | **Blocks** |
| **Should fix** | quality, readability, duplication, will become debt | Does not block, but must be answered: fix now or open a task |
| **Observation** | opinion, alternative | Does not block |

**Cap on observations: at most 5 per review.** Beyond that, keep only the most important.

## Do not report

- Formatting the linter / prettier already catches
- Generated files: `components/ui/**`, `*.generated.*`, migrations, lockfiles
- Anything a hook already enforces
- Large refactors outside the task scope → propose a **new task** instead

## Anti-over-review rules

> A reviewer told to "find problems" will always find some, even when the work is fine, because that is what it was told.
> Fixing everything found leads to over-engineering: unnecessary abstractions, defensive code, tests for cases that cannot happen.

- Report only what affects **correctness** or a **stated requirement**; everything else is optional
- **Never propose adding an abstraction "for the future"** (violates constitution art. 4 and 5)
- If nothing reaches "must fix", say so plainly — **do not pad the report to look diligent**

## Report format

Every item has all four parts:

```
[level] path/to/file.ts:42
Problem: <what>
How it breaks: <the real scenario / input that makes it wrong>
Fix: <an actionable suggestion>
```

## After review

- Something found for the **2nd time** → add to `AGENTS.md` under "Things the AI gets wrong in this project"
- Something repeated that is a must-not-break rule → promote to a rule in `.claude/rules/` or a hook
- Something that once reached production → write an eval in `docs/evals/`
- **The AI does not approve its own work.** The review result is input for a human decision, not an approval.

## Revisit this policy

Monthly, or whenever review starts feeling useless, ask three questions:
Is the report too long for anyone to read? / Did something important reach production anyway? / Are observations taking more time than real issues?
