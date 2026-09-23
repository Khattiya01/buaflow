---
description: Start building a UI component or screen by asking first, never designing on your own. Offers text or canvas (claude.ai/design) when no design exists, then builds to match the design exactly. Use every time before creating a component or screen.
argumentHint: <component or screen name>
claudeAllowedTools: ["Read","Glob","Grep","Bash(pnpm dev*)","Bash(pnpm exec playwright*)","Bash(node .claude/pixel.js*)","Bash(git diff*)","Bash(git log*)"]
---

Building UI: {{ARGUMENTS}}

Talk to the user in Thai.

## No code until these four are answered

### 1. Does something existing work?
- Search `components/shared/` and `components/ui/` for anything close
- Check the registry in `docs/design/components.md`
- **Report what you found**, e.g. "found DataTable in shared that should cover this"
- Existing one is almost enough → **add a prop/variant to it; never copy into a version 2**

### 2. Is it in shadcn?
- Check the shadcn/ui registry
- Yes → **install from the registry; never hand-write it**
- Composable from existing primitives → say what you will compose it from

### 3. Is there a design?
- Look in `docs/design/` — a confirmed canvas baseline `docs/design/canvas/<screen-name>.dc.html`, an image/HTML the user attached during planning
- Rebuild mode → look at the legacy project **and ask whether to keep it as-is or what to change**
- Found one → skip to **Build**. The design is the source of truth for the look; do not "improve" it silently.

### 4. None of the above — stop and ask the user

> `<component>` is not in shared or shadcn, and I see no design.
> - Do you have a reference to send?
> - Or should I design it — **as text (2 options to pick from) or on a canvas (claude.ai/design)?**

**Never design on your own without permission.** Both paths below still end in the user choosing — the format changes, the asking does not.

Default to suggest: a single component composed from shadcn → **text** is enough · a full page or a multi-page flow → **canvas**, because it is confirmed as a real picture, not a description. A canvas round costs the user time on the web, so do not push it for small parts.

#### Path: text
Propose 2 options as ordered sections / shadcn primitives + tokens. No hex, no hand-drawn styling. User picks → **Build**.

#### Path: canvas
Preconditions — check in this order, stop at the first one that fails and say so:
1. **Project brief exists** — `docs/design/brief.md` part 1 confirmed (`status: confirmed`). Missing → fill it from `docs/templates/design-brief.tpl.md` with the user first (one time per project). Without it the canvas guesses colors, fonts, icons and states, and the code can never match it exactly.
2. **Design access works** — claude.ai login with design scope (`/design-login` if not). Lost access → say so and fall back to **text** for this task; do not guess from an old canvas.
3. **Storybook is not stale** — compare `last_storybook_sync` in the brief with `git log -1 -- components/` on HEAD. Components changed since the last push → run `/design-sync` first. The canvas composes from the storybook; a stale storybook designs from old parts.

Then:
4. **Task brief** — ask part 2 of the brief for this job (scope · theme · viewports · states · content · deviation policy). Theme answer decides the route:
   - *use existing* → attach the project's Design System project; the canvas may only use tokens and components that exist there
   - *existing but tweak X* → that is a **token-level change** hitting every page: confirm, edit `docs/design/theme.md` + `globals.css` once, push storybook, **then** open the canvas
   - *redesign* with ≥ 1 built page → not a `/ui` job; it needs an intent + ADR (constitution art. 9). Stop here and say so.
5. **Read the real theme first** — `docs/design/theme.md`, `globals.css`, `docs/design/components.md`, so the canvas is opened with the actual tokens and component names, not a summary.
6. **Open the canvas** with the `design` skill, attaching the Design System project from the brief. Artboards: every viewport from the brief × every state the brief asked for. One canvas session may cover several screens plus theme/global components in the same link — that's normal and expected; multi-screen design is fine here. Send the URL to the user (or their UX/UI) to edit on the web and confirm.
7. **Read the confirmed version back and split it per screen now, before any Build starts**: save each screen's artboard HTML to its own `docs/design/canvas/<screen-name>.dc.html`, commit each as its baseline, record the canvas URL + version in the brief and `_state.md`. **One combined canvas link is never a build reference by itself** — until each screen has its own `.dc.html`, there is no per-page source of truth to match code against, and asking to "code it to match the design" off the raw link produces exactly the kind of drift this step exists to prevent. → **Build**.

