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
- **Only check the requested task itself — never scan the board and warn about other WIP** (In Progress lists *everyone's* WIP; parallel work across branches is normal, see `docs-sync.md`)
  - Requested task is already `in-progress` → tell the user who has it (board's "ใครทำ" column / the
    task file's `assignee:`, if set) and stop — do not start a second claim on the same task.
  - Anything else `in-progress`, yours or anyone else's → not relevant here, proceed.
- **The one exception: the same files.** Another open PR changing a file this task will change means one of the two will conflict at merge. Compare the task's `touches:` (or its "files to touch" section) with what the open PRs change:
  ```bash
  gh pr list --state open --json number,title,headRefName,files --jq '.[] | {number, title, headRefName, files: [.files[].path]}'
  ```
  (no `gh` → `git fetch origin` and `git diff --name-only origin/main...origin/<branch>` for each open branch; no remote → skip this check)
  - Overlap → tell the user the PR and the exact files, then offer: **take another task** (name one with deps met and no overlap) · **wait** until that PR merges · **go ahead** knowing it, and pull main in as soon as that PR merges. The user decides; never refuse
  - No overlap, or the task has no `touches:` → proceed without comment

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

- Branch `<type>/<ID>-<short-english-description>`, **from the latest main**: `git switch main && git pull` first
  (resuming a task whose branch already exists → switch to it and `git fetch origin && git merge origin/main`, then run verify before writing more)
- Task file: `status: in-progress`, `started: <date>`, `branch:`, `touches:` (if empty — the files from step 4), **`assignee:` = `git config user.name`
  (fallback `user.email`)** → `node .claude/board.js`
  (`assignee:` fills the board's "ใครทำ" column and is what `docs-lint`'s WIP-per-person gate keys off — left empty it collapses everyone into one bucket and breaks that gate)
- **Claim it immediately — before writing any real code:**
  ```bash
  git add docs/backlog/tasks/<ID>.md
  git commit -m "chore(<ID>): claim task"
  git push -u origin <branch>
  gh pr create --draft --base main --fill      # or glab mr create --draft
  ```
  Why: `board.md` is not committed (see `docs-sync.md`), so `main` only shows a task as taken once a PR merges — at the very end. A draft PR makes the claim visible immediately, so two people cannot start the same task unaware.
  No `gh`/`glab` → tell the user to announce the claim some other way.
- Work the ACs one by one in the plan's order — **write one step, run verify, next step**; not everything at once and verify at the end
- Bug fix: **write the failing test first**, then fix (the hook blocks editing test files on `fix/` branches — that is intended)
- Small Conventional Commits referencing the task id
- Anything out of scope → **stop and ask**; propose a new task; never do it "while you're there"
- Plan no longer works → **stop, fix plan.md first**; never drift silently
- **Repair loop — classify before you fix, and stop inside the budget:**

  | The failure is | Budget | What to do |
  |---|---|---|
  | `implementation-defect` — your code is wrong, the error points at it | **2 attempts** at the same spot | fix, rerun verify; a third failure means your model of the problem is wrong — stop |
  | `spec-gap` — the plan/AC does not say what should happen | **0** | do not guess; stop and ask |
  | `toolchain-failure` / FLAKY in the gate / missing service (DB down, port busy) | **0 code changes** | the code is not the problem; report what failed and what you checked |
  | `integration-mismatch` / `contract-drift` — two sides disagree | **1** | fix the side the plan owns; if it is the other side, stop and ask |

  When you stop, ask **one** question and give the minimum to answer it: the failing line (not the whole log), what you tried and why it did not work, and the class above. If it cost more than one attempt, record it as `docs/evidence/failures/F-0xx.json` (`docs/templates/failure-record.tpl.json`). Do not keep retrying in the same turn, and do not widen the change to make the error go away.

## 6. Self-check before finishing

```
node .claude/verify.js
```
Paste the **summary line** it prints (full log is in `.verify.log`) — never claim it passed without running it.
Complete every Proof in the plan and show the result.

## 7. Next

Suggest `/check <ID>`
