#!/usr/bin/env tsx
/**
 * E2E debug script: traces the EXACT flow for editing order 72.938 in Archibald ERP.
 *
 * Uses the SAME patterns as deleteOrderFromArchibald (which works) and
 * editOrderInArchibald (which fails at StartEditRow).
 *
 * Usage:
 *   cd archibald-web-app/backend
 *   npx tsx src/scripts/test-edit-order-e2e.ts
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const ARCHIBALD_URL = process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald";
const USERNAME = process.env.ARCHIBALD_USERNAME || "";
const PASSWORD = process.env.ARCHIBALD_PASSWORD || "";
const ORDER_ID_NORMALIZED = "72938"; // 72.938 without dots — same as bot does
const LOGS_DIR = path.join(process.cwd(), "logs", "edit-order-e2e");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(step: string, data?: any) {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  const msg = data ? `[${ts}] ${step}: ${JSON.stringify(data, null, 2)}` : `[${ts}] ${step}`;
  console.log(msg);
}

async function screenshot(page: any, name: string) {
  const filePath = path.join(LOGS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  log(`  Screenshot: ${name}.png`);
}

async function pasteText(handle: any, text: string) {
  await handle.click({ clickCount: 3 });
  await handle.press("Backspace");
  await handle.evaluate((el: HTMLInputElement, t: string) => {
    el.value = "";
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, t);
    else el.value = t;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);
}

async function main() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  log("=== E2E Edit Order Debug ===");
  log("Config", { ARCHIBALD_URL, USERNAME, ORDER_ID_NORMALIZED });

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    protocolTimeout: 300000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security", "--ignore-certificate-errors"],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  try {
    // ==================== STEP 1: LOGIN ====================
    log("STEP 1: Login");
    const loginUrl = `${ARCHIBALD_URL}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const fields = await page.evaluate(() => {
      const textInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
      const userInput = textInputs.find((i) => i.id.includes("UserName") || i.name.includes("UserName")) || textInputs[0];
      const passInput = document.querySelector('input[type="password"]') as HTMLInputElement | null;
      if (!userInput || !passInput) return null;
      return { userFieldId: userInput.id, passFieldId: passInput.id };
    });
    if (!fields) throw new Error("Login fields not found");

    await page.evaluate((fid: string, val: string) => {
      const inp = document.getElementById(fid) as HTMLInputElement;
      if (!inp) return;
      inp.focus(); inp.click();
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (s) s.call(inp, val); else inp.value = val;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, fields.userFieldId, USERNAME);
    await page.keyboard.press("Tab");
    await wait(300);

    await page.evaluate((fid: string, val: string) => {
      const inp = document.getElementById(fid) as HTMLInputElement;
      if (!inp) return;
      inp.focus(); inp.click();
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (s) s.call(inp, val); else inp.value = val;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, fields.passFieldId, PASSWORD);
    await page.keyboard.press("Tab");
    await wait(300);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, input[type='submit'], a"));
      const btn = btns.find((b) => (b.textContent || "").toLowerCase().replace(/\s+/g, "").includes("accedi"));
      if (btn) (btn as HTMLElement).click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    log("Logged in", { url: page.url() });

    // ==================== STEP 2: Navigate to orders list ====================
    log("STEP 2: Navigate to orders list");
    await page.goto(`${ARCHIBALD_URL}/SALESTABLE_ListView_Agent/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("span, button, a")).some((el) => el.textContent?.trim().toLowerCase() === "nuovo");
    }, { timeout: 15000 });
    await wait(500);
    log("Orders list loaded");
    await screenshot(page, "01-orders-list");

    // ==================== STEP 3: Set filter (same as delete flow) ====================
    log("STEP 3: ensureOrdersFilterSetToAll");
    // The bot calls this.ensureOrdersFilterSetToAll(this.page) — replicate the same logic
    const filterResult = await page.evaluate(() => {
      // Look for "Tutti gli ordini" or "All Orders" navigation item and click it
      const navItems = Array.from(document.querySelectorAll('a, span, li'));
      for (const item of navItems) {
        const text = (item.textContent || "").trim().toLowerCase();
        if (text === "tutti gli ordini" || text === "all orders") {
          (item as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    });
    log("Filter result", filterResult);
    if (filterResult.clicked) {
      await wait(2000);
      // Wait for loading to finish
      await page.waitForFunction(() => {
        const panels = Array.from(document.querySelectorAll('[id*="LPV"], .dxlp'));
        return !panels.some((el) => {
          const s = window.getComputedStyle(el as HTMLElement);
          return s.display !== "none" && s.visibility !== "hidden";
        });
      }, { timeout: 10000, polling: 200 }).catch(() => null);
    }
    await screenshot(page, "02-after-filter");

    // ==================== STEP 4: Search (SAME as delete flow) ====================
    log("STEP 4: Search for order", { ORDER_ID_NORMALIZED });
    const searchSelector = "#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I";
    const searchHandle = await page.waitForSelector(searchSelector, { timeout: 5000, visible: true }).catch(() => null);
    if (!searchHandle) throw new Error("Search input not found");

    const rowCountBefore = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
    log("Row count before search", { rowCountBefore });

    await pasteText(searchHandle, ORDER_ID_NORMALIZED);
    await page.keyboard.press("Enter");

    // Wait for grid to update (SAME logic as delete flow)
    await page.waitForFunction(
      (prevCount: number) => {
        const panels = Array.from(document.querySelectorAll('[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]'));
        const hasLoading = panels.some((el) => {
          const s = window.getComputedStyle(el as HTMLElement);
          return s.display !== "none" && s.visibility !== "hidden" && (el as HTMLElement).getBoundingClientRect().width > 0;
        });
        if (hasLoading) return false;
        const cur = document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
        const empty = !!document.querySelector('tr[class*="dxgvEmptyData"]');
        return cur !== prevCount || empty || cur <= 5;
      },
      { timeout: 15000, polling: 200 },
      rowCountBefore,
    ).catch(() => null);
    await wait(500);

    const rowCount = await page.evaluate(() => document.querySelectorAll('tr[class*="dxgvDataRow"]').length);
    log("Search results", { rowCount });

    // Dump ALL found rows to verify we have the right order
    const foundRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
      return rows.map((r, i) => ({
        index: i,
        id: r.id,
        text: (r as HTMLElement).textContent?.trim().replace(/\s+/g, " ").substring(0, 200),
      }));
    });
    log("Found rows content", foundRows);
    await screenshot(page, "03-search-results");

    if (rowCount === 0) throw new Error("Order not found after search");

    // ==================== STEP 5: Click Edit (pencil) on first row ====================
    log("STEP 5: Click Edit pencil on the order row");

    // First: dump the command column / pencil button structure
    const rowStructure = await page.evaluate(() => {
      const row = document.querySelector('tr[class*="dxgvDataRow"]');
      if (!row) return null;
      const allLinks = Array.from(row.querySelectorAll("a")).map((a) => ({
        id: a.id, text: a.textContent?.trim(), dataArgs: a.getAttribute("data-args"),
        className: a.className?.substring(0, 60),
      }));
      const allImgs = Array.from(row.querySelectorAll("img")).map((img) => ({
        id: img.id, title: img.title, alt: img.alt, src: img.src?.substring(img.src.lastIndexOf("/") + 1),
      }));
      const cells = Array.from(row.querySelectorAll("td")).map((td, i) => ({
        idx: i, class: td.className?.substring(0, 50), html: td.innerHTML?.substring(0, 150),
      }));
      return { rowId: row.id, links: allLinks, imgs: allImgs, cells };
    });
    log("Row structure", rowStructure);

    // Click the Edit link/button (same strategies as editOrderInArchibald)
    const editClicked = await page.evaluate(() => {
      const row = document.querySelector('tr[class*="dxgvDataRow"]');
      if (!row) return { clicked: false, reason: "no row" };

      // Strategy 1: a[data-args*="Edit"]
      const editLink = row.querySelector('a[data-args*="Edit"]') as HTMLElement | null;
      if (editLink) { editLink.click(); return { clicked: true, method: "a[data-args*=Edit]", id: editLink.id }; }

      // Strategy 2: img[title="Modifica"]
      const editImg = row.querySelector('img[title="Modifica"]') as HTMLElement | null;
      if (editImg) { editImg.click(); return { clicked: true, method: "img[title=Modifica]" }; }

      // Strategy 3: command column
      const cmdCell = row.querySelector("td.dxgvCommandColumn_XafTheme") as HTMLElement | null;
      if (cmdCell) {
        const link = cmdCell.querySelector("a, img") as HTMLElement | null;
        if (link) { link.click(); return { clicked: true, method: "commandColumn", html: cmdCell.innerHTML?.substring(0, 150) }; }
      }

      return { clicked: false, reason: "no edit button found in row" };
    });
    log("Edit click result", editClicked);

    if (!editClicked.clicked) {
      await screenshot(page, "05-edit-not-found");
      throw new Error("Could not click Edit button");
    }

    // ==================== STEP 6: Wait for detail view ====================
    log("STEP 6: Wait for detail view (SALESTABLE_DetailViewAgent)");
    await page.waitForFunction(
      () => window.location.href.includes("SALESTABLE_DetailViewAgent"),
      { timeout: 15000 },
    );
    await wait(1500);
    log("Detail view URL", { url: page.url() });
    await screenshot(page, "04-detail-view-initial");

    // Wait for "Salvare" / "Salva" button to appear
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("span, button, a")).some((el) => {
        const t = el.textContent?.trim().toLowerCase() || "";
        return t.includes("salvare") || t.includes("salva");
      });
    }, { timeout: 15000 });
    log("Detail view fully loaded (Salvare found)");
    await wait(2000);
    await screenshot(page, "05-detail-view-loaded");

    // ==================== STEP 7: Discover ALL DevExpress controls ====================
    log("STEP 7: Discover ALL DevExpress controls on page");

    const allControls = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return { error: "No ASPxClientControl" };
      const controls: any[] = [];
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        const mainEl = c.GetMainElement?.();
        controls.push({
          name: c.name,
          type: c.constructor?.name,
          hasAddNewRow: typeof c.AddNewRow === "function",
          hasStartEditRow: typeof c.StartEditRow === "function",
          isGrid: typeof c.GetVisibleRowsOnPage === "function",
          visibleRows: typeof c.GetVisibleRowsOnPage === "function" ? c.GetVisibleRowsOnPage() : undefined,
          isEditing: typeof c.IsEditing === "function" ? c.IsEditing() : undefined,
          mainElementId: mainEl?.id?.substring(0, 80),
          visible: mainEl ? mainEl.offsetParent !== null : undefined,
        });
      });
      return { count: controls.length, controls };
    });
    log("All DevExpress controls", allControls);

    // ==================== STEP 8: Find SALESLINES grid specifically ====================
    log("STEP 8: Find SALESLINES grid");

    const gridInfo = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return { error: "no collection" };
      let gridName: string | null = null;
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        if (c.name?.includes("dviSALESLINEs") && typeof c.AddNewRow === "function") {
          gridName = c.name;
        }
      });
      if (!gridName) return { found: false };

      const grid = w.ASPxClientControl.GetControlCollection().GetByName(gridName);
      const mainEl = grid.GetMainElement?.();

      // Examine the grid's DOM
      let container: Element | null = mainEl;
      if (!container) container = document.getElementById(gridName) || document.querySelector(`[id*="${gridName}"]`);

      const dataRows = container ? Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]')) : [];
      const allTrs = container ? container.querySelectorAll("tr").length : 0;

      return {
        found: true,
        gridName,
        mainElementId: mainEl?.id,
        mainElementVisible: mainEl ? mainEl.offsetParent !== null : false,
        visibleRows: grid.GetVisibleRowsOnPage?.(),
        isEditing: grid.IsEditing?.(),
        inCallback: grid.InCallback?.(),
        dataRowCount: dataRows.length,
        allTrCount: allTrs,
        dataRowTexts: dataRows.map((r: any) => (r as HTMLElement).textContent?.trim().replace(/\s+/g, " ").substring(0, 150)),
      };
    });
    log("SALESLINES grid info", gridInfo);

    const gridName = (gridInfo as any).gridName || null;
    if (!gridName) {
      log("ERROR: SALESLINES grid not found!");
      // Dump all elements with SALESLINES in ID
      const slElements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="SALESLINE"], [id*="SALESLINEs"]')).map((el) => ({
          tag: el.tagName, id: el.id?.substring(0, 100), visible: (el as HTMLElement).offsetParent !== null,
        })).slice(0, 40);
      });
      log("SALESLINES DOM elements", slElements);
    }
    await screenshot(page, "06-grid-info");

    // ==================== STEP 9: Scroll grid into view & check DOM ====================
    log("STEP 9: Scroll grid into view");
    if (gridName) {
      await page.evaluate((gn: string) => {
        const el = document.getElementById(gn) || document.querySelector(`[id*="${gn}"]`);
        if (el) el.scrollIntoView({ block: "center" });
      }, gridName);
      await wait(500);
    }
    await screenshot(page, "07-grid-scrolled");

    // Dump SALESLINES data row structure (cells, links, buttons)
    if (gridName) {
      const rowDetail = await page.evaluate((gn: string) => {
        const el = document.getElementById(gn) || document.querySelector(`[id*="${gn}"]`);
        if (!el) return { error: "grid container not found in DOM" };
        const rows = Array.from(el.querySelectorAll('tr[class*="dxgvDataRow"]'));
        if (rows.length === 0) return { error: "no data rows in grid", allTrs: el.querySelectorAll("tr").length };
        const row = rows[0];
        const cells = Array.from(row.querySelectorAll("td")).map((td, i) => ({
          idx: i,
          text: td.textContent?.trim().substring(0, 40),
          class: td.className?.substring(0, 50),
          links: Array.from(td.querySelectorAll("a")).map((a) => ({
            dataArgs: a.getAttribute("data-args"),
            text: a.textContent?.trim(),
          })),
          imgs: Array.from(td.querySelectorAll("img")).map((img) => img.title || img.alt || img.src?.split("/").pop()),
        }));
        return { rowId: row.id, rowClass: row.className, cells };
      }, gridName);
      log("SALESLINES row 0 detail", rowDetail);
    }

    // ==================== STEP 10: Try all strategies to start editing row 0 ====================
    log("STEP 10: ===== TRY ALL STRATEGIES TO START EDITING ROW 0 =====");

    const checkEditRow = async (label: string) => {
      const state = await page.evaluate((gn: string | null) => {
        let c: Element | Document = document;
        if (gn) { const g = document.getElementById(gn) || document.querySelector(`[id*="${gn}"]`); if (g) c = g; }
        const editRows = c.querySelectorAll('tr[id*="DXEditingRow"]');
        const editNew = c.querySelectorAll('tr[id*="editnew"]');
        const inlineEdit = c.querySelectorAll('tr[class*="InlineEdit"]');
        const invInputs = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"]')).map((i) => ({
          id: (i as HTMLElement).id?.substring(0, 80), vis: (i as HTMLElement).offsetParent !== null,
        }));
        return {
          editRows: editRows.length,
          editNew: editNew.length,
          inlineEdit: inlineEdit.length,
          inventtable: invInputs,
          activeId: (document.activeElement as HTMLElement)?.id?.substring(0, 80),
          activeTag: document.activeElement?.tagName,
        };
      }, gridName);
      log(`  [${label}] Edit state`, state);
      return state.editRows > 0 || state.editNew > 0;
    };

    // 10a: DOM click — StartEdit link
    log("10a: DOM StartEdit link");
    const domResult = await page.evaluate((gn: string | null) => {
      let c: Element | Document = document;
      if (gn) { const g = document.getElementById(gn) || document.querySelector(`[id*="${gn}"]`); if (g) c = g; }
      const rows = Array.from(c.querySelectorAll('tr[class*="dxgvDataRow"]'));
      const row = rows[0];
      if (!row) return { clicked: false, reason: "no data row" };
      row.scrollIntoView({ block: "center" });

      const seLink = row.querySelector('a[data-args*="StartEdit"]') as HTMLElement | null;
      if (seLink) { seLink.click(); return { clicked: true, method: "StartEdit link" }; }

      const eImg = row.querySelector('img[title="Edit"], img[title="Modifica"]') as HTMLElement | null;
      if (eImg) { (eImg.parentElement || eImg).click(); return { clicked: true, method: "edit img" }; }

      const cmd = row.querySelector('td[class*="CommandColumn"]') as HTMLElement | null;
      if (cmd) { const a = cmd.querySelector("a, img") as HTMLElement | null; if (a) { a.click(); return { clicked: true, method: "cmd col" }; } }
      return { clicked: false, reason: "no StartEdit element" };
    }, gridName);
    log("  DOM result", domResult);
    await wait(1500);
    let found = await checkEditRow("10a");
    await screenshot(page, "10a-dom-startedit");

    // 10b: DevExpress API StartEditRow(0)
    if (!found && gridName) {
      log("10b: DevExpress API StartEditRow(0)");
      await page.evaluate((gn: string) => {
        const w = window as any;
        const g = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(gn);
        if (g) g.StartEditRow(0);
      }, gridName);
      await wait(2000);
      found = await checkEditRow("10b");
      await screenshot(page, "10b-api-startedit");
    }

    // 10c: Double-click on a data cell
    if (!found && gridName) {
      log("10c: Double-click on data cell");
      const coords = await page.evaluate((gn: string) => {
        const g = document.getElementById(gn) || document.querySelector(`[id*="${gn}"]`);
        if (!g) return null;
        const row = g.querySelector('tr[class*="dxgvDataRow"]');
        if (!row) return null;
        const cell = row.querySelector("td:nth-child(2)") as HTMLElement;
        if (!cell) return null;
        const r = cell.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, gridName);
      if (coords) {
        await page.mouse.click(coords.x, coords.y, { clickCount: 2 });
        await wait(2000);
        found = await checkEditRow("10c");
        await screenshot(page, "10c-doubleclick");
      }
    }

    // 10d: AddNewRow (test grid responsiveness)
    if (!found && gridName) {
      log("10d: AddNewRow (test if grid responds at all)");
      await page.evaluate((gn: string) => {
        const w = window as any;
        const g = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(gn);
        if (g) g.AddNewRow();
      }, gridName);
      // Wait for callback
      await page.waitForFunction((gn: string) => {
        const w = window as any;
        const g = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(gn);
        return g && !g.InCallback();
      }, { timeout: 10000, polling: 100 }, gridName).catch(() => null);
      await wait(1500);
      found = await checkEditRow("10d-AddNewRow");
      await screenshot(page, "10d-addnewrow");
    }

    // 10e: Single-click on first data cell
    if (!found && gridName) {
      log("10e: Single-click on first data cell");
      const coords = await page.evaluate((gn: string) => {
        const g = document.getElementById(gn) || document.querySelector(`[id*="${gn}"]`);
        if (!g) return null;
        const row = g.querySelector('tr[class*="dxgvDataRow"]');
        if (!row) return null;
        const cells = Array.from(row.querySelectorAll("td"));
        for (const cell of cells) {
          const t = cell.textContent?.trim() || "";
          if (t.length > 2 && !cell.className.includes("Command")) {
            const r = cell.getBoundingClientRect();
            if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: t.substring(0, 30) };
          }
        }
        return null;
      }, gridName);
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        await wait(1500);
        found = await checkEditRow("10e");
        await screenshot(page, "10e-singleclick");
      }
    }

    // ==================== STEP 11: Full page dump ====================
    log("STEP 11: Full page state dump");
    const pageDump = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        activeId: (document.activeElement as HTMLElement)?.id,
        activeTag: document.activeElement?.tagName,
        allInputsWithInventtable: Array.from(document.querySelectorAll('input[id*="INVENTTABLE"]')).map((i) => (i as HTMLElement).id),
        allEditingRows: Array.from(document.querySelectorAll('tr[id*="DXEditingRow"], tr[id*="editnew"]')).map((r) => r.id),
      };
    });
    log("Page dump", pageDump);

    const html = await page.content();
    fs.writeFileSync(path.join(LOGS_DIR, "page-dump.html"), html);
    log("HTML saved to page-dump.html");

    log("=== E2E Debug Complete ===");
    log("Screenshots in: " + LOGS_DIR);
    log("Browser stays open 120s for manual inspection...");
    await wait(120000);

  } catch (error) {
    log("FATAL ERROR", { message: error instanceof Error ? error.message : String(error) });
    await screenshot(page, "99-error");
    await wait(30000);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
