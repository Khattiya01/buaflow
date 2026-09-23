/**
 * The sync engine — see ../../docs/sync-contract.md for the prose version. Everything here
 * is a pure function over plain data: no network, no storage, no platform API. That is
 * deliberate — it is what makes this the one part of the offline/sync contract that is
 * exhaustively unit-testable (see engine.test.ts) without a device, an emulator, or a
 * running backend.
 *
 * The invariant the whole module protects: a LOCAL edit that has not yet been confirmed by
 * the server (`dirty: true`) is never silently overwritten by an incoming pull. It can only
 * be resolved by a push round trip — either the push applies it (dirty clears, local wins)
 * or the push reports a conflict (dirty clears, the server's version replaces it). A pull
 * never touches a dirty row.
 */

import type { ServerTask, SyncChange, SyncPushResult, Task, TaskStatus } from "../types";

function fromServerTask(server: ServerTask, dirty: boolean): Task {
  return {
    id: server.id,
    title: server.title,
    description: server.description,
    status: server.status,
    ownerId: server.owner_id,
    createdAt: server.created_at,
    updatedAt: server.updated_at,
    deletedAt: server.deleted_at,
    dirty,
  };
}

export function createLocalTask(
  tasks: Task[],
  input: { id: string; ownerId: string; title: string; description?: string | null; status?: TaskStatus },
): Task[] {
  const now = new Date().toISOString();
  const task: Task = {
    id: input.id,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "todo",
    ownerId: input.ownerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  };
  return [task, ...tasks];
}

export function updateLocalTask(
  tasks: Task[],
  id: string,
  patch: Partial<Pick<Task, "title" | "description" | "status">>,
): Task[] {
  const now = new Date().toISOString();
  return tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now, dirty: true } : t));
}

export function softDeleteLocalTask(tasks: Task[], id: string): Task[] {
  const now = new Date().toISOString();
  return tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now, dirty: true } : t));
}

/** What the UI should render: not-deleted tasks, newest first. */
export function visibleTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.deletedAt === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The push payload for every locally-dirty task. */
export function collectDirtyChanges(tasks: Task[]): SyncChange[] {
  return tasks
    .filter((t) => t.dirty)
    .map((t) => ({
      clientId: t.id,
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      deleted: t.deletedAt !== null,
      updatedAt: t.updatedAt,
    }));
}

/**
 * Merge a GET /api/sync/pull response into the local set. A pulled row REPLACES the local
 * row unless the local row is dirty (an unconfirmed local edit in flight) — dirty rows are
 * left untouched here; they are only ever resolved by reconcilePushResults.
 */
export function mergePulledTasks(local: Task[], pulled: ServerTask[]): Task[] {
  const byId = new Map(local.map((t) => [t.id, t] as const));
  for (const server of pulled) {
    const existing = byId.get(server.id);
    if (existing?.dirty) continue;
    byId.set(server.id, fromServerTask(server, false));
  }
  return Array.from(byId.values());
}

/**
 * Apply the results of a POST /api/sync/push. Both outcomes clear `dirty` — "applied" means
 * the server accepted the local edit (the returned task is the server's canonical, now-
 * confirmed version, including its server-stamped updatedAt); "conflict" means a newer
 * server write already existed and the local edit was rejected, so the server's version
 * must replace the local one instead.
 *
 * `pushed` is the exact list of SyncChange the push request sent. It is needed to guard
 * against a race: if the user edits a task again while its push is still in flight, the
 * local row has moved on (a newer updatedAt, still dirty) by the time the result comes
 * back. Applying a now-stale result in that case would silently discard the newer edit, so
 * a task is only reconciled if its local updatedAt still matches what was actually sent —
 * otherwise it is left dirty and gets picked up by the next sync cycle instead.
 */
export function reconcilePushResults(local: Task[], pushed: SyncChange[], results: SyncPushResult[]): Task[] {
  const pushedById = new Map(pushed.map((c) => [c.id, c] as const));
  const byId = new Map(local.map((t) => [t.id, t] as const));
  for (const result of results) {
    const current = byId.get(result.id);
    const sentChange = pushedById.get(result.id);
    if (current && sentChange && current.updatedAt !== sentChange.updatedAt) continue;
    byId.set(result.id, fromServerTask(result.task, false));
  }
  return Array.from(byId.values());
}

export function hasPendingChanges(tasks: Task[]): boolean {
  return tasks.some((t) => t.dirty);
}
