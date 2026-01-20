// API client for products endpoints

const API_BASE_URL = "";

export interface Product {
  // ========== CORE FIELDS ==========
  id: string;
  name: string;
  articleName?: string;
  variantId?: string;
  description?: string;

  // ========== IDENTIFICATION ==========
  searchName?: string;
  displayProductNumber?: string;

  // ========== CHARACTERISTICS ==========
  figure?: string; // FIGURA
  size?: string; // GRANDEZZA
  packageContent?: string;
  groupCode?: string;
  productGroupId?: string;
  productGroupDescription?: string;
  bulkArticleId?: string; // ID IN BLOCCO DELL'ARTICOLO
  legPackage?: string; // PACCO GAMBA
  configurationId?: string; // ID DI CONFIGURAZIONE
  pcsStandardConfigurationId?: string; // PCS ID DI CONFIGURAZIONE STANDARD

  // ========== QUANTITY ==========
  minQty?: number;
  multipleQty?: number;
  maxQty?: number;
  standardQty?: string; // QTÀ STANDARD (string in DB)
  defaultQty?: string; // QTÀ PREDEFINITA (string in DB)
  unitId?: string; // ID UNITÀ

  // ========== PRICING & DISCOUNTS ==========
  price?: number;
  priceSource?: string;
  priceUpdatedAt?: number;
  priceCurrency?: string;
  vat?: number;
  vatSource?: string;
  vatUpdatedAt?: number;
  priceUnit?: string;
  lineDiscount?: string; // SCONTO LINEA
  totalAbsoluteDiscount?: string; // SCONTO ASSOLUTO TOTALE
  purchPrice?: string; // PURCH PRICE

  // ========== METADATA ==========
  createdBy?: string;
  createdDate?: string;
  modifiedBy?: string;
  modifiedDatetime?: string;
  dataAreaId?: string;
  orderableArticle?: string; // ARTICOLO ORDINABILE
  stopped?: string; // FERMATO
  productId?: string;

  // ========== SYSTEM ==========
  hash?: string;
  lastSync?: number;

  // ========== EXCEL LISTINO FIELDS (from Phase 4.1) ==========
  accountCode?: string;
  accountDescription?: string;
  priceValidFrom?: string;
  priceValidTo?: string;
  priceQtyFrom?: string;
  priceQtyTo?: string;
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
 * Note: PDF parsing can take 3-5 minutes, so we use a long timeout
 */
export async function syncProducts(): Promise<SyncProductsResult> {
  // Create AbortController with 5-minute timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes

  try {
    const response = await fetch("/api/products/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("archibald_jwt")}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timeout: la sincronizzazione sta richiedendo troppo tempo");
    }

    throw error;
  }
}
