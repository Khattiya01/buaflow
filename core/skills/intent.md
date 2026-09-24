---
description: Open new work by capturing "why" before "what". Use for an idea, a problem, a user request, a postmortem outcome, or a Sonar finding that has not yet been decided on. Tiny work (typo/copy/log) uses the trivial track instead.
argumentHint: <topic to open>
claudeAllowedTools: ["Read","Glob","Grep","Write","Bash(node .claude/board.js*)"]
---

Open an intent for: {{ARGUMENTS}}

Talk to the user in Thai. The intent file is written in full Thai.

## Step 0 — Does this need an intent at all?

**Trivial track** — if **all** of the following hold, skip the intent:
- The whole diff can be described in one sentence (typo, copy, a log line, a patch version bump, a chore)
- No user-visible behavior change; does not touch DB / auth / API contract
- Nobody has to decide anything

→ Create `docs/backlog/tasks/T-xxx.md` directly with `track: trivial`, `type: chore|docs`, and a **one-line** "why".
Then `/task T-xxx` (it still goes through `/check` at low level and a PR like everything else).

> Why this track exists: if fixing a typo needs intent + plan + task + check + done = 5 skills and 5 round-trips,
> people stop using the system entirely — that is how processes actually die.

Otherwise continue.

## Why this step exists

All work enters through `docs/intents/` — if you start from "what", the "why" is lost from the first step,
and at the first mid-way trade-off nobody knows what matters more. If it is obvious, this takes 3 minutes.

## Step 1 — Listen first; do not propose a solution yet

Separate the **symptom** from the **solution the user already has in mind**.
> Users usually describe a solution ("I want an Excel export button") — ask **what they will do with it**.

For new feature work (not a bug, not a small change), ask one more thing: **is this brief open or fixed?**
- `open` — the customer gave the main points and expects us to think the rest through
- `fixed` — a TOR or contract; build what is written and nothing more

Record it as `brief:` in the frontmatter. It decides whether `/elaborate` runs and what its proposals become. Leave `brief:` out for bugs and small changes.

## Step 2 — Ask what you still don't know (max 4 questions per round)

1. **What is the actual problem** — what can't be done today / what breaks / how many minutes of manual work per occurrence
2. **Evidence** — who complains, how many, how often, any logs/numbers
3. **What "better" looks like** — how success is measured
4. **What must not break** — existing behavior / deadline / business constraints

Anything unanswered → `[NEEDS CLARIFICATION (<dimension>): <question>]` **never fill it in yourself**. `<dimension>` is the decision the answer changes: `architecture`, `security`, `cost`, `data`, `scope`, `ux` or `legal`. A question whose answer changes none of those is not asked — pick a sensible default, say which one, and move on. More than 8 open questions in one file means low-impact ones should become defaults or assumptions.

If the user chooses to proceed on something nobody can answer yet, that is an assumption, not a clarification: record it in `docs/evidence/assumptions.json` with a person who can confirm it, its impact, an expiry date and how it will be checked (`docs/templates/assumption-ledger.tpl.json`).

## Step 3 — Check for duplicates

Search `docs/intents/` (including `status: rejected` — rejected topics come back) and `docs/backlog/tasks/`.
Duplicate → tell the user where, ask whether to update the existing one or open a new one.

## Step 4 — Write the file

`docs/templates/intent.tpl.md` → `docs/intents/I-0xx-<slug>.md` (next number after the latest).
**Write in the user's words**, not engineer words — this file is read when deciding, not when implementing.
Put the answers from Step 2 into the file — `/spec` will **read** them there and must not re-ask.

Then `node .claude/board.js` (the intent appears in the "awaiting decision" table automatically).

## Step 5 — Offer the paths, then stop

| Decision | Next |
|---|---|
| **Do it** — `brief: open` | `/elaborate <I-0xx>` first — this file holds the customer's words only; working out what they left out is that step's job, not this one's |
| **Do it** — large feature | `/spec <F-xx>` |
| **Do it** — small, has a parent spec, or is a bug | create a task directly in `docs/backlog/tasks/` with `intent:` set |
| **Not now** | `status: deferred` + the condition for revisiting |
| **No** | `status: rejected` + reason — **never delete the file** |

Recommend one path with a reason, then **stop and wait for the user's decision**. Never proceed to spec on your own.
