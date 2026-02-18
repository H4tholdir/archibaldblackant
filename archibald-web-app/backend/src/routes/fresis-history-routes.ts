import express, { type Response } from "express";
import Database from "better-sqlite3";
import multer from "multer";
import path from "path";
import { logger } from "../logger";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";
import { parseArcaExport } from "../arca-import-service";
import {
  exportToArcaDbf,
  createExportTempDir,
  cleanupExportDir,
  streamExportAsZip,
} from "../arca-export-service";
import {
  ensureFtCounterTable,
  getNextFtNumber,
  initializeCounterFromImport,
} from "../ft-counter";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const router = express.Router();

const usersDbPath = path.join(__dirname, "../../data/users.db");
const usersDb = new Database(usersDbPath);

function rowToRecord(r: any) {
  return {
    id: r.id,
    originalPendingOrderId: r.original_pending_order_id,
    subClientCodice: r.sub_client_codice,
    subClientName: r.sub_client_name,
    subClientData: r.sub_client_data ? JSON.parse(r.sub_client_data) : null,
    customerId: r.customer_id,
    customerName: r.customer_name,
    items: r.items ? JSON.parse(r.items) : [],
    discountPercent: r.discount_percent,
    targetTotalWithVAT: r.target_total_with_vat,
    shippingCost: r.shipping_cost,
    shippingTax: r.shipping_tax,
    revenue: r.revenue,
    mergedIntoOrderId: r.merged_into_order_id,
    mergedAt: r.merged_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notes: r.notes,
    archibaldOrderId: r.archibald_order_id,
    archibaldOrderNumber: r.archibald_order_number,
    currentState: r.current_state,
    stateUpdatedAt: r.state_updated_at,
    ddtNumber: r.ddt_number,
    ddtDeliveryDate: r.ddt_delivery_date,
    trackingNumber: r.tracking_number,
    trackingUrl: r.tracking_url,
    trackingCourier: r.tracking_courier,
    deliveryCompletedDate: r.delivery_completed_date,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    invoiceAmount: r.invoice_amount,
    invoiceClosed: r.invoice_closed === 1 ? true : r.invoice_closed === 0 ? false : undefined,
    invoiceRemainingAmount: r.invoice_remaining_amount ?? undefined,
    invoiceDueDate: r.invoice_due_date ?? undefined,
    arcaData: r.arca_data ?? undefined,
    source: r.source,
  };
}

