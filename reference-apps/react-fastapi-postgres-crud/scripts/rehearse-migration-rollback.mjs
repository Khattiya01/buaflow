#!/usr/bin/env node
// rollback control: proves alembic's downgrade() actually reverses the forward migration,
// and that rolling forward again afterward recovers a working schema. Unlike PP-003 (Prisma
// is forward-only, so that app hand-writes a companion rollback.sql), Alembic supports a real
// downgrade natively — this rehearsal exercises that real downgrade path, not a hand-rolled one.
// Run: node scripts/rehearse-migration-rollback.mjs
//
// This is destructive to whatever is in the target database — only ever point it at the local
// docker-compose Postgres, never a real one. Every step is logged and the full transcript is
// written to evidence/migration-rollback-rehearsal.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const EXPECTED_TABLES = ["audit_logs", "tasks", "users"];

const steps = [];
async function step(name, fn) {
  const startedAt = Date.now();
  const result = (await fn()) ?? {};
  const durationMs = Date.now() - startedAt;
  steps.push({ name, durationMs, ...result });
  console.log(`✓ ${name} (${durationMs}ms)`, result);
  return result;
}

function dbStatus() {
  const output = execFileSync("python", ["scripts/db_status.py"], { cwd: backend, encoding: "utf8" });
  return JSON.parse(output);
}

async function main() {
  const startedAt = new Date().toISOString();

  await step("verify schema exists before rollback", () => {
    const { tables, userCount } = dbStatus();
    const ok = EXPECTED_TABLES.every((t) => tables.includes(t));
    if (!ok) throw new Error(`expected tables ${EXPECTED_TABLES.join(", ")}, found ${tables.join(", ")}`);
    return { tables, userCount, ok };
  });

  await step("apply alembic downgrade base", () => {
    execFileSync("python", ["-m", "alembic", "downgrade", "base"], { cwd: backend, stdio: "inherit" });
    return { ok: true };
  });

  await step("verify schema is gone after rollback", () => {
    const { tables } = dbStatus();
    const gone = !EXPECTED_TABLES.some((t) => tables.includes(t));
    if (!gone) throw new Error(`rollback left tables behind: ${tables.join(", ")}`);
    return { remainingTables: tables, ok: gone };
  });

  await step("roll forward: alembic upgrade head + seed", () => {
    execFileSync("python", ["-m", "alembic", "upgrade", "head"], { cwd: backend, stdio: "inherit" });
    execFileSync("python", ["scripts/seed.py"], { cwd: backend, stdio: "inherit" });
    return { ok: true };
  });

  await step("verify schema and seed data after roll-forward", () => {
    const { tables, userCount } = dbStatus();
    const ok = EXPECTED_TABLES.every((t) => tables.includes(t)) && userCount >= 2;
    if (!ok) throw new Error(`roll-forward did not restore a working schema (tables=${tables.join(",")}, users=${userCount})`);
    return { tables, userCount, ok };
  });

  const finishedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt,
    totalDurationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
    steps,
    ok: steps.every((s) => s.ok !== false),
  };
  mkdirSync(path.join(root, "evidence"), { recursive: true });
  writeFileSync(path.join(root, "evidence/migration-rollback-rehearsal.json"), JSON.stringify(report, null, 2));
  console.log(`\n✓ migration/rollback rehearsal complete in ${report.totalDurationMs}ms — evidence/migration-rollback-rehearsal.json`);
}

main().catch((error) => {
  console.error("✗ rehearsal failed:", error);
  process.exitCode = 1;
});
