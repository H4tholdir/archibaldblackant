import { Router, type Response } from "express";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";
import { logger } from "../logger";
import Database from "better-sqlite3";
import path from "path";
import { PendingRealtimeService } from "../pending-realtime.service";

const router = Router();

// Open databases
const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
const usersDbPath = path.join(__dirname, "../../data/users.db");
const ordersDb = new Database(ordersDbPath);
const usersDb = new Database(usersDbPath);

// Real-time services for WebSocket broadcasts
const pendingRealtimeService = PendingRealtimeService.getInstance();

// Lazy-initialized prepared statement for change log
// Must be lazy because the table is created by migration 031, which runs
// after module imports are resolved. Eagerly calling ordersDb.prepare() at
// import time would crash with "no such table: pending_change_log".
let _insertChangeLog: Database.Statement<unknown[]> | null = null;
function getInsertChangeLog() {
  if (!_insertChangeLog) {
    _insertChangeLog = ordersDb.prepare(`
      INSERT INTO pending_change_log (user_id, entity_id, action, data, device_id, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
  }
  return _insertChangeLog;
}

const CHANGE_LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function writeChangeLog(
  userId: string,
  entityId: string,
  action: "INSERT" | "UPDATE" | "DELETE",
  data: unknown | null,
  deviceId: string | null,
  idempotencyKey: string | null,
): number {
  const result = getInsertChangeLog().run(
    userId,
    entityId,
    action,
    data ? JSON.stringify(data) : null,
    deviceId,
    idempotencyKey,
  );
  return Number(result.lastInsertRowid);
}

// Cleanup old change log entries (called periodically)
function cleanupChangeLog(): void {
  const cutoff = Date.now() - CHANGE_LOG_MAX_AGE_MS;
  const result = ordersDb
    .prepare("DELETE FROM pending_change_log WHERE created_at < ?")
    .run(cutoff);
  if (result.changes > 0) {
    logger.info(`[ChangeLog] Cleaned up ${result.changes} old entries`);
  }
}

// Run cleanup every hour
setInterval(cleanupChangeLog, 60 * 60 * 1000);

// ========== PENDING ORDERS SYNC ==========

/**
 * GET /api/sync/pending-orders
 *
 * Pull pending orders for current user
 * Query params:
 *   - updatedAfter: timestamp (optional) - only return orders updated after this timestamp
 */
router.get(
  "/pending-orders",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { updatedAfter } = req.query;

      let query = "SELECT * FROM pending_orders WHERE user_id = ?";
      const params: any[] = [userId];

      if (updatedAfter) {
        query += " AND updated_at > ?";
        params.push(parseInt(updatedAfter as string));
      }

      query += " ORDER BY updated_at DESC";

      const orders = ordersDb.prepare(query).all(...params) as any[];

      res.json({
        success: true,
        orders: orders.map((o) => ({
          id: o.id,
          userId: o.user_id,
          customerId: o.customer_id,
          customerName: o.customer_name,
          items: JSON.parse(o.items_json),
          status: o.status,
          discountPercent: o.discount_percent,
          targetTotalWithVAT: o.target_total_with_vat,
          shippingCost: o.shipping_cost || 0,
          shippingTax: o.shipping_tax || 0,
          retryCount: o.retry_count,
          errorMessage: o.error_message,
          createdAt: o.created_at,
          updatedAt: o.updated_at,
          deviceId: o.device_id,
          syncedToArchibald: o.synced_to_archibald === 1,
          subClientCodice: o.sub_client_codice || null,
          subClientName: o.sub_client_name || null,
          subClientData: o.sub_client_data_json
            ? JSON.parse(o.sub_client_data_json)
            : null,
        })),
      });
    } catch (error) {
      logger.error("Error fetching pending orders", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/sync/pending-orders
 *
 * Push/update pending orders (batch)
 * Body: { orders: PendingOrder[] }
 *
 * Returns: { success: boolean, results: Array<{id, action, reason?}> }
 */
router.post(
  "/pending-orders",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { orders } = req.body;

      if (!Array.isArray(orders)) {
        return res.status(400).json({
          success: false,
          error: "orders deve essere array",
        });
      }

      const results = [];

      for (const order of orders) {
        try {
          const existing = ordersDb
            .prepare("SELECT * FROM pending_orders WHERE id = ?")
            .get(order.id) as any;

          const idempotencyKey = order.idempotencyKey || null;

          const orderPayload = {
            id: order.id,
            userId,
            customerId: order.customerId,
            customerName: order.customerName,
            items: order.items,
            status: order.status,
            discountPercent: order.discountPercent,
            targetTotalWithVAT: order.targetTotalWithVAT,
            shippingCost: order.shippingCost ?? 0,
            shippingTax: order.shippingTax ?? 0,
            retryCount: order.retryCount ?? 0,
            errorMessage: order.errorMessage,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            deviceId: order.deviceId,
            subClientCodice: order.subClientCodice ?? null,
            subClientName: order.subClientName ?? null,
            subClientData: order.subClientData ?? null,
          };

          if (existing) {
            if (existing.updated_at > order.updatedAt) {
              results.push({
                id: order.id,
                action: "skipped",
                reason: "server_newer",
                serverUpdatedAt: existing.updated_at,
              });
              continue;
            }

            // Wrap mutation + change log in a transaction for atomicity
            const syncId = ordersDb.transaction(() => {
              ordersDb
                .prepare(
                  `
                UPDATE pending_orders SET
                  customer_id = ?,
                  customer_name = ?,
                  items_json = ?,
                  status = ?,
                  discount_percent = ?,
                  target_total_with_vat = ?,
                  shipping_cost = ?,
                  shipping_tax = ?,
                  retry_count = ?,
                  error_message = ?,
                  updated_at = ?,
                  device_id = ?,
                  sub_client_codice = ?,
                  sub_client_name = ?,
                  sub_client_data_json = ?
                WHERE id = ?
              `,
                )
                .run(
                  order.customerId,
                  order.customerName,
                  JSON.stringify(order.items),
                  order.status,
                  order.discountPercent ?? null,
                  order.targetTotalWithVAT ?? null,
                  order.shippingCost ?? 0,
                  order.shippingTax ?? 0,
                  order.retryCount ?? 0,
                  order.errorMessage ?? null,
                  order.updatedAt,
                  order.deviceId,
                  order.subClientCodice ?? null,
                  order.subClientName ?? null,
                  order.subClientData
                    ? JSON.stringify(order.subClientData)
                    : null,
                  order.id,
                );

              return writeChangeLog(
                userId,
                order.id,
                "UPDATE",
                orderPayload,
                order.deviceId,
                idempotencyKey,
              );
            })();

            results.push({
              id: order.id,
              action: "updated",
              syncId,
              serverUpdatedAt: order.updatedAt,
            });
            logger.debug("Pending order updated", {
              orderId: order.id,
              userId,
              syncId,
            });

            pendingRealtimeService.emitPendingUpdated(
              userId,
              orderPayload,
              syncId,
              idempotencyKey,
            );
          } else {
            // Wrap mutation + change log in a transaction for atomicity
            const syncId = ordersDb.transaction(() => {
              ordersDb
                .prepare(
                  `
                INSERT INTO pending_orders (
                  id, user_id, customer_id, customer_name, items_json, status,
                  discount_percent, target_total_with_vat, shipping_cost, shipping_tax,
                  retry_count, error_message, created_at, updated_at, device_id,
                  sub_client_codice, sub_client_name, sub_client_data_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
                )
                .run(
                  order.id,
                  userId,
                  order.customerId,
                  order.customerName,
                  JSON.stringify(order.items),
                  order.status,
                  order.discountPercent ?? null,
                  order.targetTotalWithVAT ?? null,
                  order.shippingCost ?? 0,
                  order.shippingTax ?? 0,
                  order.retryCount ?? 0,
                  order.errorMessage ?? null,
                  order.createdAt,
                  order.updatedAt,
                  order.deviceId,
                  order.subClientCodice ?? null,
                  order.subClientName ?? null,
                  order.subClientData
                    ? JSON.stringify(order.subClientData)
                    : null,
                );

              return writeChangeLog(
                userId,
                order.id,
                "INSERT",
                orderPayload,
                order.deviceId,
                idempotencyKey,
              );
            })();

            results.push({
              id: order.id,
              action: "created",
              syncId,
              serverUpdatedAt: order.updatedAt,
            });
            logger.info("Pending order created", {
              orderId: order.id,
              userId,
              syncId,
            });

            pendingRealtimeService.emitPendingCreated(
              userId,
              orderPayload,
              syncId,
              idempotencyKey,
            );
          }
        } catch (orderError) {
          logger.error("Error syncing pending order", {
            orderId: order.id,
            error: orderError,
          });
          results.push({
            id: order.id,
            action: "error",
            reason: "sync_failed",
          });
        }
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logger.error("Error pushing pending orders", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * DELETE /api/sync/pending-orders/:id
 *
 * Delete a pending order
 */
router.delete(
  "/pending-orders/:id",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { deviceId, idempotencyKey } = req.query;

      // Wrap mutation + change log in a transaction for atomicity
      const txResult = ordersDb.transaction(() => {
        const result = ordersDb
          .prepare(
            `
          DELETE FROM pending_orders WHERE id = ? AND user_id = ?
        `,
          )
          .run(id, userId);

        if (result.changes === 0) {
          return { deleted: false, syncId: 0 };
        }

        const syncId = writeChangeLog(
          userId,
          id,
          "DELETE",
          null,
          (deviceId as string) ?? null,
          (idempotencyKey as string) ?? null,
        );

        return { deleted: true, syncId };
      })();

      if (!txResult.deleted) {
        return res.status(404).json({
          success: false,
          error: "Ordine non trovato",
        });
      }

      const syncId = txResult.syncId;

      logger.info("Pending order deleted", { orderId: id, userId, syncId });

      pendingRealtimeService.emitPendingDeleted(
        userId,
        id,
        (deviceId as string) || "unknown",
        syncId,
        (idempotencyKey as string) || undefined,
      );

      res.json({ success: true, syncId });
    } catch (error) {
      logger.error("Error deleting pending order", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

// ========== DELTA SYNC ENDPOINT ==========

/**
 * GET /api/sync/pending-orders/delta?lastSyncId=N
 *
 * Returns change log entries after the given syncId for catch-up on reconnection.
 * If lastSyncId is too old (not in log), returns { resync: true } to trigger full pull.
 */
router.get(
  "/pending-orders/delta",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const lastSyncIdParam = req.query.lastSyncId;

      if (lastSyncIdParam === undefined || lastSyncIdParam === null) {
        return res.json({ resync: true });
      }

      const lastSyncId = parseInt(lastSyncIdParam as string, 10);
      if (isNaN(lastSyncId)) {
        return res.status(400).json({
          success: false,
          error: "lastSyncId deve essere un numero",
        });
      }

      // Check if lastSyncId is still in the log (not purged)
      if (lastSyncId > 0) {
        const exists = ordersDb
          .prepare(
            "SELECT 1 FROM pending_change_log WHERE sync_id = ? AND user_id = ?",
          )
          .get(lastSyncId, userId);

        if (!exists) {
          // lastSyncId was purged — client needs full resync
          return res.json({ resync: true });
        }
      }

      const DELTA_LIMIT = 500;
      const actions = ordersDb
        .prepare(
          `SELECT sync_id, entity_id, action, data, device_id, idempotency_key, created_at
           FROM pending_change_log
           WHERE user_id = ? AND sync_id > ?
           ORDER BY sync_id ASC
           LIMIT ?`,
        )
        .all(userId, lastSyncId, DELTA_LIMIT + 1) as Array<{
        sync_id: number;
        entity_id: string;
        action: string;
        data: string | null;
        device_id: string | null;
        idempotency_key: string | null;
        created_at: number;
      }>;

      const hasMore = actions.length > DELTA_LIMIT;
      const limitedActions = hasMore ? actions.slice(0, DELTA_LIMIT) : actions;
      const newLastSyncId =
        limitedActions.length > 0
          ? limitedActions[limitedActions.length - 1].sync_id
          : lastSyncId;

      res.json({
        success: true,
        actions: limitedActions.map((a) => ({
          syncId: a.sync_id,
          entityId: a.entity_id,
          action: a.action,
          data: a.data ? JSON.parse(a.data) : null,
          deviceId: a.device_id,
          idempotencyKey: a.idempotency_key,
          createdAt: a.created_at,
        })),
        lastSyncId: newLastSyncId,
        hasMore,
      });
    } catch (error) {
      logger.error("Error fetching delta sync", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

// ========== WAREHOUSE ITEMS SYNC ==========

/**
 * GET /api/sync/warehouse-items
 *
 * Pull warehouse items for current user
 */
router.get(
  "/warehouse-items",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      const items = usersDb
        .prepare(
          `
        SELECT * FROM warehouse_items
        WHERE user_id = ?
        ORDER BY uploaded_at DESC
      `,
        )
        .all(userId) as any[];

      res.json({
        success: true,
        items: items.map((i) => ({
          id: i.id,
          userId: i.user_id,
          articleCode: i.article_code,
          description: i.description,
          quantity: i.quantity,
          boxName: i.box_name,
          reservedForOrder: i.reserved_for_order,
          soldInOrder: i.sold_in_order,
          uploadedAt: i.uploaded_at,
          deviceId: i.device_id,
          customerName: i.customer_name,
          subClientName: i.sub_client_name,
          orderDate: i.order_date,
          orderNumber: i.order_number,
        })),
      });
    } catch (error) {
      logger.error("Error fetching warehouse items", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/sync/warehouse-items
 *
 * Push/update warehouse items (batch)
 * Typically used after uploading a warehouse file
 */
router.post(
  "/warehouse-items",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { items, clearExisting } = req.body;

      if (!Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: "items deve essere array",
        });
      }

      // If clearExisting flag is true, delete all existing items for user
      if (clearExisting) {
        usersDb
          .prepare("DELETE FROM warehouse_items WHERE user_id = ?")
          .run(userId);
        logger.info("Cleared existing warehouse items", { userId });
      }

      // Collect unique box names to auto-create in warehouse_boxes
      const uniqueBoxes = new Set<string>();
      for (const item of items) {
        if (item.boxName) {
          uniqueBoxes.add(item.boxName);
        }
      }

      // Auto-create boxes in warehouse_boxes (if not exist)
      const now = Date.now();
      for (const boxName of uniqueBoxes) {
        try {
          usersDb
            .prepare(
              `INSERT OR IGNORE INTO warehouse_boxes (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
            )
            .run(userId, boxName, now, now);
        } catch (boxError) {
          logger.warn("Failed to auto-create box", {
            boxName,
            error: boxError,
          });
        }
      }

      const results = [];

      for (const item of items) {
        try {
          // Always insert (clearExisting = true) or check for updates
          if (clearExisting || !item.id) {
            // Insert new item
            const result = usersDb
              .prepare(
                `
              INSERT INTO warehouse_items (
                user_id, article_code, description, quantity, box_name,
                reserved_for_order, sold_in_order, uploaded_at, device_id,
                customer_name, sub_client_name, order_date, order_number
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
              )
              .run(
                userId,
                item.articleCode,
                item.description,
                item.quantity,
                item.boxName,
                item.reservedForOrder || null,
                item.soldInOrder || null,
                item.uploadedAt,
                item.deviceId,
                item.customerName || null,
                item.subClientName || null,
                item.orderDate || null,
                item.orderNumber || null,
              );

            results.push({
              id: result.lastInsertRowid,
              action: "created",
            });
          } else {
            // Update existing item
            usersDb
              .prepare(
                `
              UPDATE warehouse_items SET
                article_code = ?,
                description = ?,
                quantity = ?,
                box_name = ?,
                reserved_for_order = ?,
                sold_in_order = ?,
                uploaded_at = ?,
                device_id = ?,
                customer_name = ?,
                sub_client_name = ?,
                order_date = ?,
                order_number = ?
              WHERE id = ? AND user_id = ?
            `,
              )
              .run(
                item.articleCode,
                item.description,
                item.quantity,
                item.boxName,
                item.reservedForOrder || null,
                item.soldInOrder || null,
                item.uploadedAt,
                item.deviceId,
                item.customerName || null,
                item.subClientName || null,
                item.orderDate || null,
                item.orderNumber || null,
                item.id,
                userId,
              );

            results.push({ id: item.id, action: "updated" });
          }
        } catch (itemError) {
          logger.error("Error syncing warehouse item", {
            itemId: item.id,
            error: itemError,
          });
          results.push({
            id: item.id,
            action: "error",
            reason: "sync_failed",
          });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      logger.error("Error pushing warehouse items", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * DELETE /api/sync/warehouse-items/:id
 */
router.delete(
  "/warehouse-items/:id",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const result = usersDb
        .prepare("DELETE FROM warehouse_items WHERE id = ? AND user_id = ?")
        .run(parseInt(id), userId);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: "Articolo non trovato",
        });
      }

      logger.info("Warehouse item deleted", { itemId: id, userId });
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting warehouse item", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/sync/warehouse-items/:id/reserve
 *
 * Reserve warehouse item for an order
 */
router.post(
  "/warehouse-items/:id/reserve",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { orderId, customerName, subClientName, orderDate, orderNumber } =
        req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "orderId richiesto",
        });
      }

      const result = usersDb
        .prepare(
          `
        UPDATE warehouse_items
        SET reserved_for_order = ?,
            customer_name = ?,
            sub_client_name = ?,
            order_date = ?,
            order_number = ?
        WHERE id = ? AND user_id = ? AND reserved_for_order IS NULL
      `,
        )
        .run(
          orderId,
          customerName || null,
          subClientName || null,
          orderDate || null,
          orderNumber || null,
          parseInt(id),
          userId,
        );

      if (result.changes === 0) {
        return res.status(409).json({
          success: false,
          error: "Articolo non disponibile o già riservato",
        });
      }

      logger.info("Warehouse item reserved", { itemId: id, orderId, userId });
      res.json({ success: true });
    } catch (error) {
      logger.error("Error reserving warehouse item", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/sync/warehouse-items/:id/release
 *
 * Release warehouse item reservation
 */
router.post(
  "/warehouse-items/:id/release",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const result = usersDb
        .prepare(
          `
        UPDATE warehouse_items
        SET reserved_for_order = NULL,
            customer_name = NULL,
            sub_client_name = NULL,
            order_date = NULL,
            order_number = NULL
        WHERE id = ? AND user_id = ?
      `,
        )
        .run(parseInt(id), userId);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: "Articolo non trovato",
        });
      }

      logger.info("Warehouse item reservation released", {
        itemId: id,
        userId,
      });
      res.json({ success: true });
    } catch (error) {
      logger.error("Error releasing warehouse item", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/sync/warehouse-items/:id/mark-sold
 *
 * Mark warehouse item as sold
 */
router.post(
  "/warehouse-items/:id/mark-sold",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { jobId } = req.body;

      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "jobId richiesto",
        });
      }

      const result = usersDb
        .prepare(
          `
        UPDATE warehouse_items
        SET sold_in_order = ?, reserved_for_order = NULL
        WHERE id = ? AND user_id = ?
      `,
        )
        .run(jobId, parseInt(id), userId);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: "Articolo non trovato",
        });
      }

      logger.info("Warehouse item marked as sold", {
        itemId: id,
        jobId,
        userId,
      });
      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking warehouse item as sold", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * GET /api/sync/warehouse-metadata
 *
 * Get warehouse upload metadata for current user
 */
router.get(
  "/warehouse-metadata",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      const metadata = usersDb
        .prepare(
          `
        SELECT * FROM warehouse_metadata
        WHERE user_id = ?
        ORDER BY upload_date DESC
        LIMIT 10
      `,
        )
        .all(userId) as any[];

      res.json({
        success: true,
        metadata: metadata.map((m) => ({
          id: m.id,
          userId: m.user_id,
          filename: m.filename,
          fileSize: m.file_size,
          uploadDate: m.upload_date,
          totalItems: m.total_items,
          totalQuantity: m.total_quantity,
          boxesCount: m.boxes_count,
          deviceId: m.device_id,
        })),
      });
    } catch (error) {
      logger.error("Error fetching warehouse metadata", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

export default router;
