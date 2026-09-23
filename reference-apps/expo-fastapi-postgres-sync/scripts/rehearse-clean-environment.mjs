#!/usr/bin/env node
// clean-environment control: build the production image from scratch (--no-cache), start it
// against a freshly created (no prior volume) Postgres, apply migrations, seed, and prove
// the primary flow (login + sync pull) works — all from a torn-down starting state, none of
// it reusing a warm cache or an already-running app process. Same pattern as
// reference-apps/react-fastapi-postgres-crud/scripts/rehearse-clean-environment.mjs.
// Run: node scripts/rehearse-clean-environment.mjs
//
// Note: this proves "from-scratch build + boot" against the current working tree. It does
// not prove a fresh `git clone` — that additionally requires the tree to be committed and
// pushed, which this script does not do. See evidence/clean-environment-rehearsal.json's
// `scope` field.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const IMAGE = "expo-fastapi-postgres-sync:rehearsal";
const CONTAINER = "expo-fastapi-postgres-sync-rehearsal";
const PORT = 8299;
const NETWORK = "expo-fastapi-postgres-sync_default";

const steps = [];
function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${res.status}): ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

async function step(name, fn) {
  const startedAt = Date.now();
  const result = (await fn()) ?? {};
  const durationMs = Date.now() - startedAt;
  steps.push({ name, durationMs, ...result });
  console.log(`✓ ${name} (${durationMs}ms)`);
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      // not ready yet
    }
    await delay(300);
  }
  throw new Error(`${url} did not become healthy within ${timeoutMs}ms`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const overallStart = Date.now();

  await step("tear down any existing compose stack (including volumes)", () => {
    spawnSync("docker", ["compose", "down", "-v"], { cwd: root });
  });

  await step("start a brand-new Postgres (no prior data)", () => {
    sh("docker", ["compose", "up", "-d"]);
  });

  await step("wait for Postgres to accept connections", async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const res = spawnSync("docker", ["compose", "exec", "-T", "db", "pg_isready", "-U", "app", "-d", "app"], { cwd: root });
      if (res.status === 0) return;
      await delay(1000);
    }
    throw new Error("Postgres did not become ready");
  });

  await step("apply migrations to the fresh database", () => {
    execFileSync("python", ["-m", "alembic", "upgrade", "head"], { cwd: backend, stdio: "inherit" });
  });

  await step("seed the fresh database", () => {
    execFileSync("python", ["scripts/seed.py"], { cwd: backend, stdio: "inherit" });
  });

  await step("build the production image with --no-cache", () => {
    sh("docker", ["build", "--no-cache", "-t", IMAGE, "."]);
  });

  await step("remove any leftover rehearsal container", () => {
    spawnSync("docker", ["rm", "-f", CONTAINER], { cwd: root });
  });

  await step("run the freshly built image against the fresh database", () => {
    const secret = "rehearsal-only-secret-0123456789abcdef0123456789abcdef";
    sh("docker", [
      "run",
      "-d",
      "--name",
      CONTAINER,
      "--network",
      NETWORK,
      "-e",
      "DATABASE_URL=postgresql+psycopg://app:app@db:5432/app",
      "-e",
      `SESSION_SECRET=${secret}`,
      "-p",
      `${PORT}:8000`,
      IMAGE,
    ]);
  });

  let health;
  await step("wait for /api/health", async () => {
    health = await waitFor(`http://localhost:${PORT}/api/health`, 20_000);
  });

  await step("smoke test: log in as the seeded admin and pull tasks via the sync API", async () => {
    const loginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "admin-dev-password" }),
    });
    if (!loginRes.ok) throw new Error(`login smoke test failed: ${loginRes.status}`);
    const { token } = await loginRes.json();
    const pullRes = await fetch(`http://localhost:${PORT}/api/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!pullRes.ok) throw new Error(`sync pull smoke test failed: ${pullRes.status}`);
    const { tasks } = await pullRes.json();
    return { taskCount: tasks.length };
  });

  await step("smoke test: the served web export responds", async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    if (!res.ok) throw new Error(`web export smoke test failed: ${res.status}`);
    return { ok: true };
  });

  await step("tear down the rehearsal container (compose db is left running)", () => {
    spawnSync("docker", ["rm", "-f", CONTAINER], { cwd: root });
  });

  const finishedAt = new Date().toISOString();
  const report = {
    scope: "from-scratch docker build + boot against a freshly created database; not a fresh git clone",
    startedAt,
    finishedAt,
    totalDurationMs: Date.now() - overallStart,
    healthCheck: health,
    steps,
    ok: true,
  };
  mkdirSync(path.join(root, "evidence"), { recursive: true });
  writeFileSync(path.join(root, "evidence/clean-environment-rehearsal.json"), JSON.stringify(report, null, 2));
  console.log(`\n✓ clean-environment rehearsal complete in ${report.totalDurationMs}ms — evidence/clean-environment-rehearsal.json`);
}

main().catch((error) => {
  console.error("✗ clean-environment rehearsal failed:", error);
  spawnSync("docker", ["rm", "-f", CONTAINER], { cwd: root });
  process.exitCode = 1;
});
