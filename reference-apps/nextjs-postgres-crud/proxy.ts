import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/auth";

// Network-boundary guard (Next.js 16 renamed `middleware` to `proxy`). This only checks that the
// session cookie is present and its signature is valid — no database call here by design, so a
// compromised or overloaded database never turns into an auth bypass or an outage of the login redirect.
const PROTECTED_PREFIXES = ["/tasks"];

export function proxy(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const session = decodeSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/tasks/:path*"],
};
