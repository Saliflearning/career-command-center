#!/usr/bin/env node
// Production-bundle smoke test for resume PDF rendering.
//
// Unit and integration tests run the source through Jest, which resolves
// modules differently from the production bundle. Two real failures were only
// visible in the built server (a default import that the bundler resolved to
// undefined, and React elements created by a different React than the PDF
// reconciler's). This script closes that gap: it starts the already-built
// server (`next build` must have run) and calls GET /api/internal/render-check,
// which renders a fixed sample through the real dispatcher and visual gate.
//
// It checks three things:
//   1. flag on  -> the react-pdf engine renders and passes the gate
//   2. flag off -> the legacy engine renders and passes the gate
//   3. self-test switch off -> the route answers 404
//
// Usage: node scripts/render-selftest-smoke.mjs

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.RENDER_SMOKE_PORT ?? 3477);
const ENDPOINT = `http://127.0.0.1:${PORT}/api/internal/render-check`;
const STARTUP_ATTEMPTS = 60;

function serverEnv({ engine, selfTest }) {
  const env = { ...process.env };
  env.NEXTAUTH_SECRET ??= "render-smoke-placeholder";
  env.NEXTAUTH_URL ??= `http://127.0.0.1:${PORT}`;
  if (selfTest) env.RESUME_RENDER_SELFTEST = "1";
  else delete env.RESUME_RENDER_SELFTEST;
  if (engine === "react-pdf") env.RESUME_RENDER_ENGINE = "react-pdf";
  else delete env.RESUME_RENDER_ENGINE;
  return env;
}

async function withServer(options, run) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    { env: serverEnv(options), stdio: ["ignore", "pipe", "pipe"] }
  );
  let log = "";
  server.stdout.on("data", (chunk) => { log += chunk; });
  server.stderr.on("data", (chunk) => { log += chunk; });
  const exited = new Promise((resolve) => server.once("exit", resolve));

  try {
    let response = null;
    for (let attempt = 0; attempt < STARTUP_ATTEMPTS && !response; attempt += 1) {
      if (server.exitCode !== null) {
        throw new Error(`server exited early with code ${server.exitCode}\n${log}`);
      }
      try {
        response = await fetch(ENDPOINT, { signal: AbortSignal.timeout(45_000) });
      } catch {
        await sleep(1000);
      }
    }
    if (!response) throw new Error(`server never answered on port ${PORT}\n${log}`);
    return await run(response);
  } finally {
    server.kill();
    await Promise.race([exited, sleep(10_000)]);
  }
}

async function expectEngine(engine) {
  await withServer({ engine, selfTest: true }, async (response) => {
    const body = await response.json();
    const problems = [];
    if (response.status !== 200) problems.push(`HTTP ${response.status}`);
    if (body.ok !== true) problems.push(`ok=${body.ok}`);
    if (body.engineDetected !== engine) problems.push(`engineDetected=${body.engineDetected}`);
    if (body.pageCount !== 1) problems.push(`pageCount=${body.pageCount}`);
    if (body.gate?.passed !== true) problems.push("visual gate did not pass");
    if (problems.length > 0) {
      throw new Error(
        `${engine} engine failed the render self-test: ${problems.join(", ")}\n${JSON.stringify(body, null, 2)}`
      );
    }
    console.log(
      `ok  ${engine.padEnd(9)} 1 page, density=${body.density}, min font ${body.gate.minFontSizePt}pt, gate passed (${body.durationMs} ms)`
    );
  });
}

async function expectDisabled() {
  await withServer({ engine: "canvas", selfTest: false }, async (response) => {
    if (response.status !== 404) {
      throw new Error(`self-test route answered HTTP ${response.status} while disabled; expected 404`);
    }
    console.log("ok  disabled  route answers 404 without RESUME_RENDER_SELFTEST=1");
  });
}

try {
  await expectEngine("react-pdf");
  await expectEngine("canvas");
  await expectDisabled();
  console.log("Render self-test smoke passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
