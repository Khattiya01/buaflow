import { execFileSync } from "node:child_process";
import path from "node:path";

const BACKEND = path.join(process.cwd(), "..", "..", "backend");

// Deterministic starting data for e2e runs — same seed the integration suite uses
// (admin@example.com / member@example.com, see backend/scripts/seed.py), reset through
// the real migration chain (alembic downgrade base -> upgrade head) so this also exercises
// the same downgrade path the migration-rollback rehearsal proves.
export default async function globalSetup() {
  execFileSync("python", ["-m", "alembic", "downgrade", "base"], { cwd: BACKEND, stdio: "inherit" });
  execFileSync("python", ["-m", "alembic", "upgrade", "head"], { cwd: BACKEND, stdio: "inherit" });
  execFileSync("python", ["scripts/seed.py"], { cwd: BACKEND, stdio: "inherit" });
}
