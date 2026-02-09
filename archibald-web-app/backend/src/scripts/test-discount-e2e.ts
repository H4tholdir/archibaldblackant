#!/usr/bin/env tsx
/**
 * E2E test: replicates the EXACT bot flow for article entry + discount.
 *
 * Tests 4 discount approaches across 4 articles:
 *   Art 1: editTableCell (double-click + focus + type) - the KNOWN problematic one
 *   Art 2: DevExpress control by name: ctrl.SetValue(63)
 *   Art 3: DevExpress control by name: ctrl.SetText("63") + events
 *   Art 4: Native value setter (current bot code)
 *
 * After each UpdateEdit + AddNewRow, verifies INVENTTABLE focus for next article.
 *
 * Usage:
 *   cd archibald-web-app/backend
 *   npx tsx src/scripts/test-discount-e2e.ts
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import fs from "fs";
import path from "path";

const CUSTOMER = "Fresis Soc Cooperativa";
const ARTICLE = "TD1272.314.";
const QUANTITY = 1;
const DISCOUNT = 63;
const NUM_ARTICLES = 4;

const LOGS_DIR = path.join(process.cwd(), "logs");

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

async function waitForGridCallback(page: any, gridName: string, timeout = 15000) {
  try {
    await page.waitForFunction(
      (gName: string) => {
        const w = window as any;
        const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
        return grid && !grid.InCallback();
      },
      { timeout, polling: 100 },
      gridName,
    );
  } catch {
    // proceed
  }
}

async function dumpState(page: any, label: string) {
  const state = await page.evaluate(() => {
    const focused = document.activeElement as HTMLInputElement;
    const editRow = document.querySelector('tr[id*="editnew"]') || document.querySelector('tr[class*="dxgvEditingRow"]');

    const salesInputs = Array.from(document.querySelectorAll('input[type="text"]'))
      .filter((inp) => {
        const el = inp as HTMLElement;
        const id = (inp as HTMLInputElement).id.toLowerCase();
        return id.includes("salesline") && el.offsetParent !== null && el.offsetWidth > 0;
      })
      .map((inp) => {
        const el = inp as HTMLInputElement;
        return { id: el.id, value: el.value, disabled: el.disabled };
      });

    const discInput = salesInputs.find((inp) => inp.id.toLowerCase().includes("manualdiscount"));
    const qtyInput = salesInputs.find((inp) => inp.id.toLowerCase().includes("qtyordered"));
    const invInput = salesInputs.find((inp) => inp.id.toLowerCase().includes("inventtable"));

    return {
      focusedId: focused?.id || "none",
      focusedTag: focused?.tagName || "",
      editRowExists: !!editRow && (editRow as HTMLElement).offsetParent !== null,
      discount: discInput ? { id: discInput.id, value: discInput.value } : null,
      qty: qtyInput ? { id: qtyInput.id, value: qtyInput.value } : null,
      inventtable: invInput ? { id: invInput.id, value: invInput.value } : null,
    };
  });

  logger.info(`📋 [${label}] focus=${state.focusedId} editRow=${state.editRowExists}`);
  if (state.discount) logger.info(`   MANUALDISCOUNT: "${state.discount.value}"`);
  if (state.qty) logger.info(`   QTYORDERED: "${state.qty.value}"`);
  if (state.inventtable) logger.info(`   INVENTTABLE: "${state.inventtable.value}"`);
  return state;
}

// ──────────────────────────────────────────────────────────
// DISCOUNT APPROACHES
// ──────────────────────────────────────────────────────────

async function approach_editTableCell(page: any, discount: number): Promise<{ ok: boolean; error?: string }> {
  /**
   * Replicates bot's editTableCell method exactly:
   * 1. Find MANUALDISCOUNT input
   * 2. focus() + double-click event
   * 3. select() + Backspace + type value
   */
  const discountFormatted = discount.toString().replace(".", ",");

  const inputInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const inp = inputs.find((i) => {
      const id = i.id.toLowerCase();
      return id.includes("manualdiscount") && id.includes("salesline") && i.offsetParent !== null;
    });
    return inp ? { id: inp.id, value: inp.value } : null;
  });

  if (!inputInfo) return { ok: false, error: "MANUALDISCOUNT input not found" };

  // Step 1: double-click (exact copy from editTableCell)
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
      while (Date.now() - start < 150) {} // sync wait
      return true;
    } catch { return false; }
  }, inputInfo.id);

  if (!dblClickOk) return { ok: false, error: "Double-click failed" };
  await wait(300);

  // Step 2: select all
  await page.evaluate((inputId: string) => {
    const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
    if (input) { input.focus(); input.select(); }
  }, inputInfo.id);
  await wait(100);

  // Step 3: clear + type
  await page.keyboard.press("Backspace");
  await wait(50);
  await page.keyboard.type(discountFormatted, { delay: 30 });
  await wait(300);

  const afterValue = await page.evaluate((inputId: string) => {
    const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
    return input?.value || "";
  }, inputInfo.id);

  return { ok: true, error: undefined };
}

