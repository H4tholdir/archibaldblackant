import path from "node:path";
import { test as setup, expect } from "@playwright/test";

const authFile = path.join(__dirname, "../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const username = process.env.TEST_USER_USERNAME;
  const password = process.env.TEST_USER_PASSWORD;

  if (!username) {
    throw new Error("TEST_USER_USERNAME env var required for E2E tests");
  }
  if (!password) {
    throw new Error("TEST_USER_PASSWORD env var required for E2E tests");
  }

  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");

  await page.waitForSelector("#username", { timeout: 30_000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  await page.waitForFunction(
    () => localStorage.getItem("archibald_jwt") !== null,
    { timeout: 60_000 },
  );

  await expect(page.locator("nav")).toBeVisible({ timeout: 10_000 });

  await page.context().storageState({ path: authFile });
});
