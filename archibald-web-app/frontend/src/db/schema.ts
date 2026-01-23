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
  id?: number; // Auto-increment
  customerId: string;
  customerName: string;
  items: DraftOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DraftOrderItem {
  productId: string;
  productName: string;
  article: string;
  variantId: string;
  quantity: number;
  packageContent: string;
}

// Pending orders queue (offline submission)
export interface PendingOrder {
  id?: number; // Auto-increment
  customerId: string;
  customerName: string;
  items: Array<{
    articleCode: string;
    productName?: string;
    description?: string;
    quantity: number;
    price: number;
    vat: number;
    discount?: number;
  }>;
  discountPercent?: number;
  targetTotalWithVAT?: number;
  createdAt: string;
  status: "pending" | "syncing" | "error";
  errorMessage?: string;
  retryCount: number;
}

// Cache metadata (track freshness)
export interface CacheMetadata {
  key: string; // 'customers' | 'products' | 'prices'
  lastSynced: string;
  recordCount: number;
  version: number;
}

export class ArchibaldDatabase extends Dexie {
  customers!: Table<Customer, string>; // string = primary key type
  products!: Table<Product, string>;
  productVariants!: Table<ProductVariant, number>;
  prices!: Table<Price, number>;
  draftOrders!: Table<DraftOrder, number>;
  pendingOrders!: Table<PendingOrder, number>;
  cacheMetadata!: Table<CacheMetadata, string>;

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
  }
}

// Singleton instance
export const db = new ArchibaldDatabase();
