#!/usr/bin/env tsx
/**
 * E2E TEST: Variant selection for specific problematic articles.
 *
 * Tests: 6379.314.023 (5pz) and 862.314.012 (5pz)
 * Both have a single K2 variant but the dropdown shows similar articles
 * (e.g. 5862, 6862, 8862 or KP6379, S6379, ZR6379).
 *
 * This script:
 *  1. Logs into Archibald
 *  2. Opens a new order for "Fresis Soc Cooperativa"
 *  3. For each article, captures the dropdown snapshot BEFORE selecting
 *  4. Runs the variant-selection algorithm and logs all scoring details
 *  5. Captures the focused-row state and navigation plan
 *  6. Selects the variant and saves the row
 *  7. Verifies the saved row matches the expected article
 *
 * Usage: npx tsx src/scripts/test-variant-selection-e2e.ts
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { ProductDatabase } from "../product-db.js";
import { logger } from "../logger.js";
import {
  buildVariantCandidates,
  chooseBestVariantCandidate,
  computeVariantHeaderIndices,
  type VariantMatchInputs,
  type VariantRowSnapshot,
} from "../variant-selection.js";
import * as fs from "fs/promises";
import * as path from "path";

const DUMP_DIR = path.resolve(__dirname, "../../../logs/variant-e2e-test");
const CUSTOMER_NAME = "Fresis Soc Cooperativa";

interface TestArticle {
  articleName: string;
  quantity: number;
}

const TEST_ARTICLES: TestArticle[] = [
  { articleName: "6379.314.023", quantity: 5 },
  { articleName: "862.314.012", quantity: 5 },
];

interface ArticleTestResult {
  articleName: string;
  quantity: number;
  dbVariantId: string | null;
  dbVariantSuffix: string | null;
  dbPackageContent: string | undefined;
  dbMultipleQty: number | undefined;
  dropdownHeaders: string[];
  dropdownRows: Array<{ index: number; cellTexts: string[] }>;
  dropdownRowsCount: number;
  algorithmChosenIndex: number | null;
  algorithmReason: string | null;
  allCandidateDetails: Array<{
    index: number;
    rowText: string;
    fullIdMatch: boolean;
    articleNameMatch: boolean;
    suffixMatch: boolean;
    packageMatch: boolean;
    multipleMatch: boolean;
  }>;
  focusedRowIndex: number;
  navigationDelta: number;
  navigationDirection: string;
  savedRowCells: string[] | null;
  pass: boolean;
  error?: string;
}

async function captureDropdownSnapshot(page: any) {
  return await page.evaluate(() => {
    const dropdownContainers = Array.from(
      document.querySelectorAll('[id*="_DDD"]'),
    ).filter((node) => {
      const el = node as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden")
        return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    let activeContainer =
      dropdownContainers.find((c) =>
        c.querySelector('tr[class*="dxgvDataRow"]'),
      ) || null;

    if (!activeContainer) {
      const popups = Array.from(
        document.querySelectorAll(".dxpcLite, .dxpc-content, .dxpcMainDiv"),
      ).filter((node) => {
        const el = node as HTMLElement;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden")
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      activeContainer =
        popups.find((c) => c.querySelector('tr[class*="dxgvDataRow"]')) || null;
    }

    const rowsRoot = activeContainer || document;

    const headerTexts: string[] = [];
    const headerTable = rowsRoot.querySelector('table[id*="DXHeaderTable"]');
    let headerRow: Element | null = null;
    if (headerTable) {
      headerRow =
        headerTable.querySelector('tr[id*="DXHeadersRow"]') ||
        headerTable.querySelector("tr.dxgvHeaderRow") ||
        headerTable.querySelector('tr[class*="dxgvHeaderRow"]');
    }
    if (!headerRow) {
      headerRow =
        rowsRoot.querySelector("tr.dxgvHeaderRow") ||
        rowsRoot.querySelector('tr[class*="dxgvHeaderRow"]') ||
        rowsRoot.querySelector('tr[id*="DXHeadersRow"]');
    }
    if (headerRow) {
      Array.from(headerRow.querySelectorAll("td, th")).forEach((cell) => {
        const wrap = cell.querySelector(".dx-wrap");
        headerTexts.push(
          (wrap?.textContent || cell.textContent || "").trim(),
        );
      });
    }

    const rows = Array.from(
      rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
    ).filter((row) => {
      const el = row as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden")
        return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const rowSnapshots = rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td"));
      const cellTexts = cells.map((cell) => cell.textContent?.trim() || "");
      return {
        index,
        cellTexts,
        rowId: row.getAttribute("id") || null,
      };
    });

    const focusedIndex = rows.findIndex((row) => {
      const cls = (row as HTMLElement).className || "";
      return cls.includes("dxgvFocusedRow") || cls.includes("dxgvSelectedRow");
    });

    return {
      containerId: activeContainer
        ? (activeContainer as HTMLElement).id || null
        : null,
      headerTexts,
      rows: rowSnapshots,
      rowsCount: rows.length,
      focusedIndex,
    };
  });
}

async function waitForDevExpressCallbacks(
  page: any,
  timeout = 8000,
): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const w = window as any;
        const col = w.ASPxClientControl?.GetControlCollection?.();
        if (!col || typeof col.ForEachControl !== "function") return true;
        let busy = false;
        col.ForEachControl((c: any) => {
          try {
            if (c.InCallback?.()) busy = true;
          } catch {}
          try {
            const gv = c.GetGridView?.();
            if (gv?.InCallback?.()) busy = true;
          } catch {}
        });
        return !busy;
      },
      { timeout, polling: 100 },
    );
  } catch {
    // proceed
  }
}

async function focusInventtable(page: any): Promise<boolean> {
  const inventtableId = await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'),
    );
    for (const inp of inputs) {
      const el = inp as HTMLElement;
      if (el.offsetParent !== null && el.offsetWidth > 0) {
        return (inp as HTMLInputElement).id;
      }
    }
    return null;
  });

  if (!inventtableId) return false;

  await page.evaluate((inputId: string) => {
    const el = document.getElementById(inputId) as HTMLInputElement;
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.value = "";
      el.focus();
      el.click();
    }
  }, inventtableId);
  await new Promise((r) => setTimeout(r, 300));

  return await page.evaluate(() => {
    const focused = document.activeElement as HTMLInputElement;
    return focused?.id?.includes("INVENTTABLE") || false;
  });
}

async function captureGridDataRows(page: any): Promise<string[][]> {
  return await page.evaluate(() => {
    const mainGrid = document.querySelector(
      '[id*="SALESLINE"] table[id*="DXMainTable"]',
    );
    if (!mainGrid) return [];

    const rows = Array.from(
      mainGrid.querySelectorAll('tr[class*="dxgvDataRow"]'),
    ).filter((r) => {
      const el = r as HTMLElement;
      return (
        el.offsetParent !== null &&
        !el.id.includes("editnew") &&
        !el.id.includes("DXEditingRow")
      );
    });

    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return cells.map((c) => c.textContent?.trim() || "");
    });
  });
}

async function closeDropdown(page: any): Promise<void> {
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
}

async function runTest() {
  logger.info("=".repeat(70));
  logger.info("  E2E TEST: Variant Selection for 6379.314.023 and 862.314.012");
  logger.info("=".repeat(70));

  await fs.mkdir(DUMP_DIR, { recursive: true });

  const productDb = new ProductDatabase();
  let bot: ArchibaldBot | null = null;
  const results: ArticleTestResult[] = [];

  try {
    // ── Phase 0: Database analysis ──
    logger.info("\n--- PHASE 0: Database analysis ---");
    for (const testArticle of TEST_ARTICLES) {
      const variants = productDb.getProductVariants(testArticle.articleName);
      const selected = productDb.selectPackageVariant(
        testArticle.articleName,
        testArticle.quantity,
      );
      logger.info(`\n  ${testArticle.articleName} (qty=${testArticle.quantity}):`);
      logger.info(`    Variants in DB: ${variants.length}`);
      for (const v of variants) {
        const suffix = v.id.substring(v.id.length - 2);
        logger.info(
          `    - ID: ${v.id} suffix="${suffix}" pkg=${v.packageContent} mult=${v.multipleQty}`,
        );
      }
      if (selected) {
        const suffix = selected.id.substring(selected.id.length - 2);
        logger.info(
          `    selectPackageVariant -> ${selected.id} (suffix="${suffix}" pkg=${selected.packageContent})`,
        );
      } else {
        logger.warn(`    selectPackageVariant -> NULL!`);
      }
    }

    // ── Phase 1: Login and navigation ──
    logger.info("\n--- PHASE 1: Login and navigation ---");
    bot = new ArchibaldBot();
    await bot.initialize();
    await (bot as any).login();
    const page = (bot as any).page!;
    logger.info("  Login OK");

    // Navigate to orders
    const { config } = await import("../config.js");
    const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
    await page.goto(ordersUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForFunction(
      () => {
        const elements = Array.from(
          document.querySelectorAll("span, button, a"),
        );
        return elements.some(
          (el) => el.textContent?.trim().toLowerCase() === "nuovo",
        );
      },
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 1000));
    logger.info("  Orders list loaded");

    // Click "Nuovo"
    const clicked = await (bot as any).clickElementByText("Nuovo", {
      exact: true,
      selectors: ["button", "a", "span"],
    });
    if (!clicked) throw new Error('"Nuovo" button not found');

    await page.waitForFunction(
      () => window.location.href.includes("SALESTABLE_DetailView"),
      { timeout: 15000 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 500));
    logger.info("  New order form open");

    // Discover grid
    await (bot as any).discoverSalesLinesGrid();
    const salesLinesGridName = (bot as any).salesLinesGridName as string | null;

    // ── Phase 2: Select customer ──
    logger.info("\n--- PHASE 2: Select customer ---");
    const fieldInfo = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );
      const customerInput = inputs.find((input) => {
        const id = (input as HTMLInputElement).id.toLowerCase();
        const el = input as HTMLInputElement;
        return (
          (id.includes("custtable") ||
            id.includes("custaccount") ||
            id.includes("custome") ||
            id.includes("cliente") ||
            id.includes("account") ||
            id.includes("profilo")) &&
          !el.disabled &&
          el.getBoundingClientRect().height > 0
        );
      }) as HTMLInputElement | undefined;
      if (!customerInput) return null;

      const baseId = customerInput.id.endsWith("_I")
        ? customerInput.id.slice(0, -2)
        : customerInput.id;

      const btnSelectors = [
        `${baseId}_B-1`,
        `${baseId}_B-1Img`,
        `${baseId}_B`,
      ];
      for (const btnId of btnSelectors) {
        const btn = document.getElementById(btnId) as HTMLElement | null;
        if (btn && btn.offsetParent !== null) {
          return {
            inputId: customerInput.id,
            baseId,
            btnSelector: `#${btnId}`,
          };
        }
      }
      return { inputId: customerInput.id, baseId, btnSelector: null };
    });

    if (!fieldInfo?.btnSelector) throw new Error("Customer dropdown button not found");
    const customerBaseId = fieldInfo.baseId;

    await page.click(fieldInfo.btnSelector);
    const searchSelector = `#${customerBaseId}_DDD_gv_DXSE_I`;
    await page.waitForFunction(
      (sel: string) => {
        const input = document.querySelector(sel) as HTMLInputElement | null;
        return input && input.offsetParent !== null && !input.disabled;
      },
      { timeout: 5000, polling: 50 },
      searchSelector,
    );

    await page.evaluate(
      (sel: string, value: string) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (!input) return;
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          }),
        );
        input.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          }),
        );
      },
      searchSelector,
      CUSTOMER_NAME,
    );

    await page.waitForFunction(
      (baseId: string) => {
        const w = window as any;
        const collection =
          w.ASPxClientControl?.GetControlCollection?.() ?? null;
        if (collection) {
          let inCallback = false;
          try {
            if (typeof collection.ForEachControl === "function") {
              collection.ForEachControl((c: any) => {
                if (
                  c?.name?.includes(baseId) &&
                  typeof c.InCallback === "function" &&
                  c.InCallback()
                )
                  inCallback = true;
                if (typeof c?.GetGridView === "function") {
                  const gv = c.GetGridView();
                  if (
                    gv &&
                    typeof gv.InCallback === "function" &&
                    gv.InCallback()
                  )
                    inCallback = true;
                }
              });
            }
          } catch {}
          if (inCallback) return false;
        }
        const containers = Array.from(
          document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return (
            el.offsetParent !== null &&
            el.getBoundingClientRect().width > 0
          );
        });
        const container =
          containers.find(
            (c) =>
              (c as HTMLElement).id.includes(baseId) &&
              c.querySelector('tr[class*="dxgvDataRow"]'),
          ) ||
          containers.find((c) =>
            c.querySelector('tr[class*="dxgvDataRow"]'),
          );
        if (!container) return false;
        const rows = Array.from(
          container.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);
        return rows.length > 0;
      },
      { timeout: 8000, polling: 100 },
      customerBaseId,
    );

    // Click customer row
    await page.evaluate(
      (baseId: string, customerName: string) => {
        const containers = Array.from(
          document.querySelectorAll(
            '[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpcMainDiv',
          ),
        ).filter((node) => {
          const el = node as HTMLElement;
          return (
            el.offsetParent !== null &&
            el.getBoundingClientRect().width > 0
          );
        });
        const container =
          containers.find(
            (c) =>
              (c as HTMLElement).id.includes(baseId) &&
              c.querySelector('tr[class*="dxgvDataRow"]'),
          ) ||
          containers.find((c) =>
            c.querySelector('tr[class*="dxgvDataRow"]'),
          ) ||
          null;
        if (!container) return;
        const rows = Array.from(
          container.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);
        if (rows.length === 1) {
          const target =
            rows[0].querySelector("td") || (rows[0] as HTMLElement);
          (target as HTMLElement).click();
          return;
        }
        const queryLower = customerName.trim().toLowerCase();
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          if (
            cells.some(
              (c) => c.textContent?.trim().toLowerCase() === queryLower,
            )
          ) {
            (cells[0] as HTMLElement).click();
            return;
          }
        }
      },
      customerBaseId,
      CUSTOMER_NAME,
    );

    // Wait for dropdown to close
    try {
      await page.waitForFunction(
        () => {
          const panels = Array.from(
            document.querySelectorAll('[id*="_DDD_PW"]'),
          );
          return panels.every(
            (p) =>
              (p as HTMLElement).offsetParent === null ||
              (p as HTMLElement).style.display === "none",
          );
        },
        { timeout: 3000, polling: 100 },
      );
    } catch {}

    // Wait for grid ready
    try {
      await page.waitForFunction(
        () => {
          const addNew = Array.from(
            document.querySelectorAll('a[data-args*="AddNew"]'),
          ).filter((el) => (el as HTMLElement).offsetParent !== null);
          if (addNew.length > 0) return true;
          const newImg = Array.from(
            document.querySelectorAll(
              'img[title="New"][src*="Action_Inline_New"]',
            ),
          ).filter((el) => (el as HTMLElement).offsetParent !== null);
          return newImg.length > 0;
        },
        { timeout: 6000, polling: 100 },
      );
    } catch {}

    logger.info(`  Customer "${CUSTOMER_NAME}" selected`);
    await page.screenshot({
      path: path.join(DUMP_DIR, "01-customer-selected.png"),
      fullPage: true,
    });

    // ── Phase 3: Test each article ──
    let isFirstRow = true;

    for (let artIdx = 0; artIdx < TEST_ARTICLES.length; artIdx++) {
      const testArticle = TEST_ARTICLES[artIdx];
      const articleCode = testArticle.articleName;
      const qty = testArticle.quantity;

      logger.info(`\n${"=".repeat(70)}`);
      logger.info(
        `  ARTICLE ${artIdx + 1}/${TEST_ARTICLES.length}: ${articleCode} qty=${qty}`,
      );
      logger.info("=".repeat(70));

      const result: ArticleTestResult = {
        articleName: articleCode,
        quantity: qty,
        dbVariantId: null,
        dbVariantSuffix: null,
        dbPackageContent: undefined,
        dbMultipleQty: undefined,
        dropdownHeaders: [],
        dropdownRows: [],
        dropdownRowsCount: 0,
        algorithmChosenIndex: null,
        algorithmReason: null,
        allCandidateDetails: [],
        focusedRowIndex: -1,
        navigationDelta: 0,
        navigationDirection: "",
        savedRowCells: null,
        pass: false,
      };

      try {
        // DB lookup
        const selectedVariant = productDb.selectPackageVariant(
          articleCode,
          qty,
        );
        if (!selectedVariant) {
          result.error = "No variant found in DB";
          results.push(result);
          continue;
        }
        const suffix = selectedVariant.id.substring(
          selectedVariant.id.length - 2,
        );
        result.dbVariantId = selectedVariant.id;
        result.dbVariantSuffix = suffix;
        result.dbPackageContent = selectedVariant.packageContent;
        result.dbMultipleQty = selectedVariant.multipleQty;

        logger.info(
          `  DB variant: ${selectedVariant.id} suffix="${suffix}" pkg=${selectedVariant.packageContent} mult=${selectedVariant.multipleQty}`,
        );

        // AddNew row
        if (!isFirstRow) {
          let addDone = false;
          if (salesLinesGridName) {
            try {
              addDone = await (bot as any).gridAddNewRow();
            } catch {}
          }
          if (!addDone) {
            const addResult = await (bot as any).clickDevExpressGridCommand({
              command: "AddNew",
              baseIdHint: "SALESLINEs",
              timeout: 6000,
              label: `e2e-addnew-${artIdx}`,
            });
            addDone = addResult.clicked;
          }
          if (addDone) {
            try {
              await page.waitForFunction(
                () =>
                  document.querySelectorAll('tr[id*="editnew"]').length > 0,
                { timeout: 5000, polling: 100 },
              );
            } catch {}
            await new Promise((r) => setTimeout(r, 500));
          } else {
            result.error = "AddNew row failed";
            results.push(result);
            continue;
          }
        } else {
          // First article: need to click AddNew for the very first row
          let addDone = false;
          if (salesLinesGridName) {
            try {
              addDone = await (bot as any).gridAddNewRow();
            } catch {}
          }
          if (!addDone) {
            const addResult = await (bot as any).clickDevExpressGridCommand({
              command: "AddNew",
              baseIdHint: "SALESLINEs",
              timeout: 6000,
              label: "e2e-addnew-first",
            });
            addDone = addResult.clicked;
          }
          if (addDone) {
            try {
              await page.waitForFunction(
                () =>
                  document.querySelectorAll('tr[id*="editnew"]').length > 0,
                { timeout: 5000, polling: 100 },
              );
            } catch {}
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        isFirstRow = false;

        // Focus INVENTTABLE
        const focused = await focusInventtable(page);
        if (!focused) {
          result.error = "INVENTTABLE focus failed";
          results.push(result);
          continue;
        }

        // Clear and type article code
        await page.evaluate(() => {
          const input = document.activeElement as HTMLInputElement;
          if (input?.tagName === "INPUT") {
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
        await new Promise((r) => setTimeout(r, 200));

        if (articleCode.length > 1) {
          await page.evaluate((text: string) => {
            const input = document.activeElement as HTMLInputElement;
            if (input?.tagName === "INPUT") {
              input.value = text;
              input.dispatchEvent(
                new Event("input", { bubbles: true, cancelable: true }),
              );
            }
          }, articleCode.slice(0, -1));
          await page.keyboard.type(articleCode.slice(-1), { delay: 30 });
        } else {
          await page.keyboard.type(articleCode, { delay: 30 });
        }
        logger.info(`  Typed: "${articleCode}"`);

        // Wait for dropdown
        try {
          await page.waitForSelector('tr[class*="dxgvDataRow"]', {
            timeout: 8000,
          });
        } catch {
          result.error = "Dropdown did not appear";
          await page.screenshot({
            path: path.join(DUMP_DIR, `${artIdx + 1}-NO-DROPDOWN.png`),
            fullPage: true,
          });
          await closeDropdown(page);
          results.push(result);
          continue;
        }

        await waitForDevExpressCallbacks(page, 5000);
        await new Promise((r) => setTimeout(r, 500));

        // ── CRITICAL: Capture dropdown snapshot ──
        const snapshot = await captureDropdownSnapshot(page);
        result.dropdownHeaders = snapshot.headerTexts;
        result.dropdownRowsCount = snapshot.rowsCount;
        result.dropdownRows = snapshot.rows.map((r) => ({
          index: r.index,
          cellTexts: r.cellTexts,
        }));
        result.focusedRowIndex = snapshot.focusedIndex;

        await page.screenshot({
          path: path.join(DUMP_DIR, `${artIdx + 1}-${articleCode}-dropdown.png`),
          fullPage: true,
        });

        logger.info(`\n  DROPDOWN SNAPSHOT:`);
        logger.info(`    Headers: [${snapshot.headerTexts.join(" | ")}]`);
        logger.info(`    Rows: ${snapshot.rowsCount}`);
        logger.info(`    Focused row: ${snapshot.focusedIndex}`);
        for (const row of snapshot.rows) {
          logger.info(
            `    Row[${row.index}]: [${row.cellTexts.join(" | ")}]`,
          );
        }

        // ── Run variant-selection algorithm ──
        const allDropdownRows: VariantRowSnapshot[] = snapshot.rows.map(
          (row) => ({
            index: row.index,
            cellTexts: row.cellTexts,
            rowId: row.rowId,
          }),
        );

        const headerIndices = computeVariantHeaderIndices(
          snapshot.headerTexts,
        );
        const matchInputs: VariantMatchInputs = {
          variantId: selectedVariant.id,
          variantSuffix: suffix,
          packageContent: selectedVariant.packageContent,
          multipleQty: selectedVariant.multipleQty,
          articleName: articleCode,
        };

        const candidates = buildVariantCandidates(
          allDropdownRows,
          headerIndices,
          matchInputs,
        );
        const { chosen, reason } = chooseBestVariantCandidate(candidates);

        result.algorithmChosenIndex = chosen?.index ?? null;
        result.algorithmReason = reason;
        result.allCandidateDetails = candidates.map((c) => ({
          index: c.index,
          rowText: c.rowText,
          fullIdMatch: c.fullIdMatch,
          articleNameMatch: c.articleNameMatch,
          suffixMatch: c.suffixMatch,
          packageMatch: c.packageMatch,
          multipleMatch: c.multipleMatch,
        }));

        logger.info(`\n  ALGORITHM RESULT:`);
        logger.info(`    Chosen row: ${chosen?.index ?? "NONE"}`);
        logger.info(`    Reason: ${reason}`);
        logger.info(`    Header indices: content=${headerIndices.contentIndex} pack=${headerIndices.packIndex} mult=${headerIndices.multipleIndex}`);
        logger.info(`\n    All candidates:`);
        for (const c of candidates) {
          const flags = [
            c.fullIdMatch ? "ID" : "",
            c.articleNameMatch ? "ART" : "",
            c.suffixMatch ? "SUF" : "",
            c.packageMatch ? "PKG" : "",
            c.multipleMatch ? "MUL" : "",
          ]
            .filter(Boolean)
            .join("+");
          const marker = c.index === (chosen?.index ?? -1) ? " <-- CHOSEN" : "";
          logger.info(
            `      row[${c.index}]: [${flags || "NONE"}] "${c.rowText}"${marker}`,
          );
        }

        if (!chosen) {
          result.error = "Algorithm found no match";
          await closeDropdown(page);
          results.push(result);
          continue;
        }

        // ── Navigation plan ──
        const focusedIndex = snapshot.focusedIndex;
        const targetIndex = chosen.index;
        let delta =
          focusedIndex >= 0
            ? targetIndex - focusedIndex
            : targetIndex + 1;
        const direction = delta >= 0 ? "ArrowDown" : "ArrowUp";
        delta = Math.abs(delta);

        result.navigationDelta = delta;
        result.navigationDirection = direction;

        logger.info(`\n  NAVIGATION PLAN:`);
        logger.info(`    Focused row: ${focusedIndex}`);
        logger.info(`    Target row: ${targetIndex}`);
        logger.info(`    Delta: ${delta} x ${direction}`);

        if (focusedIndex === -1) {
          logger.warn(
            `    WARNING: No focused row detected! Using delta=${targetIndex + 1} (may be off-by-one if row 0 is actually focused)`,
          );
        }

        // ── Execute navigation ──
        const maxSteps = Math.min(delta, snapshot.rowsCount + 2);
        for (let step = 0; step < maxSteps; step++) {
          await page.keyboard.press(direction);
          await new Promise((r) => setTimeout(r, 30));
        }

        // Tab to select
        await page.keyboard.press("Tab");
        await waitForDevExpressCallbacks(page, 8000);

        await page.screenshot({
          path: path.join(
            DUMP_DIR,
            `${artIdx + 1}-${articleCode}-after-select.png`,
          ),
          fullPage: true,
        });

        // Type quantity
        const qtyFormatted = qty.toString().replace(".", ",");
        const currentQty = await page.evaluate(() => {
          const input = document.activeElement as HTMLInputElement;
          return { value: input?.value || "", id: input?.id || "" };
        });

        logger.info(
          `\n  QUANTITY: current="${currentQty.value}" target="${qtyFormatted}" field="${currentQty.id}"`,
        );

        const qtyNum = Number.parseFloat(
          currentQty.value.replace(",", "."),
        );
        if (!Number.isFinite(qtyNum) || Math.abs(qtyNum - qty) >= 0.01) {
          await page.evaluate(() => {
            const input = document.activeElement as HTMLInputElement;
            if (input?.select) input.select();
          });
          await page.keyboard.type(qtyFormatted, { delay: 30 });
          await waitForDevExpressCallbacks(page, 5000);
        }

        // Save with UpdateEdit
        let updateDone = false;
        const updateResult = await (bot as any).clickDevExpressGridCommand({
          command: "UpdateEdit",
          baseIdHint: "SALESLINEs",
          timeout: 7000,
          label: `e2e-update-${artIdx}`,
        });
        if (updateResult.clicked) {
          updateDone = true;
          if (salesLinesGridName) {
            try {
              await (bot as any).waitForGridCallback(
                salesLinesGridName,
                20000,
              );
            } catch {}
          }
          await (bot as any).waitForDevExpressIdle({
            timeout: 4000,
            label: `e2e-saved-${artIdx}`,
          });
        }
        if (!updateDone && salesLinesGridName) {
          try {
            updateDone = await (bot as any).gridUpdateEdit();
          } catch {}
        }

        await new Promise((r) => setTimeout(r, 500));

        // Capture saved row
        const gridRows = await captureGridDataRows(page);
        const lastRow =
          gridRows.length > 0 ? gridRows[gridRows.length - 1] : null;
        result.savedRowCells = lastRow;

        await page.screenshot({
          path: path.join(
            DUMP_DIR,
            `${artIdx + 1}-${articleCode}-after-save.png`,
          ),
          fullPage: true,
        });

        logger.info(`\n  SAVED ROW (last in grid, ${gridRows.length} total):`);
        if (lastRow) {
          logger.info(`    Cells: [${lastRow.join(" | ")}]`);
          // Check if the saved row contains the expected article code
          const rowContainsArticle = lastRow.some(
            (cell) =>
              cell.toLowerCase().includes(articleCode.toLowerCase()) ||
              cell.includes(selectedVariant.id),
          );
          result.pass = rowContainsArticle && updateDone;
          logger.info(
            `    Contains "${articleCode}" or "${selectedVariant.id}": ${rowContainsArticle}`,
          );
        } else {
          logger.warn("    No saved rows found in grid!");
        }

        logger.info(
          `\n  RESULT: ${result.pass ? "PASS" : "FAIL"}${result.pass ? "" : ` - expected ${articleCode} but got different article`}`,
        );
      } catch (err: any) {
        result.error = err.message;
        logger.error(`  ERROR: ${err.message}`);
        await page.screenshot({
          path: path.join(
            DUMP_DIR,
            `${artIdx + 1}-${articleCode}-ERROR.png`,
          ),
          fullPage: true,
        });
        // Recovery
        await closeDropdown(page);
        try {
          await page.evaluate(() => {
            const buttons = Array.from(
              document.querySelectorAll('a[data-args*="CancelEdit"]'),
            );
            for (const btn of buttons) {
              const el = btn as HTMLElement;
              if (el.offsetParent !== null) {
                el.click();
                return;
              }
            }
          });
          await (bot as any).waitForDevExpressIdle({
            timeout: 5000,
            label: `e2e-cancel-${artIdx}`,
          });
        } catch {}
      }

      results.push(result);
    }

    // ── Phase 4: Summary ──
    logger.info(`\n${"=".repeat(70)}`);
    logger.info("  SUMMARY");
    logger.info("=".repeat(70));

    for (const r of results) {
      const status = r.pass ? "PASS" : "FAIL";
      const icon = r.pass ? "[OK]" : "[!!]";
      logger.info(
        `\n  ${icon} ${r.articleName} qty=${r.quantity}: ${status}`,
      );
      logger.info(
        `      DB variant: ${r.dbVariantId} suffix="${r.dbVariantSuffix}"`,
      );
      logger.info(`      Dropdown rows: ${r.dropdownRowsCount}`);
      logger.info(
        `      Algorithm: row[${r.algorithmChosenIndex}] reason="${r.algorithmReason}"`,
      );
      logger.info(
        `      Navigation: focused=${r.focusedRowIndex} delta=${r.navigationDelta} ${r.navigationDirection}`,
      );
      if (r.focusedRowIndex === -1 && r.dropdownRowsCount > 1) {
        logger.warn(
          `      WARNING: No focused row detected with ${r.dropdownRowsCount} rows - potential off-by-one!`,
        );
      }
      if (r.savedRowCells) {
        logger.info(`      Saved: [${r.savedRowCells.join(" | ")}]`);
      }
      if (r.error) {
        logger.error(`      Error: ${r.error}`);
      }
    }

    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    logger.info(`\n  Total: ${passed}/${total} passed`);

    // Save results
    const outputPath = path.join(DUMP_DIR, "test-results.json");
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    logger.info(`  Results saved to: ${outputPath}`);

    // Final screenshot
    await page.screenshot({
      path: path.join(DUMP_DIR, "99-final-state.png"),
      fullPage: true,
    });
  } catch (error) {
    logger.error("Fatal error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (bot && (bot as any).page) {
      await (bot as any).page.screenshot({
        path: path.join(DUMP_DIR, "FATAL-ERROR.png"),
        fullPage: true,
      });
    }
  } finally {
    if (bot) {
      try {
        await (bot as any).cleanup?.();
      } catch {}
    }
    productDb.close();
  }
}

runTest().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
