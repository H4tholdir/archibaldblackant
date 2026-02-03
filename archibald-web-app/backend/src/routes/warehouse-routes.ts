import express, { type Request, type Response } from "express";
import multer from "multer";
import Database from "better-sqlite3";
import path from "path";
import {
  parseWarehouseFile,
  validateWarehouseFormat,
} from "../warehouse-parser";
import { logger } from "../logger";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";
import { ProductDatabase } from "../product-db";

const router = express.Router();

// Open databases
const usersDbPath = path.join(__dirname, "../../data/users.db");
const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
const usersDb = new Database(usersDbPath);
const ordersDb = new Database(ordersDbPath);
const productDb = ProductDatabase.getInstance();

// Configure multer for file upload (memory storage, max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Accept only .xlsx and .xls files
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ];

    if (
      allowedMimes.includes(file.mimetype) ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Solo file Excel (.xlsx, .xls) sono accettati"));
    }
  },
});

/**
 * POST /api/warehouse/upload
 * Upload and parse warehouse Excel file
 *
 * Response format:
 * {
 *   success: true,
 *   data: {
 *     items: WarehouseItem[],
 *     totalItems: number,
 *     totalQuantity: number,
 *     boxesCount: number,
 *     errors: string[]
 *   }
 * }
 */
router.post(
  "/warehouse/upload",
  upload.single("file"),
  (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error:
            "Nessun file caricato. Assicurati di inviare il file con il campo 'file'",
        });
      }

      logger.info("📤 Warehouse file uploaded", {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      // Validate format first
      const validationError = validateWarehouseFormat(req.file.buffer);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: `Formato file non valido: ${validationError}`,
        });
      }

      // Parse file
      const result = parseWarehouseFile(req.file.buffer);
      if (!result) {
        return res.status(500).json({
          success: false,
          error: "Errore durante il parsing del file Excel",
        });
      }

      // Check if parsing found any items
      if (result.totalItems === 0) {
        return res.status(400).json({
          success: false,
          error: "Nessun articolo valido trovato nel file",
          data: result,
        });
      }

      logger.info("✅ Warehouse file parsed successfully", {
        items: result.totalItems,
        quantity: result.totalQuantity,
        boxes: result.boxesCount,
        errorsCount: result.errors.length,
      });

      res.json({
        success: true,
        data: result,
        message: `${result.totalItems} articoli caricati da ${result.boxesCount} scatoli (${result.totalQuantity} pezzi totali)`,
      });
    } catch (error) {
      logger.error("❌ Warehouse upload error", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il caricamento del file",
      });
    }
  },
);

/**
 * GET /api/warehouse/format-guide
 * Return format requirements for warehouse Excel file
 */
router.get("/warehouse/format-guide", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      title: "Formato File Magazzino Excel",
      description: "Requisiti per il file Excel di magazzino",
      currentFormat: {
        columns: [
          {
            name: "Codice Corretto",
            required: true,
            description: "Codice articolo corretto (es: H129FSQ.104.023)",
            example: "H129FSQ.104.023",
          },
          {
            name: "Descrizione",
            required: false,
            description: "Descrizione articolo",
            example: "FRESA CT",
          },
          {
            name: "quantità",
            required: true,
            description: "Numero di pezzi disponibili",
            example: 5,
          },
        ],
        sheets: {
          description: "Ogni foglio rappresenta uno scatolo",
          naming: "Nomina i fogli come 'SCATOLO 1', 'SCATOLO 2', etc.",
          example: ["SCATOLO 1", "SCATOLO 2", "SCATOLO 3"],
        },
      },
      futureFormat: {
        note: "IN FUTURO il sistema accetterà solo 'codice manuale' + 'quantità' e genererà automaticamente 'Codice Corretto' e 'Descrizione' tramite matching con il database prodotti",
      },
      examples: {
        validRow: {
          "Codice Corretto": "H129FSQ.104.023",
          Descrizione: "FRESA CT",
          quantità: 5,
        },
        invalidRows: [
          {
            issue: "Codice mancante",
            row: { "Codice Corretto": "", quantità: 5 },
          },
          {
            issue: "Quantità non valida",
            row: { "Codice Corretto": "H129FSQ.104.023", quantità: 0 },
          },
        ],
      },
    },
  });
});

