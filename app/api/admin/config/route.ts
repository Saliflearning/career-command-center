/**
 * app/api/admin/config/route.ts
 *
 * Admin-only API for reading and writing encrypted system config values (API keys).
 *
 * GET  /api/admin/config          → returns each key's source ("db" | "env" | "missing")
 *                                   never returns the actual key value
 * PUT  /api/admin/config          → body: { key, value } — saves to DB (encrypted)
 * DELETE /api/admin/config        → body: { key } — removes DB entry (falls back to env)
 *
 * Security: only the authenticated user with email matching ADMIN_EMAIL can call this.
 * If ADMIN_EMAIL is not configured, requests are denied.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { setConfig, getConfigSource } from "@/lib/config/server";

// Keys that can be managed via this endpoint
const MANAGED_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "LATEX_WORKER_URL",
] as const;

type ManagedKey = (typeof MANAGED_KEYS)[number];

function isManagedKey(key: string): key is ManagedKey {
  return MANAGED_KEYS.includes(key as ManagedKey);
}

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

  return null; // allowed
}

// GET — return source info for all managed keys (no values)
export async function GET(req: NextRequest) {
  const authError = await checkAdmin(req);
  if (authError) return authError;

  const sources: Record<string, string> = {};
  for (const key of MANAGED_KEYS) {
    sources[key] = await getConfigSource(key);
  }

  return NextResponse.json({ keys: sources });
}

// PUT — save a key to the DB
export async function PUT(req: NextRequest) {
  const authError = await checkAdmin(req);
  if (authError) return authError;

  let body: { key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || !isManagedKey(key)) {
    return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
  }
  if (value === undefined) {
    return NextResponse.json({ error: "Missing value" }, { status: 400 });
  }

  await setConfig(key, value.trim() || null);
  const source = await getConfigSource(key);
  return NextResponse.json({ success: true, key, source });
}

// DELETE — remove a key from the DB (falls back to env)
export async function DELETE(req: NextRequest) {
  const authError = await checkAdmin(req);
  if (authError) return authError;

  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key } = body;
  if (!key || !isManagedKey(key)) {
    return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
  }

  await setConfig(key, null);
  const source = await getConfigSource(key);
  return NextResponse.json({ success: true, key, source });
}
