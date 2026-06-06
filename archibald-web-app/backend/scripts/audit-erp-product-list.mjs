#!/usr/bin/env node

/**
 * Read-only audit for INVENTTABLE_ListView metadata.
 *
 * This extracts the full ERP product grid quickly via DevExpress
 * GetPageRowValues, excluding ImageCalc bytes by default. Images are handled by
 * audit-erp-product-images.mjs as a slower visual enrichment pass.
 */

import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const DEFAULT_LIMIT = 1000;
const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-product-list-audit");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");
const PRODUCT_LIST_PATH = "/INVENTTABLE_ListView/";

function parseArgs(argv) {
  const args = {
    limit: Number(process.env.AUDIT_LIMIT || DEFAULT_LIMIT),
    all: process.env.AUDIT_ALL === "true",
    includeImageField: process.env.AUDIT_INCLUDE_IMAGE_FIELD === "true",
    outputDir: process.env.AUDIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.AUDIT_DOCS_DIR || DEFAULT_DOCS_DIR,
    headless: process.env.AUDIT_HEADLESS !== "false",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
    } else if (arg === "--all") {
      args.all = true;
    } else if (arg === "--include-image-field") {
      args.includeImageField = true;
    } else if (arg === "--output-dir" && next) {
      args.outputDir = path.resolve(next);
      i += 1;
    } else if (arg === "--docs-dir" && next) {
      args.docsDir = path.resolve(next);
      i += 1;
    } else if (arg === "--headed") {
      args.headless = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/audit-erp-product-list.mjs [options]

Options:
  --limit <n>            Max rows to read. Default: ${DEFAULT_LIMIT}
  --all                  Read every page exposed by the grid.
  --include-image-field  Include ImageCalc raw value. Slow; off by default.
  --output-dir <path>    Directory for JSON report.
  --docs-dir <path>      Directory for Markdown report.
  --headed               Run browser visibly.
`);
      process.exit(0);
    }
  }

  if (!args.all && (!Number.isFinite(args.limit) || args.limit <= 0)) {
    throw new Error(`Invalid --limit value: ${args.limit}`);
  }

  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in backend .env`);
  return value;
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function normalizeKey(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

function rawValueIsNonEmpty(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function rawValueType(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && value.__type) return value.__type;
  return typeof value;
}

function buildFieldStats(records) {
  const stats = new Map();
  for (const record of records) {
    for (const [fieldName, value] of Object.entries(record.rawFields ?? {})) {
      const current = stats.get(fieldName) ?? {
        fieldName,
        observedCount: 0,
        nonEmptyCount: 0,
        sampleValues: [],
        valueTypes: {},
      };

      current.observedCount += 1;
      if (rawValueIsNonEmpty(value)) {
        current.nonEmptyCount += 1;
        const sample = typeof value === "object" ? JSON.stringify(value) : String(value);
        if (sample && current.sampleValues.length < 5 && !current.sampleValues.includes(sample)) {
          current.sampleValues.push(sample.slice(0, 240));
        }
      }

      const type = rawValueType(value);
      current.valueTypes[type] = (current.valueTypes[type] ?? 0) + 1;
      stats.set(fieldName, current);
    }
  }

  return Array.from(stats.values()).sort((a, b) => {
    if (b.nonEmptyCount !== a.nonEmptyCount) return b.nonEmptyCount - a.nonEmptyCount;
    return a.fieldName.localeCompare(b.fieldName);
  });
}

async function login(page, baseUrl, username, password) {
  const loginUrl = `${baseUrl}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector('input[type="text"]', { timeout: 10_000 });
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });

  await page.evaluate((user, pass) => {
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const userInput = textInputs.find((input) =>
      input.name?.includes("UserName") ||
      input.id?.includes("UserName") ||
      input.placeholder?.toLowerCase().includes("username") ||
      input.placeholder?.toLowerCase().includes("account"),
    ) || textInputs[0];
    const passwordInput = document.querySelector('input[type="password"]');
    if (!userInput || !passwordInput) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const setValue = (el, value) => {
      el.focus();
      el.click();
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    setValue(userInput, user);
    setValue(passwordInput, pass);

    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a, div[role="button"]'));
    const loginButton = buttons.find((btn) => {
      const text = (btn.textContent || btn.value || "").toLowerCase().replace(/\s+/g, "");
      return text.includes("accedi") || text === "login";
    }) || buttons.find((btn) => {
      const id = (btn.id || btn.name || "").toLowerCase();
      if (id.includes("logo")) return false;
      return id.includes("login") || id.includes("logon");
    });

    if (loginButton) loginButton.click();
    return Boolean(loginButton);
  }, username, password);

  await page.waitForFunction(() => !window.location.href.includes("Login.aspx"), { timeout: 45_000 });
}

async function waitForDevExpressIdle(page, timeoutMs = 30_000) {
  await page.waitForFunction(() => {
    const grids = Object.keys(window)
      .map((key) => {
        try { return window[key]; } catch { return null; }
      })
      .filter((value) => value && typeof value.InCallback === "function");
    return grids.every((grid) => !grid.InCallback());
  }, { timeout: timeoutMs }).catch(() => {});
}

async function prepareGrid(page, includeImageField) {
  await waitForDevExpressIdle(page, 45_000);
  await page.waitForFunction(() => {
    return Object.keys(window).some((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
  }, { timeout: 30_000 });

  return page.evaluate((shouldIncludeImageField) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    const grid = window[gridName];
    const columns = [];
    const count = typeof grid.GetColumnCount === "function" ? grid.GetColumnCount() : 100;
    for (let i = 0; i < count; i += 1) {
      try {
        const col = grid.GetColumn(i);
        if (col) {
          columns.push({
            index: i,
            fieldName: col.fieldName || "",
            name: col.name || "",
            caption: col.caption || "",
            visibleIndex: col.visibleIndex,
          });
        }
      } catch {}
    }

    try { grid.ClearFilter?.(); } catch {}
    try { grid.ApplyFilter?.(""); } catch {}
    try { grid.GotoPage?.(0); } catch {}

    const fieldNames = Array.from(new Set(columns.map((column) => column.fieldName).filter(Boolean)))
      .filter((fieldName) => shouldIncludeImageField || fieldName !== "ImageCalc");

    return {
      gridName,
      pageIndex: typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null,
      pageCount: typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null,
      visibleRows: typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : null,
      columns,
      fieldNames,
      hasImageCalcField: columns.some((column) => column.fieldName === "ImageCalc"),
    };
  }, includeImageField);
}

async function goToPage(page, targetPageIndex) {
  const requestPage = async (mode) => page.evaluate((target, requestMode) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    if (requestMode === "pagerCallback" && typeof grid.PerformCallback === "function") {
      try {
        grid.PerformCallback(`PAGERONCLICK|PN${target}`);
        return true;
      } catch {
        return false;
      }
    }
    if (typeof grid.GotoPage !== "function") return false;
    try {
      grid.GotoPage(target);
      return true;
    } catch {
      return false;
    }
  }, targetPageIndex, mode);

  const waitForTarget = async () => page.waitForFunction((target) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    const idle = typeof grid.InCallback === "function" ? !grid.InCallback() : true;
    const current = typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null;
    return idle && current === target;
  }, { timeout: 45_000 }, targetPageIndex)
    .then(() => true)
    .catch(() => false);

  const requested = await requestPage("goto");
  if (!requested) return false;

  let changed = await waitForTarget();
  if (!changed) {
    const fallbackRequested = await requestPage("pagerCallback");
    if (fallbackRequested) changed = await waitForTarget();
  }

  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  return changed;
}

async function readCurrentPageRows(page, fieldNames, maxRows) {
  return page.evaluate(async (fields, requestedRows) => {
    const serializeValue = (value, fieldName) => {
      if (fieldName === "ImageCalc" && Array.isArray(value)) {
        return {
          __type: "image_bytes",
          byteLength: value.length,
          signature: value.slice(0, 12),
        };
      }
      if (value instanceof Date) {
        return {
          __type: "Date",
          iso: value.toISOString(),
          epochMs: value.getTime(),
          text: value.toString(),
        };
      }
      return value ?? null;
    };

    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return { gridName: null, rows: [], visibleRows: 0, pageIndex: null, pageCount: null };

    const grid = window[gridName];
    const visibleRows = typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : 0;
    const pageIndex = typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null;
    const pageCount = typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null;
    const rowsToRead = Math.min(visibleRows, requestedRows);
    const fieldStr = fields.join(";");

    if (typeof grid.GetPageRowValues === "function" && rowsToRead === visibleRows) {
      const pageValues = await new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, 45_000);

        try {
          grid.GetPageRowValues(fieldStr, (values) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(values);
          });
        } catch {
          clearTimeout(timeout);
          resolve(null);
        }
      });

      if (Array.isArray(pageValues)) {
        return {
          gridName,
          rows: pageValues.slice(0, rowsToRead).map((values, rowIndex) => {
            const rawFields = {};
            for (let i = 0; i < fields.length; i += 1) {
              rawFields[fields[i]] = serializeValue(values?.[i], fields[i]);
            }
            return { visibleRowIndex: rowIndex, pageIndex, rawFields };
          }),
          visibleRows,
          pageIndex,
          pageCount,
        };
      }
    }

    const rows = [];
    for (let rowIndex = 0; rowIndex < rowsToRead; rowIndex += 1) {
      const values = await new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, 12_000);

        grid.GetRowValues(rowIndex, fieldStr, (rowValues) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(rowValues);
        });
      });

      if (!values) continue;
      const rawFields = {};
      for (let i = 0; i < fields.length; i += 1) {
        rawFields[fields[i]] = serializeValue(values[i], fields[i]);
      }
      rows.push({ visibleRowIndex: rowIndex, pageIndex, rawFields });
    }

    return { gridName, rows, visibleRows, pageIndex, pageCount };
  }, fieldNames, maxRows);
}

async function goNextPage(page) {
  const before = await page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return { canGoNext: false, pageIndex: null, pageCount: null };
    const grid = window[gridName];
    if (typeof grid.GetPageIndex !== "function" || typeof grid.GetPageCount !== "function") {
      return { canGoNext: false, pageIndex: null, pageCount: null };
    }
    const current = grid.GetPageIndex();
    const total = grid.GetPageCount();
    return { canGoNext: current != null && total != null && current < total - 1, pageIndex: current, pageCount: total };
  });

  if (!before.canGoNext) return false;
  return goToPage(page, before.pageIndex + 1);
}

function buildRecord(row, runId) {
  const raw = row.rawFields;
  const sourceRecordKey = normalizeKey(raw.ITEMID) || normalizeKey(raw.ID) || `${row.pageIndex}:${row.visibleRowIndex}`;
  return {
    sourceRecordKey,
    sourceType: "erp_product_list",
    erpItemId: normalizeKey(raw.ITEMID),
    articleCode: normalizeKey(raw.NAME),
    description: normalizeKey(raw.DESCRIPTION),
    searchName: normalizeKey(raw.SEARCHNAME),
    groupCode: normalizeKey(raw["PRODUCTGROUPID.ID"]),
    productGroupId: normalizeKey(raw["PRODUCTGROUPID.PRODUCTGROUPID"]),
    productGroupDescription: normalizeKey(raw["PRODUCTGROUPID.PRODUCTGROUP1"]),
    packageContent: normalizeKey(raw.BRASPACKINGCONTENTS),
    figure: normalizeKey(raw.BRASFIGURE),
    shank: normalizeKey(raw.BRASSHANK),
    size: normalizeKey(raw.BRASSIZE),
    orderableArticle: raw.ORDERITEM ?? null,
    stopped: normalizeKey(raw.STOPPED),
    modifiedDatetime: raw.MODIFIEDDATETIME ?? null,
    createdDatetime: raw.CREATEDDATETIME ?? null,
    productIdExt: normalizeKey(raw.ID),
    pageIndex: row.pageIndex,
    visibleRowIndex: row.visibleRowIndex,
    rawFieldNames: Object.keys(raw),
    rawFields: raw,
    payloadHash: hashJson(raw),
    runId,
  };
}

async function collectRecords(page, fieldNames, { limit, all, runId }) {
  const records = [];
  let pagesRead = 0;
  let emptyPages = 0;

  while (all || records.length < limit) {
    const remaining = all ? Number.MAX_SAFE_INTEGER : limit - records.length;
    const pageRows = await readCurrentPageRows(page, fieldNames, remaining);
    pagesRead += 1;
    console.log(`[product-audit] page ${pageRows.pageIndex ?? pagesRead}/${pageRows.pageCount ?? "?"}: ${pageRows.rows.length} rows`);

    if (pageRows.rows.length === 0) {
      emptyPages += 1;
      if (emptyPages >= 2) break;
    } else {
      emptyPages = 0;
      for (const row of pageRows.rows) {
        records.push(buildRecord(row, runId));
        if (!all && records.length >= limit) break;
      }
    }

    if (!all && records.length >= limit) break;
    const hasNext = await goNextPage(page);
    if (!hasNext) break;
  }

  return { records, pagesRead };
}

function buildMarkdownReport({ runId, startedAt, endedAt, args, gridInfo, records, fieldStats, reportJsonPath }) {
  const uniqueItems = new Set(records.map((record) => record.erpItemId).filter(Boolean)).size;
  const uniqueArticleCodes = new Set(records.map((record) => record.articleCode).filter(Boolean)).size;
  const uniqueGroups = new Set(records.map((record) => record.productGroupDescription).filter(Boolean)).size;
  const withFigure = records.filter((record) => record.figure).length;
  const withShank = records.filter((record) => record.shank).length;
  const withSize = records.filter((record) => record.size).length;

  const columnRows = gridInfo.columns
    .filter((column) => column.fieldName)
    .sort((a, b) => (a.visibleIndex ?? 999) - (b.visibleIndex ?? 999))
    .map((column) => `| ${markdownCell(column.fieldName)} | ${column.visibleIndex ?? ""} | ${column.index} |`)
    .join("\n");

  const fieldRows = fieldStats
    .map((field) => `| ${markdownCell(field.fieldName)} | ${field.observedCount} | ${field.nonEmptyCount} | ${markdownCell(Object.keys(field.valueTypes).join(", "))} | ${markdownCell(field.sampleValues[0] ?? "")} |`)
    .join("\n");

  const groupRows = Array.from(records.reduce((map, record) => {
    const key = record.productGroupDescription || "N/A";
    const current = map.get(key) ?? { count: 0, withFigure: 0, withShank: 0, withSize: 0 };
    current.count += 1;
    if (record.figure) current.withFigure += 1;
    if (record.shank) current.withShank += 1;
    if (record.size) current.withSize += 1;
    map.set(key, current);
    return map;
  }, new Map()).entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([group, stats]) => `| ${markdownCell(group)} | ${stats.count} | ${stats.withFigure} | ${stats.withShank} | ${stats.withSize} |`)
    .join("\n");

  const examples = records
    .slice(0, 25)
    .map((record) => `| ${markdownCell(record.erpItemId)} | ${markdownCell(record.articleCode)} | ${markdownCell(record.productGroupDescription)} | ${markdownCell(record.figure)} | ${markdownCell(record.shank)} | ${markdownCell(record.size)} | ${markdownCell(record.packageContent)} | ${markdownCell(record.stopped)} |`)
    .join("\n");

  return `# ERP Product List Audit

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Configurazione

- Fonte: \`INVENTTABLE_ListView\`
- Modalita': ${args.all ? "tutte le pagine" : `limite ${args.limit}`}
- Campo immagini incluso: ${args.includeImageField ? "si" : "no"}
- Report JSON: \`${reportJsonPath}\`

## Risultati

- Righe lette: ${records.length}
- ERP item distinti: ${uniqueItems}
- Codici articolo distinti: ${uniqueArticleCodes}
- Gruppi prodotto distinti: ${uniqueGroups}
- Righe con figura: ${withFigure}
- Righe con gambo: ${withShank}
- Righe con misura: ${withSize}
- FieldName DevExpress letti: ${gridInfo.fieldNames.length}
- Campo \`ImageCalc\` disponibile in griglia: ${gridInfo.hasImageCalcField ? "si" : "no"}

## Campi DevExpress

Grid name osservato: \`${gridInfo.gridName}\`

| Field | Visible index | Column index |
| --- | ---: | ---: |
${columnRows || "| N/A | | |"}

## Copertura campi raw

| Field | Osservati | Non vuoti | Tipi | Primo esempio |
| --- | ---: | ---: | --- | --- |
${fieldRows || "| N/A | 0 | 0 | N/A | N/A |"}

## Copertura per gruppo prodotto

| Gruppo | Righe | Con figura | Con gambo | Con misura |
| --- | ---: | ---: | ---: | ---: |
${groupRows || "| N/A | 0 | 0 | 0 | 0 |"}

## Esempi

| ERP item | Articolo | Gruppo | Figura | Gambo | Misura | Confezione | Bloccato |
| --- | --- | --- | --- | --- | --- | ---: | --- |
${examples || "| N/A | N/A | N/A | N/A | N/A | N/A | | |"}

## Lettura operativa

Questo report e' la base ERP articolo completa e veloce. Le immagini non vengono salvate qui per non rallentare o destabilizzare l'acquisizione; vanno associate in un secondo passaggio usando \`ITEMID\`, \`NAME\`, \`FIGURE\`, \`SHANK\` e \`SIZE\`.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = (process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald").replace(/\/$/, "");
  const username = requireEnv("ARCHIBALD_USERNAME");
  const password = requireEnv("ARCHIBALD_PASSWORD");
  const runId = `${todayStamp()}-${new Date().toISOString().replace(/[:.]/g, "-").slice(11, 23)}`;
  const runDir = path.join(args.outputDir, runId);
  const startedAt = new Date();

  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(args.docsDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: args.headless ? "new" : false,
    protocolTimeout: 180_000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-web-security",
      "--disable-gpu",
    ],
    defaultViewport: { width: 1800, height: 1000 },
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7" });

    console.log("[product-audit] login ERP");
    await login(page, baseUrl, username, password);

    console.log("[product-audit] open INVENTTABLE_ListView");
    await page.goto(`${baseUrl}${PRODUCT_LIST_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    console.log("[product-audit] prepare grid and clear filters");
    const gridInfo = await prepareGrid(page, args.includeImageField);
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 1600));

    if (!(await goToPage(page, 0))) {
      const current = await page.evaluate(() => {
        const gridName = Object.keys(window).find((key) => {
          try { return window[key]?.GetPageIndex; } catch { return false; }
        });
        return gridName ? window[gridName].GetPageIndex?.() : null;
      });
      if (current !== 0) throw new Error(`Unable to reset product grid to page 0. Current page: ${current}`);
    }

    console.log(`[product-audit] selected fields: ${gridInfo.fieldNames.length}`);
    const { records, pagesRead } = await collectRecords(page, gridInfo.fieldNames, {
      limit: args.limit,
      all: args.all,
      runId,
    });

    const fieldStats = buildFieldStats(records);
    const endedAt = new Date();
    const reportJsonPath = path.join(runDir, "audit-report.json");
    const report = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      args,
      gridInfo,
      pagesRead,
      fieldStats,
      records,
    };

    await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
    const markdown = buildMarkdownReport({ runId, startedAt, endedAt, args, gridInfo, records, fieldStats, reportJsonPath });
    const markdownPath = path.join(args.docsDir, `erp-product-list-audit-${todayStamp()}.md`);
    await fs.writeFile(markdownPath, markdown);

    console.log("[product-audit] complete");
    console.log(JSON.stringify({
      runId,
      pagesRead,
      records: records.length,
      fieldNames: gridInfo.fieldNames.length,
      reportJsonPath,
      markdownPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[product-audit] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
