/**
 * POST /api/waitlist
 *
 * Accepts { email: string } and stores the email in data/waitlist.json.
 *
 * TODO (E1): Replace the JSON file store with a proper `WaitlistEntry` Prisma
 * model once the schema migration is done. The model should have at minimum:
 *   model WaitlistEntry {
 *     id        String   @id @default(cuid())
 *     email     String   @unique
 *     position  Int      @default(autoincrement())
 *     createdAt DateTime @default(now())
 *   }
 * Then swap `readWaitlist` / `writeWaitlist` helpers below for `db.waitlistEntry`.
 */

import { NextRequest, NextResponse } from "next/server";
import { hit, clientIp } from "@/lib/rate-limit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const WaitlistSchema = z.object({
  email: z.string().email("Please provide a valid email address."),
});

// ---------------------------------------------------------------------------
// File-based store helpers
// The JSON file lives at <project-root>/data/waitlist.json.
// This is intentionally simple and NOT suitable for concurrent writes at scale —
// replace with the DB table noted above before launch.
// ---------------------------------------------------------------------------
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
    // File doesn't exist yet — return empty list
    return [];
  }
}

async function writeWaitlist(entries: WaitlistRecord[]): Promise<void> {
  // Ensure the data/ directory exists
  await fs.mkdir(path.dirname(WAITLIST_PATH), { recursive: true });
  await fs.writeFile(WAITLIST_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  return `wl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // QUALITY_AUDIT F2: public endpoint — throttle signup bursts per client IP.
  const limit = hit(`waitlist:${clientIp(req.headers)}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = WaitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 }
    );
  }

  const { email } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const entries = await readWaitlist();

  // Check for duplicate
  const existing = entries.find((e) => e.email === normalizedEmail);
  if (existing) {
    const position = entries.indexOf(existing) + 1;
    return NextResponse.json({ success: true, position, alreadyRegistered: true });
  }

  // Append new entry
  const newEntry: WaitlistRecord = {
    id: generateId(),
    email: normalizedEmail,
    createdAt: new Date().toISOString(),
  };
  entries.push(newEntry);
  await writeWaitlist(entries);

  const position = entries.length;
  return NextResponse.json({ success: true, position }, { status: 201 });
}
