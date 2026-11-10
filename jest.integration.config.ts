// ---------------------------------------------------------------------------
// Jest Configuration — integration tests
//
// These tests exercise the REAL runtime of libraries the unit suite mocks
// (unpdf / PDF.js for text + image extraction in agents/visual-qa). That
// runtime uses dynamic import() inside the jest VM, which Node only allows
// under --experimental-vm-modules. They are therefore run separately, via:
//
//   npm run test:integration
//
// (which invokes jest with that flag), and are excluded from the default
// `npm test` suite by testPathIgnorePatterns in jest.config.ts.
// ---------------------------------------------------------------------------

import type { Config } from "jest";

const config: Config = {
  displayName: "integration",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/**/*.integration.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
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
  testTimeout: 60_000,
};

export default config;
