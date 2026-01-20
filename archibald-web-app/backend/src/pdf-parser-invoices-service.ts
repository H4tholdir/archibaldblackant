import { spawn } from "child_process";
import { logger } from "./logger";
import path from "node:path";

export interface ParsedInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  customer_account: string;
  billing_name: string | null;
  quantity: string | null;
  sales_balance: string | null;
  amount: string | null;
  vat_amount: string | null;
  total_amount: string | null;
  payment_terms: string | null;
}

export class PDFParserInvoicesService {
  private static instance: PDFParserInvoicesService;
  private readonly parserPath: string;
  private readonly timeout: number = 120000; // 2 minutes (less than orders)
  private readonly maxBuffer: number = 20 * 1024 * 1024; // 20MB

  private constructor() {
    this.parserPath = path.join(
      __dirname,
      "../../../scripts/parse-invoices-pdf.py",
    );
  }

  static getInstance(): PDFParserInvoicesService {
    if (!PDFParserInvoicesService.instance) {
      PDFParserInvoicesService.instance = new PDFParserInvoicesService();
    }
    return PDFParserInvoicesService.instance;
  }

  async parseInvoicesPDF(pdfPath: string): Promise<ParsedInvoice[]> {
    logger.info("[PDFParserInvoicesService] Starting PDF parsing", {
      pdfPath,
    });

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const invoices: ParsedInvoice[] = [];
      let stdoutBuffer = "";

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
              const invoice = JSON.parse(line) as ParsedInvoice;
              invoices.push(invoice);
            } catch (e) {
              logger.warn("[PDFParserInvoicesService] Failed to parse line", {
                line,
              });
            }
          }
        }
      });

      // Log stderr
      pythonProcess.stderr.on("data", (data: Buffer) => {
        logger.warn("[PDFParserInvoicesService] Python stderr", {
          stderr: data.toString(),
        });
      });

      // Handle exit
      pythonProcess.on("close", (code: number | null) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          logger.info("[PDFParserInvoicesService] Parsing complete", {
            duration: `${duration}ms`,
            invoicesCount: invoices.length,
          });
          resolve(invoices);
        } else {
          logger.error("[PDFParserInvoicesService] Parsing failed", {
            code,
            duration: `${duration}ms`,
          });
          reject(new Error(`Invoice PDF parsing failed with code ${code}`));
        }
      });

      // Handle timeout
      pythonProcess.on("error", (err: Error) => {
        logger.error("[PDFParserInvoicesService] Process error", {
          error: err.message,
        });
        reject(err);
      });
    });
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
