import { useCallback, useEffect, useRef, useState } from "react";

import * as client from "../api/client";
import { NetworkError } from "../api/client";
import { localStore as store } from "../storage/localStore";
import {
  collectDirtyChanges,
  createLocalTask,
  mergePulledTasks,
  reconcilePushResults,
  softDeleteLocalTask,
  updateLocalTask,
  visibleTasks,
} from "../sync/engine";
import type { Task, TaskStatus } from "../types";

const SYNC_INTERVAL_MS = 15_000;

function generateLocalId(): string {
  // RFC4122-ish v4 without a crypto dependency — a device-scoped id is all the sync
  // contract needs (see docs/sync-contract.md), so Math.random-quality uniqueness is
  // an acceptable, deliberate tradeoff for a reference app.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useTasks(ownerId: string, onUnauthenticated: () => void) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  const syncingRef = useRef(false);

  // tasksRef is the single synchronous source of truth for "the current tasks". It is
  // updated eagerly, inline, by every mutation below — never via a useEffect mirroring
  // `tasks` state. That mirrored-ref approach was tried first and was wrong: effects run
  // after the next render, which is LATER than an async function's very next `await`
  // resumes, so syncNow (called immediately after a mutation, via the common
  // addTask/setStatus/removeTask -> void syncNow() path) would read a stale pre-mutation
  // snapshot and its final setTasks(...) would silently overwrite the mutation. A "peek via
  // setState's updater callback" was tried next and was ALSO wrong, for a different reason:
  // React does not invoke that callback synchronously at the setState call site — it runs
  // later, during reconciliation — so code immediately after the setState call still sees
  // the ref/variable from before the update. Both bugs were caught by
  // tests/e2e/{primary-flow,offline-sync}.spec.ts, not just theorized; only an eagerly and
  // synchronously updated ref is actually correct here. setTasks is still called on every
  // mutation, purely to trigger a re-render — it is never read from for correctness.
  const applyTasks = useCallback((updater: (prev: Task[]) => Task[]) => {
    const next = updater(tasksRef.current);
    tasksRef.current = next;
    setTasks(next);
    return next;
  }, []);

  useEffect(() => {
    store.getAllTasks().then((loadedTasks) => {
      applyTasks(() => loadedTasks);
      setLoaded(true);
    });
  }, [applyTasks]);

  // Durably save every committed change to the local store — decoupled from whatever call
  // site produced it, so mutation callbacks only need to update tasksRef/tasks.
  useEffect(() => {
    if (!loaded) return;
    store.replaceAllTasks(tasks);
  }, [tasks, loaded]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const dirtyChanges = collectDirtyChanges(tasksRef.current);
      if (dirtyChanges.length > 0) {
        const pushResult = await client.push(dirtyChanges);
        applyTasks((latest) => reconcilePushResults(latest, dirtyChanges, pushResult.results));
      }

      const since = await store.getLastSyncedAt();
      const pullResult = await client.pull(since);
      applyTasks((latest) => mergePulledTasks(latest, pullResult.tasks));
      await store.setLastSyncedAt(pullResult.serverTime);
      setIsOffline(false);
    } catch (error) {
      if (error instanceof NetworkError) {
        setIsOffline(true);
      } else if (error instanceof Error && error.message === "unauthenticated") {
        onUnauthenticated();
      } else {
        throw error;
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [applyTasks, onUnauthenticated]);

  useEffect(() => {
    if (!loaded) return;
    // See syncNow's own comment on why this eslint rule doesn't apply cleanly here: this
    // is the canonical "kick off an async fetch/sync in an effect" pattern, not a
    // synchronous setState-in-effect anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncNow();
    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // syncNow intentionally not in deps: it is stable in practice (its own deps are
    // stable) and re-running this effect on every syncNow identity change would restart
    // the interval on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const addTask = useCallback(
    async (title: string) => {
      applyTasks((prev) => createLocalTask(prev, { id: generateLocalId(), ownerId, title }));
      void syncNow();
    },
    [ownerId, applyTasks, syncNow],
  );

  const setStatus = useCallback(
    async (id: string, status: TaskStatus) => {
      applyTasks((prev) => updateLocalTask(prev, id, { status }));
      void syncNow();
    },
    [applyTasks, syncNow],
  );

  const removeTask = useCallback(
    async (id: string) => {
      applyTasks((prev) => softDeleteLocalTask(prev, id));
      void syncNow();
    },
    [applyTasks, syncNow],
  );

  return {
    tasks: visibleTasks(tasks),
    loaded,
    isOffline,
    syncing,
    pendingCount: collectDirtyChanges(tasks).length,
    addTask,
    setStatus,
    removeTask,
    syncNow,
  };
}
