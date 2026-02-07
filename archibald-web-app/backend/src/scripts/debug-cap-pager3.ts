#!/usr/bin/env tsx
/**
 * Debug script 3: tests keyboard paging and HTTP callback approach.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function debugCapPager3() {
  logger.info("=== DEBUG CAP PAGER 3 ===");

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
    logger.info("Iframe found", iframeInfo);

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

    // Get first 3 rows
    const getRows = async () => {
      return frame!.evaluate(() => {
        return Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'))
          .filter((r) => (r as HTMLElement).offsetParent !== null)
          .slice(0, 3)
          .map((r) => r.textContent?.trim().substring(0, 80) || "");
      });
    };

    const rowsBefore = await getRows();
    logger.info("Rows BEFORE:", { rows: rowsBefore });

    // TEST 1: Click first data cell using frame.click() (CDP mouse events)
    // then press PageDown
    logger.info("TEST 1: frame.click + PageDown");
    try {
      await frame.click('tr[class*="dxgvDataRow"] td');
      logger.info("Clicked first data cell via frame.click()");
      await new Promise((r) => setTimeout(r, 300));

      await page.keyboard.press("PageDown");
      logger.info("Pressed PageDown");
      await new Promise((r) => setTimeout(r, 3000));

      const rowsAfterPD = await getRows();
      logger.info("Rows AFTER PageDown:", { rows: rowsAfterPD });
      logger.info("Changed?", { changed: rowsAfterPD[0] !== rowsBefore[0] });
    } catch (e: any) {
      logger.error("TEST 1 failed:", { error: e.message });
    }

    // TEST 2: Intercept network requests to see what callback looks like
    logger.info("TEST 2: Network interception");
    const callbackRequests: any[] = [];

    // Set up request interception on the main page
    page.on("request", (req: any) => {
      const url = req.url();
      if (url.includes("FindPopup") || url.includes("DXCallback")) {
        callbackRequests.push({
          url: url.substring(0, 200),
          method: req.method(),
          postData: req.postData()?.substring(0, 500) || "",
        });
      }
    });

    // Try clicking the grid cell via frame selector and down arrow
    logger.info("Clicking grid cell and pressing Down arrow multiple times...");
    try {
      await frame.click('tr[class*="dxgvDataRow"] td');
      await new Promise((r) => setTimeout(r, 200));

      // Press Down 20 times to go past visible rows
      for (let i = 0; i < 21; i++) {
        await page.keyboard.press("ArrowDown");
        await new Promise((r) => setTimeout(r, 50));
      }
      logger.info("Pressed ArrowDown 21 times");
      await new Promise((r) => setTimeout(r, 3000));

      const rowsAfterArrow = await getRows();
      logger.info("Rows AFTER 21 ArrowDown:", { rows: rowsAfterArrow });
      logger.info("Changed?", { changed: rowsAfterArrow[0] !== rowsBefore[0] });
    } catch (e: any) {
      logger.error("ArrowDown test failed:", { error: e.message });
    }

    // Check captured requests
    logger.info("Captured callback requests:", {
      count: callbackRequests.length,
      requests: callbackRequests,
    });

    // TEST 3: Try navigating the iframe URL directly with page parameters
    logger.info("TEST 3: Direct iframe navigation with callback");
    const iframeUrl = iframeInfo.src;
    logger.info("Iframe URL:", { url: iframeUrl });

    // Get cookies for authenticated request
    const cookies = await page.cookies();
    const cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");

    // Try making a direct fetch to the iframe URL with callback parameters
    const fetchResult = await page.evaluate(
      async (url: string) => {
        try {
          // DevExpress callback format: __CALLBACKID=gridName&__CALLBACKPARAM=PAGERONCLICK|PN
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
            },
            credentials: "include",
            body: "__CALLBACKID=&__CALLBACKPARAM=PAGERONCLICK|PN",
          });

          const text = await resp.text();
          return {
            status: resp.status,
            length: text.length,
            preview: text.substring(0, 500),
          };
        } catch (e: any) {
          return { error: e.message };
        }
      },
      iframeUrl,
    );
    logger.info("Fetch result:", fetchResult);

    // TEST 4: Try getting viewstate and making proper callback
    logger.info("TEST 4: Get form data from iframe for callback");
    const formData = await frame.evaluate(() => {
      const viewState = (
        document.querySelector('[name="__VIEWSTATE"]') as HTMLInputElement
      )?.value?.substring(0, 100) || "NOT FOUND";
      const viewStateGen = (
        document.querySelector('[name="__VIEWSTATEGENERATOR"]') as HTMLInputElement
      )?.value || "NOT FOUND";
      const eventValidation = (
        document.querySelector('[name="__EVENTVALIDATION"]') as HTMLInputElement
      )?.value?.substring(0, 100) || "NOT FOUND";

      // Get all hidden form fields
      const hiddenFields = Array.from(
        document.querySelectorAll('input[type="hidden"]'),
      ).map((i: any) => ({
        name: i.name,
        valueLen: i.value?.length || 0,
        valuePreview: i.value?.substring(0, 50) || "",
      }));

      return { viewState, viewStateGen, eventValidation, hiddenFields };
    });
    logger.info("Form data:", formData);

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

debugCapPager3();
