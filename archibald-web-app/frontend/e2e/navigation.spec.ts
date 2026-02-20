import { test, expect } from "@playwright/test";

const routes = [
  { path: "/", name: "Dashboard", verify: "nav" },
  { path: "/pending-orders", name: "Pending Orders", verify: "main" },
  { path: "/orders", name: "Order History", verify: "main" },
  { path: "/customers", name: "Customers", verify: "main" },
  { path: "/products", name: "Products", verify: "main" },
  { path: "/profile", name: "Profile", verify: "main" },
  { path: "/order", name: "Order Form", verify: "main" },
] as const;

test.describe("all main pages load without errors", () => {
  for (const route of routes) {
    test(`${route.name} (${route.path}) loads successfully`, async ({
      page,
    }) => {
      await page.goto(route.path, { waitUntil: "networkidle" });

      await expect(page.locator("nav")).toBeVisible({ timeout: 30_000 });

      if (route.verify === "main") {
        await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      }
    });
  }
});

test.describe("navigation links work from dashboard", () => {
  test("Ordini in Attesa link navigates to /pending-orders", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 30_000 });

    await page.locator("a", { hasText: "Ordini in Attesa" }).click();

    await page.waitForURL("**/pending-orders");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  });

  test("Clienti link navigates to /customers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 30_000 });

    await page.locator("a", { hasText: "Clienti" }).click();

    await page.waitForURL("**/customers");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  });

  test("Articoli link navigates to /products", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 30_000 });

    await page.locator("a", { hasText: "Articoli" }).click();

    await page.waitForURL("**/products");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("logout flow", () => {
  test("logout redirects to login", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 30_000 });

    const hasJwtBefore = await page.evaluate(
      () => localStorage.getItem("archibald_jwt") !== null,
    );
    expect(hasJwtBefore).toBe(true);

    page.on("dialog", (dialog) => dialog.accept());

    await page.locator("button", { hasText: "Logout" }).click();

    await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });

    const hasJwtAfter = await page.evaluate(
      () => localStorage.getItem("archibald_jwt") !== null,
    );
    expect(hasJwtAfter).toBe(false);
  });
});
