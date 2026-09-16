---
name: task
description: Pick a task from the backlog and work it. Pass an ID or leave empty to get suggestions. Covers choosing the task, confirming understanding, implementing, and self-checking before /check.
argument-hint: "[T-xxx]"
allowed-tools: Read Glob Grep Edit Write Bash(git *) Bash(pnpm *) Bash(node .claude/*)
---

Work on: $ARGUMENTS

Talk to the user in Thai. Notes written into the task file are in Thai.

## Current state

!`git status --short || true`

---

## 1. Choose the task

- Read `docs/backlog/board.md`, Todo section (already sorted; has a "deps met" column)
- ID given → use it / none → offer the top 2–3 with deps met, with a one-line reason each
- A task is already `in-progress` → **warn first** (rule: one at a time — `docs-lint` will flag it)

## 2. Read enough, not the whole chain

| Situation | Read |
|---|---|
| `docs/plans/<ID>.md` exists | **plan.md only** — it already distilled the ACs, constitution articles, and files to touch. Do not reopen spec/constitution |
| No plan | The task file + the parent spec's ACs (only the ones this task covers) |
| Modifying existing code | **The code you will touch** — always read it first; never guess what is inside |

Per-type DoD loads on its own via `.claude/rules/` when you touch the files — do not open `definition-of-done.md`.

## 3. Which track / is a plan required?

| Situation | Do |
|---|---|
| `track: trivial` in the task file (typo / copy / log / chore describable in one sentence) | skip step 4 → do it → `/check` (low level) |
| plan.md exists | follow it |
| More than 3 files / DB / auth / existing behavior in use / unfamiliar code | **stop and tell the user to run `/plan <ID>` first** |
| Anything else describable in one sentence | short step 4, then go |

## 4. Confirm understanding (never skip — 300 tokens here prevent 50k tokens in the wrong direction)

Briefly:
- What it does / what it **does not** do
- Files to touch
- **Proof**: which command/test/screen proves it is done
- UI → components to use (went through `/ui`?) / API → endpoints + error codes
- What is still unclear

**Wait for the user to confirm before writing.**

## 5. Implement

- Branch `<type>/<ID>-<short-english-description>`
- Task file: `status: in-progress`, `started: <date>`, `branch:` → `node .claude/board.js`
- Work the ACs one by one in the plan's order — **write one step, run verify, next step**; not everything at once and verify at the end
- Bug fix: **write the failing test first**, then fix (the hook blocks editing test files on `fix/` branches — that is intended)
- Small Conventional Commits referencing the task id
- Anything out of scope → **stop and ask**; propose a new task; never do it "while you're there"
- Plan no longer works → **stop, fix plan.md first**; never drift silently
- **Same spot fails twice in a row → stop.** Tell the user; consider `/clear` and a sharper restart — do not keep retrying in the same turn

## 6. Self-check before finishing

```
pnpm verify
```
Paste the **summary line** it prints (full log is in `.verify.log`) — never claim it passed without running it.
Complete every Proof in the plan and show the result.

## 7. Next

Suggest `/check <ID>`
