# Dependency scan (dependency-scan control)

Command: `npm audit --omit=dev --json` → [`npm-audit.json`](./npm-audit.json)

Result: 4 high-severity findings, all on the same chain:

```
prisma (peerDependency of @prisma/client) → @prisma/config → deepmerge-ts (stack exhaustion)
prisma (peerDependency of @prisma/client) → mysql2 (auth downgrade / decompression-bomb DoS)
```

## Why these do not affect the shipped artifact

`@prisma/client`'s `package.json` declares `prisma` as a **peerDependency** (`"prisma": "*"`), which
npm resolves into the tree for every install — including `--omit=dev` — even though application code
never imports the `prisma` CLI package, and `mysql2`/`deepmerge-ts` are the CLI's own tooling for a
MySQL/multi-datasource connector this project never uses (only PostgreSQL, via `@prisma/adapter-pg`).

This was verified empirically, not assumed: the production image (`Dockerfile`, `output: "standalone"`
in `next.config.ts`) only copies files Next.js's build tracer determines are actually `require()`d at
runtime, plus an explicit copy of the generated Prisma client. After building the image:

```
$ docker run --rm --entrypoint sh nextjs-postgres-crud:test \
    -c "find /app/node_modules -maxdepth 2 -iname 'mysql2' -o -maxdepth 1 -iname 'prisma'"
(no output — neither package is present in the runtime image)
```

## What would change this assessment

- If the app ever imports anything from the `prisma` CLI package directly (it shouldn't need to), or
  adds a MySQL datasource, re-run this check — the exclusion argument above would no longer hold.
- `npm audit fix --force` would downgrade `prisma` to `6.19.3`, a breaking change; not applied here
  since the packages it "fixes" are already unreachable at runtime.
- Re-run before every deploy: `npm audit --omit=dev` (do **not** rely on `npm audit` alone, which
  includes devDependencies and will always show this chain).
