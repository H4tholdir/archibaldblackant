#!/usr/bin/env tsx
/**
 * E2E Test: Explore DevExpress ASPxClientEdit controls for MANUALDISCOUNT
 *
 * The problem: editTableCell types "63" into the MANUALDISCOUNT input DOM element,
 * but DevExpress's UpdateEdit callback does NOT include the value because:
 * - MANUALDISCOUNT is a TEMPLATE editor (grid.GetEditor returns null)
 * - keyboard.type() changes the DOM input but NOT the ASPxClientEdit control's internal value
 * - When UpdateEdit serializes the form, it reads from the control, not the DOM
 *
 * This test:
 * 1. Discovers all ASPxClientEdit controls in the edit row
 * 2. Identifies the MANUALDISCOUNT control
 * 3. Tests multiple approaches to set its value through DevExpress's API
 * 4. Verifies which approach actually persists via UpdateEdit
 *
 * Usage:
 *   cd archibald-web-app/backend
 *   npx tsx src/scripts/test-discount-devexpress-ctrl.ts
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
          try {
            if (c.InCallback?.()) busy = true;
          } catch {}
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
        const grid =
          w[gName] ||
          w.ASPxClientControl?.GetControlCollection()?.Get(gName);
        return grid && !grid.InCallback();
      },
      { timeout, polling: 100 },
      gridName,
    );
  } catch {}
}

async function run() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  const results: any[] = [];
  const bot = new ArchibaldBot();

  try {
    // ═══ LOGIN ═══
    await bot.initialize();
    const page = bot.page!;
    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await page.evaluate(
      (u: string, p: string) => {
        const inputs = Array.from(
          document.querySelectorAll('input[type="text"]'),
        ) as HTMLInputElement[];
        const user =
          inputs.find((i) => i.id.includes("UserName")) || inputs[0];
        const pass = document.querySelector(
          'input[type="password"]',
        ) as HTMLInputElement;
        if (!user || !pass) return;
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (set) {
          set.call(user, u);
          set.call(pass, p);
        }
        user.dispatchEvent(new Event("input", { bubbles: true }));
        user.dispatchEvent(new Event("change", { bubbles: true }));
        pass.dispatchEvent(new Event("input", { bubbles: true }));
        pass.dispatchEvent(new Event("change", { bubbles: true }));
        const btn = Array.from(
          document.querySelectorAll("button, a"),
        ).find(
          (b) => (b.textContent || "").toLowerCase().trim() === "accedi",
        );
        if (btn) (btn as HTMLElement).click();
      },
      config.archibald.username,
      config.archibald.password,
    );
    try {
      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    } catch {}
    if (page.url().includes("Login.aspx")) throw new Error("Login failed");
    await wait(1000);
    logger.info("✅ Login OK");

    // ═══ NAVIGATE TO ORDER FORM ═══
    await page.goto(
      `${config.archibald.url}/SALESTABLE_ListView_Agent/`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("span, button, a")).some(
          (el) => el.textContent?.trim().toLowerCase() === "nuovo",
        ),
      { timeout: 15000 },
    );
    const urlBefore = page.url();
    await page.evaluate(() => {
      const b = Array.from(
        document.querySelectorAll("button, a, span"),
      ).find((e) => e.textContent?.trim().toLowerCase() === "nuovo");
      if (b) (b as HTMLElement).click();
    });
    await page.waitForFunction(
      (old: string) => window.location.href !== old,
      { timeout: 10000 },
      urlBefore,
    );
    await page.waitForFunction(
      () => !!(window as any).ASPxClientControl?.GetControlCollection,
      { timeout: 15000 },
    );
    await wait(2000);

    // ═══ FIND GRID ═══
    const gridName = await page.evaluate(() => {
      const w = window as any;
      let f = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl(
        (c: any) => {
          if (
            c.name?.includes("dviSALESLINEs") &&
            typeof c.AddNewRow === "function"
          )
            f = c.name;
        },
      );
      return f;
    });
    logger.info(`Grid: ${gridName}`);

    // ═══ SELECT CUSTOMER ═══
    const ci = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );
      const c = inputs.find((i) => {
        const id = (i as HTMLInputElement).id.toLowerCase();
        return (
          (id.includes("custtable") ||
            id.includes("account") ||
            id.includes("profilo")) &&
          !(i as HTMLInputElement).disabled &&
          (i as HTMLElement).getBoundingClientRect().height > 0
        );
      }) as HTMLInputElement;
      if (!c) return null;
      const baseId = c.id.endsWith("_I") ? c.id.slice(0, -2) : c.id;
      for (const s of [
        `${baseId}_B-1`,
        `${baseId}_B-1Img`,
        `${baseId}_B`,
      ]) {
        const b = document.getElementById(s);
        if (b && (b as HTMLElement).offsetParent !== null)
          return { baseId, btn: `#${s}` };
      }
      return null;
    });
    if (!ci?.btn) throw new Error("Customer not found");
    await page.click(ci.btn);
    await wait(500);
    const ss = `#${ci.baseId}_DDD_gv_DXSE_I`;
    await page.waitForFunction(
      (s: string) => {
        const i = document.querySelector(s) as HTMLInputElement;
        return i && i.offsetParent !== null;
      },
      { timeout: 5000, polling: 50 },
      ss,
    );
    await page.evaluate(
      (s: string, v: string) => {
        const i = document.querySelector(s) as HTMLInputElement;
        if (!i) return;
        i.focus();
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (set) set.call(i, v);
        else i.value = v;
        i.dispatchEvent(new Event("input", { bubbles: true }));
        i.dispatchEvent(new Event("change", { bubbles: true }));
        i.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          }),
        );
      },
      ss,
      CUSTOMER,
    );
    await page.waitForFunction(
      () =>
        !!Array.from(
          document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
        ).find(
          (n) =>
            (n as HTMLElement).offsetParent !== null &&
            n.querySelector('tr[class*="dxgvDataRow"]'),
        ),
      { timeout: 8000, polling: 100 },
    );
    await page.evaluate(() => {
      const c = Array.from(
        document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
      ).find(
        (n) =>
          (n as HTMLElement).offsetParent !== null &&
          n.querySelector('tr[class*="dxgvDataRow"]'),
      );
      if (!c) return;
      const r = Array.from(
        c.querySelectorAll('tr[class*="dxgvDataRow"]'),
      ).filter((r) => (r as HTMLElement).offsetParent !== null);
      if (r[0]) {
        const t = r[0].querySelector("td") || r[0];
        (t as HTMLElement).click();
      }
    });
    await waitForIdle(page);
    await wait(2000);
    logger.info("✅ Customer selected");

    // ═══ SET LINEDISC TO N/A ═══
    await page.evaluate(() => {
      const l = Array.from(
        document.querySelectorAll("a.dxtc-link, span.dx-vam"),
      );
      for (const e of l) {
        const t = e.textContent?.trim() || "";
        if (t.includes("Prezzi") && t.includes("sconti")) {
          const c = e.tagName === "A" ? e : e.parentElement;
          if (c && (c as HTMLElement).offsetParent !== null) {
            (c as HTMLElement).click();
            return;
          }
        }
      }
    });
    await wait(1500);
    try {
      await page.waitForFunction(
        () => {
          const i = document.querySelector(
            'input[id*="LINEDISC"][id$="_I"]',
          ) as HTMLInputElement;
          return i && i.offsetParent !== null;
        },
        { timeout: 8000, polling: 200 },
      );
      await page.evaluate(() => {
        const i = document.querySelector(
          'input[id*="LINEDISC"][id$="_I"]',
        ) as HTMLInputElement;
        if (!i) return;
        i.scrollIntoView({ block: "center" });
        i.focus();
        i.click();
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (set) set.call(i, "N/A");
        else i.value = "N/A";
        i.dispatchEvent(new Event("input", { bubbles: true }));
        i.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.keyboard.press("Tab");
      await waitForIdle(page);
      logger.info("✅ LINEDISC = N/A");
    } catch {
      logger.warn("LINEDISC not found");
    }

    // ═══ ADD NEW ROW ═══
    await page.evaluate((g: string) => {
      const w = window as any;
      const grid =
        w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g);
      if (grid?.AddNewRow) grid.AddNewRow();
    }, gridName);
    await waitForIdle(page);
    await wait(1500);

    // ═══ ENTER ARTICLE ═══
    const inv = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'),
      );
      for (const inp of inputs) {
        const el = inp as HTMLElement;
        if (el.offsetParent !== null && el.offsetWidth > 0) {
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          return {
            id: (inp as HTMLInputElement).id,
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
          };
        }
      }
      return null;
    });
    if (!inv) throw new Error("INVENTTABLE not found");
    await page.mouse.click(inv.x, inv.y);
    await wait(150);
    const pp = ARTICLE.slice(0, -1);
    await page.evaluate(
      (t: string) => {
        const i = document.activeElement as HTMLInputElement;
        if (i?.tagName === "INPUT") {
          i.value = t;
          i.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      pp,
    );
    await page.keyboard.type(ARTICLE.slice(-1), { delay: 30 });
    await page.waitForSelector('tr[id*="DXDataRow"]', { timeout: 5000 });
    await waitForIdle(page);

    // Select variant
    await page.evaluate((id: string) => {
      const i = document.getElementById(id);
      if (i) (i as HTMLElement).focus();
    }, inv.id);
    await page.keyboard.press("ArrowDown");
    await wait(30);
    await page.keyboard.press("Tab");
    await waitForIdle(page, 8000);
    await wait(1000);

    // Set quantity
    const qty = await page.evaluate(() => {
      const f = document.activeElement as HTMLInputElement;
      return { v: f?.value || "", id: f?.id || "" };
    });
    const qn = Number.parseFloat(qty.v.replace(",", "."));
    if (!Number.isFinite(qn) || Math.abs(qn - QUANTITY) >= 0.01) {
      await page.evaluate(() => {
        const i = document.activeElement as HTMLInputElement;
        if (i?.select) i.select();
      });
      await page.keyboard.type(QUANTITY.toString(), { delay: 30 });
      await waitForIdle(page, 5000);
    }
    logger.info("✅ Article + Quantity set");

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: DISCOVERY - Enumerate all ASPxClientEdit controls
    // ═══════════════════════════════════════════════════════════
    logger.info("\n═══ PHASE 1: DISCOVERY ═══");

    const discovery = await page.evaluate(() => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (!col) return { error: "No control collection" };

      const controls: any[] = [];

      col.ForEachControl((c: any) => {
        const name = c.name || "";
        // Only look at controls in the edit row
        if (
          name.toLowerCase().includes("manualdiscount") ||
          name.toLowerCase().includes("salesline")
        ) {
          const info: any = {
            name,
            typeName: c.constructor?.name || "unknown",
            hasSetValue: typeof c.SetValue === "function",
            hasGetValue: typeof c.GetValue === "function",
            hasSetText: typeof c.SetText === "function",
            hasGetText: typeof c.GetText === "function",
            hasRaiseValueChanged:
              typeof c.RaiseValueChangedEvent === "function",
            hasFocus: typeof c.Focus === "function",
            hasGetInputElement:
              typeof c.GetInputElement === "function",
            hasGetMainElement:
              typeof c.GetMainElement === "function",
          };

          try {
            if (c.GetValue) info.currentValue = c.GetValue();
          } catch {}
          try {
            if (c.GetText) info.currentText = c.GetText();
          } catch {}
          try {
            if (c.GetInputElement) {
              const el = c.GetInputElement();
              info.inputId = el?.id || null;
              info.inputValue = el?.value || null;
            }
          } catch {}

          // List all methods
          const methods: string[] = [];
          let proto = Object.getPrototypeOf(c);
          while (proto && proto !== Object.prototype) {
            for (const key of Object.getOwnPropertyNames(proto)) {
              if (typeof c[key] === "function" && !key.startsWith("_"))
                methods.push(key);
            }
            proto = Object.getPrototypeOf(proto);
          }
          info.methods = methods.filter((m) =>
            /^(Set|Get|Raise|Fire|On|Validate|Update|Focus|Click|Clear)/i.test(m),
          );

          controls.push(info);
        }
      });

      // Also look for MANUALDISCOUNT specifically by exploring editnew row
      const editRow = document.querySelector('tr[id*="editnew"]');
      let editRowInputs: any[] = [];
      if (editRow) {
        editRowInputs = Array.from(editRow.querySelectorAll("input")).map(
          (i) => ({
            id: (i as HTMLInputElement).id,
            type: (i as HTMLInputElement).type,
            value: (i as HTMLInputElement).value,
            visible: (i as HTMLElement).offsetParent !== null,
            width: (i as HTMLElement).offsetWidth,
          }),
        );
      }

      // Try to find the control by looking at the MANUALDISCOUNT input and navigating up
      const discInput = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).find((i) => {
        const id = (i as HTMLInputElement).id.toLowerCase();
        return (
          id.includes("manualdiscount") &&
          id.includes("salesline") &&
          (i as HTMLElement).offsetParent !== null
        );
      }) as HTMLInputElement | null;

      let discInputAnalysis: any = null;
      if (discInput) {
        // The DevExpress control ID is usually the input ID minus the _I suffix
        const baseId = discInput.id.endsWith("_I")
          ? discInput.id.slice(0, -2)
          : discInput.id;

        // Try to find the control by various naming conventions
        const controlByName = w[baseId];
        const controlByCol = col.Get?.(baseId);

        discInputAnalysis = {
          inputId: discInput.id,
          inputValue: discInput.value,
          baseId,
          controlByName: controlByName
            ? {
                found: true,
                type: controlByName.constructor?.name,
                hasSetValue: typeof controlByName.SetValue === "function",
                hasGetValue: typeof controlByName.GetValue === "function",
                hasSetText: typeof controlByName.SetText === "function",
                currentValue: controlByName.GetValue?.(),
                currentText: controlByName.GetText?.(),
              }
            : { found: false },
          controlByCol: controlByCol
            ? {
                found: true,
                type: controlByCol.constructor?.name,
                hasSetValue: typeof controlByCol.SetValue === "function",
              }
            : { found: false },
        };

        // Try finding the SpinEdit control parent
        let el: HTMLElement | null = discInput;
        let parentControlInfo: any = null;
        while (el && !parentControlInfo) {
          const elId = el.id;
          if (elId && w[elId] && typeof w[elId].SetValue === "function") {
            const ctrl = w[elId];
            parentControlInfo = {
              id: elId,
              type: ctrl.constructor?.name,
              hasSetValue: true,
              hasGetValue: typeof ctrl.GetValue === "function",
              currentValue: ctrl.GetValue?.(),
              methods: Object.getOwnPropertyNames(
                Object.getPrototypeOf(ctrl),
              )
                .filter((m) => typeof ctrl[m] === "function")
                .filter((m) =>
                  /^(Set|Get|Raise|Fire|On|Validate|Update|Focus|Click|Clear)/i.test(
                    m,
                  ),
                ),
            };
          }
          el = el.parentElement;
        }
        discInputAnalysis.parentControl = parentControlInfo;

        // Also try ASPxClientEdit.Cast
        if (w.ASPxClientEdit?.Cast) {
          try {
            const casted = w.ASPxClientEdit.Cast(discInput);
            discInputAnalysis.castedControl = casted
              ? {
                  found: true,
                  type: casted.constructor?.name,
                  hasSetValue: typeof casted.SetValue === "function",
                }
              : { found: false };
          } catch (e) {
            discInputAnalysis.castedControl = {
              found: false,
              error: String(e),
            };
          }
        }
      }

      return {
        controlsFound: controls.length,
        controls,
        editRowInputsCount: editRowInputs.length,
        discInputAnalysis,
        editRowDiscountInputs: editRowInputs.filter((i) =>
          i.id.toLowerCase().includes("manualdiscount"),
        ),
      };
    });

    logger.info(
      "DISCOVERY RESULTS:\n" + JSON.stringify(discovery, null, 2),
    );

    // Save discovery results
    fs.writeFileSync(
      path.join(LOGS_DIR, `discount-ctrl-discovery-${Date.now()}.json`),
      JSON.stringify(discovery, null, 2),
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: TRY SETTING VALUE VIA DEVEXPRESS CONTROL
    // ═══════════════════════════════════════════════════════════
    logger.info("\n═══ PHASE 2: SET VALUE VIA DEVEXPRESS CONTROL ═══");

    const setResult = await page.evaluate((discountVal: string) => {
      const w = window as any;
      const col = w.ASPxClientControl?.GetControlCollection?.();
      const results: any = {};

      // Find the MANUALDISCOUNT input
      const discInput = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).find((i) => {
        const id = (i as HTMLInputElement).id.toLowerCase();
        return (
          id.includes("manualdiscount") &&
          id.includes("salesline") &&
          (i as HTMLElement).offsetParent !== null
        );
      }) as HTMLInputElement | null;

      if (!discInput) {
        results.error = "MANUALDISCOUNT input not found";
        return results;
      }

      results.inputId = discInput.id;
      results.valueBefore = discInput.value;

      // Method A: Find control by baseId (input ID minus _I)
      const baseId = discInput.id.endsWith("_I")
        ? discInput.id.slice(0, -2)
        : discInput.id;

      const ctrl = w[baseId] || col?.Get?.(baseId);

      if (ctrl && typeof ctrl.SetValue === "function") {
        try {
          results.methodA = "Found control by baseId";
          results.methodA_type = ctrl.constructor?.name;
          results.methodA_valueBefore = ctrl.GetValue?.();

          // Try SetValue with number
          ctrl.SetValue(Number(discountVal));
          results.methodA_afterSetValue = ctrl.GetValue?.();
          results.methodA_inputAfter = discInput.value;
        } catch (e) {
          results.methodA_error = String(e);
        }
      } else {
        results.methodA = "Control not found by baseId: " + baseId;

        // Method B: Walk up DOM from input to find parent control
        let el: HTMLElement | null = discInput;
        let found = false;
        while (el && !found) {
          const elId = el.id;
          if (elId) {
            const parentCtrl = w[elId];
            if (
              parentCtrl &&
              typeof parentCtrl.SetValue === "function"
            ) {
              try {
                results.methodB = "Found parent control: " + elId;
                results.methodB_type = parentCtrl.constructor?.name;
                results.methodB_valueBefore = parentCtrl.GetValue?.();

                parentCtrl.SetValue(Number(discountVal));
                results.methodB_afterSetValue =
                  parentCtrl.GetValue?.();
                results.methodB_inputAfter = discInput.value;
                found = true;
              } catch (e) {
                results.methodB_error = String(e);
              }
            }
          }
          el = el.parentElement;
        }

        if (!found) {
          results.methodB = "No parent control found";

          // Method C: Search ALL controls for one whose input matches
          if (col) {
            col.ForEachControl((c: any) => {
              try {
                if (
                  c.GetInputElement &&
                  c.GetInputElement() === discInput
                ) {
                  results.methodC =
                    "Found control via GetInputElement: " + c.name;
                  results.methodC_type = c.constructor?.name;
                  if (typeof c.SetValue === "function") {
                    c.SetValue(Number(discountVal));
                    results.methodC_afterSetValue = c.GetValue?.();
                    results.methodC_inputAfter = discInput.value;
                  }
                }
              } catch {}
            });
          }

          if (!results.methodC) {
            results.methodC = "No control found via GetInputElement";

            // Method D: Try every control that has MANUALDISCOUNT in name
            if (col) {
              col.ForEachControl((c: any) => {
                if (
                  c.name &&
                  c.name.toLowerCase().includes("manualdiscount")
                ) {
                  try {
                    results.methodD_name = c.name;
                    results.methodD_type = c.constructor?.name;
                    results.methodD_hasSetValue =
                      typeof c.SetValue === "function";
                    if (typeof c.SetValue === "function") {
                      results.methodD_valueBefore = c.GetValue?.();
                      c.SetValue(Number(discountVal));
                      results.methodD_afterSetValue = c.GetValue?.();
                    }
                  } catch (e) {
                    results.methodD_error = String(e);
                  }
                }
              });
            }
          }
        }
      }

      // Final state
      results.inputValueFinal = discInput.value;

      return results;
    }, DISCOUNT);

    logger.info(
      "SET VALUE RESULTS:\n" + JSON.stringify(setResult, null, 2),
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: ADDITIONAL APPROACHES IF CONTROL NOT FOUND
    // ═══════════════════════════════════════════════════════════
    logger.info("\n═══ PHASE 3: ALTERNATIVE APPROACHES ═══");

    const altResult = await page.evaluate((discountVal: string) => {
      const w = window as any;
      const results: any = {};

      const discInput = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).find((i) => {
        const id = (i as HTMLInputElement).id.toLowerCase();
        return (
          id.includes("manualdiscount") &&
          id.includes("salesline") &&
          (i as HTMLElement).offsetParent !== null
        );
      }) as HTMLInputElement | null;

      if (!discInput) return { error: "no input" };

      // Approach E: Try to find the DevExpress SpinEdit by checking
      // window[id] for ALL ancestor element IDs
      let el: HTMLElement | null = discInput.parentElement;
      const ancestorControls: any[] = [];
      while (el) {
        if (el.id) {
          const ctrl = w[el.id];
          if (ctrl && typeof ctrl === "object") {
            ancestorControls.push({
              id: el.id,
              type: ctrl.constructor?.name,
              hasSetValue: typeof ctrl.SetValue === "function",
              hasGetValue: typeof ctrl.GetValue === "function",
              hasSetText: typeof ctrl.SetText === "function",
              hasGetText: typeof ctrl.GetText === "function",
            });
          }
        }
        el = el.parentElement;
      }
      results.ancestorControls = ancestorControls;

      // Approach F: Look at the grid's edit row form values
      // DevExpress grids track template editor values via form data
      const editRow = document.querySelector('tr[id*="editnew"]');
      if (editRow) {
        const hiddenInputs = Array.from(
          editRow.querySelectorAll('input[type="hidden"]'),
        ).map((i) => ({
          id: (i as HTMLInputElement).id,
          name: (i as HTMLInputElement).name,
          value: (i as HTMLInputElement).value,
        }));
        results.hiddenInputs = hiddenInputs;

        // Check for DevExpress state inputs
        const stateInputs = Array.from(
          editRow.querySelectorAll("input[id*='State'], input[name*='State']"),
        ).map((i) => ({
          id: (i as HTMLInputElement).id,
          name: (i as HTMLInputElement).name,
          value: (i as HTMLInputElement).value.substring(0, 100),
        }));
        results.stateInputs = stateInputs;
      }

      // Approach G: Check if there's a data- attribute or DevExpress internal state
      results.discInputDataAttrs = {};
      for (const attr of Array.from(discInput.attributes)) {
        if (
          attr.name.startsWith("data-") ||
          attr.name.startsWith("dx")
        ) {
          results.discInputDataAttrs[attr.name] = attr.value;
        }
      }

      // Approach H: Look for DevExpress callback data / form serialization
      // Check if the grid has a custom edit form serializer
      const col = w.ASPxClientControl?.GetControlCollection?.();
      if (col) {
        let gridInfo: any = null;
        col.ForEachControl((c: any) => {
          if (
            c.name?.includes("dviSALESLINEs") &&
            typeof c.AddNewRow === "function"
          ) {
            gridInfo = {
              name: c.name,
              hasBatchEditApi:
                typeof c.batchEditApi !== "undefined",
              hasGetEditValue:
                typeof c.GetEditValue === "function",
              editValueMANUALDISCOUNT: null,
              hasSetEditValue:
                typeof c.SetEditValue === "function",
            };
            try {
              gridInfo.editValueMANUALDISCOUNT = c.GetEditValue(
                "MANUALDISCOUNT",
              );
            } catch (e) {
              gridInfo.editValueMANUALDISCOUNT_error = String(e);
            }
            // Try SetEditValue with the fieldIndex instead of name
            try {
              gridInfo.setEditValueByIndex23 = "attempting...";
              c.SetEditValue(23, Number(discountVal));
              gridInfo.setEditValueByIndex23 = "success";
              gridInfo.getEditValueAfterIndex23 =
                c.GetEditValue("MANUALDISCOUNT");
            } catch (e) {
              gridInfo.setEditValueByIndex23_error = String(e);
            }
          }
        });
        results.gridInfo = gridInfo;
      }

      return results;
    }, DISCOUNT);

    logger.info(
      "ALTERNATIVE RESULTS:\n" + JSON.stringify(altResult, null, 2),
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: TRY BRUTE FORCE - editTableCell + Tab away
    // ═══════════════════════════════════════════════════════════
    logger.info("\n═══ PHASE 4: editTableCell + TAB ═══");

    // First check the current MANUALDISCOUNT value
    const beforeVal = await page.evaluate(() => {
      const discInput = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).find((i) => {
        const id = (i as HTMLInputElement).id.toLowerCase();
        return (
          id.includes("manualdiscount") &&
          id.includes("salesline") &&
          (i as HTMLElement).offsetParent !== null
        );
      }) as HTMLInputElement | null;
      return discInput?.value || "NOT FOUND";
    });
    logger.info(`MANUALDISCOUNT value before editTableCell: "${beforeVal}"`);

    // Do editTableCell
    const discId = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ) as HTMLInputElement[];
      const d = inputs.find(
        (i) =>
          i.id.toLowerCase().includes("manualdiscount") &&
          i.id.toLowerCase().includes("salesline") &&
          i.offsetParent !== null,
      );
      return d?.id || null;
    });

    if (discId) {
      // double-click
      await page.evaluate((id: string) => {
        const inp = document.querySelector(`#${id}`) as HTMLInputElement;
        if (!inp) return;
        inp.focus();
        inp.dispatchEvent(
          new MouseEvent("dblclick", {
            view: window,
            bubbles: true,
            cancelable: true,
            detail: 2,
          }),
        );
        const s = Date.now();
        while (Date.now() - s < 150) {}
      }, discId);
      await wait(300);

      // select + type
      await page.evaluate((id: string) => {
        const inp = document.querySelector(`#${id}`) as HTMLInputElement;
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, discId);
      await wait(100);
      await page.keyboard.press("Backspace");
      await wait(50);
      await page.keyboard.type(DISCOUNT, { delay: 30 });
      await wait(300);

      const afterType = await page.evaluate(
        (id: string) =>
          (document.querySelector(`#${id}`) as HTMLInputElement)?.value ||
          "",
        discId,
      );
      logger.info(`After keyboard.type: "${afterType}"`);

      // Now press Tab to leave the field - this might trigger DevExpress's blur handler
      await page.keyboard.press("Tab");
      await wait(500);

      // Check where focus went
      const focusAfterTab = await page.evaluate(() => ({
        activeId:
          (document.activeElement as HTMLInputElement)?.id || "none",
        activeTag: document.activeElement?.tagName || "none",
      }));
      logger.info(`Focus after Tab: ${JSON.stringify(focusAfterTab)}`);

      // Check MANUALDISCOUNT value after Tab
      const afterTab = await page.evaluate(
        (id: string) =>
          (document.querySelector(`#${id}`) as HTMLInputElement)?.value ||
          "",
        discId,
      );
      logger.info(`MANUALDISCOUNT after Tab: "${afterTab}"`);

      // Also check if the control value changed
      const ctrlValueAfterTab = await page.evaluate(
        (inputId: string) => {
          const w = window as any;
          const baseId = inputId.endsWith("_I")
            ? inputId.slice(0, -2)
            : inputId;
          const ctrl =
            w[baseId] ||
            w.ASPxClientControl?.GetControlCollection()?.Get(baseId);
          if (ctrl && typeof ctrl.GetValue === "function") {
            return {
              found: true,
              value: ctrl.GetValue(),
              text: ctrl.GetText?.(),
            };
          }
          return { found: false };
        },
        discId,
      );
      logger.info(
        `Control value after Tab: ${JSON.stringify(ctrlValueAfterTab)}`,
      );
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 5: UpdateEdit and check saved values
    // ═══════════════════════════════════════════════════════════
    logger.info("\n═══ PHASE 5: UpdateEdit ═══");

    const upd = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        if (
          (img.getAttribute("alt") === "Update" ||
            img.id.includes("DXCBtn0")) &&
          img.offsetParent !== null
        ) {
          const b = img.closest("td") || img.parentElement;
          if (b) {
            (b as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });

    if (upd) {
      await waitForGrid(page, gridName, 20000);
      await waitForIdle(page, 4000);
      logger.info("✅ UpdateEdit clicked");
    } else {
      await page.evaluate((g: string) => {
        const w = window as any;
        const grid =
          w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g);
        if (grid?.UpdateEdit) grid.UpdateEdit();
      }, gridName);
      await waitForGrid(page, gridName, 20000);
      await waitForIdle(page);
      logger.info("✅ UpdateEdit via API");
    }

    // Check saved row
    const savedRow = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('tr[class*="dxgvDataRow"]'),
      ).filter((r) => (r as HTMLElement).offsetParent !== null);
      if (rows.length === 0) return "no rows";
      const lastRow = rows[rows.length - 1];
      const cells = Array.from(lastRow.querySelectorAll("td")).map(
        (c) => c.textContent?.trim() || "",
      );
      return cells;
    });
    logger.info("Saved row cells: " + JSON.stringify(savedRow));

    // Take screenshot
    await page.screenshot({
      path: path.join(LOGS_DIR, `discount-ctrl-result-${Date.now()}.png`),
      fullPage: true,
    });

    // Save all results
    const allResults = {
      discovery,
      setResult,
      altResult,
      savedRow,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(LOGS_DIR, `discount-ctrl-all-${Date.now()}.json`),
      JSON.stringify(allResults, null, 2),
    );

    logger.info("\n═══ TEST COMPLETE ═══");

    // Cleanup
    try {
      await page.evaluate((g: string) => {
        const w = window as any;
        const grid =
          w[g] || w.ASPxClientControl?.GetControlCollection()?.Get(g);
        if (grid?.CancelEdit) grid.CancelEdit();
      }, gridName);
    } catch {}
  } catch (error) {
    logger.error("❌ FATAL", {
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      if (bot.page)
        await bot.page.screenshot({
          path: path.join(LOGS_DIR, `discount-ctrl-fatal-${Date.now()}.png`),
          fullPage: true,
        });
    } catch {}
  } finally {
    await bot.close();
  }
}

run();
