import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { AuthUser } from "../types";

/** Where the session (bearer token + the user profile it belongs to) lives. Native: the OS
 * keychain/keystore via expo-secure-store (encrypted at rest). Web: expo-secure-store has
 * no web implementation, so localStorage is used directly there — the same tradeoff the
 * web export already makes for task storage (see LocalStore.ts), and no worse than the
 * cookie a browser session would otherwise carry. Storing the user profile alongside the
 * token (not just the opaque token) lets the app show "signed in as ..." immediately on
 * launch without an extra network round trip. */
const SESSION_KEY = "buaflow.sync.session.v1";

export interface StoredSession {
  token: string;
  user: AuthUser;
}

export async function getSession(): Promise<StoredSession | null> {
  const raw = Platform.OS === "web" ? localStorage.getItem(SESSION_KEY) : await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function setSession(session: StoredSession): Promise<void> {
  const raw = JSON.stringify(session);
  if (Platform.OS === "web") {
    localStorage.setItem(SESSION_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, raw);
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
