---
name: learn
description: Turn the usage store into changes to Buaflow itself — read the report, judge each task it raises, and either draft an eval case from it or close it with a reason. Runs only in the Buaflow repository; the store it reads does not exist anywhere else.
argument-hint: "[project/task]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node *), Bash(git *)
---

Learn: $ARGUMENTS

Talk to the user in Thai.

> **This skill lives only in this repository.** It is not in `core/skills/`, so it is never generated into
> `claude-setup/` or the plugin: it reads `~/.buaflow/usage.json` and a private store that no adopting project
> has, and every case it drafts names `core/skills/*.md` as what it tests. See EV-012 in
> `development/state.json`.

## What this loop is for

The capture side is automatic; changing a skill is deliberately not. Events say what happened on real work.
This skill turns that into one of three things and nothing else:

1. an **eval case** — a real failure becomes a regression test for a skill
2. a **decision that nothing is owed** — with the reason written down, so it is not raised again
3. a **finding about capture itself** — the report is wrong, not the work (that is a task on this repository)

**Never edit a skill, rule or standard directly from here.** A config change goes through EV-006:
`change-proposal` → the change → evals pass and do not regress → release. The rule that a case's author may not
grade it holds here too: you draft, a person decides, and grading happens in a session that did not write the case.

## 0. Is there anything to learn

```
node bin/buaflow.js usage report
```

Read the whole thing before deciding anything. The three sections answer different questions:

| section | what it tells you |
|---|---|
| counts line | how much of what you are reading is real — `repeat(s)`, `skipped`, `unreadable` are all capture faults |
| By model | whether a model is costing more rework than another. Only comparable once both have real `/check` rounds |
| By project | which projects are actually feeding the loop, and whether their evidence has gone stale |
| Tasks worth a look | the work. Already-decided tasks are hidden unless you pass `--all` |

If `repeat(s)`, `skipped` or `unreadable` is not zero, **stop and say so first.** Those are bugs in capture, and
every number below them is measured on data you know is wrong. Open a task on this repository instead of
drafting cases from it.

With no tasks raised, say that plainly and stop. An empty list is the loop working, not a reason to go looking.

## 1. Read the task before judging it

For each task in the list, worst score first (with an argument, only that one):

```
node bin/buaflow.js usage show <project>/<task>
```

Read its whole timeline — intent → plan approved → status moves → `/check` rounds → done. Then answer, out loud,
one question: **which step of Buaflow should have caught this, and what would it have had to say?**

The honest answers include "none of them". Work through these before assuming a skill is at fault:

| what you see | what it usually means |
|---|---|
| a must-fix nothing in the process could have prevented (no dev server in the sandbox, a human-only check) | nothing to learn — outcome `none` |
| a must-fix that a rule, a DoD line or the plan's Proofs already covers | the rule is there and was not followed → an eval case for the skill that should have applied it |
| the same kind of must-fix on a third task | this is the one that earns a case; twice is a coincidence, three times is a pattern |
| a `fixes:` link back to a closed task | the earlier `/check` passed something it should not have — read that task too |
| a move backward inside a session | somebody reopened it. Why is in the task file, not in the events |

## 2. Draft, when a case is what it needs

```
node bin/buaflow.js usage eval-draft --task <project>/<task>
```

It writes `<store>/evals/drafts/EV-0xx.json` and it is a **draft, not a case**. Before it can move to
`claude-setup/evals/`, every one of these has to be true — check them, do not assume:

- no `<แก้ก่อนใช้…>` placeholder is left
- `prompt` is a question that actually exercises the skill, not the pasted intent
- every `criteria` statement is judgeable by someone who has not seen this task, and says what the skill should
  have done — not what the reviewer happened to find
- `tests` names the skill this really tests, not every skill the task touched
- AC copied from a task recorded before kit 3.15.1 may be **cut at a line wrap** — the fix landed in EV-012 but
  old events keep the cut. Read the real task file before trusting a `must-happen` statement

Tell the user what you changed and why, then let them decide whether it moves.

## 3. Close it, always

Nothing is learnt until the task is closed. This is what stops the report raising it forever:

```
node bin/buaflow.js usage review <project>/<task> --outcome eval    --eval EV-0xx
node bin/buaflow.js usage review <project>/<task> --outcome covered --eval EV-0xx
node bin/buaflow.js usage review <project>/<task> --outcome none    --note "<why there is nothing here>"
```

It writes `reviews/<project>/<task>.json` in the store, stamped with the newest event it looked at. **Events are
never deleted** — a case that declares `observedIn` has to stay traceable back to them — so the decision is what
closes the loop, not a cleanup. If that task records something new later, it comes back on the list marked
`(moved since)`, because the decision was made about a story that has gone on.

The decision names a person, read from `git config user.name`. Do not run this on the user's behalf without
their answer; a model closing its own signal is the same mistake as a model grading its own eval.

## 4. Push the store, or none of it counts

The store is a git repository. Drafts and decisions sit in the clone until they are pushed:

```
git -C <store> status --short
```

Show the user what is uncommitted and let them commit and push. Until that happens, the other machines still
see the tasks as open.

## 5. What to hand back

Six lines, no more:

```
report:   <n> event(s) · <n> repeat(s)/skipped — <clean, or the capture fault to fix first>
raised:   <n> task(s), <n> already decided
read:     <project/task list you actually opened>
drafted:  EV-0xx from <task> — <what it tests>   (or: none)
closed:   <task> <outcome> · <task> <outcome>
store:    <pushed, or what is waiting>
```

Then one sentence: what this round says about Buaflow, or that it says nothing yet. "Not enough data" is a
real answer — with three `/check` rounds on one project there is nothing to conclude about models, and saying so
is better than a trend drawn through two points.
