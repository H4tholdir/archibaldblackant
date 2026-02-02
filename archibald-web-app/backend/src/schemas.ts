import { z } from "zod";

export const orderItemSchema = z.object({
  articleCode: z.string().min(1, "Codice articolo obbligatorio"),
  productName: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().int().positive("Quantità deve essere > 0"),
  price: z.number().nonnegative("Prezzo deve essere >= 0"),
  discount: z.number().min(0).max(100).optional(),
  articleId: z.string().optional(),
  packageContent: z.number().optional(),
  // Warehouse integration (Phase 4)
  warehouseQuantity: z.number().int().nonnegative().optional(), // How many from warehouse
  warehouseSources: z
    .array(
      z.object({
        warehouseItemId: z.number().int(),
        boxName: z.string(),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(), // Which boxes provide the item
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "ID cliente obbligatorio"),
  customerName: z.string().min(1, "Nome cliente obbligatorio"),
  items: z.array(orderItemSchema).min(1, "Almeno 1 articolo richiesto"),
  discountPercent: z.number().min(0).max(100).optional(), // Sconto globale applicato a tutte le righe
  targetTotalWithVAT: z.number().positive().optional(), // Totale desiderato (con IVA) per calcolo sconto
});

// User management schemas
export const createUserSchema = z.object({
  username: z.string().min(3, "Username deve essere >= 3 caratteri").max(50),
  fullName: z.string().min(1, "Nome completo obbligatorio").max(100),
});

export const updateWhitelistSchema = z.object({
  whitelisted: z.boolean(),
});

// Authentication schemas
export const loginSchema = z.object({
  username: z.string().min(1, "Username obbligatorio"),
  password: z.string().min(1, "Password obbligatoria"),
  deviceId: z.string().optional(),
  platform: z.string().optional(),
  deviceName: z.string().optional(),
});
