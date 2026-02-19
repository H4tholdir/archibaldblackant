import Dexie, { type Table } from "dexie";

import type { Customer } from "../types/local-customer";
import type { Product, ProductVariant, Price } from "../types/product";
import type { PendingOrder } from "../types/pending-order";
import type { CacheMetadata, SyncMetadata } from "../types/cache";
import type { WarehouseItem, WarehouseMetadata } from "../types/warehouse";
import type { FresisArticleDiscount, FresisHistoryOrder } from "../types/fresis";
import type { SubClient } from "../types/sub-client";

export type { Customer } from "../types/local-customer";
export type { Product, ProductVariant, Price } from "../types/product";
export type { PendingOrderItem, PendingOrder } from "../types/pending-order";
export type { CacheMetadata, SyncMetadata } from "../types/cache";
export type { WarehouseItem, WarehouseMetadata } from "../types/warehouse";
export type { FresisArticleDiscount, FresisHistoryOrder } from "../types/fresis";
export type { SubClient } from "../types/sub-client";

export class ArchibaldDatabase extends Dexie {
  customers!: Table<Customer, string>;
  products!: Table<Product, string>;
  productVariants!: Table<ProductVariant, number>;
  prices!: Table<Price, number>;
  pendingOrders!: Table<PendingOrder, string>;
  cacheMetadata!: Table<CacheMetadata, string>;
  warehouseItems!: Table<WarehouseItem, number>;
  warehouseMetadata!: Table<WarehouseMetadata, number>;
  subClients!: Table<SubClient, string>;
  fresisHistory!: Table<FresisHistoryOrder, string>;
  fresisDiscounts!: Table<FresisArticleDiscount, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super("ArchibaldOfflineDB");

