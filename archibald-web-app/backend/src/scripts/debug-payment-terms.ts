#!/usr/bin/env tsx
/**
 * Debug: explore the Payment Terms lookup dialog structure with screenshot.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugPaymentTerms() {
  logger.info("=== DEBUG PAYMENT TERMS ===");

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
    logger.info("Customer form loaded");

    // Open Payment Terms lookup
    const btnClicked = await page.evaluate((regex: string) => {
      const allEls = Array.from(
        document.querySelectorAll("td, img, button, a, div"),
      );
      const btn = allEls.find((el: Element) => new RegExp(regex).test(el.id));
      if (btn) {
        (btn as HTMLElement).scrollIntoView({ block: "center" });
        (btn as HTMLElement).click();
        return { id: btn.id, tag: btn.tagName };
      }
      return null;
    }, "xaf_dviPAYMTERMID_Edit_find_Edit_B0");
    logger.info("Clicked PAYMTERMID button:", { btnClicked });

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
    logger.info("Dialog appeared");

    // Screenshot before iframe
    await page.screenshot({ path: "logs/payment-terms-dialog.png", fullPage: false });
    logger.info("Screenshot saved: logs/payment-terms-dialog.png");

    const iframeHandle = await page.$("iframe[src*='FindPopup']");
    if (!iframeHandle) {
      logger.error("No iframe found! Checking all iframes...");
      const allIframes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("iframe")).map((f) => ({
          id: f.id,
          src: f.src?.substring(0, 200) || "",
          visible: (f as HTMLElement).offsetParent !== null,
        }));
      });
      logger.info("All iframes:", { allIframes });
      throw new Error("FindPopup iframe not found");
    }

    const frame = await iframeHandle.contentFrame();
    if (!frame) throw new Error("Could not access iframe");

    await frame.waitForFunction(
      () => document.readyState === "complete",
      { timeout: 15000, polling: 200 },
    );
    await new Promise((r) => setTimeout(r, 2000));

    // 1. Full HTML dump of visible elements
    const htmlDump = await frame.evaluate(() => {
      const allVisible = Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          const h = el as HTMLElement;
          return h.offsetParent !== null && h.getBoundingClientRect().width > 0;
        });

      // Get all inputs
      const inputs = allVisible
        .filter((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA")
        .map((el) => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          id: el.id,
          name: (el as HTMLInputElement).name,
          value: (el as HTMLInputElement).value,
          className: el.className.substring(0, 80),
        }));

      // Get all clickable elements (buttons, links, images with onclick)
      const clickables = allVisible
        .filter((el) =>
          el.tagName === "BUTTON" ||
          el.tagName === "A" ||
          (el.tagName === "IMG" && el.id) ||
          (el.tagName === "TD" && el.className.includes("dxeButton")) ||
          (el.tagName === "TD" && el.id.includes("_B"))
        )
        .slice(0, 30)
        .map((el) => ({
          tag: el.tagName,
          id: el.id,
          className: el.className.substring(0, 60),
          text: el.textContent?.trim().substring(0, 40) || "",
          title: (el as HTMLElement).title || "",
        }));

      // Get data rows
      const dataRows = Array.from(
        document.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgv"]'),
      );

      // Get all tables
      const tables = Array.from(document.querySelectorAll("table"))
        .filter((t) => (t as HTMLElement).offsetParent !== null)
        .map((t) => ({
          id: t.id,
          className: t.className.substring(0, 60),
          rows: t.rows.length,
          width: t.getBoundingClientRect().width,
        }))
        .filter((t) => t.rows > 0);

      // Get header rows specifically
      const headers = Array.from(
        document.querySelectorAll('tr[class*="Header"], th'),
      ).map((el) => ({
        tag: el.tagName,
        className: el.className.substring(0, 60),
        text: el.textContent?.trim().substring(0, 100) || "",
      }));

      // Body text preview
      const bodyText = document.body?.innerText?.substring(0, 500) || "";

      return {
        inputCount: inputs.length,
        inputs,
        clickableCount: clickables.length,
        clickables,
        dataRowCount: dataRows.length,
        tableCount: tables.length,
        tables: tables.slice(0, 10),
        headers,
        bodyText,
      };
    });

    logger.info("Iframe HTML structure:", {
      inputCount: htmlDump.inputCount,
      inputs: htmlDump.inputs,
    });
    logger.info("Clickable elements:", {
      count: htmlDump.clickableCount,
      elements: htmlDump.clickables,
    });
    logger.info("Tables:", {
      count: htmlDump.tableCount,
      tables: htmlDump.tables,
    });
    logger.info("Headers:", { headers: htmlDump.headers });
    logger.info("Data rows:", { count: htmlDump.dataRowCount });
    logger.info("Body text preview:", { text: htmlDump.bodyText });

    // 2. List all ASPxClientControls
    const controls = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      const result: any[] = [];
      if (col && typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          const info: any = {
            name: c.name || "",
            type: c.constructor?.name || "unknown",
          };
          if (typeof c.GetPageCount === "function") info.pageCount = c.GetPageCount();
          if (typeof c.GetVisibleRowsOnPage === "function") info.visibleRows = c.GetVisibleRowsOnPage();
          if (typeof c.GetText === "function") {
            try { info.text = c.GetText(); } catch {}
          }
          if (typeof c.GetValue === "function") {
            try { info.value = String(c.GetValue()); } catch {}
          }
          result.push(info);
        });
      }
      return result;
    });
    logger.info("ASPx controls:", { controls });

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

debugPaymentTerms();
