import { describe, expect, it } from "vitest";

import type { ServerTask, SyncPushResult, Task } from "../types";
import {
  collectDirtyChanges,
  createLocalTask,
  hasPendingChanges,
  mergePulledTasks,
  reconcilePushResults,
  softDeleteLocalTask,
  updateLocalTask,
  visibleTasks,
} from "./engine";

function serverTask(overrides: Partial<ServerTask> = {}): ServerTask {
  return {
    id: "t1",
    title: "From server",
    description: null,
    status: "todo",
    owner_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("createLocalTask", () => {
  it("adds a dirty task to the front of the list", () => {
    const tasks = createLocalTask([], { id: "t1", ownerId: "user-1", title: "Buy milk" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: "t1", title: "Buy milk", dirty: true, deletedAt: null });
  });
});

describe("updateLocalTask / softDeleteLocalTask", () => {
  it("marks the edited task dirty without touching others", () => {
    const base = createLocalTask(createLocalTask([], { id: "t1", ownerId: "u", title: "A" }), {
      id: "t2",
      ownerId: "u",
      title: "B",
    });
    const updated = updateLocalTask(base, "t1", { status: "done" });
    const t1 = updated.find((t) => t.id === "t1")!;
    const t2 = updated.find((t) => t.id === "t2")!;
    expect(t1.status).toBe("done");
    expect(t1.dirty).toBe(true);
    expect(t2.dirty).toBe(true); // was already dirty from creation, untouched by this update
  });

  it("soft-deletes by setting deletedAt and dirty, keeping the row", () => {
    const base = createLocalTask([], { id: "t1", ownerId: "u", title: "A" });
    const deleted = softDeleteLocalTask(base, "t1");
    expect(deleted).toHaveLength(1);
    expect(deleted[0].deletedAt).not.toBeNull();
    expect(deleted[0].dirty).toBe(true);
  });
});

describe("visibleTasks", () => {
  it("hides soft-deleted tasks and sorts newest first", () => {
    const tasks: Task[] = [
      { id: "a", title: "A", description: null, status: "todo", ownerId: "u", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null, dirty: false },
      { id: "b", title: "B", description: null, status: "todo", ownerId: "u", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", deletedAt: null, dirty: false },
      { id: "c", title: "C (deleted)", description: null, status: "todo", ownerId: "u", createdAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z", deletedAt: "2026-01-03T01:00:00Z", dirty: false },
    ];
    expect(visibleTasks(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("collectDirtyChanges", () => {
  it("only includes dirty tasks, mapping deletedAt to a deleted flag", () => {
    const clean: Task = { id: "a", title: "A", description: null, status: "todo", ownerId: "u", createdAt: "x", updatedAt: "x", deletedAt: null, dirty: false };
    const dirtyEdit: Task = { id: "b", title: "B edited", description: "d", status: "in_progress", ownerId: "u", createdAt: "x", updatedAt: "y", deletedAt: null, dirty: true };
    const dirtyDelete: Task = { id: "c", title: "C", description: null, status: "todo", ownerId: "u", createdAt: "x", updatedAt: "y", deletedAt: "y", dirty: true };

    const changes = collectDirtyChanges([clean, dirtyEdit, dirtyDelete]);
    expect(changes.map((c) => c.id).sort()).toEqual(["b", "c"]);
    expect(changes.find((c) => c.id === "b")).toMatchObject({ deleted: false, title: "B edited", status: "in_progress" });
    expect(changes.find((c) => c.id === "c")).toMatchObject({ deleted: true });
  });
});

describe("mergePulledTasks", () => {
  it("inserts and updates non-dirty local tasks from a pull", () => {
    const local: Task[] = [];
    const merged = mergePulledTasks(local, [serverTask({ id: "t1", title: "Pulled" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "t1", title: "Pulled", dirty: false });
  });

  it("never overwrites a locally-dirty task with a pulled version", () => {
    const local: Task[] = [
      { id: "t1", title: "Local unsynced edit", description: null, status: "in_progress", ownerId: "u", createdAt: "x", updatedAt: "x", deletedAt: null, dirty: true },
    ];
    const merged = mergePulledTasks(local, [serverTask({ id: "t1", title: "Stale server copy" })]);
    expect(merged[0].title).toBe("Local unsynced edit");
    expect(merged[0].dirty).toBe(true);
  });

  it("surfaces a soft-deleted pulled task as deletedAt set, not removed from the array", () => {
    const merged = mergePulledTasks([], [serverTask({ id: "t1", deleted_at: "2026-02-01T00:00:00Z" })]);
    expect(merged[0].deletedAt).toBe("2026-02-01T00:00:00Z");
    expect(visibleTasks(merged)).toHaveLength(0);
  });
});

describe("reconcilePushResults", () => {
  it("clears dirty and adopts the server's confirmed version on an applied result", () => {
    const local: Task[] = [
      { id: "t1", title: "Local", description: null, status: "todo", ownerId: "u", createdAt: "x", updatedAt: "x", dirty: true, deletedAt: null },
    ];
    const pushed = collectDirtyChanges(local);
    const results: SyncPushResult[] = [
      { clientId: "t1", id: "t1", outcome: "applied", task: serverTask({ id: "t1", title: "Local", updated_at: "2026-03-01T00:00:00Z" }) },
    ];
    const reconciled = reconcilePushResults(local, pushed, results);
    expect(reconciled[0]).toMatchObject({ dirty: false, updatedAt: "2026-03-01T00:00:00Z" });
  });

  it("overwrites the local edit with the server's version on a conflict", () => {
    const local: Task[] = [
      { id: "t1", title: "My stale edit", description: null, status: "done", ownerId: "u", createdAt: "x", updatedAt: "x", dirty: true, deletedAt: null },
    ];
    const pushed = collectDirtyChanges(local);
    const results: SyncPushResult[] = [
      { clientId: "t1", id: "t1", outcome: "conflict", task: serverTask({ id: "t1", title: "Someone else's newer edit", status: "in_progress" }) },
    ];
    const reconciled = reconcilePushResults(local, pushed, results);
    expect(reconciled[0]).toMatchObject({ dirty: false, title: "Someone else's newer edit", status: "in_progress" });
  });

  it("does not clobber a newer local edit made while the push was in flight", () => {
    const originalEdit: Task[] = [
      { id: "t1", title: "First edit", description: null, status: "todo", ownerId: "u", createdAt: "x", updatedAt: "2026-01-01T00:00:00Z", dirty: true, deletedAt: null },
    ];
    const pushed = collectDirtyChanges(originalEdit); // snapshot sent to the server

    // The user edits again before the push response arrives.
    const withNewerEdit = updateLocalTask(originalEdit, "t1", { title: "Second edit, made mid-flight" });

    const staleResults: SyncPushResult[] = [
      { clientId: "t1", id: "t1", outcome: "applied", task: serverTask({ id: "t1", title: "First edit" }) },
    ];
    const reconciled = reconcilePushResults(withNewerEdit, pushed, staleResults);
    expect(reconciled[0]).toMatchObject({ title: "Second edit, made mid-flight", dirty: true });
  });
});

describe("hasPendingChanges", () => {
  it("reports whether any task is unsynced", () => {
    expect(hasPendingChanges([])).toBe(false);
    expect(hasPendingChanges(createLocalTask([], { id: "t1", ownerId: "u", title: "A" }))).toBe(true);
  });
});
