import * as SQLite from "expo-sqlite";

import type { Task } from "../types";
import type { LocalStore } from "./types";

const DB_NAME = "buaflow-sync.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          ownerId TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          deletedAt TEXT,
          dirty INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: Task["status"];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: number;
}

export const sqliteStore: LocalStore = {
  async getAllTasks() {
    const db = await getDb();
    const rows = await db.getAllAsync<TaskRow>("SELECT * FROM tasks");
    return rows.map((r) => ({ ...r, dirty: r.dirty === 1 }));
  },

  async replaceAllTasks(tasks: Task[]) {
    const db = await getDb();
    // A whole-table replace, not incremental upserts: the in-memory `tasks` array passed in
    // by useTasks is already the full reconciled set after every sync step, so writing it
    // back wholesale keeps the on-disk copy trivially consistent with what the UI just
    // rendered, at the cost of rewriting unchanged rows too — an acceptable tradeoff for a
    // reference app's task-list scale.
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM tasks");
      for (const t of tasks) {
        await db.runAsync(
          "INSERT INTO tasks (id, title, description, status, ownerId, createdAt, updatedAt, deletedAt, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [t.id, t.title, t.description, t.status, t.ownerId, t.createdAt, t.updatedAt, t.deletedAt, t.dirty ? 1 : 0],
        );
      }
    });
  },

  async getLastSyncedAt() {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'lastSyncedAt'");
    return row?.value ?? null;
  },

  async setLastSyncedAt(value: string) {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncedAt', ?)", [value]);
  },
};
