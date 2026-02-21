import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.e2e.spec.ts"],

    // Integration tests can be slow - increase timeout
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 10000, // 10 seconds for beforeAll/afterAll

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
