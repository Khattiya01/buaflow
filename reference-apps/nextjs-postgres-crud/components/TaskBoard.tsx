"use client";

import { useState } from "react";

type Status = "todo" | "in_progress" | "done";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  owner: { id: string; name: string; email: string };
};

const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function TaskBoard({ initialTasks, role }: { initialTasks: Task[]; role: "admin" | "member" }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create task");
        return;
      }
      const created: Task = await res.json();
      setTasks((prev) => [created, ...prev]);
      setTitle("");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(id: string, status: Status) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: Task = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

  async function deleteTask(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={createTask} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title"
          aria-label="New task title"
          className="flex-1 rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2" data-testid="task-list">
        {tasks.length === 0 && <li className="text-sm text-black/60 dark:text-white/60">No tasks yet.</li>}
        {tasks.map((task) => (
          <li
            key={task.id}
            data-testid="task-row"
            className="flex items-center justify-between gap-3 rounded border border-black/10 px-3 py-2 text-sm dark:border-white/15"
          >
            <div>
              <p className="font-medium">{task.title}</p>
              {role === "admin" && <p className="text-xs text-black/50 dark:text-white/50">owner: {task.owner.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={task.status}
                onChange={(e) => updateStatus(task.id, e.target.value as Status)}
                aria-label={`Status for ${task.title}`}
                className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete ${task.title}`}
                className="rounded border border-red-600/40 px-2 py-1 text-xs text-red-600"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
