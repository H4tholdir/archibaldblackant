import { db } from "../db/schema";
import type { FresisHistoryOrder, PendingOrder } from "../db/schema";
import { generateArcaData } from "../utils/arca-document-generator";

export function parseLinkedIds(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* not JSON */
  }
  return [value];
}

export function serializeLinkedIds(ids: string[]): string {
  if (ids.length === 1) return ids[0];
  return JSON.stringify(ids);
}

class FresisHistoryService {
  private static instance: FresisHistoryService;

  static getInstance(): FresisHistoryService {
    if (!FresisHistoryService.instance) {
      FresisHistoryService.instance = new FresisHistoryService();
    }
    return FresisHistoryService.instance;
  }

  private getToken(): string | null {
    return localStorage.getItem("archibald_jwt");
  }

  private async fetchNextFtNumber(esercizio: string): Promise<number | null> {
    try {
      const token = this.getToken();
      if (!token) return null;
      const response = await fetch(
        `/api/fresis-history/next-ft-number?esercizio=${esercizio}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.ftNumber ?? null;
    } catch {
      return null;
    }
  }

  async archiveOrders(
    orders: PendingOrder[],
    mergedOrderId?: string,
  ): Promise<FresisHistoryOrder[]> {
    const now = new Date().toISOString();
    const esercizio = String(new Date().getFullYear());
    const eligible = orders.filter((o) => o.subClientCodice && o.subClientData);

    const historyOrders: FresisHistoryOrder[] = [];

    for (const order of eligible) {
      const ftNumber = await this.fetchNextFtNumber(esercizio);
      let arcaDataStr: string | undefined;
      let invoiceNumber: string | undefined;

      if (ftNumber !== null) {
        const arcaData = generateArcaData(order, ftNumber, esercizio);
        arcaDataStr = JSON.stringify(arcaData);
        invoiceNumber = `FT ${ftNumber}/${esercizio}`;
      }

      historyOrders.push({
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
        revenue: order.revenue,
        mergedIntoOrderId: mergedOrderId,
        mergedAt: mergedOrderId ? now : undefined,
        createdAt: order.createdAt,
        updatedAt: now,
        arcaData: arcaDataStr,
        invoiceNumber,
        archibaldOrderNumber: invoiceNumber,
        source: "app" as const,
      });
    }

    if (historyOrders.length > 0) {
      await db.fresisHistory.bulkAdd(historyOrders);
      await this.uploadToServer(historyOrders);
    }

    return historyOrders;
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
      if (order.invoiceNumber?.toLowerCase().includes(lowerQuery)) return true;
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
    const updatedAt = new Date().toISOString();
    await db.fresisHistory.update(id, {
      ...data,
      updatedAt,
    });

    const updated = await db.fresisHistory.get(id);
    if (updated) {
      await this.uploadToServer([updated]);

      // Post-link: fetch lifecycle state from the linked order
      if (data.archibaldOrderId && updated.archibaldOrderId) {
        await this.fetchAndApplyLifecycle(id, updated.archibaldOrderId);
      }
    }
  }

  private async fetchAndApplyLifecycle(
    historyId: string,
    archibaldOrderId: string,
  ): Promise<void> {
    try {
      const token = this.getToken();
      if (!token) return;

      const linkedIds = parseLinkedIds(archibaldOrderId);
      if (linkedIds.length === 0) return;

      const response = await fetch(
        `/api/orders/lifecycle-summary?ids=${linkedIds.join(",")}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) return;

      const json = await response.json();
      if (!json.success || !json.data) return;

      const lifecycle = json.data[linkedIds[0]];
      if (!lifecycle) return;

      const now = new Date().toISOString();
      await db.fresisHistory.update(historyId, {
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
        invoiceClosed: lifecycle.invoiceClosed ?? undefined,
        invoiceRemainingAmount: lifecycle.invoiceRemainingAmount ?? undefined,
        invoiceDueDate: lifecycle.invoiceDueDate ?? undefined,
        updatedAt: now,
      });

      const refreshed = await db.fresisHistory.get(historyId);
      if (refreshed) {
        await this.uploadToServer([refreshed]);
      }
    } catch {
      // Non-critical: lifecycle sync will catch up later
    }
  }

  async deleteHistoryOrder(id: string): Promise<void> {
    await db.fresisHistory.delete(id);
    await this.deleteFromServer(id);
  }

