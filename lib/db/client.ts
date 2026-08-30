import { PrismaClient } from "@prisma/client";

// Extend globalThis to hold the Prisma singleton across hot reloads in Next.js dev
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// Reuse the existing instance in development to avoid exhausting the connection pool
// during hot module replacement. In production a fresh client is always created once.
export const db: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
