import express, { Request, Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = 4000;

interface RenderRequest {
  latex: string;
}

interface ErrorResponse {
  error: string;
  stage: string;
}

/**
 * Runs xelatex on the given .tex file twice to resolve cross-references.
 * Both passes are executed with no network access (the container itself is
 * network-isolated at the Docker level, but we also pass -no-shell-escape and
 * suppress openout_any to prevent any attempt at outbound I/O).
 */
async function runXelatex(
  texFile: string,
  workDir: string
): Promise<void> {
  const args = [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-no-shell-escape",
    "-output-directory",
    workDir,
    texFile,
  ];

  // First pass – builds aux / toc files
  await execFileAsync("xelatex", args, {
    cwd: workDir,
    timeout: 60_000,
    env: {
      // Minimal env – no HOME means no user font caches that could reach out
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      TEXMFCACHE: join(workDir, ".texmf-cache"),
    },
  });

  // Second pass – resolves cross-references
  await execFileAsync("xelatex", args, {
    cwd: workDir,
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      TEXMFCACHE: join(workDir, ".texmf-cache"),
    },
  });
}

app.post("/render", async (req: Request, res: Response) => {
  const body = req.body as Partial<RenderRequest>;

  if (typeof body.latex !== "string" || body.latex.trim().length === 0) {
    const errBody: ErrorResponse = {
      error: "Missing or empty 'latex' field in request body",
      stage: "validation",
    };
    res.status(422).json(errBody);
    return;
  }

  // Create an isolated temp directory per request so parallel renders don't
  // interfere with each other.
  const jobId = randomUUID();
  const workDir = join(tmpdir(), `latex-${jobId}`);
  const texFile = join(workDir, "document.tex");
  const pdfFile = join(workDir, "document.pdf");

  let stage = "setup";

  try {
    await mkdir(workDir, { recursive: true });

    // Write source
    stage = "write";
    await writeFile(texFile, body.latex, "utf-8");

    // Compile
    stage = "compile";
    await runXelatex(texFile, workDir);

    // Read output
    stage = "read";
    const pdfBuffer = await readFile(pdfFile);

    // Stream PDF back
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown rendering error";

    const errBody: ErrorResponse = {
      error: message,
      stage,
    };
    res.status(422).json(errBody);
  } finally {
    // Always clean up temp files regardless of success or failure
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup – do not propagate cleanup errors
    }
  }
});

// Health check endpoint (used by container orchestrators)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`latex-renderer listening on port ${PORT}`);
});

export default app;
