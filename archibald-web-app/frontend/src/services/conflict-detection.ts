import { db } from "../db/schema";

export interface ConflictReport {
  hasConflicts: boolean;
  staleEntities: string[];
  cacheAge: {
    customers: Date | null;
    products: Date | null;
    prices: Date | null;
  };
}

export class ConflictDetectionService {
  private static instance: ConflictDetectionService;
  private static readonly STALE_THRESHOLD_HOURS = 72; // 3 days per Phase 8-08

  private constructor() {}

  static getInstance(): ConflictDetectionService {
    if (!ConflictDetectionService.instance) {
      ConflictDetectionService.instance = new ConflictDetectionService();
    }
    return ConflictDetectionService.instance;
  }

  /**
   * Detect stale cached data that exceeds 72-hour threshold
   * Returns conflict report with stale entities and cache ages
   */
  async detectStaleData(): Promise<ConflictReport> {
    try {
      // Fetch cache metadata for all entity types
      const [customersMetadata, productsMetadata, pricesMetadata] =
        await Promise.all([
          db.cacheMetadata.get("customers"),
          db.cacheMetadata.get("products"),
          db.cacheMetadata.get("prices"),
        ]);

      const now = new Date();
      const staleEntities: string[] = [];

      // Check customers cache age
      const customersDate = customersMetadata
        ? new Date(customersMetadata.lastSynced)
        : null;
      const customersAgeHours = customersDate
        ? (now.getTime() - customersDate.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (customersAgeHours > ConflictDetectionService.STALE_THRESHOLD_HOURS) {
        staleEntities.push("clienti");
      }

      // Check products cache age
      const productsDate = productsMetadata
        ? new Date(productsMetadata.lastSynced)
        : null;
      const productsAgeHours = productsDate
        ? (now.getTime() - productsDate.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (productsAgeHours > ConflictDetectionService.STALE_THRESHOLD_HOURS) {
        staleEntities.push("prodotti");
      }

      // Check prices cache age
      const pricesDate = pricesMetadata
        ? new Date(pricesMetadata.lastSynced)
        : null;
      const pricesAgeHours = pricesDate
        ? (now.getTime() - pricesDate.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (pricesAgeHours > ConflictDetectionService.STALE_THRESHOLD_HOURS) {
        staleEntities.push("prezzi");
      }

      const hasConflicts = staleEntities.length > 0;

      const report: ConflictReport = {
        hasConflicts,
        staleEntities,
        cacheAge: {
          customers: customersDate,
          products: productsDate,
          prices: pricesDate,
        },
      };

      console.log("[ConflictDetection] Report:", {
        hasConflicts,
        staleEntities,
        ages: {
          customers: customersAgeHours.toFixed(1) + "h",
          products: productsAgeHours.toFixed(1) + "h",
          prices: pricesAgeHours.toFixed(1) + "h",
        },
      });

      return report;
    } catch (error) {
      console.error("[ConflictDetection] Detection failed:", error);
      // Return safe default (no conflicts) on error
      return {
        hasConflicts: false,
        staleEntities: [],
        cacheAge: {
          customers: null,
          products: null,
          prices: null,
        },
      };
    }
  }

  /**
   * Calculate age in days for display purposes
   */
  getDaysOld(date: Date | null): number {
    if (!date) return Infinity;
    const now = new Date();
    const ageMs = now.getTime() - date.getTime();
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  }
}

export const conflictDetectionService = ConflictDetectionService.getInstance();
