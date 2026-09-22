import { prisma } from "@/lib/db";

// Prisma models carry Date fields, which are not valid Json input — round-trip through
// JSON.stringify to get a plain, JSON-safe snapshot before it hits the audit_logs.before/after columns.
function toJson(value: unknown): object | undefined {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Satisfies the internal-crud profile's audit-trail decision
// (claude-setup/tests/fixtures/profiles/internal-crud.json): who changed which task, when, and what changed.
export async function recordAudit(params: {
  taskId: string;
  userId: string;
  action: "create" | "update" | "delete";
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      taskId: params.taskId,
      userId: params.userId,
      action: params.action,
      before: toJson(params.before),
      after: toJson(params.after),
    },
  });
}
