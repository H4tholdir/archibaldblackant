#!/usr/bin/env tsx
/**
 * Test script: dump the DevExpress SALESLINEs grid structure
 * to identify the discount cell and its position relative to quantity.
 *
 * Goal: evaluate replacing the single Tab navigation (qty → discount)
 * with a direct cell targeting method, keeping Tab as fallback.
 *
 * Approach: use bot.createOrder() but intercept after article entry
 * to dump the grid before UpdateEdit saves the row.
 *
 * Usage:
 *   cd archibald-web-app/backend
 *   npx tsx src/scripts/test-grid-discount-cell.ts
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import fs from "fs";
import path from "path";

const CUSTOMER = "Fresis Soc Cooperativa";
const ARTICLE = "TD1272.314.";
const QUANTITY = 2;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForDevExpressIdle(page: any, timeout = 5000) {
  try {
    await page.waitForFunction(
      () => {
        const w = window as any;
        const col = w.ASPxClientControl?.GetControlCollection?.();
        if (!col || typeof col.ForEachControl !== "function") return true;
        let busy = false;
        col.ForEachControl((c: any) => {
          try { if (c.InCallback?.()) busy = true; } catch {}
          try { const gv = c.GetGridView?.(); if (gv?.InCallback?.()) busy = true; } catch {}
        });
        return !busy;
      },
      { timeout, polling: 100 },
    );
  } catch {
    // proceed
  }
}

async function testGridDiscountCell() {
  logger.info("=== TEST: GRID DISCOUNT CELL DISCOVERY ===");
  logger.info(`Customer: ${CUSTOMER}, Article: ${ARTICLE}, Qty: ${QUANTITY}`);

  const bot = new ArchibaldBot();

  try {
    // 1. Initialize and login
    logger.info("1. Initializing browser...");
    await bot.initialize();

    logger.info("2. Logging in...");
    const page = bot.page!;

    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 60000 });

    await page.evaluate(
      (username: string, password: string) => {
        const textInputs = Array.from(
          document.querySelectorAll('input[type="text"]'),
        ) as HTMLInputElement[];
        const userField =
          textInputs.find(
            (i) => i.id.includes("UserName") || i.name.includes("UserName"),
          ) || textInputs[0];
        const passField = document.querySelector(
          'input[type="password"]',
        ) as HTMLInputElement | null;
        if (!userField || !passField) return;

        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, "value",
        )?.set;
        if (setter) setter.call(userField, username);
        else userField.value = username;
        userField.dispatchEvent(new Event("input", { bubbles: true }));
        userField.dispatchEvent(new Event("change", { bubbles: true }));

        if (setter) setter.call(passField, password);
        else passField.value = password;
        passField.dispatchEvent(new Event("input", { bubbles: true }));
        passField.dispatchEvent(new Event("change", { bubbles: true }));

        const buttons = Array.from(
          document.querySelectorAll("button, input[type='submit'], a, div[role='button']"),
        );
        const accediBtn = buttons.find((btn) =>
          (btn.textContent || "").toLowerCase().trim() === "accedi",
        );
        if (accediBtn) (accediBtn as HTMLElement).click();
      },
      config.archibald.username,
      config.archibald.password,
    );

    try {
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
    } catch { /* already navigated */ }

    if (page.url().includes("Login.aspx")) {
      await page.screenshot({ path: "logs/grid-test-login-fail.png" });
      throw new Error("Login failed");
    }
    await wait(1000);
    logger.info("✅ Login OK");

    // 3. Navigate to orders list
    logger.info("3. Navigating to orders list...");
    await page.goto(
      `${config.archibald.url}/SALESTABLE_ListView_Agent/`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("span, button, a"))
        .some((el) => el.textContent?.trim().toLowerCase() === "nuovo"),
      { timeout: 15000 },
    );
    logger.info("✅ Orders list loaded");

    // 4. Click "Nuovo" to create new order
    logger.info("4. Creating new order form...");
    const urlBefore = page.url();
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button, a, span"))
        .find((el) => el.textContent?.trim().toLowerCase() === "nuovo");
      if (btn) (btn as HTMLElement).click();
    });
    await page.waitForFunction(
      (oldUrl: string) => window.location.href !== oldUrl,
      { timeout: 10000 },
      urlBefore,
    );
    await page.waitForFunction(
      () => !!(window as any).ASPxClientControl?.GetControlCollection,
      { timeout: 15000 },
    );
    await wait(2000);
    logger.info("✅ Order form loaded");

    // 5. Discover SALESLINEs grid
    logger.info("5. Discovering SALESLINEs grid...");
    const gridName = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return "";
      let found = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        if (c.name?.includes("dviSALESLINEs") && typeof c.AddNewRow === "function") {
          found = c.name;
        }
      });
      return found;
    });
    logger.info(`SALESLINEs grid: ${gridName || "NOT FOUND"}`);

    // 6. Select customer
    logger.info(`6. Selecting customer: ${CUSTOMER}...`);

    // Find customer field
    const customerFieldInfo = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );
      const customerInput = inputs.find((input) => {
        const id = (input as HTMLInputElement).id.toLowerCase();
        const el = input as HTMLInputElement;
        return (
          (id.includes("custtable") || id.includes("custaccount") ||
           id.includes("custome") || id.includes("cliente") ||
           id.includes("account") || id.includes("profilo")) &&
          !el.disabled && el.getBoundingClientRect().height > 0
        );
      }) as HTMLInputElement | undefined;
      if (!customerInput) return null;
      const baseId = customerInput.id.endsWith("_I")
        ? customerInput.id.slice(0, -2) : customerInput.id;
      const btnSelectors = [`${baseId}_B-1`, `${baseId}_B-1Img`, `${baseId}_B`];
      for (const btnId of btnSelectors) {
        const btn = document.getElementById(btnId) as HTMLElement | null;
        if (btn && btn.offsetParent !== null) {
          return { inputId: customerInput.id, baseId, btnSelector: `#${btnId}` };
        }
      }
      return { inputId: customerInput.id, baseId, btnSelector: null };
    });

    if (!customerFieldInfo?.btnSelector) {
      throw new Error("Customer field/dropdown button not found");
    }

    await page.click(customerFieldInfo.btnSelector);
    await wait(500);

    // Search for customer
    const searchSelector = `#${customerFieldInfo.baseId}_DDD_gv_DXSE_I`;
    await page.waitForFunction(
      (sel: string) => {
        const input = document.querySelector(sel) as HTMLInputElement | null;
        return input && input.offsetParent !== null && !input.disabled;
      },
      { timeout: 5000, polling: 50 },
      searchSelector,
    );

    await page.evaluate(
      (sel: string, value: string) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (!input) return;
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, "value",
        )?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      },
      searchSelector,
      CUSTOMER,
    );

    // Wait for filtered rows, then click match
    await page.waitForFunction(
      (baseId: string) => {
        const containers = Array.from(
          document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        });
        const container = containers.find((c) =>
          (c as HTMLElement).id.includes(baseId) && c.querySelector('tr[class*="dxgvDataRow"]'),
        ) || containers.find((c) => c.querySelector('tr[class*="dxgvDataRow"]'));
        if (!container) return false;
        const rows = Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]'))
          .filter((r) => (r as HTMLElement).offsetParent !== null);
        return rows.length > 0;
      },
      { timeout: 8000, polling: 100 },
      customerFieldInfo.baseId,
    );

    await page.evaluate(
      (baseId: string, customerName: string) => {
        const containers = Array.from(
          document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpcMainDiv'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        });
        const container = containers.find((c) =>
          (c as HTMLElement).id.includes(baseId) && c.querySelector('tr[class*="dxgvDataRow"]'),
        ) || containers.find((c) => c.querySelector('tr[class*="dxgvDataRow"]'));
        if (!container) return;
        const rows = Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]'))
          .filter((r) => (r as HTMLElement).offsetParent !== null);
        // Click first matching row
        const queryLower = customerName.trim().toLowerCase();
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          const cellTexts = cells.map((c) => c.textContent?.trim().toLowerCase() || "");
          if (cellTexts.some((t) => t.includes(queryLower.substring(0, 10)))) {
            const target = cells[0] || row;
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return;
          }
        }
        // Fallback: click first row
        const firstRow = rows[0]?.querySelector("td") || rows[0];
        if (firstRow) (firstRow as HTMLElement).click();
      },
      customerFieldInfo.baseId,
      CUSTOMER,
    );

    await waitForDevExpressIdle(page);
    await wait(2000);
    logger.info("✅ Customer selected");

    // 7. Open "Prezzi e sconti" tab and set LINEDISC to N/A
    logger.info("7. Setting LINEDISC to N/A...");
    // Open tab
    await page.evaluate(() => {
      const allLinks = Array.from(
        document.querySelectorAll("a.dxtc-link, span.dx-vam"),
      );
      for (const element of allLinks) {
        const text = element.textContent?.trim() || "";
        if (text.includes("Prezzi") && text.includes("sconti")) {
          const clickTarget = element.tagName === "A" ? element : element.parentElement;
          if (clickTarget && (clickTarget as HTMLElement).offsetParent !== null) {
            (clickTarget as HTMLElement).click();
            return;
          }
        }
      }
    });
    await wait(1500);

    // Find and set LINEDISC
    try {
      await page.waitForFunction(
        () => {
          const input = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement | null;
          return input && input.offsetParent !== null;
        },
        { timeout: 8000, polling: 200 },
      );

      await page.evaluate(() => {
        const input = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement | null;
        if (!input) return;
        input.scrollIntoView({ block: "center" });
        input.focus();
        input.click();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(input, "N/A");
        else input.value = "N/A";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.keyboard.press("Tab");
      await waitForDevExpressIdle(page);
      logger.info("✅ LINEDISC set to N/A");
    } catch (err) {
      logger.warn("LINEDISC not found or not needed, continuing...", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 8. Add new row
    logger.info("8. Adding new row...");
    if (gridName) {
      await page.evaluate((gName: string) => {
        const w = window as any;
        const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
        if (grid?.AddNewRow) grid.AddNewRow();
      }, gridName);
    }
    await waitForDevExpressIdle(page);
    await wait(1500);
    logger.info("✅ AddNewRow called");

    // 9. Focus INVENTTABLE and type article code
    logger.info(`9. Entering article: ${ARTICLE}...`);

    // Find and click INVENTTABLE input
    const inventtableInfo = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'),
      );
      for (const inp of inputs) {
        const el = inp as HTMLElement;
        if (el.offsetParent !== null && el.offsetWidth > 0) {
          el.scrollIntoView({ block: "center" });
          const rect = el.getBoundingClientRect();
          return { id: (inp as HTMLInputElement).id, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    });

    if (!inventtableInfo) {
      // Take debug screenshot
      await page.screenshot({ path: "logs/grid-test-no-inventtable.png" });
      throw new Error("INVENTTABLE input not found");
    }

    await page.mouse.click(inventtableInfo.x, inventtableInfo.y);
    await wait(300);

    // Type article code (optimized: paste all but last char, type last)
    const pastePart = ARTICLE.slice(0, -1);
    const typePart = ARTICLE.slice(-1);
    await page.evaluate((text: string) => {
      const input = document.activeElement as HTMLInputElement;
      if (input?.tagName === "INPUT") {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      }
    }, pastePart);
    await page.keyboard.type(typePart, { delay: 30 });

    // Wait for dropdown
    try {
      await page.waitForSelector('tr[id*="DXDataRow"]', { timeout: 5000 });
      logger.info("✅ Article dropdown opened");
    } catch {
      await page.screenshot({ path: "logs/grid-test-no-dropdown.png" });
      throw new Error("Article dropdown did not open");
    }

    await waitForDevExpressIdle(page);

    // 10. Select first variant row (click it then Tab to select + move to qty)
    logger.info("10. Selecting variant...");

    // Click on first data row in the dropdown
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[id*="DXDataRow"]'))
        .filter((r) => (r as HTMLElement).getBoundingClientRect().height > 0);
      if (rows.length > 0) {
        const firstCell = rows[0].querySelector("td") || rows[0];
        (firstCell as HTMLElement).click();
      }
    });
    await wait(300);

    // Arrow down if needed and Tab to confirm selection + move to qty
    await page.keyboard.press("ArrowDown");
    await wait(100);
    await page.keyboard.press("Tab");

    // Wait for variant selection callback
    await waitForDevExpressIdle(page, 8000);
    await wait(1000);
    logger.info("✅ Variant selected, should be on quantity field now");

    // ═══════════════════════════════════════════════════════════════
    // NOW WE'RE IN THE EDIT ROW WITH AN ARTICLE - TIME TO DUMP!
    // ═══════════════════════════════════════════════════════════════

    logger.info("=== BEGINNING GRID DUMP ===");

    // 11. Check current focused element
    const currentFocus = await page.evaluate(() => {
      const f = document.activeElement as HTMLInputElement;
      return { id: f?.id || "", tag: f?.tagName || "", value: f?.value || "", type: f?.type || "" };
    });
    logger.info("Current focus (should be qty):", JSON.stringify(currentFocus));

    // 12. Dump ALL visible inputs
    logger.info("12. Dumping ALL visible inputs...");
    const inputDump = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('input[type="text"], input:not([type])'),
      )
        .filter((inp) => {
          const el = inp as HTMLElement;
          return el.offsetParent !== null && el.offsetWidth > 0;
        })
        .map((inp) => {
          const el = inp as HTMLInputElement;
          const rect = el.getBoundingClientRect();
          return {
            id: el.id, name: el.name, value: el.value,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            tabIndex: el.tabIndex, disabled: el.disabled, readOnly: el.readOnly,
          };
        })
        .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    });

    // Filter SALESLINEs inputs
    const editRowInputs = inputDump.filter((inp) =>
      inp.id.toLowerCase().includes("salesline"),
    );
    logger.info(`SALESLINEs edit inputs: ${editRowInputs.length}`);
    editRowInputs.forEach((inp, idx) => {
      logger.info(
        `  [${idx}] id=${inp.id} | value="${inp.value}" | pos=(${inp.rect.x},${inp.rect.y}) ${inp.rect.w}x${inp.rect.h} | tab=${inp.tabIndex} | disabled=${inp.disabled} | readOnly=${inp.readOnly}`,
      );
    });

    // 13. Search for discount inputs
    logger.info("13. Searching for discount-related inputs...");
    const discountInputs = inputDump.filter((inp) => {
      const id = inp.id.toLowerCase();
      return id.includes("discount") || id.includes("sconto") ||
        id.includes("linedisc") || id.includes("linepercentdisc") || id.includes("disc");
    });
    logger.info(`Discount-related inputs: ${discountInputs.length}`);
    discountInputs.forEach((inp, idx) => {
      logger.info(`  [${idx}] id=${inp.id} | value="${inp.value}" | pos=(${inp.rect.x},${inp.rect.y}) ${inp.rect.w}x${inp.rect.h}`);
    });

    // 14. Search for quantity inputs
    logger.info("14. Searching for quantity-related inputs...");
    const qtyInputs = inputDump.filter((inp) => {
      const id = inp.id.toLowerCase();
      return id.includes("qtyordered") || id.includes("qty") || id.includes("quantit");
    });
    logger.info(`Quantity-related inputs: ${qtyInputs.length}`);
    qtyInputs.forEach((inp, idx) => {
      logger.info(`  [${idx}] id=${inp.id} | value="${inp.value}" | pos=(${inp.rect.x},${inp.rect.y}) ${inp.rect.w}x${inp.rect.h}`);
    });

    // 15. DevExpress column metadata
    logger.info("15. DevExpress column metadata...");
    const columnMeta = await page.evaluate((gName: string) => {
      if (!gName) return { error: "No grid name" };
      const w = window as any;
      const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
      if (!grid) return { error: "Grid not found" };

      const columns: Array<{
        index: number; name: string; fieldName: string; caption: string; visible: boolean; width: string;
      }> = [];

      try {
        if (grid.columns) {
          for (let i = 0; i < grid.columns.length; i++) {
            const col = grid.columns[i];
            columns.push({
              index: i, name: col.name || "", fieldName: col.fieldName || "",
              caption: col.caption || "", visible: col.visible !== false, width: col.width || "",
            });
          }
        }
      } catch { /* ignore */ }

      if (columns.length === 0) {
        try {
          const colCount = typeof grid.GetColumnCount === "function" ? grid.GetColumnCount() : 0;
          for (let i = 0; i < colCount; i++) {
            const col = grid.GetColumn(i);
            if (col) {
              columns.push({
                index: i, name: col.name || "", fieldName: col.fieldName || "",
                caption: col.caption || "", visible: col.visible !== false, width: col.width || "",
              });
            }
          }
        } catch { /* ignore */ }
      }

      return { gridName: gName, columnCount: columns.length, columns };
    }, gridName);

    logger.info("Column metadata:", JSON.stringify(columnMeta, null, 2));

    // 16. TAB ORDER TEST - the key experiment!
    logger.info("16. === TAB ORDER TEST ===");
    logger.info("Starting from current focused element (should be qty field)");

    const tabResults: Array<{ step: string; id: string; tag: string; value: string; type: string }> = [];

    // Record starting position
    const startState = await page.evaluate(() => {
      const f = document.activeElement as HTMLInputElement;
      return { id: f?.id || "", tag: f?.tagName || "", value: f?.value || "", type: f?.type || "" };
    });
    tabResults.push({ step: "START (qty)", ...startState });

    // Press Tab up to 6 times and record each focus
    for (let t = 1; t <= 6; t++) {
      await page.keyboard.press("Tab");
      await wait(400);

      const state = await page.evaluate(() => {
        const f = document.activeElement as HTMLInputElement;
        return { id: f?.id || "", tag: f?.tagName || "", value: f?.value || "", type: f?.type || "" };
      });
      tabResults.push({ step: `Tab #${t}`, ...state });
      logger.info(`Tab #${t}: id=${state.id} | tag=${state.tag} | value="${state.value}"`);

      // Stop if we've left the grid row area
      if (state.tag === "BODY" || state.id === "") break;
    }

    logger.info("\n=== TAB ORDER SEQUENCE ===");
    tabResults.forEach((r) => {
      const isDiscount = r.id.toLowerCase().includes("discount") || r.id.toLowerCase().includes("disc");
      const isQty = r.id.toLowerCase().includes("qty");
      const marker = isDiscount ? " <<<< DISCOUNT" : isQty ? " <<<< QUANTITY" : "";
      logger.info(`  ${r.step}: ${r.id}${marker}`);
    });

    // 16b. TEST: Set 22% discount via direct MANUALDISCOUNT targeting
    logger.info("16b. === DISCOUNT ENTRY TEST: 22% via editTableCell pattern ===");

    // Find the MANUALDISCOUNT input by ID pattern (like editTableCell does)
    const discountFieldInfo = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );
      const discInput = inputs.find((inp) => {
        const id = (inp as HTMLInputElement).id.toLowerCase();
        return (
          id.includes("manualdiscount") &&
          id.includes("salesline") &&
          (inp as HTMLElement).offsetParent !== null
        );
      }) as HTMLInputElement | null;

      if (!discInput) return null;
      return { id: discInput.id, value: discInput.value, disabled: discInput.disabled, readOnly: discInput.readOnly };
    });

    if (!discountFieldInfo) {
      logger.error("❌ MANUALDISCOUNT input not found in grid!");
    } else {
      logger.info(`Found MANUALDISCOUNT: id=${discountFieldInfo.id}, value="${discountFieldInfo.value}", disabled=${discountFieldInfo.disabled}`);

      if (discountFieldInfo.disabled) {
        logger.warn("⚠️ MANUALDISCOUNT is disabled - cannot set value directly");
      } else {
        // Step 1: Double-click to enter edit mode (like editTableCell)
        const dblClickOk = await page.evaluate((inputId: string) => {
          const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
          if (!input) return false;
          try {
            input.focus();
            const dblClickEvent = new MouseEvent("dblclick", {
              view: window, bubbles: true, cancelable: true, detail: 2,
            });
            input.dispatchEvent(dblClickEvent);
            const start = Date.now();
            while (Date.now() - start < 150) {} // sync wait for edit mode
            return true;
          } catch { return false; }
        }, discountFieldInfo.id);

        logger.info(`Double-click result: ${dblClickOk}`);
        await wait(300);

        // Step 2: Select all text
        await page.evaluate((inputId: string) => {
          const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
          if (input) { input.focus(); input.select(); }
        }, discountFieldInfo.id);
        await wait(100);

        // Step 3: Clear and type "22"
        await page.keyboard.press("Backspace");
        await wait(50);
        await page.keyboard.type("22", { delay: 30 });
        await wait(300);

        // Step 4: Verify the value
        const afterDiscount = await page.evaluate((inputId: string) => {
          const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
          return input?.value || "";
        }, discountFieldInfo.id);

        logger.info(`✅ MANUALDISCOUNT after typing "22": "${afterDiscount}"`);

        // Take screenshot showing the discount entered
        const discScreenshot = path.join(process.cwd(), `grid-discount-22pct-${Date.now()}.png`);
        await page.screenshot({ path: discScreenshot, fullPage: false });
        logger.info(`Screenshot with 22% discount: ${discScreenshot}`);
      }
    }

    // 17. Deep DOM dump of edit row
    logger.info("17. Deep DOM dump of edit row...");
    const editRowDump = await page.evaluate(() => {
      const editRow = document.querySelector('tr[id*="editnew"]')
        || document.querySelector('tr[class*="dxgvEditingRow"]');
      if (!editRow) return { error: "Edit row not found (may use overlay editors)" };

      const cells = editRow.querySelectorAll("td");
      const result: Array<{
        index: number; id: string; text: string;
        inputs: Array<{ id: string; value: string; type: string }>;
      }> = [];
      cells.forEach((cell, idx) => {
        const inputs: Array<{ id: string; value: string; type: string }> = [];
        cell.querySelectorAll("input, select, textarea").forEach((inp) => {
          const el = inp as HTMLInputElement;
          inputs.push({ id: el.id, value: el.value, type: el.type || el.tagName.toLowerCase() });
        });
        result.push({
          index: idx, id: cell.id,
          text: (cell.textContent || "").trim().substring(0, 80),
          inputs,
        });
      });
      return { editRowId: editRow.id, cells: result };
    });
    logger.info("Edit row:", JSON.stringify(editRowDump, null, 2));

    // 18. Take screenshot
    logger.info("18. Taking screenshot...");
    const screenshotPath = path.join(process.cwd(), `grid-discount-screenshot-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    logger.info(`✅ Screenshot: ${screenshotPath}`);

    // 19. Save full report
    const report = {
      timestamp: new Date().toISOString(),
      customer: CUSTOMER,
      article: ARTICLE,
      quantity: QUANTITY,
      gridName,
      columnMetadata: columnMeta,
      editRowStructure: editRowDump,
      salesLineInputs: editRowInputs,
      discountInputs,
      quantityInputs: qtyInputs,
      tabOrderSequence: tabResults,
      allVisibleInputs: inputDump,
    };
    const reportPath = path.join(process.cwd(), `grid-discount-dump-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    logger.info(`✅ Report: ${reportPath}`);

    // 20. Summary & recommendation
    logger.info("\n========================================");
    logger.info("=== SUMMARY ===");
    logger.info("========================================");
    logger.info(`Grid: ${gridName}`);
    logger.info(`Column count: ${"columnCount" in columnMeta ? columnMeta.columnCount : "N/A"}`);
    logger.info(`SALESLINEs edit inputs: ${editRowInputs.length}`);
    logger.info(`Discount inputs: ${discountInputs.length}`);
    logger.info(`Qty inputs: ${qtyInputs.length}`);

    // Find if Tab from qty reaches discount directly
    const qtyTabIndex = tabResults.findIndex((r) =>
      r.id.toLowerCase().includes("qty"),
    );
    const discTabIndex = tabResults.findIndex((r) =>
      r.id.toLowerCase().includes("discount") || r.id.toLowerCase().includes("disc"),
    );

    if (qtyTabIndex >= 0 && discTabIndex >= 0) {
      const tabsNeeded = discTabIndex - qtyTabIndex;
      logger.info(`\n🎯 Tabs needed from qty to discount: ${tabsNeeded}`);
      if (tabsNeeded === 1) {
        logger.info("✅ Single Tab reaches discount correctly!");
      } else {
        logger.info(`⚠️ ${tabsNeeded} Tab(s) needed! Intermediate fields:`);
        for (let i = qtyTabIndex + 1; i < discTabIndex; i++) {
          logger.info(`   → ${tabResults[i].id}`);
        }
      }
    } else if (discountInputs.length > 0) {
      logger.info("\n⚠️ Discount input found but NOT in Tab sequence from qty");
      logger.info(`Discount input ID: ${discountInputs[0].id}`);
      logger.info("→ Must use editTableCell with direct ID targeting");
    } else {
      logger.info("\n❌ No discount input found in edit row!");
      logger.info("→ Discount column might not be visible or has a different name");
    }

    logger.info("\n=== TEST COMPLETED ===");

    // Cancel the order to avoid leaving orphan records
    logger.info("Cancelling order to clean up...");
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, a, span, img"));
        const cancelBtn = buttons.find((btn) => {
          const text = (btn.textContent || "").toLowerCase().trim();
          const title = ((btn as HTMLElement).title || "").toLowerCase();
          return text.includes("annulla") || text.includes("cancel") ||
            title.includes("cancel") || title.includes("annulla");
        });
        if (cancelBtn) (cancelBtn as HTMLElement).click();
      });
      await wait(1000);

      // Also try CancelEdit on the grid
      if (gridName) {
        await page.evaluate((gName: string) => {
          const w = window as any;
          const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
          if (grid?.CancelEdit) grid.CancelEdit();
        }, gridName);
      }
    } catch {
      // cleanup is best-effort
    }
  } catch (error) {
    logger.error("❌ TEST FAILED", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Take failure screenshot
    try {
      if (bot.page) {
        await bot.page.screenshot({ path: `logs/grid-test-fail-${Date.now()}.png` });
      }
    } catch { /* ignore */ }

    process.exit(1);
  } finally {
    await bot.close();
  }
}

testGridDiscountCell();