// ========== ITEM VALIDATION (for real-time fuzzy matching) ==========

/**
 * GET /api/warehouse/items/validate
 * Validate article code with fuzzy matching (no insert)
 *
 * Query params:
 *   - code: string (article code to validate)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     matchedProduct: Product | null,
 *     confidence: number,
 *     suggestions: Product[]
 *   }
 * }
 */
router.get(
  "/warehouse/items/validate",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.query;

      if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({
          success: false,
          error: "Parametro 'code' obbligatorio",
        });
      }

      // Fuzzy matching with product database
      const searchResults = productDb.searchProductsByName(code.trim(), 5);

      let matchedProduct = null;
      let confidence = 0;
      const suggestions = searchResults.map((r) => r.product);

      if (searchResults.length > 0) {
        const bestMatch = searchResults[0];
        confidence = bestMatch.confidence;
        matchedProduct = bestMatch.product;
      }

      res.json({
        success: true,
        data: {
          matchedProduct,
          confidence,
          suggestions,
        },
      });
    } catch (error) {
      logger.error("❌ Error validating warehouse item code", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

// ========== MANUAL ADD ITEM ==========

interface ManualAddItemRequest {
  articleCode: string;
  quantity: number;
  boxName: string;
}

/**
 * POST /api/warehouse/items/manual-add
 * Manually add warehouse item with fuzzy matching
 *
 * Request body:
 * {
 *   articleCode: string,
 *   quantity: number (> 0),
 *   boxName: string
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     item: WarehouseItem,
 *     matchedProduct: Product | null,
 *     confidence: number,
 *     suggestions: Product[]
 *   },
 *   warning?: string
 * }
 */
router.post(
  "/warehouse/items/manual-add",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.user!.deviceId || "unknown";
      const { articleCode, quantity, boxName } =
        req.body as ManualAddItemRequest;

      // Validation
      if (!articleCode || !articleCode.trim()) {
        return res.status(400).json({
          success: false,
          error: "Codice articolo obbligatorio",
        });
      }

      // Type-safe quantity validation
      if (
        !quantity ||
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Quantità deve essere un numero intero maggiore di 0",
        });
      }

      if (!boxName || !boxName.trim()) {
        return res.status(400).json({
          success: false,
          error: "Nome scatolo obbligatorio",
        });
      }

      // Fuzzy matching with product database
      const searchResults = productDb.searchProductsByName(articleCode, 5);

      let matchedProduct = null;
      let confidence = 0;
      let suggestions = searchResults.map((r) => r.product);
      let warning: string | undefined;
      let finalArticleCode = articleCode.trim();
      let description = "";

      if (searchResults.length > 0) {
        const bestMatch = searchResults[0];
        confidence = bestMatch.confidence;
        matchedProduct = bestMatch.product;

        if (confidence >= 0.7) {
          // High confidence: use matched product
          finalArticleCode = matchedProduct.name; // Use name (article code like H254LE.314.012), not id (variant)
          description = matchedProduct.description || ""; // Use actual description
        } else if (confidence >= 0.3) {
          // Medium confidence: warning + suggestions
          warning = `Match parziale (${Math.round(confidence * 100)}%). Verifica i suggerimenti o conferma il codice manuale.`;
          description = "";
        } else {
          // Low confidence: allow manual entry
          warning = `Nessun match trovato nel database prodotti. Articolo inserito con codice personalizzato.`;
          description = "";
        }
      } else {
        warning = `Nessun match trovato nel database prodotti. Articolo inserito con codice personalizzato.`;
      }

      // Ensure box exists in warehouse_boxes (create if not exists)
      // Use INSERT OR IGNORE to handle race conditions (idempotent)
      const now = Date.now();
      try {
        const insertResult = usersDb
          .prepare(
            `INSERT OR IGNORE INTO warehouse_boxes (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
          )
          .run(userId, boxName.trim(), now, now);

        if (insertResult.changes > 0) {
          logger.info("✅ Auto-created box in warehouse_boxes", {
            userId,
            boxName: boxName.trim(),
          });
        }
      } catch (error) {
        // Should never happen with OR IGNORE, but log just in case
        logger.warn("⚠️ Box creation skipped (already exists)", {
          userId,
          boxName: boxName.trim(),
        });
      }

      // Insert into warehouse_items
      const insertStmt = usersDb.prepare(`
        INSERT INTO warehouse_items (
          user_id, article_code, description, quantity, box_name,
          uploaded_at, device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        userId,
        finalArticleCode,
        description,
        quantity,
        boxName.trim(),
        now,
        deviceId,
      );

      const item = {
        id: result.lastInsertRowid,
        userId,
        articleCode: finalArticleCode,
        description,
        quantity,
        boxName: boxName.trim(),
        reservedForOrder: null,
        soldInOrder: null,
        uploadedAt: now,
        deviceId,
      };

      logger.info("✅ Warehouse item added manually", {
        userId,
        articleCode: finalArticleCode,
        quantity,
        boxName: boxName.trim(),
        confidence,
      });

      res.json({
        success: true,
        data: {
          item,
          matchedProduct,
          confidence,
          suggestions,
        },
        warning,
      });
    } catch (error) {
      logger.error("❌ Error adding warehouse item manually", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore durante aggiunta",
      });
    }
  },
);

