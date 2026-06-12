#!/usr/bin/env node

/**
 * Read-only audit for PRICEDISCTABLE_ListView.
 *
 * Reads all DevExpress fieldNames exposed by the ERP price/discount grid and
 * writes raw JSON + Markdown coverage report. It does not write to app DB.
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
const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-price-list-audit");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");
const PRICE_LIST_PATH = "/PRICEDISCTABLE_ListView/";

function parseArgs(argv) {
  const args = {
    limit: Number(process.env.AUDIT_LIMIT || DEFAULT_LIMIT),
    all: process.env.AUDIT_ALL === "true",
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
  node scripts/audit-erp-price-list.mjs [options]

Options:
  --limit <n>         Max rows to read. Default: ${DEFAULT_LIMIT}
  --all               Read every page exposed by the grid.
  --output-dir <path> Directory for JSON report.
  --docs-dir <path>   Directory for Markdown report.
  --headed            Run browser visibly.
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
  return String(value ?? "").trim();
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
    const userInput = textInputs.find((i) =>
      i.name?.includes("UserName") ||
      i.id?.includes("UserName") ||
      i.placeholder?.toLowerCase().includes("username") ||
      i.placeholder?.toLowerCase().includes("account"),
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

async function prepareGrid(page) {
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

  return page.evaluate(() => {
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

    return {
      gridName,
      pageIndex: typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null,
      pageCount: typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null,
      visibleRows: typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : null,
      columns,
      fieldNames: Array.from(new Set(columns.map((column) => column.fieldName).filter(Boolean))),
    };
  });
}

async function goToPage(page, targetPageIndex) {
  const requestPage = async (mode) => page.evaluate((target, requestMode) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
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
          typeof window[key].GetRowValues === "function" &&
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
    const serializeValue = (value) => {
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
          typeof window[key].GetRowValues === "function" &&
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
        const rows = pageValues.slice(0, rowsToRead).map((values, rowIndex) => {
          const rawFields = {};
          for (let i = 0; i < fields.length; i += 1) {
            rawFields[fields[i]] = serializeValue(values?.[i]);
          }
          return {
            visibleRowIndex: rowIndex,
            pageIndex,
            rawFields,
          };
        });

        return {
          gridName,
          rows,
          visibleRows,
          pageIndex,
          pageCount,
        };
      }
    }

    const readRow = (rowIndex) => new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 12_000);

      grid.GetRowValues(rowIndex, fieldStr, (values) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!values) {
          resolve(null);
          return;
        }

        const rawFields = {};
        for (let i = 0; i < fields.length; i += 1) {
          rawFields[fields[i]] = serializeValue(values[i]);
        }
        resolve({
          visibleRowIndex: rowIndex,
          pageIndex,
          rawFields,
        });
      });
    });

    const rows = [];
    const batchSize = 5;
    for (let start = 0; start < rowsToRead; start += batchSize) {
      const end = Math.min(rowsToRead, start + batchSize);
      const batch = await Promise.all(Array.from({ length: end - start }, (_, offset) => readRow(start + offset)));
      rows.push(...batch.filter(Boolean));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      gridName,
      rows: rows.filter(Boolean),
      visibleRows,
      pageIndex,
      pageCount,
    };
  }, fieldNames, maxRows);
}

async function goNextPage(page) {
  const before = await page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
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

  const requested = await page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    if (typeof grid.GotoPage === "function") {
      const current = typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : 0;
      grid.GotoPage(current + 1);
      return true;
    }
    if (typeof grid.NextPage === "function") {
      grid.NextPage();
      return true;
    }
    return false;
  });

  if (!requested) return false;

  const changed = await page.waitForFunction((previousPageIndex) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    const idle = typeof grid.InCallback === "function" ? !grid.InCallback() : true;
    const current = typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null;
    return idle && current !== previousPageIndex;
  }, { timeout: 45_000 }, before.pageIndex)
    .then(() => true)
    .catch(() => false);

  if (!changed) return false;
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  return true;
}

function buildRecord(row, runId) {
  const raw = row.rawFields;
  const sourceRecordKey = normalizeKey(raw.ID) || normalizeKey(raw.RECID) || `${row.pageIndex}:${row.visibleRowIndex}`;
  return {
    sourceRecordKey,
    sourceType: "erp_price_list",
    priceDiscTableId: normalizeKey(raw.ID),
    recId: normalizeKey(raw.RECID),
    itemRelationId: normalizeKey(raw.ITEMRELATIONID),
    itemRelationText: normalizeKey(raw.ITEMRELATIONTXT),
    itemRelation: normalizeKey(raw.ITEMRELATION),
    itemCode: normalizeKey(raw.ITEMCODE),
    accountCode: normalizeKey(raw.ACCOUNTCODE),
    accountRelationId: normalizeKey(raw.ACCOUNTRELATIONID),
    accountRelationText: normalizeKey(raw.ACCOUNTRELATIONTXT),
    amount: raw.AMOUNT ?? null,
    currency: normalizeKey(raw.CURRENCY),
    priceUnit: raw.PRICEUNIT ?? null,
    unitId: normalizeKey(raw.UNITID),
    quantityAmountFrom: raw.QUANTITYAMOUNTFROM ?? null,
    quantityAmountTo: raw.QUANTITYAMOUNTTO ?? null,
    fromDate: raw.FROMDATE ?? null,
    toDate: raw.TODATE ?? null,
    percent1: raw.PERCENT1 ?? null,
    percent2: raw.PERCENT2 ?? null,
    markup: raw.MARKUP ?? null,
    brasNetPrice: normalizeKey(raw.BRASNETPRICE),
    modifiedDatetime: raw.MODIFIEDDATETIME ?? null,
    createdDatetime: raw.CREATEDDATETIME ?? null,
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
    console.log(`[price-audit] page ${pageRows.pageIndex ?? pagesRead}/${pageRows.pageCount ?? "?"}: ${pageRows.rows.length} rows`);

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
  const uniqueItems = new Set(records.map((record) => record.itemRelationId).filter(Boolean)).size;
  const uniqueItemTexts = new Set(records.map((record) => record.itemRelationText).filter(Boolean)).size;
  const uniqueAccounts = new Set(records.map((record) => record.accountRelationId).filter(Boolean)).size;
  const currencies = Array.from(new Set(records.map((record) => record.currency).filter(Boolean))).sort();
  const withAmount = records.filter((record) => record.amount != null && record.amount !== "").length;
  const withDateRange = records.filter((record) => record.fromDate && record.toDate).length;

  const columnRows = gridInfo.columns
    .filter((column) => column.fieldName)
    .sort((a, b) => (a.visibleIndex ?? 999) - (b.visibleIndex ?? 999))
    .map((column) => `| ${markdownCell(column.fieldName)} | ${column.visibleIndex ?? ""} | ${column.index} |`)
    .join("\n");

  const fieldRows = fieldStats
    .map((field) => `| ${markdownCell(field.fieldName)} | ${field.observedCount} | ${field.nonEmptyCount} | ${markdownCell(Object.keys(field.valueTypes).join(", "))} | ${markdownCell(field.sampleValues[0] ?? "")} |`)
    .join("\n");

  const examples = records
    .slice(0, 20)
    .map((record) => `| ${markdownCell(record.priceDiscTableId)} | ${markdownCell(record.itemRelationId)} | ${markdownCell(record.itemRelationText)} | ${markdownCell(record.accountRelationId)} | ${markdownCell(record.accountRelationText)} | ${record.amount ?? ""} | ${markdownCell(record.currency)} | ${record.quantityAmountFrom ?? ""}-${record.quantityAmountTo ?? ""} |`)
    .join("\n");

  return `# ERP Price List Audit

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Configurazione

- ERP URL: \`${process.env.ARCHIBALD_URL || "default"}${PRICE_LIST_PATH}\`
- Modalita': ${args.all ? "tutte le pagine disponibili" : `limit ${args.limit}`}
- Output JSON: \`${reportJsonPath}\`

## Risultati

- Righe lette: ${records.length}
- Campi DevExpress scoperti: ${gridInfo.fieldNames.length}
- Articoli/listino distinti per \`ITEMRELATIONID\`: ${uniqueItems}
- Codici/descrizioni distinti per \`ITEMRELATIONTXT\`: ${uniqueItemTexts}
- Account/listini distinti per \`ACCOUNTRELATIONID\`: ${uniqueAccounts}
- Righe con importo: ${withAmount}
- Righe con intervallo date: ${withDateRange}
- Valute: ${currencies.length > 0 ? currencies.join(", ") : "N/A"}
- Page count osservato: ${gridInfo.pageCount ?? "N/A"}

## Campi PRICEDISCTABLE_ListView

Grid name osservato: \`${gridInfo.gridName}\`

| Field | Visible index | Column index |
| --- | ---: | ---: |
${columnRows || "| N/A | | |"}

## Osservazioni campi raw

| Field | Osservati | Non vuoti | Tipi | Primo esempio |
| --- | ---: | ---: | --- | --- |
${fieldRows || "| N/A | 0 | 0 | N/A | N/A |"}

## Esempi record

| ID | Item selection | Item description | Account | Account description | Amount | Currency | Qty range |
| --- | --- | --- | --- | --- | ---: | --- | --- |
${examples || "| N/A | N/A | N/A | N/A | N/A |  |  |  |"}

## Decisione suggerita

\`PRICEDISCTABLE_ListView\` va acquisita nello staging raw insieme agli articoli. E' la fonte ERP per prezzo/listino/account/scaglioni, quindi serve a distinguere articolo riconosciuto da articolo realmente proponibile/ordinabile.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = (process.env.ARCHIBALD_URL || "https://archibald.komet.it/Archibald").replace(/\/$/, "");
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

  let gridInfo = { gridName: null, columns: [], fieldNames: [] };
  let records = [];
  let pagesRead = 0;
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7" });

    console.log("[price-audit] login ERP");
    await login(page, baseUrl, username, password);

    console.log("[price-audit] open PRICEDISCTABLE_ListView");
    await page.goto(`${baseUrl}${PRICE_LIST_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    console.log("[price-audit] prepare grid");
    gridInfo = await prepareGrid(page);
    const resetToFirstPage = await goToPage(page, 0);
    if (!resetToFirstPage) {
      throw new Error("Could not reset PRICEDISCTABLE grid to page 0; aborting to avoid partial acquisition.");
    }
    gridInfo = {
      ...gridInfo,
      ...(await page.evaluate(() => {
        const gridName = Object.keys(window).find((key) => {
          try {
            return window[key]?.GetRowValues &&
              typeof window[key].GetRowValues === "function" &&
              typeof window[key].GetColumn === "function";
          } catch {
            return false;
          }
        });
        if (!gridName) return {};
        const grid = window[gridName];
        return {
          pageIndex: typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null,
          pageCount: typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null,
          visibleRows: typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : null,
        };
      })),
    };
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    console.log(`[price-audit] fields selected: ${gridInfo.fieldNames.length}`);

    const result = await collectRecords(page, gridInfo.fieldNames, { limit: args.limit, all: args.all, runId });
    records = result.records;
    pagesRead = result.pagesRead;
  } finally {
    await browser.close();
  }

  const endedAt = new Date();
  const fieldStats = buildFieldStats(records);
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

  const reportJsonPath = path.join(runDir, "audit-report.json");
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));

  const markdown = buildMarkdownReport({ runId, startedAt, endedAt, args, gridInfo, records, fieldStats, reportJsonPath });
  const markdownPath = path.join(args.docsDir, `erp-price-list-audit-${todayStamp()}.md`);
  await fs.writeFile(markdownPath, markdown);

  console.log("[price-audit] complete");
  console.log(JSON.stringify({
    runId,
    records: records.length,
    pagesRead,
    fieldNames: gridInfo.fieldNames.length,
    reportJsonPath,
    markdownPath,
  }, null, 2));
}

main().catch((error) => {
  console.error("[price-audit] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
