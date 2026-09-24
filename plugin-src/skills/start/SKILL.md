---
name: start
description: Start, resume or upgrade Buaflow in this project from the plugin — a new project, an existing codebase, or one that already has Buaflow installed. Use when the user asks to start Buaflow, set it up, or continue it.
disable-model-invocation: true
---

# /buaflow:start

The whole Buaflow kit ships inside this plugin. There is no `buaflow/` folder to clone.

Reply to the user in Thai. Write every artifact under `docs/` in Thai.

## 1. Find the kit

The session context has a line `Buaflow kit <version> (from the buaflow plugin) is at: <KIT>`. Use that `<KIT>` path everywhere below.

- Wherever a Buaflow document says `buaflow/<path>`, read `<KIT>/<path>`.
- Run the CLI as `node "<KIT>/bin/buaflow.js" <command>`.

If that line is missing, the plugin's SessionStart hook did not run. Tell the user to restart the session, or to check that buaflow is enabled with `/plugin` or, in the VS Code extension where `/plugin` is unavailable, `claude plugin list` in a terminal. Then stop.

## 2. Read the project's state

Run `doctor` and read what exists before asking anything:

- `.claude/gate.js`, `.claude/skills/`, `.claude/commands/` or `.buaflow/lock.json`: Buaflow is installed.
- `docs/planning/_state.md`: a lifecycle is in progress.
- Source code but none of the above: an existing codebase that has not adopted Buaflow.

An installed project with no `.buaflow/lock.json` was installed by a kit older than 3.11, which had no lock. Treat it as an older version, never as current. Find its version from the signal table in `<KIT>/START-HERE.md` section 2.1.

## 3. Take exactly one path

| State | Do |
|---|---|
| Installed, and either no lock or a lock older than the plugin kit | Upgrade. Tell the user which version you found. Follow `<KIT>/UPGRADE.md`: first the sections that bring a version older than 2.3.4 up to 2.3.4, then the "fast path". Run `install --plugin` as a dry run and show the user the result, especially any `conflict`. Run it with `--write` only after the user agrees. Then move the project to the plugin, as in the next paragraph. |
| Installed, with a lock equal to the plugin kit | Resume. Run `resume`, read `docs/planning/_state.md`, and continue from where it stopped. |

Moving a project that copied the kit into `.claude/` over to the plugin takes three steps. Do each one only after the user agrees, then tell them to commit and push:

1. Remove Buaflow's entries from the `hooks` block in `.claude/settings.json`. `install` and `doctor` name them.
2. Delete `.claude/skills/`, `.claude/agents/` and `.claude/hooks/` only where the files came from the kit. Keep any skill, agent or hook the team wrote.
3. The project's `buaflow/` folder is no longer needed.
| Not installed | Read `<KIT>/START-HERE.md` and do Phase 0 exactly as it says. For an existing codebase, also run `assess` and give the user its result with the Phase 0 questions. |

Every rule in START-HERE.md applies unchanged. In particular: one phase at a time, stop at the end of each phase, and never guess.

## 4. Usage capture: ask once per project, on internal machines only

This applies on every path above: new, resume and upgrade. Run `usage status --json` and read `data.store` and `data.consent`.

| `data.store` | `data.consent` | Do |
|---|---|---|
| `null` | anything | Say nothing. This machine has no central store, so it is not an internal Buaflow machine. |
| set | `unset` | Ask once, as below. |
| set | `enabled` or `disabled` | Do not ask. The project has already answered. |
| set | `invalid` | Do not ask. Tell the user that `.buaflow/usage.json` cannot be read, so nothing is recorded, and show the reason from `data.errors`. |

The question, in Thai, covers:

- what is recorded: the full intent, plan and task documents, status changes, `/check` results, the model and the kit version;
- where it goes: `.buaflow/usage/` in the project, which git ignores, and then the private store repository set on this machine;
- that the answer applies to everyone who works on this project, and can be switched off later in `.buaflow/usage.json`.

Then run `usage consent --enable` or `usage consent --disable` as the user answered, and tell them to commit `.buaflow/usage.json`. If it reports `not a git repository`, tell the user it will be asked again at the next `/buaflow:start` once the project is in git. Never answer for the user, and never ask again once there is an answer.

## 5. Installing the project-side controls (Phase 6 gate, Phase 7 handoff)

The plugin already gives this session the skills, agents and hooks. It cannot carry these, so they must live in the project:

- the gate and every checker, because pre-push and CI run them outside any session;
- permissions;
- rules and `stack.json`, because they are fitted to this project.

When Phase 6 or Phase 7 says to copy files from `buaflow/claude-setup/`, do not copy them by hand. Run:

1. `install --plugin` (a dry run). Show the user what it will create.
2. `install --plugin --write`. This copies the gate and checkers into `.claude/`, and seeds `stack.json`, rules, `settings.json` and `docs/templates/` only where none exist. It adds `extraKnownMarketplaces` and `enabledPlugins` so teammates who open the project are offered this plugin. It records `.buaflow/lock.json`.

Then do the project-specific parts of Phase 7 from `<KIT>/phases/07-handoff.md`:

- fit the rules' `paths:` and `stack.json` to the real project;
- write `AGENTS.md`, `CLAUDE.md`, `REVIEW.md` and the constitution;
- set up the pre-push hook and CI.

Do not copy `skills/`, `agents/` or `hooks/` into `.claude/`, and do not add a `hooks` block to `settings.json`. The plugin provides them, and a second copy makes every hook run twice.

## 6. Phase 7 is not done until the project can enforce without the plugin

Before reporting Phase 7 complete, all of these must hold:

- `doctor` shows the core controls installed and a kit lock.
- `node .claude/check-config.js` passes. Run it with `BUAFLOW_HOOKS_DIR="<KIT>/claude-setup/hooks"` so the hooks are tested against this project's `stack.json`.
- `node .claude/gate.js` runs.

Tell the user one thing plainly: each teammate installs the plugin once: `/plugin install buaflow@buaflow` in the terminal app, or `claude plugin install buaflow@buaflow` in a terminal when using the VS Code extension. The marketplace is added for them automatically, but the plugin is not installed automatically. The gate protects `main` either way.
