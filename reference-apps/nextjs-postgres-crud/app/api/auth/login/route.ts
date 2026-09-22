import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { log } from "@/lib/log";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same generic error whether the account is missing or the password is wrong —
  // do not let the API reveal which accounts exist (basic security-controls hygiene).
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Never log the email on failure — logging "which emails were tried" turns logs into an
    // account-enumeration oracle for anyone who can read them.
    log.warn("auth.login.failed");
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }

  log.info("auth.login.success", { userId: user.id, role: user.role });
  await setSessionCookie({ sub: user.id, role: user.role });
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
