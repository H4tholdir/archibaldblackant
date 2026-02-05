/**
 * Multi-Device E2E Test Helpers
 *
 * Utilities for testing real-time sync across multiple browser contexts.
 * Simulates Device A and Device B simultaneously with different deviceIds.
 *
 * Phase 34: E2E Testing & Multi-Device Validation
 */

import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Device context with browser context, page, and deviceId
 */
export interface DeviceContext {
  context: BrowserContext;
  page: Page;
  deviceId: string;
  token: string;
}

/**
 * Create a browser context with unique deviceId in localStorage
 */
export async function createDeviceContext(
  browser: Browser,
  deviceId: string,
  token: string,
): Promise<DeviceContext> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set auth token and deviceId in localStorage
  await page.addInitScript(
    ({ deviceId, token }) => {
      localStorage.setItem("archibald_device_id", deviceId);
      localStorage.setItem("archibald_jwt", token);
    },
    { deviceId, token },
  );

  return { context, page, deviceId, token };
}

/**
 * Setup two devices for multi-device testing
 */
export async function setupTwoDevices(
  browser: Browser,
  token: string,
): Promise<[DeviceContext, DeviceContext]> {
  const deviceA = await createDeviceContext(browser, "device-a-test", token);
  const deviceB = await createDeviceContext(browser, "device-b-test", token);

  return [deviceA, deviceB];
}

/**
 * Wait for WebSocket connection to be established and ready
 */
export async function waitForRealtimeSync(
  page: Page,
  timeout = 5000,
): Promise<void> {
  // Wait for WebSocket connection indicator or data-testid attribute
  await page.waitForFunction(
    () => {
      // Check if WebSocket is connected by looking for connection state
      const wsState = (window as any).__wsState;
      return wsState === "connected" || wsState === undefined;
    },
    { timeout },
  );

  // Add small delay for subscription initialization
  await page.waitForTimeout(500);
}

/**
 * Measure sync latency between two devices
 */
export async function measureLatency(
  deviceA: Page,
  deviceB: Page,
  action: () => Promise<void>,
  verifySync: () => Promise<void>,
): Promise<number> {
  const startTime = Date.now();

  // Perform action on Device A
  await action();

  // Wait for sync on Device B
  await verifySync();

  const endTime = Date.now();
  const latency = endTime - startTime;

  console.log(`[Latency] Sync completed in ${latency}ms`);

  return latency;
}

/**
 * Login helper for test user
 */
export async function loginTestUser(
  page: Page,
  email: string,
  password: string,
): Promise<string> {
  // Navigate to login page
  await page.goto("/login");

  // Fill login form
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to home/dashboard
  await page.waitForURL("/", { timeout: 5000 });

  // Extract JWT token from localStorage
  const token = await page.evaluate(() => {
    return localStorage.getItem("archibald_jwt") || "";
  });

  expect(token).toBeTruthy();
  return token;
}

/**
 * Wait for element to appear on page
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 5000,
): Promise<void> {
  await page.waitForSelector(selector, { state: "visible", timeout });
}

/**
 * Wait for element to disappear from page
 */
export async function waitForElementRemoved(
  page: Page,
  selector: string,
  timeout = 5000,
): Promise<void> {
  await page.waitForSelector(selector, { state: "detached", timeout });
}

/**
 * Simulate offline mode for a device
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

/**
 * Restore online mode for a device
 */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}

/**
 * Get IndexedDB draft orders count
 */
export async function getDraftOrdersCount(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const dbName = "ArchibaldDB";
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["draftOrders"], "readonly");
        const store = transaction.objectStore("draftOrders");
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      };
    });
  });
}

/**
 * Get IndexedDB pending orders count
 */
export async function getPendingOrdersCount(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const dbName = "ArchibaldDB";
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["pendingOrders"], "readonly");
        const store = transaction.objectStore("pendingOrders");
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      };
    });
  });
}

/**
 * Check if draft order exists in IndexedDB by ID
 */
export async function draftExists(
  page: Page,
  draftId: string,
): Promise<boolean> {
  return await page.evaluate(async (id) => {
    const dbName = "ArchibaldDB";
    return new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["draftOrders"], "readonly");
        const store = transaction.objectStore("draftOrders");
        const getRequest = store.get(id);
        getRequest.onsuccess = () => resolve(!!getRequest.result);
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }, draftId);
}

/**
 * Check if pending order exists in IndexedDB by ID
 */
export async function pendingExists(
  page: Page,
  pendingId: string,
): Promise<boolean> {
  return await page.evaluate(async (id) => {
    const dbName = "ArchibaldDB";
    return new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["pendingOrders"], "readonly");
        const store = transaction.objectStore("pendingOrders");
        const getRequest = store.get(id);
        getRequest.onsuccess = () => resolve(!!getRequest.result);
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }, pendingId);
}
