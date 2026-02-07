#!/usr/bin/env tsx
/**
 * Debug script 2: tests GotoPage callback behavior and scroll structure.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugCapPager2() {
  logger.info("=== DEBUG CAP PAGER 2 ===");

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

    // Click CAP find button
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

    const iframeInfo = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll("iframe")).filter(
        (f) => (f as HTMLElement).offsetParent !== null && f.src?.includes("FindPopup"),
      );
      return iframes.length > 0 ? { id: iframes[0].id, src: iframes[0].src } : null;
    });

    if (!iframeInfo) throw new Error("Iframe not found");

    const iframeHandle = await page.$(`#${iframeInfo.id}`);
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

    // Get grid info
    const gridName = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      let name = "";
      if (col && typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          if (typeof c?.GetPageCount === "function") {
            name = c.name || c.GetName?.() || "";
          }
        });
      }
      return name;
    });

    logger.info("Grid name:", { gridName });

    // Dump first 3 data rows before any navigation
    const rowsBefore = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter((r) => (r as HTMLElement).offsetParent !== null)
        .slice(0, 3)
        .map((r) => r.textContent?.trim().substring(0, 80) || "");
    });
    logger.info("Rows BEFORE navigation:", { rows: rowsBefore });

    // TEST 1: Check if GotoPage triggers InCallback
    logger.info("TEST 1: GotoPage(1) callback check...");
    const test1 = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      const beforePageIdx = grid.GetPageIndex?.();
      const beforeInCallback = grid.InCallback?.();
      grid.GotoPage(1);
      const afterInCallback = grid.InCallback?.();
      const afterPageIdx = grid.GetPageIndex?.();

      return {
        beforePageIdx,
        beforeInCallback,
        afterInCallback, // If true, the callback was triggered
        afterPageIdx,
      };
    }, gridName);
    logger.info("TEST 1 result:", test1);

    // Wait 500ms and check again
    await new Promise((r) => setTimeout(r, 500));
    const test1b = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return {};
      return {
        inCallback500ms: grid.InCallback?.(),
        pageIndex500ms: grid.GetPageIndex?.(),
      };
    }, gridName);
    logger.info("TEST 1b (after 500ms):", test1b);

    // Wait 2s more
    await new Promise((r) => setTimeout(r, 2000));
    const test1c = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return {};
      return {
        inCallback2500ms: grid.InCallback?.(),
        pageIndex2500ms: grid.GetPageIndex?.(),
      };
    }, gridName);
    logger.info("TEST 1c (after 2500ms):", test1c);

    // Check if rows changed
    const rowsAfterGotoPage = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter((r) => (r as HTMLElement).offsetParent !== null)
        .slice(0, 3)
        .map((r) => r.textContent?.trim().substring(0, 80) || "");
    });
    logger.info("Rows AFTER GotoPage(1):", { rows: rowsAfterGotoPage });

    // TEST 2: Check scroll structure
    logger.info("TEST 2: Scroll structure...");
    const scrollInfo = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      const mainEl = grid.GetMainElement?.();
      if (!mainEl) return { error: "no main element" };

      // Find scrollable containers
      const scrollable: any[] = [];
      const walk = (el: HTMLElement, depth: number) => {
        if (depth > 5) return;
        if (
          el.scrollHeight > el.clientHeight + 5 ||
          el.style.overflow === "auto" ||
          el.style.overflow === "scroll" ||
          el.style.overflowY === "auto" ||
          el.style.overflowY === "scroll"
        ) {
          scrollable.push({
            tag: el.tagName,
            id: el.id,
            cls: (el.className || "").substring(0, 60),
            scrollH: el.scrollHeight,
            clientH: el.clientHeight,
            scrollTop: el.scrollTop,
            overflow: getComputedStyle(el).overflow,
            overflowY: getComputedStyle(el).overflowY,
          });
        }
        for (const child of Array.from(el.children)) {
          walk(child as HTMLElement, depth + 1);
        }
      };

      walk(mainEl, 0);

      return { scrollable, mainElSize: { scrollH: mainEl.scrollHeight, clientH: mainEl.clientHeight } };
    }, gridName);
    logger.info("Scroll info:", scrollInfo);

    // TEST 3: Try PerformCallback directly
    logger.info("TEST 3: PerformCallback with page command...");

    // First, get all methods containing 'callback' or 'perform'
    const callbackMethods = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return [];

      const proto = Object.getPrototypeOf(grid);
      return Object.getOwnPropertyNames(proto)
        .filter((m) => /callback|perform|pager|page/i.test(m))
        .slice(0, 30);
    }, gridName);
    logger.info("Callback/Page methods:", { methods: callbackMethods });

    // Try PerformCallback
    const test3 = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      try {
        // Try NextPage
        grid.NextPage?.();
        return { called: "NextPage", inCallback: grid.InCallback?.() };
      } catch (e: any) {
        return { error: e.message };
      }
    }, gridName);
    logger.info("TEST 3 NextPage result:", test3);

    await new Promise((r) => setTimeout(r, 3000));

    const rowsAfterNextPage = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter((r) => (r as HTMLElement).offsetParent !== null)
        .slice(0, 3)
        .map((r) => r.textContent?.trim().substring(0, 80) || "");
    });
    logger.info("Rows AFTER NextPage():", { rows: rowsAfterNextPage });

    // TEST 4: Try clicking on a row and using keyboard
    logger.info("TEST 4: Click row + keyboard PageDown...");

    // Click on first data row cell
    const clickResult = await frame.evaluate(() => {
      const firstCell = document.querySelector(
        'tr[class*="dxgvDataRow"] td',
      ) as HTMLElement | null;
      if (!firstCell) return "no cell found";
      firstCell.click();
      return "clicked: " + firstCell.textContent?.trim().substring(0, 20);
    });
    logger.info("Clicked cell:", { result: clickResult });

    await new Promise((r) => setTimeout(r, 200));

    // Send PageDown via keyboard
    await page.keyboard.press("PageDown");
    await new Promise((r) => setTimeout(r, 2000));

    const rowsAfterPageDown = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter((r) => (r as HTMLElement).offsetParent !== null)
        .slice(0, 3)
        .map((r) => r.textContent?.trim().substring(0, 80) || "");
    });
    logger.info("Rows AFTER PageDown:", { rows: rowsAfterPageDown });

    const pageIdxAfterPageDown = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      return grid ? { pageIndex: grid.GetPageIndex?.(), inCallback: grid.InCallback?.() } : {};
    }, gridName);
    logger.info("Page index after PageDown:", pageIdxAfterPageDown);

  } catch (error) {
    logger.error("DEBUG FAILED", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    await bot.close();
  }

  process.exit(0);
}

debugCapPager2();
