---
name: check
description: Check finished work before asking a human to approve. Runs verify for real, compares the diff to the plan, then hands the diff to the built-in /code-review and /security-review. Use after /task and before /done. Not named /review because that collides with the built-in alias.
argument-hint: "[T-xxx]"
allowed-tools: Read Glob Grep Bash(git *) Bash(pnpm verify*) Bash(node .claude/*) Agent(code-reviewer)
---

Check: $ARGUMENTS

Talk to the user in Thai. Pass findings from the built-ins and the subagent through in whatever language they arrive; add your verdict lines in Thai.

## Current state

!`git status --short || true`

!`git --no-pager diff --stat HEAD || true`

---

## 0. Which track

Read `track:` in the task file (`docs/backlog/tasks/<ID>.md`)

| track | Do |
|---|---|
| `trivial` (typo / copy / log / one-line chore) | step 1 → `/code-review low` → step 5 only |
| `full` (default) | every step |

## 1. Run the real thing first — never review broken code

```
pnpm verify
```

- Fails → **stop, fix first**, then start over
- Passes → paste the summary line `verify` prints (not the full log — it is in `.verify.log` if anyone wants it)

## 2. Compare against what was promised

Read **only** `docs/plans/<T-xxx>.md` (none → use the ACs in the task file instead).
plan.md has a "Distilled requirements" section with the constitution articles + ACs that apply to this task — **do not re-read the spec / constitution in full**.

Answer three things:
- What in the plan **was not done** — why
- What was **done beyond the plan** — why it was necessary (can't explain = scope creep)
- The Proofs in the plan — **actually run them and paste the results**

## 3. Hand the diff to the built-ins

In this order:

1. **`/code-review`** — level by diff size: ≤ 3 files → `low`, normal → `medium`, touches auth / money / migrations → `high`
2. **`/security-review`** — **only when** the diff touches `auth`, `api`, `prisma`, `migrations`, uploads, or env/secrets
3. subagent **`code-reviewer`** — checks what the built-ins cannot know: matches the plan? violates which constitution article? project standards.
   **Give it exactly three things**: the path to plan.md, the constitution articles distilled in the plan, and `git diff main...HEAD`.
   Do not let it re-read AGENTS.md / DoD / the whole spec.

> Why split: `/code-review` finds bugs better than a hand-written prompt but doesn't know what this project agreed on.
> Our subagent knows the project rules but shouldn't waste time hunting off-by-ones again.

## 4. Per-type checks — report **only failing items**

The path-scoped rules (`.claude/rules/*.md`) already loaded the DoD for this work type when you touched the files.
Go through it and write only: `DoD <type>: N/M pass — failing: <items>` — **never enumerate every item as prose**.

Extra things that usually slip and no linter catches:
- secrets / values that belong in env
- leftover debug logs, files that should not be committed
- commit messages malformed or missing the task id

## 5. Summary for the human to decide — short

```
T-xxx <title>
verify: <summary line from verify>
plan:   complete / missing <..> / extra <..>
review: /code-review <n> findings · /security-review <n> · code-reviewer <n>
DoD:    <type> N/M — failing: <..>

Must fix before merge:  (path:line — what — how it breaks)
Should fix:
Open as a separate task:
```

Results from `/code-review` and the subagent are **passed through as they reported them** — do not rewrite them; add only your verdict lines.
At most 5 observations total. If nothing reaches "must fix", say so plainly.

Then ask: **fix now** or **approve → `/done`**

> **The AI does not approve its own work** and does not merge — a human merges the PR after the gate passes.
> "Feed lessons back into config" happens in `/done` only; do not ask it again here.
