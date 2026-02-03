import { Router, type Response } from "express";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";
import { logger } from "../logger";
import Database from "better-sqlite3";
import path from "path";

const router = Router();

// Open databases
const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
const usersDbPath = path.join(__dirname, "../../data/users.db");
const ordersDb = new Database(ordersDbPath);
const usersDb = new Database(usersDbPath);

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
          retryCount: o.retry_count,
          errorMessage: o.error_message,
          createdAt: o.created_at,
          updatedAt: o.updated_at,
          deviceId: o.device_id,
          syncedToArchibald: o.synced_to_archibald === 1,
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
          // Check if order exists
          const existing = ordersDb
            .prepare("SELECT * FROM pending_orders WHERE id = ?")
            .get(order.id) as any;

          if (existing) {
            // Conflict detection: Last-Write-Wins (LWW)
            if (existing.updated_at > order.updatedAt) {
              results.push({
                id: order.id,
                action: "skipped",
                reason: "server_newer",
                serverUpdatedAt: existing.updated_at,
              });
              continue;
            }

            // Update order
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
                retry_count = ?,
                error_message = ?,
                updated_at = ?,
                device_id = ?,
                origin_draft_id = ?
              WHERE id = ?
            `,
              )
              .run(
                order.customerId,
                order.customerName,
                JSON.stringify(order.items),
                order.status,
                order.discountPercent || null,
                order.targetTotalWithVAT || null,
                order.retryCount || 0,
                order.errorMessage || null,
                order.updatedAt,
                order.deviceId,
                order.originDraftId || null,
                order.id,
              );

            results.push({ id: order.id, action: "updated" });
            logger.debug("Pending order updated", {
              orderId: order.id,
              userId,
            });
          } else {
            // Insert new order
            ordersDb
              .prepare(
                `
              INSERT INTO pending_orders (
                id, user_id, customer_id, customer_name, items_json, status,
                discount_percent, target_total_with_vat, retry_count, error_message,
                created_at, updated_at, device_id, origin_draft_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
              )
              .run(
                order.id,
                userId,
                order.customerId,
                order.customerName,
                JSON.stringify(order.items),
                order.status,
                order.discountPercent || null,
                order.targetTotalWithVAT || null,
                order.retryCount || 0,
                order.errorMessage || null,
                order.createdAt,
                order.updatedAt,
                order.deviceId,
                order.originDraftId || null,
              );

            results.push({ id: order.id, action: "created" });
            logger.info("Pending order created", {
              orderId: order.id,
              userId,
            });

            // 🔧 FIX: Server-side cascade deletion - delete associated draft if originDraftId present
            // Only do this on INSERT (first creation), not on subsequent updates
            if (order.originDraftId) {
              try {
                const draftDeleted = ordersDb
                  .prepare(
                    "DELETE FROM draft_orders WHERE id = ? AND user_id = ?",
                  )
                  .run(order.originDraftId, userId);

                if (draftDeleted.changes > 0) {
                  logger.info(
                    "Auto-deleted draft after pending creation (cascade)",
                    {
                      draftId: order.originDraftId,
                      pendingId: order.id,
                      userId,
                    },
                  );
                } else {
                  logger.debug("Draft not found or already deleted (cascade)", {
                    draftId: order.originDraftId,
                    pendingId: order.id,
                  });
                }
              } catch (draftDeleteError) {
                // Log but don't fail - draft deletion is best-effort cleanup
                logger.warn("Failed to auto-delete draft (cascade)", {
                  draftId: order.originDraftId,
                  pendingId: order.id,
                  error: draftDeleteError,
                });
              }
            }
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

      const result = ordersDb
        .prepare(
          `
        DELETE FROM pending_orders WHERE id = ? AND user_id = ?
      `,
        )
        .run(id, userId);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: "Ordine non trovato",
        });
      }

      logger.info("Pending order deleted", { orderId: id, userId });
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting pending order", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

// ========== DRAFT ORDERS SYNC ==========

/**
 * GET /api/sync/draft-orders
 *
 * Pull draft orders for current user
 */
