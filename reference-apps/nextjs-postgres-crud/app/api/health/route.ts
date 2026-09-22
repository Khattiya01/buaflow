import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

// health-check control: proves the process is up AND can reach its database,
// not just that the HTTP server is listening.
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "up",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    log.error("health.database_unreachable", { error: message });
    return NextResponse.json(
      { status: "error", database: "down", error: message, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
