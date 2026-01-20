import { PriceDatabase, Price } from "./price-db";
import { ProductDatabase, Product } from "./product-db";
import { logger } from "./logger";

export interface PriceMatchResult {
  totalPrices: number;
  matchedProducts: number;
  unmatchedPrices: number;
  variantMismatches: number;
  nullPrices: number;
  updatedProducts: number;
}

export interface UnmatchedPrice {
  productId: string;
  productName: string;
  itemSelection: string | null;
  reason: "product_not_found" | "variant_mismatch" | "null_price";
}

/**
 * Price Matching Service
 *
 * Matches prices from prices.db to products in products.db
 * Uses multi-level strategy: productId + itemSelection matching
 */
export class PriceMatchingService {
  private static instance: PriceMatchingService;
  private priceDb: PriceDatabase;
  private productDb: ProductDatabase;

  private constructor() {
    this.priceDb = PriceDatabase.getInstance();
    this.productDb = ProductDatabase.getInstance();
  }

  static getInstance(): PriceMatchingService {
    if (!PriceMatchingService.instance) {
      PriceMatchingService.instance = new PriceMatchingService();
    }
    return PriceMatchingService.instance;
  }

  /**
   * Match all prices from prices.db to products in products.db
   * Updates product price/vat fields with priceSource='prices-db'
   *
   * @param excelVatMap Optional map of productId → IVA percentage from Excel
   * @returns Match statistics and unmatched prices list
   */
  async matchPricesToProducts(
    excelVatMap?: Map<string, number>
  ): Promise<{
    result: PriceMatchResult;
    unmatchedPrices: UnmatchedPrice[];
  }> {
    const startTime = Date.now();
    logger.info("[PriceMatchingService] Starting price matching...");

    const unmatchedPrices: UnmatchedPrice[] = [];
    let matchedProducts = 0;
    let unmatchedPricesCount = 0;
    let variantMismatches = 0;
    let nullPrices = 0;
    let updatedProducts = 0;

    // Get all prices from prices.db
    const allPriceRecords = this.priceDb.getAllPrices();
    const totalPrices = allPriceRecords.length;

    logger.info(`[PriceMatchingService] Processing ${totalPrices} price records`);

    for (const priceRecord of allPriceRecords) {
      // Skip if price is null
      if (
        priceRecord.unitPrice === null ||
        priceRecord.unitPrice === undefined
      ) {
        nullPrices++;
        unmatchedPrices.push({
          productId: priceRecord.productId,
          productName: priceRecord.productName,
          itemSelection: priceRecord.itemSelection,
          reason: "null_price",
        });
        continue;
      }

      // Find matching product variants in products.db
      const matchingProducts = this.productDb.getProductsByName(
        priceRecord.productName
      );

      if (matchingProducts.length === 0) {
        unmatchedPricesCount++;
        unmatchedPrices.push({
          productId: priceRecord.productId,
          productName: priceRecord.productName,
          itemSelection: priceRecord.itemSelection,
          reason: "product_not_found",
        });
        continue;
      }

      // Match by item selection (variant)
      const matchedProduct = this.matchVariant(
        matchingProducts,
        priceRecord.itemSelection
      );

      if (!matchedProduct) {
        variantMismatches++;
        unmatchedPrices.push({
          productId: priceRecord.productId,
          productName: priceRecord.productName,
          itemSelection: priceRecord.itemSelection,
          reason: "variant_mismatch",
        });
        continue;
      }

      // Update product with price from prices.db
      const vatPercentage =
        excelVatMap?.get(priceRecord.productId) ?? matchedProduct.vat ?? null;

      const updated = this.productDb.updateProductPrice(
        matchedProduct.id,
        priceRecord.unitPrice,
        vatPercentage,
        "prices-db", // priceSource
        vatPercentage && excelVatMap?.has(priceRecord.productId) ? "excel" : null // vatSource (Excel if provided, else null)
      );

      if (updated) {
        matchedProducts++;
        updatedProducts++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info("[PriceMatchingService] Price matching completed", {
      duration,
      totalPrices,
      matchedProducts,
      unmatchedPricesCount,
      variantMismatches,
      nullPrices,
      updatedProducts,
    });

    return {
      result: {
        totalPrices,
        matchedProducts,
        unmatchedPrices: unmatchedPricesCount,
        variantMismatches,
        nullPrices,
        updatedProducts,
      },
      unmatchedPrices,
    };
  }

  /**
   * Match variant by itemSelection
   * Maps K2 → "5 colli", K3 → "1 collo", etc.
   */
  private matchVariant(
    products: Product[],
    itemSelection: string | null
  ): Product | null {
    if (!itemSelection) {
      // No variant specified - return first product
      return products[0];
    }

    // Map item selection to package content
    // K2 = 5 colli, K3 = 1 collo (adjust mapping based on real data)
    const variantMap: Record<string, string> = {
      K2: "5 colli",
      K3: "1 collo",
      K0: "10 colli", // Example - adjust based on real data
      K1: "2 colli",
    };

    const expectedPackage = variantMap[itemSelection];

    if (expectedPackage) {
      const matched = products.find((p) => p.packageContent === expectedPackage);
      if (matched) return matched;
    }

    // Fallback: try exact item selection match in product ID suffix
    const matched = products.find((p) => p.id.endsWith(itemSelection));
    if (matched) return matched;

    // No match found
    return null;
  }
}
