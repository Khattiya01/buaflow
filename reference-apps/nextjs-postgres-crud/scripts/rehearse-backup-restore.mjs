#!/usr/bin/env node
// operational readiness (EP-005): proves the backup/restore procedure in docs/runbook.md actually
// works — that a dump taken from this app's database can be destroyed and restored, and that the
// data afterwards is byte-for-byte the same data, not merely "some tables exist again".
//
// Run: docker compose up -d db && node scripts/rehearse-backup-restore.mjs
//
// This is destructive to whatever is in the target database: it drops the whole public schema
// on purpose, because a restore rehearsal that never destroys anything proves nothing. Only ever
// point it at the local docker-compose Postgres. Every step is logged and the full transcript is
// written to evidence/backup-restore-rehearsal.json.
//
// Everything runs through `docker compose exec` rather than a Postgres client library, so the
// rehearsal needs no language environment of its own — the same reason the clean-environment
// rehearsal uses Docker. Set BACKUP_REHEARSAL_CONTAINER to run against a container started by
// hand instead of by compose.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DB_USER = process.env.POSTGRES_USER ?? "app";
const DB_NAME = process.env.POSTGRES_DB ?? "app";
const CONTAINER = process.env.BACKUP_REHEARSAL_CONTAINER ?? null;
const DUMP_IN_CONTAINER = "/tmp/backup-restore-rehearsal.dump";
const EXPECTED_TABLES = ["audit_logs", "tasks", "users"];

