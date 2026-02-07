#!/usr/bin/env tsx
/**
 * Debug: deep investigation into why GotoPage doesn't work.
 * Tests PerformCallback, error catching, and grid properties.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugCapGoto() {
  logger.info("=== DEBUG CAP GOTO ===");

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
          if (typeof c?.GetPageCount === "function") {
            name = c.name || "";
          }
        });
      }
      return name;
    });
    logger.info("Grid name:", { gridName });

    // Test 1: GotoPage with try-catch + check for errors
    logger.info("TEST 1: GotoPage(1) with error catching");
    const test1 = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      try {
        const result = grid.GotoPage(1);
        return {
          result: String(result),
          inCallback: grid.InCallback?.(),
          pageIndex: grid.GetPageIndex?.(),
          error: null,
        };
      } catch (e: any) {
        return { error: e.message, stack: e.stack?.substring(0, 300) };
      }
    }, gridName);
    logger.info("TEST 1 result:", test1);

    // Test 2: Check grid properties related to paging and callbacks
    logger.info("TEST 2: Grid paging properties");
    const test2 = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      const props: Record<string, any> = {};

      // Check known paging-related properties
      const keys = Object.keys(grid);
      for (const key of keys) {
        if (/pag|page|callback|allow|enabled|lock/i.test(key)) {
          const val = grid[key];
          if (typeof val !== "function" && typeof val !== "object") {
            props[key] = val;
          }
        }
      }

      // Also check prototype methods
      const proto = Object.getPrototypeOf(grid);
      const methods = Object.getOwnPropertyNames(proto).filter(
        (m) => /^(Get|Set|Is|Has|Allow|Enable|Perform|Create).*(Pag|Page|Callback|Lock)/i.test(m),
      );

      return { props, methods };
    }, gridName);
    logger.info("TEST 2 result:", test2);

    // Test 3: Try PerformCallback directly
    logger.info("TEST 3: grid.PerformCallback('PN1')");
    const test3 = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      try {
        grid.PerformCallback("PN1");
        return {
          called: true,
          inCallback: grid.InCallback?.(),
          error: null,
        };
      } catch (e: any) {
        return { error: e.message, stack: e.stack?.substring(0, 300) };
      }
    }, gridName);
    logger.info("TEST 3 result:", test3);

    // Wait and check
    await new Promise((r) => setTimeout(r, 3000));
    const test3b = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return {};
      return {
        inCallback3s: grid.InCallback?.(),
        pageIndex3s: grid.GetPageIndex?.(),
      };
    }, gridName);
    logger.info("TEST 3b (after 3s):", test3b);

    const rowsAfter3 = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
        .filter((r) => (r as HTMLElement).offsetParent !== null)
        .slice(0, 3)
        .map((r) => r.textContent?.trim().substring(0, 80) || "");
    });
    logger.info("Rows after PerformCallback:", { rows: rowsAfter3 });

    // Test 4: Intercept XHR to see if any request is made
    logger.info("TEST 4: XHR interception in iframe");
    await frame.evaluate(() => {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      (window as any).__xhrLog = [];

      XMLHttpRequest.prototype.open = function (method: string, url: string, ...args: any[]) {
        (window as any).__xhrLog.push({
          type: "open",
          method,
          url: url.substring(0, 200),
          time: Date.now(),
        });
        return origOpen.apply(this, [method, url, ...args] as any);
      };

      XMLHttpRequest.prototype.send = function (body?: string) {
        (window as any).__xhrLog.push({
          type: "send",
          bodyLen: body?.length || 0,
          bodyPreview: body?.substring(0, 200) || "",
          time: Date.now(),
        });
        return origSend.apply(this, [body] as any);
      };
    });

    // Now try GotoPage again with XHR monitoring
    logger.info("TEST 4b: GotoPage(1) with XHR monitoring");
    await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (grid) grid.GotoPage(1);
    }, gridName);

    await new Promise((r) => setTimeout(r, 2000));

    const xhrLog = await frame.evaluate(() => {
      return (window as any).__xhrLog || [];
    });
    logger.info("XHR log after GotoPage:", { entries: xhrLog });

    // Test 5: Try NextPage
    logger.info("TEST 5: grid.NextPage()");
    await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (grid) grid.NextPage?.();
    }, gridName);

    await new Promise((r) => setTimeout(r, 2000));

    const xhrLog2 = await frame.evaluate(() => {
      return (window as any).__xhrLog || [];
    });
    logger.info("XHR log after NextPage:", { entries: xhrLog2 });

    // Test 6: Try the internal CreateCallback directly
    logger.info("TEST 6: Internal CreateCallback");
    const test6 = await frame.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      try {
        if (typeof grid.CreateCallback === "function") {
          grid.CreateCallback("PN1");
          return { called: "CreateCallback", inCallback: grid.InCallback?.() };
        } else if (typeof grid.SendCallback === "function") {
          grid.SendCallback("PN1");
          return { called: "SendCallback", inCallback: grid.InCallback?.() };
        } else {
          // List all methods that contain "callback" (case insensitive)
          const proto = Object.getPrototypeOf(grid);
          const cbMethods = Object.getOwnPropertyNames(proto)
            .filter((m) => /callback/i.test(m));
          return { error: "no CreateCallback/SendCallback", methods: cbMethods };
        }
      } catch (e: any) {
        return { error: e.message };
      }
    }, gridName);
    logger.info("TEST 6 result:", test6);

    await new Promise((r) => setTimeout(r, 2000));

    const xhrLog3 = await frame.evaluate(() => {
      return (window as any).__xhrLog || [];
    });
    logger.info("XHR log after CreateCallback:", { entries: xhrLog3 });

  } catch (error) {
    logger.error("DEBUG FAILED", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await bot.close();
  }

  process.exit(0);
}

debugCapGoto();
