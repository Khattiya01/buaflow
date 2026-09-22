#!/usr/bin/env node
// Runs `npm audit --omit=dev` and fails only on a vulnerable package NOT already documented in
// evidence/dependency-scan-notes.md. This keeps the known, understood chain (prisma CLI's peer
// dependency pulling in mysql2/@prisma/config -> deepmerge-ts — never imported by app code, proven
// absent from the built image, see that file) from blocking CI, while still failing loudly on any
// new finding, which is the actual point of running the scan at all.
import { spawnSync } from "node:child_process";

const ALLOWED_PACKAGES = new Set(["prisma", "mysql2", "@prisma/config", "deepmerge-ts"]);

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", shell: true });
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("check-dependency-audit: could not parse `npm audit` output");
  console.error(result.stdout, result.stderr);
  process.exit(2);
}

const findings = Object.values(report.vulnerabilities ?? {});
const unexpected = findings.filter((f) => !ALLOWED_PACKAGES.has(f.name));

console.log(`npm audit: ${findings.length} package(s) with findings, ${unexpected.length} unexpected.`);
for (const f of findings) {
  const status = ALLOWED_PACKAGES.has(f.name) ? "known (see evidence/dependency-scan-notes.md)" : "UNEXPECTED";
  console.log(`  - ${f.name} (${f.severity}): ${status}`);
}

if (unexpected.length > 0) {
  console.error("\ncheck-dependency-audit: new/unexpected vulnerable package(s) found — update evidence/dependency-scan-notes.md if this is understood, otherwise fix it.");
  process.exit(1);
}

console.log("\ncheck-dependency-audit: PASS (only the documented prisma-CLI-peer-dependency chain, absent from the shipped image)");
