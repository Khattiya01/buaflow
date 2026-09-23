import type { AuthUser, ServerTask, SyncChange, SyncPushResult } from "../types";
import { clearSession, getSession, setSession } from "../storage/secureStorage";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("network request failed");
    this.cause = cause;
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await getSession();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (cause) {
    // fetch() throws (rather than resolving) on a true network failure — this is the
    // signal useTasks uses to flip into offline mode instead of surfacing an error.
    throw new NetworkError(cause);
  }
  return response;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await authedFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "invalid email or password" : `login failed (${response.status})`);
  }
  const body = (await response.json()) as AuthUser & { token: string };
  const user: AuthUser = { id: body.id, email: body.email, name: body.name, role: body.role };
  await setSession({ token: body.token, user });
  return user;
}

export async function logout(): Promise<void> {
  try {
    await authedFetch("/api/auth/logout", { method: "POST" });
  } finally {
    await clearSession();
  }
}

export async function pull(since: string | null): Promise<{ tasks: ServerTask[]; serverTime: string }> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const response = await authedFetch(`/api/sync/pull${query}`);
  if (response.status === 401) throw new Error("unauthenticated");
  if (!response.ok) throw new Error(`pull failed (${response.status})`);
  return response.json();
}

export async function push(changes: SyncChange[]): Promise<{ results: SyncPushResult[]; serverTime: string }> {
  if (changes.length === 0) return { results: [], serverTime: new Date().toISOString() };
  const response = await authedFetch("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({ changes }),
  });
  if (response.status === 401) throw new Error("unauthenticated");
  if (!response.ok) throw new Error(`push failed (${response.status})`);
  return response.json();
}
