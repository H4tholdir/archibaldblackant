import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 120_000,

  expect: {
    timeout: 30_000,
  },

  use: {
    baseURL: process.env.BASE_URL || "https://formicanera.com",
    trace: "on",
    screenshot: "on",
    headless: true,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
