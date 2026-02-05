/**
 * Price Management API Endpoints
 *
 * Endpoints for:
 * - Excel VAT import
 * - Price history retrieval
 * - Import history
 * - Unmatched products
 */

import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ExcelVatImporter } from "./excel-vat-importer";
import { PriceAuditHelper } from "./price-audit-helper";
import { ProductDatabase } from "./product-db";
import { WebSocketServerService } from "./websocket-server";
import { logger } from "./logger";

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, "../data/uploads"),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
});

interface ApiResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}

interface AuthRequest extends Request {
  user?: {
    userId: string;
    fullName: string;
    role: string;
  };
}

/**
 * POST /api/prices/import-excel
 * Upload Excel file with VAT data
 */
export const uploadExcelVat = [
  upload.single("file"),
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    let importer: ExcelVatImporter | null = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      const overwritePrices =
        req.body.overwritePrices === "true" ||
        req.body.overwritePrices === true;
      const uploadedBy = req.user?.userId;

      logger.info(`📊 Excel VAT import requested by ${uploadedBy}`);
      logger.info(`   File: ${req.file.originalname}`);
      logger.info(`   Overwrite prices: ${overwritePrices}`);

      // Import from Excel
      importer = new ExcelVatImporter();
      const result = await importer.importFromExcel(
        req.file.path,
        uploadedBy,
        overwritePrices,
      );

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      if (result.success) {
        logger.info(`✅ Excel import completed: ${result.matchedRows} matched`);

        // 🔔 Broadcast cache invalidation to all connected WebSocket clients
        const wsService = WebSocketServerService.getInstance();
        wsService.broadcastToAll({
          type: "cache_invalidation",
          payload: {
            target: "products",
            reason: "excel_import",
            importId: result.importId,
            matchedRows: result.matchedRows,
            vatUpdatedCount: result.vatUpdatedCount,
            priceUpdatedCount: result.priceUpdatedCount,
          },
          timestamp: new Date().toISOString(),
        });

        logger.info(
          "📡 Cache invalidation broadcast sent to all WebSocket clients",
        );

        res.json({
          success: true,
          data: result,
          message: `Import completato: ${result.matchedRows} prodotti aggiornati`,
        });
      } else {
        logger.error(`❌ Excel import failed: ${result.error}`);
        res.status(400).json({
          success: false,
          error: result.error || "Import failed",
        });
      }
    } catch (error: any) {
      logger.error("Error in Excel VAT import:", error);

      // Clean up uploaded file if exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    } finally {
      if (importer) {
        importer.close();
      }
    }
  },
];

/**
 * GET /api/prices/:productId/history
 * Get price change history for a specific product
 */
export async function getProductPriceHistory(
  req: Request,
  res: Response<ApiResponse>,
) {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const db = ProductDatabase.getInstance();
    const auditHelper = new PriceAuditHelper(db["db"]);

    const history = auditHelper.getProductPriceHistory(productId, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    logger.error("Error fetching product price history:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

/**
 * GET /api/prices/history/recent
 * Get recent price changes across all products
 */
export async function getRecentPriceChanges(
  req: Request,
  res: Response<ApiResponse>,
) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const db = ProductDatabase.getInstance();
    const auditHelper = new PriceAuditHelper(db["db"]);

    const history = auditHelper.getRecentPriceChanges(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    logger.error("Error fetching recent price changes:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

/**
 * GET /api/prices/imports
 * Get Excel import history
 */
export async function getImportHistory(
  req: Request,
  res: Response<ApiResponse>,
) {
  let importer: ExcelVatImporter | null = null;

  try {
    const limit = parseInt(req.query.limit as string) || 10;

    importer = new ExcelVatImporter();
    const history = importer.getImportHistory(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    logger.error("Error fetching import history:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  } finally {
    if (importer) {
      importer.close();
    }
  }
}

/**
 * GET /api/prices/unmatched
 * Get products without price/VAT
 */
export async function getUnmatchedProducts(
  req: Request,
  res: Response<ApiResponse>,
) {
  let importer: ExcelVatImporter | null = null;

  try {
    const limit = parseInt(req.query.limit as string) || 100;

    importer = new ExcelVatImporter();
    const products = importer.getProductsWithoutVat(limit);

    res.json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    logger.error("Error fetching unmatched products:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  } finally {
    if (importer) {
      importer.close();
    }
  }
}