// ========== BOX MANAGEMENT ==========

interface BoxWithStats {
  name: string;
  itemsCount: number;
  totalQuantity: number;
  availableItems: number;
  reservedItems: number;
  soldItems: number;
  canDelete: boolean;
}

/**
 * GET /api/warehouse/boxes
 * Get all boxes with statistics for current user (including empty boxes)
 */
router.get(
  "/warehouse/boxes",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      // Get all boxes from warehouse_boxes table AND from warehouse_items (for backward compatibility)
      // This ensures we show boxes even if warehouse_boxes table is empty
      // GROUP BY name to eliminate duplicates (boxes exist in both tables after migration)
      const allBoxes = usersDb
        .prepare(
          `
        SELECT name, MIN(created_at) as created_at, MAX(updated_at) as updated_at
        FROM (
          -- From warehouse_boxes table
          SELECT name, created_at, updated_at
          FROM warehouse_boxes
          WHERE user_id = ?

          UNION ALL

          -- From warehouse_items (fallback for boxes not in warehouse_boxes)
          SELECT DISTINCT
            box_name as name,
            MIN(uploaded_at) as created_at,
            MAX(uploaded_at) as updated_at
          FROM warehouse_items
          WHERE user_id = ?
          GROUP BY box_name
        )
        GROUP BY name
        ORDER BY name
      `,
        )
        .all(userId, userId) as any[];

      // Get statistics for boxes that have items
      const stats = usersDb
        .prepare(
          `
        SELECT
          box_name,
          COUNT(*) as items_count,
          SUM(quantity) as total_quantity,
          SUM(CASE WHEN reserved_for_order IS NULL AND sold_in_order IS NULL THEN 1 ELSE 0 END) as available_items,
          SUM(CASE WHEN reserved_for_order IS NOT NULL THEN 1 ELSE 0 END) as reserved_items,
          SUM(CASE WHEN sold_in_order IS NOT NULL THEN 1 ELSE 0 END) as sold_items
        FROM warehouse_items
        WHERE user_id = ?
        GROUP BY box_name
      `,
        )
        .all(userId) as any[];

      // Create map for quick lookup
      const statsMap = new Map(
        stats.map((s: any) => [
          s.box_name,
          {
            itemsCount: s.items_count,
            totalQuantity: s.total_quantity || 0,
            availableItems: s.available_items || 0,
            reservedItems: s.reserved_items || 0,
            soldItems: s.sold_items || 0,
          },
        ]),
      );

      // Optimization: Single query for all referenced boxes (avoid N+1)
      const pendingOrders = ordersDb
        .prepare(
          `
        SELECT items_json
        FROM pending_orders
        WHERE user_id = ?
      `,
        )
        .all(userId) as any[];

      const referencedBoxes = new Set<string>();
      for (const order of pendingOrders) {
        try {
          const items = JSON.parse(order.items_json);
          for (const item of items) {
            if (item.boxName) {
              referencedBoxes.add(item.boxName);
            }
            // Also check warehouseSources if present
            if (item.warehouseSources) {
              for (const source of item.warehouseSources) {
                if (source.boxName) {
                  referencedBoxes.add(source.boxName);
                }
              }
            }
          }
        } catch (parseError) {
          // Skip malformed JSON
          logger.warn("⚠️ Failed to parse items_json", { parseError });
        }
      }

      const boxes: BoxWithStats[] = allBoxes.map((box) => {
        const boxStats = statsMap.get(box.name) || {
          itemsCount: 0,
          totalQuantity: 0,
          availableItems: 0,
          reservedItems: 0,
          soldItems: 0,
        };

        // O(1) lookup instead of query per box
        const isReferenced = referencedBoxes.has(box.name);
        const canDelete = boxStats.itemsCount === 0 && !isReferenced;

        return {
          name: box.name,
          itemsCount: boxStats.itemsCount,
          totalQuantity: boxStats.totalQuantity,
          availableItems: boxStats.availableItems,
          reservedItems: boxStats.reservedItems,
          soldItems: boxStats.soldItems,
          canDelete,
        };
      });

      res.json({
        success: true,
        boxes,
      });
    } catch (error) {
      logger.error("❌ Error fetching warehouse boxes", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

/**
 * POST /api/warehouse/boxes
 * Create new box
 */
router.post(
  "/warehouse/boxes",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: "Nome scatolo obbligatorio",
        });
      }

      // Check if box already exists in warehouse_boxes
      const existing = usersDb
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM warehouse_boxes
        WHERE user_id = ? AND name = ?
      `,
        )
        .get(userId, name.trim()) as any;

      if (existing.count > 0) {
        return res.status(409).json({
          success: false,
          error: "Uno scatolo con questo nome esiste già",
        });
      }

      // Insert into warehouse_boxes table
      const now = Date.now();
      const insertStmt = usersDb.prepare(`
        INSERT INTO warehouse_boxes (user_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `);

      insertStmt.run(userId, name.trim(), now, now);

      const box: BoxWithStats = {
        name: name.trim(),
        itemsCount: 0,
        totalQuantity: 0,
        availableItems: 0,
        reservedItems: 0,
        soldItems: 0,
        canDelete: true,
      };

      logger.info("✅ Warehouse box created in warehouse_boxes", {
        userId,
        boxName: name.trim(),
      });

      res.json({
        success: true,
        box,
      });
    } catch (error) {
      logger.error("❌ Error creating warehouse box", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

/**
 * PUT /api/warehouse/boxes/:oldName
 * Rename box (updates warehouse_items and pending_orders)
 */
router.put(
  "/warehouse/boxes/:oldName",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { oldName } = req.params;
      const { newName } = req.body;

      if (!newName || !newName.trim()) {
        return res.status(400).json({
          success: false,
          error: "Nuovo nome obbligatorio",
        });
      }

      if (oldName === newName.trim()) {
        return res.status(400).json({
          success: false,
          error: "Il nuovo nome deve essere diverso",
        });
      }

      // Check if new name already exists in warehouse_boxes
      const existing = usersDb
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM warehouse_boxes
        WHERE user_id = ? AND name = ?
      `,
        )
        .get(userId, newName.trim()) as any;

      if (existing.count > 0) {
        return res.status(409).json({
          success: false,
          error: "Uno scatolo con il nuovo nome esiste già",
        });
      }

      // Atomic transaction: update warehouse_boxes + warehouse_items + pending_orders
      // Step 1: Prepare statements
      const updateBoxStmt = usersDb.prepare(`
        UPDATE warehouse_boxes
        SET name = ?, updated_at = ?
        WHERE user_id = ? AND name = ?
      `);

      const updateItemsStmt = usersDb.prepare(`
        UPDATE warehouse_items
        SET box_name = ?
        WHERE user_id = ? AND box_name = ?
      `);

      const selectOrdersStmt = ordersDb.prepare(`
        SELECT id, items_json
        FROM pending_orders
        WHERE user_id = ? AND items_json LIKE '%"boxName":"' || ? || '"%'
      `);

      const updateOrderStmt = ordersDb.prepare(`
        UPDATE pending_orders
        SET items_json = ?
        WHERE id = ?
      `);

      // Step 2: Execute in transactions with rollback on failure
      let itemsResult: any;
      let updatedOrders = 0;
      const updateTime = Date.now();

      try {
        // Transaction 1: Update warehouse_boxes + warehouse_items
        const updateWarehouseTransaction = usersDb.transaction(() => {
          // Update box name in warehouse_boxes
          updateBoxStmt.run(newName.trim(), updateTime, userId, oldName);
          // Update all items with old box name
          return updateItemsStmt.run(newName.trim(), userId, oldName);
        });
        itemsResult = updateWarehouseTransaction();

        // Transaction 2: Update pending_orders
        const updateOrdersTransaction = ordersDb.transaction(() => {
          const pendingOrders = selectOrdersStmt.all(userId, oldName) as any[];
          let count = 0;

          for (const order of pendingOrders) {
            const items = JSON.parse(order.items_json);
            const updatedItems = items.map((item: any) => {
              if (item.boxName === oldName) {
                return { ...item, boxName: newName.trim() };
              }
              return item;
            });
            updateOrderStmt.run(JSON.stringify(updatedItems), order.id);
            count++;
          }

          return count;
        });
        updatedOrders = updateOrdersTransaction();
      } catch (ordersError) {
        // Rollback: revert warehouse_boxes + warehouse_items to old name
        logger.error("❌ Error updating pending_orders, rolling back", {
          ordersError,
        });
        try {
          const rollbackTransaction = usersDb.transaction(() => {
            // Revert warehouse_boxes
            usersDb
              .prepare(
                `UPDATE warehouse_boxes SET name = ? WHERE user_id = ? AND name = ?`,
              )
              .run(oldName, userId, newName.trim());
            // Revert warehouse_items
            usersDb
              .prepare(
                `UPDATE warehouse_items SET box_name = ? WHERE user_id = ? AND box_name = ?`,
              )
              .run(oldName, userId, newName.trim());
          });
          rollbackTransaction();
          logger.info(
            "✅ Rollback successful (warehouse_boxes + warehouse_items)",
          );
        } catch (rollbackError) {
          logger.error("❌ CRITICAL: Rollback failed!", { rollbackError });
        }
        throw ordersError; // Re-throw to return error to client
      }

      logger.info("✅ Warehouse box renamed", {
        userId,
        oldName,
        newName: newName.trim(),
        updatedItems: itemsResult.changes,
        updatedOrders,
      });

      res.json({
        success: true,
        updatedItems: itemsResult.changes,
        updatedOrders,
      });
    } catch (error) {
      logger.error("❌ Error renaming warehouse box", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

/**
 * DELETE /api/warehouse/boxes/:name
 * Delete box (only if empty and not referenced in orders)
 */
router.delete(
  "/warehouse/boxes/:name",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name } = req.params;

      // Check if box has items
      const itemsCount = usersDb
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM warehouse_items
        WHERE user_id = ? AND box_name = ?
      `,
        )
        .get(userId, name) as any;

      if (itemsCount.count > 0) {
        return res.status(409).json({
          success: false,
          error: "Impossibile cancellare: lo scatolo contiene articoli",
        });
      }

      // Check if box is referenced in pending_orders
      const orderCount = ordersDb
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM pending_orders
        WHERE user_id = ? AND items_json LIKE '%"boxName":"' || ? || '"%'
      `,
        )
        .get(userId, name) as any;

      if (orderCount.count > 0) {
        return res.status(409).json({
          success: false,
          error:
            "Impossibile cancellare: lo scatolo è referenziato in ordini pendenti",
        });
      }

      // Delete from warehouse_boxes
      usersDb
        .prepare(`DELETE FROM warehouse_boxes WHERE user_id = ? AND name = ?`)
        .run(userId, name);

      logger.info("✅ Warehouse box deleted from warehouse_boxes", {
        userId,
        boxName: name,
      });

      res.json({
        success: true,
      });
    } catch (error) {
      logger.error("❌ Error deleting warehouse box", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

// ========== MOVE ITEMS ==========

interface MoveItemsRequest {
  itemIds: number[];
  destinationBox: string;
}

/**
 * POST /api/warehouse/items/move
 * Move items to different box (skips reserved/sold items)
 */
router.post(
  "/warehouse/items/move",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { itemIds, destinationBox } = req.body as MoveItemsRequest;

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "itemIds deve essere array non vuoto",
        });
      }

      if (!destinationBox || !destinationBox.trim()) {
        return res.status(400).json({
          success: false,
          error: "destinationBox obbligatorio",
        });
      }

      // Move only available items (not reserved/sold)
      const placeholders = itemIds.map(() => "?").join(", ");
      const updateStmt = usersDb.prepare(`
        UPDATE warehouse_items
        SET box_name = ?
        WHERE id IN (${placeholders})
          AND user_id = ?
          AND reserved_for_order IS NULL
          AND sold_in_order IS NULL
      `);

      const result = updateStmt.run(destinationBox.trim(), ...itemIds, userId);

      const movedCount = result.changes;
      const skippedCount = itemIds.length - movedCount;

      logger.info("✅ Warehouse items moved", {
        userId,
        destinationBox: destinationBox.trim(),
        movedCount,
        skippedCount,
      });

      res.json({
        success: true,
        movedCount,
        skippedCount,
      });
    } catch (error) {
      logger.error("❌ Error moving warehouse items", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

// ========== CLEAR ALL WAREHOUSE DATA ==========

/**
 * DELETE /api/warehouse/clear-all
 * Clear all warehouse data (items, boxes, metadata) for current user
 * Useful for resetting warehouse before re-uploading Excel file
 */
router.delete(
  "/warehouse/clear-all",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      // Delete in correct order (respect foreign keys)
      const itemsResult = usersDb
        .prepare("DELETE FROM warehouse_items WHERE user_id = ?")
        .run(userId);

      const boxesResult = usersDb
        .prepare("DELETE FROM warehouse_boxes WHERE user_id = ?")
        .run(userId);

      // Note: warehouse_metadata doesn't have user_id in current schema
      // If it exists, it should be cleared separately

      logger.info("✅ Warehouse data cleared", {
        userId,
        itemsDeleted: itemsResult.changes,
        boxesDeleted: boxesResult.changes,
      });

      res.json({
        success: true,
        itemsDeleted: itemsResult.changes,
        boxesDeleted: boxesResult.changes,
      });
    } catch (error) {
      logger.error("❌ Error clearing warehouse data", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore server",
      });
    }
  },
);

export default router;
