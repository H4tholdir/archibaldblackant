import Dexie, { type Table } from 'dexie';

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
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
  }>;
  createdAt: string;
  status: 'pending' | 'syncing' | 'error';
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
    super('ArchibaldOfflineDB');

    // Version 1 schema
    this.version(1).stores({
      // Customers: primary key 'id', indexes for search
      customers: 'id, name, code, city, *hash',

      // Products: primary key 'id', compound indexes for fast search
      products: 'id, name, article, *hash',

      // Product variants: auto-increment, FK to products
      productVariants: '++id, productId, variantId',

      // Prices: auto-increment, FK to products
      prices: '++id, articleId, articleName',

      // Draft orders: auto-increment, indexed by customer and timestamps
      draftOrders: '++id, customerId, createdAt, updatedAt',

      // Pending orders: auto-increment, indexed by status and createdAt
      pendingOrders: '++id, status, createdAt',

      // Cache metadata: primary key 'key'
      cacheMetadata: 'key, lastSynced'
    });
  }
}

// Singleton instance
export const db = new ArchibaldDatabase();
