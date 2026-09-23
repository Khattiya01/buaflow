---
description: Urgent production fix procedure — record the symptom, find the cause, choose the approach, fix, release, then postmortem and feed back into the system.
argumentHint: <symptom>
invocation: human
claudeAllowedTools: ["Read","Glob","Grep","Edit","Write","Bash(git *)","Bash(pnpm *)","Bash(docker *)","Bash(gh pr *)","Bash(glab mr *)","Bash(node .claude/*)"]
---

Hotfix: {{ARGUMENTS}}

Talk to the user in Thai. The incident file and postmortem are written in full Thai.

## Hotfix rules
- The **smallest change that stops the bleeding**
- **No refactoring mixed in**, ever
- No features along the way

## Step 1 — Record before fixing (do not jump into code)

Create `docs/incidents/YYYY-MM-DD-<short-name>.md`:
- Observed symptom + the actual error message
- When it started / who reported it
- Who is affected, how severe
- Any temporary workaround

## Step 2 — Find the cause
- Latest logs / errors
- The commit or change most likely responsible
- **Confirm the cause before fixing** — no guess-and-shoot
- Report the cause to the user first

## Step 3 — Choose the approach

Offer the user:

| Option | When |
|---|---|
| **Rollback** to the previous version | just shipped and broke, and rollback is safe — fastest |
| **Hotfix** the specific spot | rollback impossible (e.g. migration already ran) or the bug is old |
| **Disable the feature** temporarily | a flag exists and the rest keeps working with it off |

## Step 4 — Fix
- Branch from **the tag currently on prd**, not from `main` (main may contain untested work)
- `hotfix/T-xxx-<short-description>`
- **Write the failing test first** to prove you caught the right bug, then make it pass
- Change only what is necessary

## Step 5 — Test
- Run `node .claude/verify.js`; paste the summary line
- `/code-review high` + `/security-review` on the diff (the hotfix is the most rushed diff — the easiest to get wrong)
- Test the broken flow locally in conditions as close to prd as possible
- If time allows, go through uat first

## Step 6 — Release
- Open a PR into the branch that is on prd (a human merges — the hook blocks merging yourself), then build a patch-tagged image per `/release`
- Release to prd (the human triggers it)
- **Watch logs for 30 minutes** to confirm it is really fixed
- Tag a patch version

## Step 7 — Close out (do not forget)

- [ ] **Open a PR to merge back into `main`** — otherwise the bug returns next release
- [ ] Append a postmortem to the incident file:
      root cause / why it escaped / how to prevent it
- [ ] **Open a new `intent`** if the hotfix is only a band-aid — not a floating task,
      because fixing the root cause must go through a decision like any other work
- [ ] Add a test that will catch this case in the future
- [ ] **Write an eval** in `docs/evals/` if the cause was the AI doing something it should have known not to
- [ ] If it must never happen again → propose a rule or a hook
- [ ] Task file → `status: done` + `commit:` then `node .claude/board.js`
