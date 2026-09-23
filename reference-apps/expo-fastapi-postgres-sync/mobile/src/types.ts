export type TaskStatus = "todo" | "in_progress" | "done";

/** Local, on-device shape. `dirty` is the one field with no server equivalent: true means
 * this row has a local edit that has not yet been confirmed applied by a push. */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: boolean;
}

/** Wire shape returned by GET /api/sync/pull and embedded in push results — see
 * backend/app/schemas.py's TaskOut. */
export interface ServerTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SyncChange {
  clientId: string;
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  deleted: boolean;
  updatedAt: string;
}

export interface SyncPushResult {
  clientId: string;
  id: string;
  outcome: "applied" | "conflict";
  task: ServerTask;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}
