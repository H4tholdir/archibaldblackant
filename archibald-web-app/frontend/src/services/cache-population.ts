import { db } from "../db/schema";
import type { Customer, Product, ProductVariant, Price } from "../db/schema";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export interface CachePopulationProgress {
  stage:
    | "fetching"
    | "customers"
    | "products"
    | "variants"
    | "prices"
    | "complete";
  percentage: number;
  message: string;
}

export interface CachePopulationResult {
  success: boolean;
  error?: string;
  recordCounts?: {
    customers: number;
    products: number;
    variants: number;
    prices: number;
  };
  durationMs?: number;
}

export class CachePopulationService {
  private static instance: CachePopulationService;

  private constructor() {}

  static getInstance(): CachePopulationService {
    if (!CachePopulationService.instance) {
      CachePopulationService.instance = new CachePopulationService();
    }
    return CachePopulationService.instance;
  }

  /**
   * Populate IndexedDB cache from backend
   */
  async populateCache(
    jwt: string,
    onProgress?: (progress: CachePopulationProgress) => void,
  ): Promise<CachePopulationResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Fetch data from backend
      onProgress?.({
        stage: "fetching",
        percentage: 5,
        message: "Scaricamento dati dal server...",
      });

      const response = await fetchWithRetry("/api/cache/export", {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Export failed");
      }

      const { customers, products, variants, prices } = result.data;

      // Stage 2: Populate customers (20% → 40%)
      onProgress?.({
        stage: "customers",
        percentage: 20,
        message: `Salvataggio ${customers.length} clienti...`,
      });

      // Map backend customer fields to frontend schema
      // Backend uses: customerProfile (PRIMARY KEY), vatNumber, fiscalCode, street, postalCode, etc.
      // Frontend expects: id (PRIMARY KEY), code, taxCode, address, cap, etc.
      const mappedCustomers = customers.map((c: any) => ({
        id: c.customerProfile || c.internalId || '', // Map customerProfile → id
        name: c.name || '',
        code: c.customerProfile || '', // Customer account number as code
        taxCode: c.fiscalCode || c.vatNumber || '', // Map fiscalCode/vatNumber → taxCode
        address: c.street || c.logisticsAddress || '', // Map street → address
        city: c.city || '',
        province: '', // Not provided by backend
        cap: c.postalCode || '', // Map postalCode → cap
        phone: c.phone || c.mobile || '', // Use phone or mobile
        email: c.pec || '', // Use PEC email
        fax: '', // Not provided by backend
        lastModified: c.lastSync ? new Date(c.lastSync * 1000).toISOString() : new Date().toISOString(),
        lastOrderDate: c.lastOrderDate || '',
        hash: c.hash || '',
      }));

      console.log('[CachePopulation] Mapped customers sample:', mappedCustomers.slice(0, 2));
      await db.customers.bulkPut(mappedCustomers as Customer[]);

      onProgress?.({
        stage: "customers",
        percentage: 40,
        message: `${customers.length} clienti salvati`,
      });

      // Stage 3: Populate products (40% → 60%)
      onProgress?.({
        stage: "products",
        percentage: 40,
        message: `Salvataggio ${products.length} prodotti...`,
      });

      // Ensure no undefined fields and map name to article
      const cleanedProducts = products.map((p: any) => {
        const cleaned: any = {};
        for (const key in p) {
          if (p[key] !== undefined) {
            cleaned[key] = p[key];
          }
        }
        // Backend stores article code in 'name' field, frontend expects 'article' field
        if (!cleaned.article && cleaned.name) {
          cleaned.article = cleaned.name;
        }
        return cleaned;
      });
      await db.products.bulkPut(cleanedProducts as Product[]);

      onProgress?.({
        stage: "products",
        percentage: 60,
        message: `${products.length} prodotti salvati`,
      });

      // Stage 4: Populate variants (60% → 80%)
      onProgress?.({
        stage: "variants",
        percentage: 60,
        message: `Salvataggio ${variants.length} varianti...`,
      });

      // Clear existing variants and add new ones (avoid key path errors with auto-increment)
      await db.productVariants.clear();
      const cleanedVariants = variants.map(({ id, ...rest }: any) => rest);
      await db.productVariants.bulkAdd(cleanedVariants as ProductVariant[]);

      onProgress?.({
        stage: "variants",
        percentage: 80,
        message: `${variants.length} varianti salvate`,
      });

      // Stage 5: Populate prices (80% → 95%)
      onProgress?.({
        stage: "prices",
        percentage: 80,
        message: `Salvataggio ${prices.length} prezzi...`,
      });

      // Clear existing prices and add new ones (avoid key path errors with auto-increment)
      await db.prices.clear();
      const cleanedPrices = prices.map(({ id, ...rest }: any) => rest);
      await db.prices.bulkAdd(cleanedPrices as Price[]);

      onProgress?.({
        stage: "prices",
        percentage: 95,
        message: `${prices.length} prezzi salvati`,
      });

      // Stage 6: Update metadata (95% → 100%)
      await db.cacheMetadata.bulkPut([
        {
          key: "customers",
          lastSynced: result.metadata.exportedAt,
          recordCount: customers.length,
          version: 1,
        },
        {
          key: "products",
          lastSynced: result.metadata.exportedAt,
          recordCount: products.length,
          version: 1,
        },
        {
          key: "prices",
          lastSynced: result.metadata.exportedAt,
          recordCount: prices.length,
          version: 1,
        },
      ]);

      const durationMs = Date.now() - startTime;

      onProgress?.({
        stage: "complete",
        percentage: 100,
        message: "Cache aggiornata con successo",
      });

      return {
        success: true,
        recordCounts: {
          customers: customers.length,
          products: products.length,
          variants: variants.length,
          prices: prices.length,
        },
        durationMs,
      };
    } catch (error) {
      console.error("[IndexedDB:CachePopulation]", {
        operation: "populateAllData",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Errore imprevisto",
      };
    }
  }

  /**
   * Check if cache needs refresh (more than 24 hours old)
   */
  async needsRefresh(): Promise<boolean> {
    const metadata = await db.cacheMetadata.get("customers");

    if (!metadata) {
      return true; // No cache, needs initial sync
    }

    const lastSync = new Date(metadata.lastSynced);
    const ageHours = (Date.now() - lastSync.getTime()) / 1000 / 60 / 60;

    return ageHours > 24;
  }

  /**
   * Get cache age in hours
   */
  async getCacheAge(): Promise<number | null> {
    const metadata = await db.cacheMetadata.get("customers");

    if (!metadata) {
      return null;
    }

    const lastSync = new Date(metadata.lastSynced);
    return (Date.now() - lastSync.getTime()) / 1000 / 60 / 60;
  }
}

export const cachePopulationService = CachePopulationService.getInstance();
