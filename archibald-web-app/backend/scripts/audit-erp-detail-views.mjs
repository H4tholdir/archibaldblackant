#!/usr/bin/env node

/**
 * Read-only audit for ERP DetailView pages.
 *
 * It samples product and price DetailViews using IDs already acquired from
 * INVENTTABLE/PRICEDISCTABLE reports, preserving broad raw snapshots first.
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

const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-detail-view-audit");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");
const DEFAULT_PRODUCT_REPORT = path.join(
  backendRoot,
  "data",
  "erp-product-image-audit",
  "2026-06-01-09-03-17-271",
  "audit-report.json",
);
const DEFAULT_PRICE_REPORT = path.join(
  backendRoot,
  "data",
  "erp-price-list-audit",
  "2026-06-02-14-11-05-386",
  "audit-report.json",
);

function parseArgs(argv) {
  const args = {
    productReportPath: process.env.AUDIT_PRODUCT_REPORT || DEFAULT_PRODUCT_REPORT,
    priceReportPath: process.env.AUDIT_PRICE_REPORT || DEFAULT_PRICE_REPORT,
    productLimit: Number(process.env.AUDIT_PRODUCT_DETAIL_LIMIT || 30),
    priceLimit: Number(process.env.AUDIT_PRICE_DETAIL_LIMIT || 30),
    outputDir: process.env.AUDIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.AUDIT_DOCS_DIR || DEFAULT_DOCS_DIR,
    headless: process.env.AUDIT_HEADLESS !== "false",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--product-report" && next) {
      args.productReportPath = path.resolve(next);
      i += 1;
    } else if (arg === "--price-report" && next) {
      args.priceReportPath = path.resolve(next);
      i += 1;
    } else if (arg === "--product-limit" && next) {
      args.productLimit = Number(next);
      i += 1;
    } else if (arg === "--price-limit" && next) {
      args.priceLimit = Number(next);
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
  node scripts/audit-erp-detail-views.mjs [options]

Options:
  --product-report <path>  Product audit JSON. Default: latest known report.
  --price-report <path>    Price audit JSON. Default: latest known report.
  --product-limit <n>      Product DetailViews to sample. Default: 30.
  --price-limit <n>        Price DetailViews to sample. Default: 30.
  --output-dir <path>      Directory for JSON report.
  --docs-dir <path>        Directory for Markdown report.
  --headed                 Run browser visibly.
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

function runIdStamp() {
  return `${todayStamp()}-${new Date().toISOString().replace(/[:.]/g, "-").slice(11, 23)}`;
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function pickEvenly(items, limit) {
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.detailId || seen.has(item.detailId)) continue;
    seen.add(item.detailId);
    unique.push(item);
  }

  if (limit <= 0 || unique.length <= limit) return unique;
  const picked = [];
  const pickedIndexes = new Set();
  for (let i = 0; i < limit; i += 1) {
    const index = Math.round((i * (unique.length - 1)) / (limit - 1));
    if (!pickedIndexes.has(index)) {
      pickedIndexes.add(index);
      picked.push(unique[index]);
    }
  }
  return picked;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function productCandidates(report) {
  return (report.records ?? [])
    .map((record) => ({
      detailId: String(record.productIdExt || record.rawFields?.ID || "").trim(),
      erpItemId: record.erpItemId || record.rawFields?.ITEMID || null,
      articleCode: record.articleCode || record.rawFields?.NAME || null,
      productGroupDescription: record.productGroupDescription || record.rawFields?.["PRODUCTGROUPID.PRODUCTGROUP1"] || null,
      figure: record.figure || record.rawFields?.BRASFIGURE || null,
      shank: record.shank || record.rawFields?.BRASSHANK || null,
      size: record.size || record.rawFields?.BRASSIZE || null,
      rawFieldNames: record.rawFieldNames ?? Object.keys(record.rawFields ?? {}),
    }))
    .filter((candidate) => candidate.detailId);
}

function priceCandidates(report) {
  return (report.records ?? [])
    .map((record) => ({
      detailId: String(record.priceDiscTableId || record.rawFields?.ID || "").trim(),
      erpItemId: record.itemRelationId || record.rawFields?.ITEMRELATIONID || null,
      articleCode: record.itemRelationText || record.rawFields?.ITEMRELATIONTXT || null,
      accountRelationId: record.accountRelationId || record.rawFields?.ACCOUNTRELATIONID || null,
      accountRelationText: record.accountRelationText || record.rawFields?.ACCOUNTRELATIONTXT || null,
      amount: record.amount ?? record.rawFields?.AMOUNT ?? null,
      currency: record.currency || record.rawFields?.CURRENCY || null,
      rawFieldNames: record.rawFieldNames ?? Object.keys(record.rawFields ?? {}),
    }))
    .filter((candidate) => candidate.detailId);
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

function parseDetailPairsFromText(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const ignored = new Set([
    "Loading...",
    "Loading…",
    "Vista",
    "Record precedente",
    "Record successivo",
    "Show hidden items",
  ]);
  const pairs = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.endsWith(":")) continue;

    const label = line.replace(/:$/, "").trim();
    const values = [];
    for (let j = i + 1; j < lines.length && values.length < 3; j += 1) {
      const next = lines[j];
      if (next.endsWith(":")) break;
      if (ignored.has(next)) continue;
      values.push(next);
    }

    if (label && values.length > 0) pairs.push({ label, value: values.join(" ") });
  }

  const seen = new Set();
  return pairs.filter((pair) => {
    const key = `${pair.label}:${pair.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function inspectDetailView(page, baseUrl, kind, candidate) {
  const pathName = kind === "product" ? "INVENTTABLE_DetailView" : "PRICEDISCTABLE_DetailView";
  const url = `${baseUrl}/${pathName}/${candidate.detailId}/?mode=View`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const snapshot = await page.evaluate(() => {
    const bodyText = document.body.innerText.replace(/\s+\n/g, "\n").trim();
    const imageAssets = Array.from(document.images)
      .map((img) => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
        className: String(img.className || ""),
      }))
      .filter((img) =>
        img.src.includes("BinaryDataHttpHandler") ||
        img.src.includes("ImageCalc") ||
        (img.width > 20 && img.height > 20 && !img.src.includes("ImageResource&name=Logo")),
      );
    const productImageAssets = imageAssets.filter((img) =>
      img.src.includes("BinaryDataHttpHandler") || img.src.includes("ImageCalc"),
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

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({ text: (a.textContent || "").trim(), href: a.href }))
      .filter((link) => link.href.includes("DetailView") || link.href.includes("ListView"))
      .slice(0, 120);

    return {
      url: location.href,
      title: document.title,
      bodyText,
      bodyTextLength: bodyText.length,
      imageAssets,
      productImageAssets,
      inputs,
      links,
    };
  });

  return {
    kind,
    candidate,
    ...snapshot,
    detailPairs: parseDetailPairsFromText(snapshot.bodyText),
  };
}

function summarizeDetails(records) {
  const labelStats = new Map();
  const inputStats = new Map();
  const recordsWithProductImages = records.filter((record) => record.productImageAssets.length > 0).length;
  const recordsWithAnyImages = records.filter((record) => record.imageAssets.length > 0).length;

  for (const record of records) {
    for (const pair of record.detailPairs) {
      const stat = labelStats.get(pair.label) ?? {
        label: pair.label,
        count: 0,
        sampleValues: [],
      };
      stat.count += 1;
      if (stat.sampleValues.length < 5 && pair.value && !stat.sampleValues.includes(pair.value)) {
        stat.sampleValues.push(pair.value);
      }
      labelStats.set(pair.label, stat);
    }

    for (const input of record.inputs) {
      const key = input.name || input.id || input.title || input.type;
      const stat = inputStats.get(key) ?? {
        key,
        count: 0,
        sampleValues: [],
      };
      stat.count += 1;
      if (stat.sampleValues.length < 5 && input.value && !stat.sampleValues.includes(input.value)) {
        stat.sampleValues.push(input.value);
      }
      inputStats.set(key, stat);
    }
  }

  return {
    records: records.length,
    recordsWithProductImages,
    recordsWithAnyImages,
    labels: Array.from(labelStats.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    inputs: Array.from(inputStats.values()).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  };
}

function buildMarkdownReport({ runId, startedAt, endedAt, args, reportJsonPath, productDetails, priceDetails }) {
  const productSummary = summarizeDetails(productDetails);
  const priceSummary = summarizeDetails(priceDetails);

  const labelsTable = (summary) => summary.labels
    .map((stat) => `| ${markdownCell(stat.label)} | ${stat.count} | ${markdownCell(stat.sampleValues[0] ?? "")} |`)
    .join("\n");

  const sampleTable = (details) => details.slice(0, 20)
    .map((detail) => `| ${markdownCell(detail.candidate.detailId)} | ${markdownCell(detail.candidate.erpItemId)} | ${markdownCell(detail.candidate.articleCode)} | ${detail.detailPairs.length} | ${detail.productImageAssets.length} | ${detail.imageAssets.length} | ${detail.inputs.length} |`)
    .join("\n");

  return `# ERP DetailView Audit

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Fonti

- Product report: \`${args.productReportPath}\`
- Price report: \`${args.priceReportPath}\`
- Report JSON: \`${reportJsonPath}\`

## Sintesi

| Tipo DetailView | Record letti | Record con immagini prodotto | Record con asset immagine UI/prodotto | Etichette distinte |
| --- | ---: | ---: | ---: | ---: |
| INVENTTABLE_DetailView | ${productSummary.records} | ${productSummary.recordsWithProductImages} | ${productSummary.recordsWithAnyImages} | ${productSummary.labels.length} |
| PRICEDISCTABLE_DetailView | ${priceSummary.records} | ${priceSummary.recordsWithProductImages} | ${priceSummary.recordsWithAnyImages} | ${priceSummary.labels.length} |

## INVENTTABLE_DetailView - campione record

| Detail ID | ERP item | Codice articolo | Coppie label/value | Immagini prodotto | Asset immagine totali | Input |
| --- | --- | --- | ---: | ---: | ---: | ---: |
${sampleTable(productDetails)}

## INVENTTABLE_DetailView - etichette osservate

| Etichetta | Presenze | Primo esempio |
| --- | ---: | --- |
${labelsTable(productSummary)}

## PRICEDISCTABLE_DetailView - campione record

| Detail ID | ERP item | Codice articolo | Coppie label/value | Immagini prodotto | Asset immagine totali | Input |
| --- | --- | --- | ---: | ---: | ---: | ---: |
${sampleTable(priceDetails)}

## PRICEDISCTABLE_DetailView - etichette osservate

| Etichetta | Presenze | Primo esempio |
| --- | ---: | --- |
${labelsTable(priceSummary)}

## Lettura operativa

Il report JSON conserva anche testo completo pagina, input non hidden, asset immagine e link Detail/ListView. Questo audit serve a decidere se conviene fare un crawl completo dei DetailView oppure se la ListView e' sufficiente e i DetailView vanno usati solo come verifica/arricchimento.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = (process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald").replace(/\/$/, "");
  const username = requireEnv("ARCHIBALD_USERNAME");
  const password = requireEnv("ARCHIBALD_PASSWORD");
  const runId = runIdStamp();
  const startedAt = new Date();
  const runDir = path.join(args.outputDir, runId);

  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(args.docsDir, { recursive: true });

  const productReport = await readJson(args.productReportPath);
  const priceReport = await readJson(args.priceReportPath);
  const products = pickEvenly(productCandidates(productReport), args.productLimit);
  const prices = pickEvenly(priceCandidates(priceReport), args.priceLimit);

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

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7" });

    console.log("[erp-detail] login ERP");
    await login(page, baseUrl, username, password);

    const productDetails = [];
    for (let i = 0; i < products.length; i += 1) {
      const candidate = products[i];
      console.log(`[erp-detail] product ${i + 1}/${products.length}: ${candidate.detailId} ${candidate.erpItemId ?? ""}`);
      productDetails.push(await inspectDetailView(page, baseUrl, "product", candidate));
    }

    const priceDetails = [];
    for (let i = 0; i < prices.length; i += 1) {
      const candidate = prices[i];
      console.log(`[erp-detail] price ${i + 1}/${prices.length}: ${candidate.detailId} ${candidate.erpItemId ?? ""}`);
      priceDetails.push(await inspectDetailView(page, baseUrl, "price", candidate));
    }

    const endedAt = new Date();
    const reportJsonPath = path.join(runDir, "audit-report.json");
    const report = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      args,
      productCandidates: products,
      priceCandidates: prices,
      productSummary: summarizeDetails(productDetails),
      priceSummary: summarizeDetails(priceDetails),
      productDetails,
      priceDetails,
    };

    await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
    const markdown = buildMarkdownReport({
      runId,
      startedAt,
      endedAt,
      args,
      reportJsonPath,
      productDetails,
      priceDetails,
    });
    const markdownPath = path.join(args.docsDir, `erp-detail-view-audit-${todayStamp()}.md`);
    await fs.writeFile(markdownPath, markdown);

    console.log("[erp-detail] complete");
    console.log(JSON.stringify({
      runId,
      productDetails: productDetails.length,
      priceDetails: priceDetails.length,
      productLabels: report.productSummary.labels.length,
      priceLabels: report.priceSummary.labels.length,
      reportJsonPath,
      markdownPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[erp-detail] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
