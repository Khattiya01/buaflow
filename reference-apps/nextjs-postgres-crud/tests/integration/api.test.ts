import { describe, it, expect } from "vitest";
import { BASE_URL } from "./global-setup";
import { TestClient } from "./client";

// Runs against a real `next start` production server backed by a real, freshly-migrated
// and seeded PostgreSQL database (see global-setup.ts) — no mocks. Seed data (prisma/seed.mjs):
// admin@example.com / admin-dev-password, member@example.com / member-dev-password,
// and one task ("Write the runbook") owned by the member.

describe("health", () => {
  it("reports the database as reachable", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("up");
  });
});

describe("authentication", () => {
  it("rejects requests with no session", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`);
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email", async () => {
    const client = new TestClient();
    const res = await client.login("nobody@example.com", "whatever");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const client = new TestClient();
    const res = await client.login("member@example.com", "wrong-password");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid email or password");
  });

  it("logs a member in and sets a session cookie", async () => {
    const client = new TestClient();
    const res = await client.login("member@example.com", "member-dev-password");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("member@example.com");
    expect(body.role).toBe("member");
  });

  it("logout clears the session", async () => {
    const client = new TestClient();
    await client.login("member@example.com", "member-dev-password");
    expect((await client.request("/api/tasks")).status).toBe(200);
    await client.request("/api/auth/logout", { method: "POST" });
    expect((await client.request("/api/tasks")).status).toBe(401);
  });
});

describe("ownership boundary (access-control)", () => {
  it("a member sees only their own tasks", async () => {
    const member = new TestClient();
    const loginRes = await member.login("member@example.com", "member-dev-password");
    const { id: memberId } = await loginRes.json();

    const { status, body } = await member.json("/api/tasks");
    expect(status).toBe(200);
    expect(body.every((t: { ownerId: string }) => t.ownerId === memberId)).toBe(true);
    expect(body.some((t: { title: string }) => t.title === "Write the runbook")).toBe(true);
  });

  it("an admin sees every task, including other users'", async () => {
    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");
    const created = await member.json("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "member-only task for admin-visibility check" }),
    });
    expect(created.status).toBe(201);

    const admin = new TestClient();
    await admin.login("admin@example.com", "admin-dev-password");
    const { body: adminTasks } = await admin.json("/api/tasks");
    expect(adminTasks.some((t: { id: string }) => t.id === created.body.id)).toBe(true);
  });

  it("a member cannot PATCH a task they do not own", async () => {
    const admin = new TestClient();
    await admin.login("admin@example.com", "admin-dev-password");
    const created = await admin.json("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "admin-owned task" }),
    });

    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");
    const patch = await member.request(`/api/tasks/${created.body.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(patch.status).toBe(403);
  });

  it("a member cannot DELETE a task they do not own", async () => {
    const admin = new TestClient();
    await admin.login("admin@example.com", "admin-dev-password");
    const created = await admin.json("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "admin-owned task for delete check" }),
    });

    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");
    const del = await member.request(`/api/tasks/${created.body.id}`, { method: "DELETE" });
    expect(del.status).toBe(403);
  });

  it("an admin can access any task directly by id", async () => {
    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");
    const created = await member.json("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "member task admin will fetch directly" }),
    });

    const admin = new TestClient();
    await admin.login("admin@example.com", "admin-dev-password");
    const res = await admin.request(`/api/tasks/${created.body.id}`);
    expect(res.status).toBe(200);
  });
});

describe("task lifecycle", () => {
  it("creates, updates status, and soft-deletes a task", async () => {
    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");

    const created = await member.json("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "lifecycle task" }),
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("todo");

    const updated = await member.json(`/api/tasks/${created.body.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("in_progress");

    const deleted = await member.request(`/api/tasks/${created.body.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const afterDelete = await member.json(`/api/tasks/${created.body.id}`);
    expect(afterDelete.status).toBe(404); // soft-deleted rows are excluded from reads, not just the list
  });

  it("rejects a task with an empty title", async () => {
    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");
    const res = await member.json("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON bodies", async () => {
    const member = new TestClient();
    await member.login("member@example.com", "member-dev-password");
    const res = await member.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });
});
