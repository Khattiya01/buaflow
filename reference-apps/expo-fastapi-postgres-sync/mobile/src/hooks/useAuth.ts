import { useCallback, useEffect, useState } from "react";

import * as client from "../api/client";
import { getSession } from "../storage/secureStorage";
import type { AuthUser } from "../types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    getSession().then((session) => {
      setUser(session?.user ?? null);
      setCheckingSession(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedInUser = await client.login(email, password);
    setUser(signedInUser);
  }, []);

  const signOut = useCallback(async () => {
    await client.logout();
    setUser(null);
  }, []);

  // Called by useTasks when a sync call comes back 401 — the stored token is no longer
  // valid (expired, or the server rotated its secret), so the app falls back to the login
  // screen instead of spinning forever on a sync that can never succeed.
  const forceSignOut = useCallback(() => setUser(null), []);

  return { user, checkingSession, signIn, signOut, forceSignOut };
}
