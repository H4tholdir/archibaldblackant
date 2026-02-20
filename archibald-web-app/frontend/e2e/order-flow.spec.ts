import { test, expect } from "@playwright/test";

const TEST_ORDER_ID = `e2e-test-${Date.now()}`;
const TEST_CUSTOMER_NAME = "E2E Test Customer";

test.describe.serial("pending orders CRUD", () => {
  let createdOrderId: string;

  test("pending orders page loads and shows data", async ({ page }) => {
    await page.goto("/pending-orders", { waitUntil: "networkidle" });

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
    await page.goto("/pending-orders", { waitUntil: "networkidle" });

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    const jwt = await page.evaluate(() =>
      localStorage.getItem("archibald_jwt"),
    );
    expect(jwt).toBeTruthy();

    createdOrderId = TEST_ORDER_ID;

    const payload = {
      orders: [
        {
          id: createdOrderId,
          customerId: "e2e-test-cust-id",
          customerName: TEST_CUSTOMER_NAME,
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
    };

    const response = await page.request.post("/api/pending-orders", {
      data: payload,
      headers: { Authorization: `Bearer ${jwt}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    await page.goto("/pending-orders", { waitUntil: "networkidle" });

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(
      page.locator("div", { hasText: TEST_CUSTOMER_NAME }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("can delete a pending order", async ({ page }) => {
    await page.goto("/pending-orders", { waitUntil: "networkidle" });

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    await expect(
      page.locator("div", { hasText: TEST_CUSTOMER_NAME }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const jwt = await page.evaluate(() =>
      localStorage.getItem("archibald_jwt"),
    );
    expect(jwt).toBeTruthy();

    page.on("dialog", (dialog) => dialog.accept());

    const deleteResponse = await page.request.delete(
      `/api/pending-orders/${createdOrderId}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    expect(deleteResponse.status()).toBe(200);

    await page.goto("/pending-orders", { waitUntil: "networkidle" });

    await expect(
      page.getByText("Caricamento ordini in attesa..."),
    ).not.toBeVisible({ timeout: 30_000 });

    const orderLocator = page.locator(`text=${TEST_CUSTOMER_NAME}`);
    await expect(orderLocator).not.toBeVisible({ timeout: 10_000 });
  });
});
