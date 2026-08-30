/**
 * GET /api/admin/stats
 * Returns platform-wide metrics for the admin dashboard.
 * Admin-only — requires session + ADMIN_EMAIL match.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db/client";

async function checkAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? "career-command-center-local-dev-secret",
  });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "Admin access is not configured" }, { status: 503 });
  }
  if (token.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await checkAdmin(req);
  if (authError) return authError;

  try {
    const [
      totalUsers,
      totalResumes,
      totalApplications,
      resumesByState,
      recentUsers,
      exportedResumes,
    ] = await Promise.all([
      db.user.count(),
      db.resume.count(),
      db.application.count(),
      db.resume.groupBy({
        by: ["state"],
        _count: { state: true },
        orderBy: { _count: { state: "desc" } },
      }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: { select: { resumes: true, applications: true } },
        },
      }),
      db.resume.count({ where: { state: "EXPORTED" } }),
    ]);

    return NextResponse.json({
      totalUsers,
      totalResumes,
      totalApplications,
      exportedResumes,
      resumesByState: resumesByState.map((r) => ({
        state: r.state,
        count: r._count.state,
      })),
      recentUsers,
    });
  } catch (e: unknown) {
    console.error("[admin/stats]", e);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
