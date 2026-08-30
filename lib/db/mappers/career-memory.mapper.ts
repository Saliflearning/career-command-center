/**
 * career-memory.mapper.ts
 *
 * Fetches a user's CareerMemory record from the database and maps the
 * Prisma types to the canonical CareerMemory type from lib/types/.
 *
 * Extracted from agents/orchestrator so it can be reused by:
 *   - agents/orchestrator (crash-recovery)
 *   - app/api/resume/[id]/content (workspace data enrichment)
 *   - future: memory/page.tsx (A13 memory screen)
 *
 * This is the SINGLE authoritative mapping from DB → canonical type.
 * If the Prisma schema changes, update ONLY this file.
 */

import { db } from "@/lib/db/client";
import type { CareerMemory } from "@/lib/types";

/**
 * Fetches and maps the full CareerMemory for a given userId.
 * Returns null if no CareerMemory record exists yet (first-time user).
 */
export async function fetchCareerMemoryFromDB(
  userId: string
): Promise<CareerMemory | null> {
  const cm = await db.careerMemory.findUnique({
    where: { userId },
    include: {
      jobs: {
        include: { bullets: true },
        orderBy: { sortOrder: "asc" },
      },
      education: true,
      skills: true,
      certs: true,
      projects: true,
    },
  });

  if (!cm) return null;

  const now = new Date().toISOString();

  return {
    id: cm.id,
    userId: cm.userId,
    version: 1,

    jobs: cm.jobs.map(
      (
        j: {
          id: string;
          company: string;
          title: string;
          startDate: Date;
          endDate: Date | null;
          current: boolean;
          location: string | null;
          employmentType: string | null;
          bullets: {
            id: string;
            content: string;
            contentType: string;
            metrics: string[];
            keywords: string[];
            locked: boolean;
          }[];
          sourceType: string;
          verified: boolean;
          locked: boolean;
          sortOrder: number;
        },
        idx: number
      ) => ({
        id: j.id,
        company: j.company,
        title: j.title,
        startDate: j.startDate.toISOString(),
        endDate: j.endDate?.toISOString() ?? null,
        current: j.current,
        location: j.location ?? null,
        employmentType: j.employmentType ?? null,
        bullets: j.bullets.map((b) => ({
          id: b.id,
          content: b.content,
          contentType: b.contentType as "VERIFIED" | "GENERATED" | "USER_EDITED",
          metrics: b.metrics as string[],
          keywords: b.keywords as string[],
          locked: b.locked,
          usedInResumeCount: 0,
        })),
        sourceType: j.sourceType as "UPLOADED" | "MANUAL" | "GENERATED",
        verified: j.verified,
        locked: j.locked,
        sortOrder: j.sortOrder ?? idx,
      })
    ),

    // For education/skills/certs/projects the schema has no separate verified
    // column; MANUAL sourceType means the user typed the entry themselves on
    // /memory, which is the product's definition of user-vouched.
    education: cm.education.map(
      (e: {
        id: string;
        degree: string;
        school: string;
        graduationDate: Date | null;
        expected: boolean;
        gpa: string | null;
        sourceType: string;
      }) => ({
        id: e.id,
        degree: e.degree,
        institution: e.school,
        graduationDate: e.graduationDate?.toISOString() ?? null,
        expectedDate: null,
        inProgress: e.expected,
        gpa: e.gpa ?? null,
        location: null,
        verified: e.sourceType === "MANUAL",
      })
    ),

    skills: cm.skills.map(
      (s: {
        id: string;
        name: string;
        category: string | null;
        qualifier: string | null;
        sourceType: string;
      }) => ({
        id: s.id,
        name: s.name,
        category: s.category ?? null,
        proficiencyLabel: s.qualifier ?? null,
        verified: s.sourceType === "MANUAL",
      })
    ),

    certifications: (cm.certs ?? []).map(
      (c: {
        id: string;
        name: string;
        issuer: string | null;
        year: number | null;
        sourceType: string;
      }) => ({
        id:           c.id,
        name:         c.name,
        issuingBody:  c.issuer ?? null,
        issueDate:    c.year ? `${c.year}-01-01` : null,
        expiryDate:   null,
        credentialId: null,
        verified:     c.sourceType === "MANUAL",
      })
    ),
    projects: (cm.projects ?? []).map(
      (p: {
        id: string;
        name: string;
        description: string | null;
        url: string | null;
        technologies: string[];
        sourceType: string;
      }) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        technologies: p.technologies ?? [],
        url: p.url ?? null,
        startDate: null,
        endDate: null,
        verified: p.sourceType === "MANUAL",
      })
    ),
    achievements: [],
    createdAt: cm.createdAt?.toISOString?.() ?? now,
    updatedAt: cm.updatedAt?.toISOString?.() ?? now,
  };
}
