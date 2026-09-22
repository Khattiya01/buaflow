// Dev/test-only seed data. Passwords below are intentionally public defaults for a local
// database that only ever exists inside docker-compose.yml — never reuse them anywhere real.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set — run with `node --env-file=.env prisma/seed.mjs`");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Duplicated from lib/auth.ts on purpose: this script runs as plain Node ESM (no Next.js/TS
// build step involved), so it can't import the app's TypeScript module directly.
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      passwordHash: await hashPassword("admin-dev-password"),
    },
  });

  const member = await prisma.user.upsert({
    where: { email: "member@example.com" },
    update: {},
    create: {
      email: "member@example.com",
      name: "Member",
      role: "member",
      passwordHash: await hashPassword("member-dev-password"),
    },
  });

  await prisma.task.upsert({
    where: { id: "seed-task-1" },
    update: {},
    create: {
      id: "seed-task-1",
      title: "Write the runbook",
      status: "todo",
      ownerId: member.id,
    },
  });

  console.log(`Seeded: admin=${admin.email} member=${member.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
