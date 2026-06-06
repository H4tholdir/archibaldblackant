#!/usr/bin/env node

/**
 * Build a deduplicated ERP visual index from recognition staging.
 *
 * This is not an embedding index yet. It creates the deterministic mapping:
 * unique image sha256 -> all ERP article variants sharing that silhouette,
 * enriched with product metadata and price availability.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-visual-index");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");
const PRODUCT_LIST_RUN_ID = "2026-06-02-16-49-32-516";
const PRICE_LIST_RUN_ID = "2026-06-02-14-11-05-386";

function parseArgs(argv) {
  const args = {
    outputDir: process.env.VISUAL_INDEX_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.VISUAL_INDEX_DOCS_DIR || DEFAULT_DOCS_DIR,
    productRunId: process.env.VISUAL_INDEX_PRODUCT_RUN_ID || PRODUCT_LIST_RUN_ID,
    priceRunId: process.env.VISUAL_INDEX_PRICE_RUN_ID || PRICE_LIST_RUN_ID,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--output-dir" && next) {
      args.outputDir = path.resolve(next);
      i += 1;
    } else if (arg === "--docs-dir" && next) {
      args.docsDir = path.resolve(next);
      i += 1;
    } else if (arg === "--product-run-id" && next) {
      args.productRunId = next;
      i += 1;
    } else if (arg === "--price-run-id" && next) {
      args.priceRunId = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/build-erp-visual-index.mjs [options]

Options:
  --product-run-id <id>  Product list staging run. Default: ${PRODUCT_LIST_RUN_ID}
  --price-run-id <id>    Price list staging run. Default: ${PRICE_LIST_RUN_ID}
  --output-dir <path>    Directory for JSON output.
  --docs-dir <path>      Directory for Markdown report.
`);
      process.exit(0);
    }
  }

  return args;
}

function dbConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || "archibald",
    user: process.env.PG_USER || "archibald",
    password: process.env.PG_PASSWORD || "",
    max: Number(process.env.PG_MAX_CONNECTIONS || 10),
  };
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function runIdStamp() {
  return `${todayStamp()}-${new Date().toISOString().replace(/[:.]/g, "-").slice(11, 23)}`;
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function normalizeCode(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numericOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchRows(pool, args) {
  const [visuals, products, prices] = await Promise.all([
    pool.query(`
      SELECT
        id,
        run_id,
        product_id,
        article_code,
        family_code,
        figure,
        shank,
        size,
        local_path,
        mime_type,
        width,
        height,
        file_size,
        sha256,
        duplicate_of_id,
        raw_metadata
      FROM shared.recognition_visual_references
      WHERE source_type = 'erp'
      ORDER BY sha256, id
    `),
    pool.query(`
      SELECT
        source_record_key,
        article_code,
        figure,
        shank,
        size,
        product_group_id,
        product_group_description,
        normalized_payload,
        raw_payload
      FROM shared.recognition_source_records
      WHERE run_id = $1
    `, [args.productRunId]),
    pool.query(`
      SELECT
        normalized_payload->>'erpItemId' AS erp_item_id,
        article_code,
        normalized_payload
      FROM shared.recognition_source_records
      WHERE run_id = $1
    `, [args.priceRunId]),
  ]);

  return {
    visuals: visuals.rows,
    products: products.rows,
    prices: prices.rows,
  };
}

function buildMaps(products, prices) {
  const productMap = new Map();
  for (const row of products) {
    const normalized = row.normalized_payload ?? {};
    productMap.set(row.source_record_key, {
      erpItemId: row.source_record_key,
      articleCode: normalizeCode(row.article_code),
      description: normalized.description ?? null,
      productGroupId: row.product_group_id ?? null,
      productGroupDescription: row.product_group_description ?? null,
      packageContent: normalized.packageContent ?? null,
      figure: row.figure ?? null,
      shank: row.shank ?? null,
      size: row.size ?? null,
      orderableArticle: normalized.orderableArticle ?? null,
      stopped: normalized.stopped ?? null,
    });
  }

  const priceMap = new Map();
  for (const row of prices) {
    const erpItemId = row.erp_item_id;
    if (!erpItemId) continue;
    const normalized = row.normalized_payload ?? {};
    const current = priceMap.get(erpItemId) ?? {
      erpItemId,
      priceRows: 0,
      currencies: new Set(),
      accounts: new Set(),
      minAmount: null,
      maxAmount: null,
    };
    current.priceRows += 1;
    if (normalized.currency) current.currencies.add(normalized.currency);
    if (normalized.accountRelationId) current.accounts.add(normalized.accountRelationId);
    const amount = numericOrNull(normalized.amount);
    if (amount != null) {
      current.minAmount = current.minAmount == null ? amount : Math.min(current.minAmount, amount);
      current.maxAmount = current.maxAmount == null ? amount : Math.max(current.maxAmount, amount);
    }
    priceMap.set(erpItemId, current);
  }

  for (const [key, value] of priceMap.entries()) {
    priceMap.set(key, {
      ...value,
      currencies: Array.from(value.currencies).sort(),
      accounts: Array.from(value.accounts).sort(),
    });
  }

  return { productMap, priceMap };
}

function buildVisualIndex({ visuals, products, prices }) {
  const { productMap, priceMap } = buildMaps(products, prices);
  const bySha = new Map();

  for (const visual of visuals) {
    const erpItemId = visual.raw_metadata?.erpItemId || visual.product_id || null;
    if (!erpItemId) continue;

    const entry = bySha.get(visual.sha256) ?? {
      imageSha256: visual.sha256,
      representativeLocalPath: visual.local_path,
      mimeType: visual.mime_type,
      width: visual.width,
      height: visual.height,
      representativeFileSize: visual.file_size,
      visualReferenceIds: [],
      runIds: new Set(),
      variants: new Map(),
    };

    entry.visualReferenceIds.push(visual.id);
    if (visual.run_id) entry.runIds.add(visual.run_id);

    const product = productMap.get(erpItemId) ?? {
      erpItemId,
      articleCode: normalizeCode(visual.article_code),
      productGroupDescription: visual.raw_metadata?.productGroupDescription ?? null,
      figure: visual.figure ?? null,
      shank: visual.shank ?? null,
      size: visual.size ?? null,
    };
    const price = priceMap.get(erpItemId) ?? null;

    entry.variants.set(erpItemId, {
      ...product,
      hasPrice: Boolean(price),
      price: price ? {
        rows: price.priceRows,
        currencies: price.currencies,
        accounts: price.accounts,
        minAmount: price.minAmount,
        maxAmount: price.maxAmount,
      } : null,
    });

    bySha.set(visual.sha256, entry);
  }

  return Array.from(bySha.values())
    .map((entry) => ({
      imageSha256: entry.imageSha256,
      representativeLocalPath: entry.representativeLocalPath,
      mimeType: entry.mimeType,
      width: entry.width,
      height: entry.height,
      representativeFileSize: entry.representativeFileSize,
      visualReferenceIds: entry.visualReferenceIds,
      runIds: Array.from(entry.runIds).sort(),
      variants: Array.from(entry.variants.values()).sort((a, b) => a.erpItemId.localeCompare(b.erpItemId)),
    }))
    .sort((a, b) => b.variants.length - a.variants.length || a.imageSha256.localeCompare(b.imageSha256));
}

function summarize(index, products, prices) {
  const variantCount = index.reduce((sum, entry) => sum + entry.variants.length, 0);
  const variantsWithPrice = index.reduce((sum, entry) => sum + entry.variants.filter((variant) => variant.hasPrice).length, 0);
  const byGroup = new Map();
  for (const entry of index) {
    for (const variant of entry.variants) {
      const group = variant.productGroupDescription || "N/A";
      const current = byGroup.get(group) ?? { group, variants: 0, uniqueImages: new Set() };
      current.variants += 1;
      current.uniqueImages.add(entry.imageSha256);
      byGroup.set(group, current);
    }
  }

  return {
    productRows: products.length,
    priceRows: prices.length,
    uniqueImages: index.length,
    visualVariants: variantCount,
    visualVariantsWithPrice: variantsWithPrice,
    largestVariantSet: index[0]?.variants.length ?? 0,
    groups: Array.from(byGroup.values())
      .map((row) => ({ group: row.group, variants: row.variants, uniqueImages: row.uniqueImages.size }))
      .sort((a, b) => b.variants - a.variants || a.group.localeCompare(b.group)),
  };
}

function buildMarkdown({ runId, startedAt, endedAt, args, summary, index, indexPath }) {
  const groupRows = summary.groups.slice(0, 30)
    .map((row) => `| ${markdownCell(row.group)} | ${row.variants} | ${row.uniqueImages} |`)
    .join("\n");

  const imageRows = index.slice(0, 30)
    .map((entry) => {
      const first = entry.variants[0] ?? {};
      return `| ${entry.variants.length} | ${markdownCell(first.productGroupDescription)} | ${markdownCell(first.figure)} | ${markdownCell(first.shank)} | ${markdownCell(first.size)} | ${markdownCell(first.articleCode)} | \`${path.basename(entry.representativeLocalPath)}\` |`;
    })
    .join("\n");

  return `# ERP Visual Index

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`

## Fonti

- Product run: \`${args.productRunId}\`
- Price run: \`${args.priceRunId}\`
- Output JSON: \`${indexPath}\`

## Sintesi

- Articoli ERP anagrafica: ${summary.productRows}
- Righe prezzo ERP: ${summary.priceRows}
- Immagini ERP uniche indicizzate: ${summary.uniqueImages}
- Varianti articolo con riferimento visuale: ${summary.visualVariants}
- Varianti visuali con prezzo/listino: ${summary.visualVariantsWithPrice}
- Numero massimo varianti su una stessa immagine: ${summary.largestVariantSet}

## Gruppi principali nell'indice visuale

| Gruppo | Varianti con immagine | Immagini uniche |
| --- | ---: | ---: |
${groupRows || "| N/A | 0 | 0 |"}

## Immagini con piu' varianti

| Varianti | Gruppo primo record | Figura | Gambo | Misura | Primo codice | File |
| ---: | --- | --- | --- | --- | --- | --- |
${imageRows || "| 0 | N/A | N/A | N/A | N/A | N/A | N/A |"}

## Uso previsto

Questo indice e' il livello deterministico prima degli embedding:

- una silhouette puo' rappresentare piu' varianti articolo;
- il matching visuale deve restituire una silhouette o un gruppo di silhouette;
- la scelta finale va raffinata con figura, gambo, misura, gruppo e prezzo/listino.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = runIdStamp();
  const startedAt = new Date();
  const runDir = path.join(args.outputDir, runId);

  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(args.docsDir, { recursive: true });

  const pool = new Pool(dbConfig());
  try {
    const rows = await fetchRows(pool, args);
    const index = buildVisualIndex(rows);
    const summary = summarize(index, rows.products, rows.prices);
    const endedAt = new Date();
    const indexPath = path.join(runDir, "erp-visual-index.json");
    const report = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      args,
      summary,
      index,
    };

    await fs.writeFile(indexPath, JSON.stringify(report, null, 2));
    const markdown = buildMarkdown({ runId, startedAt, endedAt, args, summary, index, indexPath });
    const markdownPath = path.join(args.docsDir, `erp-visual-index-${todayStamp()}.md`);
    await fs.writeFile(markdownPath, markdown);

    console.log("[visual-index] complete");
    console.log(JSON.stringify({
      runId,
      uniqueImages: summary.uniqueImages,
      visualVariants: summary.visualVariants,
      visualVariantsWithPrice: summary.visualVariantsWithPrice,
      largestVariantSet: summary.largestVariantSet,
      indexPath,
      markdownPath,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[visual-index] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
