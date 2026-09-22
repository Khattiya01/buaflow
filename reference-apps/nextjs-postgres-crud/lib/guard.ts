import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth";
import { log } from "@/lib/log";

// access-control guard: every API route that touches a task calls this first.
// Ownership/role checks live here so app/api routes stay declarative — see
// claude-setup/tests/fixtures/profiles/internal-crud.json ("access-control": required).
export async function requireSession(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  return { session };
}

export function canAccessTask(session: SessionPayload, task: { ownerId: string }): boolean {
  return session.role === "admin" || task.ownerId === session.sub;
}

export function forbidden(session: SessionPayload, taskId: string): NextResponse {
  // A 403 on an authenticated request is a real ownership-boundary event worth an audit trail of
  // its own, distinct from the per-record AuditLog table (lib/audit.ts) which only records changes
  // that were actually allowed to happen.
  log.warn("access.forbidden", { userId: session.sub, role: session.role, taskId });
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
