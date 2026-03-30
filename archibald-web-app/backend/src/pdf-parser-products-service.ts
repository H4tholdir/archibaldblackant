import { spawn } from "child_process";
import { logger } from "./logger";
import path from "path";
import { extractCycleSizeWarnings } from "./cycle-size-warning";
import type { CycleSizeWarning } from "./cycle-size-warning";

export interface ParsedProduct {
  // Page 1
  id_articolo: string;
  nome_articolo: string;
  descrizione?: string;

  // Page 2
  gruppo_articolo?: string;
  contenuto_imballaggio?: string;
  nome_ricerca?: string;

  // Page 3
  unita_prezzo?: string;
  id_gruppo_prodotti?: string;
  descrizione_gruppo_articolo?: string;
  qta_minima?: string;

  // Page 4
  qta_multipli?: string;
  qta_massima?: string;
  figura?: string;
  dataareaid?: string;
  id_prodotto?: string;
  datetime_modificato?: string;

  // Page 5
  fermato?: string;
  id_blocco_articolo?: string;
  pacco_gamba?: string;
  grandezza?: string;
  id_configurazione?: string;

  // Page 6
  creato_da?: string;
  data_creata?: string;
  qta_predefinita?: string;
  visualizza_numero_prodotto?: string;

  // Page 7
  sconto_assoluto_totale?: string;
  sconto_linea?: string;
  modificato_da?: string;
  articolo_ordinabile?: string;

  // Page 8
  purch_price?: string;
  pcs_id_configurazione_standard?: string;
  qta_standard?: string;
  id_elemento_ivaid?: string;

  // Page 9
  id_unita?: string;
}

export class PDFParserProductsService {
  private static instance: PDFParserProductsService;
  private parserPath: string;
  private lastWarnings: CycleSizeWarning[] = [];
  private timeout: number = 420000; // 420s (7 minutes) - measured: 5m07s, buffer for safety

  private constructor() {
    // Path to parse-products-pdf.py
    // In Docker: /scripts/parse-products-pdf.py
    // In dev: ../../../scripts/parse-products-pdf.py
    this.parserPath =
      process.env.NODE_ENV === "production"
        ? "/scripts/parse-products-pdf.py"
        : path.resolve(__dirname, "../../../scripts/parse-products-pdf.py");
  }

  static getInstance(): PDFParserProductsService {
    if (!PDFParserProductsService.instance) {
      PDFParserProductsService.instance = new PDFParserProductsService();
    }
    return PDFParserProductsService.instance;
  }

  /**
   * Parse products PDF and return structured data
   */
  async parsePDF(pdfPath: string): Promise<ParsedProduct[]> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const python = spawn("python3", [this.parserPath, pdfPath], {
        timeout: this.timeout,
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          try {
            const parsed = JSON.parse(stdout) as { products: ParsedProduct[] };
            const products = parsed.products;
            logger.info(
              `[PDFParserProductsService] Parsed ${products.length} products in ${duration}ms`,
            );
            this.lastWarnings = extractCycleSizeWarnings(stderr);
            for (const w of this.lastWarnings) {
              if (w.status === "CHANGED") {
                logger.error("[PDFParserProductsService] Cycle size CHANGED", w);
              }
            }
            resolve(products);
          } catch (error) {
            logger.error("[PDFParserProductsService] JSON parse error", {
              error,
              stdout: stdout.slice(0, 500),
            });
            reject(new Error(`Failed to parse JSON output: ${error}`));
          }
        } else {
          const warnings = extractCycleSizeWarnings(stderr);
          const hasChanged = warnings.some((w) => w.status === 'CHANGED');
          if (hasChanged) {
            try {
              const partial = JSON.parse(stdout) as { products: ParsedProduct[] };
              if (partial.products && partial.products.length > 0) {
                logger.warn(
                  `[PDFParserProductsService] Python exited non-zero but recovered ${partial.products.length} products via CYCLE_SIZE_WARNING fallback`,
                  { code, warnings },
                );
                this.lastWarnings = warnings;
                resolve(partial.products);
                return;
              }
            } catch {
              // stdout is not valid products JSON, fall through to reject
            }
          }
          this.lastWarnings = [];
          logger.error('[PDFParserProductsService] Python script failed', {
            code,
            stderr,
            duration,
          });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }
      });

      python.on("error", (error) => {
        logger.error("[PDFParserProductsService] Spawn error", { error });
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }

  getLastWarnings(): CycleSizeWarning[] {
    return this.lastWarnings;
  }

  /**
   * Health check: verify Python and pdfplumber are available
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    pythonVersion?: string;
    pdfplumberAvailable?: boolean;
    error?: string;
  }> {
    try {
      // Check Python version
      const pythonVersion = await new Promise<string>((resolve, reject) => {
        const python = spawn("python3", ["--version"]);
        let output = "";
        python.stdout.on("data", (data) => (output += data.toString()));
        python.stderr.on("data", (data) => (output += data.toString()));
        python.on("close", (code) => {
          if (code === 0) resolve(output.trim());
          else reject(new Error(`Python check failed with code ${code}`));
        });
      });

      // Check pdfplumber
      const pdfplumberCheck = await new Promise<boolean>((resolve) => {
        const python = spawn("python3", [
          "-c",
          "import pdfplumber; print('OK')",
        ]);
        let output = "";
        python.stdout.on("data", (data) => (output += data.toString()));
        python.on("close", (code) => {
          resolve(code === 0 && output.includes("OK"));
        });
      });

      logger.info("[PDFParserProductsService] Health check passed", {
        pythonVersion,
        pdfplumberAvailable: pdfplumberCheck,
      });

      return {
        healthy: pdfplumberCheck,
        pythonVersion,
        pdfplumberAvailable: pdfplumberCheck,
      };
    } catch (error) {
      logger.error("[PDFParserProductsService] Health check failed", { error });
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
