import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.e2e.spec.ts"],
    testTimeout: 600_000, // 10 minutes per test
    hookTimeout: 60_000, // 1 minute for beforeAll/afterAll
    sequence: {
      concurrent: false,
    },
  },
});
