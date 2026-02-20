import type { PendingOrder, PendingOrderItem } from "../types/pending-order";
import type { SubClient } from "../types/sub-client";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

function parseJsonField<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

function mapBackendOrder(raw: Record<string, unknown>): PendingOrder {
  const items =
    (raw.items as PendingOrderItem[] | undefined) ??
    parseJsonField<PendingOrderItem[]>(raw.itemsJson) ??
    [];

  const subClientData =
    (raw.subClientData as SubClient | undefined) ??
    parseJsonField<SubClient>(raw.subClientDataJson);

  return {
    id: raw.id as string,
    customerId: raw.customerId as string,
    customerName: raw.customerName as string,
    items,
    discountPercent: raw.discountPercent as number | undefined,
    targetTotalWithVAT:
      (raw.targetTotalWithVAT as number | undefined) ??
      (raw.targetTotalWithVat as number | undefined),
    shippingCost: raw.shippingCost as number | undefined,
    shippingTax: raw.shippingTax as number | undefined,
    revenue: raw.revenue as number | undefined,
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
    status: (raw.status as PendingOrder["status"]) ?? "pending",
    errorMessage: raw.errorMessage as string | undefined,
    retryCount: (raw.retryCount as number) ?? 0,
    deviceId: raw.deviceId as string,
    needsSync: (raw.needsSync as boolean) ?? false,
    serverUpdatedAt: raw.serverUpdatedAt as number | undefined,
    jobId: raw.jobId as string | undefined,
    jobStatus: raw.jobStatus as PendingOrder["jobStatus"],
    jobProgress: raw.jobProgress as number | undefined,
    jobOperation: raw.jobOperation as string | undefined,
    jobError: raw.jobError as string | undefined,
    jobStartedAt: raw.jobStartedAt as string | undefined,
    jobCompletedAt: raw.jobCompletedAt as string | undefined,
    jobOrderId: raw.jobOrderId as string | undefined,
    subClientCodice: raw.subClientCodice as string | undefined,
    subClientName: raw.subClientName as string | undefined,
    subClientData,
  };
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/pending-orders`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return (data.orders ?? []).map(mapBackendOrder);
}

export async function savePendingOrder(
  order: PendingOrder,
): Promise<{ id: string; action: string; serverUpdatedAt: number }> {
  const response = await fetchWithRetry(`${API_BASE}/api/pending-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orders: [
        {
          id: order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          itemsJson: order.items,
          status: order.status,
          discountPercent: order.discountPercent ?? null,
          targetTotalWithVat: order.targetTotalWithVAT ?? null,
          deviceId: order.deviceId,
          shippingCost: order.shippingCost ?? 0,
          shippingTax: order.shippingTax ?? 0,
          subClientCodice: order.subClientCodice ?? null,
          subClientName: order.subClientName ?? null,
          subClientDataJson: order.subClientData ?? null,
          idempotencyKey: `${order.id}-${order.updatedAt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results[0];
}

export async function deletePendingOrder(orderId: string): Promise<void> {
  const deviceId = localStorage.getItem("archibald_device_id") ?? "";
  const idempotencyKey = `delete-${orderId}-${Date.now()}`;

  const response = await fetchWithRetry(
    `${API_BASE}/api/pending-orders/${encodeURIComponent(orderId)}?deviceId=${encodeURIComponent(deviceId)}&idempotencyKey=${encodeURIComponent(idempotencyKey)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
