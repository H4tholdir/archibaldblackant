#!/usr/bin/env tsx
/**
 * Estrae la lista completa dei termini di pagamento gestiti da Archibald.
 *
 * La griglia DevExpress usa "endless paging": NextPage() aggiunge nuove
 * righe al DOM senza rimuovere le precedenti. Lo script chiama NextPage()
 * ripetutamente e dopo ogni callback estrae solo le righe nuove.
 *
 * Output: logs/archibald-payment-terms.json
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import * as fs from "fs";
import * as path from "path";

type PaymentTermEntry = Record<string, string>;

async function extractPaymentTerms() {
  logger.info("=== EXTRACT PAYMENT TERMS ===");

  const bot = new ArchibaldBot();
  let exitCode = 0;
  const allTerms: PaymentTermEntry[] = [];
  let columnHeaders: string[] = [];

  try {
    logger.info("STEP 1: Inizializzazione browser...");
    await bot.initialize();
    logger.info("STEP 1: OK");

    logger.info("STEP 2: Login...");
    await bot.login();
    logger.info("STEP 2: OK");

    const page = (bot as any).page;

    // Navigate to customer create form
    logger.info("Navigating to customer form...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });

    await (bot as any).clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    await page.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("Customer form loaded");

    // Open Payment Terms lookup dialog
    logger.info("Opening Payment Terms lookup dialog...");
    await page.evaluate((regex: string) => {
      const allEls = Array.from(
        document.querySelectorAll("td, img, button, a, div"),
      );
      const btn = allEls.find((el: Element) => new RegExp(regex).test(el.id));
      if (btn) {
        (btn as HTMLElement).scrollIntoView({ block: "center" });
        (btn as HTMLElement).click();
      }
    }, "xaf_dviPAYMTERMID_Edit_find_Edit_B0");

    await page.waitForFunction(
      () => {
        const dialogs = Array.from(
          document.querySelectorAll(
            '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, [id*="_PW"]',
          ),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        });
        return dialogs.length > 0;
      },
      { timeout: 10000, polling: 100 },
    );

    const iframeHandle = await page.$("iframe[src*='FindPopup']");
    if (!iframeHandle) throw new Error("Iframe not found");
    const frame = await iframeHandle.contentFrame();
    if (!frame) throw new Error("Could not access iframe");

    await frame.waitForFunction(
      () => {
        const w = window as any;
        return (
          document.readyState === "complete" &&
          !!w.ASPxClientControl?.GetControlCollection
        );
      },
      { timeout: 15000, polling: 200 },
    );
    await new Promise((r) => setTimeout(r, 1000));

    // Click the search magnifying glass (B1 button) to load all payment terms
    // The search bar has pattern: FindDialog_SAC_Menu_ITCNT0_xaf_a0_Ed_B1
    logger.info("Clicking search magnifying glass to load all results...");
    const searchClicked = await frame.evaluate(() => {
      // Find the magnifying glass button — has _Ed_B1 suffix and title "Filtrare"
      const btn = document.querySelector('td[id$="_Ed_B1"]') as HTMLElement;
      if (btn) {
        btn.click();
        return { clicked: true, id: btn.id };
      }
      // Fallback: find by title
      const byTitle = Array.from(document.querySelectorAll("td, img"))
        .find((el) => (el as HTMLElement).title?.includes("Filtrare"));
      if (byTitle) {
        (byTitle as HTMLElement).click();
        return { clicked: true, id: (byTitle as HTMLElement).id, method: "by-title" };
      }
      return { clicked: false };
    });
    logger.info("Search button click result:", searchClicked);

    // Wait for grid callback to complete (search loading data)
    await new Promise((r) => setTimeout(r, 1000));
    await frame.waitForFunction(
      () => {
        const w = window as any;
        const col = w.ASPxClientControl?.GetControlCollection?.();
        if (!col) return true;
        let anyCallback = false;
        if (typeof col.ForEachControl === "function") {
          col.ForEachControl((c: any) => {
            if (typeof c?.InCallback === "function" && c.InCallback()) {
              anyCallback = true;
            }
          });
        }
        return !anyCallback;
      },
      { timeout: 15000, polling: 200 },
    );
    await new Promise((r) => setTimeout(r, 500));
    logger.info("Search completed, data should be loaded");

    // Discover grid
    const gridInfo = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (!col) return null;

      let gridName = "";
      let pageCount = 0;
      let visibleRows = 0;

      if (typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          if (typeof c?.GetPageCount === "function") {
            gridName = c.name || "";
            pageCount = c.GetPageCount?.() || 0;
            visibleRows = c.GetVisibleRowsOnPage?.() || 0;
          }
        });
      }

      return { gridName, pageCount, visibleRows };
    });

    if (!gridInfo || !gridInfo.gridName) {
      throw new Error("Grid not found");
    }

    logger.info("Grid discovered", gridInfo);
    logger.info(
      `Total pages: ${gridInfo.pageCount}, rows per page: ${gridInfo.visibleRows}`,
    );

    // Discover column headers from the DXHeaderTable
    columnHeaders = await frame.evaluate(() => {
      // Look in the header table for column text
      const headerTable = document.querySelector('table[id*="DXHeaderTable"]');
      if (headerTable) {
        const cells = Array.from(headerTable.querySelectorAll("td"))
          .filter((c) => {
            const text = c.textContent?.trim() || "";
            return text.length > 0 && !text.includes("Loading");
          })
          .map((c) => c.textContent?.trim() || "");
        if (cells.length > 0) return cells;
      }
      // Fallback: look for header row
      const headerRow = document.querySelector('tr[class*="Header"]');
      if (headerRow) {
        return Array.from(headerRow.querySelectorAll("td, th"))
          .map((c) => c.textContent?.trim() || "")
          .filter((t) => t.length > 0);
      }
      return [];
    });
    logger.info("Column headers:", { columnHeaders });

    // Extract rows
    let extractedRowCount = 0;

    const extractNewRows = async (): Promise<number> => {
      const rows = await frame!.evaluate((startIdx: number) => {
        const dataRows = Array.from(
          document.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);

        return dataRows.slice(startIdx).map((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          return cells.map(
            (c) => c.textContent?.trim() || c.getAttribute("title")?.trim() || "",
          );
        });
      }, extractedRowCount);

      for (const row of rows) {
        if (row.length >= 1) {
          const entry: PaymentTermEntry = {};
          row.forEach((val, idx) => {
            const header = columnHeaders[idx] || `col${idx}`;
            entry[header] = val;
          });
          allTerms.push(entry);
        }
      }

      extractedRowCount += rows.length;
      return rows.length;
    };

    // Extract page 0
    const page0Count = await extractNewRows();
    logger.info(`Page 1/${gridInfo.pageCount} — ${page0Count} rows extracted`);

    // Paginate using NextPage()
    for (let pageIdx = 1; pageIdx < gridInfo.pageCount; pageIdx++) {
      await frame.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.NextPage();
      }, gridInfo.gridName);

      try {
        await frame.waitForFunction(
          (name: string) => {
            const w = window as any;
            const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
            return grid && !grid.InCallback?.();
          },
          { timeout: 15000, polling: 100 },
          gridInfo.gridName,
        );
      } catch {
        logger.warn(`Page ${pageIdx + 1}: timeout waiting for callback, skipping`);
        continue;
      }

      await new Promise((r) => setTimeout(r, 50));

      const newRowCount = await extractNewRows();

      if ((pageIdx + 1) % 10 === 0 || pageIdx === gridInfo.pageCount - 1) {
        logger.info(
          `Page ${pageIdx + 1}/${gridInfo.pageCount} — ${newRowCount} new rows — total: ${allTerms.length}`,
        );
      }

      if (newRowCount === 0) {
        logger.warn(`Page ${pageIdx + 1}: 0 new rows, might have reached end`);
        await new Promise((r) => setTimeout(r, 500));
        const retryCount = await extractNewRows();
        if (retryCount === 0 && pageIdx > 2) {
          logger.warn("No new rows after retry, stopping extraction");
          break;
        }
      }
    }

    logger.info(`Extraction complete: ${allTerms.length} payment term entries`);

    // Close the dialog
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));

    // Navigate away to abandon form
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
  } catch (error) {
    logger.error("EXTRACTION FAILED", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    exitCode = 1;
  } finally {
    if (allTerms.length > 0) {
      const outDir = path.resolve(process.cwd(), "logs");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const outPath = path.join(outDir, "archibald-payment-terms.json");
      fs.writeFileSync(outPath, JSON.stringify(allTerms, null, 2));
      logger.info(`Saved ${allTerms.length} entries to ${outPath}`);

      // Stats
      const firstEntry = allTerms[0];
      const keys = Object.keys(firstEntry || {});
      logger.info("Stats:", {
        totalEntries: allTerms.length,
        columns: keys,
        sampleEntry: firstEntry,
      });
    }

    logger.info("Closing browser...");
    await bot.close();
  }

  process.exit(exitCode);
}

extractPaymentTerms();
