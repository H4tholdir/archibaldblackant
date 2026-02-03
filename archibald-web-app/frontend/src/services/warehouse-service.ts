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

  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

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
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/format-guide`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch format guide");
  }
  const result = await response.json();
  return result.data;
}

// ========== ITEM VALIDATION (for real-time fuzzy matching) ==========

export interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
  vat?: number;
  packageContent?: string;
}

export interface ValidateItemResult {
  matchedProduct: Product | null;
  confidence: number;
  suggestions: Product[];
}

/**
 * Validate article code with fuzzy matching (no insert)
 * Used for real-time validation in AddItemManuallyModal
 */
export async function validateWarehouseItemCode(
  articleCode: string,
): Promise<ValidateItemResult> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/items/validate?code=${encodeURIComponent(articleCode)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore validazione articolo");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  return result.data;
}

// ========== MANUAL ADD ITEM ==========

export interface ManualAddItemResult {
  item: WarehouseItem;
  matchedProduct: Product | null;
  confidence: number;
  suggestions: Product[];
  warning?: string;
}

/**
 * Manually add warehouse item with fuzzy matching
 */
export async function addWarehouseItemManually(
  articleCode: string,
  quantity: number,
  boxName: string,
): Promise<ManualAddItemResult> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/items/manual-add`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ articleCode, quantity, boxName }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore aggiunta articolo");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  // Sync to IndexedDB
  const itemWithId = {
    ...result.data.item,
    id: Number(result.data.item.id),
  };
  await db.warehouseItems.add(itemWithId);

  console.log("[Warehouse] ✅ Item added manually", {
    articleCode,
    quantity,
    boxName,
    confidence: result.data.confidence,
  });

  return {
    item: itemWithId,
    matchedProduct: result.data.matchedProduct,
    confidence: result.data.confidence,
    suggestions: result.data.suggestions,
    warning: result.warning,
  };
}

// ========== BOX MANAGEMENT ==========

export interface BoxWithStats {
  name: string;
  itemsCount: number;
  totalQuantity: number;
  availableItems: number;
  reservedItems: number;
  soldItems: number;
  canDelete: boolean;
}

/**
 * Get all warehouse boxes with statistics
 */
export async function getWarehouseBoxes(): Promise<BoxWithStats[]> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(`${API_BASE_URL}/api/warehouse/boxes`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore caricamento scatoli");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  return result.boxes;
}

/**
 * Create new warehouse box
 */
export async function createWarehouseBox(name: string): Promise<BoxWithStats> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(`${API_BASE_URL}/api/warehouse/boxes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore creazione scatolo");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  console.log("[Warehouse] ✅ Box created", { name });

  return result.box;
}

/**
 * Rename warehouse box (updates warehouse_items and pending_orders)
 */
export async function renameWarehouseBox(
  oldName: string,
  newName: string,
): Promise<void> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/boxes/${encodeURIComponent(oldName)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newName }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore rinomina scatolo");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  // Update local IndexedDB
  const items = await db.warehouseItems
    .where("boxName")
    .equals(oldName)
    .toArray();
  for (const item of items) {
    await db.warehouseItems.update(item.id!, { boxName: newName });
  }

  console.log("[Warehouse] ✅ Box renamed", {
    oldName,
    newName,
    updatedItems: result.updatedItems,
    updatedOrders: result.updatedOrders,
  });
}

/**
 * Delete warehouse box (only if empty and not referenced in orders)
 */
export async function deleteWarehouseBox(name: string): Promise<void> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/boxes/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore cancellazione scatolo");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  console.log("[Warehouse] ✅ Box deleted", { name });
}

// ========== MOVE ITEMS ==========

export interface MoveItemsResult {
  movedCount: number;
  skippedCount: number;
}

/**
 * Move warehouse items to different box (skips reserved/sold items)
 */
export async function moveWarehouseItems(
  itemIds: number[],
  destinationBox: string,
): Promise<MoveItemsResult> {
  const token = localStorage.getItem("archibald_jwt");
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/warehouse/items/move`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemIds, destinationBox }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Errore spostamento articoli");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error);

  // Update local IndexedDB
  const items = await db.warehouseItems.bulkGet(itemIds);
  for (const item of items) {
    if (
      item &&
      !item.reservedForOrder &&
      !item.soldInOrder &&
      item.id !== undefined
    ) {
      await db.warehouseItems.update(item.id, {
        boxName: destinationBox,
      });
    }
  }

  console.log("[Warehouse] ✅ Items moved", {
    destinationBox,
    movedCount: result.movedCount,
    skippedCount: result.skippedCount,
  });

  return {
    movedCount: result.movedCount,
    skippedCount: result.skippedCount,
  };
}
