#!/usr/bin/env node

/**
 * Targeted read-only ERP product image acquisition.
 *
 * It reads product metadata page-wide via GetPageRowValues, skips ITEMIDs that
 * already have a saved image in previous reports, and fetches ImageCalc only for
 * missing rows. This is much faster than reading ImageCalc for every row.
 */

import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-product-image-audit");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");
const DEFAULT_EXISTING_REPORT = path.join(
  backendRoot,
  "data",
  "erp-product-image-audit",
  "2026-06-01-09-03-17-271",
  "audit-report.json",
);
const PRIORITY_GROUPS = [
  "FRESE DIA - GRANA MEDIA",
  "RIFINITURA STR. GRANE FINE",
  "FRESONI C.T.",
  "FRESE C.T.",
  "FRESE DIA - GRANA GROSSA",
  "CT - TECNICA DI FRESAGGIO",
  "RIFINITURA C.T.",
  "CHIRURGIA C.T.",
  "LABORATORIO FRESE C.T.",
  "DIAO",
  "DIA ZR",
];
const CORE_FIELDS = [
  "ITEMID",
  "NAME",
  "DESCRIPTION",
  "SEARCHNAME",
  "PRODUCTGROUPID.ID",
  "PRODUCTGROUPID.PRODUCTGROUPID",
  "PRODUCTGROUPID.PRODUCTGROUP1",
  "BRASPACKINGCONTENTS",
  "BRASFIGURE",
  "BRASITEMIDBULK",
  "BRASPACKAGEEXPERTS",
  "BRASSHANK",
  "BRASSIZE",
  "ORDERITEM",
  "STOPPED",
  "MODIFIEDDATETIME",
  "CREATEDDATETIME",
  "ID",
];

