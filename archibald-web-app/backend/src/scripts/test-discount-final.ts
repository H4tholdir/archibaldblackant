#!/usr/bin/env tsx
/**
 * TEST: Simula il flusso manuale dell'utente per 5 articoli identici.
 *
 * Flow per ogni articolo:
 * 1. AddNewRow → focus INVENTTABLE (input unico template editor)
 * 2. Inserisci codice articolo → seleziona variante → quantità
 * 3. Doppio click sulla cella sconto → type valore
 * 4. Click su Update (floppy)
 *
 * Usage:
 *   cd archibald-web-app/backend
 *   npx tsx src/scripts/test-discount-final.ts
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import fs from "fs";
import path from "path";

const CUSTOMER = "Fresis Soc Cooperativa";
const ARTICLE = "TD1272.314.";
const QUANTITY = 1;
const DISCOUNT = "63";
const NUM_ARTICLES = 5;

const LOGS_DIR = path.join(process.cwd(), "logs");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForIdle(page: any, timeout = 5000) {
  try {
    await page.waitForFunction(
      () => {
        const w = window as any;
        const col = w.ASPxClientControl?.GetControlCollection?.();
        if (!col || typeof col.ForEachControl !== "function") return true;
        let busy = false;
        col.ForEachControl((c: any) => {
          try { if (c.InCallback?.()) busy = true; } catch {}
        });
        return !busy;
      },
      { timeout, polling: 100 },
    );
  } catch {}
}

async function waitForGrid(page: any, gridName: string, timeout = 15000) {
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
  } catch {}
}

async function findVisibleInput(page: any, idFragment: string) {
  return page.evaluate((frag: string) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const inp = inputs.find((el) => {
      const id = el.id.toUpperCase();
      return id.includes(frag.toUpperCase()) && id.includes("SALESLINE") && el.offsetParent !== null && el.offsetWidth > 0;
    });
    if (!inp) return null;
    inp.scrollIntoView({ block: "center" });
    const r = inp.getBoundingClientRect();
    return { id: inp.id, x: r.x + r.width / 2, y: r.y + r.height / 2, value: inp.value };
  }, idFragment);
}

async function run() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  const results: any[] = [];
  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    const page = bot.page!;

    // Login
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

    // Navigate to new order
    await page.goto(`${config.archibald.url}/SALESTABLE_ListView_Agent/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll("span, button, a")).some((el) => el.textContent?.trim().toLowerCase() === "nuovo"), { timeout: 15000 });
    const urlBefore = page.url();
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button, a, span")).find((e) => e.textContent?.trim().toLowerCase() === "nuovo"); if (b) (b as HTMLElement).click(); });
    await page.waitForFunction((old: string) => window.location.href !== old, { timeout: 10000 }, urlBefore);
    await page.waitForFunction(() => !!(window as any).ASPxClientControl?.GetControlCollection, { timeout: 15000 });
    await wait(2000);

    // Find grid
    const gridName = await page.evaluate(() => {
      const w = window as any; let f = "";
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
    await page.click(ci.btn); await wait(500);
    const ss = `#${ci.baseId}_DDD_gv_DXSE_I`;
    await page.waitForFunction((s: string) => { const i = document.querySelector(s) as HTMLInputElement; return i && i.offsetParent !== null; }, { timeout: 5000, polling: 50 }, ss);
    await page.evaluate((s: string, v: string) => {
      const i = document.querySelector(s) as HTMLInputElement; if (!i) return; i.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (set) set.call(i, v); else i.value = v;
      i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true }));
      i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    }, ss, CUSTOMER);
    await page.waitForFunction(() => !!Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite')).find((n) => (n as HTMLElement).offsetParent !== null && n.querySelector('tr[class*="dxgvDataRow"]')), { timeout: 8000, polling: 100 });
    await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite')).find((n) => (n as HTMLElement).offsetParent !== null && n.querySelector('tr[class*="dxgvDataRow"]'));
      if (!c) return;
      const r = Array.from(c.querySelectorAll('tr[class*="dxgvDataRow"]')).filter((r) => (r as HTMLElement).offsetParent !== null);
      if (r[0]) { (r[0].querySelector("td") || r[0] as HTMLElement).click(); }
    });
    await waitForIdle(page); await wait(2000);
    logger.info("✅ Customer selected");

    // LINEDISC = N/A
    await page.evaluate(() => { const l = Array.from(document.querySelectorAll("a.dxtc-link, span.dx-vam")); for (const e of l) { const t = e.textContent?.trim() || ""; if (t.includes("Prezzi") && t.includes("sconti")) { const c = e.tagName === "A" ? e : e.parentElement; if (c && (c as HTMLElement).offsetParent !== null) { (c as HTMLElement).click(); return; } } } });
    await wait(1500);
    try {
      await page.waitForFunction(() => { const i = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement; return i && i.offsetParent !== null; }, { timeout: 8000, polling: 200 });
      await page.evaluate(() => {
        const i = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement; if (!i) return;
        i.scrollIntoView({ block: "center" }); i.focus(); i.click();
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (set) set.call(i, "N/A"); else i.value = "N/A";
        i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.keyboard.press("Tab"); await waitForIdle(page);
      logger.info("✅ LINEDISC = N/A");
    } catch { logger.warn("LINEDISC not found"); }

    // ═══ 5 ARTICLES ═══
    for (let i = 0; i < NUM_ARTICLES; i++) {
      logger.info(`\n═══ ART ${i + 1}/${NUM_ARTICLES} ═══`);
      const artResult: any = { article: i + 1 };

      // Come il bot reale: attendi chiusura edit row prima di AddNewRow
      if (i > 0) {
        try {
          await page.waitForFunction(() => {
            const editRows = Array.from(document.querySelectorAll('tr[id*="editnew"]')).filter(
              (row) => (row as HTMLElement).offsetParent !== null
            );
            return editRows.length === 0;
          }, { timeout: 3000 });
          logger.info("  Edit row chiusa");
        } catch {
          logger.warn("  Edit row ancora visibile, procedo");
        }
      }

      // AddNewRow via DOM click (come il bot reale), fallback API
      let addNewDone = false;
      const addNewBtn = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('a[data-args*="AddNew"]')).find((el) => {
          const h = el as HTMLElement;
          const s = window.getComputedStyle(h);
          return s.display !== "none" && s.visibility !== "hidden" && h.getBoundingClientRect().width > 0;
        }) as HTMLElement | undefined;
        if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return true; }
        return false;
      });
      if (addNewBtn) {
        addNewDone = true;
        logger.info("  AddNewRow via DOM click");
      }
      if (!addNewDone) {
        await page.evaluate((g: string) => {
          const w = window as any;
          const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g);
          if (grid?.AddNewRow) grid.AddNewRow();
        }, gridName);
        logger.info("  AddNewRow via API (fallback)");
      }
      await waitForGrid(page, gridName, 10000);
      await waitForIdle(page);
      await wait(1500);

      // INVENTTABLE focus — focus via JS (evita click su riga salvata sovrapposta)
      const inv = await findVisibleInput(page, "INVENTTABLE");
      let focused = false;
      if (inv) {
        logger.info(`  INVENTTABLE trovato: value="${inv.value}" id=${inv.id.slice(-40)}`);
        // Focus diretto via JS — il mouse.click a queste coordinate potrebbe
        // colpire la riga salvata (z-index) e aprire il popup "Linea di vendita"
        await page.evaluate((id: string) => {
          const el = document.getElementById(id) as HTMLInputElement;
          if (el) { el.scrollIntoView({ block: "center" }); el.focus(); el.click(); }
        }, inv.id);
        await wait(200);
        focused = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id?.toUpperCase().includes("INVENTTABLE") || false);
      }
      if (!focused) {
        await page.keyboard.press("Tab"); await wait(300);
        focused = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id?.toUpperCase().includes("INVENTTABLE") || false);
      }

      artResult.inventtableFocused = focused;
      if (!focused) {
        const fid = await page.evaluate(() => (document.activeElement as HTMLInputElement)?.id || "none");
        logger.error(`❌ INVENTTABLE FOCUS FAILED art ${i + 1}, focused: ${fid}`);
        await page.screenshot({ path: path.join(LOGS_DIR, `final5-fail-${i + 1}-${Date.now()}.png`), fullPage: true });
        results.push(artResult);
        break;
      }
      logger.info("  ✅ INVENTTABLE focused");

      // Type article code
      const prefix = ARTICLE.slice(0, -1);
      await page.evaluate((t: string) => {
        const i = document.activeElement as HTMLInputElement;
        if (i?.tagName === "INPUT") { i.value = t; i.dispatchEvent(new Event("input", { bubbles: true })); }
      }, prefix);
      await page.keyboard.type(ARTICLE.slice(-1), { delay: 30 });
      await page.waitForSelector('tr[id*="DXDataRow"]', { timeout: 5000 });
      await waitForIdle(page);

      // Variant selection (ArrowDown to select first, Tab to confirm)
      if (inv) await page.evaluate((id: string) => { const i = document.getElementById(id); if (i) (i as HTMLElement).focus(); }, inv.id);
      await page.keyboard.press("ArrowDown"); await wait(30);
      await page.keyboard.press("Tab");
      await waitForIdle(page, 8000); await wait(1000);

      // Quantity
      const qty = await page.evaluate(() => { const f = document.activeElement as HTMLInputElement; return f?.value || ""; });
      const qn = Number.parseFloat(qty.replace(",", "."));
      if (!Number.isFinite(qn) || Math.abs(qn - QUANTITY) >= 0.01) {
        await page.evaluate(() => { const i = document.activeElement as HTMLInputElement; if (i?.select) i.select(); });
        await page.keyboard.type(QUANTITY.toString(), { delay: 30 });
        await waitForIdle(page, 5000);
      }

      // ═══ SCONTO: Doppio click + paste + Enter ═══
      const disc = await findVisibleInput(page, "MANUALDISCOUNT");
      if (disc) {
        logger.info(`  MANUALDISCOUNT trovato: value="${disc.value}" @ (${Math.round(disc.x)}, ${Math.round(disc.y)})`);

        // Doppio click sulla cella sconto
        await page.mouse.click(disc.x, disc.y, { clickCount: 2 });
        await wait(300);

        // Seleziona tutto e incolla il valore direttamente
        await page.keyboard.down("Meta");
        await page.keyboard.press("a");
        await page.keyboard.up("Meta");
        await wait(50);
        await page.evaluate((val: string) => {
          document.execCommand("insertText", false, val);
        }, DISCOUNT);
        await wait(200);

        // Enter per confermare il valore
        await page.keyboard.press("Enter");
        await wait(500);

        const discAfter = await page.evaluate((id: string) => (document.getElementById(id) as HTMLInputElement)?.value || "", disc.id);
        artResult.discountBefore = disc.value;
        artResult.discountAfter = discAfter;
        artResult.discountSet = true;
        logger.info(`  ✅ Sconto: "${disc.value}" → "${discAfter}"`);
      } else {
        artResult.discountSet = false;
        logger.error("  ❌ MANUALDISCOUNT non trovato");
      }

      // ═══ Update (floppy) ═══
      const updateClicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('a[data-args*="UpdateEdit"]')).find((el) => {
          const h = el as HTMLElement;
          const s = window.getComputedStyle(h);
          return s.display !== "none" && s.visibility !== "hidden" && h.getBoundingClientRect().width > 0;
        }) as HTMLElement | undefined;
        if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return true; }
        return false;
      });
      if (!updateClicked) {
        await page.evaluate((g: string) => {
          const w = window as any;
          const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g);
          if (grid?.UpdateEdit) grid.UpdateEdit();
        }, gridName);
      }
      await waitForGrid(page, gridName, 20000);
      await waitForIdle(page, 4000);
      await wait(2000);
      logger.info(`  ✅ UpdateEdit`);

      // Check saved rows
      const rowCount = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("tr")).filter((r) =>
          (r.className.includes("dxgvDataRow") || r.className.includes("dxgvFocusedRow") || r.className.includes("dxgvSelectedRow")) && (r as HTMLElement).offsetParent !== null
        ).length;
      });
      artResult.savedRows = rowCount;
      logger.info(`  Righe salvate: ${rowCount}`);

      // Screenshot per ogni articolo
      await page.screenshot({ path: path.join(LOGS_DIR, `final5-art${i + 1}-${Date.now()}.png`), fullPage: true });

      results.push(artResult);
    }

    // Screenshot finale
    await page.screenshot({ path: path.join(LOGS_DIR, `final5-complete-${Date.now()}.png`), fullPage: true });

    const logPath = path.join(LOGS_DIR, `discount-final5-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
    logger.info(`\n═══ RISULTATI ═══`);
    for (const r of results) {
      logger.info(`Art ${r.article}: INV=${r.inventtableFocused ? "✅" : "❌"} | Sconto=${r.discountSet ? "✅" : "❌"} ${r.discountBefore || ""} → ${r.discountAfter || ""} | Righe=${r.savedRows}`);
    }
    logger.info(`═══ TEST COMPLETE ═══`);

    // Cleanup
    try {
      await page.evaluate((g: string) => {
        const w = window as any;
        const grid = w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g);
        if (grid?.CancelEdit) grid.CancelEdit();
      }, gridName);
    } catch {}
  } catch (error) {
    logger.error("❌ FATAL", { error: error instanceof Error ? error.message : String(error) });
    try { if (bot.page) await bot.page.screenshot({ path: path.join(LOGS_DIR, `final5-fatal-${Date.now()}.png`), fullPage: true }); } catch {}
  } finally {
    await bot.close();
  }
}

run();