async function approach_devexpressControlSetValue(page: any, discount: number): Promise<{ ok: boolean; error?: string }> {
  /**
   * Find the DevExpress editor control by name (baseId of the input)
   * and call SetValue() directly - no focus change.
   */
  const result = await page.evaluate((val: number) => {
    // Find MANUALDISCOUNT input to get its baseId
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const discInput = inputs.find((inp) => {
      const id = inp.id.toLowerCase();
      return id.includes("manualdiscount") && id.includes("salesline") && inp.offsetParent !== null;
    });
    if (!discInput) return { ok: false, error: "MANUALDISCOUNT input not found" };

    const baseId = discInput.id.endsWith("_I") ? discInput.id.slice(0, -2) : discInput.id;

    // Try to find the DevExpress control by name
    const w = window as any;
    const col = w.ASPxClientControl?.GetControlCollection?.();
    if (!col) return { ok: false, error: "No ASPxClientControl collection" };

    let ctrl: any = null;

    // Method 1: Direct lookup
    try { ctrl = col.Get(baseId); } catch {}

    // Method 2: Try window[baseId]
    if (!ctrl) {
      try { ctrl = w[baseId]; } catch {}
    }

    // Method 3: Search all controls for matching name
    if (!ctrl) {
      col.ForEachControl((c: any) => {
        if (c.name === baseId) ctrl = c;
      });
    }

    if (!ctrl) {
      // Dump all controls for debugging
      const allControls: string[] = [];
      col.ForEachControl((c: any) => {
        if (c.name?.toLowerCase()?.includes("manualdiscount")) {
          allControls.push(c.name);
        }
      });
      return { ok: false, error: `DevExpress control "${baseId}" not found`, relatedControls: allControls };
    }

    const valueBefore = discInput.value;

    // Try SetValue (for ASPxSpinEdit/ASPxTextBox)
    const methods: string[] = [];
    if (typeof ctrl.SetValue === "function") methods.push("SetValue");
    if (typeof ctrl.SetText === "function") methods.push("SetText");
    if (typeof ctrl.SetNumber === "function") methods.push("SetNumber");

    try {
      if (typeof ctrl.SetValue === "function") {
        ctrl.SetValue(val);
      } else if (typeof ctrl.SetText === "function") {
        ctrl.SetText(val.toString());
      }
    } catch (err: any) {
      return { ok: false, error: `SetValue failed: ${err?.message}`, methods };
    }

    const valueAfter = discInput.value;
    return { ok: true, valueBefore, valueAfter, controlName: ctrl.name, methods };
  }, discount);

  logger.info(`  DevExpress ctrl.SetValue result: ${JSON.stringify(result)}`);
  return result;
}

