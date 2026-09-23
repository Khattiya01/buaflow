---
description: Database & migration rules — auto-loaded when touching schema or migrations
triggerPaths: ["**/prisma/**", "**/migrations/**", "**/*.sql", "**/schema.prisma"]
---

# Database & migration rules (auto-loaded when touching schema or migrations)

## Before changing the schema — stop and answer three things

1. **Can it be rolled back?** If not, redesign.
2. **What happens to existing data?** Any rows where the new value cannot be null? Backfill needed?
3. **Who uses this field?** Search the whole project first; don't guess.

## Destructive changes always use expand / contract

Dropping a column, changing a type, renaming = destructive. **Never in one release.**

```
Release 1 (expand)   add the new thing, keep the old, write to both → ship → confirm it works
Release 2 (contract) move reads to the new thing → ship
Release 3            drop the old thing → ship
```

## DoD: DB / Migration (this is the DoD for this work type — `/check` reports **only failing items**)

Schema changes must first be written in the feature's `design.md` as a **diff against the current `schema.prisma`** — the schema is the single source of truth for the data model. Never create an entity that duplicates an existing one under a new name.

Every migration must have:

- [ ] Actually run on a copy of the DB (not just "generate passed")
- [ ] **A written rollback plan**: what to do if it fails, how many minutes
- [ ] `seed.ts` updated if the structure changed
- [ ] Indexes for fields that will be queried or joined
- [ ] The feature's `design.md` states what this migration does

## Never

- Edit a migration that has already run on any environment → create a new migration
- Run a migration on prd without a backup first
- Put real data or secrets in seeds or migrations

## Before release

If this migration cannot be rolled back, **tell the user plainly before release** that once shipped there is no way back
and rollback will require restoring from backup.
