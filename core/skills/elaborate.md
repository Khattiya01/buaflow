---
description: Work out what a thin requirement leaves out before it is specced — the goal behind the ask, what the business domain normally needs around it, and what the system already has — then research it and propose additions for the user to decide. Use after /intent when the brief is open (the customer gave the main features and expects us to think the rest through), before /spec.
argumentHint: <I-0xx>
claudeAllowedTools: ["Read","Glob","Grep","Write","WebSearch","WebFetch","Bash(node .claude/docs-lint.js*)"]
---

Elaborate intent: {{ARGUMENTS}}

Talk to the user in Thai. The elaboration file is written in full Thai.

## Why this step exists

A customer's requirement usually names the main features and leaves the rest to us: the states a record goes through, who may see what, the cases that go wrong, what the domain treats as obvious. `/intent` records the customer's words faithfully and must not invent anything; `/spec` writes requirements from the intent. Without this step nobody is asked to think past the words, and a capable model follows the words exactly.

This step is where you **use what you know and what you can find** — not a fixed checklist. The output is **proposals**, never requirements: nothing here reaches the spec until the user decides it.

## Step 0 — Read the intent and its brief

Read `docs/intents/{{ARGUMENTS}}*.md`. No intent → stop and send the user to `/intent` first.

Read `brief:` in its frontmatter:
- `open` — the customer gave the main points and expects us to think the rest through. Accepted proposals go into the spec.
- `fixed` — a TOR or contract; the scope is what is written. Proposals are still worth making, but the right decision for a new item is usually `change-request`: raised with the customer, not built.
- missing → ask the user which one before going further, and write it into the intent.

## Step 1 — Say what the ask is really for

Before looking for gaps, state in two or three sentences **what the customer is trying to achieve** — the decision the feature supports or the job it does. Every proposal later is judged against this, so get it confirmed if the intent does not already say it.

> "A dashboard of sales and invoices" is a feature. "Finance can see which customers owe money and chase them before it goes bad" is the goal — and it is the goal that tells you aging, overdue alerts and partial payments belong.

## Step 2 — Read what the system already has

Only what touches this feature: related specs in `docs/specs/`, `docs/planning/01-requirements.md` and `04-architecture.md` if present, the data model, and existing modules. A proposal that duplicates something the system already does is noise; a proposal that connects to it ("invoices already exist in X, so the dashboard should read from there, not a new table") is the most valuable kind.

## Step 3 — Research the domain

Search for how this kind of feature works **in this kind of business**: what comparable products offer, the states and rules the domain takes for granted, local regulation or standards when data, money or personal information is involved. Use WebSearch/WebFetch; read the pages, do not cite a search result you did not open.

Lenses to think through — use the ones that apply, skip the rest, add your own:
- **Goal fit:** does the ask as written reach the goal from Step 1?
- **Lifecycle:** every state each entity passes through, and what moves it between them
- **Actors and permissions:** who creates, sees, changes, approves
- **Exceptions:** partial, cancelled, reversed, late, duplicated, failed
- **Data:** where it comes from, how fresh it must be, what history must be kept
- **Integration:** what existing modules or external systems it has to agree with
- **Domain rules:** regulation, tax, consent, audit that the domain requires

Depth scales with the size of the feature (a few searches for a screen, more for a new module). There is **no cap on the number of proposals** — the research is already paid for; ranking and grouping are what keep the list usable.

## Step 4 — Write the proposals

`docs/templates/elaboration.tpl.md` → `docs/elaboration/{{ARGUMENTS}}-<slug>.md`.

One row per proposal, `E-01` upward, **ranked by how much the goal depends on it**, grouped `must` / `should` / `could`:
- **ข้อเสนอ** — what to add, in the user's language
- **ทำไม** — which part of the goal it serves, or what goes wrong without it
- **แหล่งที่มา** — the URL you read, or the file in this repository it comes from. A proposal from general knowledge says so plainly; do not invent a source
- **การตัดสิน** — `pending` until the user decides

A question only the customer can answer is not a proposal: add it to the intent as `[NEEDS CLARIFICATION (<dimension>): …]`.

## Step 5 — Let the user decide, in groups

Show the proposals grouped by level with a one-line reason each, and **recommend** a decision per group. The user can decide a whole group at once ("accept every must, defer every could") and then pick out single items.

Decisions: `accepted` (goes into the spec) · `change-request` (raise with the customer before building — the usual answer under a `fixed` brief) · `rejected` · `deferred`.

When the user ends the round, anything still `pending` becomes `deferred` — a proposal is never lost and never silently accepted. Then run `node .claude/docs-lint.js` and report the Elaboration section.

## Step 6 — Hand over to /spec, then stop

Tell the user the next step is `/spec` and that it will write the `accepted` proposals as requirements citing their `E-xx`, so it stays visible which requirements the customer asked for and which ones we proposed. **Stop and wait** — never start the spec yourself.
