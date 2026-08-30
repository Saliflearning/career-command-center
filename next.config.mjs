import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withBotId } from "botid/next/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  // Skip ESLint during production builds — linting runs in the editor and CI.
  // Vercel treats all ESLint issues as hard errors; this avoids blocking deploys
  // on style warnings while still shipping correct, type-safe code.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Document parsers break when bundled by webpack - load them from
  // node_modules at runtime instead.
  serverExternalPackages: ["unpdf", "@napi-rs/canvas", "mammoth"],
};

export default withBotId(nextConfig);
