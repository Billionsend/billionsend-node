import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // The hand-written runtime. The generated types (src/generated) hold no runtime code; every
      // operation they describe is called at least once by test/coverage.test.ts.
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"],
      // `pnpm test:coverage` fails below these.
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
