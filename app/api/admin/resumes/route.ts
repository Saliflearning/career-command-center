/**
 * GET /api/admin/resumes
 * Returns all resumes across all users (last 100, newest first).
 * Admin-only.
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
    const resumes = await db.resume.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        targetRole: true,
        targetCompany: true,
        state: true,
        atsScore: true,
        keywordScore: true,
        createdAt: true,
        exportedAt: true,
        user: {
          select: { email: true, name: true },
        },
      },
    });

    return NextResponse.json({ resumes });
  } catch (e: unknown) {
    console.error("[admin/resumes]", e);
    return NextResponse.json({ error: "Failed to load resumes" }, { status: 500 });
  }
}
