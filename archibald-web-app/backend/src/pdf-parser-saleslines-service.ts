import { spawn } from "child_process";
import { logger } from "./logger";
import path from "path";

export interface ParsedArticle {
  lineNumber: string;
  articleCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineAmount: number;
  description?: string;
}

/**
 * Convert snake_case object keys to camelCase
 */
function snakeToCamel<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );
    result[camelKey] = value;
  }
  return result;
}

export class PDFParserSaleslinesService {
  private static instance: PDFParserSaleslinesService;
  private static readonly MAX_ARTICLES = 1000; // Safety limit for memory

  static getInstance(): PDFParserSaleslinesService {
    if (!PDFParserSaleslinesService.instance) {
      PDFParserSaleslinesService.instance = new PDFParserSaleslinesService();
    }
    return PDFParserSaleslinesService.instance;
  }

  async parseSaleslinesPDF(pdfPath: string): Promise<ParsedArticle[]> {
    logger.info("[PDFParserSaleslines] Starting parse", { pdfPath });

    return new Promise((resolve, reject) => {
      // Use environment variable if set, otherwise default to relative path
      const scriptsDir =
        process.env.SCRIPTS_PATH || path.join(__dirname, "../../../scripts");
      const scriptPath = path.join(scriptsDir, "parse-saleslines-pdf.py");

      logger.debug("[PDFParserSaleslines] Using script path", { scriptPath });

      const python = spawn("python3", [scriptPath, pdfPath]);

      const articles: ParsedArticle[] = [];
      let stderrOutput = "";

      python.stdout.on("data", (data) => {
        const lines = data
          .toString()
          .split("\n")
          .filter((line: string) => line.trim());

        for (const line of lines) {
          try {
            // Safety check: prevent memory issues with huge PDFs
            if (articles.length >= PDFParserSaleslinesService.MAX_ARTICLES) {
              logger.error(
                `[PDFParserSaleslines] Exceeded max articles limit (${PDFParserSaleslinesService.MAX_ARTICLES})`,
                { pdfPath },
              );
              reject(
                new Error(
                  `Troppi articoli nel PDF (massimo ${PDFParserSaleslinesService.MAX_ARTICLES})`,
                ),
              );
              python.kill();
              return;
            }

            // Warning at 500 articles
            if (articles.length === 500) {
              logger.warn(
                "[PDFParserSaleslines] High article count (500), continuing...",
                {
                  pdfPath,
                },
              );
            }

            const parsed = JSON.parse(line) as Record<string, unknown>;

            // Convert snake_case to camelCase automatically
            const camelCased = snakeToCamel(parsed);
            articles.push(camelCased as unknown as ParsedArticle);
          } catch (err) {
            logger.warn("[PDFParserSaleslines] Failed to parse JSON line", {
              line,
              err,
            });
          }
        }
      });

      python.stderr.on("data", (data) => {
        stderrOutput += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          logger.error("[PDFParserSaleslines] Parser failed", {
            code,
            stderr: stderrOutput,
            pdfPath,
          });
          reject(new Error(`Parser exited with code ${code}: ${stderrOutput}`));
        } else {
          if (stderrOutput) {
            logger.debug("[PDFParserSaleslines] Parser stderr", {
              stderr: stderrOutput,
            });
          }
          logger.info(
            `[PDFParserSaleslines] Parsed ${articles.length} articles`,
            { pdfPath },
          );
          resolve(articles);
        }
      });

      python.on("error", (err) => {
        logger.error("[PDFParserSaleslines] Failed to spawn parser", {
          err,
          pdfPath,
        });
        reject(err);
      });
    });
  }
}
