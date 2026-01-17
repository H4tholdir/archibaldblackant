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
