import type { Product, ProductVariant } from "../types/product";
import type { CacheMetadata } from "../types/cache";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  price?: number;
}

export interface PackagingItem {
  variant: ProductVariant;
  packageCount: number;
  packageSize: number;
  totalPieces: number;
}

export interface PackagingResult {
  success: boolean;
  quantity?: number;
  totalPackages?: number;
  breakdown?: PackagingItem[];
  error?: string;
  suggestedQuantity?: number;
}

function mapApiProductToLocal(p: any): Product {
  return {
    id: p.id || "",
    name: p.name || "",
    article: p.articleName || p.name || "",
    description: p.description || "",
    packageContent: p.packageContent,
    vat: p.vat,
    price: p.price,
    lastModified: p.modifiedDatetime || new Date().toISOString(),
    hash: p.hash || "",
  };
}

function mapApiVariant(v: any): ProductVariant {
  return {
    productId: v.name || v.productId || "",
    variantId: v.variantId || v.id || "",
    multipleQty: v.multipleQty ?? 1,
    minQty: v.minQty ?? 1,
    maxQty: v.maxQty ?? 999999,
    packageContent: v.packageContent || "",
  };
}

export class ProductService {
  async searchProducts(
    query: string,
    limit: number = 50,
  ): Promise<ProductWithDetails[]> {
    try {
      const params = new URLSearchParams();
      if (query && query.trim().length > 0) {
        params.append("search", query);
      }
      params.append("limit", String(limit));
      params.append("grouped", "true");

      const response = await fetchWithRetry(`/api/products?${params}`);
      if (!response.ok) throw new Error("API fetch failed");

      const data = await response.json();
      const apiProducts: any[] = data.data?.products || [];

      return apiProducts.map((p) => {
        const product = mapApiProductToLocal(p);
        const variants: ProductVariant[] = (p.variantPackages || []).length > 0
          ? (p.variantPackages || []).map((_pkg: string, i: number) => ({
              productId: p.name,
              variantId: `${p.name}-var-${i}`,
              multipleQty: p.multipleQty ?? 1,
              minQty: p.minQty ?? 1,
              maxQty: p.maxQty ?? 999999,
              packageContent: _pkg,
            }))
          : [];

        return {
          ...product,
          variants,
          price: p.price,
        };
      });
    } catch (error) {
      console.error("[ProductService] searchProducts failed:", error);
      return [];
    }
  }

  async getProductById(id: string): Promise<ProductWithDetails | null> {
    try {
      const params = new URLSearchParams();
      params.append("search", id);
      params.append("limit", "100");

      const response = await fetchWithRetry(`/api/products?${params}`);
      if (!response.ok) return null;

      const data = await response.json();
      const apiProducts: any[] = data.data?.products || [];

      const match = apiProducts.find((p: any) => p.id === id);
      if (!match) return null;

      const product = mapApiProductToLocal(match);
      const variants = await this.getProductVariantsByName(match.name);

      return {
        ...product,
        variants,
        price: match.price,
      };
    } catch (error) {
      console.error("[ProductService] Failed to get product by ID:", error);
      return null;
    }
  }

  async getVariantByQuantity(
    productId: string,
    quantity: number,
  ): Promise<ProductVariant | null> {
    try {
      const variants = await this.getProductVariantsByName(productId);
      if (variants.length === 0) return null;

      variants.sort((a, b) => a.minQty - b.minQty);

      const matchingVariants = variants.filter(
        (v) => quantity >= v.minQty && quantity <= v.maxQty,
      );

      if (matchingVariants.length > 0) {
        return matchingVariants[0];
      }

      if (quantity < variants[0].minQty) {
        return null;
      }

      return variants[variants.length - 1];
    } catch (error) {
      console.error(
        "[ProductService] Failed to get variant by quantity:",
        error,
      );
      return null;
    }
  }

  async calculateOptimalPackaging(
    productNameOrId: string,
    quantity: number,
  ): Promise<PackagingResult> {
    try {
      const variants = await this.getProductVariantsByName(productNameOrId);

      if (variants.length === 0) {
        return {
          success: false,
          error: "Nessuna variante disponibile per questo prodotto",
          suggestedQuantity: quantity,
        };
      }

      return this.calculatePackagingFromVariants(variants, quantity);
    } catch (error) {
      console.error(
        "[ProductService] Failed to calculate optimal packaging:",
        error,
      );
      return {
        success: false,
        error: "Errore durante il calcolo del confezionamento",
        suggestedQuantity: quantity,
      };
    }
  }

  private calculatePackagingFromVariants(
    variants: ProductVariant[],
    quantity: number,
  ): PackagingResult {
    if (variants.length === 0) {
      return {
        success: false,
        error: "Nessuna variante disponibile per questo prodotto",
        suggestedQuantity: quantity,
      };
    }

    const variantsWithSize = variants.map((v) => ({
      variant: v,
      packageSize: v.multipleQty,
    }));

    variantsWithSize.sort((a, b) => b.packageSize - a.packageSize);

    let remainingQty = quantity;
    const packagingBreakdown: PackagingItem[] = [];

    for (const { variant, packageSize } of variantsWithSize) {
      if (remainingQty === 0) break;

      const packagesNeeded = Math.floor(remainingQty / packageSize);

      if (packagesNeeded > 0) {
        const totalPieces = packagesNeeded * packageSize;

        packagingBreakdown.push({
          variant,
          packageCount: packagesNeeded,
          packageSize,
          totalPieces,
        });

        remainingQty -= totalPieces;
      }
    }

    if (remainingQty > 0) {
      const minVariant = variantsWithSize.reduce((min, curr) =>
        curr.variant.minQty < min.variant.minQty ? curr : min,
      );

      return {
        success: false,
        error: `Quantità minima ordinabile: ${minVariant.variant.minQty} pezzi (${Math.ceil(minVariant.variant.minQty / minVariant.packageSize)} confezione da ${minVariant.packageSize} ${minVariant.packageSize === 1 ? "pezzo" : "pezzi"})`,
        suggestedQuantity: minVariant.variant.minQty,
      };
    }

    const totalPackages = packagingBreakdown.reduce(
      (sum, item) => sum + item.packageCount,
      0,
    );

    return {
      success: true,
      quantity,
      totalPackages,
      breakdown: packagingBreakdown,
    };
  }

  async syncProducts(): Promise<void> {
    console.log("[ProductService] syncProducts is a no-op (server is source of truth)");
  }

  async getCacheMetadata(): Promise<CacheMetadata | null> {
    return null;
  }

  private async getProductVariantsByName(
    productName: string,
  ): Promise<ProductVariant[]> {
    try {
      const encodedName = encodeURIComponent(productName);
      const response = await fetchWithRetry(
        `/api/products/${encodedName}/variants`,
      );

      if (!response.ok) return [];

      const data = await response.json();
      const apiVariants: any[] = data.data?.variants || [];

      return apiVariants.map(mapApiVariant);
    } catch (error) {
      console.error("[ProductService] Failed to get product variants:", error);
      return [];
    }
  }
}

// Singleton instance
export const productService = new ProductService();
