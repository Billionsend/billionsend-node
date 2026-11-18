import { defineConfig } from "vitest/config";

// The live suite: `pnpm test:e2e` with BILLIONSEND_E2E_API_KEY set. Never part of `pnpm test`.
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
