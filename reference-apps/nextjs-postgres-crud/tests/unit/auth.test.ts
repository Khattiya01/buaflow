import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { hashPassword, verifyPassword, encodeSession, decodeSession } from "@/lib/auth";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-real-use-0123456789abcdef";
});

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toEqual(b);
  });
});

describe("session cookie signing", () => {
  it("round-trips a valid session", () => {
    const token = encodeSession({ sub: "user-1", role: "member" });
    const decoded = decodeSession(token);
    expect(decoded?.sub).toBe("user-1");
    expect(decoded?.role).toBe("member");
  });

  it("rejects a tampered payload", () => {
    const token = encodeSession({ sub: "user-1", role: "member" });
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ sub: "user-2", role: "admin", iat: 0, exp: 9999999999 })).toString("base64url");
    expect(decodeSession(`${tamperedBody}.${signature}`)).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects an expired session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = encodeSession({ sub: "user-1", role: "member" });
    expect(decodeSession(token)?.sub).toBe("user-1"); // valid right after issuing

    vi.setSystemTime(new Date("2026-01-02T00:00:00Z")); // well past the 8h TTL
    expect(decodeSession(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(decodeSession("not-a-real-token")).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession(null)).toBeNull();
  });
});
