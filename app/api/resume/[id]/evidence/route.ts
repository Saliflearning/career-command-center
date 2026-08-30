import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

type EvidenceInput = {
  term?: unknown;
  category?: unknown;
  source?: unknown;
  details?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const resume = await db.resume.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const evidenceInput =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { evidence?: unknown }).evidence
      : undefined;
  if (!Array.isArray(evidenceInput)) {
    return NextResponse.json(
      { error: "Evidence must be an array." },
      { status: 400 }
    );
  }

  const evidence = evidenceInput
    .slice(0, 12)
    .map((input) => {
      const item: EvidenceInput =
        input && typeof input === "object" && !Array.isArray(input)
          ? (input as EvidenceInput)
          : {};
      return {
        term: typeof item.term === "string" ? item.term.trim().slice(0, 120) : "",
        category:
          typeof item.category === "string"
            ? item.category.trim().slice(0, 80)
            : "",
        source:
          typeof item.source === "string"
            ? item.source.trim().slice(0, 240)
            : "",
        details:
          typeof item.details === "string"
            ? item.details.trim().slice(0, 600)
            : "",
      };
    })
    .filter((item) => item.term && item.source && item.details);

  await db.$transaction(async (tx) => {
    await tx.resumeSection.deleteMany({
      where: { resumeId: id, name: "user_evidence" },
    });
    if (evidence.length > 0) {
      await tx.resumeSection.create({
        data: {
          resumeId: id,
          name: "user_evidence",
          visible: false,
          sortOrder: -90,
          content: JSON.stringify(evidence),
        },
      });
    }
  });

  return NextResponse.json({ saved: evidence.length });
}
