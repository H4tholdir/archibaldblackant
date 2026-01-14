import { db } from './schema';

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