router.get(
  "/fresis-history",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      const rows = usersDb
        .prepare("SELECT * FROM fresis_history WHERE user_id = ?")
        .all(userId) as any[];

      res.json({
        success: true,
        records: rows.map(rowToRecord),
      });
    } catch (error) {
      logger.error("Error fetching fresis history", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.post(
  "/fresis-history/upload",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { records } = req.body;

      if (!Array.isArray(records)) {
        return res.status(400).json({
          success: false,
          error: "records deve essere un array",
        });
      }

      const upsertStmt = usersDb.prepare(`
        INSERT OR REPLACE INTO fresis_history (
          id, user_id, original_pending_order_id, sub_client_codice, sub_client_name,
          sub_client_data, customer_id, customer_name, items, discount_percent,
          target_total_with_vat, shipping_cost, shipping_tax, revenue, merged_into_order_id,
          merged_at, created_at, updated_at, notes, archibald_order_id,
          archibald_order_number, current_state, state_updated_at, ddt_number,
          ddt_delivery_date, tracking_number, tracking_url, tracking_courier,
          delivery_completed_date, invoice_number, invoice_date, invoice_amount,
          invoice_closed, invoice_remaining_amount, invoice_due_date, arca_data, source
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      const results: Array<{ id: string; action: string }> = [];

      const upsertAll = usersDb.transaction((items: any[]) => {
        for (const r of items) {
          const existing = usersDb
            .prepare(
              "SELECT updated_at FROM fresis_history WHERE id = ? AND user_id = ?",
            )
            .get(r.id, userId) as any;

          if (
            existing &&
            existing.updated_at &&
            r.updatedAt &&
            existing.updated_at >= r.updatedAt
          ) {
            results.push({ id: r.id, action: "skipped" });
            continue;
          }

          upsertStmt.run(
            r.id,
            userId,
            r.originalPendingOrderId ?? null,
            r.subClientCodice,
            r.subClientName,
            r.subClientData ? JSON.stringify(r.subClientData) : null,
            r.customerId,
            r.customerName,
            JSON.stringify(r.items),
            r.discountPercent ?? null,
            r.targetTotalWithVAT ?? null,
            r.shippingCost ?? null,
            r.shippingTax ?? null,
            r.revenue ?? null,
            r.mergedIntoOrderId ?? null,
            r.mergedAt ?? null,
            r.createdAt,
            r.updatedAt,
            r.notes ?? null,
            r.archibaldOrderId ?? null,
            r.archibaldOrderNumber ?? null,
            r.currentState ?? null,
            r.stateUpdatedAt ?? null,
            r.ddtNumber ?? null,
            r.ddtDeliveryDate ?? null,
            r.trackingNumber ?? null,
            r.trackingUrl ?? null,
            r.trackingCourier ?? null,
            r.deliveryCompletedDate ?? null,
            r.invoiceNumber ?? null,
            r.invoiceDate ?? null,
            r.invoiceAmount ?? null,
            r.invoiceClosed != null ? (r.invoiceClosed ? 1 : 0) : null,
            r.invoiceRemainingAmount ?? null,
            r.invoiceDueDate ?? null,
            r.arcaData ?? null,
            r.source ?? "app",
          );

          results.push({
            id: r.id,
            action: existing ? "updated" : "created",
          });
        }
      });

      upsertAll(records);

      // Emit WebSocket events
      try {
        const {
          FresisHistoryRealtimeService,
        } = require("../fresis-history-realtime.service");
        const wsService = FresisHistoryRealtimeService.getInstance();
        for (const result of results) {
          if (result.action === "created") {
            wsService.emitHistoryCreated(userId, result.id);
          } else if (result.action === "updated") {
            wsService.emitHistoryUpdated(userId, result.id);
          }
        }
      } catch {
        // WS not available, skip
      }

      logger.info("Fresis history uploaded", {
        userId,
        count: records.length,
        created: results.filter((r) => r.action === "created").length,
        updated: results.filter((r) => r.action === "updated").length,
        skipped: results.filter((r) => r.action === "skipped").length,
      });

      res.json({
        success: true,
        count: records.length,
        results,
      });
    } catch (error) {
      logger.error("Error uploading fresis history", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.delete(
  "/fresis-history/:id",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const existing = usersDb
        .prepare("SELECT id FROM fresis_history WHERE id = ? AND user_id = ?")
        .get(id, userId);

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Record non trovato",
        });
      }

      usersDb
        .prepare("DELETE FROM fresis_history WHERE id = ? AND user_id = ?")
        .run(id, userId);

      // Emit WebSocket event
      try {
        const {
          FresisHistoryRealtimeService,
        } = require("../fresis-history-realtime.service");
        const wsService = FresisHistoryRealtimeService.getInstance();
        wsService.emitHistoryDeleted(userId, id);
      } catch {
        // WS not available, skip
      }

      logger.info("Fresis history record deleted", { userId, id });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting fresis history record", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.post(
  "/fresis-history/:id/delete-from-archibald",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    try {
      const existing = usersDb
        .prepare(
          "SELECT id, archibald_order_id, archibald_order_number, current_state FROM fresis_history WHERE id = ? AND user_id = ?",
        )
        .get(id, userId) as any;

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Record non trovato",
        });
      }

      if (!existing.archibald_order_id) {
        return res.status(400).json({
          success: false,
          error: "Ordine non ha un ID Archibald associato",
        });
      }

      // Import bot dynamically to avoid circular deps
      const { ArchibaldBot } = await import("../archibald-bot");
      const { getDeleteProgressMilestone } = await import(
        "../job-progress-mapper"
      );

      const bot = new ArchibaldBot(userId);
      let botSuccess = false;

      // Set up progress callback to emit WS events
      let wsService: any;
      try {
        const mod = require("../fresis-history-realtime.service");
        wsService = mod.FresisHistoryRealtimeService.getInstance();
      } catch {
        // WS not available
      }

      bot.setProgressCallback(async (category: string) => {
        if (!wsService) return;
        const milestone = getDeleteProgressMilestone(category);
        if (!milestone) return;
        wsService.emitDeleteProgress(userId, id, milestone.progress, milestone.label);
      });

      try {
        await bot.initialize();

        const result = await bot.deleteOrderFromArchibald(
          existing.archibald_order_id,
        );

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.message,
          });
        }

        botSuccess = true;

        // Delete local record
        usersDb
          .prepare(
            "DELETE FROM fresis_history WHERE id = ? AND user_id = ?",
          )
          .run(id, userId);

        // Emit WebSocket event
        try {
          const {
            FresisHistoryRealtimeService,
          } = require("../fresis-history-realtime.service");
          const wsService = FresisHistoryRealtimeService.getInstance();
          wsService.emitHistoryDeleted(userId, id);
        } catch {
          // WS not available, skip
        }

        logger.info("Order deleted from Archibald and local DB", {
          userId,
          id,
          archibaldOrderId: existing.archibald_order_id,
          botMessage: result.message,
        });

        res.json({
          success: true,
          message: result.message,
        });
      } finally {
        // Always release the bot context
        try {
          if (!botSuccess) {
            (bot as any).hasError = true;
          }
          await bot.close();
        } catch (closeError) {
          logger.error("Error closing bot after delete-from-archibald", {
            closeError,
          });
        }
      }
    } catch (error) {
      logger.error("Error deleting order from Archibald", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        id,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante la cancellazione da Archibald",
      });
    }
  },
);

router.get(
  "/fresis-history/search-orders",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const q = (req.query.q as string) || "";

      const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
      let ordersDb: Database.Database;
      try {
        ordersDb = new Database(ordersDbPath, { readonly: true });
      } catch {
        return res.json({ success: true, orders: [] });
      }

      try {
        let rows: any[];

        if (!q.trim()) {
          rows = ordersDb
            .prepare(
              `SELECT o.id, o.order_number, o.customer_name, o.created_at, o.sales_status,
                      o.total_amount, o.gross_amount, o.discount_percent,
                      o.current_state, o.delivery_name, o.delivery_address,
                      o.ddt_number, o.invoice_number,
                      (SELECT COUNT(*) FROM order_articles WHERE order_id = o.id) as items_count
               FROM orders o
               WHERE o.user_id = ?
               ORDER BY o.created_at DESC
               LIMIT 50`,
            )
            .all(userId) as any[];
        } else {
          const searchPattern = `%${q.trim()}%`;
          rows = ordersDb
            .prepare(
              `SELECT o.id, o.order_number, o.customer_name, o.created_at, o.sales_status,
                      o.total_amount, o.gross_amount, o.discount_percent,
                      o.current_state, o.delivery_name, o.delivery_address,
                      o.ddt_number, o.invoice_number,
                      (SELECT COUNT(*) FROM order_articles WHERE order_id = o.id) as items_count
               FROM orders o
               WHERE o.user_id = ? AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.delivery_name LIKE ?)
               ORDER BY o.created_at DESC
               LIMIT 50`,
            )
            .all(userId, searchPattern, searchPattern, searchPattern) as any[];
        }

        res.json({
          success: true,
          orders: rows.map((r) => ({
            id: r.id,
            orderNumber: r.order_number,
            customerName: r.customer_name,
            createdAt: r.created_at,
            status: r.sales_status ?? null,
            totalAmount: r.total_amount ?? null,
            grossAmount: r.gross_amount ?? null,
            discountPercent: r.discount_percent ?? null,
            currentState: r.current_state ?? null,
            deliveryName: r.delivery_name ?? null,
            ddtNumber: r.ddt_number ?? null,
            invoiceNumber: r.invoice_number ?? null,
            itemsCount: r.items_count ?? 0,
          })),
        });
      } finally {
        ordersDb.close();
      }
    } catch (error) {
      logger.error("Error searching orders for fresis history", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.get(
  "/fresis-history/export-arca",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const tmpDir = createExportTempDir();

    try {
      const userId = req.user!.userId;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      let query = "SELECT * FROM fresis_history WHERE user_id = ?";
      const params: (string | number)[] = [userId];

      if (from) {
        query += " AND created_at >= ?";
        params.push(from);
      }
      if (to) {
        const toEnd = to + "T23:59:59";
        query += " AND created_at <= ?";
        params.push(toEnd);
      }

      query += " AND arca_data IS NOT NULL";

      const rows = usersDb.prepare(query).all(...params) as any[];

      if (rows.length === 0) {
        cleanupExportDir(tmpDir);
        return res.status(404).json({
          success: false,
          error: "Nessun documento con dati Arca nel periodo selezionato",
        });
      }

      const stats = await exportToArcaDbf(rows, tmpDir);

      const dateSuffix = from || to ? `_${from || ""}_${to || ""}` : "";
      const filename = `export-arca${dateSuffix}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );

      await streamExportAsZip(tmpDir, res);

      logger.info("Arca export completed", { userId, stats });
    } catch (error) {
      logger.error("Error exporting Arca files", { error });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Errore durante l'esportazione dei file Arca",
        });
      }
    } finally {
      cleanupExportDir(tmpDir);
    }
  },
);

