#!/usr/bin/env tsx
/**
 * Debug script: inspects the CAP lookup grid pager structure.
 * Dumps all elements inside the grid's pager bar to understand
 * how to navigate between pages.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugCapPager() {
  logger.info("=== DEBUG CAP PAGER ===");

  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page;

    // Navigate to customer create form
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

    // Wait for popup
    await page.waitForFunction(
      () => {
        const dialogs = Array.from(
          document.querySelectorAll(
            '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, [id*="_PW"]',
          ),
        ).filter((node) => {
          const el = node as HTMLElement;
          return (
            el.offsetParent !== null && el.getBoundingClientRect().width > 0
          );
        });
        return dialogs.length > 0;
      },
      { timeout: 10000, polling: 100 },
    );

    // Find iframe
    const iframeInfo = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll("iframe")).filter(
        (f) => {
          const el = f as HTMLElement;
          return el.offsetParent !== null && f.src && f.src.includes("FindPopup");
        },
      );
      if (iframes.length > 0) {
        return { id: iframes[0].id, src: iframes[0].src };
      }
      return null;
    });

    if (!iframeInfo) throw new Error("Iframe not found");
    logger.info("Iframe found", iframeInfo);

    const iframeHandle = await page.$(`#${iframeInfo.id}`);
    const frame = await iframeHandle!.contentFrame();
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

    // Dump the grid HTML structure - focus on pager area
    const gridDiag = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      let gridName = "";
      let gridEl: HTMLElement | null = null;

      if (col && typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          if (typeof c?.GetPageCount === "function") {
            gridName = c.name || c.GetName?.() || "";
            // Try to find the grid's main element
            gridEl = c.GetMainElement?.() || null;
          }
        });
      }

      // Find all table rows that look like pager rows
      const allTrs = Array.from(document.querySelectorAll("tr"));
      const pagerRows = allTrs.filter((tr) => {
        const cls = tr.className || "";
        return (
          cls.includes("dxgvPager") ||
          cls.includes("Pager") ||
          tr.querySelector('[class*="dxp"]') !== null
        );
      });

      // Get the bottom of the grid - last few rows
      const gridTable = gridEl?.querySelector("table") || document.querySelector("table");
      const lastRows = gridTable
        ? Array.from(gridTable.querySelectorAll("tr")).slice(-5)
        : [];

      // Find ALL clickable elements in the bottom area
      const bottomArea = document.querySelector('[class*="dxgvPager"]') ||
        document.querySelector('[id*="DXPager"]') ||
        document.querySelector('[class*="BottomPanel"]');

      // Dump complete inner HTML of the grid element
      const gridMainEl = gridEl || document.querySelector('[id*="FindDialog"]');

      // Get all <a> tags with onclick containing 'Page' or 'PN'
      const pageLinks = Array.from(document.querySelectorAll("a")).filter((a) => {
        const onclick = a.getAttribute("onclick") || "";
        const href = a.getAttribute("href") || "";
        return (
          onclick.toLowerCase().includes("page") ||
          onclick.toLowerCase().includes("pbn") ||
          href.includes("page") ||
          href.includes("javascript:") && a.textContent?.trim().match(/^[\d>< ]+$/)
        );
      }).map((a) => ({
        tag: a.tagName,
        id: a.id,
        cls: a.className,
        text: a.textContent?.trim().substring(0, 30),
        onclick: (a.getAttribute("onclick") || "").substring(0, 100),
        href: (a.getAttribute("href") || "").substring(0, 100),
      }));

      return {
        gridName,
        gridElId: gridEl?.id || "N/A",
        gridElTag: gridEl?.tagName || "N/A",
        pagerRowCount: pagerRows.length,
        pagerRowsHtml: pagerRows.map((tr) => ({
          cls: tr.className,
          html: tr.innerHTML.substring(0, 500),
        })),
        lastRowsHtml: lastRows.map((tr) => ({
          cls: tr.className,
          html: tr.innerHTML.substring(0, 300),
        })),
        bottomAreaHtml: bottomArea?.innerHTML?.substring(0, 1000) || "NOT FOUND",
        pageLinksCount: pageLinks.length,
        pageLinks: pageLinks.slice(0, 10),
        // Check if the grid main element has a bottom panel
        gridMainHtml: gridMainEl
          ? gridMainEl.innerHTML.substring(gridMainEl.innerHTML.length - 2000)
          : "NOT FOUND",
      };
    });

    logger.info("Grid diagnostics - gridName:", { gridName: gridDiag.gridName, gridElId: gridDiag.gridElId });
    logger.info("Pager rows found:", { count: gridDiag.pagerRowCount });

    for (const pr of gridDiag.pagerRowsHtml) {
      logger.info("Pager row:", { cls: pr.cls, html: pr.html });
    }

    logger.info("Last grid rows:");
    for (const lr of gridDiag.lastRowsHtml) {
      logger.info("Row:", { cls: lr.cls, html: lr.html });
    }

    logger.info("Bottom area HTML:", { html: gridDiag.bottomAreaHtml });
    logger.info("Page links found:", { count: gridDiag.pageLinksCount });
    for (const pl of gridDiag.pageLinks) {
      logger.info("Page link:", pl);
    }

    // Also dump the last 3000 chars of the grid's main element HTML
    logger.info("Grid main element tail HTML:", {
      html: gridDiag.gridMainHtml.substring(0, 3000),
    });

    // Try a completely different approach: check if there's a "page size" control
    // or if we can change the page size to get all rows at once
    const pageSizeInfo = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      let result = {} as any;

      if (col && typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          if (typeof c?.GetPageCount === "function") {
            result = {
              pageCount: c.GetPageCount?.(),
              pageIndex: c.GetPageIndex?.(),
              visibleRows: c.GetVisibleRowsOnPage?.(),
              // Check if we can get total row count
              totalRows: c.cpTotalRowCount || c.GetRowsCount?.() || "N/A",
              // Check available methods
              methods: Object.getOwnPropertyNames(Object.getPrototypeOf(c))
                .filter((m) => /page|pager|row|scroll|callback|perform/i.test(m))
                .slice(0, 30),
            };
          }
        });
      }
      return result;
    });

    logger.info("Page size info:", pageSizeInfo);

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

debugCapPager();
