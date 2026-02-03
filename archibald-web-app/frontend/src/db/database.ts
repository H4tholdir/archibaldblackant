import { db } from "./schema";

/**
 * Initialize database and handle errors
 */
export async function initializeDatabase(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Check IndexedDB support
    if (!isIndexedDBSupported()) {
      return {
        success: false,
        error: "IndexedDB non supportato in questo browser",
      };
    }

    // Open database (triggers schema creation if needed)
    await db.open();

    const quota = await getStorageQuota();
    const pendingCount = await db.pendingOrders.count();

    // Restore pendingOrders from localStorage backup if needed
    if (pendingCount === 0) {
      const backup = localStorage.getItem("archibald_pending_orders_backup");
      if (backup) {
        try {
          const orders = JSON.parse(backup);
          if (Array.isArray(orders) && orders.length > 0) {
            await db.pendingOrders.bulkAdd(orders);
            console.log("[IndexedDB:Database]", {
              operation: "restore",
              action: "Restored pendingOrders from localStorage backup",
              count: orders.length,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error("[IndexedDB:Database] Failed to restore backup", error);
        }
      }
    }

    console.log("[IndexedDB:Database]", {
      operation: "initialization",
      status: "success",
      version: db.verno,
      pendingOrdersCount: pendingCount,
      storage: {
        used: quota.used,
        available: quota.available,
        percentage: quota.percentage,
      },
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error("[IndexedDB:Database]", {
      operation: "initialization",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Handle common errors
    if (error instanceof Error) {
      if (error.name === "QuotaExceededError") {
        // Storage full - store flag for UI warning
        localStorage.setItem("db_quota_exceeded", "true");
        return {
          success: false,
          error:
            "Spazio di archiviazione insufficiente. Libera spazio sul dispositivo.",
        };
      }

      if (error.name === "VersionError") {
        // Version conflict - try automatic recovery
        console.warn(
          "[IndexedDB:Database] VersionError detected - attempting automatic recovery",
        );

        try {
          // Delete database and retry initialization
          await db.delete();
          console.log(
            "[IndexedDB:Database] Database deleted, retrying initialization...",
          );

          // Retry open
          await db.open();
          console.log(
            "[IndexedDB:Database] ✅ Recovery successful after delete+retry",
          );

          return { success: true };
        } catch (retryError) {
          console.error("[IndexedDB:Database] ❌ Recovery failed:", retryError);
          localStorage.setItem("db_recovery_failed", "true");
          return {
            success: false,
            error:
              "Errore di versione database non recuperabile. Contatta il supporto.",
          };
        }
      }
    }

    // Unknown error - store for diagnostics
    localStorage.setItem("db_init_failed", "true");
    localStorage.setItem(
      "db_init_error",
      error instanceof Error ? error.message : String(error),
    );

    return {
      success: false,
      error: "Errore imprevisto durante inizializzazione database",
    };
  }
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  return "indexedDB" in window;
}

/**
 * Get database size estimate (in MB)
 */
export async function getDatabaseSize(): Promise<number> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return 0;
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  return Math.round((usage / 1024 / 1024) * 100) / 100; // MB with 2 decimals
}

/**
 * Check available storage quota
 */
export async function getStorageQuota(): Promise<{
  used: number;
  available: number;
  percentage: number;
}> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { used: 0, available: 0, percentage: 0 };
  }

  const estimate = await navigator.storage.estimate();
  const used = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const percentage = quota > 0 ? Math.round((used / quota) * 100) : 0;

  return {
    used: Math.round(used / 1024 / 1024), // MB
    available: Math.round(quota / 1024 / 1024), // MB
    percentage,
  };
}

/**
 * Clear all data (for testing or reset)
 */
export async function clearAllData(): Promise<void> {
  await db.customers.clear();
  await db.products.clear();
  await db.productVariants.clear();
  await db.prices.clear();
  await db.draftOrders.clear();
  await db.pendingOrders.clear();
  await db.cacheMetadata.clear();
}

/**
 * Get cache freshness info
 */
export async function getCacheFreshness(): Promise<Map<string, Date>> {
  const metadata = await db.cacheMetadata.toArray();
  const freshness = new Map<string, Date>();

  for (const item of metadata) {
    freshness.set(item.key, new Date(item.lastSynced));
  }

  return freshness;
}

/**
 * Handle database upgrade (version migration)
 */
db.on("ready", async () => {
  // Log current record counts
  const counts = {
    customers: await db.customers.count(),
    products: await db.products.count(),
    variants: await db.productVariants.count(),
    prices: await db.prices.count(),
    drafts: await db.draftOrders.count(),
    pending: await db.pendingOrders.count(),
  };

  console.log("[IndexedDB:Database]", {
    operation: "ready",
    recordCounts: counts,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Handle database errors
 */
db.on("blocked", () => {
  console.warn(
    "[IndexedDB] Database blocked - another tab may be using an older version",
  );
});

db.on("versionchange", () => {
  console.warn("[IndexedDB] Database version changed - reload recommended");
  db.close();
});
