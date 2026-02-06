import { db } from "../db/schema";
import type { Customer, CacheMetadata } from "../db/schema";
import type Dexie from "dexie";
import { fetchWithRetry } from "../utils/fetch-with-retry";

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

      const lowerQuery = query.toLowerCase();
      const cached = await customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(lowerQuery) ||
            c.code.toLowerCase().includes(lowerQuery) ||
            (c.city ? c.city.toLowerCase().includes(lowerQuery) : false) ||
            (c.taxCode ? c.taxCode.toLowerCase().includes(lowerQuery) : false),
        )
        .limit(limit)
        .toArray();

      // Sort by lastModified descending (most recent first)
      cached.sort((a, b) => b.lastModified.localeCompare(a.lastModified));

      if (cached.length >= 3) {
        return cached;
      }

      // Few cache results: also fetch from API and merge
      try {
        const response = await fetchWithRetry(
          `/api/customers?search=${encodeURIComponent(query)}`,
        );
        if (response.ok) {
          const data = await response.json();
          const apiResults: Customer[] = data.data?.customers || [];
          const cachedIds = new Set(cached.map((c) => c.id));
          const merged = [
            ...cached,
            ...apiResults.filter((c) => !cachedIds.has(c.id)),
          ];
          return merged.slice(0, limit);
        }
      } catch {
        // API failed, return whatever cache had
      }

      return cached;
    } catch (error) {
      console.warn("[CustomerService] Cache search failed:", error);
    }

    // 2. Fallback to API
    try {
      const response = await fetchWithRetry(
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
      const response = await fetchWithRetry("/api/customers");
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const customers: Customer[] = data.data?.customers || [];

      console.log(
        `[CustomerService] Fetched ${customers.length} customers from API`,
      );

      // If no customers, log warning and skip sync
      if (customers.length === 0) {
        console.warn(
          "[CustomerService] No customers returned from API, skipping sync",
        );
        return;
      }

      // Filter customers with valid id field (required for IndexedDB key path)
      const validCustomers = customers.filter(
        (c) => c.id && typeof c.id === "string",
      );
      if (validCustomers.length < customers.length) {
        console.warn(
          `[CustomerService] Filtered out ${customers.length - validCustomers.length} customers without valid id field`,
        );
      }

      if (validCustomers.length === 0) {
        console.error("[CustomerService] No valid customers to sync");
        return;
      }

      // Clear and populate IndexedDB
      const customersTable = this.db.table<Customer, string>("customers");
      await customersTable.clear();
      await customersTable.bulkAdd(validCustomers);

      console.log(
        `[CustomerService] Populated IndexedDB with ${validCustomers.length} customers`,
      );

      // Update cache metadata
      const metadata: CacheMetadata = {
        key: "customers",
        lastSynced: new Date().toISOString(),
        recordCount: validCustomers.length,
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

  /**
   * Create a new customer via API + save to IndexedDB cache
   */
  async createCustomer(formData: {
    name: string;
    vatNumber?: string;
    pec?: string;
    sdi?: string;
    street?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    deliveryMode?: string;
    paymentTerms?: string;
  }): Promise<Customer | null> {
    try {
      const response = await fetchWithRetry("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const customer: Customer | undefined = data.data?.customer;

      if (customer && customer.id) {
        const customersTable = this.db.table<Customer, string>("customers");
        await customersTable.put(customer);
      }

      return customer ?? null;
    } catch (error) {
      console.error("[CustomerService] createCustomer failed:", error);
      throw error;
    }
  }

  /**
   * Update an existing customer via PUT + refresh IndexedDB cache
   */
  async updateCustomer(
    customerProfile: string,
    formData: {
      name: string;
      vatNumber?: string;
      pec?: string;
      sdi?: string;
      street?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
      deliveryMode?: string;
      paymentTerms?: string;
    },
  ): Promise<void> {
    const response = await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      },
    );

    if (!response.ok) {
      throw new Error(`Update failed: ${response.status}`);
    }

    // Refresh cache in background
    this.syncCustomers().catch(() => {});
  }

  /**
   * Retry bot placement for a customer
   */
  async retryBotPlacement(customerProfile: string): Promise<void> {
    const response = await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/retry`,
      { method: "POST" },
    );

    if (!response.ok) {
      throw new Error(`Retry failed: ${response.status}`);
    }
  }
}

// Singleton instance
export const customerService = new CustomerService();
