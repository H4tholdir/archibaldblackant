import type { DbPool } from '../../db/pool';
import type { CatalogPdfService } from '../../services/catalog-pdf-service';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type SonnetFn = (
  images: Array<{ base64: string; mediaType: 'image/png' }>,
  prompt: string,
) => Promise<string>;

type ReExtractPictogramsDeps = {
  pool:        DbPool;
  catalogPdf:  CatalogPdfService;
  callSonnet:  SonnetFn;
};

type CatalogRow = {
  id:           number;
  catalog_page: number | null;
  family_codes: string[];
};

type Pictogram = { symbol: string; meaning: string };

const INTER_ENTRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePictograms(raw: string): Pictogram[] | null {
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as Pictogram[]) : null;
  } catch {
    return null;
  }
}

function buildPrompt(familyCodes: string[]): string {
  const family = familyCodes[0] ?? 'unknown';
  return `This is a page from the Komet 2025 dental instrument catalog.
Find the product family "${family}" (family codes: ${familyCodes.join(', ')}) on this page.

Look CAREFULLY at the small pictogram/symbol icons printed near the product entry (usually in the top-left corner of the product block, before the product name and size table).

List ALL pictogram icons you can see for this product family. Common Komet pictograms include: tooth with cavity, crown, autoclave, single-use symbol, consult-IFU book, max speed, recommended speed, implant, orthodontics, etc.

Return ONLY a valid JSON array (no markdown, no extra text):
[{"symbol": "snake_case_symbol_name", "meaning": "English description of what the symbol represents"}]

If you cannot find any pictogram icons for this family, return exactly: []`;
}

function createReExtractPictogramsHandler(deps: ReExtractPictogramsDeps): OperationHandler {
  return async (_context, data, _userId, onProgress) => {
    const { pool, catalogPdf, callSonnet } = deps;
    const forceAll = (data as Record<string, unknown>).forceAll === true;

    const whereClause = forceAll
      ? 'WHERE catalog_page IS NOT NULL AND catalog_page > 0'
      : 'WHERE catalog_page IS NOT NULL AND catalog_page > 0 AND (pictograms IS NULL OR jsonb_array_length(pictograms) < 2)';

    const { rows } = await pool.query<CatalogRow>(
      `SELECT id, catalog_page, family_codes FROM shared.catalog_entries ${whereClause} ORDER BY catalog_page`,
    );

    let updated = 0;
    let errors  = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.catalog_page) continue;

      try {
        const base64 = await catalogPdf.getPageAsBase64(row.catalog_page);
        const prompt = buildPrompt(row.family_codes);
        const raw    = await callSonnet([{ base64, mediaType: 'image/png' }], prompt);
        const pictos = parsePictograms(raw);

        if (pictos && pictos.length > 0) {
          await pool.query(
            `UPDATE shared.catalog_entries SET pictograms = $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(pictos), row.id],
          );
          updated++;
        }
      } catch (err) {
        errors++;
        logger.warn('[re-extract-pictograms] Failed to process entry', {
          id: row.id, family_codes: row.family_codes, err,
        });
      }

      if (i % 20 === 0 && i > 0) {
        onProgress(Math.round((i / rows.length) * 100), `${i}/${rows.length} famiglie elaborate`);
      }
      await delay(INTER_ENTRY_DELAY_MS);
    }

    onProgress(100, 'Completato');
    return { total: rows.length, updated, errors };
  };
}

export { createReExtractPictogramsHandler, type ReExtractPictogramsDeps };
