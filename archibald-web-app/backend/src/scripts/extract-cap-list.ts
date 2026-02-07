#!/usr/bin/env tsx
/**
 * Estrae la lista completa dei CAP (codici postali) gestiti da Archibald.
 *
 * La griglia DevExpress usa "endless paging": NextPage() aggiunge nuove
 * righe al DOM senza rimuovere le precedenti. Lo script chiama NextPage()
 * ripetutamente e dopo ogni callback estrae solo le righe nuove.
 *
 * Output: logs/archibald-cap-list.json
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import * as fs from "fs";
import * as path from "path";

type CapEntry = {
  cap: string;
  citta: string;
  stato: string;
  contea: string;
  paese: string;
};

async function extractCapList() {
  logger.info("=== EXTRACT CAP LIST ===");

  const bot = new ArchibaldBot();
  let exitCode = 0;
  const allCaps: CapEntry[] = [];

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

    // Open CAP lookup dialog
    logger.info("Opening CAP lookup dialog...");
    await page.evaluate((regex: string) => {
      const allEls = Array.from(
        document.querySelectorAll("td, img, button, a, div"),
      );
      const btn = allEls.find((el: Element) => new RegExp(regex).test(el.id));
      if (btn) {
        (btn as HTMLElement).scrollIntoView({ block: "center" });
        (btn as HTMLElement).click();
      }
    }, "xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0");

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

    // Extract initial page (page 0)
    let extractedRowCount = 0;

    const extractNewRows = async (): Promise<number> => {
      const rows = await frame!.evaluate((startIdx: number) => {
        const dataRows = Array.from(
          document.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);

        // Only extract rows from startIdx onwards (new rows)
        return dataRows.slice(startIdx).map((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          return cells.map(
            (c) => c.textContent?.trim() || c.getAttribute("title")?.trim() || "",
          );
        });
      }, extractedRowCount);

      for (const row of rows) {
        if (row.length >= 5) {
          allCaps.push({
            cap: row[0] || "",
            citta: row[1] || "",
            stato: row[2] || "",
            contea: row[3] || "",
            paese: row[4] || "",
          });
        }
      }

      extractedRowCount += rows.length;
      return rows.length;
    };

    // Extract page 0
    const page0Count = await extractNewRows();
    logger.info(`Page 1/${gridInfo.pageCount} — ${page0Count} rows extracted`);

    // Paginate using NextPage() — the grid uses endless paging
    for (let pageIdx = 1; pageIdx < gridInfo.pageCount; pageIdx++) {
      // Call NextPage()
      await frame.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.NextPage();
      }, gridInfo.gridName);

      // Wait for callback to complete
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

      // Small delay for DOM update
      await new Promise((r) => setTimeout(r, 50));

      // Extract only new rows
      const newRowCount = await extractNewRows();

      if ((pageIdx + 1) % 50 === 0 || pageIdx === gridInfo.pageCount - 1) {
        logger.info(
          `Page ${pageIdx + 1}/${gridInfo.pageCount} — ${newRowCount} new rows — total: ${allCaps.length}`,
        );
      }

      // If no new rows, the grid might have stopped loading
      if (newRowCount === 0) {
        logger.warn(`Page ${pageIdx + 1}: 0 new rows, might have reached end`);
        // Try one more time with longer wait
        await new Promise((r) => setTimeout(r, 500));
        const retryCount = await extractNewRows();
        if (retryCount === 0 && pageIdx > 5) {
          logger.warn("No new rows after retry, stopping extraction");
          break;
        }
      }
    }

    logger.info(`Extraction complete: ${allCaps.length} CAP entries from ${extractedRowCount} DOM rows`);

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
    if (allCaps.length > 0) {
      const outDir = path.resolve(process.cwd(), "logs");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const outPath = path.join(outDir, "archibald-cap-list.json");
      fs.writeFileSync(outPath, JSON.stringify(allCaps, null, 2));
      logger.info(`Saved ${allCaps.length} entries to ${outPath}`);

      const uniqueCaps = new Set(allCaps.map((c) => c.cap));
      const countries = new Set(allCaps.map((c) => c.paese));
      const italianCaps = allCaps.filter((c) => c.paese === "IT");
      logger.info("Stats:", {
        totalEntries: allCaps.length,
        uniqueCapCodes: uniqueCaps.size,
        countries: Array.from(countries).sort(),
        italianEntries: italianCaps.length,
      });
    }

    logger.info("Closing browser...");
    await bot.close();
  }

  process.exit(exitCode);
}

extractCapList();
