---
name: spec
description: Spec a large feature as requirements, design, and tasks with an approval gate between each. Use when an intent has been accepted and the work is big enough to need a spec.
argument-hint: "<F-xx or feature name>"
allowed-tools: Read Glob Grep Write Bash(node .claude/board.js*)
---

Spec for: $ARGUMENTS

Use `docs/templates/spec.tpl.md`; store in `docs/specs/<F-xx>-<name>/`.
Talk to the user in Thai. All three spec files are written in full Thai (EARS keywords stay English).

## Hard rules for this step

- **One file at a time; the user approves before the next file.** Never write all three at once.
- **No code until all three files are approved.**
- **No guessing** — `[NEEDS CLARIFICATION (<dimension>): <question>]` where `<dimension>` is the decision the answer changes (`architecture`/`security`/`cost`/`data`/`scope`/`ux`/`legal`); a question that changes none of them is not asked. Collected at the end of the file. A file with markers left **cannot pass the gate** (`docs-lint` catches it).
- **A guess nobody can answer yet** (load in year one, which provider the customer will pick) is not a clarification question — the user chooses to proceed on it. Record it in `docs/evidence/assumptions.json` (template `docs/templates/assumption-ledger.tpl.json`): a person who can confirm it, impact, an expiry date and how it will be checked. The gate fails when one is still open past its expiry.
- Whenever you offer options, recommend one with the trade-off.

## Before starting — read only what is needed

- The source intent `docs/intents/I-0xx-*.md` — **it already answers "why / how measured / what must not break". Do not re-ask the user.** Write the requirements from it.
  (no intent → go back to `/intent` first)
- `docs/elaboration/I-0xx-*.md` if it exists — write `spec:` into its frontmatter. Every `accepted` proposal becomes a requirement that cites its `E-xx`, so it stays visible which requirements the customer asked for and which ones we proposed. `change-request`, `rejected` and `deferred` ones go under **out of scope this round**, never into the ACs. The intent says `brief: open` and there is no elaboration file → offer `/elaborate` first; if the user skips it, write `elaboration: skipped` in the intent's frontmatter.
- `docs/constitution.md` art. 4, 5, 6 (used in design)
- `docs/planning/04-architecture.md` **only the relevant sections** (API contract, auth, data)
- `prisma/schema.prisma` if the feature touches data — this is the source of truth for the data model
- One spec of a similar feature — **follow the existing pattern**

## Step 1 — requirements.md

User stories, business rules, **ACs in EARS**, edge cases, permissions, measurable non-functionals, **out of scope this round**.

EARS, four sentence forms only:
```
WHEN <event> THE SYSTEM SHALL <behavior>
WHILE <state> THE SYSTEM SHALL <behavior>
IF <condition> THEN THE SYSTEM SHALL <behavior>
THE SYSTEM SHALL <behavior>
```
> "Handle errors well" is untestable — every AC must translate directly into a test name.

Short gate report: markers left / all ACs in EARS / measurable success criteria.
Ask "Are the ACs complete? Any case I missed?" → **stop and wait for approval**

## Step 2 — design.md (only after Step 1 is approved)

1. **Check against the constitution first** — art. 4 (small first), 5 (no needless wrapping), 6 (contract first). A new dependency must explain why the existing ones are not enough.
2. **DB changes — written as a diff against the current `schema.prisma`** (models/fields added/changed/removed) + migration + **rollback**.
   Destructive → expand/contract · confirm you are not creating an entity that duplicates an existing one under a new name.
3. API contract: path, request, response, error codes, permissions
4. UI: affected screens, components (**existing / shadcn / new**), i18n keys, loading/empty/error states
5. Impact on existing behavior / breaking changes
6. Security
7. **Test plan mapped to each AC** — an AC with no way to prove it is a badly written AC
8. Alternatives considered and rejected

A new component with no design → **ask the user per `ui-component-rules.md`**
Gate report → **stop and wait for approval**

## Step 3 — tasks.md (only after Step 2 is approved)

- Tasks that **finish within one session**, with dependencies and the ACs they cover
- Backend tasks include their unit tests / frontend tasks get a paired `-test` (blocked)
- **The files each task will change** (`touches`), read from design.md and the existing code — real paths or folders, not "backend"
- `[P]` only on a task that can run beside every other `[P]` task **without a conflict**: no `depends_on` between them **and** no file in common. Swappable order alone is not enough — two tasks that change the same file on separate branches conflict at merge
- Two tasks share a file → pick one and say which: **merge** them into one task · **order** them with `depends_on` · **re-slice** by feature (one feature through every layer) instead of by layer (all API, then all UI), which is the split that collides most
- A file every task has to add a line to (route registry, barrel `index.ts`, a single OpenAPI or i18n file) → no split avoids it; tell the user and point to "hot-spot" files in `docs/standards/commit-and-branch.md` — a structural fix is its own `refactor` task, not part of this feature
- A task for OpenAPI / Postman updates
- The table "ACs with no covering task" **must be empty**

Then:
1. Create `docs/backlog/tasks/T-xxx.md` for every task — fill `intent:`, `spec:`, `milestone:`, `priority:`, `depends_on:` (the board sorts on these) and `touches:` (docs-lint warns when two open tasks share a path with no `depends_on` between them)
2. Source intent → `status: accepted` + link to this spec
3. `node .claude/board.js` (**do not hand-edit board.md; there is no import.csv anymore** — task files are the source of truth)
4. Propose the first task and whether it should go through `/plan` first
