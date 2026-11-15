/**
 * GET /api/internal/render-check
 *
 * Deployment self-test for resume PDF rendering. Disabled (404) unless the
 * deployment sets RESUME_RENDER_SELFTEST=1. When enabled it renders a fixed
 * built-in sample through the real dispatcher and visual gate and reports the
 * verdict. It accepts no resume input and touches no database, auth, or storage.
 *
 *   ?format=pdf  returns the rendered PDF
 *   ?format=png  returns the visual gate's screenshot
 */
import { NextRequest, NextResponse } from "next/server";
import { isRenderSelfTestEnabled, runRenderSelfTest } from "@/lib/export/render-selftest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  if (!isRenderSelfTestEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { summary, pdf, screenshot } = await runRenderSelfTest();
    const format = request.nextUrl.searchParams.get("format");

    if (format === "pdf") {
      return new NextResponse(new Uint8Array(pdf), {
        headers: { ...NO_STORE, "Content-Type": "application/pdf" },
      });
    }
    if (format === "png" && screenshot.length > 0) {
      return new NextResponse(new Uint8Array(screenshot), {
        headers: { ...NO_STORE, "Content-Type": "image/png" },
      });
    }
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      { status: 500, headers: NO_STORE }
    );
  }
}
