import type { z } from "zod";
import type { createOrderSchema } from "./schemas";

export type OrderData = z.infer<typeof createOrderSchema>;

export type OrderItem = {
  articleCode: string;
  description: string;
  quantity: number;
  price: number;
};

export type Customer = {
  id: string;
  name: string;
  address?: string;
};

export type Product = {
  code: string;
  name: string;
  description?: string;
  sizes: string[];
  price: number;
};

export interface CustomerFormData {
  // Required fields
  name: string;

  // Optional fields - Dettagli tab
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  phone?: string;
  email?: string;

  // Optional fields - Dropdowns/Lookups
  deliveryMode?: "FedEx" | string; // Default: FedEx
  paymentTerms?: string; // Default: "206"
  lineDiscount?: "N/A" | string; // Default: N/A

  // Optional fields - Delivery address (tab "Indirizzo alt.")
  deliveryStreet?: string;
  deliveryPostalCode?: string;

  // Optional fields - CAP disambiguation hints (frontend → bot, not persisted)
  postalCodeCity?: string;
  postalCodeCountry?: string;
  deliveryPostalCodeCity?: string;
  deliveryPostalCodeCountry?: string;
}

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  token?: string;
  user?: {
    id: string;
    username: string;
    fullName: string;
    role: string;
  };
  // Sync-specific fields (optional, for customer/product/price sync endpoints)
  customersProcessed?: number;
  newCustomers?: number;
  updatedCustomers?: number;
  deletedCustomers?: number;
  duration?: number;
};

export interface ProfilingData {
  summary: {
    totalOperations: number;
    successful: number;
    failed: number;
    totalDurationMs: number;
    totalGapMs: number;
    averageOperationMs: number;
    peakMemoryBytes: number;
  };
  categories: Record<
    string,
    {
      count: number;
      totalDurationMs: number;
      avgDurationMs: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
      avgMemoryBytes: number;
    }
  >;
  retries: Array<{
    operationId: number;
    name: string;
    category: string;
    attempts: number;
    finalStatus: "ok" | "error";
  }>;
  operations: Array<{
    id: number;
    name: string;
    status: "ok" | "error";
    category: string;
    startIso: string;
    endIso: string;
    durationMs: number;
    gapMs: number;
    retryAttempt: number;
    memoryBefore: number;
    memoryAfter: number;
    meta: Record<string, unknown>;
    errorMessage?: string;
  }>;
}

export type VatAddressInfo = {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  vatStatus: string;
  internalId: string;
};

export type VatLookupResult = {
  lastVatCheck: string;
  vatValidated: string;
  vatAddress: string;
  parsed: VatAddressInfo;
  pec: string;
  sdi: string;
};

export type InteractiveSessionState =
  | "starting"
  | "ready"
  | "processing_vat"
  | "vat_complete"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * WebSocket message structure for real-time draft/pending operations
 */
export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

/**
 * WebSocket connection statistics
 */
export interface ConnectionStats {
  totalConnections: number;
  activeUsers: number;
  uptime: number; // milliseconds since WebSocket server initialization
  reconnectionCount: number; // total reconnections counter
  messagesSent: number; // total broadcast messages sent
  messagesReceived: number; // total messages received from clients
  averageLatency: number; // average latency in ms (from ping/pong)
  connectionsPerUser: { [userId: string]: number }; // userId → connection count
}
