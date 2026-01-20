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
  // VAT and price tracking (from migration 002)
  vat?: number;
  vatSource?: string;
  vatUpdatedAt?: number;
  priceSource?: string;
  priceUpdatedAt?: number;
  // Price table fields (from migration 003)
  accountCode?: string;
  accountDescription?: string;
  priceValidFrom?: string;
  priceValidTo?: string;
  priceQtyFrom?: string;
  priceQtyTo?: string;
  priceCurrency?: string;
}

export interface ProductsResponse {
  success: boolean;
  data: {
    products: Product[];
    totalCount: number;
    returnedCount: number;
    totalMatches?: number;
    limited: boolean;
    grouped?: boolean;
  };
}

export interface ProductVariantsResponse {
  success: boolean;
  data: {
    productName: string;
    variantCount: number;
    variants: Product[];
  };
  error?: string;
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
 * Get all package variants for a product by article name
 */
export async function getProductVariants(
  token: string,
  productName: string
): Promise<ProductVariantsResponse> {
  const encodedName = encodeURIComponent(productName);
  const response = await fetch(`/api/products/${encodedName}/variants`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("401");
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch product variants");
  }

  return response.json();
}

/**
 * Get products with optional grouping by article name
 */
export async function getProducts(
  token: string,
  searchQuery?: string,
  limit: number = 100,
  grouped: boolean = false // NEW: optional grouping parameter
): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  if (searchQuery) params.append("search", searchQuery);
  params.append("limit", limit.toString());

  if (grouped) {
    params.append("grouped", "true");
  }

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

/**
 * Get price change history for a specific product
 */
export async function getProductPriceHistory(
  token: string,
  productId: string,
  limit: number = 100,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/prices/${productId}/history?limit=${limit}`,
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

export interface SyncProductsResult {
  success: boolean;
  productsProcessed?: number;
  newProducts?: number;
  updatedProducts?: number;
  duration?: number;
  error?: string;
}

/**
 * Trigger manual products sync from Archibald
 */
export async function syncProducts(): Promise<SyncProductsResult> {
  const response = await fetch("/api/products/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("archibald_jwt")}`,
    },
  });

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error("Sincronizzazione già in corso");
    }
    if (response.status === 401) {
      throw new Error("Sessione scaduta");
    }
    throw new Error(`Errore sincronizzazione: ${response.status}`);
  }

  return response.json();
}
