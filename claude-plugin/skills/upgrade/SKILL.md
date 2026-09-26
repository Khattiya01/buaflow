---
name: upgrade
description: Upgrade the Buaflow controls installed in this project (the gate, checkers and lock in .claude/) to the plugin's kit, from any earlier version, including a project installed before the lock existed or by copying the kit into .claude/. Use when the user asks to upgrade Buaflow, or the session notice says the project is behind the plugin.
disable-model-invocation: true
---

# /buaflow:upgrade

Reply to the user in Thai.

One command decides everything an upgrade needs from the project's own files: which version is installed, the route, what each file becomes, which manual steps apply, and which copies in `.claude/` the plugin replaces. Read its report. Read no other Buaflow document, except the one section of `UPGRADE.md` a step below points at.

## 1. Find the kit and start clean

The session context has a line `Buaflow kit <version> (from the buaflow plugin) is at: <KIT>`. Run the CLI as `node "<KIT>/bin/buaflow.js" <command>`. If that line is missing, the plugin's SessionStart hook did not run: tell the user to restart the session, then stop.

Run `git status --porcelain`. If it prints anything, ask the user to commit or stash first, because every step below is undone with git. Then stop.

## 2. Read the report

Run `node "<KIT>/bin/buaflow.js" upgrade --plugin --json` and read `data.result`:

| `state` | Do |
|---|---|
| `not-installed` | This is not an upgrade. Tell the user to run `/buaflow:start`, then stop. |
| `plugin-behind` | The project was installed from a newer kit than this plugin. Tell the user to run `claude plugin marketplace update buaflow` and `claude plugin update buaflow@buaflow`, then start a new session. Stop. Never write from an older kit. |
| `current` | The files are already at this kit. Tell the user, then continue at step 5 only if `manual` or `migration` lists something. |
| `upgrade` | Continue below. |

`installed.from` says how the version was found: `lock` is exact, `files` is the newest kit release any installed file matches, `signals` is a guess from which files exist. Say which one it was.

## 3. Show the user one summary, then ask once

In one message: the version found and the kit version, how many files are created and updated, every `install.conflicts` entry, every `manual` step, and what `migration` found. If `route` is `stepwise`, say that first.

- **`route: stepwise`** (older than 2.3.4): open `<KIT>/UPGRADE.md`, find the heading `## <stepwise.read>`, and do that section and each one after it up to `## v2.3.3 → v2.3.4`, reading one section at a time. Then run the report again.
- **Each conflict** is a file the team changed, or one no kit release ever shipped. Show the difference with `git diff --no-index "<KIT>/claude-setup/<name>" .claude/<name>` (control sets live in `<KIT>/standards/control-sets/`). The user chooses: keep theirs and merge the kit's change in by hand after writing, or take the kit's with `--force`.
- **A conflict whose reason says `accepted into the lock`** was accepted by an earlier `lock --write`, usually after a formatter such as Prettier rewrote the kit's files. Look at every diff. If a file differs only in formatting, taking the kit's version loses nothing. If any file holds a real change, say so, because that change would be lost.
- **`formatter`** in the report means the project runs Prettier and `.prettierignore` does not yet keep it off the kit's files. `--write` adds the lines. Tell the user why: without them, the next commit reformats the files and the lock drifts again.

## 4. Write

After the user agrees, run `node "<KIT>/bin/buaflow.js" upgrade --plugin --write`, with `--force` only if the user chose the kit's version for every conflict. It copies the files, never deletes anything, never changes `settings.json` beyond offering the plugin to teammates, and records `.buaflow/lock.json`.

## 5. Manual steps and moving to the plugin

For each entry in `manual`, open `<KIT>/UPGRADE.md` at the heading `## <read>` and read only that section. Do the steps where `required` is true with the user. Offer the optional ones.

For `migration` (a project that copied the kit into `.claude/`), do each after the user agrees:

1. `hooksInSettings`: remove Buaflow's entries from the `hooks` block in `.claude/settings.json`. With the plugin enabled, every hook would run twice.
2. `kitCopies`: delete these. They match a kit release, and the plugin now carries them.
3. `changedCopies`: kit files the team changed. Show each change and ask before deleting. A change worth keeping becomes the team's own skill or hook under another name.
4. `teamFiles`: the team's own. Never touch them.
5. `buaflowFolder`: the project's `buaflow/` folder is no longer needed.

## 6. Check and hand over

Run `node "<KIT>/bin/buaflow.js" doctor` and `node .claude/gate.js`. Tell the user what passed and what did not. Do not call the upgrade done if the gate fails because of the upgrade.

Tell the user to commit `.claude/`, `.buaflow/lock.json` and `docs/templates/`, and push. `install` never touches `.claude/stack.json`, `.claude/rules/` or `permissions` in `settings.json`: they belong to the project.

Remind them once that the plugin updates separately: `/plugin` → **Marketplaces** → `buaflow` → **Enable auto-update**, or `claude plugin marketplace update buaflow` then `claude plugin update buaflow@buaflow` in a terminal.
