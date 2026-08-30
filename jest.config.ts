// ---------------------------------------------------------------------------
// Jest Configuration
//
// Supports TypeScript via ts-jest with two separate test environments:
//   - unit: jsdom (for React component tests and agent logic)
//   - e2e:  node  (for pipeline integration tests with no browser APIs)
//
// Module name mapping mirrors the tsconfig paths so that "@/", "@agents/",
// and "@lib/" imports resolve correctly inside tests.
// ---------------------------------------------------------------------------

import type { Config } from "jest";

const config: Config = {
  // ---------------------------------------------------------------------------
  // Project definitions — one per test environment
  // ---------------------------------------------------------------------------
  projects: [
    // ------------------------------------------------------------------
    // Unit tests — hallucination detection, verifier, visual-regression
    // Runs in jsdom so React hooks can be used if needed.
    // ------------------------------------------------------------------
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/tests/hallucination/**/*.test.ts",
        "<rootDir>/tests/visual-regression/**/*.test.ts",
        "<rootDir>/agents/**/*.test.ts",
        "<rootDir>/lib/**/*.test.ts",
      ],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              // Allow importing .ts files that use ESM-style module resolution
              module: "CommonJS",
              // Keep strict mode
              strict: true,
              // Match Next.js tsconfig essentials
              esModuleInterop: true,
              resolveJsonModule: true,
              skipLibCheck: true,
              // Path aliases are handled by moduleNameMapper below
              paths: {},
            },
          },
        ],
      },
      moduleNameMapper: {
        // Resolve "@/..." to project root (mirrors tsconfig "@/*": ["./*"])
        "^@/(.*)$": "<rootDir>/$1",
        // Resolve "@agents/..." to agents directory
        "^@agents/(.*)$": "<rootDir>/agents/$1",
        // Resolve "@lib/..." to lib directory
        "^@lib/(.*)$": "<rootDir>/lib/$1",
        // Resolve "@tests/..." to tests directory
        "^@tests/(.*)$": "<rootDir>/tests/$1",
      },
      // Clear mock state between tests
      clearMocks: true,
      resetMocks: false,
      restoreMocks: true,
    },

    // ------------------------------------------------------------------
    // E2E / Integration tests — pipeline state machine, service mocks
    // Runs in node so fetch, Buffer, etc. behave correctly.
    // ------------------------------------------------------------------
    {
      displayName: "e2e",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/tests/e2e/**/*.test.ts",
      ],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "CommonJS",
              strict: true,
              esModuleInterop: true,
              resolveJsonModule: true,
              skipLibCheck: true,
              paths: {},
            },
          },
        ],
      },
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^@agents/(.*)$": "<rootDir>/agents/$1",
        "^@lib/(.*)$": "<rootDir>/lib/$1",
        "^@tests/(.*)$": "<rootDir>/tests/$1",
      },
      clearMocks: true,
      resetMocks: false,
      restoreMocks: true,
      // Longer timeout for e2e tests that simulate multi-stage pipelines
      testTimeout: 30_000,
    },
  ],

  // ---------------------------------------------------------------------------
  // Global coverage configuration (run with --coverage flag)
  // ---------------------------------------------------------------------------
  collectCoverageFrom: [
    "agents/**/*.ts",
    "lib/**/*.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageReporters: ["text", "lcov", "html"],
  coverageDirectory: "coverage",

  // ---------------------------------------------------------------------------
  // Global options
  // ---------------------------------------------------------------------------

  // Show individual test names in verbose mode
  verbose: true,

  // Watch mode ignores generated files
  watchPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/coverage/",
  ],
};

export default config;
