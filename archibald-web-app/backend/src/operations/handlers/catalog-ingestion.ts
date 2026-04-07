import type { DbPool } from '../../db/pool';
import type { CatalogPdfService } from '../../services/catalog-pdf-service';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type FamilyExtraction = Record<string, unknown>;

type SonnetFn = (
  images: Array<{ base64: string; mediaType: 'image/png' }>,
  prompt: string,
) => Promise<string>;

type CatalogIngestionDeps = {
  pool: DbPool;
  catalogPdf: CatalogPdfService;
  callSonnet: SonnetFn;
};

const READING_GUIDE_PAGES = [5, 6, 7, 8, 9] as const;
const PRODUCT_PAGES_START = 10;
const MAX_SONNET_RETRIES = 3;
const INTER_PAGE_DELAY_MS = 500;

function stripMarkdownFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

const READING_GUIDE_PROMPT = `You are a Komet dental instrument catalog expert. Analyze pages 5-9 of the Komet 2025 catalog.
These pages contain reading instructions for the catalog.

Extract and return ONLY valid JSON (no markdown, no extra text):
{
  "shank_codes": [
    {"code": "314", "type": "fg|hp|ca|grip|unmounted", "length_mm": 19, "diameter_mm": 1.6, "name": "FG short"}
  ],
  "grit_systems": {
    "diamond": [
      {"grit_indicator_type": "ring_color", "visual_cue": "blue", "grit_level": "standard", "micron": 107}
    ],
    "carbide": [
      {"grit_indicator_type": "blade_count", "visual_cue": "12", "grit_level": "standard"}
    ],
    "polisher": [
      {"grit_indicator_type": "head_color", "visual_cue": "blue", "grit_level": "coarse"}
    ]
  },
  "size_code_to_mm": {"005": 0.5, "010": 1.0, "014": 1.4},
  "pictograms": [{"symbol": "...", "meaning": "..."}],
  "root_post_collar_colors": [
    {"color": "yellow", "canal_size_code": "050", "diameter_mm": 0.5}
  ],
  "packaging_rules": {"units_per_pack_default": 5}
}`;

const PAGE_EXTRACTION_PROMPT = `Page {PAGE} of the Komet 2025 catalog.
Reading guide: {READING_GUIDE}

For each product family found on this page, return a JSON array (ONLY valid JSON, no markdown):
[{
  "family_codes": ["879", "8879"],
  "product_type": "rotary_diamond|rotary_carbide|diao|sonic|polisher_composite|polisher_ceramic|polisher_amalgam|endodontic|root_post|lab_carbide|accessory|other",
  "shape_description": "IN ENGLISH",
  "material_description": "IN ENGLISH",
  "identification_clues": "IN ENGLISH",
  "grit_options": [{"grit_indicator_type":"ring_color|blade_count|head_color|none","visual_cue":"...","grit_level":"...","label":"...","prefix_pattern":"..."}],
  "shank_options": [{"code":"314","type":"fg","length_mm":19}],
  "size_options": [10,12,14,16,18],
  "rpm_max": 160000,
  "clinical_indications": "IN ENGLISH",
  "usage_notes": "IN ENGLISH",
  "pictograms": [{"symbol":"...","meaning":"IN ENGLISH"}],
  "packaging_info": {"units_per_pack":5,"sterile":false,"single_use":false},
  "notes": "IN ENGLISH"
}]
If this page contains no products, return [].
List ALL available shank options for each family, not just the most common.`;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callSonnetWithRetry(
  callSonnet: SonnetFn,
  images: Array<{ base64: string; mediaType: 'image/png' }>,
  prompt: string,
  page: number,
): Promise<string | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SONNET_RETRIES; attempt++) {
    try {
      return await callSonnet(images, prompt);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_SONNET_RETRIES) await delay(1000 * attempt);
    }
  }
  logger.error('[catalog-ingestion] Sonnet failed after retries, skipping page', { page, err: lastErr });
  return null;
}