async function approach_devexpressControlSetText(page: any, discount: number): Promise<{ ok: boolean; error?: string }> {
  /**
   * Same as above but uses SetText with formatted value + triggers ValueChanged
   */
  const discountFormatted = discount.toString().replace(".", ",");

  const result = await page.evaluate((val: string) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const discInput = inputs.find((inp) => {
      const id = inp.id.toLowerCase();
      return id.includes("manualdiscount") && id.includes("salesline") && inp.offsetParent !== null;
    });
    if (!discInput) return { ok: false, error: "MANUALDISCOUNT input not found" };

    const baseId = discInput.id.endsWith("_I") ? discInput.id.slice(0, -2) : discInput.id;
    const w = window as any;
    let ctrl: any = null;
    try { ctrl = w[baseId]; } catch {}
    if (!ctrl) {
      try { ctrl = w.ASPxClientControl?.GetControlCollection()?.Get(baseId); } catch {}
    }

    if (!ctrl) return { ok: false, error: `Control "${baseId}" not found` };

    const valueBefore = discInput.value;

    try {
      // Use SetText for formatted value
      if (typeof ctrl.SetText === "function") {
        ctrl.SetText(val);
      } else if (typeof ctrl.SetValue === "function") {
        ctrl.SetValue(val);
      }

      // Trigger ValueChanged event if available
      if (typeof ctrl.RaiseValueChangedEvent === "function") {
        ctrl.RaiseValueChangedEvent();
      }
    } catch (err: any) {
      return { ok: false, error: `SetText failed: ${err?.message}` };
    }

    const valueAfter = discInput.value;
    return { ok: true, valueBefore, valueAfter };
  }, discountFormatted);

  logger.info(`  DevExpress ctrl.SetText result: ${JSON.stringify(result)}`);
  return result;
}

async function approach_nativeValueSetter(page: any, discount: number): Promise<{ ok: boolean; error?: string }> {
  /**
   * Current bot code: native value setter + events, no focus change.
   */
  const discountFormatted = discount.toString().replace(".", ",");

  const result = await page.evaluate((val: string) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const discInput = inputs.find((inp) => {
      const id = inp.id.toLowerCase();
      return id.includes("manualdiscount") && id.includes("salesline") && inp.offsetParent !== null;
    });
    if (!discInput) return { ok: false, error: "not found", valueBefore: "", valueAfter: "" };

    const valueBefore = discInput.value;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(discInput, val);
    else discInput.value = val;
    discInput.dispatchEvent(new Event("change", { bubbles: true }));
    discInput.dispatchEvent(new Event("input", { bubbles: true }));
    discInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

    const valueAfter = discInput.value;
    return { ok: true, valueBefore, valueAfter };
  }, discountFormatted);

  logger.info(`  NativeValueSetter result: ${JSON.stringify(result)}`);
  return result;
}

// ──────────────────────────────────────────────────────────
// MAIN TEST
// ──────────────────────────────────────────────────────────