  async deleteFromArchibald(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, message: "Non autenticato" };
    }

    const response = await fetch(
      `/api/fresis-history/${id}/delete-from-archibald`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.error || "Errore durante la cancellazione",
      };
    }

    // Also delete from local IndexedDB since server already deleted it
    await db.fresisHistory.delete(id);

    return { success: true, message: data.message };
  }

  async editInArchibald(
    id: string,
    modifications: Array<
      | { type: "update"; rowIndex: number; articleCode: string; quantity: number; discount?: number }
      | { type: "add"; articleCode: string; quantity: number; discount?: number }
      | { type: "delete"; rowIndex: number }
    >,
    updatedItems: any[],
  ): Promise<{ success: boolean; message: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, message: "Non autenticato" };
    }

    const response = await fetch(
      `/api/fresis-history/${id}/edit-in-archibald`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ modifications, updatedItems }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.error || "Errore durante la modifica",
      };
    }

    return { success: true, message: data.message };
  }

  async reassignMergedOrderId(
    oldMergedId: string,
    newMergedId: string,
  ): Promise<number> {
    const entries = await db.fresisHistory
      .filter((r) => r.mergedIntoOrderId === oldMergedId)
      .toArray();

    if (entries.length === 0) return 0;

    const now = new Date().toISOString();
    for (const entry of entries) {
      await db.fresisHistory.update(entry.id, {
        mergedIntoOrderId: newMergedId,
        updatedAt: now,
      });
    }

    const updated = await db.fresisHistory.bulkGet(entries.map((e) => e.id));
    const toUpload = updated.filter(Boolean) as FresisHistoryOrder[];
    if (toUpload.length > 0) {
      await this.uploadToServer(toUpload);
    }

    return entries.length;
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

  async uploadToServer(records: FresisHistoryOrder[]): Promise<boolean> {
    try {
      const token = this.getToken();
      if (!token) return false;

      const response = await fetch("/api/fresis-history/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records }),
      });

      return response.ok;
    } catch (error) {
      console.error("[FresisHistory] Upload to server failed:", error);
      return false;
    }
  }

  async syncFromServer(): Promise<number> {
    try {
      const token = this.getToken();
      if (!token) return 0;

      const response = await fetch("/api/fresis-history", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return 0;

      const { records } = await response.json();
      if (!Array.isArray(records) || records.length === 0) {
        return 0;
      }

      const serverIds = new Set(records.map((r: FresisHistoryOrder) => r.id));
      let mergedCount = 0;

      for (const serverRecord of records as FresisHistoryOrder[]) {
        const local = await db.fresisHistory.get(serverRecord.id);

        if (!local || serverRecord.updatedAt > local.updatedAt) {
          await db.fresisHistory.put(serverRecord);
          mergedCount++;
        }
      }

      // Remove local records that were synced but no longer on server
      const allLocal = await db.fresisHistory.toArray();
      for (const local of allLocal) {
        if (!serverIds.has(local.id) && local.source !== undefined) {
          await db.fresisHistory.delete(local.id);
          mergedCount++;
        }
      }

      return mergedCount;
    } catch (error) {
      console.error("[FresisHistory] Sync from server failed:", error);
      return 0;
    }
  }

  async deleteFromServer(id: string): Promise<boolean> {
    try {
      const token = this.getToken();
      if (!token) return false;

      const response = await fetch(`/api/fresis-history/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      return response.ok;
    } catch (error) {
      console.error("[FresisHistory] Delete from server failed:", error);
      return false;
    }
  }

  async fullSync(): Promise<void> {
    try {
      const allLocal = await db.fresisHistory.toArray();
      if (allLocal.length > 0) {
        await this.uploadToServer(allLocal);
      }

      await this.syncFromServer();
    } catch (error) {
      console.error("[FresisHistory] Full sync failed:", error);
    }
  }

  async reconcileUnlinkedOrders(): Promise<number> {
    const allRecords = await db.fresisHistory.toArray();
    const unlinked = allRecords.filter(
      (r) => r.mergedIntoOrderId && !r.archibaldOrderId,
    );

    if (unlinked.length === 0) return 0;

    const pendingOrders = await db.pendingOrders.toArray();
    const pendingMap = new Map(pendingOrders.map((p) => [p.id, p]));

    let linkedCount = 0;

    for (const record of unlinked) {
      const pending = pendingMap.get(record.mergedIntoOrderId!);
      if (pending?.jobOrderId) {
        const token = this.getToken();
        if (!token) continue;

        try {
          const response = await fetch(
            `/api/orders/lifecycle-summary?ids=${pending.jobOrderId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (!response.ok) continue;

          const json = await response.json();
          if (!json.success || !json.data) continue;

          const lifecycle = json.data[pending.jobOrderId];
          if (lifecycle) {
            await db.fresisHistory.update(record.id, {
              archibaldOrderId: pending.jobOrderId,
              archibaldOrderNumber: lifecycle.orderNumber ?? undefined,
              currentState: lifecycle.currentState ?? undefined,
              stateUpdatedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            linkedCount++;
          }
        } catch {
          continue;
        }
      } else if (!pending) {
        // PendingOrder no longer in IndexedDB (auto-deleted after 4s) — fetch from server
        const token = this.getToken();
        if (!token) continue;

        try {
          const response = await fetch(`/api/fresis-history/${record.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) continue;

          const json = await response.json();
          if (!json.success || !json.record) continue;

          const serverRecord = json.record as FresisHistoryOrder;
          if (serverRecord.archibaldOrderId) {
            await db.fresisHistory.update(record.id, {
              archibaldOrderId: serverRecord.archibaldOrderId,
              archibaldOrderNumber: serverRecord.archibaldOrderNumber,
              currentState: serverRecord.currentState,
              stateUpdatedAt: serverRecord.stateUpdatedAt,
              updatedAt: serverRecord.updatedAt,
            });
            linkedCount++;
          }
        } catch {
          continue;
        }
      }
    }

    if (linkedCount > 0) {
      const updated = await db.fresisHistory.toArray();
      const toUpload = updated.filter((r) =>
        unlinked.some((u) => u.id === r.id),
      );
      if (toUpload.length > 0) {
        await this.uploadToServer(toUpload);
      }
    }

    return linkedCount;
  }

  async syncOrderLifecycles(): Promise<number> {
    await this.reconcileUnlinkedOrders();

    const allRecords = await db.fresisHistory.toArray();
    const trackable = allRecords.filter(
      (r) => r.archibaldOrderId && r.currentState !== "pagato",
    );

    if (trackable.length === 0) return 0;

    const allLinkedIds = trackable.flatMap((r) =>
      parseLinkedIds(r.archibaldOrderId),
    );
    const uniqueIds = [...new Set(allLinkedIds)];

    if (uniqueIds.length === 0) return 0;

    const jwt = this.getToken();
    if (!jwt) return 0;

    const response = await fetch(
      `/api/orders/lifecycle-summary?ids=${uniqueIds.join(",")}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );

    if (!response.ok) return 0;

    const json = await response.json();
    if (!json.success || !json.data) return 0;

    const STATE_PRIORITY: Record<string, number> = {
      piazzato: 0,
      ordine_aperto: 1,
      modifica: 2,
      inviato_milano: 3,
      trasferito: 4,
      spedito: 5,
      consegnato: 6,
      fatturato: 7,
      pagamento_scaduto: 8,
      pagato: 9,
      transfer_error: -1,
    };

    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const record of trackable) {
      const linkedIds = parseLinkedIds(record.archibaldOrderId);
      const lifecycles = linkedIds
        .map((id) => json.data[id])
        .filter(Boolean);

      if (lifecycles.length === 0) continue;

      const best = lifecycles.reduce((a: any, b: any) => {
        const pa = STATE_PRIORITY[a.currentState] ?? -1;
        const pb = STATE_PRIORITY[b.currentState] ?? -1;
        return pb > pa ? b : a;
      });

      const orderNumbers = lifecycles
        .map((l: any) => l.orderNumber)
        .filter(Boolean);

      await db.fresisHistory.update(record.id, {
        archibaldOrderNumber:
          orderNumbers.length <= 1
            ? (orderNumbers[0] ?? undefined)
            : JSON.stringify(orderNumbers),
        currentState: best.currentState ?? undefined,
        stateUpdatedAt: now,
        ddtNumber: best.ddtNumber ?? undefined,
        ddtDeliveryDate: best.ddtDeliveryDate ?? undefined,
        trackingNumber: best.trackingNumber ?? undefined,
        trackingUrl: best.trackingUrl ?? undefined,
        trackingCourier: best.trackingCourier ?? undefined,
        deliveryCompletedDate: best.deliveryCompletedDate ?? undefined,
        invoiceNumber: best.invoiceNumber ?? undefined,
        invoiceDate: best.invoiceDate ?? undefined,
        invoiceAmount: best.invoiceAmount ?? undefined,
        invoiceClosed: best.invoiceClosed ?? undefined,
        invoiceRemainingAmount: best.invoiceRemainingAmount ?? undefined,
        invoiceDueDate: best.invoiceDueDate ?? undefined,
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

    if (updatedCount > 0) {
      const updatedRecords = await db.fresisHistory.toArray();
      const toUpload = updatedRecords.filter((r) =>
        trackable.some((t) => t.id === r.id),
      );
      await this.uploadToServer(toUpload);
    }

    return updatedCount;
  }
}

export const fresisHistoryService = FresisHistoryService.getInstance();

export async function fetchSiblingFTs(archibaldOrderId: string): Promise<FresisHistoryOrder[]> {
  const token = localStorage.getItem("archibald_jwt");
  if (!token) return [];
  try {
    const response = await fetch(`/api/fresis-history/siblings/${encodeURIComponent(archibaldOrderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.records ?? [];
  } catch {
    return [];
  }
}
