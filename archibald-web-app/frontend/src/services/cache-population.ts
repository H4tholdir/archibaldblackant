import { db } from '../db/schema';
import type { Customer, Product, ProductVariant, Price } from '../db/schema';

export interface CachePopulationProgress {
  stage: 'fetching' | 'customers' | 'products' | 'variants' | 'prices' | 'complete';
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
    onProgress?: (progress: CachePopulationProgress) => void
  ): Promise<CachePopulationResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Fetch data from backend
      onProgress?.({
        stage: 'fetching',
        percentage: 5,
        message: 'Scaricamento dati dal server...'
      });

      const response = await fetch('/api/cache/export', {
        headers: {
          'Authorization': `Bearer ${jwt}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      const { customers, products, variants, prices } = result.data;

      // Stage 2: Populate customers (20% → 40%)
      onProgress?.({
        stage: 'customers',
        percentage: 20,
        message: `Salvataggio ${customers.length} clienti...`
      });

      await db.customers.bulkPut(customers as Customer[]);

      onProgress?.({
        stage: 'customers',
        percentage: 40,
        message: `${customers.length} clienti salvati`
      });

      // Stage 3: Populate products (40% → 60%)
      onProgress?.({
        stage: 'products',
        percentage: 40,
        message: `Salvataggio ${products.length} prodotti...`
      });

      await db.products.bulkPut(products as Product[]);

      onProgress?.({
        stage: 'products',
        percentage: 60,
        message: `${products.length} prodotti salvati`
      });

      // Stage 4: Populate variants (60% → 80%)
      onProgress?.({
        stage: 'variants',
        percentage: 60,
        message: `Salvataggio ${variants.length} varianti...`
      });

      await db.productVariants.bulkPut(variants as ProductVariant[]);

      onProgress?.({
        stage: 'variants',
        percentage: 80,
        message: `${variants.length} varianti salvate`
      });

      // Stage 5: Populate prices (80% → 95%)
      onProgress?.({
        stage: 'prices',
        percentage: 80,
        message: `Salvataggio ${prices.length} prezzi...`
      });

      await db.prices.bulkPut(prices as Price[]);

      onProgress?.({
        stage: 'prices',
        percentage: 95,
        message: `${prices.length} prezzi salvati`
      });

      // Stage 6: Update metadata (95% → 100%)
      await db.cacheMetadata.bulkPut([
        {
          key: 'customers',
          lastSynced: result.metadata.exportedAt,
          recordCount: customers.length,
          version: 1
        },
        {
          key: 'products',
          lastSynced: result.metadata.exportedAt,
          recordCount: products.length,
          version: 1
        },
        {
          key: 'prices',
          lastSynced: result.metadata.exportedAt,
          recordCount: prices.length,
          version: 1
        }
      ]);

      const durationMs = Date.now() - startTime;

      onProgress?.({
        stage: 'complete',
        percentage: 100,
        message: 'Cache aggiornata con successo'
      });

      return {
        success: true,
        recordCounts: {
          customers: customers.length,
          products: products.length,
          variants: variants.length,
          prices: prices.length
        },
        durationMs
      };
    } catch (error) {
      console.error('[CachePopulation] Failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore imprevisto'
      };
    }
  }

  /**
   * Check if cache needs refresh (more than 24 hours old)
   */
  async needsRefresh(): Promise<boolean> {
    const metadata = await db.cacheMetadata.get('customers');

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
    const metadata = await db.cacheMetadata.get('customers');

    if (!metadata) {
      return null;
    }

    const lastSync = new Date(metadata.lastSynced);
    return (Date.now() - lastSync.getTime()) / 1000 / 60 / 60;
  }
}

export const cachePopulationService = CachePopulationService.getInstance();
