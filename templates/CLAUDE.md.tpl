@AGENTS.md

# Claude Code — {{PROJECT_NAME}}

<!-- ภาษาอังกฤษโดยตั้งใจ — AI อ่านทุก session (ดูหมวด Language ใน AGENTS.md) -->

> All core rules are in `AGENTS.md` (imported above — never remove the first line).
> This file holds only Claude Code-specific things. **Do not duplicate rules here.**

## Skills in this project

```
/intent  <topic>    Open new work — capture "why" before "what"
/spec    <F-xx>     Spec a large feature (requirements -> design -> tasks)
/plan    <T-xxx>    Plan before touching code; commits plan.md first
/task    [T-xxx]    Pick a task from the board and work it
/ui      <name>     Start a UI component (always asks first)
/check   [T-xxx]    Check the work: verify + compare to plan + /code-review + /security-review (not named /review — that is an alias of the built-in)
/done    <T-xxx>    Open a PR + update the task file + regenerate the board (never merges)
/hotfix  <symptom>  Production hotfix procedure
/release <env> <M>  Release to uat / prd (runs gate --release first)
```

**Built-ins used alongside:** `/code-review [level]` `/security-review` `/simplify` (called from `/check`) ·
`/doctor` `/insights` `/context` `/usage` (Phase 8) · `/rewind` when heading the wrong way

## Rules loaded automatically by file path

Files in `.claude/rules/` enter context on their own when Claude reads a file matching their `paths:`.
No need to ask for them, and they cost nothing when not relevant.

| File | Loads when touching |
|---|---|
| `frontend-ui.md` | `components/**`, `app/**/*.tsx` |
| `backend-api.md` | `src/api/**`, `src/modules/**` |
| `i18n.md` | `**/*.tsx`, `messages/**` |
| `db-migration.md` | `prisma/**` |
| `testing.md` | `**/*.spec.ts`, `**/*.test.tsx` |
| `docs-sync.md` | `docs/**` |

## Active hooks (enforced — cannot be talked around)

| When | What |
|---|---|
| Session start | Injects board status + in-progress tasks into context |
| Editing `components/ui/**` | **Blocked** (shadcn-generated) |
| Editing a test file while on a `fix/` branch | **Blocked** (prevents fixing the test instead of the bug) |
| `git commit --no-verify` or running sonar | **Blocked** |
| `git merge` / `git push` into main, `push --no-verify` | **Blocked** — open a PR for a human |
| Editing `docs/backlog/board.md` | **Blocked** — generated from task files |
| After editing a file | format + lint that file only |

If a hook blocks you and you believe this is a legitimate exception → **tell the user what blocked you and why. Do not look for a workaround.**

## Context management

- **After `/done`, always `/clear`** before the next task — old context does not help the new task but is billed every turn (`/usage` flag "long context" = this rule was skipped)
- One task at a time — unrelated work gets a `/clear` first
- Read `plan.md` alone during implementation/check — do not re-read spec / constitution / DoD (already distilled)
- Paste the **summary line** of verify, not the full log
- **Same spot fails twice in a row → stop, `/clear`, restart with a sharper prompt.** Do not keep retrying in the same turn — the context fills with failed attempts
- Work that reads many files (exploring legacy code, hunting a pattern across the repo) → use a subagent, not the main context
- Every time the user has to repeat the same correction a 2nd time → add it to `AGENTS.md` under "Things the AI gets wrong in this project"

## Reply style (fewer output tokens without losing clarity)

- No preamble, no restating the question, no recap of what was just done, no narrating tool calls
- Bullets / short tables — prose only where a reason needs explaining
- Don't paste logs/diffs the user can see themselves (verify → summary line; diff → in the PR)
- **Three cases that must be written in full:** security warnings · confirmation of irreversible actions (merge / migration / delete) · multi-step sequences where order matters
- Code, commit messages, PRs, error messages are always verbatim — never abbreviated
- **Artifact files (intent / spec / plan / ADR / task) are always written in full Thai** — terse style applies to chat replies only; those files are re-read many times by humans and other sessions, and ambiguity costs more than tokens

## Compact instructions

On `/compact` keep: current task id + branch, ACs not yet passing, latest verify result, decisions the user made in this session.
Safe to drop: contents of files already read (can be re-read), logs of verify runs that passed, approaches that failed (keep a one-line conclusion only).

## Subagents

| Agent | Use when |
|---|---|
| `code-reviewer` (sonnet) | Checks what the built-ins cannot know: matches the plan / project rules (called by `/check`, given plan + diff only) |
| `test-writer` (sonnet) | Writing tests that need reading a lot of existing code but produce few files |
| `legacy-explorer` (haiku) | Digging through an old project — keeps the main context small |

General search uses the built-in `Explore`; no need to write your own.
