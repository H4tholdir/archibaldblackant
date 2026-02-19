export interface WarehouseItem {
  id?: number;
  articleCode: string;
  description: string;
  quantity: number;
  boxName: string;
  reservedForOrder?: string;
  soldInOrder?: string;
  uploadedAt: string;
  deviceId?: string;
  customerName?: string;
  subClientName?: string;
  orderDate?: string;
  orderNumber?: string;
}

export interface WarehouseMetadata {
  id?: number;
  fileName: string;
  uploadedAt: string;
  totalItems: number;
  totalQuantity: number;
  boxesCount: number;
}
