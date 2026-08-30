import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { reusableCareerProfileBullets } from "@/lib/resume/career-profile-evidence";

const categorySchema = z.enum(["experience", "education", "skills", "certifications", "projects"]);
const payloadSchema = z.object({
  action: z.enum(["create", "update", "delete", "verify"]),
  category: categorySchema,
  id: z.string().max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const optionalDateText = z.string().trim().max(40).default("");

const experienceEntrySchema = z.object({
  title: requiredText(180),
  company: requiredText(180),
  startDate: requiredText(40).refine(isValidDate),
  endDate: optionalDateText,
  current: z.boolean().default(false),
  location: optionalText(180),
  bullets: optionalText(4000),
}).superRefine((entry, context) => {
  if (entry.current || !entry.endDate) return;
  if (!isValidDate(entry.endDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Invalid end date" });
    return;
  }
  if (new Date(entry.endDate) < new Date(entry.startDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date precedes start date" });
  }
});

const educationEntrySchema = z.object({
  title: requiredText(220),
  company: requiredText(220),
  date: optionalDateText.refine((value) => !value || isValidDate(value)),
  expected: z.boolean().default(false),
});

const skillEntrySchema = z.object({
  title: requiredText(140),
  company: optionalText(120),
  qualifier: optionalText(80),
});

const certificationEntrySchema = z.object({
  title: requiredText(220),
  company: optionalText(180),
  year: optionalText(4).refine((value) => !value || /^\d{4}$/.test(value)),
});

const projectEntrySchema = z.object({
  title: requiredText(220),
  company: optionalText(500),
  description: optionalText(2000),
  technologies: optionalText(1000),
});

async function memoryFor(userId: string) {
  return db.careerMemory.upsert({ where: { userId }, create: { userId }, update: {} });
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalDate(value: unknown) {
  const raw = text(value, 40);
  if (!raw) return null;
  return isValidDate(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseEntryData(category: z.infer<typeof categorySchema>, data: Record<string, unknown>) {
  if (category === "experience") return experienceEntrySchema.safeParse(data);
  if (category === "education") return educationEntrySchema.safeParse(data);
  if (category === "skills") return skillEntrySchema.safeParse(data);
  if (category === "certifications") return certificationEntrySchema.safeParse(data);
  return projectEntrySchema.safeParse(data);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memory = await db.careerMemory.findUnique({
    where: { userId: session.user.id },
    include: {
      jobs: { orderBy: { sortOrder: "asc" }, include: { bullets: { include: { usedInResumes: true } } } },
      education: { orderBy: { graduationDate: "desc" } },
      skills: { orderBy: { name: "asc" } },
      certs: { orderBy: { year: "desc" } },
      projects: { orderBy: { name: "asc" } },
    },
  });

  if (!memory) {
    return NextResponse.json({ experience: [], education: [], skills: [], certifications: [], projects: [] });
  }

  return NextResponse.json({
    experience: memory.jobs.map((job) => {
      const reusableBullets = reusableCareerProfileBullets(job.bullets);
      return {
        id: job.id, title: job.title, company: job.company,
        startDate: job.startDate.toISOString().slice(0, 10),
        endDate: job.endDate?.toISOString().slice(0, 10) ?? "",
        current: job.current, location: job.location ?? "",
        bullets: reusableBullets.map((bullet) => bullet.content),
        tags: Array.from(new Set(reusableBullets.flatMap((bullet) => bullet.keywords))).slice(0, 8),
        verified: job.verified, source: job.sourceType,
        usedInResumes: job.bullets.reduce((sum, bullet) => sum + bullet.usedInResumes.length, 0),
      };
    }),
    education: memory.education.map((entry) => ({
      id: entry.id, title: entry.degree, company: entry.school,
      date: entry.graduationDate?.toISOString().slice(0, 10) ?? "",
      expected: entry.expected, verified: false, source: entry.sourceType,
    })),
    skills: memory.skills.map((entry) => ({
      id: entry.id, title: entry.name, company: entry.category ?? "",
      qualifier: entry.qualifier ?? "", verified: false, source: entry.sourceType,
    })),
    certifications: memory.certs.map((entry) => ({
      id: entry.id, title: entry.name, company: entry.issuer ?? "",
      year: entry.year?.toString() ?? "", verified: false, source: entry.sourceType,
    })),
    projects: memory.projects.map((entry) => ({
      id: entry.id, title: entry.name, company: entry.url ?? "",
      description: entry.description ?? "", technologies: entry.technologies,
      verified: false, source: entry.sourceType,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile update" }, { status: 422 });

  const { action, category, id, data = {} } = parsed.data;
  let validatedData: Record<string, unknown> = data;
  if (action === "create" || action === "update") {
    const entry = parseEntryData(category, data);
    if (!entry.success) {
      return NextResponse.json({ error: "Invalid profile entry" }, { status: 422 });
    }
    validatedData = entry.data;
  }
  const memory = await memoryFor(session.user.id);

  if (action !== "create") {
    if (!id) return NextResponse.json({ error: "Entry id is required" }, { status: 422 });
    const owned = await ownsEntry(category, id, memory.id);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "delete" && id) {
    if (category === "experience") {
      const usageCount = await db.resumeBullet.count({ where: { bullet: { workHistoryId: id } } });
      if (usageCount > 0) {
        return NextResponse.json({ error: "This experience is used in a saved resume. Remove it from that resume before deleting the source evidence." }, { status: 409 });
      }
    }
    await deleteEntry(category, id);
    return NextResponse.json({ success: true });
  }

  if (action === "verify" && id) {
    if (category !== "experience") return NextResponse.json({ error: "Verification is not available for this entry type yet" }, { status: 422 });
    await db.workHistory.update({ where: { id }, data: { verified: true, locked: true } });
    return NextResponse.json({ success: true });
  }

  const entryId = action === "create"
    ? await createEntry(category, memory.id, validatedData)
    : await updateEntry(category, id!, validatedData);

  return NextResponse.json({ success: true, id: entryId });
}

async function ownsEntry(category: z.infer<typeof categorySchema>, id: string, memoryId: string) {
  if (category === "experience") return !!(await db.workHistory.findFirst({ where: { id, careerMemoryId: memoryId }, select: { id: true } }));
  if (category === "education") return !!(await db.education.findFirst({ where: { id, careerMemoryId: memoryId }, select: { id: true } }));
  if (category === "skills") return !!(await db.skill.findFirst({ where: { id, careerMemoryId: memoryId }, select: { id: true } }));
  if (category === "certifications") return !!(await db.certification.findFirst({ where: { id, careerMemoryId: memoryId }, select: { id: true } }));
  return !!(await db.project.findFirst({ where: { id, careerMemoryId: memoryId }, select: { id: true } }));
}

async function createEntry(category: z.infer<typeof categorySchema>, memoryId: string, data: Record<string, unknown>) {
  if (category === "experience") {
    const current = data.current === true;
    const entry = await db.workHistory.create({ data: {
      careerMemoryId: memoryId, title: text(data.title, 180), company: text(data.company, 180),
      startDate: optionalDate(data.startDate)!, endDate: current ? null : optionalDate(data.endDate),
      current, location: text(data.location, 180) || null,
      sourceType: "MANUAL", verified: true, locked: true,
      bullets: { create: text(data.bullets, 4000).split("\n").map((v) => v.trim()).filter(Boolean).slice(0, 8).map((content) => ({ content, contentType: "USER_EDITED", metrics: content.match(/\d+(?:[.,]\d+)*[%$kKmMbBxX+]?/g) ?? [], keywords: [], locked: true })) },
    } }); return entry.id;
  }
  if (category === "education") {
    const entry = await db.education.create({ data: { careerMemoryId: memoryId, degree: text(data.title, 220), school: text(data.company, 220), graduationDate: optionalDate(data.date), expected: Boolean(data.expected), sourceType: "MANUAL" } }); return entry.id;
  }
  if (category === "skills") {
    const entry = await db.skill.create({ data: { careerMemoryId: memoryId, name: text(data.title, 140), category: text(data.company, 120) || null, qualifier: text(data.qualifier, 80) || null, sourceType: "MANUAL" } }); return entry.id;
  }
  if (category === "certifications") {
    const entry = await db.certification.create({ data: { careerMemoryId: memoryId, name: text(data.title, 220), issuer: text(data.company, 180) || null, year: Number(text(data.year, 4)) || null, sourceType: "MANUAL" } }); return entry.id;
  }
  const entry = await db.project.create({ data: { careerMemoryId: memoryId, name: text(data.title, 220), url: text(data.company, 500) || null, description: text(data.description, 2000) || null, technologies: text(data.technologies, 1000).split(",").map((v) => v.trim()).filter(Boolean).slice(0, 20), sourceType: "MANUAL" } }); return entry.id;
}

async function updateEntry(category: z.infer<typeof categorySchema>, id: string, data: Record<string, unknown>) {
  if (category === "experience") {
    const current = data.current === true;
    const bullets = text(data.bullets, 4000)
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 8);
    await db.$transaction(async (transaction) => {
      await transaction.workHistory.update({
        where: { id },
        data: {
          title: text(data.title, 180),
          company: text(data.company, 180),
          startDate: optionalDate(data.startDate)!,
          endDate: current ? null : optionalDate(data.endDate),
          current,
          location: text(data.location, 180) || null,
          locked: true,
        },
      });
      await transaction.bullet.deleteMany({
        where: {
          workHistoryId: id,
          contentType: "USER_EDITED",
          usedInResumes: { none: {} },
        },
      });
      if (bullets.length > 0) {
        await transaction.bullet.createMany({
          data: bullets.map((content) => ({
            workHistoryId: id,
            content,
            contentType: "USER_EDITED",
            metrics: content.match(/\d+(?:[.,]\d+)*[%$kKmMbBxX+]?/g) ?? [],
            keywords: [],
            locked: true,
          })),
        });
      }
    });
  } else if (category === "education") await db.education.update({ where: { id }, data: { degree: text(data.title, 220), school: text(data.company, 220), graduationDate: optionalDate(data.date), expected: Boolean(data.expected) } });
  else if (category === "skills") await db.skill.update({ where: { id }, data: { name: text(data.title, 140), category: text(data.company, 120) || null, qualifier: text(data.qualifier, 80) || null } });
  else if (category === "certifications") await db.certification.update({ where: { id }, data: { name: text(data.title, 220), issuer: text(data.company, 180) || null, year: Number(text(data.year, 4)) || null } });
  else await db.project.update({ where: { id }, data: { name: text(data.title, 220), url: text(data.company, 500) || null, description: text(data.description, 2000) || null, technologies: text(data.technologies, 1000).split(",").map((v) => v.trim()).filter(Boolean).slice(0, 20) } });
  return id;
}

async function deleteEntry(category: z.infer<typeof categorySchema>, id: string) {
  if (category === "experience") await db.workHistory.delete({ where: { id } });
  else if (category === "education") await db.education.delete({ where: { id } });
  else if (category === "skills") await db.skill.delete({ where: { id } });
  else if (category === "certifications") await db.certification.delete({ where: { id } });
  else await db.project.delete({ where: { id } });
}