router.get(
  "/fresis-history/next-ft-number",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const esercizio = (req.query.esercizio as string) || String(new Date().getFullYear());

      ensureFtCounterTable(usersDb);
      const ftNumber = getNextFtNumber(usersDb, esercizio, userId);

      res.json({ success: true, ftNumber, esercizio });
    } catch (error) {
      logger.error("Error getting next FT number", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.post(
  "/fresis-history/propagate-state",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { orderId, currentState, ddtNumber, trackingNumber, trackingUrl,
        trackingCourier, invoiceNumber, invoiceDate, invoiceAmount,
        invoiceClosed, invoiceRemainingAmount, invoiceDueDate,
        deliveryCompletedDate, ddtDeliveryDate } = req.body;

      if (!orderId) {
        return res.status(400).json({ success: false, error: "orderId richiesto" });
      }

      const now = new Date().toISOString();
      const result = usersDb
        .prepare(
          `UPDATE fresis_history SET
            current_state = COALESCE(?, current_state),
            state_updated_at = ?,
            ddt_number = COALESCE(?, ddt_number),
            ddt_delivery_date = COALESCE(?, ddt_delivery_date),
            tracking_number = COALESCE(?, tracking_number),
            tracking_url = COALESCE(?, tracking_url),
            tracking_courier = COALESCE(?, tracking_courier),
            delivery_completed_date = COALESCE(?, delivery_completed_date),
            invoice_number = COALESCE(?, invoice_number),
            invoice_date = COALESCE(?, invoice_date),
            invoice_amount = COALESCE(?, invoice_amount),
            invoice_closed = COALESCE(?, invoice_closed),
            invoice_remaining_amount = COALESCE(?, invoice_remaining_amount),
            invoice_due_date = COALESCE(?, invoice_due_date),
            updated_at = ?
          WHERE user_id = ? AND (
            merged_into_order_id = ?
            OR archibald_order_id = ?
            OR archibald_order_id LIKE ?
          ) AND source = 'app'`,
        )
        .run(
          currentState ?? null, now,
          ddtNumber ?? null, ddtDeliveryDate ?? null,
          trackingNumber ?? null, trackingUrl ?? null, trackingCourier ?? null,
          deliveryCompletedDate ?? null,
          invoiceNumber ?? null, invoiceDate ?? null, invoiceAmount ?? null,
          invoiceClosed != null ? (invoiceClosed ? 1 : 0) : null,
          invoiceRemainingAmount ?? null, invoiceDueDate ?? null,
          now, userId, orderId, orderId, `%"${orderId}"%`,
        );

      res.json({ success: true, updatedCount: result.changes });
    } catch (error) {
      logger.error("Error propagating state to fresis children", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.get(
  "/fresis-history/by-mother-order/:orderId",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { orderId } = req.params;

      const rows = usersDb
        .prepare(
          `SELECT * FROM fresis_history
           WHERE user_id = ? AND (
             merged_into_order_id = ?
             OR archibald_order_id = ?
             OR archibald_order_id LIKE ?
           )`,
        )
        .all(userId, orderId, orderId, `%"${orderId}"%`) as any[];

      res.json({
        success: true,
        records: rows.map(rowToRecord),
      });
    } catch (error) {
      logger.error("Error fetching FT by mother order", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.get(
  "/fresis-history/siblings/:archibaldOrderId",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { archibaldOrderId } = req.params;

      const ids = archibaldOrderId.split(",").map((id) => id.trim()).filter(Boolean);

      if (ids.length === 0) {
        return res.json({ success: true, records: [] });
      }

      const placeholders = ids.flatMap(() => ["?", "?", "?"]);
      const params: (string | number)[] = [];
      const conditions: string[] = [];

      for (const id of ids) {
        conditions.push("(archibald_order_id = ? OR archibald_order_id LIKE ? OR merged_into_order_id = ?)");
        params.push(id, `%"${id}"%`, id);
      }

      const rows = usersDb
        .prepare(
          `SELECT * FROM fresis_history WHERE user_id = ? AND (${conditions.join(" OR ")})`,
        )
        .all(userId, ...params) as any[];

      res.json({
        success: true,
        records: rows.map(rowToRecord),
      });
    } catch (error) {
      logger.error("Error fetching sibling FTs", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.get(
  "/fresis-history/:id",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const row = usersDb
        .prepare("SELECT * FROM fresis_history WHERE id = ? AND user_id = ?")
        .get(id, userId) as any;

      if (!row) {
        return res.status(404).json({ success: false, error: "Record non trovato" });
      }

      res.json({ success: true, record: rowToRecord(row) });
    } catch (error) {
      logger.error("Error fetching fresis history record", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.post(
  "/fresis-history/import-arca",
  authenticateJWT,
  upload.array("files", 10),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Nessun file caricato",
        });
      }

      const uploadedFiles = files.map((f) => ({
        originalName: f.originalname,
        buffer: f.buffer,
      }));

      const hasRequired = ["DT.DBF", "DR.DBF", "CF.DBF"].every((suffix) =>
        files.some((f) => f.originalname.toUpperCase().endsWith(suffix)),
      );

      if (!hasRequired) {
        return res.status(400).json({
          success: false,
          error:
            "Servono almeno i file DT, DR e CF (suffisso *DT.DBF, *DR.DBF, *CF.DBF)",
        });
      }

      // Open orders DB for product matching (read-only)
      const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
      let ordersDb: Database.Database | null = null;
      try {
        ordersDb = new Database(ordersDbPath, { readonly: true });
      } catch {
        // orders DB may not exist yet
      }

      try {
        const result = await parseArcaExport(
          uploadedFiles,
          userId,
          ordersDb,
          usersDb,
        );

        // DELETE ALL previous arca_import records, then INSERT ALL
        const insertStmt = usersDb.prepare(`
          INSERT OR REPLACE INTO fresis_history (
            id, user_id, original_pending_order_id, sub_client_codice, sub_client_name,
            sub_client_data, customer_id, customer_name, items, discount_percent,
            target_total_with_vat, shipping_cost, shipping_tax, merged_into_order_id,
            merged_at, created_at, updated_at, notes, archibald_order_id,
            archibald_order_number, current_state, state_updated_at, ddt_number,
            ddt_delivery_date, tracking_number, tracking_url, tracking_courier,
            delivery_completed_date, invoice_number, invoice_date, invoice_amount,
            arca_data, revenue, source
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?
          )
        `);

        const importAll = usersDb.transaction((records: any[]) => {
          usersDb.prepare(
            "DELETE FROM fresis_history WHERE user_id = ? AND source = 'arca_import'",
          ).run(userId);

          for (const r of records) {
            insertStmt.run(
              r.id,
              r.user_id,
              r.original_pending_order_id,
              r.sub_client_codice,
              r.sub_client_name,
              r.sub_client_data,
              r.customer_id,
              r.customer_name,
              r.items,
              r.discount_percent,
              r.target_total_with_vat,
              r.shipping_cost,
              r.shipping_tax,
              r.merged_into_order_id,
              r.merged_at,
              r.created_at,
              r.updated_at,
              r.notes,
              r.archibald_order_id,
              r.archibald_order_number,
              r.current_state,
              r.state_updated_at,
              r.ddt_number,
              r.ddt_delivery_date,
              r.tracking_number,
              r.tracking_url,
              r.tracking_courier,
              r.delivery_completed_date,
              r.invoice_number,
              r.invoice_date,
              r.invoice_amount,
              r.arca_data ?? null,
              r.revenue ?? null,
              r.source,
            );
          }
        });

        importAll(result.records);

        // Initialize ft_counter from max NUMERODOC per esercizio
        ensureFtCounterTable(usersDb);
        for (const [esercizio, maxNum] of result.maxNumerodocByEsercizio) {
          initializeCounterFromImport(usersDb, esercizio, userId, maxNum);
        }

        // Emit WebSocket bulk imported event
        try {
          const {
            FresisHistoryRealtimeService,
          } = require("../fresis-history-realtime.service");
          const wsService = FresisHistoryRealtimeService.getInstance();
          wsService.emitBulkImported(userId, result.records.length);
        } catch {
          // WS not available, skip
        }

        logger.info("Arca import completed", {
          userId,
          invoices: result.stats.totalInvoices,
          rows: result.stats.totalRows,
          clients: result.stats.totalClients,
          errors: result.errors.length,
        });

        res.json({
          success: true,
          stats: result.stats,
          errors: result.errors,
        });
      } finally {
        ordersDb?.close();
      }
    } catch (error) {
      logger.error("Error importing Arca files", { error });
      res.status(500).json({
        success: false,
        error: "Errore durante l'importazione dei file Arca",
      });
    }
  },
);

router.post(
  "/fresis-history/:id/edit-in-archibald",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    try {
      const existing = usersDb
        .prepare(
          "SELECT id, archibald_order_id, archibald_order_number, current_state, items FROM fresis_history WHERE id = ? AND user_id = ?",
        )
        .get(id, userId) as any;

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Record non trovato",
        });
      }

      if (!existing.archibald_order_id) {
        return res.status(400).json({
          success: false,
          error: "Ordine non ha un ID Archibald associato",
        });
      }

      const { modifications, updatedItems } = req.body;

      if (!Array.isArray(modifications) || modifications.length === 0) {
        return res.status(400).json({
          success: false,
          error: "modifications deve essere un array non vuoto",
        });
      }

      const { ArchibaldBot } = await import("../archibald-bot");
      const { getEditProgressMilestone } = await import(
        "../job-progress-mapper"
      );

      const bot = new ArchibaldBot(userId);
      let botSuccess = false;

      let wsService: any;
      try {
        const mod = require("../fresis-history-realtime.service");
        wsService = mod.FresisHistoryRealtimeService.getInstance();
      } catch {
        // WS not available
      }

      bot.setProgressCallback(async (category: string, metadata?: Record<string, any>) => {
        if (!wsService) return;
        const milestone = getEditProgressMilestone(category, metadata);
        if (!milestone) return;
        wsService.emitEditProgress(userId, id, milestone.progress, milestone.label);
      });

      try {
        await bot.initialize();

        const result = await bot.editOrderInArchibald(
          existing.archibald_order_id,
          modifications,
        );

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.message,
          });
        }

        botSuccess = true;

        // Update local items in DB
        if (updatedItems) {
          usersDb
            .prepare(
              "UPDATE fresis_history SET items = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            )
            .run(JSON.stringify(updatedItems), new Date().toISOString(), id, userId);
        }

        // Emit WebSocket event
        try {
          const {
            FresisHistoryRealtimeService,
          } = require("../fresis-history-realtime.service");
          const ws = FresisHistoryRealtimeService.getInstance();
          ws.emitHistoryUpdated(userId, id);
        } catch {
          // WS not available
        }

        logger.info("Order edited in Archibald", {
          userId,
          id,
          archibaldOrderId: existing.archibald_order_id,
          modificationsCount: modifications.length,
          botMessage: result.message,
        });

        res.json({
          success: true,
          message: result.message,
        });
      } finally {
        try {
          if (!botSuccess) {
            (bot as any).hasError = true;
          }
          await bot.close();
        } catch (closeError) {
          logger.error("Error closing bot after edit-in-archibald", {
            closeError,
          });
        }
      }
    } catch (error) {
      logger.error("Error editing order in Archibald", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        id,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante la modifica su Archibald",
      });
    }
  },
);

export default router;
