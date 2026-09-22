// Prisma 7 config: connection info for the CLI (migrate/generate) lives here, not in schema.prisma.
// The running app gets its own connection via the driver adapter in lib/db.ts, not this file.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
