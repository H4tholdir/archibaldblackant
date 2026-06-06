#!/usr/bin/env node

/**
 * Import an ERP recognition audit JSON into recognition acquisition staging.
 *
 * Default mode is dry-run. Pass --apply to write to Postgres.
 */

import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

function parseArgs(argv) {
  const args = {
    reportPath: "",
    apply: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--report" || arg === "--report-json") && next) {
      args.reportPath = path.resolve(next);
      i += 1;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--dry-run") {
      args.apply = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/import-recognition-audit-to-staging.mjs --report <audit-report.json> [--apply]

Options:
  --report <path>  Audit JSON produced by ERP recognition audit scripts.
  --apply          Write to Postgres. Default is dry-run.
  --dry-run        Validate and print import plan without writing.
`);
      process.exit(0);
    }
  }

  if (!args.reportPath) throw new Error("Missing --report <audit-report.json>");
  return args;
}

function dbConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || "archibald",
    user: process.env.PG_USER || "archibald",
    password: process.env.PG_PASSWORD || "",
    max: Number(process.env.PG_MAX_CONNECTIONS || 10),
  };
}

function hashJson(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value ?? {}))
    .digest("hex");
}

function toIsoOrNull(value) {
  if (!value) return null;
  if (typeof value === "object" && value.iso) return value.iso;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function detectReportKind(report) {
  const firstRecord = report.records?.[0];
  if (firstRecord?.sourceType === "erp_price_list" || firstRecord?.priceDiscTableId || firstRecord?.itemRelationId) {
    return "erp_price_list";
  }
  if (firstRecord?.sourceType === "erp_product_list") {
    return "erp_product_list";
  }
  return "erp_product_image";
}

function sourceRecordProductKey(record) {
  return record.erpItemId || record.itemRelationId || null;
}

function buildProductNormalizedPayload(record) {
  return {
    erpItemId: record.erpItemId ?? null,
    articleCode: record.articleCode ?? null,
    description: record.description ?? null,
    groupCode: record.groupCode ?? null,
    productGroupId: record.productGroupId ?? null,
    productGroupDescription: record.productGroupDescription ?? null,
    packageContent: record.packageContent ?? null,
    figure: record.figure ?? null,
    shank: record.shank ?? null,
    size: record.size ?? null,
    orderableArticle: record.orderableArticle ?? null,
    stopped: record.stopped ?? null,
    modifiedDatetime: record.modifiedDatetime ?? null,
    productIdExt: record.productIdExt ?? null,
    groupFilter: record.groupFilter ?? null,
    pageIndex: record.pageIndex ?? null,
    visibleRowIndex: record.visibleRowIndex ?? null,
    image: record.image ?? null,
  };
}

function buildPriceNormalizedPayload(record) {
  return {
    priceDiscTableId: record.priceDiscTableId ?? null,
    recId: record.recId ?? null,
    erpItemId: record.itemRelationId ?? null,
    articleCode: record.itemRelationText ?? null,
    itemRelationId: record.itemRelationId ?? null,
    itemRelationText: record.itemRelationText ?? null,
    itemRelation: record.itemRelation ?? null,
    itemCode: record.itemCode ?? null,
    accountCode: record.accountCode ?? null,
    accountRelationId: record.accountRelationId ?? null,
    accountRelationText: record.accountRelationText ?? null,
    amount: record.amount ?? null,
    currency: record.currency ?? null,
    priceUnit: record.priceUnit ?? null,
    unitId: record.unitId ?? null,
    quantityAmountFrom: record.quantityAmountFrom ?? null,
    quantityAmountTo: record.quantityAmountTo ?? null,
    fromDate: toIsoOrNull(record.fromDate),
    toDate: toIsoOrNull(record.toDate),
    percent1: record.percent1 ?? null,
    percent2: record.percent2 ?? null,
    markup: record.markup ?? null,
    brasNetPrice: record.brasNetPrice ?? null,
    modifiedDatetime: toIsoOrNull(record.modifiedDatetime),
    createdDatetime: toIsoOrNull(record.createdDatetime),
    pageIndex: record.pageIndex ?? null,
    visibleRowIndex: record.visibleRowIndex ?? null,
  };
}

function buildNormalizedPayload(reportKind, record) {
  if (reportKind === "erp_price_list") return buildPriceNormalizedPayload(record);
  return buildProductNormalizedPayload(record);
}

function summarize(report) {
  const reportKind = detectReportKind(report);
  const records = report.records ?? [];
  const visualRecords = records.filter((record) => record.image?.status === "saved");
  const uniqueImages = new Set(visualRecords.map((record) => record.image.sha256)).size;
  const fieldNames = new Set(records.flatMap((record) => record.rawFieldNames ?? []));

  return {
    runId: report.runId,
    reportKind,
    records: records.length,
    visualReferences: visualRecords.length,
    uniqueImages,
    fieldNames: fieldNames.size,
    fieldObservations: (report.fieldStats ?? []).length,
    startedAt: report.startedAt,
    endedAt: report.endedAt,
  };
}

async function loadExistingProductIds(client, records) {
  const productIds = Array.from(new Set(records.map(sourceRecordProductKey).filter(Boolean)));
  if (productIds.length === 0) return new Set();

  const { rows } = await client.query(
    "SELECT id FROM shared.products WHERE id = ANY($1::text[])",
    [productIds],
  );
  return new Set(rows.map((row) => row.id));
}

async function tableExists(client, tableName) {
  const [schema, table] = tableName.split(".");
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2
     LIMIT 1`,
    [schema, table],
  );
  return rows.length > 0;
}

