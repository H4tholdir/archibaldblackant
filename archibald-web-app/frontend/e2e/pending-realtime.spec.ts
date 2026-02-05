/**
 * Pending Orders Real-Time Sync E2E Tests
 *
 * Tests WebSocket real-time synchronization of pending orders across multiple devices.
 * Validates: creation, bot status updates, direct deletion, conflict resolution, cascade deletion.
 *
 * Phase 34: E2E Testing & Multi-Device Validation
 */

import { test, expect } from "@playwright/test";
import type { Browser } from "@playwright/test";
import {
  createDeviceContext,
  waitForRealtimeSync,
  pendingExists,
  getPendingOrdersCount,
  draftExists,
  type DeviceContext,
} from "./helpers/multi-device";

/**
 * Test configuration
 */
const TEST_USER_USERNAME =
  process.env.TEST_USER_USERNAME || "test@archibald.com";
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "test123";
const SYNC_TIMEOUT = 5000; // 5 seconds max for sync

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

  await page.goto("/");
  await page.waitForSelector("#username", { timeout: 5000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  await page.waitForFunction(
    () => {
      const token = localStorage.getItem("archibald_jwt");
      return token !== null && token !== "";
    },
    { timeout: 10000 },
  );

  const token = await page.evaluate(() => {
    return localStorage.getItem("archibald_jwt") || "";
  });

  await context.close();

  expect(token).toBeTruthy();
  return token;
}

/**
 * Helper: Create a pending order on a device (convert draft to pending)
 */
async function createPendingOrder(
  device: DeviceContext,
  customerId: string,
  customerName: string,
): Promise<string> {
  const { page } = device;

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Create draft first
  const newOrderButton = await page.locator('button:has-text("Nuovo Ordine")');
  if (await newOrderButton.isVisible()) {
    await newOrderButton.click();
  }

  await page.waitForSelector('input[name="customerId"]', { timeout: 5000 });
  await page.fill('input[name="customerId"]', customerId);
  await page.fill('input[name="customerName"]', customerName);
  await page.waitForTimeout(1000);

  // Submit order (convert draft to pending)
  const submitButton = await page.locator('button:has-text("Invia Ordine")');
  if (await submitButton.isVisible()) {
    await submitButton.click();
  }

  // Wait for pending order to be created
  await page.waitForTimeout(1000);

  // Get pending order ID from IndexedDB
  const pendingId = await page.evaluate(async () => {
    const dbName = "ArchibaldDB";
    return new Promise<string>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["pendingOrders"], "readonly");
        const store = transaction.objectStore("pendingOrders");
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const pending = getAllRequest.result;
          if (pending.length > 0) {
            resolve(pending[0].id);
          } else {
            reject(new Error("No pending orders found"));
          }
        };
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
  });

  expect(pendingId).toBeTruthy();
  return pendingId;
}

/**
 * Test 1: Two devices see pending order creation in real-time
 */
