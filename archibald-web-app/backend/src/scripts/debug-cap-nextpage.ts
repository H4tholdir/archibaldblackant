#!/usr/bin/env tsx
/**
 * Debug: clean test of NextPage() to see if rows actually change.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugCapNextPage() {
  logger.info("=== DEBUG CAP NEXTPAGE ===");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page;

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

    await page.evaluate((regex: string) => {
      const allEls = Array.from(document.querySelectorAll("td, img, button, a, div"));
      const btn = allEls.find((el: Element) => new RegExp(regex).test(el.id));
      if (btn) {
        (btn as HTMLElement).scrollIntoView({ block: "center" });
        (btn as HTMLElement).click();
      }
    }, "xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0");

    await page.waitForFunction(
      () => {
        const dialogs = Array.from(
          document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, [id*="_PW"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        });
        return dialogs.length > 0;
      },
      { timeout: 10000, polling: 100 },
    );

    const iframeHandle = await page.$("iframe[src*='FindPopup']");
    const frame = await iframeHandle!.contentFrame();
    if (!frame) throw new Error("Could not access iframe");

    await frame.waitForFunction(
      () => {
        const w = window as any;
        return document.readyState === "complete" && !!w.ASPxClientControl?.GetControlCollection;
      },
      { timeout: 15000, polling: 200 },
    );
    await new Promise((r) => setTimeout(r, 1000));

    const gridName = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      let name = "";
      if (col && typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          if (typeof c?.GetPageCount === "function") name = c.name || "";
        });
      }
      return name;
    });
    logger.info("Grid:", { gridName });

    // Get all rows from page 0
    const getRows = async () => {
      return frame!.evaluate(() => {
        return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
          .filter((r) => (r as HTMLElement).offsetParent !== null)
          .map((r) => {
            const cells = Array.from(r.querySelectorAll("td"));
            return cells.map((c) => c.textContent?.trim() || "");
          });
      });
    };

    const page0Rows = await getRows();
    logger.info(`Page 0: ${page0Rows.length} rows`);
    logger.info("First 3 rows:", { rows: page0Rows.slice(0, 3).map((r) => r.join("|")) });
    logger.info("Last row:", { row: page0Rows[page0Rows.length - 1]?.join("|") || "N/A" });

    // Call NextPage() and wait for callback to complete
    logger.info("Calling NextPage()...");
    const prevFirstRow = page0Rows[0]?.join("|") || "";

    await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (grid) grid.NextPage();
    }, gridName);

    // Wait for InCallback to complete
    try {
      await frame.waitForFunction(
        (name: string) => {
          const w = window as any;
          const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
          return grid && !grid.InCallback?.();
        },
        { timeout: 10000, polling: 100 },
        gridName,
      );
      logger.info("Callback completed");
    } catch {
      logger.warn("Timeout waiting for callback completion");
    }

    await new Promise((r) => setTimeout(r, 500));

    const page1Rows = await getRows();
    const page1Info = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      return { pageIndex: grid?.GetPageIndex?.(), inCallback: grid?.InCallback?.() };
    }, gridName);

    logger.info(`Page 1: ${page1Rows.length} rows`, page1Info);
    logger.info("First 3 rows:", { rows: page1Rows.slice(0, 3).map((r) => r.join("|")) });

    const changed = page1Rows[0]?.join("|") !== prevFirstRow;
    logger.info("ROWS CHANGED?", { changed });

    if (changed) {
      // Success! Try one more page
      logger.info("Calling NextPage() again...");
      await frame.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.NextPage();
      }, gridName);

      try {
        await frame.waitForFunction(
          (name: string) => {
            const w = window as any;
            const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
            return grid && !grid.InCallback?.();
          },
          { timeout: 10000, polling: 100 },
          gridName,
        );
      } catch {
        logger.warn("Timeout on second NextPage");
      }

      await new Promise((r) => setTimeout(r, 500));

      const page2Rows = await getRows();
      const page2Info = await frame.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        return { pageIndex: grid?.GetPageIndex?.() };
      }, gridName);

      logger.info(`Page 2: ${page2Rows.length} rows`, page2Info);
      logger.info("First 3 rows:", { rows: page2Rows.slice(0, 3).map((r) => r.join("|")) });

      const changed2 = page2Rows[0]?.join("|") !== page1Rows[0]?.join("|");
      logger.info("ROWS CHANGED AGAIN?", { changed: changed2 });
    }

  } catch (error) {
    logger.error("DEBUG FAILED", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await bot.close();
  }

  process.exit(0);
}

debugCapNextPage();
