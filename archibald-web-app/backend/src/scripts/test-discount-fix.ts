#!/usr/bin/env tsx
/**
 * Quick verification test: editTableCell + focus restore to QTYORDERED before UpdateEdit.
 *
 * Theory: editTableCell moves focus to MANUALDISCOUNT. If we restore focus to
 * QTYORDERED before UpdateEdit, DevExpress's internal state machine resets properly
 * and INVENTTABLE focus works for the next article.
 *
 * Tests 3 articles with editTableCell + focus restore.
 *
 * Usage:
 *   cd archibald-web-app/backend
 *   npx tsx src/scripts/test-discount-fix.ts
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
const NUM_ARTICLES = 3;

const LOGS_DIR = path.join(process.cwd(), "logs");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForDevExpressIdle(page: any, timeout = 5000) {
  try {
    await page.waitForFunction(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (!col || typeof col.ForEachControl !== "function") return true;
      let busy = false;
      col.ForEachControl((c: any) => {
        try { if (c.InCallback?.()) busy = true; } catch {}
        try { const gv = c.GetGridView?.(); if (gv?.InCallback?.()) busy = true; } catch {}
      });
      return !busy;
    }, { timeout, polling: 100 });
  } catch {}
}

async function waitForGridCallback(page: any, gridName: string, timeout = 15000) {
  try {
    await page.waitForFunction((gName: string) => {
      const w = window as any;
      const grid = w[gName] || w.ASPxClientControl?.GetControlCollection()?.Get(gName);
      return grid && !grid.InCallback();
    }, { timeout, polling: 100 }, gridName);
  } catch {}
}

async function testDiscountFix() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  logger.info("═══ TEST: editTableCell + FOCUS RESTORE to QTYORDERED ═══");

  const bot = new ArchibaldBot();

  try {
    // Login
    await bot.initialize();
    const page = bot.page!;
    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await page.evaluate((u: string, p: string) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
      const user = inputs.find((i) => i.id.includes("UserName")) || inputs[0];
      const pass = document.querySelector('input[type="password"]') as HTMLInputElement;
      if (!user || !pass) return;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (set) { set.call(user, u); set.call(pass, p); }
      user.dispatchEvent(new Event("input", { bubbles: true }));
      user.dispatchEvent(new Event("change", { bubbles: true }));
      pass.dispatchEvent(new Event("input", { bubbles: true }));
      pass.dispatchEvent(new Event("change", { bubbles: true }));
      const btn = Array.from(document.querySelectorAll("button, a")).find((b) => (b.textContent || "").toLowerCase().trim() === "accedi");
      if (btn) (btn as HTMLElement).click();
    }, config.archibald.username, config.archibald.password);
    try { await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }); } catch {}
    if (page.url().includes("Login.aspx")) throw new Error("Login failed");
    await wait(1000);
    logger.info("✅ Login OK");

    // Navigate + create order
    await page.goto(`${config.archibald.url}/SALESTABLE_ListView_Agent/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll("span, button, a")).some((el) => el.textContent?.trim().toLowerCase() === "nuovo"), { timeout: 15000 });
    const urlBefore = page.url();
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button, a, span")).find((e) => e.textContent?.trim().toLowerCase() === "nuovo"); if (b) (b as HTMLElement).click(); });
    await page.waitForFunction((old: string) => window.location.href !== old, { timeout: 10000 }, urlBefore);
    await page.waitForFunction(() => !!(window as any).ASPxClientControl?.GetControlCollection, { timeout: 15000 });
    await wait(2000);

    // Find grid
    const gridName = await page.evaluate(() => {
      const w = window as any;
      let f = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        if (c.name?.includes("dviSALESLINEs") && typeof c.AddNewRow === "function") f = c.name;
      });
      return f;
    });
    logger.info(`Grid: ${gridName}`);

    // Select customer
    const ci = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const c = inputs.find((i) => { const id = (i as HTMLInputElement).id.toLowerCase(); return (id.includes("custtable") || id.includes("account") || id.includes("profilo")) && !(i as HTMLInputElement).disabled && (i as HTMLElement).getBoundingClientRect().height > 0; }) as HTMLInputElement;
      if (!c) return null;
      const baseId = c.id.endsWith("_I") ? c.id.slice(0, -2) : c.id;
      for (const s of [`${baseId}_B-1`, `${baseId}_B-1Img`, `${baseId}_B`]) { const b = document.getElementById(s); if (b && (b as HTMLElement).offsetParent !== null) return { baseId, btn: `#${s}` }; }
      return null;
    });
    if (!ci?.btn) throw new Error("Customer not found");
    await page.click(ci.btn);
    await wait(500);
    const ss = `#${ci.baseId}_DDD_gv_DXSE_I`;
    await page.waitForFunction((s: string) => { const i = document.querySelector(s) as HTMLInputElement; return i && i.offsetParent !== null; }, { timeout: 5000, polling: 50 }, ss);
    await page.evaluate((s: string, v: string) => {
      const i = document.querySelector(s) as HTMLInputElement;
      if (!i) return; i.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (set) set.call(i, v); else i.value = v;
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    }, ss, CUSTOMER);
    await page.waitForFunction(() => !!Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite')).find((n) => (n as HTMLElement).offsetParent !== null && n.querySelector('tr[class*="dxgvDataRow"]')), { timeout: 8000, polling: 100 });
    await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite')).find((n) => (n as HTMLElement).offsetParent !== null && n.querySelector('tr[class*="dxgvDataRow"]'));
      if (!c) return;
      const r = Array.from(c.querySelectorAll('tr[class*="dxgvDataRow"]')).filter((r) => (r as HTMLElement).offsetParent !== null);
      if (r[0]) { const t = r[0].querySelector("td") || r[0]; (t as HTMLElement).click(); }
    });
    await waitForDevExpressIdle(page);
    await wait(2000);
    logger.info("✅ Customer selected");

    // Set LINEDISC to N/A
    await page.evaluate(() => { const l = Array.from(document.querySelectorAll("a.dxtc-link, span.dx-vam")); for (const e of l) { const t = e.textContent?.trim() || ""; if (t.includes("Prezzi") && t.includes("sconti")) { const c = e.tagName === "A" ? e : e.parentElement; if (c && (c as HTMLElement).offsetParent !== null) { (c as HTMLElement).click(); return; } } } });
    await wait(1500);
    try {
      await page.waitForFunction(() => { const i = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement; return i && i.offsetParent !== null; }, { timeout: 8000, polling: 200 });
      await page.evaluate(() => {
        const i = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement;
        if (!i) return; i.scrollIntoView({ block: "center" }); i.focus(); i.click();
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (set) set.call(i, "N/A"); else i.value = "N/A";
        i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.keyboard.press("Tab");
      await waitForDevExpressIdle(page);
      logger.info("✅ LINEDISC = N/A");
    } catch { logger.warn("LINEDISC not found"); }

    // ═══ ARTICLE LOOP ═══
    for (let i = 0; i < NUM_ARTICLES; i++) {
      logger.info(`\n═══ ARTICLE ${i + 1}/${NUM_ARTICLES} ═══`);

      // AddNewRow
      if (i === 0) {
        await page.evaluate((g: string) => { const w = window as any; const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g); if (grid?.AddNewRow) grid.AddNewRow(); }, gridName);
        await waitForDevExpressIdle(page);
        await wait(1500);
      }

      // Focus INVENTTABLE
      let focused = false;
      const inv = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'));
        for (const inp of inputs) { const el = inp as HTMLElement; if (el.offsetParent !== null && el.offsetWidth > 0) { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { id: (inp as HTMLInputElement).id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; } }
        return null;
      });
      if (inv) {
        await page.mouse.click(inv.x, inv.y);
        await wait(150);
        focused = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id?.includes("INVENTTABLE") || false);
      }
      if (!focused) {
        // Try clicking the N/A cell
        const naCell = await page.evaluate(() => {
          const row = document.querySelector('tr[id*="editnew"]');
          if (!row) return null;
          for (const cell of Array.from(row.querySelectorAll("td"))) {
            if ((cell.textContent?.trim() || "").includes("N/A") || cell.querySelector('[class*="dxeDropDown"]')) {
              const r = cell.getBoundingClientRect();
              if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          return null;
        });
        if (naCell) { await page.mouse.click(naCell.x, naCell.y); await wait(500); focused = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id?.includes("INVENTTABLE") || false); }
      }
      if (!focused) {
        const debug = await page.evaluate(() => ({
          focusedId: (document.activeElement as HTMLInputElement)?.id || "none",
          inv: Array.from(document.querySelectorAll('input[id*="INVENTTABLE"]')).map((i) => ({ id: (i as HTMLInputElement).id, vis: (i as HTMLElement).offsetParent !== null, w: (i as HTMLElement).offsetWidth })),
        }));
        await page.screenshot({ path: path.join(LOGS_DIR, `fix-inv-fail-${i + 1}-${Date.now()}.png`), fullPage: true });
        logger.error(`❌ INVENTTABLE FOCUS FAILED article ${i + 1}`, debug);
        break;
      }
      logger.info("  ✅ INVENTTABLE focused");

      // Type article
      const pp = ARTICLE.slice(0, -1);
      await page.evaluate((t: string) => { const i = document.activeElement as HTMLInputElement; if (i?.tagName === "INPUT") { i.value = t; i.dispatchEvent(new Event("input", { bubbles: true })); } }, pp);
      await page.keyboard.type(ARTICLE.slice(-1), { delay: 30 });
      await page.waitForSelector('tr[id*="DXDataRow"]', { timeout: 5000 });
      await waitForDevExpressIdle(page);

      // Select variant
      if (inv) await page.evaluate((id: string) => { const i = document.getElementById(id); if (i) (i as HTMLElement).focus(); }, inv.id);
      await page.keyboard.press("ArrowDown");
      await wait(30);
      await page.keyboard.press("Tab");
      await waitForDevExpressIdle(page, 8000);

      // Quantity
      const qty = await page.evaluate(() => { const f = document.activeElement as HTMLInputElement; return { v: f?.value || "", id: f?.id || "" }; });
      const qn = Number.parseFloat(qty.v.replace(",", "."));
      if (!Number.isFinite(qn) || Math.abs(qn - QUANTITY) >= 0.01) {
        await page.evaluate(() => { const i = document.activeElement as HTMLInputElement; if (i?.select) i.select(); });
        await page.keyboard.type(QUANTITY.toString(), { delay: 30 });
        await waitForDevExpressIdle(page, 5000);
      }

      // ═══ DISCOUNT via editTableCell approach ═══
      const discId = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        const d = inputs.find((i) => i.id.toLowerCase().includes("manualdiscount") && i.id.toLowerCase().includes("salesline") && i.offsetParent !== null);
        return d?.id || null;
      });

      if (discId) {
        // Step 1: double-click to enter edit mode
        await page.evaluate((id: string) => {
          const inp = document.querySelector(`#${id}`) as HTMLInputElement;
          if (!inp) return;
          inp.focus();
          inp.dispatchEvent(new MouseEvent("dblclick", { view: window, bubbles: true, cancelable: true, detail: 2 }));
          const s = Date.now(); while (Date.now() - s < 150) {}
        }, discId);
        await wait(300);

        // Step 2: select + type
        await page.evaluate((id: string) => {
          const inp = document.querySelector(`#${id}`) as HTMLInputElement;
          if (inp) { inp.focus(); inp.select(); }
        }, discId);
        await wait(100);
        await page.keyboard.press("Backspace");
        await wait(50);
        await page.keyboard.type(DISCOUNT.toString(), { delay: 30 });
        await wait(300);

        const discVal = await page.evaluate((id: string) => (document.querySelector(`#${id}`) as HTMLInputElement)?.value || "", discId);
        logger.info(`  ✅ Discount set: "${discVal}"`);

        // ═══ THE FIX: Restore focus to QTYORDERED before UpdateEdit ═══
        logger.info("  → RESTORING FOCUS to QTYORDERED...");
        const qtyId = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
          const q = inputs.find((i) => i.id.toLowerCase().includes("qtyordered") && i.id.toLowerCase().includes("salesline") && i.offsetParent !== null);
          return q?.id || null;
        });
        if (qtyId) {
          // Click on QTYORDERED to restore focus
          const qtyCoord = await page.evaluate((id: string) => {
            const el = document.querySelector(`#${id}`) as HTMLElement;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }, qtyId);
          if (qtyCoord) {
            await page.mouse.click(qtyCoord.x, qtyCoord.y);
            await wait(200);
          }
          const nowFocused = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id || "none");
          logger.info(`  Focus after restore: ${nowFocused}`);
        }
      }

      // UpdateEdit
      const upd = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        for (const img of imgs) { if ((img.getAttribute("alt") === "Update" || img.id.includes("DXCBtn0")) && img.offsetParent !== null) { const b = img.closest("td") || img.parentElement; if (b) { (b as HTMLElement).click(); return true; } } }
        return false;
      });
      if (upd) {
        await waitForGridCallback(page, gridName, 20000);
        await waitForDevExpressIdle(page, 4000);
      } else {
        await page.evaluate((g: string) => { const w = window as any; const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g); if (grid?.UpdateEdit) grid.UpdateEdit(); }, gridName);
        await waitForGridCallback(page, gridName, 20000);
        await waitForDevExpressIdle(page);
      }
      logger.info("  ✅ UpdateEdit");

      // Check saved row for discount
      const savedRow = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]')).filter((r) => (r as HTMLElement).offsetParent !== null);
        const last = rows[rows.length - 1];
        if (!last) return "no rows";
        return Array.from(last.querySelectorAll("td")).map((c) => c.textContent?.trim()).join(" | ");
      });
      logger.info(`  Saved row: ${savedRow}`);

      // AddNewRow for next
      if (i < NUM_ARTICLES - 1) {
        try { await page.waitForFunction(() => Array.from(document.querySelectorAll('tr[id*="editnew"]')).filter((r) => (r as HTMLElement).offsetParent !== null).length === 0, { timeout: 3000 }); } catch {}
        const newOk = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll("img"));
          for (const img of imgs) { if ((img.getAttribute("alt") === "New" || img.id.includes("DXCBtn1")) && img.offsetParent !== null) { const b = img.closest("td") || img.parentElement; if (b) { (b as HTMLElement).click(); return true; } } }
          return false;
        });
        if (!newOk) {
          await page.evaluate((g: string) => { const w = window as any; const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g); if (grid?.AddNewRow) grid.AddNewRow(); }, gridName);
        }
        try { await page.waitForFunction(() => document.querySelectorAll('tr[id*="editnew"]').length > 0, { timeout: 5000, polling: 100 }); } catch {}
        await waitForDevExpressIdle(page);
        await wait(1000);

        const nextFocus = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id || "none");
        logger.info(`  Focus after AddNewRow: ${nextFocus}`);
      }
    }

    logger.info("\n═══ TEST COMPLETE ═══");

    // Cleanup
    try { await page.evaluate((g: string) => { const w = window as any; const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g); if (grid?.CancelEdit) grid.CancelEdit(); }, gridName); } catch {}

  } catch (error) {
    logger.error("❌ FATAL", { error: error instanceof Error ? error.message : String(error) });
    try { if (bot.page) await bot.page.screenshot({ path: path.join(LOGS_DIR, `fix-fatal-${Date.now()}.png`), fullPage: true }); } catch {}
  } finally {
    await bot.close();
  }
}

testDiscountFix();
