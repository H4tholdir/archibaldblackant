// API client for products endpoints

const API_BASE_URL = "";

export interface Product {
  id: string;
  name: string;
  articleName?: string;
  variantId?: string;
  description?: string;
  groupCode?: string;
  price?: number;
  packageContent?: string;
  minQty?: number;
  multipleQty?: number;
  maxQty?: number;
  imageUrl?: string;
  imageLocalPath?: string;
  imageDownloadedAt?: number;
  searchName?: string;
  priceUnit?: string;
  productGroupId?: string;
  productGroupDescription?: string;
}

export interface ProductsResponse {
  success: boolean;
  data: {
    products: Product[];
    totalCount: number;
    returnedCount: number;
    totalMatches?: number;
    limited: boolean;
  };
}

export interface SearchResult {
  id: string;
  name: string;
  description?: string;
  packageContent?: string;
  multipleQty?: number;
  price?: number;
  confidence: number;
  matchReason: string;
}

export interface SearchResponse {
  success: boolean;
  data: SearchResult[];
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

/**
 * Get products with optional search filter
 */
export async function getProducts(
  token: string,
  searchQuery?: string,
  limit: number = 100,
): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  if (searchQuery) params.append("search", searchQuery);
  params.append("limit", limit.toString());

  const response = await fetch(`${API_BASE_URL}/api/products?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fuzzy search products with confidence scores
 */
export async function searchProducts(
  token: string,
  query: string,
  limit: number = 10,
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  params.append("q", query);
  params.append("limit", limit.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/products/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get product change history
 */
export async function getProductChanges(
  token: string,
  productId: string,
  limit: number = 10,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/products/${productId}/changes?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
