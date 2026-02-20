import { test, expect } from "@playwright/test";

test.describe("login flow", () => {
  test("authenticated user sees dashboard", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    const loginModal = page.locator(".login-modal");
    await expect(loginModal).not.toBeVisible();

    const hasJwt = await page.evaluate(
      () => localStorage.getItem("archibald_jwt") !== null,
    );
    expect(hasJwt).toBe(true);
  });

  test("login form works with valid credentials", async ({ browser }) => {
    const username = process.env.TEST_USER_USERNAME;
    const password = process.env.TEST_USER_PASSWORD;

    if (!username || !password) {
      throw new Error(
        "TEST_USER_USERNAME and TEST_USER_PASSWORD env vars required",
      );
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.addInitScript(() => localStorage.clear());
      await page.goto("/");

      await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });

      await page.fill("#username", username);
      await page.fill("#password", password);
      await page.click('button[type="submit"]');

      await page.waitForFunction(
        () => localStorage.getItem("archibald_jwt") !== null,
        { timeout: 60_000 },
      );

      await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("login form shows error for invalid credentials", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.addInitScript(() => localStorage.clear());
      await page.goto("/");

      await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });

      await page.fill("#username", "invalid_user_test");
      await page.fill("#password", "wrong_password_test");
      await page.click('button[type="submit"]');

      await expect(page.locator(".error-message")).toBeVisible({
        timeout: 60_000,
      });

      await expect(page.locator("#username")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
