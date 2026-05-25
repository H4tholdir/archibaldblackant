import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",

    // Integration tests can be slow - increase timeout
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 10000, // 10 seconds for beforeAll/afterAll

    // Locally PG_HOST=localhost comes from .env but no DB is running.
    // Force PG_HOST to empty so describe.skipIf(!process.env.PG_HOST) correctly
    // skips DB integration tests. On CI, DB_HOST is set explicitly by the pipeline.
    env: process.env.CI === 'true' ? {} : { PG_HOST: '' },

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
