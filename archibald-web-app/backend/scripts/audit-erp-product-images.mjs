#!/usr/bin/env node

/**
 * Read-only audit for ERP product images.
 *
 * It logs into Archibald ERP, reads INVENTTABLE_ListView via the DevExpress
 * GetRowValues API, extracts ImageCalc bytes, stores local image files, and
 * writes a Markdown/JSON audit report. It does not write to the application DB.
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

const DEFAULT_LIMIT = 120;
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-product-image-audit");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");
const CORE_FIELD_NAMES = [
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
  "ID",
  "ImageCalc",
];
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

function parseArgs(argv) {
  const args = {
    limit: Number(process.env.AUDIT_LIMIT || DEFAULT_LIMIT),
    pageSize: Number(process.env.AUDIT_PAGE_SIZE || DEFAULT_PAGE_SIZE),
    outputDir: process.env.AUDIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.AUDIT_DOCS_DIR || DEFAULT_DOCS_DIR,
    onlyWithImages: process.env.AUDIT_ONLY_WITH_IMAGES === "true",
    headless: process.env.AUDIT_HEADLESS !== "false",
    allFields: process.env.AUDIT_CORE_FIELDS_ONLY !== "true",
    groups: (process.env.AUDIT_GROUPS || "")
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
    } else if (arg === "--page-size" && next) {
      args.pageSize = Number(next);
      i += 1;
    } else if (arg === "--output-dir" && next) {
      args.outputDir = path.resolve(next);
      i += 1;
    } else if (arg === "--docs-dir" && next) {
      args.docsDir = path.resolve(next);
      i += 1;
    } else if (arg === "--only-with-images") {
      args.onlyWithImages = true;
    } else if (arg === "--core-fields-only") {
      args.allFields = false;
    } else if (arg === "--group" && next) {
      args.groups.push(next);
      i += 1;
    } else if (arg === "--groups" && next) {
      args.groups.push(...next.split("|").map((value) => value.trim()).filter(Boolean));
      i += 1;
    } else if (arg === "--priority-groups") {
      args.groups.push(...PRIORITY_GROUPS);
    } else if (arg === "--headed") {
      args.headless = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/audit-erp-product-images.mjs [options]

Options:
  --limit <n>            Number of rows to read. In group mode, rows per group. Default: ${DEFAULT_LIMIT}
  --page-size <n>        Requested grid page size. Default: ${DEFAULT_PAGE_SIZE}
  --output-dir <path>    Directory for images and JSON report.
  --docs-dir <path>      Directory for Markdown report.
  --only-with-images     Continue until <limit> rows with valid images are found.
  --core-fields-only     Read only the known core fields instead of every grid field.
  --group <name>         Temporarily filter PRODUCTGROUPID.PRODUCTGROUP1. Repeatable.
  --groups <a|b|c>       Pipe-separated product groups.
  --priority-groups      Use priority rotary-instrument groups.
  --headed               Run browser visibly.
`);
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    throw new Error(`Invalid --limit value: ${args.limit}`);
  }
  if (!Number.isFinite(args.pageSize) || args.pageSize <= 0) {
    throw new Error(`Invalid --page-size value: ${args.pageSize}`);
  }

  args.groups = Array.from(new Set(args.groups));

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

function safeCode(value) {
  return String(value || "unknown")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "unknown";
}

function normalizeText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value.__type === "Date" && value.iso) return value.iso;
  return String(value).replace(/\s+/g, " ").trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function buildFieldNames(gridInfo, allFields) {
  if (!allFields) return CORE_FIELD_NAMES;

  const gridFields = gridInfo.columns
    .map((column) => column.fieldName)
    .filter(Boolean);

  return uniqueStrings([...gridFields, ...CORE_FIELD_NAMES]);
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
  if (typeof value === "object" && value.__type === "Date" && value.iso) return value;

  if (Array.isArray(value)) {
    if (value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      return {
        __type: "byte_array",
        byteLength: value.length,
        signature: value.slice(0, 12),
      };
    }
    return value.map((item) => serializeRawValue(item));
  }

  if (typeof value === "object") {
    try {
      const jsonValue = JSON.parse(JSON.stringify(value));
      if (jsonValue && Object.keys(jsonValue).length > 0) return jsonValue;
    } catch {}

    return {
      __type: value.constructor?.name || "object",
      text: String(value),
    };
  }

  return String(value);
}

function serializeRawFields(raw) {
  const fields = {};
  for (const [fieldName, value] of Object.entries(raw)) {
    if (fieldName.startsWith("__")) continue;
    fields[fieldName] = serializeRawValue(value, fieldName);
  }
  return fields;
}

function rawValueIsNonEmpty(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    if (value.__type === "image_bytes" || value.__type === "byte_array") return (value.byteLength ?? 0) > 0;
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

  return Array.from(stats.values()).sort((a, b) => {
    if (b.nonEmptyCount !== a.nonEmptyCount) return b.nonEmptyCount - a.nonEmptyCount;
    return a.fieldName.localeCompare(b.fieldName);
  });
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
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
    if (bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
      return Buffer.from(bytes);
    }
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

async function prepareGrid(page, pageSize) {
  await waitForDevExpressIdle(page);

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

  return page.evaluate(async (_requestedPageSize) => {
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
    const count = typeof grid.GetColumnCount === "function" ? grid.GetColumnCount() : 80;
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

    // Do not change the persisted DevExpress view here. This audit is read-only:
    // it reads the page size currently served by the ERP and paginates if needed.
    if (typeof grid.GotoPage === "function") {
      try { grid.GotoPage(0); } catch {}
    }

    return { gridName, columns };
  }, pageSize);
}

async function clearGridFilter(page) {
  const changed = await page.evaluate(() => {
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
    let didChange = false;
    try {
      if (typeof grid.ClearFilter === "function") {
        grid.ClearFilter();
        didChange = true;
      }
    } catch {}
    try {
      if (typeof grid.ApplyFilter === "function") {
        grid.ApplyFilter("");
        didChange = true;
      }
    } catch {}
    try {
      if (typeof grid.GotoPage === "function") grid.GotoPage(0);
    } catch {}
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
          typeof window[key].GetRowValues === "function" &&
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
    return { ok: true, gridName, groupName: targetGroup };
  }, groupName);

  if (!result.ok) {
    throw new Error(`Cannot apply product group filter "${groupName}": ${result.error}`);
  }

  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await page.evaluate(() => {
    const gridName = Object.keys(window).find((key) => {
      try {
        return window[key]?.GetRowValues &&
          typeof window[key].GetRowValues === "function" &&
          typeof window[key].GetColumn === "function";
      } catch {
        return false;
      }
    });
    if (!gridName) return;
    const grid = window[gridName];
    if (typeof grid.GotoPage === "function") {
      try { grid.GotoPage(0); } catch {}
    }
  });
  await waitForDevExpressIdle(page, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 800));

  return result;
}

async function getVisibleRows(page, fieldNames, maxRows = null) {
  return page.evaluate(async (fields, requestedMaxRows) => {
    const serializeBrowserValue = (value, fieldName) => {
      if (fieldName === "ImageCalc") return value;
      if (value instanceof Date) {
        return {
          __type: "Date",
          iso: value.toISOString(),
          epochMs: value.getTime(),
          text: value.toString(),
        };
      }
      return value;
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
    if (!gridName) return { gridName: null, rows: [], visibleRows: 0, pageIndex: null };

    const grid = window[gridName];
    const visibleRows = typeof grid.GetVisibleRowsOnPage === "function" ? grid.GetVisibleRowsOnPage() : 0;
    const pageIndex = typeof grid.GetPageIndex === "function" ? grid.GetPageIndex() : null;
    const rowsToRead = Number.isFinite(requestedMaxRows)
      ? Math.min(visibleRows, Math.max(0, requestedMaxRows))
      : visibleRows;

    if (!rowsToRead) return { gridName, rows: [], visibleRows, rowsToRead, pageIndex };

    const rows = [];
    const fieldStr = fields.join(";");

    for (let rowIndex = 0; rowIndex < rowsToRead; rowIndex += 1) {
      const values = await new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, 10_000);

        grid.GetRowValues(rowIndex, fieldStr, (rowValues) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(rowValues);
        });
      });

      if (!values) continue;

      const mapped = {};
      for (let i = 0; i < fields.length; i += 1) {
        mapped[fields[i]] = serializeBrowserValue(values?.[i] ?? null, fields[i]);
      }
      mapped.__visibleRowIndex = rowIndex;
      rows.push(mapped);
    }

    return { gridName, rows, visibleRows, rowsToRead, pageIndex };
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

  const didRequestNext = await page.evaluate(() => {
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
    if (typeof grid.NextPage === "function") {
      grid.NextPage();
      return true;
    }
    if (typeof grid.GotoPage === "function") {
      grid.GotoPage(grid.GetPageIndex() + 1);
      return true;
    }
    return false;
  });

  if (!didRequestNext) return false;

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
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return true;
}

async function writeImage(row, imageBuffer, imagesDir) {
  const ext = detectImageExtension(imageBuffer);
  const sha256 = crypto.createHash("sha256").update(imageBuffer).digest("hex");
  const productId = safeCode(row.ITEMID);
  const articleCode = safeCode(row.NAME);
  const filename = `${productId}__${articleCode}__${sha256.slice(0, 12)}.${ext}`;
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

function buildRecord(raw, pageIndex) {
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
  };
}

async function buildAuditRecord(raw, pageIndex, imagesDir, groupFilter = null) {
  const imageBuffer = parseImageBytes(raw.ImageCalc);
  const record = buildRecord(raw, pageIndex);
  record.groupFilter = groupFilter;
  record.sourceRecordKey = normalizeText(raw.ITEMID) || normalizeText(raw.ID) || `${groupFilter || "grid"}:${pageIndex}:${raw.__visibleRowIndex}`;
  record.rawFields = serializeRawFields(raw);
  record.rawFieldNames = Object.keys(record.rawFields);

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
  } else {
    record.image = {
      status: "empty",
      reason: raw.ImageCalc == null || raw.ImageCalc === "" ? "empty ImageCalc" : "unparseable ImageCalc",
    };
  }

  return record;
}

async function collectRecordsFromCurrentGrid({
  page,
  fieldNames,
  imagesDir,
  limit,
  onlyWithImages,
  groupFilter,
}) {
  const records = [];
  let pagesRead = 0;
  let emptyPages = 0;

  while (records.length < limit) {
    const remainingRows = onlyWithImages ? null : limit - records.length;
    const pageRows = await getVisibleRows(page, fieldNames, remainingRows);
    pagesRead += 1;
    console.log(`[audit] ${groupFilter ? `group "${groupFilter}" ` : ""}page ${pageRows.pageIndex ?? pagesRead}: ${pageRows.rows.length} rows`);

    if (pageRows.rows.length === 0) {
      emptyPages += 1;
      if (emptyPages >= 2) {
        console.log("[audit] stopping after consecutive empty pages");
        break;
      }
      const hasNext = await goNextPage(page);
      if (!hasNext) break;
      continue;
    }

    emptyPages = 0;

    for (const raw of pageRows.rows) {
      const record = await buildAuditRecord(raw, pageRows.pageIndex, imagesDir, groupFilter);
      if (!onlyWithImages || record.image.status === "saved") {
        records.push(record);
      }
      if (records.length >= limit) break;
    }

    if (records.length >= limit) break;

    const hasNext = await goNextPage(page);
    if (!hasNext) break;
  }

  return { records, pagesRead };
}

function buildMarkdownReport({ runId, startedAt, endedAt, args, gridInfo, records, reportJsonPath }) {
  const total = records.length;
  const withImageBytes = records.filter((r) => r.image?.status === "saved").length;
  const emptyImages = records.filter((r) => r.image?.status === "empty").length;
  const invalidImages = records.filter((r) => r.image?.status === "invalid").length;
  const uniqueImages = new Set(records.filter((r) => r.image?.sha256).map((r) => r.image.sha256)).size;
  const duplicateImages = withImageBytes - uniqueImages;
  const fieldStats = buildFieldStats(records);
  const discoveredFields = uniqueStrings(gridInfo.columns.map((column) => column.fieldName));

  const byGroup = new Map();
  for (const record of records) {
    const key = record.productGroupDescription || record.productGroupId || record.groupCode || "N/A";
    const current = byGroup.get(key) ?? { total: 0, images: 0 };
    current.total += 1;
    if (record.image?.status === "saved") current.images += 1;
    byGroup.set(key, current);
  }

  const groupRows = Array.from(byGroup.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 25)
    .map(([group, stats]) => `| ${markdownCell(group)} | ${stats.total} | ${stats.images} | ${Math.round((stats.images / stats.total) * 100)}% |`)
    .join("\n");

  const byFilter = new Map();
  for (const record of records) {
    const key = record.groupFilter || "Filtro non applicato";
    const current = byFilter.get(key) ?? { total: 0, images: 0 };
    current.total += 1;
    if (record.image?.status === "saved") current.images += 1;
    byFilter.set(key, current);
  }

  const filterRows = Array.from(byFilter.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([filter, stats]) => `| ${markdownCell(filter)} | ${stats.total} | ${stats.images} | ${Math.round((stats.images / stats.total) * 100)}% |`)
    .join("\n");

  const examples = records
    .filter((r) => r.image?.status === "saved")
    .slice(0, 15)
    .map((r) => `| ${markdownCell(r.erpItemId)} | ${markdownCell(r.articleCode)} | ${markdownCell(r.productGroupDescription)} | ${r.image.width ?? ""}x${r.image.height ?? ""} | ${r.image.fileSize} | \`${path.basename(r.image.localPath)}\` |`)
    .join("\n");

  const emptyExamples = records
    .filter((r) => r.image?.status !== "saved")
    .slice(0, 15)
    .map((r) => `| ${markdownCell(r.erpItemId)} | ${markdownCell(r.articleCode)} | ${markdownCell(r.productGroupDescription)} | ${markdownCell(r.image?.status ?? "missing")} | ${markdownCell(r.image?.reason ?? "")} |`)
    .join("\n");

  const columnRows = gridInfo.columns
    .filter((c) => ["ImageCalc", "ITEMID", "NAME", "DESCRIPTION", "BRASFIGURE", "BRASSHANK", "BRASSIZE", "PRODUCTGROUPID.ID", "PRODUCTGROUPID.PRODUCTGROUPID", "PRODUCTGROUPID.PRODUCTGROUP1"].includes(c.fieldName))
    .sort((a, b) => (a.visibleIndex ?? 999) - (b.visibleIndex ?? 999))
    .map((c) => `| ${c.fieldName || c.name || "(no field)"} | ${c.visibleIndex ?? ""} | ${c.index} |`)
    .join("\n");

  const fieldStatsRows = fieldStats
    .slice(0, 40)
    .map((field) => `| ${markdownCell(field.fieldName)} | ${field.observedCount} | ${field.nonEmptyCount} | ${markdownCell(Object.keys(field.valueTypes).join(", "))} | ${markdownCell(field.sampleValues[0] ?? "")} |`)
    .join("\n");

  return `# ERP Product Image Audit

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Configurazione

- ERP URL: \`${process.env.ARCHIBALD_URL || "default"}\`
- Limit: ${args.limit}
- Filtri gruppo prodotto: ${args.groups.length > 0 ? args.groups.map((group) => `\`${group}\``).join(", ") : "nessuno"}
- Page size richiesta: ${args.pageSize}
- Only with images: ${args.onlyWithImages ? "si" : "no"}
- Lettura campi: ${args.allFields ? `tutti i fieldName DevExpress disponibili (${discoveredFields.length}) + core fields` : "solo core fields"}
- Output immagini: \`${path.join(args.outputDir, runId, "images")}\`
- Report JSON: \`${reportJsonPath}\`

## Risultati

- Righe lette: ${total}
- Immagini salvate: ${withImageBytes}
- Immagini vuote/mancanti: ${emptyImages}
- Immagini non valide: ${invalidImages}
- Immagini uniche per hash: ${uniqueImages}
- Duplicati immagine: ${duplicateImages}
- Copertura immagini: ${total > 0 ? Math.round((withImageBytes / total) * 100) : 0}%

## Campi ERP confermati

Grid name osservato: \`${gridInfo.gridName}\`
FieldName DevExpress scoperti: ${discoveredFields.length}

| Field | Visible index | Column index |
| --- | ---: | ---: |
${columnRows || "| N/A | | |"}

## Osservazioni campi raw

| Field | Osservati | Non vuoti | Tipi | Primo esempio |
| --- | ---: | ---: | --- | --- |
${fieldStatsRows || "| N/A | 0 | 0 | N/A | N/A |"}

## Copertura per gruppo

| Gruppo | Righe | Immagini | Copertura |
| --- | ---: | ---: | ---: |
${groupRows || "| N/A | 0 | 0 | 0% |"}

## Copertura per filtro applicato

| Filtro | Righe | Immagini | Copertura |
| --- | ---: | ---: | ---: |
${filterRows || "| N/A | 0 | 0 | 0% |"}

## Esempi con immagine

| ERP item | Articolo | Gruppo | Dimensioni | Bytes | File |
| --- | --- | --- | ---: | ---: | --- |
${examples || "| N/A | N/A | N/A | N/A | 0 | N/A |"}

## Esempi senza immagine valida

| ERP item | Articolo | Gruppo | Stato | Motivo |
| --- | --- | --- | --- | --- |
${emptyExamples || "| N/A | N/A | N/A | N/A | N/A |"}

## Note tecniche

- Il campo immagine ERP e' \`ImageCalc\`.
- \`ImageCalc\` viene letto via DevExpress \`GetRowValues\`.
- Il valore immagine viene ricevuto come lista/CSV di byte e convertito in file locale.
- Gli URL \`DXX.axd?handlerName=BinaryDataHttpHandler...\` sono session-specific: non vanno usati come identificatore stabile.
- La chiave stabile proposta e' \`sha256\` del file immagine associato a \`ITEMID\` e \`NAME\`.

## Decisione suggerita

Se la copertura e qualita' del campione sono sufficienti, il prossimo passo e' estendere l'audit a tutti gli articoli e poi progettare una tabella staging per importare immagini ERP in modo controllato.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = (process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald").replace(/\/$/, "");
  const username = requireEnv("ARCHIBALD_USERNAME");
  const password = requireEnv("ARCHIBALD_PASSWORD");
  const runId = `${todayStamp()}-${new Date().toISOString().replace(/[:.]/g, "-").slice(11, 23)}`;
  const runDir = path.join(args.outputDir, runId);
  const imagesDir = path.join(runDir, "images");
  const startedAt = new Date();

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

  const records = [];
  let gridInfo = { gridName: null, columns: [] };
  let fieldNames = CORE_FIELD_NAMES;

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7" });

    console.log("[audit] login ERP");
    await login(page, baseUrl, username, password);

    console.log("[audit] open INVENTTABLE_ListView");
    await page.goto(`${baseUrl}/INVENTTABLE_ListView/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    console.log("[audit] prepare grid");
    gridInfo = await prepareGrid(page, args.pageSize);
    fieldNames = buildFieldNames(gridInfo, args.allFields);
    console.log(`[audit] fields selected: ${fieldNames.length} (${args.allFields ? "all discovered fields" : "core fields only"})`);
    await waitForDevExpressIdle(page, 45_000);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    if (args.groups.length > 0) {
      for (const groupName of args.groups) {
        console.log(`[audit] apply product group filter: ${groupName}`);
        await applyProductGroupFilter(page, groupName);
        const groupResult = await collectRecordsFromCurrentGrid({
          page,
          fieldNames,
          imagesDir,
          limit: args.limit,
          onlyWithImages: args.onlyWithImages,
          groupFilter: groupName,
        });
        records.push(...groupResult.records);
        console.log(`[audit] group "${groupName}" complete: ${groupResult.records.length} records, ${groupResult.pagesRead} pages`);
      }
      await clearGridFilter(page);
    } else {
      console.log("[audit] clear filters before unfiltered acquisition");
      await clearGridFilter(page);
      const result = await collectRecordsFromCurrentGrid({
        page,
        fieldNames,
        imagesDir,
        limit: args.limit,
        onlyWithImages: args.onlyWithImages,
        groupFilter: null,
      });
      records.push(...result.records);
    }
  } finally {
    await browser.close();
  }

  const endedAt = new Date();
  const report = {
    runId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    args: {
      limit: args.limit,
      pageSize: args.pageSize,
      onlyWithImages: args.onlyWithImages,
      allFields: args.allFields,
      groups: args.groups,
      outputDir: args.outputDir,
      docsDir: args.docsDir,
    },
    gridInfo,
    fieldStats: buildFieldStats(records),
    records,
  };

  const reportJsonPath = path.join(runDir, "audit-report.json");
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));

  const markdown = buildMarkdownReport({ runId, startedAt, endedAt, args, gridInfo, records, reportJsonPath });
  const markdownPath = path.join(args.docsDir, `erp-product-image-audit-${todayStamp()}.md`);
  await fs.writeFile(markdownPath, markdown);

  console.log("[audit] complete");
  console.log(JSON.stringify({
    runId,
    records: records.length,
    imagesSaved: records.filter((r) => r.image?.status === "saved").length,
    outputDir: runDir,
    reportJsonPath,
    markdownPath,
  }, null, 2));
}

main().catch((error) => {
  console.error("[audit] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
