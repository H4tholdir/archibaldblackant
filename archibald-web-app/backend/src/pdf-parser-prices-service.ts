import { spawn } from 'child_process';
import path from 'path';
import { logger } from './logger';

/**
 * Parsed price record from PDF (matches Python parser output)
 * 3-page cycle structure
 */
export interface ParsedPrice {
  // Page 1: Identificazione
  product_id: string;
  item_selection?: string | null;  // K2, K3, etc.
  account_code?: string | null;
  account_description?: string | null;

  // Page 2: Descrizione
  product_name?: string | null;
  price_valid_from?: string | null;
  price_valid_to?: string | null;
  quantity_from?: string | null;
  quantity_to?: string | null;

  // Page 3: Prezzi (KEY PAGE)
  unit_price?: string | null;  // IMPORTO UNITARIO (Italian format: "1.234,56 €")
  currency?: string | null;
  price_unit?: string | null;
  net_price_brasseler?: string | null;  // PREZZO NETTO (Italian format)
}

/**
 * Service for parsing price PDF exports via Python script
 * Follows Phase 18/19 pattern: child_process.spawn with 20MB buffer
 * Handles 3-page cycles per product
 */
export class PDFParserPricesService {
  private static instance: PDFParserPricesService;
  private parserPath: string;
  private timeout: number = 30000; // 30s for ~4,540 prices

  private constructor() {
    // Path relative to backend root
    this.parserPath = path.join(__dirname, '../../../scripts/parse-prices-pdf.py');
  }

  static getInstance(): PDFParserPricesService {
    if (!PDFParserPricesService.instance) {
      PDFParserPricesService.instance = new PDFParserPricesService();
    }
    return PDFParserPricesService.instance;
  }

  /**
   * Parse prices PDF and return structured data
   *
   * @param pdfPath Absolute path to PDF file
   * @returns Array of parsed price records
   * @throws Error if Python not found, parser fails, or timeout
   */
  async parsePDF(pdfPath: string): Promise<ParsedPrice[]> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // Spawn Python process (NOT exec - better for large output)
      const python = spawn('python3', [this.parserPath, pdfPath], {
        timeout: this.timeout,
        maxBuffer: 20 * 1024 * 1024, // 20MB buffer for large JSON output
      });

      let stdout = '';
      let stderr = '';

      // Collect stdout data
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr data (warnings/errors)
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      python.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          try {
            const prices = JSON.parse(stdout) as ParsedPrice[];
            logger.info(`[PDFParserPricesService] Parsed ${prices.length} prices in ${duration}ms (3-page cycles)`);
            resolve(prices);
          } catch (error) {
            logger.error('[PDFParserPricesService] JSON parse error', {
              error,
              stdout: stdout.slice(0, 500),
              stderr
            });
            reject(new Error(`Failed to parse JSON output: ${error}`));
          }
        } else {
          logger.error('[PDFParserPricesService] Python script failed', {
            code,
            stderr,
            duration
          });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }
      });

      // Handle spawn errors
      python.on('error', (error) => {
        logger.error('[PDFParserPricesService] Spawn error', { error });
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });

      // Handle timeout
      python.on('exit', (code, signal) => {
        if (signal === 'SIGTERM') {
          const duration = Date.now() - startTime;
          logger.error('[PDFParserPricesService] Process timeout', { duration });
          reject(new Error(`PDF parsing timeout after ${duration}ms`));
        }
      });
    });
  }

  /**
   * Health check: verify Python3 and PyPDF2 are available
   * Matches Phase 18/19 pattern
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    pythonVersion?: string;
    pyPDF2Available?: boolean;
    error?: string
  }> {
    try {
      // Check Python version
      const pythonVersion = await new Promise<string>((resolve, reject) => {
        const python = spawn('python3', ['--version']);
        let output = '';

        python.stdout.on('data', (data) => output += data.toString());
        python.stderr.on('data', (data) => output += data.toString());

        python.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(`Python check failed with code ${code}`));
          }
        });
      });

      // Check PyPDF2 library
      const pyPDF2Check = await new Promise<boolean>((resolve) => {
        const python = spawn('python3', ['-c', 'import PyPDF2; print("OK")']);
        let output = '';

        python.stdout.on('data', (data) => output += data.toString());

        python.on('close', (code) => {
          resolve(code === 0 && output.includes('OK'));
        });
      });

      logger.info('[PDFParserPricesService] Health check passed', {
        pythonVersion,
        pyPDF2Available: pyPDF2Check
      });

      return {
        healthy: pyPDF2Check,
        pythonVersion,
        pyPDF2Available: pyPDF2Check,
      };
    } catch (error) {
      logger.error('[PDFParserPricesService] Health check failed', { error });
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
