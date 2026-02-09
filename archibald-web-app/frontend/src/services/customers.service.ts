import { db } from "../db/schema";
import type { Customer, CacheMetadata } from "../db/schema";
import type Dexie from "dexie";
import { fetchWithRetry } from "../utils/fetch-with-retry";

function parseLastOrderDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  return raw;
}

function mapBackendCustomer(c: any): Customer {
  return {
    id: c.customerProfile || c.internalId || c.id || "",
    name: c.name || "",
    code: c.customerProfile || c.code || "",
    taxCode: c.fiscalCode || c.vatNumber || c.taxCode || "",
    address: c.street || c.logisticsAddress || c.address || "",
    city: c.city || "",
    province: c.province || "",
    cap: c.postalCode || c.cap || "",
    phone: c.phone || c.mobile || "",
    email: c.pec || c.email || "",
    fax: c.fax || "",
    lastModified: c.lastSync
      ? new Date(c.lastSync * 1000).toISOString()
      : c.lastModified || new Date().toISOString(),
    lastOrderDate: parseLastOrderDate(c.lastOrderDate),
    hash: c.hash || "",
  };
}

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
            (c.taxCode
              ? c.taxCode.toLowerCase().includes(lowerQuery)
              : false) ||
            (c.address
              ? c.address.toLowerCase().includes(lowerQuery)
              : false) ||
            (c.cap ? c.cap.toLowerCase().includes(lowerQuery) : false),
        )
        .limit(limit)
        .toArray();

      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const oneMonthAgoStr = oneMonthAgo.toISOString();

      cached.sort((a, b) => {
        const aRecent =
          a.lastOrderDate && a.lastOrderDate > oneMonthAgoStr ? 1 : 0;
        const bRecent =
          b.lastOrderDate && b.lastOrderDate > oneMonthAgoStr ? 1 : 0;
        if (aRecent !== bRecent) return bRecent - aRecent;
        return b.lastModified.localeCompare(a.lastModified);
      });

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
          const apiResults: Customer[] = (data.data?.customers || []).map(
            mapBackendCustomer,
          );
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
      const rawCustomers: any[] = data.data?.customers || [];

      console.log(
        `[CustomerService] Fetched ${rawCustomers.length} customers from API`,
      );

      // If no customers, log warning and skip sync
      if (rawCustomers.length === 0) {
        console.warn(
          "[CustomerService] No customers returned from API, skipping sync",
        );
        return;
      }

      const customers: Customer[] = rawCustomers.map(mapBackendCustomer);

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

      // Preserve photos before clearing
      const customersTable = this.db.table<Customer, string>("customers");
      const existingCustomers = await customersTable.toArray();
      const photoMap = new Map<string, string>();
      for (const c of existingCustomers) {
        if (c.photo) photoMap.set(c.id, c.photo);
      }

      // Clear and populate IndexedDB
      await customersTable.clear();
      await customersTable.bulkAdd(validCustomers);

      // Re-apply preserved photos
      for (const [id, photo] of photoMap) {
        await customersTable.update(id, { photo });
      }

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
    deliveryStreet?: string;
    deliveryPostalCode?: string;
    postalCodeCity?: string;
    postalCodeCountry?: string;
    deliveryPostalCodeCity?: string;
    deliveryPostalCodeCountry?: string;
  }): Promise<{ customer: Customer | null; taskId: string | null }> {
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
      const taskId: string | undefined = data.data?.taskId;

      if (customer && customer.id) {
        const customersTable = this.db.table<Customer, string>("customers");
        await customersTable.put(customer);
      }

      return { customer: customer ?? null, taskId: taskId ?? null };
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
      deliveryStreet?: string;
      deliveryPostalCode?: string;
      postalCodeCity?: string;
      postalCodeCountry?: string;
      deliveryPostalCodeCity?: string;
      deliveryPostalCodeCountry?: string;
    },
  ): Promise<{ taskId: string | null }> {
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

    const data = await response.json();
    const taskId: string | undefined = data.data?.taskId;

    return { taskId: taskId ?? null };
  }

  /**
   * Get customer bot status (polling fallback)
   */
  async getCustomerBotStatus(customerProfile: string): Promise<string> {
    const response = await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/status`,
    );

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.botStatus || "placed";
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
  async uploadPhoto(customerProfile: string, file: File): Promise<void> {
    const compressed = await this.compressImage(file, 800, 0.7);
    const dataUri = await this.blobToDataUri(compressed);

    const formData = new FormData();
    formData.append("photo", compressed, "photo.jpg");

    await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/photo`,
      { method: "POST", body: formData },
    );

    // Cache in IndexedDB
    const customersTable = this.db.table<Customer, string>("customers");
    await customersTable.update(customerProfile, { photo: dataUri });
  }

  async deletePhoto(customerProfile: string): Promise<void> {
    await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/photo`,
      { method: "DELETE" },
    );

    const customersTable = this.db.table<Customer, string>("customers");
    await customersTable.update(customerProfile, { photo: undefined });
  }

  async getPhotoUrl(customerProfile: string): Promise<string | null> {
    // Cache-first
    const customersTable = this.db.table<Customer, string>("customers");
    const cached = await customersTable.get(customerProfile);
    if (cached?.photo) return cached.photo;

    // Fetch from backend
    try {
      const response = await fetchWithRetry(
        `/api/customers/${encodeURIComponent(customerProfile)}/photo`,
      );
      if (!response.ok) return null;

      const blob = await response.blob();
      const dataUri = await this.blobToDataUri(blob);

      // Cache locally
      await customersTable.update(customerProfile, { photo: dataUri });

      return dataUri;
    } catch {
      return null;
    }
  }

  private compressImage(
    file: File,
    maxWidth: number,
    quality: number,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Compressione immagine fallita"));
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => reject(new Error("Impossibile caricare l'immagine"));
      img.src = URL.createObjectURL(file);
    });
  }

  private blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Lettura file fallita"));
      reader.readAsDataURL(blob);
    });
  }
}

// Singleton instance
export const customerService = new CustomerService();
