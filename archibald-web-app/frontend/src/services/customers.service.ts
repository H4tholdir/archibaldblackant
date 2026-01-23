import { db } from "../db/schema";
import type { Customer, CacheMetadata } from "../db/schema";
import type Dexie from "dexie";

export class CustomerService {
  private db: Dexie;

  constructor(database: Dexie = db) {
    this.db = database;
  }

  /**
   * Search customers by name (cache-first, API fallback)
   * @param query - Search query string
   * @param limit - Max results (default 50)
   * @returns Array of matching customers
   */
  async searchCustomers(
    query: string,
    limit: number = 50,
  ): Promise<Customer[]> {
    // 1. Try cache first
    try {
      const customers = this.db.table<Customer, string>("customers");

      // Empty query: return all customers up to limit
      if (!query || query.trim().length === 0) {
        return await customers.limit(limit).toArray();
      }

      const cached = await customers
        .where("name")
        .startsWithIgnoreCase(query)
        .or("code")
        .startsWithIgnoreCase(query)
        .limit(limit)
        .toArray();

      if (cached.length > 0) {
        return cached;
      }
    } catch (error) {
      console.warn("[CustomerService] Cache search failed:", error);
    }

    // 2. Fallback to API
    try {
      const response = await fetch(
        `/api/customers?search=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error("API fetch failed");

      const data = await response.json();
      return data.data?.customers || [];
    } catch (error) {
      console.error("[CustomerService] API fetch failed:", error);
      return [];
    }
  }

  /**
   * Get customer by ID (cache only)
   * @param id - Customer ID
   * @returns Customer or null if not found
   */
  async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const customers = this.db.table<Customer, string>("customers");
      const customer = await customers.get(id);
      return customer || null;
    } catch (error) {
      console.error("[CustomerService] Failed to get customer by ID:", error);
      return null;
    }
  }

  /**
   * Sync customers from API to IndexedDB
   * Fetches all customers and populates cache
   */
  async syncCustomers(): Promise<void> {
    try {
      console.log("[CustomerService] Starting customer sync...");

      // Fetch all customers from API
      const response = await fetch("/api/customers");
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const customers: Customer[] = data.data?.customers || [];

      console.log(
        `[CustomerService] Fetched ${customers.length} customers from API`,
      );

      // Clear and populate IndexedDB
      const customersTable = this.db.table<Customer, string>("customers");
      await customersTable.clear();
      await customersTable.bulkAdd(customers);

      console.log(
        `[CustomerService] Populated IndexedDB with ${customers.length} customers`,
      );

      // Update cache metadata
      const metadata: CacheMetadata = {
        key: "customers",
        lastSynced: new Date().toISOString(),
        recordCount: customers.length,
        version: 1,
      };

      const metadataTable = this.db.table<CacheMetadata, string>(
        "cacheMetadata",
      );
      await metadataTable.put(metadata);

      console.log("[CustomerService] Customer sync completed");
    } catch (error) {
      console.error("[CustomerService] Sync failed:", error);
      throw error;
    }
  }

  /**
   * Get cache metadata for customers
   * @returns Cache metadata or null if not exists
   */
  async getCacheMetadata(): Promise<CacheMetadata | null> {
    try {
      const metadataTable = this.db.table<CacheMetadata, string>(
        "cacheMetadata",
      );
      const metadata = await metadataTable.get("customers");
      return metadata || null;
    } catch (error) {
      console.error("[CustomerService] Failed to get cache metadata:", error);
      return null;
    }
  }
}

// Singleton instance
export const customerService = new CustomerService();
