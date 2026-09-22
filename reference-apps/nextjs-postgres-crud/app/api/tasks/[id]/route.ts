import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, canAccessTask, forbidden } from "@/lib/guard";
import { recordAudit } from "@/lib/audit";
import { TaskStatus } from "@prisma/client";

const STATUSES = new Set(Object.values(TaskStatus));

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnTask(id: string) {
  return prisma.task.findFirst({ where: { id, deletedAt: null } });
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

  const task = await loadOwnTask(id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canAccessTask(auth.session, task)) return forbidden(auth.session, id);

  return NextResponse.json(task);
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await context.params;

  const task = await loadOwnTask(id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canAccessTask(session, task)) return forbidden(session, id);

  let body: { title?: unknown; description?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const data: { title?: string; description?: string | null; status?: TaskStatus } = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.description === "string" || body.description === null) data.description = body.description ?? null;
  if (typeof body.status === "string" && STATUSES.has(body.status as TaskStatus)) data.status = body.status as TaskStatus;

  const updated = await prisma.task.update({ where: { id: task.id }, data });
  await recordAudit({ taskId: task.id, userId: session.sub, action: "update", before: task, after: updated });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await context.params;

  const task = await loadOwnTask(id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canAccessTask(session, task)) return forbidden(session, id);

  // Soft delete: keep the row (and its audit history) for recovery/inspection instead of hard-deleting it.
  const deleted = await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  await recordAudit({ taskId: task.id, userId: session.sub, action: "delete", before: task, after: deleted });

  return NextResponse.json({ ok: true });
}
