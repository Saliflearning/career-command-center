/**
 * GET  /api/settings — returns user profile + preferences
 * PUT  /api/settings — updates user profile + preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      location: true,
      linkedinUrl: true,
      preferences: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      name: user.name ?? "",
      email: user.email,
      location: user.location ?? "",
      linkedinUrl: user.linkedinUrl ?? "",
    },
    generation: {
      tone: user.preferences?.preferredTone ?? "professional",
      aggression: user.preferences?.rewriteAggressiveness ?? 50,
      bulletStyle: user.preferences?.bulletStyle ?? "impact",
      lengthPref: user.preferences?.lengthPreference ?? "auto",
    },
    notifications: {
      emailNotif: user.preferences?.emailNotifications ?? true,
      aiSuggestions: user.preferences?.aiSuggestions ?? true,
      autoSave: user.preferences?.autoSave ?? true,
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Update profile fields on User model
  if (body.profile) {
    const profileUpdate: Record<string, string> = {};
    if (typeof body.profile.name === "string") profileUpdate.name = body.profile.name.trim();
    if (typeof body.profile.location === "string") profileUpdate.location = body.profile.location.trim();
    if (typeof body.profile.linkedinUrl === "string") profileUpdate.linkedinUrl = body.profile.linkedinUrl.trim();

    if (Object.keys(profileUpdate).length > 0) {
      await db.user.update({
        where: { id: session.user.id },
        data: profileUpdate,
      });
    }
  }

  // Update preferences via upsert
  if (body.generation || body.notifications) {
    const prefData: Record<string, unknown> = {};

    if (body.generation) {
      if (typeof body.generation.tone === "string") prefData.preferredTone = body.generation.tone;
      if (typeof body.generation.aggression === "number") prefData.rewriteAggressiveness = body.generation.aggression;
      if (typeof body.generation.bulletStyle === "string") prefData.bulletStyle = body.generation.bulletStyle;
      if (typeof body.generation.lengthPref === "string") prefData.lengthPreference = body.generation.lengthPref;
    }

    if (body.notifications) {
      if (typeof body.notifications.emailNotif === "boolean") prefData.emailNotifications = body.notifications.emailNotif;
      if (typeof body.notifications.aiSuggestions === "boolean") prefData.aiSuggestions = body.notifications.aiSuggestions;
      if (typeof body.notifications.autoSave === "boolean") prefData.autoSave = body.notifications.autoSave;
    }

    if (Object.keys(prefData).length > 0) {
      await db.userPreferences.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, ...prefData },
        update: prefData,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
