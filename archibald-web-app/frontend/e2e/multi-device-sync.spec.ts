import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

const STORAGE_STATE = "playwright/.auth/user.json";
const TEST_ORDER_PREFIX = "e2e-sync-";

function makeTestOrderId() {
  return `${TEST_ORDER_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function extractJwt(page: Page): Promise<string> {
  const jwt = await page.evaluate(() =>
    localStorage.getItem("archibald_jwt"),
  );
  expect(jwt).toBeTruthy();
  return jwt!;
}

async function waitForPageLoaded(page: Page) {
  await expect(
    page.getByText("Caricamento ordini in attesa..."),
  ).not.toBeVisible({ timeout: 30_000 });
}

function getHeadingOrEmptyState(page: Page) {
  const heading = page.locator("h1", { hasText: "Ordini in Attesa" });
  const emptyState = page.locator("h2", {
    hasText: "Nessun ordine in attesa",
  });
  return { heading, emptyState };
}

async function getPendingCountFromDom(page: Page): Promise<number> {
  const { heading, emptyState } = getHeadingOrEmptyState(page);

  if (await emptyState.isVisible()) return 0;

  const text = await heading.textContent();
  const match = text?.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

test.describe.serial("multi-device WebSocket sync", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let createdOrderId: string;
  let jwt: string;

  test.afterAll(async () => {
    if (createdOrderId && jwt) {
      try {
        await pageA.request.delete(`/api/pending-orders/${createdOrderId}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
      } catch {
        // Best-effort cleanup
      }
    }

    await contextA?.close();
    await contextB?.close();
  });

  test("two devices see pending orders list", async ({ browser }) => {
    contextA = await browser.newContext({ storageState: STORAGE_STATE });
    contextB = await browser.newContext({ storageState: STORAGE_STATE });

    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    await pageA.addInitScript(() => {
      localStorage.setItem("archibald_device_id", "e2e-device-a");
    });
    await pageB.addInitScript(() => {
      localStorage.setItem("archibald_device_id", "e2e-device-b");
    });

    await pageA.goto("/pending-orders");
    await pageB.goto("/pending-orders");

    await waitForPageLoaded(pageA);
    await waitForPageLoaded(pageB);

    const { heading: headingA, emptyState: emptyA } =
      getHeadingOrEmptyState(pageA);
    const { heading: headingB, emptyState: emptyB } =
      getHeadingOrEmptyState(pageB);

    await expect(headingA.or(emptyA)).toBeVisible({ timeout: 15_000 });
    await expect(headingB.or(emptyB)).toBeVisible({ timeout: 15_000 });

    const countA = await getPendingCountFromDom(pageA);
    const countB = await getPendingCountFromDom(pageB);
    expect(countA).toBe(countB);
  });

  test("order created on device A appears on device B via WebSocket", async () => {
    jwt = await extractJwt(pageA);
    const initialCount = await getPendingCountFromDom(pageB);

    createdOrderId = makeTestOrderId();

    const payload = {
      orders: [
        {
          id: createdOrderId,
          customerId: "e2e-sync-cust-id",
          customerName: "E2E Sync Test Customer",
          itemsJson: JSON.stringify([
            {
              articleCode: "E2E-SYNC-001",
              productName: "E2E Sync Product",
              quantity: 1,
              price: 10,
              vat: 22,
              discount: 0,
            },
          ]),
          status: "pending",
          deviceId: "e2e-device-a",
        },
      ],
    };

    const response = await pageA.request.post("/api/pending-orders", {
      data: payload,
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const expectedCount = initialCount + 1;

    await pageB.waitForFunction(
      (args: { expected: number }) => {
        const h1 = document.querySelector("h1");
        if (!h1) return false;
        const match = h1.textContent?.match(/\((\d+)\)/);
        if (!match) return false;
        return parseInt(match[1], 10) >= args.expected;
      },
      { expected: expectedCount },
      { timeout: 15_000 },
    );

    const updatedCount = await getPendingCountFromDom(pageB);
    expect(updatedCount).toBeGreaterThanOrEqual(expectedCount);
  });

  test("order deleted on device A disappears from device B", async () => {
    const countBeforeDelete = await getPendingCountFromDom(pageB);

    const deleteResponse = await pageA.request.delete(
      `/api/pending-orders/${createdOrderId}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    expect(deleteResponse.status()).toBe(200);

    const expectedCount = countBeforeDelete - 1;

    await pageB.waitForFunction(
      (args: { expected: number }) => {
        const h1 = document.querySelector("h1");
        if (!h1) {
          const h2 = document.querySelector("h2");
          return args.expected === 0 && h2 !== null;
        }
        const match = h1.textContent?.match(/\((\d+)\)/);
        if (!match) return args.expected === 0;
        return parseInt(match[1], 10) <= args.expected;
      },
      { expected: expectedCount },
      { timeout: 15_000 },
    );

    const finalCount = await getPendingCountFromDom(pageB);
    expect(finalCount).toBeLessThanOrEqual(expectedCount);

    createdOrderId = "";
  });
});