function parseArgs(argv) {
  const args = {
    limit: Number(process.env.AUDIT_LIMIT || 10_000),
    outputDir: process.env.AUDIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.AUDIT_DOCS_DIR || DEFAULT_DOCS_DIR,
    existingReports: (process.env.AUDIT_EXISTING_REPORTS || DEFAULT_EXISTING_REPORT)
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean),
    groups: (process.env.AUDIT_GROUPS || "")
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean),
    headless: process.env.AUDIT_HEADLESS !== "false",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
    } else if (arg === "--group" && next) {
      args.groups.push(next);
      i += 1;
    } else if (arg === "--groups" && next) {
      args.groups.push(...next.split("|").map((value) => value.trim()).filter(Boolean));
      i += 1;
    } else if (arg === "--priority-groups") {
      args.groups.push(...PRIORITY_GROUPS);
    } else if (arg === "--existing-report" && next) {
      args.existingReports.push(path.resolve(next));
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
  node scripts/audit-erp-product-images-targeted.mjs [options]

Options:
  --priority-groups          Acquire missing images for rotary priority groups.
  --group <name>             Product group filter. Repeatable.
  --groups <a|b|c>           Pipe-separated product groups.
  --existing-report <path>   Existing image report used to skip saved ITEMIDs. Repeatable.
  --limit <n>                Max new images to save. Default: 10000.
  --output-dir <path>        Directory for images and JSON report.
  --docs-dir <path>          Directory for Markdown report.
  --headed                   Run browser visibly.
`);
      process.exit(0);
    }
  }

  args.groups = Array.from(new Set(args.groups));
  args.existingReports = Array.from(new Set(args.existingReports));
  if (!Number.isFinite(args.limit) || args.limit <= 0) throw new Error(`Invalid --limit: ${args.limit}`);
  if (args.groups.length === 0) throw new Error("Pass --priority-groups, --group, or --groups");
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

function normalizeText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value.__type === "Date" && value.iso) return value.iso;
  return String(value).replace(/\s+/g, " ").trim();
}

function safeCode(value) {
  return String(value || "unknown")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "unknown";
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function parseImageBytes(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    const bytes = value.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    return bytes.length > 0 ? Buffer.from(bytes) : null;
  }
  if (typeof value === "object") {
    if (Array.isArray(value.data)) return parseImageBytes(value.data);
    if (value.type === "Buffer" && Array.isArray(value.data)) return parseImageBytes(value.data);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(,\d+)+$/.test(text)) {
    const bytes = text.split(",").map((part) => Number(part));
    if (bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) return Buffer.from(bytes);
  }
  const base64Match = text.match(/^data:([^;]+);base64,(.+)$/);
  if (base64Match) return Buffer.from(base64Match[2], "base64");
  return null;
}

function detectImageExtension(buffer) {
  if (!buffer || buffer.length < 12) return "bin";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.slice(0, 3).toString("ascii") === "GIF") return "gif";
  return "bin";
}

function mimeFromExtension(ext) {
  switch (ext) {
    case "png": return "image/png";
    case "jpg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

function serializeRawValue(value, fieldName = "") {
  if (fieldName === "ImageCalc") {
    const imageBuffer = parseImageBytes(value);
    return {
      __type: "image_bytes",
      byteLength: imageBuffer?.length ?? 0,
      signature: imageBuffer ? Array.from(imageBuffer.subarray(0, 12)) : [],
    };
  }
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) {
    return {
      __type: "Date",
      iso: value.toISOString(),
      epochMs: value.getTime(),
      text: value.toString(),
    };
  }
  return value;
}

function serializeRawFields(raw) {
  return Object.fromEntries(Object.entries(raw).map(([fieldName, value]) => [fieldName, serializeRawValue(value, fieldName)]));
}

function rawValueIsNonEmpty(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    if (value.__type === "image_bytes") return (value.byteLength ?? 0) > 0;
    return Object.keys(value).length > 0;
  }
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
  return Array.from(stats.values()).sort((a, b) => b.nonEmptyCount - a.nonEmptyCount || a.fieldName.localeCompare(b.fieldName));
}

async function loadExistingImageItemIds(reportPaths) {
  const itemIds = new Set();
  for (const reportPath of reportPaths) {
    try {
      const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      for (const record of report.records ?? []) {
        if (record.image?.status && record.erpItemId) itemIds.add(record.erpItemId);
      }
    } catch (error) {
      console.warn(`[targeted-images] cannot read existing report ${reportPath}: ${error.message}`);
    }
  }
  return itemIds;
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

  return page.evaluate((coreFields) => {
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
    return {
      gridName,
      columns,
      fieldNames: coreFields.filter((fieldName) => columns.some((column) => column.fieldName === fieldName)),
      pageIndex: typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null,
      pageCount: typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null,
    };
  }, CORE_FIELDS);
}

async function clearGridFilter(page) {
  const changed = await page.evaluate(() => {
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
    let didChange = false;
    try { grid.ClearFilter?.(); didChange = true; } catch {}
    try { grid.ApplyFilter?.(""); didChange = true; } catch {}
    try { grid.GotoPage?.(0); } catch {}
    return didChange;
  });
  if (changed) {
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

async function applyProductGroupFilter(page, groupName) {
  await clearGridFilter(page);
  const result = await page.evaluate((targetGroup) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return { ok: false, error: "grid not found" };
    const grid = window[gridName];
    const column = typeof grid.GetColumnByField === "function"
      ? grid.GetColumnByField("PRODUCTGROUPID.PRODUCTGROUP1")
      : null;
    if (!column) return { ok: false, error: "PRODUCTGROUPID.PRODUCTGROUP1 column not found" };
    if (typeof grid.AutoFilterByColumn !== "function") return { ok: false, error: "AutoFilterByColumn not available" };
    grid.AutoFilterByColumn(column, targetGroup);
    return { ok: true, gridName };
  }, groupName);
  if (!result.ok) throw new Error(`Cannot apply product group filter "${groupName}": ${result.error}`);
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const reset = await goToPage(page, 0);
  if (!reset) {
    const current = await currentPageInfo(page);
    throw new Error(`Cannot reset group "${groupName}" to page 0 after filtering. Current page: ${current.pageIndex}`);
  }
}

async function readCurrentPageMetadata(page, fieldNames) {
  return page.evaluate(async (fields) => {
    const serializeValue = (value) => {
      if (value instanceof Date) {
        return { __type: "Date", iso: value.toISOString(), epochMs: value.getTime(), text: value.toString() };
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
    if (!gridName) return { rows: [], pageIndex: null, pageCount: null, visibleRows: 0 };
    const grid = window[gridName];
    const visibleRows = typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : 0;
    const pageIndex = typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null;
    const pageCount = typeof grid.GetPageCount === "function" ? grid.GetPageCount() : null;
    const fieldStr = fields.join(";");

    if (typeof grid.GetPageRowValues === "function") {
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
          rows: pageValues.map((values, rowIndex) => {
            const raw = {};
            for (let i = 0; i < fields.length; i += 1) raw[fields[i]] = serializeValue(values?.[i]);
            raw.__visibleRowIndex = rowIndex;
            return raw;
          }),
          pageIndex,
          pageCount,
          visibleRows,
        };
      }
    }

    const rows = [];
    for (let rowIndex = 0; rowIndex < visibleRows; rowIndex += 1) {
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
      const raw = {};
      for (let i = 0; i < fields.length; i += 1) raw[fields[i]] = serializeValue(values?.[i]);
      raw.__visibleRowIndex = rowIndex;
      rows.push(raw);
    }
    return { rows, pageIndex, pageCount, visibleRows };
  }, fieldNames);
}

async function readImageForRow(page, visibleRowIndex) {
  return page.evaluate(async (rowIndex) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return null;
    const grid = window[gridName];
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 12_000);
      grid.GetRowValues(rowIndex, "ImageCalc", (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (Array.isArray(value) && value.length === 1 && Array.isArray(value[0])) {
          resolve(value[0]);
          return;
        }
        resolve(value);
      });
    });
  }, visibleRowIndex);
}

async function currentPageInfo(page) {
  return page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return typeof window[key]?.GetRowValues === "function" &&
          typeof window[key]?.GetPageIndex === "function" &&
          typeof window[key]?.GetPageCount === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return { pageIndex: null, pageCount: null };
    const grid = window[gridName];
    return {
      pageIndex: grid.GetPageIndex(),
      pageCount: grid.GetPageCount(),
    };
  });
}

async function goToPage(page, targetPageIndex) {
  const before = await currentPageInfo(page);
  if (before.pageIndex === targetPageIndex) return true;

  const requested = await page.evaluate((target) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return typeof window[key]?.GetRowValues === "function" &&
          typeof window[key]?.GetPageIndex === "function" &&
          typeof window[key]?.GotoPage === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    try {
      window[gridName].GotoPage(target);
      return true;
    } catch {
      return false;
    }
  }, targetPageIndex);

  if (!requested) return false;
  const changed = await page.waitForFunction((target) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return typeof window[key]?.GetRowValues === "function" &&
          typeof window[key]?.GetPageIndex === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    const idle = typeof grid.InCallback === "function" ? !grid.InCallback() : true;
    return idle && grid.GetPageIndex() === target;
  }, { timeout: 45_000 }, targetPageIndex)
    .then(() => true)
    .catch(() => false);

  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  return changed;
}

async function goNextPage(page) {
  const before = await page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return typeof window[key]?.GetRowValues === "function" &&
          typeof window[key]?.GetPageIndex === "function" &&
          typeof window[key]?.GetPageCount === "function" &&
          typeof window[key]?.GotoPage === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return { canGoNext: false };
    const grid = window[gridName];
    const current = grid.GetPageIndex();
    const total = grid.GetPageCount();
    return { canGoNext: current < total - 1, current, total };
  });
  if (!before.canGoNext) return false;
  const requested = await page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return typeof window[key]?.GetRowValues === "function" &&
          typeof window[key]?.GetPageIndex === "function" &&
          typeof window[key]?.GotoPage === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    grid.GotoPage(grid.GetPageIndex() + 1);
    return true;
  });
  if (!requested) return false;
  const changed = await page.waitForFunction((previous) => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return typeof window[key]?.GetRowValues === "function" &&
          typeof window[key]?.GetPageIndex === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return false;
    const grid = window[gridName];
    const idle = typeof grid.InCallback === "function" ? !grid.InCallback() : true;
    return idle && grid.GetPageIndex() !== previous;
  }, { timeout: 45_000 }, before.current).then(() => true).catch(() => false);
  if (!changed) return false;
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  return true;
}

async function writeImage(raw, imageBuffer, imagesDir) {
  const ext = detectImageExtension(imageBuffer);
  const sha256 = crypto.createHash("sha256").update(imageBuffer).digest("hex");
  const filename = `${safeCode(raw.ITEMID)}__${safeCode(raw.NAME)}__${sha256.slice(0, 12)}.${ext}`;
  const localPath = path.join(imagesDir, filename);
  await fs.writeFile(localPath, imageBuffer);

  let metadata = {};
  let metadataError = null;
  try {
    const sharpMeta = await sharp(imageBuffer).metadata();
    metadata = {
      width: sharpMeta.width ?? null,
      height: sharpMeta.height ?? null,
      format: sharpMeta.format ?? ext,
      space: sharpMeta.space ?? null,
      channels: sharpMeta.channels ?? null,
    };
  } catch (error) {
    metadataError = error instanceof Error ? error.message : String(error);
  }

  return {
    localPath,
    filename,
    sha256,
    fileSize: imageBuffer.length,
    mimeType: mimeFromExtension(ext),
    extension: ext,
    metadata,
    metadataError,
  };
}

function buildRecord(raw, pageIndex, groupFilter) {
  return {
    erpItemId: normalizeText(raw.ITEMID),
    articleCode: normalizeText(raw.NAME),
    description: normalizeText(raw.DESCRIPTION),
    groupCode: normalizeText(raw["PRODUCTGROUPID.ID"]),
    productGroupId: normalizeText(raw["PRODUCTGROUPID.PRODUCTGROUPID"]),
    productGroupDescription: normalizeText(raw["PRODUCTGROUPID.PRODUCTGROUP1"]),
    packageContent: normalizeText(raw.BRASPACKINGCONTENTS),
    figure: normalizeText(raw.BRASFIGURE),
    shank: normalizeText(raw.BRASSHANK),
    size: normalizeText(raw.BRASSIZE),
    orderableArticle: normalizeText(raw.ORDERITEM),
    stopped: normalizeText(raw.STOPPED),
    modifiedDatetime: normalizeText(raw.MODIFIEDDATETIME),
    productIdExt: normalizeText(raw.ID),
    visibleRowIndex: raw.__visibleRowIndex,
    pageIndex,
    groupFilter,
    sourceRecordKey: normalizeText(raw.ITEMID) || normalizeText(raw.ID) || `${groupFilter}:${pageIndex}:${raw.__visibleRowIndex}`,
  };
}

async function collectGroup({ page, groupName, fieldNames, existingItemIds, imagesDir, limit, runId }) {
  await applyProductGroupFilter(page, groupName);
  const records = [];
  const stats = { groupName, scannedRows: 0, alreadyCoveredRows: 0, missingRows: 0, savedImages: 0, emptyImages: 0, pagesRead: 0 };

  while (stats.savedImages < limit) {
    const pageRows = await readCurrentPageMetadata(page, fieldNames);
    stats.pagesRead += 1;
    console.log(`[targeted-images] group "${groupName}" page ${pageRows.pageIndex ?? stats.pagesRead}/${pageRows.pageCount ?? "?"}: ${pageRows.rows.length} rows`);
    if (pageRows.rows.length === 0) break;

    for (const raw of pageRows.rows) {
      stats.scannedRows += 1;
      const erpItemId = normalizeText(raw.ITEMID);
      if (existingItemIds.has(erpItemId)) {
        stats.alreadyCoveredRows += 1;
        continue;
      }

      stats.missingRows += 1;
      const imageValue = await readImageForRow(page, raw.__visibleRowIndex);
      raw.ImageCalc = imageValue;
      const record = buildRecord(raw, pageRows.pageIndex, groupName);
      record.runId = runId;
      record.rawFields = serializeRawFields(raw);
      record.rawFieldNames = Object.keys(record.rawFields);

      const imageBuffer = parseImageBytes(imageValue);
      if (imageBuffer && imageBuffer.length > 0) {
        const image = await writeImage(raw, imageBuffer, imagesDir);
        record.image = {
          status: image.metadataError ? "invalid" : "saved",
          localPath: image.localPath,
          filename: image.filename,
          sha256: image.sha256,
          fileSize: image.fileSize,
          mimeType: image.mimeType,
          extension: image.extension,
          width: image.metadata.width ?? null,
          height: image.metadata.height ?? null,
          format: image.metadata.format ?? null,
          metadataError: image.metadataError,
        };
        if (record.image.status === "saved") {
          stats.savedImages += 1;
          existingItemIds.add(erpItemId);
        }
      } else {
        record.image = { status: "empty", reason: "empty or unparseable ImageCalc" };
        stats.emptyImages += 1;
      }

      records.push(record);
      existingItemIds.add(erpItemId);
      if (stats.savedImages >= limit) break;
    }

    if (stats.savedImages >= limit) break;
    const hasNext = await goNextPage(page);
    if (!hasNext) break;
  }

  return { records, stats };
}

function buildMarkdownReport({ runId, startedAt, endedAt, args, reportJsonPath, records, groupStats }) {
  const saved = records.filter((record) => record.image?.status === "saved");
  const uniqueImages = new Set(saved.map((record) => record.image.sha256)).size;
  const fieldStats = buildFieldStats(records);
  const groupRows = groupStats
    .map((stat) => `| ${markdownCell(stat.groupName)} | ${stat.scannedRows} | ${stat.alreadyCoveredRows} | ${stat.missingRows} | ${stat.savedImages} | ${stat.emptyImages} | ${stat.pagesRead} |`)
    .join("\n");
  const examples = saved.slice(0, 20)
    .map((record) => `| ${markdownCell(record.erpItemId)} | ${markdownCell(record.articleCode)} | ${markdownCell(record.productGroupDescription)} | ${record.image.width ?? ""}x${record.image.height ?? ""} | ${record.image.fileSize ?? ""} | \`${path.basename(record.image.localPath)}\` |`)
    .join("\n");
  const fieldRows = fieldStats
    .map((field) => `| ${markdownCell(field.fieldName)} | ${field.observedCount} | ${field.nonEmptyCount} | ${markdownCell(Object.keys(field.valueTypes).join(", "))} |`)
    .join("\n");

  return `# ERP Targeted Product Image Audit

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`  
Modalita': read-only, acquisizione mirata immagini mancanti.

