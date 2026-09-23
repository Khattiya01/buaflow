---
description: Release to uat or prd — run the milestone gate, build the image once, tag, prepare the release note and rollback plan. Use when closing a milestone, not per task. Works before a deploy target exists.
argumentHint: <uat | prd> <M1>
invocation: human
claudeAllowedTools: ["Read","Glob","Grep","Write","Bash(git *)","Bash(pnpm *)","Bash(docker *)","Bash(node .claude/*)"]
---

Release to: {{ARGUMENTS}}

Talk to the user in Thai. The release note is written in full Thai for the testers.

## Principles

- **One artifact flows through every env** — build the image once at uat, change only env vars. Never rebuild for prd.
- Release in **milestone rounds**, not per task
- **The AI prepares and checks; a human triggers the release** every time
- Without a deploy target you can still get as far as "image + tag + release note + rollback plan" — the rest is **a human placing the image** wherever it goes

## Step 1 — Milestone gate (run for real, paste results)

```bash
node .claude/gate.js --release <M>
```
Runs verify + check-config + docs-lint + release conditions: every task in the milestone is `done`, **no `-test` tasks open**, no spec markers left.
Fails → stop and say what blocks — **never release over test debt**

Additional checks the gate cannot know:
- [ ] `node .claude/run.js coverage` — coverage at target (paste the number)
- [ ] `node .claude/run.js apiTest` passes, if there is an API
- [ ] SonarQube local passes the quality gate — **the user runs it**; the AI only reminds and waits
- [ ] `docs/api/openapi.json` re-exported / `.env.example` matches the variables actually used
- [ ] This round's migrations ran on a DB copy, and you can answer **whether they roll back**

## Step 2 — Build the artifact once (uat only)

```bash
VERSION=v<x.y.z>                                  # semver: minor = normal milestone, patch = hotfix
docker build -t <app>:$VERSION -t <app>:uat .
docker image inspect <app>:$VERSION --format '{{.Id}}'   # paste the digest into the release note
```
No registry yet → `docker save <app>:$VERSION | gzip > dist/<app>-$VERSION.tar.gz` for a human to place

## Step 3 — Release note `docs/releases/<VERSION>.md`

Written for **the testers**, not a commit log:
- What is new (from the milestone's intents/specs) · what was fixed
- **What to test specifically** — an itemized list they can walk through (from the risky ACs)
- What changed that may affect existing behavior
- Migrations: yes/no · reversible/not · backup required?
- Image: tag + digest · new env vars to set

## Step 4 — Rollback plan (answer before releasing)

1. **Code** — back to the previous image tag (`<app>:v<previous>`) in how many minutes, with which command
2. **Database** — can this round's migration be reverted · if not (drop column etc.) → **it must be expand/contract**: add the new alongside the old this round → remove the old next round

> Can't answer both → **not ready to release**

## Step 5 — prd only (everything from uat plus)

- [ ] UAT approved in writing (link/name/date in the release note)
- [ ] `/security-review` on the diff since the previous tag (`git diff v<previous>...HEAD`) with no high findings open
- [ ] `docs/standards/security-checklist.md` passes · `node .claude/run.js audit` has no high/critical
- [ ] **DB backup before running migrations**, and a restore has been rehearsed
- [ ] prd env vars complete, no secrets in git · `/health` `/ready` respond correctly · `/docs` disabled or behind auth
- [ ] Release time agreed + who is on watch
- **Use the same image tag from uat** — never rebuild

**Then stop and wait for the user to trigger the release** — the AI never releases to prd

## After release

- Watch logs/errors for 30–60 minutes + walk the main flow by hand
- `git tag -a $VERSION -m "<milestone>"` + `git push origin $VERSION` · update CHANGELOG
- Close the milestone: `node .claude/board.js`, then remind the user to do **Phase 8** (config review)
