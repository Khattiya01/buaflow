---
description: Plan before touching code and save it as plan.md that distills every requirement this task needs into one file, so /task and /check read one file only. Use for work that changes several files, unfamiliar code, or risky tasks.
argumentHint: <T-xxx>
claudeAllowedTools: ["Read","Glob","Grep","Bash(git log *)","Bash(git diff *)"]
---

Plan for: {{ARGUMENTS}}

Talk to the user in Thai. plan.md is written in full Thai (copied EARS sentences stay as-is).

## First — enter plan mode

Not in plan mode yet → tell the user to press `Shift+Tab` until `plan mode on`.
Why: plan mode makes editing files **technically impossible**, not just a promise.

## When you may skip this

The whole diff can be described in one sentence (typo, log, rename) → skip.
Otherwise always plan, especially: more than 3 files / code you didn't write / DB / auth / existing behavior in use.

## What plan.md is for (different from before)

**plan.md is a compressor, not a relay.** This is the **only** point in the cycle where the spec, constitution, and existing code are read in full.
After this, `/task` and `/check` read **plan.md alone** and never go back to the sources.
So anything not in plan.md is invisible during implementation.

## Step 1 — Read everything (once)

- `docs/backlog/tasks/<ID>.md`
- Parent spec: `requirements.md` (only the ACs this task covers) + `design.md` (relevant parts)
- `docs/constitution.md` — pick the articles that **actually apply to this task** (usually 2–4, not all 9)
- **The existing code you will touch** and similar work already done — **follow the existing pattern**
- If touching the DB: the relevant part of `prisma/schema.prisma` (source of truth for the data model)

Reading so much that context would bloat → subagent `Explore`, bring back conclusions only.

## Step 2 — Interview the user (max 4 questions per round)

Ask only what is unclear **and changes the outcome**: alternatives with materially different results (offer 2, recommend 1), edge cases the spec doesn't mention, existing behavior that may be affected.

## Step 3 — Write the plan

`docs/templates/plan.tpl.md` → `docs/plans/<T-xxx>.md`

Five sections, **all required**:

| Section | Required level |
|---|---|
| **Distilled requirements** | ACs covered (copy the EARS sentences verbatim) + constitution articles that apply (number + one line) + design.md rules that matter (error codes, i18n keys, components to use) — **this is what /check compares against** |
| **Files to change** | real paths + what happens to each, not "backend changes" |
| **Order of work** | arranged so each step can be verified on its own |
| **Risks** | what can break + **how you would know** |
| **Proof** | the command / test / screen that, when run, proves it is done |

Can't write the Proof = you don't understand the task yet → back to Step 1.

## Step 4 — Let the user review

Also state: the point you are least sure about / what you decided on their behalf and how the other choice would differ.
(The user can press `Ctrl+G` to open the plan in an editor.) **Iterate until they are satisfied.** Do not rush out of plan mode.

## Step 5 — Close the plan

1. Set `approved_by:` in plan.md to the name of the person who approved it in Step 4 (`git config user.name` when that is the person running this session). Never your own name, and never leave the `<ใครอนุมัติ>` placeholder: an approved plan is what usage capture records as `plan.approved`
2. Commit `docs/plans/<T-xxx>.md` (`docs: add plan for T-xxx`)
3. Set `plan:` in the task file
4. Tell the user to leave plan mode and run `/task <T-xxx>`

## If the plan stops working mid-implementation

**Stop** → edit plan.md (including "Distilled requirements" if you found a missed requirement) → tell the user → then continue.
Never drift silently: `/check` compares the diff to the plan, and unexplained differences will be caught.
