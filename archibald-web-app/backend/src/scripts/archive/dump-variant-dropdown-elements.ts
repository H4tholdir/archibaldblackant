#!/usr/bin/env tsx
/**
 * DUMP VARIANT DROPDOWN ELEMENTS
 *
 * Script diagnostico per catturare gli elementi DevExpress del dropdown varianti.
 * Testa 5 articoli con pattern diversi per verificare che la selezione variante
 * funzioni correttamente in tutti gli scenari.
 *
 * Articoli testati:
 *   1. 9530.900.260    → 3 varianti, K-suffix (K0/K1/K2), packageContent: 100/10/50
 *   2. 95002F.104.150  → 3 varianti, numeric ID, packageContent: 1/5/10
 *   3. 10839.314.016   → 2 varianti, K-suffix (K2/K3), packageContent: 5/1
 *   4. 2909.314.040    → 2 varianti, K-suffix (K0/K1), packageContent: 1/5
 *   5. 368.314.021     → 2 varianti, K-suffix (K2/K3), packageContent: 5/1
 *
 * Uso: npx tsx src/scripts/dump-variant-dropdown-elements.ts
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { ProductDatabase } from "../product-db.js";
import { config } from "../config.js";
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

const DUMP_DIR = path.resolve(__dirname, "../../../logs/variant-dumps");

interface TestArticle {
  articleName: string;
  description: string;
  expectedVariants: number;
  testQuantities: number[];
}

const TEST_ARTICLES: TestArticle[] = [
  {
    articleName: "9530.900.260",
    description: "3 varianti K-suffix (K0=100pz, K1=10pz, K2=50pz)",
    expectedVariants: 3,
    testQuantities: [10, 50, 100],
  },
  {
    articleName: "95002F.104.150",
    description: "3 varianti numeric ID (58=1pz, 59=5pz, 60=10pz)",
    expectedVariants: 3,
    testQuantities: [1, 5, 10],
  },
  {
    articleName: "10839.314.016",
    description: "2 varianti K-suffix (K2=5pz, K3=1pz)",
    expectedVariants: 2,
    testQuantities: [1, 5, 15],
  },
  {
    articleName: "2909.314.040",
    description: "2 varianti K-suffix (K0=1pz, K1=5pz)",
    expectedVariants: 2,
    testQuantities: [1, 5, 7],
  },
  {
    articleName: "368.314.021",
    description: "2 varianti K-suffix (K2=5pz, K3=1pz)",
    expectedVariants: 2,
    testQuantities: [1, 5, 3],
  },
  {
    articleName: "801.314.014",
    description: "2 varianti K-suffix (K2=5pz, K3=1pz) - articolo critico segnalato",
    expectedVariants: 2,
    testQuantities: [1, 5, 10, 3],
  },
  {
    articleName: "KP6830RL.314.012",
    description: "1 sola variante numeric ID (10017594=5pz) - edge case singola variante",
    expectedVariants: 1,
    testQuantities: [5, 10, 1],
  },
];

interface DropdownSnapshot {
  containerId: string | null;
  headerTexts: string[];
  rows: Array<{
    index: number;
    cellTexts: string[];
    rowId: string | null;
    rowClasses: string;
    cellDetails: Array<{
      text: string;
      className: string;
      align: string;
      width: number;
    }>;
  }>;
  rowsCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  pagerInfo: string | null;
  containerDimensions: { width: number; height: number } | null;
}

interface VariantAnalysis {
  articleName: string;
  description: string;
  dbVariants: Array<{
    id: string;
    packageContent: string | undefined;
    multipleQty: number | undefined;
    minQty: number | undefined;
    maxQty: number | undefined;
    suffix: string;
  }>;
  dropdownPages: DropdownSnapshot[];
  selectionTests: Array<{
    quantity: number;
    selectedVariant: {
      id: string;
      packageContent: string | undefined;
      multipleQty: number | undefined;
      suffix: string;
    } | null;
    algorithmResult: {
      chosenRowIndex: number | null;
      reason: string | null;
      chosenRowText: string | null;
      confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
      allCandidateScores: Array<{
        rowIndex: number;
        rowText: string;
        fullIdMatch: boolean;
        suffixMatch: boolean;
        packageMatch: boolean;
        multipleMatch: boolean;
      }>;
    };
    actualResult: {
      wasInserted: boolean;
      insertionError?: string;
      formFieldsAfterSelect: Record<string, string> | null;
      focusedFieldAfterSelect: { id: string; value: string } | null;
      savedRowCells: string[] | null;
      screenshotAfterSelect: string;
      screenshotAfterSave: string;
    };
  }>;
}

async function captureDropdownSnapshot(page: any): Promise<DropdownSnapshot> {
  return await page.evaluate(() => {
    const dropdownContainers = Array.from(
      document.querySelectorAll('[id*="_DDD"]'),
    ).filter((node) => {
      const el = node as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    let activeContainer =
      dropdownContainers.find((c) =>
        c.querySelector('tr[class*="dxgvDataRow"]'),
      ) || null;

    if (!activeContainer) {
      const popupContainers = Array.from(
        document.querySelectorAll(".dxpcLite, .dxpc-content, .dxpcMainDiv"),
      ).filter((node) => {
        const el = node as HTMLElement;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      activeContainer =
        popupContainers.find((c) =>
          c.querySelector('tr[class*="dxgvDataRow"]'),
        ) || null;
    }

    const rowsRoot = activeContainer || document;

    // Headers
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

    // Rows
    const rows = Array.from(
      rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
    ).filter((row) => {
      const el = row as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const rowSnapshots = rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td"));
      const cellTexts = cells.map((cell) => cell.textContent?.trim() || "");
      const cellDetails = cells.map((cell) => {
        const style = window.getComputedStyle(cell);
        const rect = cell.getBoundingClientRect();
        return {
          text: cell.textContent?.trim() || "",
          className: cell.className || "",
          align: style.textAlign || "",
          width: Math.round(rect.width),
        };
      });

      return {
        index,
        cellTexts,
        rowId: row.getAttribute("id") || null,
        rowClasses: (row as HTMLElement).className || "",
        cellDetails,
      };
    });

    // Pagination
    let hasNextPage = false;
    let hasPrevPage = false;
    const images = Array.from(rowsRoot.querySelectorAll("img"));
    for (const img of images) {
      const alt = img.getAttribute("alt") || "";
      const className = img.className || "";
      if (alt === "Next" || className.includes("pNext")) {
        const parent = img.parentElement;
        if (parent && !parent.className.includes("dxp-disabled")) {
          hasNextPage = true;
        }
      }
      if (alt === "Prev" || className.includes("pPrev")) {
        const parent = img.parentElement;
        if (parent && !parent.className.includes("dxp-disabled")) {
          hasPrevPage = true;
        }
      }
    }

    // Pager text
    let pagerInfo: string | null = null;
    const pagerEl = rowsRoot.querySelector('[class*="dxPagerSummary"], [id*="DPS"]');
    if (pagerEl) {
      pagerInfo = pagerEl.textContent?.trim() || null;
    }

    // Container dimensions
    let containerDimensions: { width: number; height: number } | null = null;
    if (activeContainer) {
      const rect = (activeContainer as HTMLElement).getBoundingClientRect();
      containerDimensions = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    return {
      containerId: activeContainer
        ? (activeContainer as HTMLElement).id || null
        : null,
      headerTexts,
      rows: rowSnapshots,
      rowsCount: rows.length,
      hasNextPage,
      hasPrevPage,
      pagerInfo,
      containerDimensions,
    };
  });
}

async function closeDropdown(page: any): Promise<void> {
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
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

async function captureEditRowState(page: any): Promise<{
  fields: Record<string, string>;
  focusedId: string;
  focusedValue: string;
} | null> {
  return await page.evaluate(() => {
    const editRow =
      document.querySelector('tr[id*="editnew"]') ||
      document.querySelector('tr[id*="DXEditingRow"]');
    if (!editRow) return null;

    const inputs = Array.from(
      editRow.querySelectorAll('input[type="text"]'),
    ) as HTMLInputElement[];
    const fields: Record<string, string> = {};
    for (const inp of inputs) {
      if (inp.id && inp.offsetParent !== null) {
        const shortId = inp.id
          .replace(/.*_SALESLINES?_/i, "SL_")
          .replace(/_I$/, "");
        fields[shortId] = inp.value;
      }
    }

    const focused = document.activeElement as HTMLInputElement;
    return {
      fields,
      focusedId: focused?.id || "",
      focusedValue: focused?.value || "",
    };
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

async function waitForDevExpressCallbacks(page: any, timeout = 8000): Promise<void> {
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

function classifyConfidence(reason: string | null): "HIGH" | "MEDIUM" | "LOW" | "NONE" {
  if (!reason) return "NONE";
  if (reason === "variant-id") return "HIGH";
  if (reason === "article+package+multiple") return "HIGH";
  if (reason === "article+package") return "HIGH";
  if (reason === "article+multiple") return "HIGH";
  if (reason === "package+multiple+suffix") return "HIGH";
  if (reason === "package+suffix" || reason === "multiple+suffix") return "MEDIUM";
  if (reason === "article") return "MEDIUM";
  if (reason === "single-row") return "MEDIUM";
  return "LOW";
}

async function dumpVariantDropdowns() {
  logger.info("╔══════════════════════════════════════════════════════════════╗");
  logger.info("║    DUMP VARIANT DROPDOWN ELEMENTS - ANALISI COMPLETA       ║");
  logger.info("╚══════════════════════════════════════════════════════════════╝");

  await fs.mkdir(DUMP_DIR, { recursive: true });

  const productDb = new ProductDatabase();
  let bot: ArchibaldBot | null = null;
  const results: VariantAnalysis[] = [];

  try {
    // ════════════════════════════════════════════════════════════════
    // FASE 0: Database analysis (offline)
    // ════════════════════════════════════════════════════════════════
    logger.info("\n📊 FASE 0: Analisi database articoli");
    logger.info("─".repeat(60));

    for (const testArticle of TEST_ARTICLES) {
      const dbVariants = productDb.getProductVariants(testArticle.articleName);
      logger.info(`\n  📦 ${testArticle.articleName} - ${testArticle.description}`);
      logger.info(`     Varianti nel DB: ${dbVariants.length}`);

      for (const v of dbVariants) {
        const suffix = v.id.substring(v.id.length - 2);
        logger.info(
          `     ├─ ID: ${v.id} | suffix: "${suffix}" | pkg: ${v.packageContent} | mult: ${v.multipleQty} | min: ${v.minQty} | max: ${v.maxQty}`,
        );
      }

      // Test selectPackageVariant per ogni quantità
      logger.info(`     └─ Test selectPackageVariant:`);
      for (const qty of testArticle.testQuantities) {
        const selected = productDb.selectPackageVariant(
          testArticle.articleName,
          qty,
        );
        if (selected) {
          const suffix = selected.id.substring(selected.id.length - 2);
          logger.info(
            `        qty=${qty} → ID: ${selected.id} (suffix="${suffix}", pkg=${selected.packageContent}, mult=${selected.multipleQty})`,
          );
        } else {
          logger.warn(`        qty=${qty} → NESSUNA VARIANTE TROVATA!`);
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // FASE 1: Login e navigazione (segue flusso createOrder del bot)
    // ════════════════════════════════════════════════════════════════
    logger.info("\n\n🌐 FASE 1: Login e navigazione");
    logger.info("─".repeat(60));

    const CUSTOMER_NAME = "Fresis Soc Cooperativa";

    // Usa il bot con il flusso standard createOrder per arrivare
    // alla griglia articoli con il cliente selezionato.
    // Sfruttiamo createOrder con un ordine fittizio che interrompiamo
    // prima dell'invio, oppure replichiamo manualmente i passi del bot.

    bot = new ArchibaldBot();
    await bot.initialize();
    await (bot as any).login();
    const page = (bot as any).page!;
    logger.info("  ✅ Bot inizializzato e login completato");

    // ── STEP 1 (da createOrder): Navigate to orders list ──
    const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
    await page.goto(ordersUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForFunction(
      () => {
        const elements = Array.from(document.querySelectorAll("span, button, a"));
        return elements.some(
          (el) => el.textContent?.trim().toLowerCase() === "nuovo",
        );
      },
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 1000));
    logger.info("  ✅ Lista ordini caricata");

    // ── STEP 2 (da createOrder): Click "Nuovo" ──
    const clicked = await (bot as any).clickElementByText("Nuovo", {
      exact: true,
      selectors: ["button", "a", "span"],
    });
    if (!clicked) throw new Error('Button "Nuovo" not found');

    await page.waitForFunction(
      () => window.location.href.includes("SALESTABLE_DetailView"),
      { timeout: 15000 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 500));
    logger.info("  ✅ Form nuovo ordine aperto");

    await page.screenshot({
      path: path.join(DUMP_DIR, "00-form-vuoto.png"),
      fullPage: true,
    });

    // ── STEP 2.5 (da createOrder): Discover SALESLINES grid ──
    logger.info("\n🔍 FASE 2: Discovery griglia e selezione cliente");
    logger.info("─".repeat(60));

    await (bot as any).discoverSalesLinesGrid();
    logger.info(`  Grid SALESLINES: ${(bot as any).salesLinesGridName || "non trovata"}`);

    // ── STEP 3 (da createOrder): Select customer via dropdown ──
    // Phase 1: Find customer field and dropdown button
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

    if (!fieldInfo) throw new Error("Customer input field not found");
    if (!fieldInfo.btnSelector) throw new Error("Customer dropdown button not found");

    const customerBaseId = fieldInfo.baseId;
    logger.info(`  Customer field: ${customerBaseId}`);

    // Phase 2: Click dropdown button to open it
    await page.click(fieldInfo.btnSelector);
    logger.info("  ✅ Dropdown cliente aperto");

    // Phase 3: Wait for search input inside dropdown, paste customer name, Enter
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
        if (setter) {
          setter.call(input, value);
        } else {
          input.value = value;
        }
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
    logger.info(`  ✅ Nome cliente "${CUSTOMER_NAME}" inserito nel search box`);

    // Phase 4: Wait for filtered rows (callback-aware, come il bot)
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
                ) {
                  inCallback = true;
                }
                if (typeof c?.GetGridView === "function") {
                  const gv = c.GetGridView();
                  if (
                    gv &&
                    typeof gv.InCallback === "function" &&
                    gv.InCallback()
                  ) {
                    inCallback = true;
                  }
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
    logger.info("  ✅ Righe filtrate apparse");

    // Phase 5: Click matching customer row (come il bot)
    const selectionResult = await page.evaluate(
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
        if (!container) {
          return { clicked: false, reason: "no-container", rowsCount: 0 };
        }

        const rows = Array.from(
          container.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);

        if (rows.length === 1) {
          const target =
            rows[0].querySelector("td") || (rows[0] as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "single-row", rowsCount: 1 };
        }

        const queryLower = customerName.trim().toLowerCase();
        for (let i = 0; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll("td"));
          const cellTexts = cells.map((c) => c.textContent?.trim() || "");
          const hasExact = cellTexts.some(
            (text) => text.toLowerCase() === queryLower,
          );
          if (hasExact) {
            const target = cells[0] || (rows[i] as HTMLElement);
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return { clicked: true, reason: "exact", rowsCount: rows.length };
          }
        }

        // Fallback: contains
        for (let i = 0; i < rows.length; i++) {
          const combined = rows[i].textContent?.toLowerCase() || "";
          if (combined.includes(queryLower)) {
            const target =
              rows[i].querySelector("td") || (rows[i] as HTMLElement);
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return { clicked: true, reason: "contains", rowsCount: rows.length };
          }
        }

        return { clicked: false, reason: "no-match", rowsCount: rows.length };
      },
      customerBaseId,
      CUSTOMER_NAME,
    );

    if (!selectionResult.clicked) {
      throw new Error(
        `Nessun cliente trovato per: ${CUSTOMER_NAME} (reason: ${selectionResult.reason}, rows: ${selectionResult.rowsCount})`,
      );
    }
    logger.info(`  ✅ Cliente selezionato (reason: ${selectionResult.reason})`);

    // Phase 6: Wait for dropdown to close
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

    // Phase 7: Wait for grid "New" button to appear (grid ready)
    try {
      await page.waitForFunction(
        () => {
          const addNewLinks = Array.from(
            document.querySelectorAll('a[data-args*="AddNew"]'),
          ).filter((el) => (el as HTMLElement).offsetParent !== null);
          if (addNewLinks.length > 0) return true;
          const newImages = Array.from(
            document.querySelectorAll(
              'img[title="New"][src*="Action_Inline_New"]',
            ),
          ).filter((el) => (el as HTMLElement).offsetParent !== null);
          return newImages.length > 0;
        },
        { timeout: 6000, polling: 100 },
      );
      logger.info('  ✅ Griglia articoli pronta ("New" visibile)');
    } catch {
      logger.warn('  ⚠️ "New" button non visibile, procedo comunque');
    }

    await page.screenshot({
      path: path.join(DUMP_DIR, "01-form-con-cliente.png"),
      fullPage: true,
    });

    // ── STEP 4 (da createOrder): AddNew row ──
    // Prova prima API DevExpress, poi fallback DOM (come il bot)
    let addNewDone = false;
    const salesLinesGridName = (bot as any).salesLinesGridName as string | null;

    if (salesLinesGridName) {
      try {
        addNewDone = await (bot as any).gridAddNewRow();
        if (addNewDone) {
          logger.info("  ✅ AddNewRow via DevExpress API");
        }
      } catch (err: any) {
        logger.warn(`  API AddNewRow failed: ${err.message}`);
      }
    }

    if (!addNewDone) {
      const gridCommandResult = await (bot as any).clickDevExpressGridCommand({
        command: "AddNew",
        baseIdHint: "SALESLINEs",
        timeout: 6000,
        label: "dump-addnew",
      });
      if (gridCommandResult.clicked) {
        addNewDone = true;
        logger.info("  ✅ AddNewRow via DOM click");
      }
    }

    if (!addNewDone) {
      throw new Error("AddNew row failed (both API and DOM)");
    }

    // Wait for editable row
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('tr[id*="editnew"]').length > 0,
        { timeout: 5000, polling: 100 },
      );
      logger.info("  ✅ Riga editabile (editnew) presente");
    } catch {
      logger.warn("  ⚠️ editnew row non rilevata, verifico input fields");
    }

    await new Promise((r) => setTimeout(r, 500));

    await page.screenshot({
      path: path.join(DUMP_DIR, "02-griglia-pronta.png"),
      fullPage: true,
    });

    // ════════════════════════════════════════════════════════════════
    // FASE 3: Test ogni articolo con INSERIMENTO REALE
    // ════════════════════════════════════════════════════════════════
    let isFirstRow = true;

    for (let artIdx = 0; artIdx < TEST_ARTICLES.length; artIdx++) {
      const testArticle = TEST_ARTICLES[artIdx];
      const dbVariants = productDb.getProductVariants(testArticle.articleName);

      logger.info(
        `\n\n${"═".repeat(60)}\n  ARTICOLO ${artIdx + 1}/${TEST_ARTICLES.length}: ${testArticle.articleName}\n  ${testArticle.description}\n${"═".repeat(60)}`,
      );

      const analysis: VariantAnalysis = {
        articleName: testArticle.articleName,
        description: testArticle.description,
        dbVariants: dbVariants.map((v) => ({
          id: v.id,
          packageContent: v.packageContent,
          multipleQty: v.multipleQty,
          minQty: v.minQty,
          maxQty: v.maxQty,
          suffix: v.id.substring(v.id.length - 2),
        })),
        dropdownPages: [],
        selectionTests: [],
      };

      let dropdownCapturedForArticle = false;
      const articleCode = testArticle.articleName;

      for (
        let qtyIdx = 0;
        qtyIdx < testArticle.testQuantities.length;
        qtyIdx++
      ) {
        const qty = testArticle.testQuantities[qtyIdx];
        const testLabel = `art${artIdx + 1}-qty${qty}`;

        logger.info(
          `\n  ── Test: qty=${qty} (${qtyIdx + 1}/${testArticle.testQuantities.length}) ──`,
        );

        // Get variant from DB
        const selectedVariant = productDb.selectPackageVariant(
          testArticle.articleName,
          qty,
        );

        if (!selectedVariant) {
          logger.warn(`  qty=${qty}: NESSUNA VARIANTE SELEZIONATA DAL DB`);
          analysis.selectionTests.push({
            quantity: qty,
            selectedVariant: null,
            algorithmResult: {
              chosenRowIndex: null,
              reason: null,
              chosenRowText: null,
              confidence: "NONE",
              allCandidateScores: [],
            },
            actualResult: {
              wasInserted: false,
              insertionError: "No variant selected from DB",
              formFieldsAfterSelect: null,
              focusedFieldAfterSelect: null,
              savedRowCells: null,
              screenshotAfterSelect: "",
              screenshotAfterSave: "",
            },
          });
          continue;
        }

        const suffix = selectedVariant.id.substring(
          selectedVariant.id.length - 2,
        );

        // ── AddNew row (skip for first row, already created in setup) ──
        if (!isFirstRow) {
          let nextAddNewDone = false;
          if (salesLinesGridName) {
            try {
              nextAddNewDone = await (bot as any).gridAddNewRow();
            } catch {}
          }
          if (!nextAddNewDone) {
            const addResult = await (bot as any).clickDevExpressGridCommand({
              command: "AddNew",
              baseIdHint: "SALESLINEs",
              timeout: 6000,
              label: `dump-addnew-${testLabel}`,
            });
            nextAddNewDone = addResult.clicked;
          }
          if (nextAddNewDone) {
            try {
              await page.waitForFunction(
                () =>
                  document.querySelectorAll('tr[id*="editnew"]').length > 0,
                { timeout: 5000, polling: 100 },
              );
            } catch {}
            await new Promise((r) => setTimeout(r, 500));
          } else {
            logger.error(`  ❌ AddNew fallito per ${testLabel}`);
            analysis.selectionTests.push({
              quantity: qty,
              selectedVariant: {
                id: selectedVariant.id,
                packageContent: selectedVariant.packageContent,
                multipleQty: selectedVariant.multipleQty,
                suffix,
              },
              algorithmResult: {
                chosenRowIndex: null,
                reason: null,
                chosenRowText: null,
                confidence: "NONE",
                allCandidateScores: [],
              },
              actualResult: {
                wasInserted: false,
                insertionError: "AddNew failed",
                formFieldsAfterSelect: null,
                focusedFieldAfterSelect: null,
                savedRowCells: null,
                screenshotAfterSelect: "",
                screenshotAfterSave: "",
              },
            });
            continue;
          }
        }
        isFirstRow = false;

        // ── Focus INVENTTABLE ──
        const focused = await focusInventtable(page);
        if (!focused) {
          logger.error(`  ❌ Focus INVENTTABLE fallito per ${testLabel}`);
          analysis.selectionTests.push({
            quantity: qty,
            selectedVariant: {
              id: selectedVariant.id,
              packageContent: selectedVariant.packageContent,
              multipleQty: selectedVariant.multipleQty,
              suffix,
            },
            algorithmResult: {
              chosenRowIndex: null,
              reason: null,
              chosenRowText: null,
              confidence: "NONE",
              allCandidateScores: [],
            },
            actualResult: {
              wasInserted: false,
              insertionError: "INVENTTABLE focus failed",
              formFieldsAfterSelect: null,
              focusedFieldAfterSelect: null,
              savedRowCells: null,
              screenshotAfterSelect: "",
              screenshotAfterSave: "",
            },
          });
          continue;
        }

        // ── Clear and type article name ──
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
        logger.info(`  ⌨️ Digitato: "${articleCode}"`);

        // ── Wait for dropdown ──
        try {
          await page.waitForSelector('tr[class*="dxgvDataRow"]', {
            timeout: 8000,
          });
        } catch {
          logger.error(`  ❌ Dropdown non apparso per "${articleCode}"`);
          await page.screenshot({
            path: path.join(
              DUMP_DIR,
              `${testLabel}-NO-DROPDOWN.png`,
            ),
            fullPage: true,
          });
          await closeDropdown(page);
          analysis.selectionTests.push({
            quantity: qty,
            selectedVariant: {
              id: selectedVariant.id,
              packageContent: selectedVariant.packageContent,
              multipleQty: selectedVariant.multipleQty,
              suffix,
            },
            algorithmResult: {
              chosenRowIndex: null,
              reason: null,
              chosenRowText: null,
              confidence: "NONE",
              allCandidateScores: [],
            },
            actualResult: {
              wasInserted: false,
              insertionError: "Dropdown did not appear",
              formFieldsAfterSelect: null,
              focusedFieldAfterSelect: null,
              savedRowCells: null,
              screenshotAfterSelect: "",
              screenshotAfterSave: "",
            },
          });
          continue;
        }

        await waitForDevExpressCallbacks(page, 5000);
        await new Promise((r) => setTimeout(r, 500));

        // ── Capture dropdown snapshot ──
        const snapshot = await captureDropdownSnapshot(page);
        if (!dropdownCapturedForArticle) {
          analysis.dropdownPages.push(snapshot);
          dropdownCapturedForArticle = true;

          // Screenshot and log details (first time per article)
          await page.screenshot({
            path: path.join(
              DUMP_DIR,
              `${String(artIdx + 1).padStart(2, "0")}-${articleCode}-dropdown.png`,
            ),
            fullPage: true,
          });

          logger.info(
            `  ┌─ Container: ${snapshot.containerId || "N/A"}`,
          );
          logger.info(
            `  ├─ Dimensioni: ${snapshot.containerDimensions ? `${snapshot.containerDimensions.width}×${snapshot.containerDimensions.height}px` : "N/A"}`,
          );
          logger.info(
            `  ├─ Headers: [${snapshot.headerTexts.join(" | ")}]`,
          );
          logger.info(`  ├─ Righe visibili: ${snapshot.rowsCount}`);
          logger.info(
            `  ├─ Paginazione: next=${snapshot.hasNextPage} prev=${snapshot.hasPrevPage}`,
          );
          for (const row of snapshot.rows) {
            const cellStr = row.cellTexts
              .map((t, i) => {
                const detail = row.cellDetails[i];
                const alignMark = detail?.align === "right" ? "→" : "←";
                return `${alignMark}${t}`;
              })
              .join(" │ ");
            logger.info(
              `  │  Row[${row.index}] ${row.rowId || "no-id"}: ${cellStr}`,
            );
          }
          logger.info(`  └─ Righe totali: ${snapshot.rowsCount}`);
        }

        // ── Run variant-selection algorithm ──
        const allDropdownRows: VariantRowSnapshot[] = snapshot.rows.map(
          (row, idx) => ({
            index: idx,
            cellTexts: row.cellTexts,
            rowId: row.rowId,
          }),
        );
        const headerTexts = snapshot.headerTexts;
        const headerIndices = computeVariantHeaderIndices(headerTexts);
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
        const confidence = classifyConfidence(reason);

        const allScores = candidates.map((c) => ({
          rowIndex: c.index,
          rowText: c.rowText,
          fullIdMatch: c.fullIdMatch,
          articleNameMatch: c.articleNameMatch,
          suffixMatch: c.suffixMatch,
          packageMatch: c.packageMatch,
          multipleMatch: c.multipleMatch,
        }));

        const icon =
          confidence === "HIGH"
            ? "✅"
            : confidence === "MEDIUM"
              ? "⚠️"
              : confidence === "LOW"
                ? "🔴"
                : "❌";

        logger.info(
          `\n  ${icon} qty=${qty} → Variante DB: ${selectedVariant.id} (suffix="${suffix}", pkg=${selectedVariant.packageContent}, mult=${selectedVariant.multipleQty})`,
        );
        logger.info(
          `     Dropdown match: row[${chosen?.index ?? "N/A"}] reason="${reason}" confidence=${confidence}`,
        );
        if (chosen) {
          logger.info(`     Row text: "${chosen.rowText}"`);
        }
        for (const c of allScores) {
          const flags = [
            c.fullIdMatch ? "ID" : "",
            c.suffixMatch ? "SUF" : "",
            c.packageMatch ? "PKG" : "",
            c.multipleMatch ? "MUL" : "",
          ]
            .filter(Boolean)
            .join("+");
          const marker =
            c.rowIndex === (chosen?.index ?? -1) ? " ← SCELTO" : "";
          logger.info(
            `       row[${c.rowIndex}]: [${flags || "NESSUN MATCH"}] "${c.rowText}"${marker}`,
          );
        }

        // ── INSERIMENTO REALE: Navigate to row and select variant ──
        let actualResult: (typeof analysis.selectionTests)[number]["actualResult"];

        if (!chosen) {
          logger.warn(
            `  ⚠️ Nessun match trovato - chiudo dropdown senza inserire`,
          );
          await closeDropdown(page);
          actualResult = {
            wasInserted: false,
            insertionError: "No matching row found by algorithm",
            formFieldsAfterSelect: null,
            focusedFieldAfterSelect: null,
            savedRowCells: null,
            screenshotAfterSelect: "",
            screenshotAfterSave: "",
          };
        } else {
          try {
            // Phase A: Get current keyboard state (focused row index)
            const keyboardState = await page.evaluate(
              (containerId: string | null) => {
                let activeContainer: Element | null = null;
                if (containerId) {
                  const byId = document.getElementById(containerId);
                  if (byId) {
                    const rect = (
                      byId as HTMLElement
                    ).getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      activeContainer = byId;
                    }
                  }
                }
                if (!activeContainer) {
                  const containers = Array.from(
                    document.querySelectorAll('[id*="_DDD"]'),
                  ).filter((node) => {
                    const el = node as HTMLElement;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                  });
                  activeContainer =
                    containers.find((c) =>
                      c.querySelector('tr[class*="dxgvDataRow"]'),
                    ) || null;
                }
                const rowsRoot = activeContainer || document;
                const rows = Array.from(
                  rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
                ).filter((r) => {
                  const el = r as HTMLElement;
                  return el.offsetParent !== null;
                });
                const focusedIndex = rows.findIndex((row) => {
                  const cls = (row as HTMLElement).className || "";
                  return (
                    cls.includes("dxgvFocusedRow") ||
                    cls.includes("dxgvSelectedRow")
                  );
                });
                return { rowsCount: rows.length, focusedIndex };
              },
              snapshot.containerId,
            );

            const rowsCount = keyboardState.rowsCount;
            const focusedIndex = keyboardState.focusedIndex;
            const targetIndex = chosen.index;

            logger.info(
              `  🎯 Navigazione: target=${targetIndex}, focused=${focusedIndex}, rows=${rowsCount}`,
            );

            // Phase B: Navigate with arrow keys to the target row
            let delta =
              focusedIndex >= 0
                ? targetIndex - focusedIndex
                : targetIndex + 1;
            const direction: "ArrowDown" | "ArrowUp" =
              delta >= 0 ? "ArrowDown" : "ArrowUp";
            delta = Math.abs(delta);

            const maxSteps = Math.min(delta, rowsCount + 2);
            for (let step = 0; step < maxSteps; step++) {
              await page.keyboard.press(direction);
              await new Promise((r) => setTimeout(r, 30));
            }

            logger.info(
              `  ⬇️ Premuto ${direction} x${maxSteps} per raggiungere row[${targetIndex}]`,
            );

            // Phase C: Tab to select variant and move to quantity field
            await page.keyboard.press("Tab");
            logger.info(
              `  ↹ Tab premuto - variante selezionata, focus su quantità`,
            );

            // Phase D: Wait for DevExpress callbacks to settle
            await waitForDevExpressCallbacks(page, 8000);
            logger.info(`  ⏳ Callbacks completati`);

            // Phase E: Capture form state AFTER variant selection
            const formState = await captureEditRowState(page);
            const screenshotAfterSelect = path.join(
              DUMP_DIR,
              `${testLabel}-after-select.png`,
            );
            await page.screenshot({
              path: screenshotAfterSelect,
              fullPage: true,
            });

            if (formState) {
              logger.info(`  📋 Stato form dopo selezione variante:`);
              for (const [key, val] of Object.entries(formState.fields)) {
                if (val) {
                  logger.info(`     ${key} = "${val}"`);
                }
              }
              logger.info(
                `     Focus su: ${formState.focusedId} = "${formState.focusedValue}"`,
              );
            }

            // Phase F: Type quantity
            const qtyFormatted = qty.toString().replace(".", ",");
            const currentQtyValue = await page.evaluate(() => {
              const input = document.activeElement as HTMLInputElement;
              return {
                value: input?.value || "",
                id: input?.id || "",
                tag: input?.tagName || "",
              };
            });

            logger.info(
              `  📊 Campo quantità: id="${currentQtyValue.id}" value="${currentQtyValue.value}" → target=${qty}`,
            );

            const qtyNum = Number.parseFloat(
              currentQtyValue.value.replace(",", "."),
            );
            if (
              !Number.isFinite(qtyNum) ||
              Math.abs(qtyNum - qty) >= 0.01
            ) {
              await page.evaluate(() => {
                const input =
                  document.activeElement as HTMLInputElement;
                if (input?.select) input.select();
              });
              await page.keyboard.type(qtyFormatted, { delay: 30 });
              await waitForDevExpressCallbacks(page, 5000);

              const verifyQty = await page.evaluate(() => {
                const input =
                  document.activeElement as HTMLInputElement;
                return input?.value || "";
              });
              logger.info(
                `  ✏️ Quantità digitata: "${verifyQty}" (target: ${qty})`,
              );
            } else {
              logger.info(
                `  ⚡ Quantità già corretta: ${currentQtyValue.value}`,
              );
            }

            // Phase G: Save with UpdateEdit
            logger.info(`  💾 Salvataggio riga con UpdateEdit...`);
            let updateDone = false;

            const updateResult =
              await (bot as any).clickDevExpressGridCommand({
                command: "UpdateEdit",
                baseIdHint: "SALESLINEs",
                timeout: 7000,
                label: `dump-update-${testLabel}`,
              });

            if (updateResult.clicked) {
              updateDone = true;
              logger.info("  ✅ UpdateEdit via DOM click");
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
                label: `dump-saved-${testLabel}`,
              });
            }

            if (!updateDone && salesLinesGridName) {
              try {
                updateDone = await (bot as any).gridUpdateEdit();
                if (updateDone) {
                  logger.info("  ✅ UpdateEdit via DevExpress API");
                }
              } catch (err: any) {
                logger.warn(
                  `  UpdateEdit API failed: ${err.message}`,
                );
              }
            }

            if (!updateDone) {
              logger.error(
                `  ❌ UpdateEdit fallito per ${testLabel}`,
              );
            }

            await new Promise((r) => setTimeout(r, 500));

            // Phase H: Capture saved row from grid
            const screenshotAfterSave = path.join(
              DUMP_DIR,
              `${testLabel}-after-save.png`,
            );
            await page.screenshot({
              path: screenshotAfterSave,
              fullPage: true,
            });

            const gridRows = await captureGridDataRows(page);
            const lastRow =
              gridRows.length > 0
                ? gridRows[gridRows.length - 1]
                : null;

            if (lastRow) {
              logger.info(
                `  📋 Ultima riga griglia (${gridRows.length} righe totali):`,
              );
              logger.info(
                `     Celle: [${lastRow.join(" | ")}]`,
              );
            }

            actualResult = {
              wasInserted: updateDone,
              formFieldsAfterSelect: formState?.fields || null,
              focusedFieldAfterSelect: formState
                ? {
                    id: formState.focusedId,
                    value: formState.focusedValue,
                  }
                : null,
              savedRowCells: lastRow,
              screenshotAfterSelect,
              screenshotAfterSave,
            };

            logger.info(
              `  ${updateDone ? "✅" : "❌"} Inserimento ${updateDone ? "COMPLETATO" : "FALLITO"} per qty=${qty}`,
            );
          } catch (err: any) {
            logger.error(
              `  ❌ Errore durante inserimento ${testLabel}: ${err.message}`,
            );
            await page.screenshot({
              path: path.join(
                DUMP_DIR,
                `${testLabel}-ERROR.png`,
              ),
              fullPage: true,
            });

            // Try to recover: close dropdown + cancel edit
            await closeDropdown(page);
            try {
              const cancelClicked = await page.evaluate(() => {
                const buttons = Array.from(
                  document.querySelectorAll(
                    'a[data-args*="CancelEdit"]',
                  ),
                );
                for (const btn of buttons) {
                  const el = btn as HTMLElement;
                  if (el.offsetParent !== null) {
                    el.click();
                    return true;
                  }
                }
                return false;
              });
              if (cancelClicked) {
                await (bot as any).waitForDevExpressIdle({
                  timeout: 5000,
                  label: `dump-cancel-error-${testLabel}`,
                });
              }
            } catch {}

            actualResult = {
              wasInserted: false,
              insertionError: err.message,
              formFieldsAfterSelect: null,
              focusedFieldAfterSelect: null,
              savedRowCells: null,
              screenshotAfterSelect: "",
              screenshotAfterSave: "",
            };
          }
        }

        analysis.selectionTests.push({
          quantity: qty,
          selectedVariant: {
            id: selectedVariant.id,
            packageContent: selectedVariant.packageContent,
            multipleQty: selectedVariant.multipleQty,
            suffix,
          },
          algorithmResult: {
            chosenRowIndex: chosen?.index ?? null,
            reason,
            chosenRowText: chosen?.rowText ?? null,
            confidence,
            allCandidateScores: allScores,
          },
          actualResult,
        });
      }

      results.push(analysis);
    }

    // ════════════════════════════════════════════════════════════════
    // FASE 4: Riepilogo finale
    // ════════════════════════════════════════════════════════════════
    logger.info("\n\n" + "═".repeat(60));
    logger.info("  RIEPILOGO FINALE");
    logger.info("═".repeat(60));

    let totalTests = 0;
    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;
    let noMatch = 0;

    for (const result of results) {
      logger.info(`\n  📦 ${result.articleName}`);
      logger.info(`     DB varianti: ${result.dbVariants.length}`);
      logger.info(
        `     Dropdown pagine: ${result.dropdownPages.length}`,
      );
      logger.info(
        `     Dropdown righe totali: ${result.dropdownPages.reduce((s, p) => s + p.rowsCount, 0)}`,
      );

      for (const test of result.selectionTests) {
        totalTests++;
        const c = test.algorithmResult.confidence;
        if (c === "HIGH") highConfidence++;
        else if (c === "MEDIUM") mediumConfidence++;
        else if (c === "LOW") lowConfidence++;
        else noMatch++;

        const inserted = test.actualResult?.wasInserted ? "INSERITO" : "NON INSERITO";
        const icon =
          c === "HIGH"
            ? "✅"
            : c === "MEDIUM"
              ? "⚠️"
              : c === "LOW"
                ? "🔴"
                : "❌";
        logger.info(
          `     ${icon} qty=${test.quantity}: ${test.algorithmResult.reason || "NO MATCH"} (${c}) → ${inserted}`,
        );
        if (test.actualResult?.savedRowCells) {
          logger.info(
            `        Riga salvata: [${test.actualResult.savedRowCells.join(" | ")}]`,
          );
        }
        if (test.actualResult?.insertionError) {
          logger.info(
            `        Errore: ${test.actualResult.insertionError}`,
          );
        }
      }
    }

    let totalInserted = 0;
    let totalFailed = 0;
    for (const result of results) {
      for (const test of result.selectionTests) {
        if (test.actualResult?.wasInserted) totalInserted++;
        else totalFailed++;
      }
    }

    logger.info(`\n  ┌─────────────────────────────────────────┐`);
    logger.info(`  │ Test totali:       ${String(totalTests).padStart(3)}                  │`);
    logger.info(`  │ HIGH confidence:    ${String(highConfidence).padStart(3)} ✅               │`);
    logger.info(`  │ MEDIUM confidence:  ${String(mediumConfidence).padStart(3)} ⚠️               │`);
    logger.info(`  │ LOW confidence:     ${String(lowConfidence).padStart(3)} 🔴               │`);
    logger.info(`  │ NO MATCH:           ${String(noMatch).padStart(3)} ❌               │`);
    logger.info(`  │─────────────────────────────────────────│`);
    logger.info(`  │ Inseriti con successo: ${String(totalInserted).padStart(3)} 💾            │`);
    logger.info(`  │ Inserimenti falliti:   ${String(totalFailed).padStart(3)} ⛔            │`);
    logger.info(`  └─────────────────────────────────────────┘`);

    // Save full results as JSON
    const outputPath = path.join(DUMP_DIR, "variant-analysis-results.json");
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    logger.info(`\n  📁 Risultati salvati in: ${outputPath}`);

    // Save human-readable report
    const reportPath = path.join(DUMP_DIR, "variant-analysis-report.txt");
    const report = generateTextReport(results);
    await fs.writeFile(reportPath, report);
    logger.info(`  📄 Report salvato in: ${reportPath}`);

    // Final screenshot
    await page.screenshot({
      path: path.join(DUMP_DIR, "99-stato-finale.png"),
      fullPage: true,
    });

  } catch (error) {
    logger.error("Errore durante il dump:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (bot && (bot as any).page) {
      await (bot as any).page.screenshot({
        path: path.join(DUMP_DIR, "ERROR-screenshot.png"),
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

function generateTextReport(results: VariantAnalysis[]): string {
  const lines: string[] = [];
  const divider = "═".repeat(80);

  lines.push(divider);
  lines.push("  VARIANT DROPDOWN ANALYSIS REPORT");
  lines.push(`  Generato: ${new Date().toISOString()}`);
  lines.push(divider);

  for (const result of results) {
    lines.push("");
    lines.push(`ARTICOLO: ${result.articleName}`);
    lines.push(`Descrizione: ${result.description}`);
    lines.push("─".repeat(80));

    lines.push("");
    lines.push("  VARIANTI NEL DATABASE:");
    for (const v of result.dbVariants) {
      lines.push(
        `    ID: ${v.id.padEnd(15)} suffix: "${v.suffix}" | pkg: ${String(v.packageContent).padEnd(5)} | mult: ${String(v.multipleQty).padEnd(5)} | min: ${String(v.minQty).padEnd(5)} | max: ${v.maxQty}`,
      );
    }

    lines.push("");
    lines.push("  DROPDOWN DEVEXPRESS:");
    for (let p = 0; p < result.dropdownPages.length; p++) {
      const dpPage = result.dropdownPages[p];
      lines.push(`    Pagina ${p + 1}:`);
      lines.push(`      Headers: [${dpPage.headerTexts.join(" | ")}]`);
      lines.push(`      Container: ${dpPage.containerId || "N/A"}`);
      lines.push(
        `      Dimensioni: ${dpPage.containerDimensions ? `${dpPage.containerDimensions.width}x${dpPage.containerDimensions.height}` : "N/A"}`,
      );
      lines.push(`      Righe: ${dpPage.rowsCount}`);
      lines.push(`      Paginazione: next=${dpPage.hasNextPage} prev=${dpPage.hasPrevPage}`);

      for (const row of dpPage.rows) {
        const cells = row.cellTexts.join(" | ");
        lines.push(`      Row[${row.index}]: ${cells}`);

        // Cell details
        for (let ci = 0; ci < row.cellDetails.length; ci++) {
          const cd = row.cellDetails[ci];
          lines.push(
            `               cell[${ci}]: text="${cd.text}" class="${cd.className}" align=${cd.align} w=${cd.width}px`,
          );
        }
      }
    }

    lines.push("");
    lines.push("  TEST SELEZIONE VARIANTE:");
    for (const test of result.selectionTests) {
      lines.push(`    qty=${test.quantity}:`);
      if (test.selectedVariant) {
        lines.push(
          `      DB seleziona: ${test.selectedVariant.id} (suffix="${test.selectedVariant.suffix}" pkg=${test.selectedVariant.packageContent} mult=${test.selectedVariant.multipleQty})`,
        );
      } else {
        lines.push(`      DB seleziona: NESSUNA`);
      }
      lines.push(
        `      Dropdown match: row[${test.algorithmResult.chosenRowIndex ?? "N/A"}] reason="${test.algorithmResult.reason}" confidence=${test.algorithmResult.confidence}`,
      );
      if (test.algorithmResult.chosenRowText) {
        lines.push(
          `      Row text: "${test.algorithmResult.chosenRowText}"`,
        );
      }

      lines.push(`      Tutti i candidati:`);
      for (const c of test.algorithmResult.allCandidateScores) {
        const flags = [
          c.fullIdMatch ? "ID" : "",
          c.suffixMatch ? "SUF" : "",
          c.packageMatch ? "PKG" : "",
          c.multipleMatch ? "MUL" : "",
        ]
          .filter(Boolean)
          .join("+");
        const marker =
          c.rowIndex === (test.algorithmResult.chosenRowIndex ?? -1)
            ? " ← SCELTO"
            : "";
        lines.push(
          `        row[${c.rowIndex}]: [${flags || "NESSUN MATCH"}] "${c.rowText}"${marker}`,
        );
      }

      // Actual insertion result
      if (test.actualResult) {
        lines.push("");
        lines.push(
          `      INSERIMENTO REALE: ${test.actualResult.wasInserted ? "✅ INSERITO" : "❌ NON INSERITO"}`,
        );
        if (test.actualResult.insertionError) {
          lines.push(
            `      Errore: ${test.actualResult.insertionError}`,
          );
        }
        if (test.actualResult.formFieldsAfterSelect) {
          lines.push(`      Campi form dopo selezione variante:`);
          for (const [key, val] of Object.entries(
            test.actualResult.formFieldsAfterSelect,
          )) {
            if (val) {
              lines.push(`        ${key} = "${val}"`);
            }
          }
        }
        if (test.actualResult.focusedFieldAfterSelect) {
          lines.push(
            `      Campo focused: ${test.actualResult.focusedFieldAfterSelect.id} = "${test.actualResult.focusedFieldAfterSelect.value}"`,
          );
        }
        if (test.actualResult.savedRowCells) {
          lines.push(
            `      Riga salvata in griglia: [${test.actualResult.savedRowCells.join(" | ")}]`,
          );
        }
      }
    }
  }

  lines.push("");
  lines.push(divider);
  lines.push("  FINE REPORT");
  lines.push(divider);

  return lines.join("\n");
}

dumpVariantDropdowns().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
