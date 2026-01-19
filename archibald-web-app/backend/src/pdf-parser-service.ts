import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { logger } from "./logger";

const execAsync = promisify(exec);

/**
 * Parsed customer from PDF (matches Python parser output)
 */
export interface ParsedCustomer {
  // Primary identification
  customer_profile: string;
  name: string;

  // Italian fiscal data
  vat_number?: string | null;
  fiscal_code?: string | null;
  sdi?: string | null;
  pec?: string | null;

  // Contact info
  phone?: string | null;
  mobile?: string | null;
  url?: string | null;
  attention_to?: string | null;

  // Address
  street?: string | null;
  logistics_address?: string | null;
  postal_code?: string | null;
  city?: string | null;

  // Business
  customer_type?: string | null;
  type?: string | null;
  delivery_terms?: string | null;
  description?: string | null;

  // Order history & analytics
  last_order_date?: string | null;
  actual_order_count?: number | null;
  previous_order_count_1?: number | null;
  previous_sales_1?: number | null;
  previous_order_count_2?: number | null;
  previous_sales_2?: number | null;

  // Account references
  external_account_number?: string | null;
  our_account_number?: string | null;
}

export interface PDFParseResult {
  total_customers: number;
  customers: ParsedCustomer[];
}

/**
 * Service for parsing customer PDF exports via Python script
 */
export class PDFParserService {
  private readonly parserPath: string;

  constructor() {
    // Path to parse-clienti-pdf.py from backend root
    this.parserPath = path.resolve(
      __dirname,
      "../../../scripts/parse-clienti-pdf.py",
    );
  }

  /**
   * Parse customer PDF and return structured data
   * @param pdfPath Absolute path to PDF file
   * @returns Parsed customer data
   * @throws Error if Python not found, parser fails, or invalid output
   */
  async parsePDF(pdfPath: string): Promise<PDFParseResult> {
    const startTime = Date.now();

    try {
      // Verify PDF exists
      await fs.access(pdfPath);

      logger.info(`[PDFParser] Starting parse: ${pdfPath}`);

      // Execute Python parser
      const { stdout, stderr } = await execAsync(
        `python3 "${this.parserPath}" "${pdfPath}" --output json`,
        {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large PDFs
          timeout: 30000, // 30s timeout
        },
      );

      // Log any warnings from stderr
      if (stderr) {
        logger.warn(`[PDFParser] Python stderr: ${stderr}`);
      }

      // Parse JSON output
      const result: PDFParseResult = JSON.parse(stdout);

      const duration = Date.now() - startTime;
      logger.info(
        `[PDFParser] Parsed ${result.total_customers} customers in ${duration}ms`,
      );

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`[PDFParser] Failed after ${duration}ms:`, error);

      // Enhance error messages
      if (error.code === "ENOENT") {
        if (error.path?.includes("python")) {
          throw new Error(
            "Python3 not found. Install Python 3.x and ensure it is in PATH.",
          );
        } else {
          throw new Error(`PDF file not found: ${pdfPath}`);
        }
      }

      if (error.killed) {
        throw new Error("PDF parsing timeout (30s exceeded)");
      }

      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Health check: verify Python and PyPDF2 are available
   * @returns true if ready, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check Python3
      const { stdout: pythonVersion } = await execAsync("python3 --version");
      logger.info(`[PDFParser] Python version: ${pythonVersion.trim()}`);

      // Check PyPDF2
      const { stdout: pipList } = await execAsync("pip3 list | grep PyPDF2");
      if (!pipList.includes("PyPDF2")) {
        logger.error(
          "[PDFParser] PyPDF2 not installed. Run: pip3 install PyPDF2",
        );
        return false;
      }

      logger.info("[PDFParser] Health check passed");
      return true;
    } catch (error: any) {
      logger.error("[PDFParser] Health check failed:", error.message);
      return false;
    }
  }
}

// Singleton instance
export const pdfParserService = new PDFParserService();