async function testDiscountE2E() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  logger.info("═══════════════════════════════════════════════════════════════");
  logger.info("═══  E2E TEST: EXACT BOT FLOW + DISCOUNT APPROACHES        ═══");
  logger.info("═══════════════════════════════════════════════════════════════");

  const bot = new ArchibaldBot();
  const results: Array<{
    article: number;
    approach: string;
    discountSet: boolean;
    discountValueBefore: string;
    discountValueAfter: string;
    inventtableFocusForNext: boolean | null;
    error?: string;
  }> = [];

  try {
    // ═══ LOGIN ═══
    logger.info("\n═══ LOGIN ═══");
    await bot.initialize();
    const page = bot.page!;

    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 60000 });

    await page.evaluate(
      (username: string, password: string) => {
        const textInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        const userField = textInputs.find((i) => i.id.includes("UserName") || i.name.includes("UserName")) || textInputs[0];
        const passField = document.querySelector('input[type="password"]') as HTMLInputElement | null;
        if (!userField || !passField) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(userField, username); else userField.value = username;
        userField.dispatchEvent(new Event("input", { bubbles: true }));
        userField.dispatchEvent(new Event("change", { bubbles: true }));
        if (setter) setter.call(passField, password); else passField.value = password;
        passField.dispatchEvent(new Event("input", { bubbles: true }));
        passField.dispatchEvent(new Event("change", { bubbles: true }));
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a, div[role='button']"));
        const accediBtn = buttons.find((btn) => (btn.textContent || "").toLowerCase().trim() === "accedi");
        if (accediBtn) (accediBtn as HTMLElement).click();
      },
      config.archibald.username,
      config.archibald.password,
    );
    try { await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }); } catch {}
    if (page.url().includes("Login.aspx")) throw new Error("Login failed");
    await wait(1000);
    logger.info("✅ Login OK");

    // ═══ NAVIGATE TO ORDERS + CREATE NEW ═══
    logger.info("\n═══ NAVIGATE TO ORDERS ═══");
    await page.goto(`${config.archibald.url}/SALESTABLE_ListView_Agent/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll("span, button, a")).some((el) => el.textContent?.trim().toLowerCase() === "nuovo"), { timeout: 15000 });

    const urlBefore = page.url();
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button, a, span")).find((el) => el.textContent?.trim().toLowerCase() === "nuovo");
      if (btn) (btn as HTMLElement).click();
    });
    await page.waitForFunction((oldUrl: string) => window.location.href !== oldUrl, { timeout: 10000 }, urlBefore);
    await page.waitForFunction(() => !!(window as any).ASPxClientControl?.GetControlCollection, { timeout: 15000 });
    await wait(2000);
    logger.info("✅ Order form loaded");

    // ═══ FIND GRID ═══
    const gridName = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return "";
      let found = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        if (c.name?.includes("dviSALESLINEs") && typeof c.AddNewRow === "function") found = c.name;
      });
      return found;
    });
    logger.info(`Grid: ${gridName || "NOT FOUND"}`);
    if (!gridName) throw new Error("SALESLINEs grid not found");

    // ═══ SELECT CUSTOMER (exact bot flow) ═══
    logger.info("\n═══ SELECT CUSTOMER ═══");
    const customerFieldInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const customerInput = inputs.find((input) => {
        const id = (input as HTMLInputElement).id.toLowerCase();
        const el = input as HTMLInputElement;
        return (id.includes("custtable") || id.includes("custaccount") || id.includes("custome") || id.includes("account") || id.includes("profilo")) && !el.disabled && el.getBoundingClientRect().height > 0;
      }) as HTMLInputElement | undefined;
      if (!customerInput) return null;
      const baseId = customerInput.id.endsWith("_I") ? customerInput.id.slice(0, -2) : customerInput.id;
      const btnSelectors = [`${baseId}_B-1`, `${baseId}_B-1Img`, `${baseId}_B`];
      for (const btnId of btnSelectors) {
        const btn = document.getElementById(btnId);
        if (btn && (btn as HTMLElement).offsetParent !== null) return { baseId, btnSelector: `#${btnId}` };
      }
      return { baseId, btnSelector: null };
    });
    if (!customerFieldInfo?.btnSelector) throw new Error("Customer dropdown not found");

    await page.click(customerFieldInfo.btnSelector);
    await wait(500);
    const searchSel = `#${customerFieldInfo.baseId}_DDD_gv_DXSE_I`;
    await page.waitForFunction((sel: string) => { const i = document.querySelector(sel) as HTMLInputElement | null; return i && i.offsetParent !== null; }, { timeout: 5000, polling: 50 }, searchSel);
    await page.evaluate((sel: string, val: string) => {
      const input = document.querySelector(sel) as HTMLInputElement;
      if (!input) return;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, val); else input.value = val;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    }, searchSel, CUSTOMER);
    await page.waitForFunction((baseId: string) => {
      const c = Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite')).find((n) => (n as HTMLElement).offsetParent !== null && n.querySelector('tr[class*="dxgvDataRow"]'));
      return !!c;
    }, { timeout: 8000, polling: 100 }, customerFieldInfo.baseId);
    await page.evaluate((baseId: string) => {
      const containers = Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite')).filter((n) => (n as HTMLElement).offsetParent !== null);
      const container = containers.find((c) => c.querySelector('tr[class*="dxgvDataRow"]'));
      if (!container) return;
      const rows = Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]')).filter((r) => (r as HTMLElement).offsetParent !== null);
      if (rows.length > 0) {
        const target = rows[0].querySelector("td") || rows[0];
        (target as HTMLElement).click();
      }
    }, customerFieldInfo.baseId);
    await waitForDevExpressIdle(page);
    await wait(2000);
    logger.info("✅ Customer selected");

    // ═══ SET LINEDISC TO N/A ═══
    logger.info("\n═══ SET LINEDISC TO N/A ═══");
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a.dxtc-link, span.dx-vam"));
      for (const el of links) {
        const text = el.textContent?.trim() || "";
        if (text.includes("Prezzi") && text.includes("sconti")) {
          const target = el.tagName === "A" ? el : el.parentElement;
          if (target && (target as HTMLElement).offsetParent !== null) { (target as HTMLElement).click(); return; }
        }
      }
    });
    await wait(1500);
    try {
      await page.waitForFunction(() => { const i = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement; return i && i.offsetParent !== null; }, { timeout: 8000, polling: 200 });
      await page.evaluate(() => {
        const input = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement;
        if (!input) return;
        input.scrollIntoView({ block: "center" });
        input.focus(); input.click();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(input, "N/A"); else input.value = "N/A";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.keyboard.press("Tab");
      await waitForDevExpressIdle(page);
      logger.info("✅ LINEDISC = N/A");
    } catch { logger.warn("LINEDISC not found, continuing"); }

    // ═══ ARTICLE LOOP (EXACT BOT FLOW) ═══
    const approaches = [
      "editTableCell",
      "ctrl.SetValue",
      "ctrl.SetText",
      "nativeValueSetter",
    ];

    for (let i = 0; i < NUM_ARTICLES; i++) {
      const approachName = approaches[i] || "ctrl.SetValue";
      logger.info(`\n${"═".repeat(60)}`);
      logger.info(`═══ ARTICLE ${i + 1}/${NUM_ARTICLES} — Discount approach: ${approachName}`);
      logger.info(`${"═".repeat(60)}`);

      // ── STEP 1: AddNewRow ──
      if (i === 0) {
        logger.info("→ AddNewRow (API, first article)");
        await page.evaluate((gName: string) => {
          const w = window as any;
          const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
          if (grid?.AddNewRow) grid.AddNewRow();
        }, gridName);
        await waitForDevExpressIdle(page);
        await wait(1500);
      }
      // For 2+, AddNewRow was done at end of previous iteration

      // ── STEP 2: Focus INVENTTABLE (exact bot flow: 3 strategies) ──
      logger.info(`→ Focus INVENTTABLE for article ${i + 1}`);
      let inventtableFocused = false;

      // Strategy 1: coordinate click (exact bot code)
      const inventtableInfo = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'));
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

      if (inventtableInfo) {
        await page.mouse.click(inventtableInfo.x, inventtableInfo.y);
        await wait(150);
        inventtableFocused = await page.evaluate(() => {
          const f = document.activeElement as HTMLInputElement;
          return f?.id?.includes("INVENTTABLE") || false;
        });
        if (inventtableFocused) logger.info("  ✅ Strategy 1: coordinate click OK");
      }

      // Strategy 2: Click N/A cell (exact bot code)
      if (!inventtableFocused) {
        logger.info("  Strategy 1 failed, trying N/A cell click...");
        const naCell = await page.evaluate(() => {
          const row = document.querySelector('tr[id*="editnew"]');
          if (!row) return null;
          const cells = Array.from(row.querySelectorAll("td"));
          for (const cell of cells) {
            const text = cell.textContent?.trim() || "";
            if (text === "N/A" || text.includes("N/A") || cell.querySelector('[class*="dxeDropDown"]')) {
              const rect = cell.getBoundingClientRect();
              if (rect.width > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
          return null;
        });
        if (naCell) {
          await page.mouse.click(naCell.x, naCell.y);
          await wait(500);
          inventtableFocused = await page.evaluate(() => {
            const f = document.activeElement as HTMLInputElement;
            return f?.id?.includes("INVENTTABLE") || false;
          });
          if (inventtableFocused) logger.info("  ✅ Strategy 2: N/A cell click OK");
        }
      }

      // Strategy 3: Tab fallback (exact bot code)
      if (!inventtableFocused) {
        const tabCount = i === 0 ? 3 : 4 * (i + 1);
        logger.info(`  Strategy 2 failed, trying Tab x${tabCount}...`);
        await page.evaluate(() => {
          const toolbar = document.querySelector('[id*="dviSALESLINEs"] [class*="ToolBar"]');
          if (toolbar) (toolbar as HTMLElement).click();
        });
        await wait(200);
        for (let t = 0; t < tabCount; t++) await page.keyboard.press("Tab");
        await wait(100);
        inventtableFocused = await page.evaluate(() => {
          const f = document.activeElement as HTMLInputElement;
          return f?.id?.includes("INVENTTABLE") || false;
        });
      }

      if (!inventtableFocused) {
        const debugInfo = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"]')).map((inp) => ({
            id: (inp as HTMLInputElement).id, visible: (inp as HTMLElement).offsetParent !== null,
            w: (inp as HTMLElement).offsetWidth, h: (inp as HTMLElement).offsetHeight,
          }));
          return { focusedId: (document.activeElement as HTMLInputElement)?.id || "none", inventtable: all };
        });
        await page.screenshot({ path: path.join(LOGS_DIR, `e2e-inv-fail-art${i + 1}-${Date.now()}.png`), fullPage: true });
        logger.error(`❌ INVENTTABLE FOCUS FAILED for article ${i + 1}`, debugInfo);
        results.push({
          article: i + 1, approach: approachName, discountSet: false,
          discountValueBefore: "", discountValueAfter: "",
          inventtableFocusForNext: false,
          error: `INVENTTABLE focus failed: ${JSON.stringify(debugInfo)}`,
        });
        break; // Stop
      }

      // ── STEP 3: Type article code (exact bot flow: paste prefix + type last char) ──
      logger.info(`→ Type article: ${ARTICLE}`);
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
      } catch {
        throw new Error(`Dropdown did not open for article ${i + 1}`);
      }
      await waitForDevExpressIdle(page);

      // ── STEP 4: Select variant (exact bot flow: ArrowDown + Tab) ──
      logger.info(`→ Select variant (ArrowDown + Tab)`);

      // Re-focus the INVENTTABLE input (exact bot code: refocus before ArrowDown)
      if (inventtableInfo) {
        await page.evaluate((inputId: string | null) => {
          if (inputId) {
            const input = document.getElementById(inputId);
            if (input) (input as HTMLElement).focus();
          }
        }, inventtableInfo.id);
      }

      // Navigate to first row and select via Tab (exact bot flow)
      await page.keyboard.press("ArrowDown");
      await wait(30);
      await page.keyboard.press("Tab"); // Select variant + move to qty

      // Wait for variant selection callback (exact bot code)
      await waitForDevExpressIdle(page, 8000);

      // ── STEP 5: Handle quantity (exact bot flow) ──
      const currentQty = await page.evaluate(() => {
        const f = document.activeElement as HTMLInputElement;
        return { value: f?.value || "", id: f?.id || "" };
      });
      logger.info(`→ Qty field: "${currentQty.value}" (${currentQty.id})`);

      const qtyNum = Number.parseFloat(currentQty.value.replace(",", "."));
      if (!Number.isFinite(qtyNum) || Math.abs(qtyNum - QUANTITY) >= 0.01) {
        logger.info(`  Setting qty: ${currentQty.value} → ${QUANTITY}`);
        await page.evaluate(() => {
          const input = document.activeElement as HTMLInputElement;
          if (input?.select) input.select();
        });
        await page.keyboard.type(QUANTITY.toString(), { delay: 30 });
        // Wait for qty callback
        await waitForDevExpressIdle(page, 5000);
      }

      // Verify quantity
      const verifyQty = await page.evaluate(() => {
        const f = document.activeElement as HTMLInputElement;
        return f?.value || "";
      });
      logger.info(`  Qty verified: "${verifyQty}"`);

      // ══════════════════════════════════════════════
      // DISCOUNT ENTRY — THE CRITICAL TEST
      // ══════════════════════════════════════════════
      const beforeDump = await dumpState(page, `Art${i + 1} BEFORE discount (${approachName})`);
      await page.screenshot({ path: path.join(LOGS_DIR, `e2e-art${i + 1}-before-disc-${Date.now()}.png`) });

      let discountResult: { ok: boolean; error?: string };

      if (approachName === "editTableCell") {
        discountResult = await approach_editTableCell(page, DISCOUNT);
      } else if (approachName === "ctrl.SetValue") {
        discountResult = await approach_devexpressControlSetValue(page, DISCOUNT);
      } else if (approachName === "ctrl.SetText") {
        discountResult = await approach_devexpressControlSetText(page, DISCOUNT);
      } else {
        discountResult = await approach_nativeValueSetter(page, DISCOUNT);
      }

      logger.info(`  Approach "${approachName}": ${discountResult.ok ? "✅" : "❌"} ${discountResult.error || ""}`);

      const afterDump = await dumpState(page, `Art${i + 1} AFTER discount (${approachName})`);
      await page.screenshot({ path: path.join(LOGS_DIR, `e2e-art${i + 1}-after-disc-${Date.now()}.png`) });

      // ── STEP 6: UpdateEdit (exact bot flow: DOM click primary) ──
      logger.info(`→ UpdateEdit`);
      let updateDone = false;

      // DOM click (exact bot: clickDevExpressGridCommand pattern)
      const updateBtn = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        for (const img of imgs) {
          const alt = img.getAttribute("alt") || "";
          const id = img.id || "";
          if ((alt === "Update" || id.includes("DXCBtn0")) && img.offsetParent !== null) {
            const btn = img.closest("td") || img.parentElement;
            if (btn && (btn as HTMLElement).offsetParent !== null) {
              (btn as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });
      if (updateBtn) {
        updateDone = true;
        // Exact bot code: waitForGridCallback + waitForDevExpressIdle
        await waitForGridCallback(page, gridName, 20000);
        await waitForDevExpressIdle(page, 4000);
        logger.info("  ✅ UpdateEdit (DOM)");
      }

      if (!updateDone) {
        await page.evaluate((gName: string) => {
          const w = window as any;
          const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
          if (grid?.UpdateEdit) grid.UpdateEdit();
        }, gridName);
        await waitForGridCallback(page, gridName, 20000);
        await waitForDevExpressIdle(page);
        logger.info("  ✅ UpdateEdit (API fallback)");
      }

      await wait(200);
      const afterUpdateDump = await dumpState(page, `Art${i + 1} AFTER UpdateEdit`);

      // Check if discount persisted in saved row
      const savedCheck = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).filter((r) => (r as HTMLElement).offsetParent !== null);
        const lastRow = rows[rows.length - 1];
        if (!lastRow) return { rowCount: 0, cells: [] };
        const cells = Array.from(lastRow.querySelectorAll("td")).map((c, idx) => ({ idx, text: c.textContent?.trim() || "" }));
        return { rowCount: rows.length, cells };
      });
      logger.info(`  Saved row (${savedCheck.rowCount} rows): ${savedCheck.cells.map((c: any) => `[${c.idx}]"${c.text}"`).join(" ")}`);

      // ── STEP 7: AddNewRow for next article (if not last) ──
      let inventtableFocusForNext: boolean | null = null;

      if (i < NUM_ARTICLES - 1) {
        logger.info(`→ AddNewRow for article ${i + 2}`);

        // Wait for edit row to close (exact bot code)
        try {
          await page.waitForFunction(() => {
            const rows = Array.from(document.querySelectorAll('tr[id*="editnew"]')).filter((r) => (r as HTMLElement).offsetParent !== null);
            return rows.length === 0;
          }, { timeout: 3000 });
        } catch { logger.warn("  Edit row still visible"); }

        // DOM click AddNew (exact bot flow)
        let addNewDone = false;
        const newBtnOk = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll("img"));
          for (const img of imgs) {
            const alt = img.getAttribute("alt") || "";
            const id = img.id || "";
            if ((alt === "New" || id.includes("DXCBtn1")) && img.offsetParent !== null) {
              const btn = img.closest("td") || img.parentElement;
              if (btn && (btn as HTMLElement).offsetParent !== null) { (btn as HTMLElement).click(); return true; }
            }
          }
          return false;
        });
        if (newBtnOk) { addNewDone = true; }
        if (!addNewDone) {
          await page.evaluate((gName: string) => {
            const w = window as any;
            const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
            if (grid?.AddNewRow) grid.AddNewRow();
          }, gridName);
        }

        // Wait for new edit row (exact bot code)
        try {
          await page.waitForFunction(() => document.querySelectorAll('tr[id*="editnew"]').length > 0, { timeout: 5000, polling: 100 });
        } catch { logger.warn("  editnew row not detected"); }

        await waitForDevExpressIdle(page);
        await wait(1000);

        // Check INVENTTABLE availability
        const nextCheck = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'));
          const visible = inputs.filter((inp) => (inp as HTMLElement).offsetParent !== null && (inp as HTMLElement).offsetWidth > 0);
          return { visibleCount: visible.length, focusedId: (document.activeElement as HTMLInputElement)?.id || "none" };
        });
        inventtableFocusForNext = nextCheck.visibleCount > 0;
        logger.info(`  INVENTTABLE for article ${i + 2}: visible=${nextCheck.visibleCount} focusedId=${nextCheck.focusedId}`);
      }

      results.push({
        article: i + 1,
        approach: approachName,
        discountSet: discountResult.ok,
        discountValueBefore: beforeDump.discount?.value || "",
        discountValueAfter: afterDump.discount?.value || "",
        inventtableFocusForNext,
        error: discountResult.error,
      });
    }

    // ═══ SUMMARY ═══
    logger.info(`\n${"═".repeat(60)}`);
    logger.info("═══ RESULTS SUMMARY ═══");
    logger.info(`${"═".repeat(60)}`);

    for (const r of results) {
      const discStatus = r.discountValueAfter !== r.discountValueBefore && r.discountValueAfter !== "0,00 %" ? "✅ CHANGED" : "❌ UNCHANGED";
      const invStatus = r.inventtableFocusForNext === null ? "N/A" : r.inventtableFocusForNext ? "✅ OK" : "❌ FAIL";
      logger.info(`  Art ${r.article} [${r.approach}]: discount ${r.discountValueBefore}→${r.discountValueAfter} ${discStatus} | Next INVENTTABLE: ${invStatus}${r.error ? ` | error: ${r.error}` : ""}`);
    }

    logger.info("\n═══ RECOMMENDATION ═══");
    const working = results.filter((r) => {
      const changed = r.discountValueAfter !== r.discountValueBefore && r.discountValueAfter !== "0,00 %";
      const noFocusIssue = r.inventtableFocusForNext !== false;
      return changed && noFocusIssue;
    });
    if (working.length > 0) {
      logger.info(`✅ Working approach(es): ${working.map((r) => r.approach).join(", ")}`);
    } else {
      logger.info("❌ No approach both sets the discount AND preserves INVENTTABLE focus.");
      logger.info("   Need to explore alternative strategies (e.g., Tab navigation to discount cell).");
    }

    // Cleanup
    try {
      await page.evaluate((gName: string) => {
        const w = window as any;
        const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
        if (grid?.CancelEdit) grid.CancelEdit();
      }, gridName);
    } catch {}

  } catch (error) {
    logger.error("❌ FATAL ERROR", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    try { if (bot.page) await bot.page.screenshot({ path: path.join(LOGS_DIR, `e2e-fatal-${Date.now()}.png`), fullPage: true }); } catch {}
  } finally {
    // Save JSON report
    const reportPath = path.join(LOGS_DIR, `discount-e2e-v2-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    logger.info(`\n📄 Report: ${reportPath}`);
    await bot.close();
  }
}

testDiscountE2E();
