import { test, expect } from "@playwright/test";
import { guardJwt } from "./helpers/auth-guard";
import { apiPost, apiDelete } from "./helpers/rate-limit";

test.describe("pending orders CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await guardJwt(page);
  });

  test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  });

  test("pending orders page loads and shows data", async ({ page }) => {
    await page.goto("/pending-orders");

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    const heading = page.locator("h1", { hasText: "Ordini in Attesa" });
    const emptyState = page.locator("h2", {
      hasText: "Nessun ordine in attesa",
    });

    await expect(heading.or(emptyState)).toBeVisible({ timeout: 15_000 });

    const hasOrders = await heading.isVisible();
    if (hasOrders) {
      await expect(
        page.locator("div", { hasText: /Creato:/ }).first(),
      ).toBeVisible();
    }
  });

  test("can create a pending order via API and see it in list", async ({
    page,
  }) => {
    await page.goto("/pending-orders");

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    const jwt = await page.evaluate(() =>
      localStorage.getItem("archibald_jwt"),
    );
    expect(jwt).toBeTruthy();

    const orderId = `e2e-test-${Date.now()}`;
    const customerName = `E2E Create ${Date.now()}`;

    const response = await apiPost(
      page,
      "/api/pending-orders",
      {
        orders: [
          {
            id: orderId,
            customerId: "e2e-test-cust-id",
            customerName,
            itemsJson: JSON.stringify([
              {
                articleCode: "E2E-ART-001",
                productName: "E2E Test Product",
                quantity: 1,
                price: 10,
                vat: 22,
                discount: 0,
              },
            ]),
            status: "pending",
            deviceId: "e2e-test-device",
          },
        ],
      },
      jwt!,
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    await page.reload();

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(
      page.locator("div", { hasText: customerName }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Cleanup: delete the created order
    await apiDelete(page, `/api/pending-orders/${orderId}`, jwt!);
  });

  test("can create and delete a pending order", async ({ page }) => {
    await page.goto("/pending-orders");

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    const jwt = await page.evaluate(() =>
      localStorage.getItem("archibald_jwt"),
    );
    expect(jwt).toBeTruthy();

    const orderId = `e2e-del-${Date.now()}`;
    const customerName = `E2E Delete ${Date.now()}`;

    const createResponse = await apiPost(
      page,
      "/api/pending-orders",
      {
        orders: [
          {
            id: orderId,
            customerId: "e2e-del-cust-id",
            customerName,
            itemsJson: JSON.stringify([
              {
                articleCode: "E2E-DEL-001",
                productName: "E2E Delete Product",
                quantity: 1,
                price: 10,
                vat: 22,
                discount: 0,
              },
            ]),
            status: "pending",
            deviceId: "e2e-test-device",
          },
        ],
      },
      jwt!,
    );

    expect(createResponse.status()).toBe(200);

    await page.reload();

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(
      page.locator("div", { hasText: customerName }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const deleteResponse = await apiDelete(
      page,
      `/api/pending-orders/${orderId}`,
      jwt!,
    );
    expect(deleteResponse.status()).toBe(200);

    await page.reload();

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    const orderLocator = page.locator(`text=${customerName}`);
    await expect(orderLocator).not.toBeVisible({ timeout: 10_000 });
  });
});