function reportMetadata(reportKind) {
  if (reportKind === "erp_price_list") {
    return {
      sourceLabel: "ERP PRICEDISCTABLE_ListView price list audit",
      extractorName: "audit-erp-price-list",
    };
  }
  if (reportKind === "erp_product_list") {
    return {
      sourceLabel: "ERP INVENTTABLE_ListView product list audit",
      extractorName: "audit-erp-product-list",
    };
  }
  return {
    sourceLabel: "ERP INVENTTABLE_ListView product image audit",
    extractorName: "audit-erp-product-images",
  };
}

async function upsertRun(client, report, summary) {
  const metadata = reportMetadata(summary.reportKind);
  await client.query(
    `INSERT INTO shared.recognition_acquisition_runs
       (id, source_type, source_label, source_uri, started_at, completed_at, status,
        acquisition_mode, extractor_name, extractor_version, config_json, stats_json, updated_at)
     VALUES ($1, 'erp', $2, $3, COALESCE($4::timestamptz, NOW()), $5::timestamptz, 'completed',
        'audit', $6, '1', $7::jsonb, $8::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       source_label = EXCLUDED.source_label,
       source_uri = EXCLUDED.source_uri,
       completed_at = EXCLUDED.completed_at,
       status = EXCLUDED.status,
       extractor_name = EXCLUDED.extractor_name,
       config_json = EXCLUDED.config_json,
       stats_json = EXCLUDED.stats_json,
       updated_at = NOW()`,
    [
      report.runId,
      metadata.sourceLabel,
      process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald",
      toIsoOrNull(report.startedAt),
      toIsoOrNull(report.endedAt),
      metadata.extractorName,
      JSON.stringify(report.args ?? {}),
      JSON.stringify(summary),
    ],
  );
}

