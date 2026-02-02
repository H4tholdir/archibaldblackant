import { db, type WarehouseItem, type WarehouseMetadata } from "../db/schema";
import { getDeviceId } from "../utils/device-id";
import { unifiedSyncService } from "./unified-sync-service";
import { fetchWithRetry } from "../utils/fetch-with-retry";

// Use empty string for relative paths (works with Vite proxy in dev and production)
const API_BASE_URL = "";

export interface WarehouseUploadResult {
  items: WarehouseItem[];
  totalItems: number;
  totalQuantity: number;
  boxesCount: number;
  errors: string[];
}

/**
 * Upload warehouse Excel file to backend and store in IndexedDB
 *
 * CURRENT: Reads "Codice Corretto", "Descrizione", "quantità"
 *
 * TODO FUTURE: Will accept only "codice manuale" + "quantità",
 * then auto-match against products DB to generate:
 * - Codice Corretto (with typo correction)
 * - Descrizione (from matched product)
 */
export async function uploadWarehouseFile(
  file: File,
): Promise<WarehouseUploadResult> {
  // 1. Upload file to backend for parsing
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithRetry(`${API_BASE_URL}/api/warehouse/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Upload fallito");
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Parsing fallito");
  }

  const data = result.data as WarehouseUploadResult;

  // 2. Clear old warehouse data
  await db.warehouseItems.clear();
  await db.warehouseMetadata.clear();

  console.log("[Warehouse] Cleared old data, storing new items", {
    count: data.items.length,
  });

  // 3. Store items in IndexedDB
  const uploadedAt = new Date().toISOString();
  const deviceId = getDeviceId();
  const itemsWithTimestamp = data.items.map((item) => ({
    ...item,
    uploadedAt,
    deviceId,
  }));

  await db.warehouseItems.bulkAdd(itemsWithTimestamp);

  // 4. Store metadata
  const metadata: WarehouseMetadata = {
    fileName: file.name,
    uploadedAt,
    totalItems: data.totalItems,
    totalQuantity: data.totalQuantity,
    boxesCount: data.boxesCount,
  };

  await db.warehouseMetadata.add(metadata);

  console.log("[Warehouse] ✅ File uploaded and stored locally", {
    items: data.totalItems,
    quantity: data.totalQuantity,
    boxes: data.boxesCount,
  });

  // 5. Push warehouse items to server for multi-device sync
  const token = localStorage.getItem("archibald_jwt");
  if (token && navigator.onLine) {
    try {
      console.log("[Warehouse] Pushing items to server for sync...");

      const syncResponse = await fetchWithRetry(
        `${API_BASE_URL}/api/sync/warehouse-items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            items: itemsWithTimestamp.map((item) => ({
              articleCode: item.articleCode,
              description: item.description,
              quantity: item.quantity,
              boxName: item.boxName,
              uploadedAt: new Date(uploadedAt).getTime(),
              deviceId,
            })),
            clearExisting: true, // Replace all existing warehouse items
          }),
        },
      );

      if (!syncResponse.ok) {
        throw new Error(`Warehouse sync failed: ${syncResponse.status}`);
      }

      const syncResult = await syncResponse.json();
      console.log("[Warehouse] ✅ Items pushed to server", {
        synced: syncResult.results?.length || itemsWithTimestamp.length,
      });
    } catch (syncError) {
      console.error(
        "[Warehouse] ⚠️ Failed to push items to server:",
        syncError,
      );
      // Don't fail the upload if sync fails - items are saved locally
      // Will be synced on next periodic sync
    }
  }

  // Trigger full sync to pull any updates from other devices
  if (navigator.onLine) {
    unifiedSyncService.syncAll().catch((error) => {
      console.error("[Warehouse] Full sync after upload failed:", error);
    });
  }

  return data;
}

/**
 * Get all warehouse items
 */
export async function getWarehouseItems(): Promise<WarehouseItem[]> {
  return db.warehouseItems.toArray();
}

/**
 * Get warehouse metadata (last upload info)
 */
export async function getWarehouseMetadata(): Promise<WarehouseMetadata | null> {
  const all = await db.warehouseMetadata.toArray();
  if (all.length === 0) return null;

  // Return most recent
  return all.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  )[0];
}

/**
 * Clear all warehouse data
 */
export async function clearWarehouseData(): Promise<void> {
  await db.warehouseItems.clear();
  await db.warehouseMetadata.clear();
  console.log("[Warehouse] 🗑️ All data cleared");
}

/**
 * Get format requirements (from backend)
 */
export async function getFormatGuide(): Promise<unknown> {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/warehouse/format-guide`);
  if (!response.ok) {
    throw new Error("Failed to fetch format guide");
  }
  const result = await response.json();
  return result.data;
}
