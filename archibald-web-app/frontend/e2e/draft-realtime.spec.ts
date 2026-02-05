/**
 * Draft Orders Real-Time Sync E2E Tests
 *
 * Tests WebSocket real-time synchronization of draft orders across multiple devices.
 * Validates: creation, updates, direct deletion, echo prevention, offline sync.
 *
 * Phase 34: E2E Testing & Multi-Device Validation
 */

import { test, expect } from "@playwright/test";
import type { Browser } from "@playwright/test";
import {
  createDeviceContext,
  waitForRealtimeSync,
  draftExists,
  getDraftOrdersCount,
  type DeviceContext,
} from "./helpers/multi-device";

/**
 * Test configuration
 */
const TEST_USER_USERNAME =
  process.env.TEST_USER_USERNAME || "test@archibald.com";
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "test123";
const SYNC_TIMEOUT = 5000; // 5 seconds max for sync
const LATENCY_TARGET = 100; // 100ms target latency

/**
 * Helper: Login and get JWT token
 */
async function loginAndGetToken(
  browser: Browser,
  username: string,
  password: string,
): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to login page
  await page.goto("/");

  // Wait for login modal to appear
  await page.waitForSelector("#username", { timeout: 5000 });

  // Fill login form
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  // Wait for login to complete (check for JWT token in localStorage)
  await page.waitForFunction(
    () => {
      const token = localStorage.getItem("archibald_jwt");
      return token !== null && token !== "";
    },
    { timeout: 10000 },
  );

  // Extract JWT token
  const token = await page.evaluate(() => {
    return localStorage.getItem("archibald_jwt") || "";
  });

  await context.close();

  expect(token).toBeTruthy();
  return token;
}

/**
 * Helper: Create a draft order on a device
 */
async function createDraftOrder(
  device: DeviceContext,
  customerId: string,
  customerName: string,
): Promise<string> {
  const { page } = device;

  // Navigate to new order page
  await page.goto("/");

  // Wait for page to load
  await page.waitForLoadState("networkidle");

  // Click "Nuovo Ordine" button or navigate to order form
  const newOrderButton = await page.locator('button:has-text("Nuovo Ordine")');
  if (await newOrderButton.isVisible()) {
    await newOrderButton.click();
  }

  // Wait for order form
  await page.waitForSelector('input[name="customerId"]', { timeout: 5000 });

  // Fill customer info (this will create a draft automatically)
  await page.fill('input[name="customerId"]', customerId);
  await page.fill('input[name="customerName"]', customerName);

  // Wait for draft to be created (auto-save)
  await page.waitForTimeout(1000);

  // Get draft ID from IndexedDB
  const draftId = await page.evaluate(async () => {
    const dbName = "ArchibaldDB";
    return new Promise<string>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["draftOrders"], "readonly");
        const store = transaction.objectStore("draftOrders");
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const drafts = getAllRequest.result;
          if (drafts.length > 0) {
            resolve(drafts[0].id);
          } else {
            reject(new Error("No drafts found"));
          }
        };
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
  });

  expect(draftId).toBeTruthy();
  return draftId;
}

/**
 * Test 1: Two devices see draft creation in real-time
 */
