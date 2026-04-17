import type { Customer } from './local-customer';
import type { SubClient } from './sub-client';

type OrderItem = {
  id: string;
  productId: string;
  article: string;
  productName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discount: number;
  subtotal: number;
  vat: number;
  total: number;
  originalListPrice?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{
    warehouseItemId: number;
    boxName: string;
    quantity: number;
  }>;
  productGroupKey?: string;
  isGhostArticle?: boolean;
  ghostArticleSource?: 'history' | 'manual';
};

type DraftPayload = {
  customer: Customer | null;
  subClient: SubClient | null;
  items: OrderItem[];
  globalDiscountPercent: string;
  notes: string;
  deliveryAddressId: number | null;
  noShipping: boolean;
};

type DraftScalarFields = Omit<DraftPayload, 'items'>;

const EMPTY_DRAFT_PAYLOAD: DraftPayload = {
  customer: null,
  subClient: null,
  items: [],
  globalDiscountPercent: '0',
  notes: '',
  deliveryAddressId: null,
  noShipping: false,
};

export {
  type OrderItem,
  type DraftPayload,
  type DraftScalarFields,
  EMPTY_DRAFT_PAYLOAD,
};