function sourceRecordValues(reportKind, record) {
  const rawPayload = record.rawFields ?? {};
  const normalizedPayload = buildNormalizedPayload(reportKind, record);

  if (reportKind === "erp_price_list") {
    return {
      rawPayload,
      normalizedPayload,
      sourceRecordKey: record.sourceRecordKey || record.priceDiscTableId || record.recId || `price:${record.pageIndex}:${record.visibleRowIndex}`,
      sourceGroup: record.accountRelationId || record.accountRelationText || "PRICEDISCTABLE_ListView",
      articleCode: record.itemRelationText || null,
      familyCode: null,
      figure: null,
      shank: null,
      size: null,
      productGroupId: null,
      productGroupDescription: null,
    };
  }

  return {
    rawPayload,
    normalizedPayload,
    sourceRecordKey: record.sourceRecordKey || record.erpItemId || `product:${record.pageIndex}:${record.visibleRowIndex}`,
    sourceGroup: record.groupFilter ?? record.productGroupDescription ?? null,
    articleCode: record.articleCode || null,
    familyCode: record.figure || null,
    figure: record.figure || null,
    shank: record.shank || null,
    size: record.size || null,
    productGroupId: record.productGroupId || null,
    productGroupDescription: record.productGroupDescription || null,
  };
}

async function upsertSourceRecord(client, report, reportKind, record, existingProductIds) {
  const values = sourceRecordValues(reportKind, record);
  const productKey = sourceRecordProductKey(record);
  const productId = productKey && existingProductIds.has(productKey) ? productKey : null;

  const { rows } = await client.query(
    `INSERT INTO shared.recognition_source_records
       (run_id, source_type, source_record_key, source_uri, source_group, product_id,
        article_code, family_code, figure, shank, size, product_group_id,
        product_group_description, raw_payload, normalized_payload, field_names,
        payload_hash, updated_at)
     VALUES ($1, 'erp', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13::jsonb, $14::jsonb, $15::text[], $16, NOW())
     ON CONFLICT (run_id, source_record_key) DO UPDATE SET
       source_group = EXCLUDED.source_group,
       product_id = EXCLUDED.product_id,
       article_code = EXCLUDED.article_code,
       family_code = EXCLUDED.family_code,
       figure = EXCLUDED.figure,
       shank = EXCLUDED.shank,
       size = EXCLUDED.size,
       product_group_id = EXCLUDED.product_group_id,
       product_group_description = EXCLUDED.product_group_description,
       raw_payload = EXCLUDED.raw_payload,
       normalized_payload = EXCLUDED.normalized_payload,
       field_names = EXCLUDED.field_names,
       payload_hash = EXCLUDED.payload_hash,
       updated_at = NOW()
     RETURNING id`,
    [
      report.runId,
      values.sourceRecordKey,
      process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald",
      values.sourceGroup,
      productId,
      values.articleCode,
      values.familyCode,
      values.figure,
      values.shank,
      values.size,
      values.productGroupId,
      values.productGroupDescription,
      JSON.stringify(values.rawPayload),
      JSON.stringify(values.normalizedPayload),
      record.rawFieldNames ?? Object.keys(values.rawPayload),
      record.payloadHash || hashJson(values.rawPayload),
    ],
  );

  return rows[0].id;
}

async function findDuplicateVisualId(client, sha256, localPath) {
  const { rows } = await client.query(
    `SELECT id
     FROM shared.recognition_visual_references
     WHERE sha256 = $1 AND local_path <> $2
     ORDER BY id
     LIMIT 1`,
    [sha256, localPath],
  );
  return rows[0]?.id ?? null;
}

