import Dexie, { type Table } from "dexie";

// Match backend SQLite schema for customers
export interface Customer {
  id: string;
  name: string;
  code: string;
  taxCode: string;
  address: string;
  city: string;
  province: string;
  cap: string;
  phone: string;
  email: string;
  fax: string;
  lastModified: string;
  lastOrderDate?: string;
  hash: string;
}

// Match backend SQLite schema for products
export interface Product {
  id: string;
  name: string;
  article: string;
  description: string;
  packageContent?: string;
  vat?: number;
  price?: number; // Price from backend (already included in products)
  lastModified: string;
  hash: string;
}

// Match backend product variants
export interface ProductVariant {
  id?: number; // Auto-increment
  productId: string; // FK to Product
  variantId: string;
  multipleQty: number;
  minQty: number;
  maxQty: number;
  packageContent: string;
}

// Match backend prices
export interface Price {
  id?: number; // Auto-increment
  articleId: string;
  articleName: string;
  price: number;
  vat?: number;
  lastSynced: string;
}

// Draft orders (offline-first feature)
export interface DraftOrder {
  id: string; // UUID (changed from number for multi-device sync)
  customerId: string;
  customerName: string;
  items: DraftOrderItem[];
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  needsSync: boolean;
  serverUpdatedAt?: number;
  subClientCodice?: string;
  subClientName?: string;
  subClientData?: SubClient;
}

export interface DraftOrderItem {
  productId: string;
  productName: string;
  article: string;
  variantId: string;
  quantity: number;
  packageContent: string;
}

// Pending order item (can be from warehouse or to be ordered)
export interface PendingOrderItem {
  articleCode: string;
  articleId?: string; // ID variante (opzionale, per recupero prezzi/IVA)
  productName?: string;
  description?: string;
  quantity: number; // Total quantity (warehouse + to order)
  price: number;
  vat: number;
  discount?: number;
  // Warehouse info (if item is partially or fully from warehouse)
  warehouseQuantity?: number; // How many from warehouse (if 0 or undefined, order all)
  warehouseSources?: Array<{
    // Multiple boxes can provide same article
    warehouseItemId: number;
    boxName: string;
    quantity: number; // How many from this specific box
  }>;
}

// Pending orders queue (offline submission)
export interface PendingOrder {
  id: string; // UUID (changed from number for multi-device sync)
  customerId: string;
  customerName: string;
  items: PendingOrderItem[];
  discountPercent?: number;
  targetTotalWithVAT?: number;
  shippingCost?: number; // Spese di trasporto K3 (imponibile)
  shippingTax?: number; // IVA spese (22%)
  createdAt: string;
  updatedAt: string;
  status: "pending" | "syncing" | "error" | "completed-warehouse"; // 🔧 FIX #5: New status for warehouse-only orders
  errorMessage?: string;
  retryCount: number;
  deviceId: string;
  needsSync: boolean;
  serverUpdatedAt?: number;
  originDraftId?: string; // 🔧 FIX: Track which draft this pending came from for server-side cascade deletion
  // Job tracking fields (Phase 72: Real-time job progress)
  jobId?: string;
  jobStatus?: "idle" | "started" | "processing" | "completed" | "failed";
  jobProgress?: number; // 0-100
  jobOperation?: string; // Current operation (Italian)
  jobError?: string;
  jobStartedAt?: string;
  jobCompletedAt?: string;
  jobOrderId?: string; // Archibald order ID (on success)
  subClientCodice?: string;
  subClientName?: string;
  subClientData?: SubClient;
}

// Cache metadata (track freshness)
export interface CacheMetadata {
  key: string; // 'customers' | 'products' | 'prices' | 'warehouse'
  lastSynced: string;
  recordCount: number;
  version: number;
}

// Warehouse item (magazzino)
export interface WarehouseItem {
  id?: number; // Auto-increment
  articleCode: string; // Codice articolo (da "Codice Corretto")
  description: string; // Descrizione articolo
  quantity: number; // Quantità disponibile
  boxName: string; // Nome scatolo (es: "SCATOLO 1")
  reservedForOrder?: string; // ID ordine se riservato (pending order)
  soldInOrder?: string; // ID ordine Archibald se venduto
  uploadedAt: string; // Timestamp caricamento
  deviceId?: string; // Device che ha caricato/modificato
  customerName?: string;
  subClientName?: string;
  orderDate?: string;
  orderNumber?: string;
}

// Fresis article discount (imported from Excel)
export interface FresisArticleDiscount {
  id: string; // ID prodotto (es: "001627K0")
  articleCode: string; // Codice articolo (es: "1.204.005")
  discountPercent: number; // Sconto Fresis %
  kpPriceUnit?: number; // Prezzo KP unitario (per verifica)
}

// Fresis sub-client (sotto-cliente)
export interface SubClient {
  codice: string;
  ragioneSociale: string;
  supplRagioneSociale?: string;
  indirizzo?: string;
  cap?: string;
  localita?: string;
  prov?: string;
  telefono?: string;
  fax?: string;
  email?: string;
  partitaIva?: string;
  codFiscale?: string;
  zona?: string;
  persDaContattare?: string;
  emailAmministraz?: string;
}

// Fresis history order (archived orders from merge)
export interface FresisHistoryOrder {
  id: string;
  originalPendingOrderId: string;
  subClientCodice: string;
  subClientName: string;
  subClientData: SubClient;
  customerId: string;
  customerName: string;
  items: PendingOrderItem[];
  discountPercent?: number;
  targetTotalWithVAT?: number;
  shippingCost?: number;
  shippingTax?: number;
  mergedIntoOrderId?: string;
  mergedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;

  archibaldOrderId?: string;
  archibaldOrderNumber?: string;
  currentState?: string;
  stateUpdatedAt?: string;

  ddtNumber?: string;
  ddtDeliveryDate?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
  deliveryCompletedDate?: string;

  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: string;
}

// Warehouse metadata (info sul file caricato)
export interface WarehouseMetadata {
  id?: number;
  fileName: string;
  uploadedAt: string;
  totalItems: number;
  totalQuantity: number;
  boxesCount: number;
}

export class ArchibaldDatabase extends Dexie {
  customers!: Table<Customer, string>; // string = primary key type
  products!: Table<Product, string>;
  productVariants!: Table<ProductVariant, number>;
  prices!: Table<Price, number>;
  draftOrders!: Table<DraftOrder, string>; // Changed to string (UUID)
  pendingOrders!: Table<PendingOrder, string>; // Changed to string (UUID)
  cacheMetadata!: Table<CacheMetadata, string>;
  warehouseItems!: Table<WarehouseItem, number>;
  warehouseMetadata!: Table<WarehouseMetadata, number>;
  subClients!: Table<SubClient, string>;
  fresisHistory!: Table<FresisHistoryOrder, string>;
  fresisDiscounts!: Table<FresisArticleDiscount, string>;

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
      fresisHistory:
        "id, subClientCodice, customerName, createdAt, updatedAt",
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
  }
}

// Singleton instance
export const db = new ArchibaldDatabase();
