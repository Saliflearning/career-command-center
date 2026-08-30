/**
 * GET /api/admin/users
 * Returns all users with resume and application counts.
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
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        _count: {
          select: { resumes: true, applications: true },
        },
      },
    });

    return NextResponse.json({ users });
  } catch (e: unknown) {
    console.error("[admin/users]", e);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
