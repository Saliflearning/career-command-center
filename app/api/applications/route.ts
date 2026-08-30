/**
 * GET /api/applications
 *
 * Returns all application records for the authenticated user.
 * Used by the Applications (tracker) page.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applications = await db.application.findMany({
    where: { userId: session.user.id },
    orderBy: { appliedAt: "desc" },
    include: {
      resume: {
        select: {
          id: true,
          targetRole: true,
          atsScore: true,
          keywordScore: true,
        },
      },
    },
  });

  return NextResponse.json(
    applications.map((app) => ({
      id: app.id,
      company: app.company,
      role: app.role,
      date: app.appliedAt?.toISOString().split("T")[0] ?? "",
      status: app.status === "APPLIED" && !app.appliedAt ? "READY_TO_APPLY" : app.status,
      resume: app.resume?.targetRole ?? "—",
      resumeId: app.resumeId,
      followUp: "",
      matchScore: app.resume?.atsScore ?? app.resume?.keywordScore ?? null,
    })),
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    }
  );
}