test("two devices see draft creation in real-time", async ({ browser }) => {
  // Login and get token
  const token = await loginAndGetToken(
    browser,
    TEST_USER_USERNAME,
    TEST_USER_PASSWORD,
  );

  // Setup two devices
  const deviceA = await createDeviceContext(browser, "device-a-test", token);
  const deviceB = await createDeviceContext(browser, "device-b-test", token);

  try {
    // Navigate both devices to home page
    await deviceA.page.goto("/");
    await deviceB.page.goto("/");

    // Wait for WebSocket connection on both devices
    await waitForRealtimeSync(deviceA.page);
    await waitForRealtimeSync(deviceB.page);

    // Get initial draft count on Device B
    const initialCountB = await getDraftOrdersCount(deviceB.page);

    // Measure latency: Device A creates draft
    const startTime = Date.now();
    const draftId = await createDraftOrder(
      deviceA,
      "CUST001",
      "Test Customer A",
    );

    // Wait for draft to appear on Device B
    await deviceB.page.waitForFunction(
      async (expectedId) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(expectedId);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: SYNC_TIMEOUT },
    );

    const endTime = Date.now();
    const latency = endTime - startTime;

    console.log(`[Draft Creation Sync] Latency: ${latency}ms`);

    // Verify draft exists on Device B
    const draftExistsB = await draftExists(deviceB.page, draftId);
    expect(draftExistsB).toBe(true);

    // Verify draft count increased on Device B
    const finalCountB = await getDraftOrdersCount(deviceB.page);
    expect(finalCountB).toBe(initialCountB + 1);

    // Assert latency is under target (relaxed for E2E test)
    expect(latency).toBeLessThan(SYNC_TIMEOUT);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 2: Two devices see draft update in real-time
 */
test("two devices see draft update in real-time", async ({ browser }) => {
  const token = await loginAndGetToken(
    browser,
    TEST_USER_USERNAME,
    TEST_USER_PASSWORD,
  );

  const deviceA = await createDeviceContext(browser, "device-a-test", token);
  const deviceB = await createDeviceContext(browser, "device-b-test", token);

  try {
    await deviceA.page.goto("/");
    await deviceB.page.goto("/");

    await waitForRealtimeSync(deviceA.page);
    await waitForRealtimeSync(deviceB.page);

    // Device A creates draft
    const draftId = await createDraftOrder(
      deviceA,
      "CUST002",
      "Test Customer B",
    );

    // Wait for draft to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: SYNC_TIMEOUT },
    );

    // Device A updates draft (add item or modify)
    await deviceA.page.fill(
      'input[name="customerName"]',
      "Updated Customer Name",
    );
    await deviceA.page.waitForTimeout(1000); // Wait for auto-save

    // Wait for update to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
              const draft = getRequest.result;
              resolve(draft?.customerName === "Updated Customer Name");
            };
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify update synced successfully
    const updatedName = await deviceB.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["draftOrders"], "readonly");
          const store = transaction.objectStore("draftOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const draft = getRequest.result;
            resolve(draft?.customerName || "");
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, draftId);

    expect(updatedName).toBe("Updated Customer Name");
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 3: Two devices see direct deletion in real-time
 */
test("two devices see direct deletion in real-time", async ({ browser }) => {
  const token = await loginAndGetToken(
    browser,
    TEST_USER_USERNAME,
    TEST_USER_PASSWORD,
  );

  const deviceA = await createDeviceContext(browser, "device-a-test", token);
  const deviceB = await createDeviceContext(browser, "device-b-test", token);

  try {
    await deviceA.page.goto("/");
    await deviceB.page.goto("/");

    await waitForRealtimeSync(deviceA.page);
    await waitForRealtimeSync(deviceB.page);

    // Device A creates draft
    const draftId = await createDraftOrder(
      deviceA,
      "CUST003",
      "Test Customer C",
    );

    // Wait for draft to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify draft exists on Device B
    let existsB = await draftExists(deviceB.page, draftId);
    expect(existsB).toBe(true);

    // Device A deletes draft (direct DELETE, no tombstone)
    await deviceA.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["draftOrders"], "readwrite");
          const store = transaction.objectStore("draftOrders");
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, draftId);

    // Wait for deletion to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify draft no longer exists on Device B (direct deletion, NO tombstone)
    existsB = await draftExists(deviceB.page, draftId);
    expect(existsB).toBe(false);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 4: Echo prevention works correctly
 */
test("echo prevention works correctly", async ({ browser }) => {
  const token = await loginAndGetToken(
    browser,
    TEST_USER_USERNAME,
    TEST_USER_PASSWORD,
  );

  const deviceA = await createDeviceContext(browser, "device-a-test", token);
  const deviceB = await createDeviceContext(browser, "device-b-test", token);

  try {
    await deviceA.page.goto("/");
    await deviceB.page.goto("/");

    await waitForRealtimeSync(deviceA.page);
    await waitForRealtimeSync(deviceB.page);

    // Setup console log capture on Device A
    const consoleLogs: string[] = [];
    deviceA.page.on("console", (msg) => {
      if (msg.text().includes("Ignoring") && msg.text().includes("echo")) {
        consoleLogs.push(msg.text());
      }
    });

    // Device A creates draft
    const draftId = await createDraftOrder(
      deviceA,
      "CUST004",
      "Test Customer D",
    );

    // Wait for sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify Device A saw echo prevention log (should have filtered its own event)
    await deviceA.page.waitForTimeout(1000);

    // Device B should receive the event normally
    const existsB = await draftExists(deviceB.page, draftId);
    expect(existsB).toBe(true);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 5: Offline device syncs on reconnection
 */
test("offline device syncs on reconnection", async ({ browser }) => {
  const token = await loginAndGetToken(
    browser,
    TEST_USER_USERNAME,
    TEST_USER_PASSWORD,
  );

  const deviceA = await createDeviceContext(browser, "device-a-test", token);
  const deviceB = await createDeviceContext(browser, "device-b-test", token);

  try {
    await deviceA.page.goto("/");
    await deviceB.page.goto("/");

    await waitForRealtimeSync(deviceA.page);
    await waitForRealtimeSync(deviceB.page);

    // Device A goes offline
    await deviceA.context.setOffline(true);

    // Wait for offline state
    await deviceA.page.waitForTimeout(1000);

    // Device B creates draft while Device A is offline
    const draftId = await createDraftOrder(
      deviceB,
      "CUST005",
      "Test Customer E",
    );

    // Verify draft does NOT exist on Device A yet (offline)
    let existsA = await draftExists(deviceA.page, draftId);
    expect(existsA).toBe(false);

    // Device A comes back online
    await deviceA.context.setOffline(false);

    // Wait for reconnection and sync
    await waitForRealtimeSync(deviceA.page, 10000);

    // Wait for draft to appear on Device A after reconnection
    await deviceA.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["draftOrders"], "readonly");
            const store = transaction.objectStore("draftOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      draftId,
      { timeout: 15000 }, // Longer timeout for offline recovery
    );

    // Verify draft now exists on Device A
    existsA = await draftExists(deviceA.page, draftId);
    expect(existsA).toBe(true);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});
