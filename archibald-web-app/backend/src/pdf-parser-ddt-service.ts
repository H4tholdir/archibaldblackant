import { spawn } from "child_process";
import { logger } from "./logger";
import path from "node:path";

export interface ParsedDDT {
  id: string;
  ddt_number: string;
  delivery_date: string | null;
  order_number: string;
  customer_account: string | null;
  sales_name: string | null;
  delivery_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_courier: string | null;
  delivery_terms: string | null;
  delivery_method: string | null;
  delivery_city: string | null;
}

export class PDFParserDDTService {
  private static instance: PDFParserDDTService;
  private readonly parserPath: string;
  private readonly timeout: number = 180000; // 3 minutes

  private constructor() {
    this.parserPath = path.join(
      __dirname,
      "../../../scripts/parse-ddt-pdf.py",
    );
  }

  static getInstance(): PDFParserDDTService {
    if (!PDFParserDDTService.instance) {
      PDFParserDDTService.instance = new PDFParserDDTService();
    }
    return PDFParserDDTService.instance;
  }

  async parseDDTPDF(pdfPath: string): Promise<ParsedDDT[]> {
    logger.info("[PDFParserDDTService] Starting PDF parsing", { pdfPath });

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const ddts: ParsedDDT[] = [];
      let stdoutBuffer = "";

      const pythonProcess = spawn("python3", [this.parserPath, pdfPath], {
        timeout: this.timeout,
      });

      pythonProcess.stdout.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();

        // Process complete lines
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const ddt = JSON.parse(line) as ParsedDDT;
              ddts.push(ddt);
            } catch (e) {
              logger.warn("[PDFParserDDTService] Failed to parse line", {
                line,
              });
            }
          }
        }
      });

      pythonProcess.stderr.on("data", (data: Buffer) => {
        logger.warn("[PDFParserDDTService] Python stderr", {
          stderr: data.toString(),
        });
      });

      pythonProcess.on("close", (code: number | null) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          logger.info("[PDFParserDDTService] Parsing complete", {
            duration: `${duration}ms`,
            ddtCount: ddts.length,
          });
          resolve(ddts);
        } else {
          logger.error("[PDFParserDDTService] Parsing failed", {
            code,
            duration: `${duration}ms`,
          });
          reject(new Error(`DDT PDF parsing failed with code ${code}`));
        }
      });

      pythonProcess.on("error", (err: Error) => {
        logger.error("[PDFParserDDTService] Process error", {
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
