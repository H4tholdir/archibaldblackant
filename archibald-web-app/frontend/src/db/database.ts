import { db } from './schema';

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
        error: 'IndexedDB non supportato in questo browser'
      };
    }

    // Open database (triggers schema creation if needed)
    await db.open();

    const quota = await getStorageQuota();
    console.log('[IndexedDB:Database]', {
      operation: 'initialization',
      status: 'success',
      version: db.verno,
      storage: {
        used: quota.used,
        available: quota.available,
        percentage: quota.percentage,
      },
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error('[IndexedDB:Database]', {
      operation: 'initialization',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Handle common errors
    if (error instanceof Error) {
      if (error.name === 'QuotaExceededError') {
        return {
          success: false,
          error:
            'Spazio di archiviazione insufficiente. Libera spazio sul dispositivo.'
        };
      }

      if (error.name === 'VersionError') {
        return {
          success: false,
          error: "Errore di versione database. Prova a ricaricare l'app."
        };
      }
    }

    return {
      success: false,
      error: 'Errore imprevisto durante inizializzazione database'
    };
  }
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  return 'indexedDB' in window;
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
    percentage
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
db.on('ready', async () => {
  // Log current record counts
  const counts = {
    customers: await db.customers.count(),
    products: await db.products.count(),
    variants: await db.productVariants.count(),
    prices: await db.prices.count(),
    drafts: await db.draftOrders.count(),
    pending: await db.pendingOrders.count()
  };

  console.log('[IndexedDB:Database]', {
    operation: 'ready',
    recordCounts: counts,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Handle database errors
 */
db.on('blocked', () => {
  console.warn(
    '[IndexedDB] Database blocked - another tab may be using an older version'
  );
});

db.on('versionchange', () => {
  console.warn(
    '[IndexedDB] Database version changed - reload recommended'
  );
  db.close();
});