**Canvas is a mockup, not source code** — never copy its markup or styles. It answers "what it looks like"; data, auth and validation come from the spec.

**One screen at a time, always** — even with N confirmed baselines ready, never take an instruction to "code it to match the design" for multiple pages as one batch. Build against one `.dc.html`, run pixel diff on it, close it out, only then move to the next screen's baseline. Tokens are locked and shadcn primitives installed (**Is it in shadcn?**, above) before the first page's Build even starts; "scaffold loosely now, reconcile UI to the design later" is not this loop — the pixel-diff check exists precisely so drift is caught immediately, not accumulated across pages and untangled afterward.

---

## Build

### Before writing — answer the shared question
"Could this component be reused elsewhere?"
- Used in ≥ 2 places, or a pattern seen repeatedly → **create it in `components/shared/` from the start**
- Truly bound to one page → `components/<feature>/`
- Not yet clear how it would be reused → **don't promote yet**; premature abstraction is worse than duplicating twice
- **Always record the decision in `docs/design/components.md`** — the `guard-new-component` hook blocks the write otherwise, canvas-derived components included

### While writing
- Server Component by default; client directive at the smallest boundary
- Every string through i18n, complete for th + en (including placeholders, aria-labels, errors, empty states)
- Theme tokens only; no raw colors. A canvas color with no token → **stop and ask**: add the token (theme-level, affects everything) or fix the canvas. Never inline the hex to "make it match".
- `cva` for variants; accept `className` and merge with `cn()`
- Cover: loading / empty / error / disabled

### After writing — prove it against the design, not checkboxes

**With a canvas baseline — match it exactly:**
1. Make sure the page has an entry in `docs/design/pixel.json` (from `docs/templates/pixel.tpl.json`: route → every artboard from the brief, incl. `:dark`). Use the `run` skill to start the app.
2. Run `node .claude/pixel.js --page <name>` (`--check` first if it is the first run). It screenshots the page and the baseline `.dc.html` the same way at each artboard's viewport, diffs them, and prints **% differing, size mismatch, and the y/x regions that differ**. Do not write your own screenshot or diff code.
3. Fix from the numbers and regions; **open the diff image (path printed under FAIL) only when a region does not explain itself** — images cost context. Repeat until the run passes. "Looks the same" is not a result; a diff you cannot explain is a bug in the code, not in the canvas. Never loosen `maxDiffPercent` to get a pass — a difference the user approved is a deviation (step 4).
4. A change the user approves during build (they say "keep it like this instead") is a **deviation**: record it in `docs/design/components.md` (`deviation` column, with why) **and update the canvas to match the code**, then commit the new `.dc.html` as the baseline. Canvas and code must be equal when the task closes — one source of truth, otherwise the next drift sync (Phase 8.8) reads your deviation as a canvas change and reverts it.
5. Push the component's preview HTML (first line `<!-- @dsCard group="..." -->`) with `/design-sync` so the storybook matches the code; update `last_storybook_sync` in the brief.
6. `prototype_url` set in the brief → run `/prototype` and republish to the same URL. The baseline changed; the prototype the team is looking at must follow.

**With an image / legacy reference:** same loop with screenshots side by side — list differences, fix until they match. Do not assume it matches.

**Always:**
- [ ] Tested at ~390px and 1280px (and every other viewport in the brief)
- [ ] Tested light and dark
- [ ] Switched th/en and the layout holds (text lengths differ)
- [ ] a11y: labels complete, Tab order works, focus visible
- [ ] Updated `docs/design/components.md` (incl. deviation column if any)
- [ ] Created the `T-xxx-test` task for unit tests (blocked for now)
