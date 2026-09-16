---
name: ui
description: Start building a UI component by asking first, never designing on your own. Use every time before creating a component or screen.
argument-hint: "<component or screen name>"
allowed-tools: Read Glob Grep Bash(pnpm dev*) Bash(pnpm exec playwright*)
---

Building UI: $ARGUMENTS

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
- Look in `docs/design/` and any design the user attached during planning
- Rebuild mode → look at the legacy project **and ask whether to keep it as-is or what to change**

### 4. None of the above — stop and ask the user

> `<component>` is not in shared or shadcn, and I see no design.
> - Should I design it? (I will propose 2 options before building)
> - Or do you have a reference to send?

**Never design on your own without permission.**

---

## Once everything is answered

### Before writing — answer the shared question
"Could this component be reused elsewhere?"
- Used in ≥ 2 places, or a pattern seen repeatedly → **create it in `components/shared/` from the start**
- Truly bound to one page → `components/<feature>/`
- Not yet clear how it would be reused → **don't promote yet**; premature abstraction is worse than duplicating twice
- **Always record the decision in `docs/design/components.md`**

### While writing
- Server Component by default; client directive at the smallest boundary
- Every string through i18n, complete for th + en (including placeholders, aria-labels, errors, empty states)
- Theme tokens only; no raw colors
- `cva` for variants; accept `className` and merge with `cn()`
- Cover: loading / empty / error / disabled

### After writing — prove it with the real thing, not checkboxes
- [ ] Tested at ~390px and 1280px
- [ ] Tested light and dark
- [ ] Switched th/en and the layout holds (text lengths differ)
- [ ] a11y: labels complete, Tab order works, focus visible
- [ ] Updated `docs/design/components.md`
- [ ] Created the `T-xxx-test` task for unit tests (blocked for now)

> If there is a design/reference to compare against: use the `run` skill to open the app and take screenshots (or Playwright), compare with the reference,
> **list the differences one by one and fix until they match**. Do not assume it matches.
