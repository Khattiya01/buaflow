import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, type Task, fetchTasks } from "../api/client.ts";
import LogoutButton from "../components/LogoutButton.tsx";
import TaskBoard from "../components/TaskBoard.tsx";

export default function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTasks()
      .then((loaded) => {
        if (!cancelled) setTasks(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate("/login");
          return;
        }
        setError("Could not load tasks.");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="page">
      <div className="header">
        <h1>Task board</h1>
        <LogoutButton />
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tasks === null && !error ? <p>Loading…</p> : null}
      {tasks !== null && <TaskBoard tasks={tasks} onChange={setTasks} />}
    </main>
  );
}