async function extractReadingGuide(deps: CatalogIngestionDeps): Promise<Record<string, unknown>> {
  const images = await Promise.all(
    READING_GUIDE_PAGES.map(async (p) => ({
      base64: await deps.catalogPdf.getPageAsBase64(p),
      mediaType: 'image/png' as const,
    })),
  );

  const raw = await deps.callSonnet(images, READING_GUIDE_PROMPT);
  const cleaned = stripMarkdownFences(raw);
  let content: Record<string, unknown>;
  try {
    content = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(`[catalog-ingestion] Reading guide response was not valid JSON: ${raw.slice(0, 200)}`);
  }

  await deps.pool.query(
    `INSERT INTO shared.catalog_reading_guide (content, page_range)
     VALUES ($1, '5-9')
     ON CONFLICT (page_range) DO UPDATE SET content=$1, extracted_at=NOW()`,
    [content],
  );

  return content;
}

async function extractProductFamilies(
  deps: CatalogIngestionDeps,
  readingGuide: Record<string, unknown>,
): Promise<{ pagesProcessed: number; familiesFound: number }> {
  const resumeResult = await deps.pool.query<{ last_page: number | null }>(
    'SELECT MAX(catalog_page) AS last_page FROM shared.catalog_entries',
  );
  const lastPage = resumeResult.rows[0]?.last_page ?? null;
  const startPage = lastPage !== null ? lastPage + 1 : PRODUCT_PAGES_START;

  const totalPages = await deps.catalogPdf.getTotalPages();
  const readingGuideJson = JSON.stringify(readingGuide);

  let pagesProcessed = 0;
  let familiesFound = 0;

  for (let p = startPage; p <= totalPages; p++) {
    const base64 = await deps.catalogPdf.getPageAsBase64(p);
    const prompt = PAGE_EXTRACTION_PROMPT
      .replace('{PAGE}', String(p))
      .replace('{READING_GUIDE}', readingGuideJson);

    const raw = await callSonnetWithRetry(
      deps.callSonnet,
      [{ base64, mediaType: 'image/png' }],
      prompt,
      p,
    );

    if (raw === null) {
      await delay(INTER_PAGE_DELAY_MS);
      continue;
    }

    let families: FamilyExtraction[];
    try {
      families = JSON.parse(stripMarkdownFences(raw)) as FamilyExtraction[];
    } catch {
      logger.error('[catalog-ingestion] Page JSON parse failed, skipping', { page: p, raw: raw.slice(0, 200) });
      continue;
    }
    pagesProcessed += 1;

    if (families.length === 0) {
      await delay(INTER_PAGE_DELAY_MS);
      continue;
    }

    for (const family of families) {
      await deps.pool.query(
        `INSERT INTO shared.catalog_entries
           (family_codes, catalog_page, product_type, shape_description,
            material_description, identification_clues, grit_options,
            shank_options, size_options, rpm_max, clinical_indications,
            usage_notes, pictograms, packaging_info, notes, raw_extraction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (catalog_page, (family_codes[1])) DO NOTHING`,
        [
          family.family_codes,
          p,
          family.product_type,
          family.shape_description,
          family.material_description,
          family.identification_clues,
          family.grit_options,
          family.shank_options,
          family.size_options,
          family.rpm_max,
          family.clinical_indications,
          family.usage_notes,
          family.pictograms,
          family.packaging_info,
          family.notes,
          family,
        ],
      );
      familiesFound += 1;
    }

    await delay(INTER_PAGE_DELAY_MS);
  }

  return { pagesProcessed, familiesFound };
}

function createCatalogIngestionHandler(deps: CatalogIngestionDeps): OperationHandler {
  return async (_context, _data, _userId, onProgress) => {
    onProgress(0, 'Extracting reading guide (pages 5-9)...');
    const readingGuide = await extractReadingGuide(deps);

    onProgress(5, 'Extracting product families...');
    const summary = await extractProductFamilies(deps, readingGuide);

    logger.info('[catalog-ingestion] Completed', summary);
    onProgress(100, 'Done');

    return summary as unknown as Record<string, unknown>;
  };
}

export { createCatalogIngestionHandler, type CatalogIngestionDeps, type SonnetFn };
