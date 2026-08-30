import { NextRequest, NextResponse } from "next/server";
import { checkBotId } from "botid/server";
import { extractResumeText } from "@/agents/intake";
import {
  buildPublicResumeScan,
  PublicScanInputError,
  PUBLIC_SCAN_MAX_FILE_BYTES,
  validatePublicJobDescription,
  validatePublicResumeText,
  validatePublicUpload,
} from "@/lib/resume/public-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAutomatedRequest() {
  // BotId is a Vercel runtime control. Local and self-hosted development must
  // remain usable when the Vercel request context is unavailable.
  if (!process.env.VERCEL) return false;
  return (await checkBotId()).isBot;
}

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
  });
}

export async function POST(request: NextRequest) {
  try {
    if (await isAutomatedRequest()) {
      return json({ error: "Automated scan requests are not allowed." }, 403);
    }

    const contentType = request.headers.get("content-type") ?? "";
    let resumeText: string;
    let jobDescription: string;

    if (contentType.includes("application/json")) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ error: "Request body must be a JSON object." }, 400);
      }
      const record = body as Record<string, unknown>;
      resumeText = validatePublicResumeText(record.resumeText);
      jobDescription = validatePublicJobDescription(record.jobDescription);
    } else if (contentType.includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return json({ error: "Scan body must be valid form data." }, 400);
      }
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "Choose a resume file." }, 400);
      if (file.size > PUBLIC_SCAN_MAX_FILE_BYTES) {
        return json({ error: "Resume files must be 5 MB or smaller." }, 413);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const kind = validatePublicUpload(file, bytes);
      jobDescription = validatePublicJobDescription(form.get("jobDescription"));
      try {
        resumeText = validatePublicResumeText(await extractResumeText(bytes, kind));
      } catch (error) {
        if (error instanceof PublicScanInputError) throw error;
        console.error("public_resume_scan_parse_failed");
        return json(
          { error: "We could not read this file. Try paste mode or another document." },
          422
        );
      }
    } else {
      return json({ error: "Send JSON or multipart form data." }, 415);
    }

    return json(buildPublicResumeScan(resumeText, jobDescription));
  } catch (error) {
    if (error instanceof PublicScanInputError) return json({ error: error.message }, error.status);
    console.error("public_resume_scan_failed");
    return json({ error: "The scan could not be completed. Please try again." }, 500);
  }
}
