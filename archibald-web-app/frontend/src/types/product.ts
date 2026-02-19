export interface Product {
  id: string;
  name: string;
  article: string;
  description: string;
  packageContent?: string;
  vat?: number;
  price?: number;
  lastModified: string;
  hash: string;
}

export interface ProductVariant {
  id?: number;
  productId: string;
  variantId: string;
  multipleQty: number;
  minQty: number;
  maxQty: number;
  packageContent: string;
}

export interface Price {
  id?: number;
  articleId: string;
  articleName: string;
  price: number;
  vat?: number;
  lastSynced: string;
}
