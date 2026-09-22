import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TaskBoard } from "@/components/TaskBoard";
import { LogoutButton } from "@/components/LogoutButton";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      ...(session.role === "admin" ? {} : { ownerId: session.sub }),
    },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks {session.role === "admin" ? "(all — admin view)" : "(yours)"}</h1>
        <LogoutButton />
      </header>
      <TaskBoard
        initialTasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          owner: t.owner,
        }))}
        role={session.role}
      />
    </main>
  );
}
