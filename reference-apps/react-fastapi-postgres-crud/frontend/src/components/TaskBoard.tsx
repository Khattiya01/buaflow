import { type FormEvent, useState } from "react";

import { type Task, type TaskStatus, createTask, deleteTask, updateTask } from "../api/client.ts";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

interface Props {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
}

export default function TaskBoard({ tasks, onChange }: Props) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const task = await createTask({ title });
      setTitle("");
      onChange([task, ...tasks]);
    } catch {
      setError("Could not create the task. Title is required.");
    }
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    const updated = await updateTask(task.id, { status });
    onChange(tasks.map((t) => (t.id === task.id ? updated : t)));
  }

  async function handleDelete(task: Task) {
    await deleteTask(task.id);
    onChange(tasks.filter((t) => t.id !== task.id));
  }

  return (
    <section>
      <form className="new-task-form" onSubmit={handleCreate} aria-describedby={error ? "create-error" : undefined}>
        <label htmlFor="new-task-title">New task title</label>
        <input
          id="new-task-title"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title"
        />
        <button type="submit">Add</button>
        {error && (
          <p id="create-error" role="alert" className="error">
            {error}
          </p>
        )}
      </form>

      <div className="board">
        {COLUMNS.map((column) => (
          <div className="column" key={column.status}>
            <h2>{column.label}</h2>
            {tasks
              .filter((task) => task.status === column.status)
              .map((task) => (
                <article className="card" data-testid="task-row" key={task.id}>
                  <h3>{task.title}</h3>
                  {task.description && <p>{task.description}</p>}
                  <div className="card-actions">
                    <label htmlFor={`status-${task.id}`}>
                      Status
                      <select
                        id={`status-${task.id}`}
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.status} value={c.status}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={() => handleDelete(task)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