router.get(
  "/draft-orders",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { updatedAfter } = req.query;

      let query = "SELECT * FROM draft_orders WHERE user_id = ?";
      const params: any[] = [userId];

      if (updatedAfter) {
        query += " AND updated_at > ?";
        params.push(parseInt(updatedAfter as string));
      }

      query += " ORDER BY updated_at DESC";

      const drafts = ordersDb.prepare(query).all(...params) as any[];

      res.json({
        success: true,
        drafts: drafts.map((d) => ({
          id: d.id,
          userId: d.user_id,
          customerId: d.customer_id,
          customerName: d.customer_name,
          items: JSON.parse(d.items_json),
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          deviceId: d.device_id,
        })),
      });
    } catch (error) {
      logger.error("Error fetching draft orders", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/sync/draft-orders
 *
 * Push/update draft orders (batch)
 */
router.post(
  "/draft-orders",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { drafts } = req.body;

      if (!Array.isArray(drafts)) {
        return res.status(400).json({
          success: false,
          error: "drafts deve essere array",
        });
      }

      // 🔧 FIX: Basic validation for payload size and data integrity
      if (drafts.length > 50) {
        return res.status(400).json({
          success: false,
          error: "Troppi draft in un singolo batch (max 50)",
        });
      }

      const results = [];

      for (const draft of drafts) {
        try {
          // 🔧 FIX: Validate draft data integrity
          if (
            !draft.id ||
            !draft.customerId ||
            !draft.customerName ||
            !Array.isArray(draft.items)
          ) {
            results.push({
              id: draft.id || "unknown",
              action: "rejected",
              reason: "invalid_data",
            });
            continue;
          }

          // Validate items array size
          if (draft.items.length > 100) {
            results.push({
              id: draft.id,
              action: "rejected",
              reason: "too_many_items",
            });
            continue;
          }

          const existing = ordersDb
            .prepare("SELECT * FROM draft_orders WHERE id = ?")
            .get(draft.id) as any;

          if (existing) {
            // LWW conflict resolution
            if (existing.updated_at > draft.updatedAt) {
              results.push({
                id: draft.id,
                action: "skipped",
                reason: "server_newer",
                serverUpdatedAt: existing.updated_at,
              });
              continue;
            }

            // Update
            ordersDb
              .prepare(
                `
              UPDATE draft_orders SET
                customer_id = ?,
                customer_name = ?,
                items_json = ?,
                updated_at = ?,
                device_id = ?
              WHERE id = ?
            `,
              )
              .run(
                draft.customerId,
                draft.customerName,
                JSON.stringify(draft.items),
                draft.updatedAt,
                draft.deviceId,
                draft.id,
              );

            results.push({ id: draft.id, action: "updated" });
          } else {
            // Insert
            ordersDb
              .prepare(
                `
              INSERT INTO draft_orders (
                id, user_id, customer_id, customer_name, items_json,
                created_at, updated_at, device_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
              )
              .run(
                draft.id,
                userId,
                draft.customerId,
                draft.customerName,
                JSON.stringify(draft.items),
                draft.createdAt,
                draft.updatedAt,
                draft.deviceId,
              );

            results.push({ id: draft.id, action: "created" });
          }
        } catch (draftError) {
          logger.error("Error syncing draft order", {
            draftId: draft.id,
            error: draftError,
          });
          results.push({
            id: draft.id,
            action: "error",
            reason: "sync_failed",
          });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      logger.error("Error pushing draft orders", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * DELETE /api/sync/draft-orders/:id
 */
router.delete(
  "/draft-orders/:id",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const result = ordersDb
        .prepare("DELETE FROM draft_orders WHERE id = ? AND user_id = ?")
        .run(id, userId);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: "Bozza non trovata",
        });
      }

      logger.info("Draft order deleted", { draftId: id, userId });
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting draft order", { error });
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
                reserved_for_order, sold_in_order, uploaded_at, device_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                device_id = ?
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
      const { orderId } = req.body;

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
        SET reserved_for_order = ?
        WHERE id = ? AND user_id = ? AND reserved_for_order IS NULL
      `,
        )
        .run(orderId, parseInt(id), userId);

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
        SET reserved_for_order = NULL
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
