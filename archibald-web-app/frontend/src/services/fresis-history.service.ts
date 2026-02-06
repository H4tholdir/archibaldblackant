import { db } from "../db/schema";
import type { FresisHistoryOrder, PendingOrder } from "../db/schema";

class FresisHistoryService {
  private static instance: FresisHistoryService;

  static getInstance(): FresisHistoryService {
    if (!FresisHistoryService.instance) {
      FresisHistoryService.instance = new FresisHistoryService();
    }
    return FresisHistoryService.instance;
  }

  async archiveOrders(
    orders: PendingOrder[],
    mergedOrderId: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const historyOrders: FresisHistoryOrder[] = orders
      .filter((o) => o.subClientCodice && o.subClientData)
      .map((order) => ({
        id: crypto.randomUUID(),
        originalPendingOrderId: order.id,
        subClientCodice: order.subClientCodice!,
        subClientName:
          order.subClientName ?? order.subClientData!.ragioneSociale,
        subClientData: order.subClientData!,
        customerId: order.customerId,
        customerName: order.customerName,
        items: order.items,
        discountPercent: order.discountPercent,
        targetTotalWithVAT: order.targetTotalWithVAT,
        shippingCost: order.shippingCost,
        shippingTax: order.shippingTax,
        mergedIntoOrderId: mergedOrderId,
        mergedAt: now,
        createdAt: order.createdAt,
        updatedAt: now,
      }));

    if (historyOrders.length > 0) {
      await db.fresisHistory.bulkAdd(historyOrders);
    }
  }

  async getAllHistoryOrders(): Promise<FresisHistoryOrder[]> {
    return db.fresisHistory.orderBy("createdAt").reverse().toArray();
  }

  async searchHistoryOrders(query: string): Promise<FresisHistoryOrder[]> {
    const lowerQuery = query.toLowerCase();
    const all = await db.fresisHistory.toArray();
    return all.filter((order) => {
      if (order.subClientName?.toLowerCase().includes(lowerQuery)) return true;
      if (order.subClientCodice?.toLowerCase().includes(lowerQuery))
        return true;
      if (order.customerName?.toLowerCase().includes(lowerQuery)) return true;
      if (order.createdAt?.includes(query)) return true;
      if (order.mergedAt?.includes(query)) return true;
      if (order.notes?.toLowerCase().includes(lowerQuery)) return true;
      for (const item of order.items) {
        if (item.articleCode?.toLowerCase().includes(lowerQuery)) return true;
        if (item.productName?.toLowerCase().includes(lowerQuery)) return true;
        if (item.description?.toLowerCase().includes(lowerQuery)) return true;
      }
      return false;
    });
  }

  async updateHistoryOrder(
    id: string,
    data: Partial<FresisHistoryOrder>,
  ): Promise<void> {
    await db.fresisHistory.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteHistoryOrder(id: string): Promise<void> {
    await db.fresisHistory.delete(id);
  }

  async getHistoryOrderById(
    id: string,
  ): Promise<FresisHistoryOrder | undefined> {
    return db.fresisHistory.get(id);
  }

  async getLastSyncTime(): Promise<string | null> {
    try {
      const meta = await db.cacheMetadata.get("fresisLifecycle");
      return meta?.lastSynced ?? null;
    } catch {
      return null;
    }
  }

  async syncOrderLifecycles(): Promise<number> {
    const allRecords = await db.fresisHistory.toArray();
    const trackable = allRecords.filter(
      (r) => r.archibaldOrderId && r.currentState !== "fatturato",
    );

    if (trackable.length === 0) return 0;

    const uniqueIds = [...new Set(trackable.map((r) => r.archibaldOrderId!))];

    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) return 0;

    const response = await fetch(
      `/api/orders/lifecycle-summary?ids=${uniqueIds.join(",")}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );

    if (!response.ok) return 0;

    const json = await response.json();
    if (!json.success || !json.data) return 0;

    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const record of trackable) {
      const lifecycle = json.data[record.archibaldOrderId!];
      if (!lifecycle) continue;

      await db.fresisHistory.update(record.id, {
        archibaldOrderNumber: lifecycle.orderNumber ?? undefined,
        currentState: lifecycle.currentState ?? undefined,
        stateUpdatedAt: now,
        ddtNumber: lifecycle.ddtNumber ?? undefined,
        ddtDeliveryDate: lifecycle.ddtDeliveryDate ?? undefined,
        trackingNumber: lifecycle.trackingNumber ?? undefined,
        trackingUrl: lifecycle.trackingUrl ?? undefined,
        trackingCourier: lifecycle.trackingCourier ?? undefined,
        deliveryCompletedDate: lifecycle.deliveryCompletedDate ?? undefined,
        invoiceNumber: lifecycle.invoiceNumber ?? undefined,
        invoiceDate: lifecycle.invoiceDate ?? undefined,
        invoiceAmount: lifecycle.invoiceAmount ?? undefined,
        updatedAt: now,
      });
      updatedCount++;
    }

    await db.cacheMetadata.put({
      key: "fresisLifecycle",
      lastSynced: now,
      recordCount: updatedCount,
      version: 1,
    });

    return updatedCount;
  }
}

export const fresisHistoryService = FresisHistoryService.getInstance();