async function upsertVisualReference(client, report, record, sourceRecordId, existingProductIds) {
  if (record.image?.status !== "saved") return false;

  const productId = existingProductIds.has(record.erpItemId) ? record.erpItemId : null;
  const duplicateOfId = await findDuplicateVisualId(client, record.image.sha256, record.image.localPath);

  await client.query(
    `INSERT INTO shared.recognition_visual_references
       (source_record_id, run_id, product_id, article_code, family_code, figure, shank, size,
        source_type, source_field, source_uri, local_path, view_type, mime_type, width,
        height, file_size, sha256, duplicate_of_id, raw_metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'erp', 'ImageCalc', $9, $10,
        'product_silhouette', $11, $12, $13, $14, $15, $16, $17::jsonb, NOW())
     ON CONFLICT (source_type, local_path) DO UPDATE SET
       source_record_id = EXCLUDED.source_record_id,
       run_id = EXCLUDED.run_id,
       product_id = EXCLUDED.product_id,
       article_code = EXCLUDED.article_code,
       family_code = EXCLUDED.family_code,
       figure = EXCLUDED.figure,
       shank = EXCLUDED.shank,
       size = EXCLUDED.size,
       mime_type = EXCLUDED.mime_type,
       width = EXCLUDED.width,
       height = EXCLUDED.height,
       file_size = EXCLUDED.file_size,
       sha256 = EXCLUDED.sha256,
       duplicate_of_id = EXCLUDED.duplicate_of_id,
       raw_metadata = EXCLUDED.raw_metadata,
       updated_at = NOW()`,
    [
      sourceRecordId,
      report.runId,
      productId,
      record.articleCode || null,
      record.figure || null,
      record.figure || null,
      record.shank || null,
      record.size || null,
      process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald",
      record.image.localPath,
      record.image.mimeType || null,
      record.image.width ?? null,
      record.image.height ?? null,
      record.image.fileSize ?? null,
      record.image.sha256,
      duplicateOfId,
      JSON.stringify({
        filename: record.image.filename,
        extension: record.image.extension,
        format: record.image.format,
        metadataError: record.image.metadataError,
        erpItemId: record.erpItemId,
        productGroupDescription: record.productGroupDescription,
      }),
    ],
  );

  return true;
}

async function upsertFieldObservation(client, report, field) {
  const reportKind = detectReportKind(report);
  await client.query(
    `INSERT INTO shared.recognition_field_observations
       (run_id, source_type, field_name, observed_count, non_empty_count, sample_values, value_types, updated_at)
     VALUES ($1, 'erp', $2, $3, $4, $5::jsonb, $6::jsonb, NOW())
     ON CONFLICT (run_id, source_type, field_name) DO UPDATE SET
       observed_count = EXCLUDED.observed_count,
       non_empty_count = EXCLUDED.non_empty_count,
       sample_values = EXCLUDED.sample_values,
       value_types = EXCLUDED.value_types,
       updated_at = NOW()`,
    [
      report.runId,
      field.fieldName,
      field.observedCount,
      field.nonEmptyCount,
      JSON.stringify(field.sampleValues ?? []),
      JSON.stringify({ ...(field.valueTypes ?? {}), reportKind }),
    ],
  );
}

async function importReport(report, args) {
  const summary = summarize(report);
  console.log("[import] plan");
  console.log(JSON.stringify({ ...summary, mode: args.apply ? "apply" : "dry-run" }, null, 2));

  if (!args.apply) return summary;

  const pool = new Pool(dbConfig());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const requiredTables = [
      "shared.recognition_acquisition_runs",
      "shared.recognition_source_records",
      "shared.recognition_visual_references",
      "shared.recognition_field_observations",
    ];
    for (const tableName of requiredTables) {
      if (!(await tableExists(client, tableName))) {
        throw new Error(`Missing table ${tableName}. Run migration 107-recognition-acquisition-staging.sql first.`);
      }
    }

    const records = report.records ?? [];
    const reportKind = summary.reportKind;
    const existingProductIds = await loadExistingProductIds(client, records);

    await upsertRun(client, report, summary);

    let sourceRecordsImported = 0;
    let visualReferencesImported = 0;
    for (const record of records) {
      const sourceRecordId = await upsertSourceRecord(client, report, reportKind, record, existingProductIds);
      sourceRecordsImported += 1;
      if (await upsertVisualReference(client, report, record, sourceRecordId, existingProductIds)) {
        visualReferencesImported += 1;
      }
    }

    for (const field of report.fieldStats ?? []) {
      await upsertFieldObservation(client, report, field);
    }

    await client.query("COMMIT");
    return {
      ...summary,
      sourceRecordsImported,
      visualReferencesImported,
      existingProductLinks: existingProductIds.size,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const report = JSON.parse(await fs.readFile(args.reportPath, "utf8"));
  const result = await importReport(report, args);
  console.log("[import] complete");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("[import] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
