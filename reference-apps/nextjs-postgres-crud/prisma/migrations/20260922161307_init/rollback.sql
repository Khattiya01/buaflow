-- Rollback for 20260922161307_init.
-- Prisma Migrate is forward-only by design; this hand-written companion file is what gets
-- rehearsed and, if ever needed for real, applied by an operator (see docs/runbook.md "Rollback").
-- Order matters: drop dependents (foreign keys) before the tables/types they reference.

DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "tasks";
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "TaskStatus";
DROP TYPE IF EXISTS "Role";
DROP TABLE IF EXISTS "_prisma_migrations";
