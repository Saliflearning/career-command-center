/**
 * GET /api/waitlist/position?email=x
 *
 * Returns the 1-based position and total count for a given email address.
 * Returns position: -1 if the email is not on the waitlist.
 *
 * TODO (E1): Replace the JSON file read with a DB query once the WaitlistEntry
 * Prisma model is in place (see /api/waitlist/route.ts for schema notes).
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface WaitlistRecord {
  id: string;
  email: string;
  createdAt: string;
}

const WAITLIST_PATH = path.join(process.cwd(), "data", "waitlist.json");

async function readWaitlist(): Promise<WaitlistRecord[]> {
  try {
    const raw = await fs.readFile(WAITLIST_PATH, "utf-8");
    return JSON.parse(raw) as WaitlistRecord[];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid ?email= query parameter is required." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();
  const entries = await readWaitlist();
  const total = entries.length;
  const index = entries.findIndex((e) => e.email === normalizedEmail);

  if (index === -1) {
    return NextResponse.json({ position: -1, total }, { status: 404 });
  }

  return NextResponse.json({ position: index + 1, total });
}
