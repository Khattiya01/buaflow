import { describe, it, expect } from "vitest";
import { canAccessTask } from "@/lib/guard";
import type { SessionPayload } from "@/lib/auth";

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return { sub: "user-1", role: "member", iat: 0, exp: 9999999999, ...overrides };
}

describe("canAccessTask", () => {
  it("allows the owner", () => {
    expect(canAccessTask(session({ sub: "user-1" }), { ownerId: "user-1" })).toBe(true);
  });

  it("denies a different member", () => {
    expect(canAccessTask(session({ sub: "user-1", role: "member" }), { ownerId: "user-2" })).toBe(false);
  });

  it("allows an admin regardless of ownership", () => {
    expect(canAccessTask(session({ sub: "user-1", role: "admin" }), { ownerId: "user-2" })).toBe(true);
  });
});
