#!/usr/bin/env tsx
/**
 * Debug script: examine the DOM structure of the editnew row
 * after grid.AddNewRow() via DevExpress API
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";

async function debugEditnewRow() {
  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page!;

    // Navigate to orders
    await page.goto(
      "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      { waitUntil: "networkidle2" },
    );
    logger.info("On orders list");

    // Click Nuovo
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        const nuovo = links.find(
          (a) =>
            a.title?.includes("Nuovo") ||
            a.textContent?.trim() === "Nuovo",
        );
        if (nuovo) nuovo.click();
      }),
    ]);
    logger.info("Navigated to new order form");

    // Wait for form to load
    await new Promise((r) => setTimeout(r, 3000));

    // Discover grid
    const gridName = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return "";
      let found = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl(
        (c: any) => {
          if (
            c.name &&
            c.name.includes("dviSALESLINEs") &&
            typeof c.AddNewRow === "function"
          ) {
            found = c.name;
          }
        },
      );
      return found;
    });
    logger.info("Grid discovered", { gridName });

    // Select customer first (required before AddNewRow)
    logger.info("Selecting customer...");
    const customerInputSelector =
      'input[id*="dviCUSTTABLE"][id$="_I"]';
    await page.waitForSelector(customerInputSelector, {
      timeout: 5000,
    });
    await page.click(customerInputSelector);
    await page.keyboard.type("fresis", { delay: 50 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 5000));
    logger.info("Customer selected");

    // AddNewRow via API
    logger.info("Calling grid.AddNewRow()...");
    await page.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection
        ?.()
        ?.GetByName?.(name);
      if (grid) grid.AddNewRow();
    }, gridName);

    // Wait for callback
    await page.waitForFunction(
      (name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection
          ?.()
          ?.GetByName?.(name);
        return grid && !grid.InCallback();
      },
      { polling: 100, timeout: 15000 },
      gridName,
    );
    await new Promise((r) => setTimeout(r, 1000));
    logger.info("AddNewRow completed");

    // Take screenshot before analysis
    await page.screenshot({
      path: "logs/debug-editnew-before.png",
      fullPage: true,
    });

    // Analyze the editnew row DOM
    const domAnalysis = await page.evaluate(() => {
      const row = document.querySelector('tr[id*="editnew"]');
      if (!row)
        return { found: false, html: "", allElements: [], allInputs: [] };

      // Get all elements with IDs
      const allElements = Array.from(row.querySelectorAll("[id]")).map(
        (el) => ({
          tag: el.tagName,
          id: el.id,
          className: el.className?.toString().substring(0, 80) || "",
          visible: (el as HTMLElement).offsetParent !== null,
        }),
      );

      // Get all inputs (any type)
      const allInputs = Array.from(
        row.querySelectorAll("input, select, textarea"),
      ).map((el) => ({
        tag: el.tagName,
        id: el.id,
        type: (el as HTMLInputElement).type,
        value: (el as HTMLInputElement).value,
        visible: (el as HTMLElement).offsetParent !== null,
        w: (el as HTMLElement).offsetWidth,
        h: (el as HTMLElement).offsetHeight,
      }));

      // Get all TDs content summary
      const cells = Array.from(row.querySelectorAll("td")).map(
        (td, idx) => ({
          idx,
          text: td.textContent?.trim().substring(0, 50) || "",
          childCount: td.children.length,
          innerHTML: td.innerHTML.substring(0, 200),
          hasDropdown: !!td.querySelector('[class*="dxeDropDown"]'),
          hasCombo: !!td.querySelector('[class*="Combo"]'),
        }),
      );

      return {
        found: true,
        rowId: row.id,
        cellCount: row.querySelectorAll("td").length,
        cells,
        allElements: allElements.slice(0, 30),
        allInputs,
        innerHTML: row.innerHTML.substring(0, 500),
      };
    });

    logger.info("DOM Analysis of editnew row:", {
      found: domAnalysis.found,
      rowId: (domAnalysis as any).rowId,
      cellCount: (domAnalysis as any).cellCount,
      inputCount: (domAnalysis as any).allInputs?.length,
      elementCount: (domAnalysis as any).allElements?.length,
    });

    if ((domAnalysis as any).cells) {
      for (const cell of (domAnalysis as any).cells) {
        logger.info(`Cell ${cell.idx}:`, cell);
      }
    }

    if ((domAnalysis as any).allInputs?.length > 0) {
      logger.info("Inputs found:", {
        inputs: (domAnalysis as any).allInputs,
      });
    }

    if ((domAnalysis as any).allElements?.length > 0) {
      logger.info("Elements with IDs:", {
        elements: (domAnalysis as any).allElements,
      });
    }

    // Also check: what does grid.GetEditor return?
    const editorInfo = await page.evaluate((name: string) => {
      const w = window as any;
      const grid = w.ASPxClientControl?.GetControlCollection
        ?.()
        ?.GetByName?.(name);
      if (!grid) return { error: "grid not found" };

      const info: any = {
        isEditing: grid.IsEditing?.(),
        isNewRowEditing: grid.IsNewRowEditing?.(),
        editors: [],
      };

      for (let col = 0; col < 8; col++) {
        try {
          const editor = grid.GetEditor(col);
          if (editor) {
            info.editors.push({
              col,
              name: editor.name || "unknown",
              type: editor.constructor?.name || "unknown",
              hasSetFocus: typeof editor.SetFocus === "function",
              hasGetInputElement:
                typeof editor.GetInputElement === "function",
              inputElement: editor.GetInputElement?.()?.id || null,
            });
          }
        } catch (_e) {
          // skip
        }
      }

      return info;
    }, gridName);

    logger.info("Grid editor info:", editorInfo);

    await new Promise((r) => setTimeout(r, 3000));
  } catch (error) {
    logger.error("Debug failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await bot.close();
  }
}

debugEditnewRow();
