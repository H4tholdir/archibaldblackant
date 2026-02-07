#!/usr/bin/env tsx
/**
 * Debug: test the correct DevExpress callback format for pagination.
 * Also checks the error page for details.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugCapCallback() {
  logger.info("=== DEBUG CAP CALLBACK ===");

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

    // Get ALL form field names and the grid info
    const iframeData = await frame.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      let gridName = "";
      let gridUniqueId = "";
      let pageCount = 0;

      if (col && typeof col.ForEachControl === "function") {
        col.ForEachControl((c: any) => {
          if (typeof c?.GetPageCount === "function") {
            gridName = c.name || "";
            gridUniqueId = c.uniqueID || "";
            pageCount = c.GetPageCount?.() || 0;
          }
        });
      }

      // Get ALL form inputs (not just hidden)
      const allFormInputs: Array<{name: string, value: string, type: string, tag: string}> = [];
      const form = document.forms[0];
      if (form) {
        for (const el of Array.from(form.elements) as HTMLInputElement[]) {
          if (el.name) {
            allFormInputs.push({
              name: el.name,
              value: el.value?.substring(0, 100) || "",
              type: el.type || "unknown",
              tag: el.tagName,
            });
          }
        }
      }

      return { gridName, gridUniqueId, pageCount, allFormInputs };
    });

    logger.info("Grid info:", {
      gridName: iframeData.gridName,
      gridUniqueId: iframeData.gridUniqueId,
      pageCount: iframeData.pageCount,
    });
    logger.info("All form inputs:", {
      count: iframeData.allFormInputs.length,
      fields: iframeData.allFormInputs.map((f) => `${f.name} (${f.type}, len=${f.value.length})`),
    });

    // Try different callback param formats
    const callbackFormats = [
      `PN1`,
      `PAGERONCLICK|PN`,
      `PAGERONCLICK|1`,
      `GB|${iframeData.gridName}|PN1`,
    ];

    for (const callbackParam of callbackFormats) {
      logger.info(`Testing callback param: "${callbackParam}"`);

      const result = await frame.evaluate(
        async (formInputs: Array<{name: string, value: string}>, callbackId: string, param: string) => {
          const params = new URLSearchParams();
          for (const field of formInputs) {
            params.set(field.name, field.value);
          }
          params.set("__CALLBACKID", callbackId);
          params.set("__CALLBACKPARAM", param);

          const resp = await fetch(window.location.href, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
            },
            credentials: "include",
            body: params.toString(),
          });

          const text = await resp.text();
          return {
            status: resp.status,
            length: text.length,
            preview: text.substring(0, 300),
            hasDataRows: text.includes("dxgvDataRow"),
          };
        },
        iframeData.allFormInputs.map((f) => ({ name: f.name, value: f.value })),
        iframeData.gridUniqueId,
        callbackParam,
      );

      logger.info(`Result for "${callbackParam}":`, result);
    }

    // Also try: fetch the full form data using form.elements and serialize everything
    logger.info("Trying with complete form serialization...");
    const fullFormResult = await frame.evaluate(
      async (callbackId: string) => {
        const form = document.forms[0];
        if (!form) return { error: "no form" };

        const formData = new FormData(form);
        const params = new URLSearchParams();
        for (const [key, value] of formData.entries()) {
          params.set(key, value as string);
        }
        params.set("__CALLBACKID", callbackId);
        params.set("__CALLBACKPARAM", "PN1");

        const resp = await fetch(window.location.href, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
          body: params.toString(),
        });

        const text = await resp.text();
        return {
          status: resp.status,
          length: text.length,
          preview: text.substring(0, 300),
          hasDataRows: text.includes("dxgvDataRow"),
          paramCount: Array.from(params.entries()).length,
        };
      },
      iframeData.gridUniqueId,
    );
    logger.info("Full form serialization result:", fullFormResult);

    // Try to check what the error page says
    if (fullFormResult && typeof fullFormResult === "object" && "preview" in fullFormResult) {
      const redirectMatch = fullFormResult.preview.match(/redirect.*?Error\.aspx\?e=([a-f0-9-]+)/);
      if (redirectMatch) {
        const errorUrl = `${config.archibald.url}/Error.aspx?e=${redirectMatch[1]}`;
        logger.info("Fetching error page...", { url: errorUrl });
        const errorResult = await page.evaluate(async (url: string) => {
          const resp = await fetch(url, { credentials: "include" });
          const text = await resp.text();
          return text.substring(0, 2000);
        }, errorUrl);
        logger.info("Error page content:", { html: errorResult });
      }
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

debugCapCallback();