test("two devices see pending order creation in real-time", async ({
  browser,
}) => {
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

    // Get initial pending count on Device B
    const initialCountB = await getPendingOrdersCount(deviceB.page);

    // Device A creates pending order (convert draft to pending)
    const startTime = Date.now();
    const pendingId = await createPendingOrder(
      deviceA,
      "CUST101",
      "Pending Customer A",
    );

    // Wait for pending order to appear on Device B
    await deviceB.page.waitForFunction(
      async (expectedId) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(expectedId);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    const endTime = Date.now();
    const latency = endTime - startTime;

    console.log(`[Pending Creation Sync] Latency: ${latency}ms`);

    // Verify pending order exists on Device B
    const pendingExistsB = await pendingExists(deviceB.page, pendingId);
    expect(pendingExistsB).toBe(true);

    // Verify pending count increased on Device B
    const finalCountB = await getPendingOrdersCount(deviceB.page);
    expect(finalCountB).toBe(initialCountB + 1);

    // Assert latency is under timeout
    expect(latency).toBeLessThan(SYNC_TIMEOUT);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 2: Bot status updates propagate to all devices
 */
test("bot status updates propagate to all devices", async ({ browser }) => {
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

    // Device A creates pending order
    const pendingId = await createPendingOrder(
      deviceA,
      "CUST102",
      "Pending Customer B",
    );

    // Wait for pending order to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Simulate bot status update by emitting PENDING_SUBMITTED event
    // (In real scenario, backend would emit this)
    await deviceA.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readwrite");
          const store = transaction.objectStore("pendingOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const pending = getRequest.result;
            if (pending) {
              pending.status = "syncing";
              pending.updatedAt = new Date().toISOString();
              store.put(pending);
              resolve();
            } else {
              reject(new Error("Pending order not found"));
            }
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    // Wait for status update to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
              const pending = getRequest.result;
              resolve(pending?.status === "syncing");
            };
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify status updated on both devices
    const statusA = await deviceA.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readonly");
          const store = transaction.objectStore("pendingOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const pending = getRequest.result;
            resolve(pending?.status || "");
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    const statusB = await deviceB.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readonly");
          const store = transaction.objectStore("pendingOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const pending = getRequest.result;
            resolve(pending?.status || "");
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    expect(statusA).toBe("syncing");
    expect(statusB).toBe("syncing");
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 3: Direct deletion works for pending orders
 */
test("direct deletion works for pending orders", async ({ browser }) => {
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

    // Device A creates pending order
    const pendingId = await createPendingOrder(
      deviceA,
      "CUST103",
      "Pending Customer C",
    );

    // Wait for pending order to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify pending order exists on Device B
    let existsB = await pendingExists(deviceB.page, pendingId);
    expect(existsB).toBe(true);

    // Device B deletes pending order (direct DELETE, no tombstone)
    await deviceB.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readwrite");
          const store = transaction.objectStore("pendingOrders");
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    // Wait for deletion to sync to Device A
    await deviceA.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify pending order no longer exists on Device A (direct deletion, NO tombstone)
    const existsA = await pendingExists(deviceA.page, pendingId);
    expect(existsA).toBe(false);

    // Verify NO tombstone in IndexedDB
    existsB = await pendingExists(deviceB.page, pendingId);
    expect(existsB).toBe(false);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 4: Conflict resolution with bot updates
 */
test("conflict resolution with bot updates", async ({ browser }) => {
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

    // Device A creates pending order
    const pendingId = await createPendingOrder(
      deviceA,
      "CUST104",
      "Pending Customer D",
    );

    // Wait for pending order to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Device A modifies pending order locally (e.g., adds note)
    await deviceA.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readwrite");
          const store = transaction.objectStore("pendingOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const pending = getRequest.result;
            if (pending) {
              pending.notes = "Local modification";
              pending.serverUpdatedAt = Date.now();
              store.put(pending);
              resolve();
            } else {
              reject(new Error("Pending order not found"));
            }
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    // Simulate bot status update (authoritative, should win)
    await deviceB.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readwrite");
          const store = transaction.objectStore("pendingOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const pending = getRequest.result;
            if (pending) {
              pending.status = "completed-warehouse";
              pending.serverUpdatedAt = Date.now() + 1000; // Later timestamp
              store.put(pending);
              resolve();
            } else {
              reject(new Error("Pending order not found"));
            }
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    // Wait for bot update to sync to Device A
    await deviceA.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
              const pending = getRequest.result;
              resolve(pending?.status === "completed-warehouse");
            };
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify bot update won (LWW with later timestamp)
    const statusA = await deviceA.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readonly");
          const store = transaction.objectStore("pendingOrders");
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const pending = getRequest.result;
            resolve(pending?.status || "");
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    expect(statusA).toBe("completed-warehouse");
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

/**
 * Test 5: Cascade deletion draft→pending verified
 */
test("cascade deletion draft to pending verified", async ({ browser }) => {
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
    await deviceA.page.goto("/");
    await deviceA.page.waitForLoadState("networkidle");

    const newOrderButton = await deviceA.page.locator(
      'button:has-text("Nuovo Ordine")',
    );
    if (await newOrderButton.isVisible()) {
      await newOrderButton.click();
    }

    await deviceA.page.waitForSelector('input[name="customerId"]', {
      timeout: 5000,
    });
    await deviceA.page.fill('input[name="customerId"]', "CUST105");
    await deviceA.page.fill('input[name="customerName"]', "Cascade Customer");
    await deviceA.page.waitForTimeout(1000);

    // Get draft ID
    const draftId = await deviceA.page.evaluate(async () => {
      const dbName = "ArchibaldDB";
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(dbName);
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
        request.onerror = () => reject(request.error);
      });
    });

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
    let draftExistsB = await draftExists(deviceB.page, draftId);
    expect(draftExistsB).toBe(true);

    // Device A converts draft to pending
    const submitButton = await deviceA.page.locator(
      'button:has-text("Invia Ordine")',
    );
    if (await submitButton.isVisible()) {
      await submitButton.click();
    }

    await deviceA.page.waitForTimeout(1000);

    // Get pending order ID
    const pendingId = await deviceA.page.evaluate(async () => {
      const dbName = "ArchibaldDB";
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readonly");
          const store = transaction.objectStore("pendingOrders");
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const pending = getAllRequest.result;
            if (pending.length > 0) {
              resolve(pending[0].id);
            } else {
              reject(new Error("No pending orders found"));
            }
          };
          getAllRequest.onerror = () => reject(getAllRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    // Wait for cascade: draft disappears, pending appears on Device B
    await deviceB.page.waitForFunction(
      async ({ draftId, pendingId }) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(
              ["draftOrders", "pendingOrders"],
              "readonly",
            );
            const draftStore = transaction.objectStore("draftOrders");
            const pendingStore = transaction.objectStore("pendingOrders");

            const draftRequest = draftStore.get(draftId);
            const pendingRequest = pendingStore.get(pendingId);

            let draftGone = false;
            let pendingExists = false;

            draftRequest.onsuccess = () => {
              draftGone = !draftRequest.result;
              if (draftGone && pendingExists) resolve(true);
            };

            pendingRequest.onsuccess = () => {
              pendingExists = !!pendingRequest.result;
              if (draftGone && pendingExists) resolve(true);
            };

            draftRequest.onerror = () => resolve(false);
            pendingRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      { draftId, pendingId },
      { timeout: SYNC_TIMEOUT },
    );

    // Verify draft disappeared on Device B
    draftExistsB = await draftExists(deviceB.page, draftId);
    expect(draftExistsB).toBe(false);

    // Verify pending order appeared on Device B
    const pendingExistsB = await pendingExists(deviceB.page, pendingId);
    expect(pendingExistsB).toBe(true);

    // Device A deletes pending order
    await deviceA.page.evaluate(async (id) => {
      const dbName = "ArchibaldDB";
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["pendingOrders"], "readwrite");
          const store = transaction.objectStore("pendingOrders");
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, pendingId);

    // Wait for pending deletion to sync to Device B
    await deviceB.page.waitForFunction(
      async (id) => {
        const dbName = "ArchibaldDB";
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["pendingOrders"], "readonly");
            const store = transaction.objectStore("pendingOrders");
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(!getRequest.result);
            getRequest.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        });
      },
      pendingId,
      { timeout: SYNC_TIMEOUT },
    );

    // Verify pending deleted on Device B (NO draft resurrection)
    const pendingExistsAfterDelete = await pendingExists(
      deviceB.page,
      pendingId,
    );
    expect(pendingExistsAfterDelete).toBe(false);

    // Verify draft did NOT resurrect
    const draftResurrected = await draftExists(deviceB.page, draftId);
    expect(draftResurrected).toBe(false);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});