## Configurazione

- Gruppi: ${args.groups.map((group) => `\`${group}\``).join(", ")}
- Existing reports: ${args.existingReports.map((report) => `\`${report}\``).join(", ")}
- Limit nuove righe immagine: ${args.limit}
- Report JSON: \`${reportJsonPath}\`

## Risultati

- Record immagine nuovi osservati: ${records.length}
- Immagini salvate: ${saved.length}
- Immagini uniche per hash: ${uniqueImages}
- Immagini vuote/non parseabili: ${records.filter((record) => record.image?.status !== "saved").length}

## Copertura per gruppo

| Gruppo | Righe scansionate | Gia' coperte | Mancanti lette | Immagini salvate | Vuote | Pagine |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${groupRows || "| N/A | 0 | 0 | 0 | 0 | 0 | 0 |"}

## Campi raw osservati

| Field | Osservati | Non vuoti | Tipi |
| --- | ---: | ---: | --- |
${fieldRows || "| N/A | 0 | 0 | N/A |"}

## Esempi immagini salvate

| ERP item | Articolo | Gruppo | Dimensioni | Bytes | File |
| --- | --- | --- | ---: | ---: | --- |
${examples || "| N/A | N/A | N/A | N/A | N/A | N/A |"}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = (process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald").replace(/\/$/, "");
  const username = requireEnv("ARCHIBALD_USERNAME");
  const password = requireEnv("ARCHIBALD_PASSWORD");
  const runId = `${todayStamp()}-${new Date().toISOString().replace(/[:.]/g, "-").slice(11, 23)}`;
  const startedAt = new Date();
  const runDir = path.join(args.outputDir, runId);
  const imagesDir = path.join(runDir, "images");
  const existingItemIds = await loadExistingImageItemIds(args.existingReports);
  const records = [];
  const groupStats = [];

  await fs.mkdir(imagesDir, { recursive: true });
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

    console.log(`[targeted-images] loaded ${existingItemIds.size} existing image ITEMIDs`);
    console.log("[targeted-images] login ERP");
    await login(page, baseUrl, username, password);

    console.log("[targeted-images] open INVENTTABLE_ListView");
    await page.goto(`${baseUrl}/INVENTTABLE_ListView/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    console.log("[targeted-images] prepare grid");
    const gridInfo = await prepareGrid(page);
    console.log(`[targeted-images] metadata fields: ${gridInfo.fieldNames.length}`);

    for (const groupName of args.groups) {
      const savedTotal = records.filter((record) => record.image?.status === "saved").length;
      if (savedTotal >= args.limit) break;
      console.log(`[targeted-images] group start: ${groupName}`);
      const result = await collectGroup({
        page,
        groupName,
        fieldNames: gridInfo.fieldNames,
        existingItemIds,
        imagesDir,
        limit: args.limit - savedTotal,
        runId,
      });
      records.push(...result.records);
      groupStats.push(result.stats);
      console.log(`[targeted-images] group complete: ${groupName} saved=${result.stats.savedImages} empty=${result.stats.emptyImages}`);
    }

    await clearGridFilter(page);

    const endedAt = new Date();
    const fieldStats = buildFieldStats(records);
    const reportJsonPath = path.join(runDir, "audit-report.json");
    const report = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      args,
      gridInfo,
      groupStats,
      fieldStats,
      records,
    };
    await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));

    const markdown = buildMarkdownReport({ runId, startedAt, endedAt, args, reportJsonPath, records, groupStats });
    const markdownPath = path.join(args.docsDir, `erp-product-images-targeted-audit-${todayStamp()}.md`);
    await fs.writeFile(markdownPath, markdown);

    console.log("[targeted-images] complete");
    console.log(JSON.stringify({
      runId,
      records: records.length,
      savedImages: records.filter((record) => record.image?.status === "saved").length,
      emptyImages: records.filter((record) => record.image?.status !== "saved").length,
      reportJsonPath,
      markdownPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[targeted-images] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
