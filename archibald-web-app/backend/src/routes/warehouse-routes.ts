import express, { type Request, type Response } from "express";
import multer from "multer";
import {
  parseWarehouseFile,
  validateWarehouseFormat,
} from "../warehouse-parser";
import { logger } from "../logger";

const router = express.Router();

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

export default router;
