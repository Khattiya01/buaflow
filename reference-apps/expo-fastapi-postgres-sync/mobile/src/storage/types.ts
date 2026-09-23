import type { Task } from "../types";

/** The on-device persistence boundary. Every write returns once durably written, so the UI
 * never shows an optimistic update that a crash could silently lose. See ./localStore.web.ts,
 * ./localStore.native.ts and docs/sync-contract.md for why there are two implementations,
 * and why they are selected via Metro's platform-extension convention rather than a runtime
 * Platform.OS branch (a runtime branch would still statically import expo-sqlite into the
 * web bundle, which fails — see sqliteStore.ts's web-incompatible wa-sqlite worker). */
export interface LocalStore {
  getAllTasks(): Promise<Task[]>;
  replaceAllTasks(tasks: Task[]): Promise<void>;
  getLastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(value: string): Promise<void>;
}
