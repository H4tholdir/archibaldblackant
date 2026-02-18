import { spawn } from "child_process";
import { logger } from "./logger";
import path from "node:path";
import { extractCycleSizeWarnings } from "./cycle-size-warning";
import type { CycleSizeWarning } from "./cycle-size-warning";

export interface ParsedOrder {
  id: string;
  order_number: string | null; // Can be null for pending orders awaiting Milano processing
  customer_profile_id: string | null; // Can be null for pending orders
  customer_name: string | null; // Can be null for pending orders
  delivery_name: string | null;
  delivery_address: string | null;
  creation_date: string; // ISO 8601
  delivery_date: string | null;
  remaining_sales_financial: string | null;
  customer_reference: string | null;
  sales_status: string | null;
  order_type: string | null;
  document_status: string | null;
  sales_origin: string | null;
  transfer_status: string | null;
  transfer_date: string | null;
  completion_date: string | null;
  discount_percent: string | null;
  gross_amount: string | null;
  total_amount: string | null;
}

export class PDFParserOrdersService {
  private static instance: PDFParserOrdersService;
  private readonly parserPath: string;
  private readonly timeout: number = 300000; // 5 minutes
  private readonly maxBuffer: number = 20 * 1024 * 1024; // 20MB
  private lastWarnings: CycleSizeWarning[] = [];

  private constructor() {
    this.parserPath = path.join(
      __dirname,
      "../../../scripts/parse-orders-pdf.py",
    );
  }

  static getInstance(): PDFParserOrdersService {
    if (!PDFParserOrdersService.instance) {
      PDFParserOrdersService.instance = new PDFParserOrdersService();
    }
    return PDFParserOrdersService.instance;
  }

  async parseOrdersPDF(pdfPath: string): Promise<ParsedOrder[]> {
    logger.info("[PDFParserOrdersService] Starting PDF parsing", { pdfPath });

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const orders: ParsedOrder[] = [];
      let stdoutBuffer = "";
      let stderrBuffer = "";

      const pythonProcess = spawn("python3", [this.parserPath, pdfPath], {
        timeout: this.timeout,
      });

      // Collect stdout (line-by-line JSON)
      pythonProcess.stdout.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();

        // Process complete lines
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const order = JSON.parse(line) as ParsedOrder;
              orders.push(order);
            } catch (e) {
              logger.warn("[PDFParserOrdersService] Failed to parse line", {
                line,
              });
            }
          }
        }
      });

      // Collect stderr
      pythonProcess.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderrBuffer += chunk;
        logger.warn("[PDFParserOrdersService] Python stderr", {
          stderr: chunk,
        });
      });

      // Handle exit
      pythonProcess.on("close", (code: number | null) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          logger.info("[PDFParserOrdersService] Parsing complete", {
            duration: `${duration}ms`,
            ordersCount: orders.length,
          });
          this.lastWarnings = extractCycleSizeWarnings(stderrBuffer);
          for (const w of this.lastWarnings) {
            if (w.status === "CHANGED") {
              logger.error("[PDFParserOrdersService] Cycle size CHANGED", w);
            }
          }
          resolve(orders);
        } else {
          logger.error("[PDFParserOrdersService] Parsing failed", {
            code,
            duration: `${duration}ms`,
          });
          reject(new Error(`PDF parsing failed with code ${code}`));
        }
      });

      // Handle timeout
      pythonProcess.on("error", (err: Error) => {
        logger.error("[PDFParserOrdersService] Process error", {
          error: err.message,
        });
        reject(err);
      });
    });
  }

  getLastWarnings(): CycleSizeWarning[] {
    return this.lastWarnings;
  }

  isAvailable(): boolean {
    try {
      const fs = require("fs");
      return fs.existsSync(this.parserPath);
    } catch {
      return false;
    }
  }
}
