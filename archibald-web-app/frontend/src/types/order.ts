export interface OrderItem {
  articleCode: string; // USER INPUT: Article name (e.g., "H129FSQ.104.023")
  articleId?: string; // Selected variant ID (e.g., "016869K2") - populated by bot
  productName?: string; // Nome prodotto da autocomplete
  description: string;
  quantity: number;
  price: number;
  discount?: number; // Sconto percentuale (es. 10 per 10%)
  packageContent?: number; // Selected package content (e.g., 5) - populated by bot
}

export interface OrderData {
  customerId: string;
  customerName: string;
  items: OrderItem[];
}
