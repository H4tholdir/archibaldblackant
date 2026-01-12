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
};
