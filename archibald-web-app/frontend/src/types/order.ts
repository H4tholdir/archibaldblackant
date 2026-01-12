export interface OrderItem {
  articleCode: string;
  productName?: string; // Nome prodotto da autocomplete
  description: string;
  quantity: number;
  price: number;
  discount?: number; // Sconto percentuale (es. 10 per 10%)
}

export interface OrderData {
  customerId: string;
  customerName: string;
  items: OrderItem[];
}
