---
paths:
  - "**/components/**/*.{tsx,jsx}"
  - "**/app/**/*.{tsx,jsx}"
  - "**/pages/**/*.{tsx,jsx}"
---

# UI rules (auto-loaded when touching component files)

## Before creating a new component — ask in this order, never skip

1. Already in `components/shared/`? → **add a prop/variant to the existing one; never copy it into a version 2**
2. In the shadcn/ui registry? → **install from the registry; never hand-write it**
3. Composable from existing primitives?
4. Is there a design (image / HTML / legacy project)?
5. None of the above → **stop and ask the user before designing your own**

## Forbidden

| Never | Instead |
|---|---|
| Hardcoded strings | i18n keys, complete for th + en |
| Raw hex / `bg-blue-600` | tokens: `bg-primary`, `text-muted-foreground` |
| `style={{...}}` with constants | Tailwind classes bound to tokens |
| Installing a new UI library | use the one locked in constitution art. 9 (default: shadcn/ui + Radix) — adding another needs an intent + ADR first |
| Editing registry/generator output (`components/ui/**`) | a hook blocks it per `.claude/protected-paths.json` — reinstall via CLI or wrap it in `shared/` |
| One feature importing another feature's component | promote to `components/shared/` |

## While writing

- Server Component by default; put the client directive at the smallest boundary
- Variants use `cva`, not `if` chains on className
- Always accept `className` and merge with `cn()`
- **No data fetching inside shared components** — receive via props
- Cover every relevant state: loading / empty / error / disabled / unauthorized

## Shared or not — decide every time and record it

- Used in ≥ 2 places, or a pattern that repeats → `components/shared/` from the start
- Not yet clear how it would be reused → **don't promote yet**; premature abstraction is worse than duplicating twice
- Record the decision in `docs/design/components.md` **every time**

## DoD: Frontend (this is the DoD for this work type — `/check` reports **only failing items**)

In addition to the core DoD in `docs/standards/definition-of-done.md`:
- [ ] Answered the 5 component questions above before building, and recorded shared/not-shared in `docs/design/components.md`
- [ ] No hardcoded strings — i18n complete for th + en (including placeholders, aria-labels, errors, toasts, empty states)
- [ ] No raw colors/sizes · UI library per constitution art. 9
- [ ] All states covered: loading / empty / error / unauthorized / success
- [ ] Actually tested at ~390px, light + dark, and switching th/en does not break the layout
- [ ] a11y: labels complete, Tab order works, focus visible, contrast passes
- [ ] `T-xxx-test` task created (blocked until the UI is done — `docs-lint --release` refuses to release while it is open)

**DoD for the `-test` task:** test user-visible behavior, not implementation · cover render / main interaction / error / empty · accessible queries (`getByRole`) · passes in both languages · coverage at target

Full detail: `docs/standards/ui-component-rules.md`
