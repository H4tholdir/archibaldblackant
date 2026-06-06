#!/usr/bin/env node

/**
 * Read-only audit for ERP article-related data surfaces.
 *
 * It maps list and detail views for products and price/discount rows:
 * - INVENTTABLE_ListView
 * - INVENTTABLE_DetailView/<id>
 * - PRICEDISCTABLE_ListView
 * - PRICEDISCTABLE_DetailView/<id>
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-article-data-source-audit");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");

function parseArgs(argv) {
  const args = {
    productDetailId: process.env.AUDIT_PRODUCT_DETAIL_ID || "1114",
    priceDetailId: process.env.AUDIT_PRICE_DETAIL_ID || "7",
    sampleRows: Number(process.env.AUDIT_SAMPLE_ROWS || 5),
    outputDir: process.env.AUDIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.AUDIT_DOCS_DIR || DEFAULT_DOCS_DIR,
    headless: process.env.AUDIT_HEADLESS !== "false",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--product-detail-id" && next) {
      args.productDetailId = next;
      i += 1;
    } else if (arg === "--price-detail-id" && next) {
      args.priceDetailId = next;
      i += 1;
    } else if (arg === "--sample-rows" && next) {
      args.sampleRows = Number(next);
      i += 1;
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
  node scripts/audit-erp-article-data-sources.mjs [options]

Options:
  --product-detail-id <id>  INVENTTABLE_DetailView id. Default: 1114
  --price-detail-id <id>    PRICEDISCTABLE_DetailView id. Default: 7
  --sample-rows <n>         Rows to sample from each ListView. Default: 5
  --output-dir <path>       Directory for JSON report.
  --docs-dir <path>         Directory for Markdown report.
  --headed                  Run browser visibly.
`);
      process.exit(0);
    }
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

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
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

function serializeBrowserValue(value, fieldName) {
  if (fieldName === "ImageCalc") {
    if (!value) return null;
    if (Array.isArray(value)) {
      return {
        __type: "image_bytes",
        byteLength: value.length,
        signature: value.slice(0, 12),
      };
    }
    return {
      __type: "image_value",
      text: String(value).slice(0, 120),
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
}

async function inspectListView(page, url, sampleRows) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const gridInfo = await page.evaluate(async (rowsToRead) => {
    const serializeValue = (value, fieldName) => {
      if (fieldName === "ImageCalc") {
        if (!value) return null;
        if (Array.isArray(value)) {
          return {
            __type: "image_bytes",
            byteLength: value.length,
            signature: value.slice(0, 12),
          };
        }
        return {
          __type: "image_value",
          text: String(value).slice(0, 120),
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

    const findGridName = () => Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });

    const gridName = findGridName();
    if (!gridName) return { gridName: null, columns: [], rows: [] };
    const grid = window[gridName];

    const columns = [];
    const columnCount = typeof grid.GetColumnCount === "function" ? grid.GetColumnCount() : 120;
    for (let i = 0; i < columnCount; i += 1) {
      try {
        const col = grid.GetColumn(i);
        if (col) {
          columns.push({
            index: i,
            fieldName: col.fieldName || "",
            caption: col.caption || "",
            name: col.name || "",
            visibleIndex: col.visibleIndex,
          });
        }
      } catch {}
    }

    const fieldNames = Array.from(new Set(columns.map((column) => column.fieldName).filter(Boolean)));

    try { grid.ClearFilter?.(); } catch {}
    try { grid.ApplyFilter?.(""); } catch {}
    try { grid.GotoPage?.(0); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const visibleRows = typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : 0;
    const pageCount = typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null;
    const rowCount = Math.min(rowsToRead, visibleRows);
    const rows = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const values = await new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, 10_000);

        grid.GetRowValues(rowIndex, fieldNames.join(";"), (rowValues) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(rowValues);
        });
      });

      if (!values) continue;
      const mapped = {};
      for (let i = 0; i < fieldNames.length; i += 1) {
        mapped[fieldNames[i]] = serializeValue(values[i], fieldNames[i]);
      }
      mapped.__visibleRowIndex = rowIndex;
      rows.push(mapped);
    }

    return {
      gridName,
      pageCount,
      visibleRows,
      fieldNames,
      columns,
      rows,
    };
  }, sampleRows);

  await waitForDevExpressIdle(page, 45_000);
  return {
    url: page.url(),
    ...gridInfo,
  };
}

function parseDetailPairsFromText(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const pairs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.endsWith(":")) continue;

    const label = line.replace(/:$/, "").trim();
    const values = [];
    for (let j = i + 1; j < lines.length && values.length < 4; j += 1) {
      const next = lines[j];
      if (next.endsWith(":")) break;
      if (["Loading…", "Vista", "Record precedente", "Record successivo", "Show hidden items"].includes(next)) continue;
      values.push(next);
      if (values.length >= 1) break;
    }

    if (label && values.length > 0) {
      pairs.push({ label, value: values.join(" ") });
    }
  }

  const seen = new Set();
  return pairs.filter((pair) => {
    const key = `${pair.label}:${pair.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function inspectDetailView(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const snapshot = await page.evaluate(() => {
    const bodyText = document.body.innerText.replace(/\s+\n/g, "\n").trim();
    const imageAssets = Array.from(document.images)
      .map((img) => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
        className: img.className,
      }))
      .filter((img) =>
        img.src.includes("BinaryDataHttpHandler") ||
        img.src.includes("ImageCalc") ||
        (img.width > 20 && img.height > 20 && !img.src.includes("ImageResource&name=Logo")),
      );

    const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.tagName.toLowerCase() === "input" ? (el.getAttribute("type") || "text") : el.tagName.toLowerCase(),
        id: el.id || "",
        name: el.name || "",
        value: el.value || el.getAttribute("value") || "",
        title: el.getAttribute("title") || "",
      }))
      .filter((field) => field.type !== "hidden");

    const detailLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({ text: (a.textContent || "").trim(), href: a.href }))
      .filter((link) => link.href.includes("DetailView") || link.href.includes("ListView"))
      .slice(0, 80);

    return {
      url: location.href,
      title: document.title,
      bodyText,
      imageAssets,
      inputs,
      detailLinks,
    };
  });

  return {
    ...snapshot,
    detailPairs: parseDetailPairsFromText(snapshot.bodyText),
  };
}

function rowsToFieldStats(rows) {
  const stats = new Map();
  for (const row of rows) {
    for (const [fieldName, value] of Object.entries(row)) {
      if (fieldName.startsWith("__")) continue;
      const current = stats.get(fieldName) ?? { fieldName, observed: 0, nonEmpty: 0, samples: [] };
      current.observed += 1;
      const nonEmpty = value != null && String(typeof value === "object" ? JSON.stringify(value) : value).trim() !== "";
      if (nonEmpty) {
        current.nonEmpty += 1;
        const sample = typeof value === "object" ? JSON.stringify(value) : String(value);
        if (current.samples.length < 3 && !current.samples.includes(sample)) current.samples.push(sample.slice(0, 160));
      }
      stats.set(fieldName, current);
    }
  }
  return Array.from(stats.values()).sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

function listColumnsTable(source) {
  return source.columns
    .filter((column) => column.fieldName)
    .sort((a, b) => (a.visibleIndex ?? 999) - (b.visibleIndex ?? 999))
    .map((column) => `| ${markdownCell(column.fieldName)} | ${column.visibleIndex ?? ""} | ${column.index} |`)
    .join("\n");
}

function fieldStatsTable(rows) {
  return rowsToFieldStats(rows)
    .map((stat) => `| ${markdownCell(stat.fieldName)} | ${stat.observed} | ${stat.nonEmpty} | ${markdownCell(stat.samples[0] ?? "")} |`)
    .join("\n");
}

function detailPairsTable(detail) {
  return detail.detailPairs
    .map((pair) => `| ${markdownCell(pair.label)} | ${markdownCell(pair.value)} |`)
    .join("\n");
}

function buildMarkdownReport({ runId, startedAt, endedAt, args, reportJsonPath, productList, priceList, productDetail, priceDetail }) {
  return `# ERP Article Data Source Map

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Fonti ispezionate

- Articoli ListView: \`${productList.url}\`
- Articolo DetailView esempio: \`${productDetail.url}\`
- Price lists ListView: \`${priceList.url}\`
- Price list DetailView esempio: \`${priceDetail.url}\`
- Report JSON: \`${reportJsonPath}\`

## Sintesi

| Fonte | Campi/etichette | Righe campione | Note |
| --- | ---: | ---: | --- |
| INVENTTABLE_ListView | ${productList.fieldNames.length} | ${productList.rows.length} | Articoli, codici, gruppo, figura, gambo, misura, immagine |
| INVENTTABLE_DetailView | ${productDetail.detailPairs.length} | 1 | Dettaglio leggibile con sezioni General, Qty, Systemfields |
| PRICEDISCTABLE_ListView | ${priceList.fieldNames.length} | ${priceList.rows.length} | Prezzi/listini/sconti per articolo/account/date/scaglioni |
| PRICEDISCTABLE_DetailView | ${priceDetail.detailPairs.length} | 1 | Dettaglio prezzo con relazione articolo/account e valori estesi |

## INVENTTABLE_ListView - campi DevExpress

Grid name: \`${productList.gridName}\`  
Page count osservato: ${productList.pageCount ?? "N/A"}  
Visible rows: ${productList.visibleRows ?? "N/A"}

| Field | Visible index | Column index |
| --- | ---: | ---: |
${listColumnsTable(productList)}

## INVENTTABLE_ListView - campi non vuoti nel campione

| Field | Osservati | Non vuoti | Primo esempio |
| --- | ---: | ---: | --- |
${fieldStatsTable(productList.rows)}

## INVENTTABLE_DetailView - etichette e valori esempio

| Etichetta | Valore |
| --- | --- |
${detailPairsTable(productDetail)}

## PRICEDISCTABLE_ListView - campi DevExpress

Grid name: \`${priceList.gridName}\`  
Page count osservato: ${priceList.pageCount ?? "N/A"}  
Visible rows: ${priceList.visibleRows ?? "N/A"}

| Field | Visible index | Column index |
| --- | ---: | ---: |
${listColumnsTable(priceList)}

## PRICEDISCTABLE_ListView - campi non vuoti nel campione

| Field | Osservati | Non vuoti | Primo esempio |
| --- | ---: | ---: | --- |
${fieldStatsTable(priceList.rows)}

## PRICEDISCTABLE_DetailView - etichette e valori esempio

| Etichetta | Valore |
| --- | --- |
${detailPairsTable(priceDetail)}

## Decisione operativa

Non consideriamo ancora completa la mappa ERP articolo finche' non avremo fatto un audit sistematico dei DetailView su un campione piu' ampio. La ListView e' efficiente per acquisizione massiva; il DetailView va usato come arricchimento mirato quando mostra campi non presenti o piu' leggibili.

Prossimo passo consigliato: estendere lo staging per salvare anche record raw da \`PRICEDISCTABLE_ListView\` e snapshot raw dei DetailView articolo/prezzo collegati tramite \`ID\`, \`ITEMID\`, \`ITEMRELATIONID\` e \`ITEMRELATIONTXT\`.
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
    defaultViewport: { width: 1800, height: 1200 },
  });

  let report;
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7" });

    console.log("[erp-map] login ERP");
    await login(page, baseUrl, username, password);

    console.log("[erp-map] inspect INVENTTABLE_ListView");
    const productList = await inspectListView(page, `${baseUrl}/INVENTTABLE_ListView/`, args.sampleRows);

    console.log("[erp-map] inspect PRICEDISCTABLE_ListView");
    const priceList = await inspectListView(page, `${baseUrl}/PRICEDISCTABLE_ListView/`, args.sampleRows);

    console.log("[erp-map] inspect INVENTTABLE_DetailView");
    const productDetail = await inspectDetailView(page, `${baseUrl}/INVENTTABLE_DetailView/${args.productDetailId}/?mode=View`);

    console.log("[erp-map] inspect PRICEDISCTABLE_DetailView");
    const priceDetail = await inspectDetailView(page, `${baseUrl}/PRICEDISCTABLE_DetailView/${args.priceDetailId}/?mode=View`);

    const endedAt = new Date();
    const reportJsonPath = path.join(runDir, "audit-report.json");
    report = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      args,
      productList,
      priceList,
      productDetail,
      priceDetail,
    };

    await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
    const markdown = buildMarkdownReport({
      runId,
      startedAt,
      endedAt,
      args,
      reportJsonPath,
      productList,
      priceList,
      productDetail,
      priceDetail,
    });
    const markdownPath = path.join(args.docsDir, `erp-article-data-source-map-${todayStamp()}.md`);
    await fs.writeFile(markdownPath, markdown);

    console.log("[erp-map] complete");
    console.log(JSON.stringify({
      runId,
      productListFields: productList.fieldNames.length,
      priceListFields: priceList.fieldNames.length,
      productDetailPairs: productDetail.detailPairs.length,
      priceDetailPairs: priceDetail.detailPairs.length,
      reportJsonPath,
      markdownPath,
    }, null, 2));
  } finally {
    await browser.close();
  }

  return report;
}

main().catch((error) => {
  console.error("[erp-map] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
