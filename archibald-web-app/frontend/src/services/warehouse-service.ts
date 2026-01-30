import { db, type WarehouseItem, type WarehouseMetadata } from "../db/schema";

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

  const response = await fetch(`${API_BASE_URL}/api/warehouse/upload`, {
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
  const itemsWithTimestamp = data.items.map((item) => ({
    ...item,
    uploadedAt,
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

  console.log("[Warehouse] ✅ File uploaded and stored", {
    items: data.totalItems,
    quantity: data.totalQuantity,
    boxes: data.boxesCount,
  });

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
  const response = await fetch(`${API_BASE_URL}/api/warehouse/format-guide`);
  if (!response.ok) {
    throw new Error("Failed to fetch format guide");
  }
  const result = await response.json();
  return result.data;
}
