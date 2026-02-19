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

export interface BoxWithStats {
  name: string;
  itemsCount: number;
  totalQuantity: number;
  availableItems: number;
  reservedItems: number;
  soldItems: number;
  canDelete: boolean;
}
