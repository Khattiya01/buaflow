---
name: task
description: Pick a task from the backlog and work it. Pass an ID or leave empty to get suggestions. Covers choosing the task, confirming understanding, implementing, and self-checking before /check.
argument-hint: "[T-xxx]"
allowed-tools: Read Glob Grep Edit Write Bash(git *) Bash(gh pr *) Bash(glab mr *) Bash(pnpm *) Bash(node .claude/*)
---

Work on: $ARGUMENTS

Talk to the user in Thai. Notes written into the task file are in Thai.

## Current state

!`git status --short || true`

---

## 1. Choose the task

- Read `docs/backlog/board.md`, Todo section (already sorted; has a "deps met" column)
- ID given → use it / none → offer the top 2–3 with deps met, with a one-line reason each
- **Only check the requested task itself — never scan the board and warn about other WIP.** The user
  already knows what they came to work on; In Progress lists *everyone's* WIP (parallel work across
  branches is normal, see `docs-sync.md`), so guessing whose entry is "yours" is exactly how the AI
  ends up warning about a task the user was never touching.
  - Requested task is already `in-progress` → tell the user who has it (board's "ใครทำ" column / the
    task file's `assignee:`, if set) and stop — do not start a second claim on the same task.
  - Anything else `in-progress` on the board, yours or anyone else's → not relevant here, proceed.

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
- Task file: `status: in-progress`, `started: <date>`, `branch:`, **`assignee:` = `git config user.name`
  (fallback `user.email`)** → `node .claude/board.js`
  (`assignee:` is just a label here, not something the AI reasons about — it fills the board's "ใครทำ"
  column so a teammate who hits the "already in-progress" stop in step 1 knows who to ping, and it's
  what `docs-lint`'s WIP-per-person gate keys off; an empty `assignee:` collapses everyone into the
  same `(ไม่ระบุ)` bucket and breaks that gate)
- **Claim it immediately — before writing any real code:**
  ```bash
  git add docs/backlog/tasks/<ID>.md
  git commit -m "chore(<ID>): claim task"
  git push -u origin <branch>
  gh pr create --draft --base main --fill      # or glab mr create --draft
  ```
  Why: `docs/backlog/board.md` is generated locally and not committed (see `docs-sync.md`), so
  `main` only learns a task is taken when a PR merges — which for a normal task is at the very end.
  Without this, two people can start the same task without knowing, because neither `board.md` nor
  `main` shows the claim until someone finishes. A draft PR makes it visible on the git host right away.
  Skip this only if `gh`/`glab` is unavailable — tell the user to announce the claim some other way.
- Work the ACs one by one in the plan's order — **write one step, run verify, next step**; not everything at once and verify at the end
- Bug fix: **write the failing test first**, then fix (the hook blocks editing test files on `fix/` branches — that is intended)
- Small Conventional Commits referencing the task id
- Anything out of scope → **stop and ask**; propose a new task; never do it "while you're there"
- Plan no longer works → **stop, fix plan.md first**; never drift silently
- **Same spot fails twice in a row → stop.** Tell the user; consider `/clear` and a sharper restart — do not keep retrying in the same turn

## 6. Self-check before finishing

```
node .claude/verify.js
```
Paste the **summary line** it prints (full log is in `.verify.log`) — never claim it passed without running it.
Complete every Proof in the plan and show the result.

## 7. Next

Suggest `/check <ID>`
