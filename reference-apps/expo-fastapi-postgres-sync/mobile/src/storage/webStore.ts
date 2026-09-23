import type { Task } from "../types";
import type { LocalStore } from "./types";

const TASKS_KEY = "buaflow.sync.tasks.v1";
const CURSOR_KEY = "buaflow.sync.lastSyncedAt.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const webStore: LocalStore = {
  async getAllTasks() {
    return read<Task[]>(TASKS_KEY, []);
  },
  async replaceAllTasks(tasks: Task[]) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  },
  async getLastSyncedAt() {
    return read<string | null>(CURSOR_KEY, null);
  },
  async setLastSyncedAt(value: string) {
    localStorage.setItem(CURSOR_KEY, JSON.stringify(value));
  },
};