    // Version 1 schema (original)
    this.version(1).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "++id, customerId, createdAt, updatedAt",
      pendingOrders: "++id, status, createdAt",
      cacheMetadata: "key, lastSynced",
    });

    // Version 2: Updated PendingOrder schema to include full order data
    this.version(2)
      .stores({
        // Same indexes, but PendingOrder now includes customerName and full item details
        pendingOrders: "++id, status, createdAt",
      })
      .upgrade(async (trans) => {
        // Clear old pending orders with incompatible schema
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v1→v2",
          action: "Clearing old pending orders",
          timestamp: new Date().toISOString(),
        });
        await trans.table("pendingOrders").clear();
      });

    // Version 3: Clean up corrupted draft orders with undefined id
    this.version(3)
      .stores({
        // Same schema as v2
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "++id, customerId, createdAt, updatedAt",
        pendingOrders: "++id, status, createdAt",
        cacheMetadata: "key, lastSynced",
      })
      .upgrade(async (trans) => {
        // Clear all draft orders to fix corrupted entries with undefined id
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v2→v3",
          action: "Clearing corrupted draft orders",
          timestamp: new Date().toISOString(),
        });
        await trans.table("draftOrders").clear();
      });

    // Version 4: Fix corrupted productVariants and prices from bulkPut issue
    this.version(4)
      .stores({
        // Same schema as v3
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "++id, customerId, createdAt, updatedAt",
        pendingOrders: "++id, status, createdAt",
        cacheMetadata: "key, lastSynced",
      })
      .upgrade(async (trans) => {
        // Clear productVariants and prices to fix bulkPut→bulkAdd migration
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v3→v4",
          action: "Clearing corrupted variants and prices (bulkPut fix)",
          timestamp: new Date().toISOString(),
        });
        await trans.table("productVariants").clear();
        await trans.table("prices").clear();
        // Force re-sync by clearing cache metadata
        await trans.table("cacheMetadata").clear();
      });

    // Version 5: Fix customer schema mismatch (customerProfile → id mapping)
    this.version(5)
      .stores({
        // Same schema as v4
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "++id, customerId, createdAt, updatedAt",
        pendingOrders: "++id, status, createdAt",
        cacheMetadata: "key, lastSynced",
      })
      .upgrade(async (trans) => {
        // Clear customers to force re-sync with correct field mapping
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v4→v5",
          action: "Clearing customers (customerProfile → id mapping fix)",
          timestamp: new Date().toISOString(),
        });
        await trans.table("customers").clear();
        // Force re-sync by clearing cache metadata
        await trans.table("cacheMetadata").clear();
      });

    // Version 6: Add VAT field to products, prices, and pending order items
    this.version(6)
      .stores({
        // Same schema as v5
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "++id, customerId, createdAt, updatedAt",
        pendingOrders: "++id, status, createdAt",
        cacheMetadata: "key, lastSynced",
      })
      .upgrade(async (trans) => {
        // Clear products, prices, and pending orders to add VAT field
        // ⚠️ DEPRECATED: This migration clears pendingOrders which causes data loss
        // Version 10+ will not clear pendingOrders
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v5→v6",
          action: "Adding VAT field to products, prices, and pending orders",
          timestamp: new Date().toISOString(),
        });
        await trans.table("products").clear();
        await trans.table("prices").clear();
        await trans.table("pendingOrders").clear();
        // Force re-sync by clearing cache metadata
        await trans.table("cacheMetadata").clear();
      });

    // Version 7: Add warehouse management tables
    this.version(7).stores({
      // Same schema as v6 + warehouse tables
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "++id, customerId, createdAt, updatedAt",
      pendingOrders: "++id, status, createdAt",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
    });

    // Version 8: Extend PendingOrderItem with warehouse fields
    // No data migration needed - new fields are optional (warehouseQuantity?, warehouseSources?)
    this.version(8).stores({
      // Same indexes as v7 (no schema changes, just TypeScript interface extension)
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "++id, customerId, createdAt, updatedAt",
      pendingOrders: "++id, status, createdAt",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
    });

    // Version 9: Protect pendingOrders from being cleared in future
    // Add logging to understand if pendingOrders are being lost
    this.version(9)
      .stores({
        // Same schema as v8
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "++id, customerId, createdAt, updatedAt",
        pendingOrders: "++id, status, createdAt",
        cacheMetadata: "key, lastSynced",
        warehouseItems:
          "++id, articleCode, boxName, reservedForOrder, soldInOrder",
        warehouseMetadata: "++id, uploadedAt",
      })
      .upgrade(async (trans) => {
        // NO data clearing - just log current state for debugging
        const pendingCount = await trans.table("pendingOrders").count();
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v8→v9",
          action: "Protecting pendingOrders (no clear)",
          pendingOrdersCount: pendingCount,
          timestamp: new Date().toISOString(),
        });
      });

    // Version 10: Backup pendingOrders to localStorage before any operations
    // This protects against data loss if IndexedDB is recreated from scratch
    this.version(10)
      .stores({
        // Same schema as v9
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "++id, customerId, createdAt, updatedAt",
        pendingOrders: "++id, status, createdAt",
        cacheMetadata: "key, lastSynced",
        warehouseItems:
          "++id, articleCode, boxName, reservedForOrder, soldInOrder",
        warehouseMetadata: "++id, uploadedAt",
      })
      .upgrade(async (trans) => {
        // Backup pendingOrders to localStorage as safety measure
        const pendingOrders = await trans.table("pendingOrders").toArray();
        if (pendingOrders.length > 0) {
          try {
            localStorage.setItem(
              "archibald_pending_orders_backup",
              JSON.stringify(pendingOrders),
            );
            console.log("[IndexedDB:Schema]", {
              operation: "migration",
              version: "v9→v10",
              action: "Backed up pendingOrders to localStorage",
              count: pendingOrders.length,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error(
              "[IndexedDB:Schema] Failed to backup pendingOrders",
              error,
            );
          }
        } else {
          console.log("[IndexedDB:Schema]", {
            operation: "migration",
            version: "v9→v10",
            action: "No pendingOrders to backup",
            timestamp: new Date().toISOString(),
          });
        }
      });

    // Version 11: Backup data before primary key change
    this.version(11)
      .stores({
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: null, // Will be recreated in v12 with UUID key
        pendingOrders: null, // Will be recreated in v12 with UUID key
        cacheMetadata: "key, lastSynced",
        warehouseItems:
          "++id, articleCode, boxName, reservedForOrder, soldInOrder",
        warehouseMetadata: "++id, uploadedAt",
      })
      .upgrade(async (trans) => {
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v10→v11",
          action: "Backup before primary key change",
          timestamp: new Date().toISOString(),
        });

        // Backup to localStorage before dropping tables
        try {
          const pendingOrders = await trans.table("pendingOrders").toArray();
          const draftOrders = await trans.table("draftOrders").toArray();

          if (pendingOrders.length > 0) {
            localStorage.setItem(
              "archibald_pending_orders_v11_migration",
              JSON.stringify(pendingOrders),
            );
          }

          if (draftOrders.length > 0) {
            localStorage.setItem(
              "archibald_draft_orders_v11_migration",
              JSON.stringify(draftOrders),
            );
          }

          console.log("[IndexedDB:Schema]", {
            operation: "migration",
            version: "v10→v11",
            action: "Data backed up",
            pendingCount: pendingOrders.length,
            draftCount: draftOrders.length,
          });
        } catch (error) {
          console.error("[IndexedDB:Schema] Backup failed", error);
        }
      });

    // Version 12: Recreate tables with UUID primary keys
    this.version(12)
      .stores({
        customers: "id, name, code, city, *hash",
        products: "id, name, article, *hash",
        productVariants: "++id, productId, variantId",
        prices: "++id, articleId, articleName",
        draftOrders: "id, customerId, createdAt, updatedAt, needsSync", // UUID primary key
        pendingOrders: "id, status, createdAt, updatedAt, needsSync", // UUID primary key
        cacheMetadata: "key, lastSynced",
        warehouseItems:
          "++id, articleCode, boxName, reservedForOrder, soldInOrder",
        warehouseMetadata: "++id, uploadedAt",
      })
      .upgrade(async (trans) => {
        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v11→v12",
          action: "Multi-device sync migration started",
          timestamp: new Date().toISOString(),
        });

        // Import device ID utility
        const { getDeviceId } = await import("../utils/device-id");
        const deviceId = getDeviceId();

        // Restore pending orders from localStorage with UUID
        const pendingBackup = localStorage.getItem(
          "archibald_pending_orders_v11_migration",
        );
        if (pendingBackup) {
          try {
            const pendingOrders = JSON.parse(pendingBackup);
            for (const order of pendingOrders) {
              await trans.table("pendingOrders").add({
                ...order,
                id: crypto.randomUUID(),
                updatedAt: order.createdAt,
                deviceId,
                needsSync: false,
                serverUpdatedAt: Date.now(),
              });
            }
            console.log("[IndexedDB:Schema]", {
              operation: "migration",
              version: "v11→v12",
              action: "Restored pending orders",
              count: pendingOrders.length,
            });
            // Cleanup
            localStorage.removeItem("archibald_pending_orders_v11_migration");
          } catch (error) {
            console.error(
              "[IndexedDB:Schema] Failed to restore pending orders",
              error,
            );
          }
        }

        // Restore draft orders from localStorage with UUID
        const draftBackup = localStorage.getItem(
          "archibald_draft_orders_v11_migration",
        );
        if (draftBackup) {
          try {
            const draftOrders = JSON.parse(draftBackup);
            for (const draft of draftOrders) {
              await trans.table("draftOrders").add({
                ...draft,
                id: crypto.randomUUID(),
                deviceId,
                needsSync: false,
                serverUpdatedAt: Date.now(),
              });
            }
            console.log("[IndexedDB:Schema]", {
              operation: "migration",
              version: "v11→v12",
              action: "Restored draft orders",
              count: draftOrders.length,
            });
            // Cleanup
            localStorage.removeItem("archibald_draft_orders_v11_migration");
          } catch (error) {
            console.error(
              "[IndexedDB:Schema] Failed to restore draft orders",
              error,
            );
          }
        }

        console.log("[IndexedDB:Schema]", {
          operation: "migration",
          version: "v11→v12",
          action: "Multi-device sync migration completed",
          timestamp: new Date().toISOString(),
        });
      });

    // Version 13: Remove needsSync from indices (boolean not indexable in Dexie)
    this.version(13).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "id, customerId, createdAt, updatedAt", // UUID primary key (needsSync removed - boolean not indexable)
      pendingOrders: "id, status, createdAt, updatedAt", // UUID primary key (needsSync removed - boolean not indexable)
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
    });
    // No upgrade needed - just removing indices, data remains unchanged

    // Version 14: Add job tracking fields to pendingOrders (Phase 72: Real-time job progress)
    this.version(14).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "id, customerId, createdAt, updatedAt",
      pendingOrders: "id, status, createdAt, updatedAt, jobId", // Add jobId index for querying
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
    });
    // No upgrade function needed - optional fields added to PendingOrder interface

    // Version 15: Add subClients and fresisHistory tables + subclient fields on orders
    this.version(15).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "id, customerId, createdAt, updatedAt",
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory: "id, subClientCodice, customerName, createdAt, updatedAt",
    });

    // Version 16: Add lifecycle tracking fields to fresisHistory + archibaldOrderId index
    this.version(16).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "id, customerId, createdAt, updatedAt",
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt, archibaldOrderId, mergedIntoOrderId",
    });

    // Version 17: Add warehouse tracking fields + fresisDiscounts table
    this.version(17).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: "id, customerId, createdAt, updatedAt",
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt, archibaldOrderId, mergedIntoOrderId",
      fresisDiscounts: "id, articleCode, discountPercent",
    });

    // Version 18: Remove draft orders table (draft system removed)
    this.version(18).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: null,
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt, archibaldOrderId, mergedIntoOrderId",
      fresisDiscounts: "id, articleCode, discountPercent",
    });

    // Version 19: Add photo field to customers (non-indexed, stored as base64 data URI)
    this.version(19).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: null,
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt, archibaldOrderId, mergedIntoOrderId",
      fresisDiscounts: "id, articleCode, discountPercent",
    });

    // Version 20: Add syncMetadata table for delta sync (syncId-based reconnection)
    this.version(20).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: null,
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt, archibaldOrderId, mergedIntoOrderId",
      fresisDiscounts: "id, articleCode, discountPercent",
      syncMetadata: "key",
    });

    // Version 21: Add arcaData field to fresisHistory (non-indexed, stores full Arca JSON blob)
    this.version(21).stores({
      customers: "id, name, code, city, *hash",
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      draftOrders: null,
      pendingOrders: "id, status, createdAt, updatedAt, jobId",
      cacheMetadata: "key, lastSynced",
      warehouseItems:
        "++id, articleCode, boxName, reservedForOrder, soldInOrder",
      warehouseMetadata: "++id, uploadedAt",
      subClients: "codice, ragioneSociale, supplRagioneSociale, partitaIva",
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt, archibaldOrderId, mergedIntoOrderId",
      fresisDiscounts: "id, articleCode, discountPercent",
      syncMetadata: "key",
    });
  }
}

// Singleton instance
export const db = new ArchibaldDatabase();