function run(binary, args, options = {}) {
  return execFileSync(binary, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
}

// One entry point for "run this inside the database container", so switching between a
// compose-managed service and a hand-started container changes one line rather than ten.
function inDatabase(command) {
  return CONTAINER
    ? run("docker", ["exec", "-i", CONTAINER, ...command])
    : run("docker", ["compose", "exec", "-T", "db", ...command]);
}

function psql(sql) {
  return inDatabase(["psql", "-U", DB_USER, "-d", DB_NAME, "-At", "-c", sql]).trim();
}

function tableNames() {
  const out = psql("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

// A restore that recreates the schema and loses the rows would pass a "do the tables exist"
// check. Hashing the ordered contents of every table is what makes this a data test.
function fingerprint() {
  const tables = tableNames();
  const rows = {};
  const digests = {};
  for (const table of tables) {
    rows[table] = Number(psql(`SELECT count(*)::int FROM "${table}"`));
    digests[table] = psql(`SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), 'empty') FROM "${table}" t`);
  }
  const combined = createHash("sha256").update(JSON.stringify({ tables, rows, digests })).digest("hex");
  return { tables, rows, digests, combined };
}

const steps = [];
async function step(name, fn) {
  const startedAt = Date.now();
  const result = (await fn()) ?? {};
  const durationMs = Date.now() - startedAt;
  steps.push({ name, durationMs, ...result });
  console.log(`✓ ${name} (${durationMs}ms)`, result);
  return result;
}

async function main() {
  const startedAt = new Date().toISOString();
  const scratch = path.join(tmpdir(), `backup-restore-${Date.now()}`);
  mkdirSync(scratch, { recursive: true });
  const dumpOnHost = path.join(scratch, "backup.dump");

  const before = await step("fingerprint the database before backup", () => {
    const value = fingerprint();
    const missing = EXPECTED_TABLES.filter((t) => !value.tables.includes(t));
    if (missing.length) throw new Error(`the database is not migrated and seeded: missing ${missing.join(", ")}`);
    if (!value.rows.users) throw new Error("no rows in users — restore this rehearsal against a seeded database");
    return { tables: value.tables, rows: value.rows, combined: value.combined, ok: true };
  });

  const backup = await step("take a backup with pg_dump", () => {
    inDatabase(["pg_dump", "-U", DB_USER, "-d", DB_NAME, "-Fc", "-f", DUMP_IN_CONTAINER]);
    const target = CONTAINER
      ? run("docker", ["cp", `${CONTAINER}:${DUMP_IN_CONTAINER}`, dumpOnHost])
      : run("docker", ["compose", "cp", `db:${DUMP_IN_CONTAINER}`, dumpOnHost]);
    void target;
    const bytes = readFileSync(dumpOnHost);
    if (bytes.length === 0) throw new Error("pg_dump produced an empty file");
    return {
      format: "custom (pg_dump -Fc)",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ok: true,
    };
  });

  await step("destroy the database: drop the public schema", () => {
    psql("DROP SCHEMA public CASCADE");
    psql("CREATE SCHEMA public");
    return { destroyed: true };
  });

  await step("verify the data is really gone", () => {
    const remaining = tableNames();
    if (remaining.length !== 0) throw new Error(`expected an empty schema, found ${remaining.join(", ")}`);
    return { remainingTables: remaining, ok: true };
  });

  await step("restore from the backup with pg_restore", () => {
    if (CONTAINER) run("docker", ["cp", dumpOnHost, `${CONTAINER}:${DUMP_IN_CONTAINER}`]);
    else run("docker", ["compose", "cp", dumpOnHost, `db:${DUMP_IN_CONTAINER}`]);
    inDatabase(["pg_restore", "-U", DB_USER, "-d", DB_NAME, "--no-owner", DUMP_IN_CONTAINER]);
    return { from: path.basename(dumpOnHost), ok: true };
  });

  const after = await step("fingerprint the database after restore", () => {
    const value = fingerprint();
    return { tables: value.tables, rows: value.rows, combined: value.combined };
  });

  await step("compare: the restored data is the same data", () => {
    if (after.combined !== before.combined) {
      throw new Error(`fingerprint mismatch — before ${before.combined}, after ${after.combined}`);
    }
    return { fingerprint: after.combined, identical: true, ok: true };
  });

  // docs/runbook.md's Recovery section tells an operator to restore and then run the migration
  // command in case the snapshot predates the latest migration. That instruction is only safe if
  // running it against an up-to-date restore is a no-op, so the rehearsal checks that too.
  const rollForward = await step("roll forward after restore, as the runbook instructs", () => {
    // npx is a .cmd shim on Windows, and since Node 22 execFileSync refuses to run one without a
    // shell. Asking for a shell on Windows only keeps the POSIX path free of shell quoting rules.
    // The whole command goes in as one string under a shell, rather than as separate arguments,
    // because passing args alongside shell:true is deprecated: nothing escapes them.
    const windows = process.platform === "win32";
    const output = windows
      ? run("npx prisma migrate deploy", [], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "" },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      })
      : run("npx", ["prisma", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    const noPending = /No pending migrations|already been applied/i.test(output);
    const value = fingerprint();
    if (value.combined !== before.combined) {
      throw new Error("rolling forward after a restore changed the data, so the runbook's recovery instruction is not safe");
    }
    return { noPendingMigrations: noPending, dataUnchanged: true, ok: true };
  });

  rmSync(scratch, { recursive: true, force: true });

  const finishedAt = new Date().toISOString();
  const evidence = {
    _: "EP-005 · backup/restore rehearsal · produced by scripts/rehearse-backup-restore.mjs against the local docker-compose Postgres · the public schema really is dropped between the backup and the restore",
    startedAt,
    finishedAt,
    totalDurationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    procedure: {
      backup: "pg_dump -Fc inside the database container",
      restore: "pg_restore --no-owner inside the database container",
      documentedIn: "docs/runbook.md",
    },
    backupArtifact: { bytes: backup.bytes, sha256: backup.sha256 },
    fingerprint: { before: before.combined, after: after.combined, identical: before.combined === after.combined },
    rollForwardAfterRestore: rollForward.ok === true,
    steps,
    ok: steps.every((s) => s.ok !== false),
  };

  mkdirSync(path.join(root, "evidence"), { recursive: true });
  writeFileSync(path.join(root, "evidence", "backup-restore-rehearsal.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`\nwrote evidence/backup-restore-rehearsal.json (${evidence.totalDurationMs}ms)`);
}

main().catch((error) => {
  console.error(`\n✗ backup/restore rehearsal failed: ${error.message}`);
  process.exit(1);
});
