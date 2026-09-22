#!/usr/bin/env node
// rollback control: proves prisma/migrations/20260922161307_init/rollback.sql actually reverses
// the forward migration, and that rolling forward again afterward recovers a working schema.
// Run: node --env-file=.env scripts/rehearse-migration-rollback.mjs
//
// This is destructive to whatever is in the target database — only ever point it at the local
// docker-compose Postgres, never a real one. It does not delete data silently: every step is
// logged and the full transcript is written to evidence/migration-rollback-rehearsal.json.
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rollbackSqlPath = path.join(root, "prisma/migrations/20260922161307_init/rollback.sql");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const steps = [];
function record(name, fn) {
  return async (...args) => {
    const startedAt = Date.now();
    const result = await fn(...args);
    steps.push({ name, durationMs: Date.now() - startedAt, ...result });
    console.log(`✓ ${name} (${Date.now() - startedAt}ms)`, result);
    return result;
  };
}

async function tableNames(client) {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  return rows.map((r) => r.table_name);
}

const checkBefore = record("verify schema exists before rollback", async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const tables = await tableNames(client);
  const userCount = tables.includes("users") ? (await client.query('SELECT count(*)::int FROM "users"')).rows[0].count : 0;
  await client.end();
  const expected = ["audit_logs", "tasks", "users"];
  const ok = expected.every((t) => tables.includes(t));
  if (!ok) throw new Error(`expected tables ${expected.join(", ")}, found ${tables.join(", ")}`);
  return { tables, userCount, ok };
});

const applyRollback = record("apply rollback.sql", async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const sql = readFileSync(rollbackSqlPath, "utf8");
  await client.query(sql);
  await client.end();
  return { file: path.relative(root, rollbackSqlPath) };
});

const checkAfterRollback = record("verify schema is gone after rollback", async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const tables = await tableNames(client);
  await client.end();
  const gone = !["audit_logs", "tasks", "users"].some((t) => tables.includes(t));
  if (!gone) throw new Error(`rollback left tables behind: ${tables.join(", ")}`);
  return { remainingTables: tables, ok: gone };
});

const rollForward = record("roll forward: migrate deploy + seed", async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: root, stdio: "inherit", shell: true });
  execFileSync("node", ["--env-file=.env", "prisma/seed.mjs"], { cwd: root, stdio: "inherit", shell: true });
  return { ok: true };
});

const checkAfterRollForward = record("verify schema and seed data after roll-forward", async () => {
  const client = new Client({ connectionString });
  await client.connect();
  const tables = await tableNames(client);
  const userCount = (await client.query('SELECT count(*)::int FROM "users"')).rows[0].count;
  await client.end();
  const expected = ["audit_logs", "tasks", "users"];
  const ok = expected.every((t) => tables.includes(t)) && userCount >= 2;
  if (!ok) throw new Error(`roll-forward did not restore a working schema (tables=${tables.join(",")}, users=${userCount})`);
  return { tables, userCount, ok };
});

async function main() {
  const startedAt = new Date().toISOString();
  await checkBefore();
  await applyRollback();
  await checkAfterRollback();
  await rollForward();
  await checkAfterRollForward();
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
