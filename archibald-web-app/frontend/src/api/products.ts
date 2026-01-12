// API client for products endpoints

export interface Product {
  id: string;
  name: string;
  articleName: string;
  variantId: string;
  description?: string;
  groupCode?: string;
  price?: number;
  packageContent?: string;
  minQty?: number;
  multipleQty?: number;
  maxQty?: number;
}

/**
 * Fetch all package variants for a given article name.
 * Returns variants ordered by multipleQty DESC (highest package first).
 *
 * @param articleName - The article name to search for (e.g., "H129FSQ.104.023")
 * @returns Array of product variants, or empty array if not found
 * @throws Error if the API request fails
 */
export async function getProductVariants(
  articleName: string,
): Promise<Product[]> {
  const response = await fetch(
    `/api/products/variants?name=${encodeURIComponent(articleName)}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch product variants");
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to fetch product variants");
  }

  return result.data;
}
