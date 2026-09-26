---
name: done
description: Close a task that passed /check and was approved by the user. Marks the PR ready for review (never merges), updates the task file, regenerates the board, unblocks waiting tasks, and feeds lessons back into config.
argument-hint: "[T-xxx]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Edit Bash(git *) Bash(gh pr *) Bash(glab mr *) Bash(node .claude/*)
---

Close: $ARGUMENTS

Talk to the user in Thai. The task file notes are in Thai; commit messages and PR titles are English (Conventional Commits); the PR body is Thai.

## Pre-close checks

- [ ] Passed `/check` and **the user approved**
- [ ] The branch has the latest main: `git fetch origin && git merge-base --is-ancestor origin/main HEAD` — not an ancestor → `git merge origin/main` (never rebase a pushed branch), resolve conflicts, and verify again. A conflict in a file outside the plan → stop and ask
- [ ] `node .claude/verify.js` passes (run it again; paste the summary line)
- [ ] Every Proof in the plan/task is done and shown
- [ ] `node .claude/docs-lint.js` passes

Anything missing → say what, then stop. **Never close unfinished work.**

## Steps

### 1. Update the task file (one place — this is the source of truth)

Edit the frontmatter of `docs/backlog/tasks/<ID>.md`:
```yaml
status: review          # not done yet — done when the PR is merged
branch: <branch>
```
Add to the "notes while working" section anything the next person should know.

If the diff differs materially from `plan.md` → update plan.md to match reality (a plan that lies makes the next estimate wrong).

### 2. Push and mark the PR ready for review — **never merge yourself**

`/task` step 5 already opened this PR as a **draft** the moment the task was claimed (so the claim was
visible on the git host from the start, not just at the end). Push the final commits and undraft it:

```bash
git push -u origin <branch>
gh pr ready              # removes draft status — or `gh pr edit --add-label ...` etc as needed
```

No existing PR (old task from before this existed, or `gh`/`glab` was unavailable at claim time)?
Create one now instead: `gh pr create --base main --fill` (or `glab mr create`).

Update the PR body/description with: the summary from `/check` step 5 (short) + link to plan.md + the verify summary line.
**A human merges** after the gate (CI) passes — even solo: it takes 10 seconds and leaves a record of who approved.

> `guard-bash.js` already blocks `git merge` / `git push` into main — if you are blocked, you are doing it wrong; do not look for a way around.

### 3. After the PR is merged (the user says so, or `gh pr view` shows merged)

- Task file: `status: done`, `closed: <date>`, `commit: <hash on main>`
- Tasks with `depends_on` this one → change `blocked` to `todo`
- **Frontend task** → unblock `T-xxx-test` to `todo` and tell the user there is test debt waiting
  (`docs-lint --release` refuses to release while it is open)
- Source intent fully done → `status: done` on the intent
- `git switch main && git pull && git branch -d <branch>`
- **Other open PRs that change the same files** — they will conflict with what just merged. List them and tell the user to pull main into those branches now, while the conflict is small:
  ```bash
  gh pr view <merged PR> --json files --jq '[.files[].path]'
  gh pr list --state open --json number,title,headRefName,files
  ```
  Name each PR and the shared files. None → say nothing. No `gh` → skip

### 4. Regenerate the board

```bash
node .claude/board.js
```
board.md is generated — **never hand-edit** (a hook blocks it) and **never commit it**
(`docs/backlog/board.md` is gitignored — see `templates/gitignore.tpl`). It's a local view derived
from `docs/backlog/tasks/*.md`; committing it causes a merge conflict on every parallel PR since the
whole file gets rewritten on each regenerate. Anyone who needs it just runs the command above.

### 5. Docs that may need to follow

Ask only about what the diff actually touched:
- API changed → is `docs/api/openapi.json` re-exported?
- New component → `docs/design/components.md`
- Architecture decision made mid-way → ADR

### 6. Feed back into config (only here — `/check` does not ask)

| Found during the work | Where it goes |
|---|---|
| The AI made the same mistake for the **2nd time** | `AGENTS.md` under "Things the AI gets wrong in this project" |
| A must-not-break rule that has now broken | a rule in `.claude/rules/` or a hook |
| Something that would hurt if it reached prd | an eval in `docs/evals/` |

Nothing qualifies → say so plainly. **Do not invent something to fill the section.**
(To judge "2nd time", look at `docs/evals/` and the "gets wrong" section in AGENTS.md — unsure → defer to Phase 8)

### 7. Close the context

Three lines: what was closed / tasks left in the milestone / 1–2 next tasks.
Then tell the user to **`/clear`** before the next task — old context does not help the new task but is billed every turn.
Milestone complete → remind them to run SonarQube and look at `/release`.
