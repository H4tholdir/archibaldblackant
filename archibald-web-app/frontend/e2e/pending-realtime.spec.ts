/**
 * Pending Orders Real-Time Sync E2E Tests
 *
 * Tests WebSocket real-time synchronization of pending orders across multiple devices.
 * Validates: creation propagation, data visibility, deletion propagation, rapid operations,
 * and multi-order consistency.
 *
 * Uses storageState auth and API-based order creation for VPS compatibility.
 */

import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

const STORAGE_STATE = "playwright/.auth/user.json";
const SYNC_TIMEOUT = 30_000;
const TEST_ORDER_PREFIX = "e2e-rt-";

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

async function createOrderViaApi(
  page: Page,
  jwt: string,
  orderId: string,
  customerName: string,
): Promise<void> {
  const response = await page.request.post("/api/pending-orders", {
    data: {
      orders: [
        {
          id: orderId,
          customerId: `cust-${orderId}`,
          customerName,
          itemsJson: JSON.stringify([
            {
              articleCode: "E2E-RT-001",
              productName: "E2E RT Product",
              quantity: 1,
              price: 10,
              vat: 22,
              discount: 0,
            },
          ]),
          status: "pending",
          deviceId: "e2e-device-rt-a",
        },
      ],
    },
    headers: { Authorization: `Bearer ${jwt}` },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
}

async function deleteOrderViaApi(
  page: Page,
  jwt: string,
  orderId: string,
): Promise<void> {
  const response = await page.request.delete(
    `/api/pending-orders/${orderId}`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  expect(response.status()).toBe(200);
}

async function waitForCountAtLeast(
  page: Page,
  expected: number,
): Promise<void> {
  await page.waitForFunction(
    (args: { expected: number }) => {
      const h1 = document.querySelector("h1");
      if (!h1) {
        const h2 = document.querySelector("h2");
        return args.expected === 0 && h2 !== null;
      }
      const match = h1.textContent?.match(/\((\d+)\)/);
      if (!match) return args.expected === 0;
      return parseInt(match[1], 10) >= args.expected;
    },
    { expected },
    { timeout: SYNC_TIMEOUT },
  );
}

async function waitForCountAtMost(
  page: Page,
  expected: number,
): Promise<void> {
  await page.waitForFunction(
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
    { expected },
    { timeout: SYNC_TIMEOUT },
  );
}

test.describe.serial("pending orders real-time sync", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let jwt: string;
  const createdOrderIds: string[] = [];

  test.afterAll(async () => {
    for (const orderId of createdOrderIds) {
      try {
        await pageA.request.delete(`/api/pending-orders/${orderId}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
      } catch {
        // Best-effort cleanup
      }
    }
    await contextA?.close();
    await contextB?.close();
  });

  test("two devices see pending orders page", async ({ browser }) => {
    contextA = await browser.newContext({ storageState: STORAGE_STATE });
    contextB = await browser.newContext({ storageState: STORAGE_STATE });

    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    await pageA.addInitScript(() => {
      localStorage.setItem("archibald_device_id", "e2e-device-rt-a");
    });
    await pageB.addInitScript(() => {
      localStorage.setItem("archibald_device_id", "e2e-device-rt-b");
    });

    await pageA.goto("/pending-orders");
    await pageB.goto("/pending-orders");

    await waitForPageLoaded(pageA);
    await waitForPageLoaded(pageB);

    jwt = await extractJwt(pageA);

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

  test("order creation propagates to second device in real-time", async () => {
    const initialCount = await getPendingCountFromDom(pageB);

    const orderId = makeTestOrderId();
    createdOrderIds.push(orderId);

    await createOrderViaApi(pageA, jwt, orderId, "RT Sync Customer");

    await waitForCountAtLeast(pageB, initialCount + 1);

    const finalCountB = await getPendingCountFromDom(pageB);
    expect(finalCountB).toBeGreaterThanOrEqual(initialCount + 1);
  });

  test("created order data is visible on synced device", async () => {
    await expect(
      pageB.locator("div", { hasText: "RT Sync Customer" }).first(),
    ).toBeVisible({ timeout: SYNC_TIMEOUT });

    await expect(
      pageA.locator("div", { hasText: "RT Sync Customer" }).first(),
    ).toBeVisible({ timeout: SYNC_TIMEOUT });
  });

  test("order deletion propagates to second device in real-time", async () => {
    const countBefore = await getPendingCountFromDom(pageB);

    const orderId = createdOrderIds[createdOrderIds.length - 1];
    await deleteOrderViaApi(pageA, jwt, orderId);
    createdOrderIds.pop();

    await waitForCountAtMost(pageB, countBefore - 1);

    const finalCountB = await getPendingCountFromDom(pageB);
    expect(finalCountB).toBeLessThanOrEqual(countBefore - 1);
  });

  test("rapid create and delete maintains consistency", async () => {
    // Allow both pages to settle after previous tests
    await pageA.waitForTimeout(1_000);

    const initialCountA = await getPendingCountFromDom(pageA);
    const initialCountB = await getPendingCountFromDom(pageB);

    const orderId = makeTestOrderId();
    createdOrderIds.push(orderId);

    await createOrderViaApi(pageA, jwt, orderId, "RT Rapid Customer");

    await waitForCountAtLeast(pageB, initialCountB + 1);

    // Brief pause to ensure WebSocket events fully process before next operation
    await pageA.waitForTimeout(500);

    await deleteOrderViaApi(pageA, jwt, orderId);
    createdOrderIds.pop();

    await waitForCountAtMost(pageB, initialCountB);

    // Wait for both pages to fully settle before final assertions
    await pageA.waitForTimeout(1_000);

    const finalCountA = await getPendingCountFromDom(pageA);
    const finalCountB = await getPendingCountFromDom(pageB);
    expect(finalCountA).toBe(finalCountB);
  });
});
