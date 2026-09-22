import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { recordAudit } from "@/lib/audit";
import { TaskStatus } from "@prisma/client";

const STATUSES = new Set(Object.values(TaskStatus));

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  // Ownership boundary: members see only their own tasks, admins see every task.
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      ...(session.role === "admin" ? {} : { ownerId: session.sub }),
    },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let body: { title?: unknown; description?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const description = typeof body.description === "string" ? body.description : null;
  const status = typeof body.status === "string" && STATUSES.has(body.status as TaskStatus) ? (body.status as TaskStatus) : TaskStatus.todo;

  const task = await prisma.task.create({
    data: { title, description, status, ownerId: session.sub },
  });
  await recordAudit({ taskId: task.id, userId: session.sub, action: "create", after: task });

  return NextResponse.json(task, { status: 201 });
}
