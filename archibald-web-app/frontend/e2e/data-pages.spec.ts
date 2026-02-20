import { test, expect } from "@playwright/test";

test.describe("data pages smoke tests", () => {
  test("customers page loads with data", async ({ page }) => {
    await page.goto("/customers");

    await expect(
      page.getByText("Caricamento clienti..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    const errorBanner = page.locator('[style*="background-color: #fee2e2"]');
    await expect(errorBanner).not.toBeVisible();
  });

  test("products page loads with data", async ({ page }) => {
    await page.goto("/products");

    await expect(
      page.getByText("Caricamento prodotti..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    const errorBanner = page.locator('[style*="background-color: #fee2e2"]');
    await expect(errorBanner).not.toBeVisible();
  });

  test("order history page loads", async ({ page }) => {
    await page.goto("/orders");

    await expect(
      page.getByText("Caricamento ordini..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    const errorBanner = page.locator('[style*="background-color: #fee2e2"]');
    await expect(errorBanner).not.toBeVisible();
  });

  test("dashboard loads with widgets", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText("Caricamento dashboard..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    const errorBanner = page.locator('[style*="background-color: #fee2e2"]');
    await expect(errorBanner).not.toBeVisible();
  });

  test("API health check responds", async ({ page }) => {
    const response = await page.request.get("/api/health");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});
