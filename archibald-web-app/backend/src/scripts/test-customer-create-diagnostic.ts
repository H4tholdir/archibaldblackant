#!/usr/bin/env tsx
/**
 * Diagnostic test: create D.ssa Saturno Nausicaa customer using the new
 * tab-ordering flow (Prezzi e sconti → Indirizzo alt. → Principale → Save).
 *
 * Dumps DevExpress controls, visible inputs, and popup state at each step.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import type { CustomerFormData } from "../types.js";
import type { Page } from "puppeteer-core";

const customerData: CustomerFormData = {
  name: "D.ssa Saturno Nausicaa",
  vatNumber: "05114260655",
  deliveryMode: "FedEx",
  paymentTerms: "206",
  pec: "nausicaa.saturno@pec.ordinemedicisalerno.it",
  sdi: "0000000",
  street: "Via Canonico de Luca, 35",
  postalCode: "84040",
  postalCodeCity: "Celle Di Bulgheria",
  phone: "+393291371657",
  mobile: "+393291371657",
  email: "nausicaa.saturno@hotmail.com",
  url: "https://www.facebook.com/dottsaturno/?locale=it_IT",
  lineDiscount: "N/A",
  deliveryStreet: "Corso Garibaldi, 13",
  deliveryPostalCode: "84073",
  deliveryPostalCodeCity: "Sapri",
};

async function dumpState(page: Page, stepLabel: string) {
  logger.info(`\n========== DUMP: ${stepLabel} ==========`);

  const state = await page.evaluate(() => {
    const w = window as any;
    const result: Record<string, any> = {};

    // 1. Current URL
    result.url = window.location.href;

    // 2. Active tab
    const activeTab = document.querySelector("li.dxtc-activeTab span.dx-vam");
    result.activeTab = activeTab?.textContent?.trim() || "unknown";

    // 3. All visible inputs with values
    const inputs = Array.from(document.querySelectorAll("input"))
      .filter((i) => i.offsetParent !== null && i.type !== "hidden")
      .map((i) => ({
        id: i.id,
        value: i.value,
        type: i.type,
      }))
      .filter((i) => i.id);
    result.visibleInputs = inputs;

    // 4. DevExpress controls
    const controls: { name: string; type: string; visible?: boolean }[] = [];
    const collection = w.ASPxClientControl?.GetControlCollection?.();
    if (collection && typeof collection.ForEachControl === "function") {
      collection.ForEachControl((c: any) => {
        const name = c?.name || c?.GetName?.() || "";
        const type = c?.constructor?.name || typeof c;
        let visible: boolean | undefined;
        if (typeof c.IsVisible === "function") {
          try { visible = c.IsVisible(); } catch {}
        }
        if (name.includes("Popup") || name.includes("popup")) {
          controls.push({ name, type, visible });
        }
      });
    }
    result.popupControls = controls;

    // 5. Popup DOM elements
    const popupEls = Array.from(
      document.querySelectorAll('div[id*="Popup"], div[id*="popup"]'),
    ).map((el) => {
      const htmlEl = el as HTMLElement;
      return {
        id: htmlEl.id,
        visible: htmlEl.offsetParent !== null || htmlEl.style.display !== "none",
        textLength: (htmlEl.textContent || "").length,
        textPreview: (htmlEl.textContent || "").substring(0, 200),
      };
    });
    result.popupElements = popupEls.filter((p) => p.textLength > 0);

    // 6. Validation errors
    const errorEls = Array.from(
      document.querySelectorAll(
        '.dxeErrorFrameSys, .dxeEditError, .dxeValidationError, [role="alert"]',
      ),
    )
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => (el as HTMLElement).textContent?.trim() || "");
    result.validationErrors = errorEls;

    // 7. Is any control in callback?
    let inCallback = false;
    if (collection && typeof collection.ForEachControl === "function") {
      collection.ForEachControl((c: any) => {
        try {
          if (c.InCallback?.()) inCallback = true;
        } catch {}
      });
    }
    result.inCallback = inCallback;

    return result;
  });

  logger.info(`DUMP [${stepLabel}]`, state);

  // Screenshot
  const safeName = stepLabel.replace(/[^a-zA-Z0-9-]/g, "_");
  const screenshotPath = `logs/diag-${safeName}-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  logger.info(`Screenshot: ${screenshotPath}`);
}

async function dumpInputValues(page: Page, label: string) {
  const keyFields = await page.evaluate(() => {
    const fields = [
      { label: "NAME", regex: /xaf_dviNAME_Edit_I$/ },
      { label: "STREET", regex: /xaf_dviSTREET_Edit_I$/ },
      { label: "PHONE", regex: /xaf_dviPHONE_Edit_I$/ },
      { label: "EMAIL", regex: /xaf_dviEMAIL_Edit_I$/ },
      { label: "URL", regex: /xaf_dviURL_Edit_I$/ },
      { label: "PEC", regex: /xaf_dviLEGALEMAIL_Edit_I$/ },
      { label: "SDI", regex: /xaf_dviLEGALAUTHORITY_Edit_I$/ },
      { label: "VATNUM", regex: /xaf_dviVATNUM_Edit_I$/ },
      { label: "CELLULARPHONE", regex: /xaf_dviCELLULARPHONE_Edit_I$/ },
      { label: "DLVMODE", regex: /xaf_dviDLVMODE_Edit_dropdown_DD_I$/ },
      { label: "LINEDISC", regex: /LINEDISC.*_I$/ },
    ];

    const inputs = Array.from(document.querySelectorAll("input"));
    return fields.map((f) => {
      const input = inputs.find((i) => f.regex.test(i.id)) as HTMLInputElement | null;
      return {
        field: f.label,
        id: input?.id || "NOT_FOUND",
        value: input?.value ?? "N/A",
        visible: input ? input.offsetParent !== null : false,
      };
    });
  });

  logger.info(`KEY FIELDS [${label}]`, { fields: keyFields });
}

async function testCustomerCreateDiagnostic() {
  logger.info("=== DIAGNOSTIC TEST: D.ssa Saturno Nausicaa ===");
  logger.info("Customer data:", customerData);

  const bot = new ArchibaldBot();

  try {
    logger.info("STEP 1: Init & login...");
    await bot.initialize();
    await bot.login();
    logger.info("STEP 1: OK");

    const page = (bot as any).page as Page;

    logger.info("STEP 2: Navigate to customer list...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("STEP 2: OK");

    logger.info("STEP 3: Click 'Nuovo'...");
    const nuovoClicked = await (bot as any).clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    if (!nuovoClicked) throw new Error("'Nuovo' button not found");

    await page.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("STEP 3: OK - form loaded");

    await dumpState(page, "01-form-loaded");
    await dumpInputValues(page, "01-form-loaded");

    // === STEP 4: Tab "Prezzi e sconti" ===
    logger.info("STEP 4: Opening 'Prezzi e sconti' tab...");
    await (bot as any).openCustomerTab("Prezzi e sconti");
    await (bot as any).dismissDevExpressPopups();

    try {
      await page.waitForFunction(
        () => {
          const input = document.querySelector(
            'input[id*="LINEDISC"][id$="_I"]',
          ) as HTMLInputElement | null;
          return input && input.offsetParent !== null;
        },
        { timeout: 10000, polling: 200 },
      );
    } catch {
      logger.warn("LINEDISC not visible, retrying tab...");
      await (bot as any).openCustomerTab("Prezzi e sconti");
      await (bot as any).dismissDevExpressPopups();
      await new Promise((r) => setTimeout(r, 1000));
    }

    await dumpState(page, "02-prezzi-tab-opened");
    await dumpInputValues(page, "02-prezzi-tab-opened");

    logger.info("STEP 4b: Setting LINEDISC to N/A...");
    await (bot as any).setDevExpressComboBox(
      /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      "N/A",
    );
    await dumpState(page, "03-linedisc-set");
    await dumpInputValues(page, "03-linedisc-set");

    // === STEP 5: Tab "Indirizzo alt." ===
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      logger.info("STEP 5: Filling delivery address...");
      await (bot as any).fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
      await dumpState(page, "04-delivery-address-filled");
    } else {
      logger.info("STEP 5: No delivery address, skipping");
    }

    // === STEP 6: Back to "Principale" ===
    logger.info("STEP 6: Opening 'Principale' tab...");
    await (bot as any).openCustomerTab("Principale");
    await (bot as any).dismissDevExpressPopups();
    await (bot as any).waitForDevExpressIdle({
      timeout: 5000,
      label: "tab-principale-diag",
    });

    await dumpState(page, "05-principale-tab-reopened");
    await dumpInputValues(page, "05-principale-tab-reopened");

    // === STEP 7: Fill all Principale fields ===
    logger.info("STEP 7: Filling Principale fields...");

    await (bot as any).typeDevExpressField(/xaf_dviNAME_Edit_I$/, customerData.name);
    logger.info("  NAME set");

    if (customerData.deliveryMode) {
      await (bot as any).setDevExpressComboBox(
        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
        customerData.deliveryMode,
      );
      logger.info("  DLVMODE set");
    }

    if (customerData.vatNumber) {
      await (bot as any).typeDevExpressField(
        /xaf_dviVATNUM_Edit_I$/,
        customerData.vatNumber,
      );
      logger.info("  VATNUM set");
    }

    if (customerData.paymentTerms) {
      await (bot as any).selectFromDevExpressLookup(
        /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
        customerData.paymentTerms,
      );
      logger.info("  PAYMTERMID set");
    }

    if (customerData.pec) {
      await (bot as any).typeDevExpressField(
        /xaf_dviLEGALEMAIL_Edit_I$/,
        customerData.pec,
      );
      logger.info("  PEC set");
    }

    if (customerData.sdi) {
      await (bot as any).typeDevExpressField(
        /xaf_dviLEGALAUTHORITY_Edit_I$/,
        customerData.sdi,
      );
      logger.info("  SDI set");
    }

    if (customerData.street) {
      await (bot as any).typeDevExpressField(
        /xaf_dviSTREET_Edit_I$/,
        customerData.street,
      );
      logger.info("  STREET set");
    }

    if (customerData.postalCode) {
      try {
        await (bot as any).selectFromDevExpressLookup(
          /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
          customerData.postalCode,
          customerData.postalCodeCity,
        );
        logger.info("  POSTALCODE set");
      } catch (capErr) {
        logger.warn("CAP lookup failed", { error: String(capErr) });
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 500));
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (customerData.phone) {
      await (bot as any).typeDevExpressField(
        /xaf_dviPHONE_Edit_I$/,
        customerData.phone,
      );
      logger.info("  PHONE set");
    }

    const mobileValue = customerData.mobile || customerData.phone || "";
    if (mobileValue) {
      try {
        await (bot as any).typeDevExpressField(
          /xaf_dviCELLULARPHONE_Edit_I$/,
          mobileValue,
        );
        logger.info("  CELLULARPHONE set");
      } catch {
        logger.warn("  CELLULARPHONE field not found");
      }
    }

    if (customerData.email) {
      await (bot as any).typeDevExpressField(
        /xaf_dviEMAIL_Edit_I$/,
        customerData.email,
      );
      logger.info("  EMAIL set");
    }

    const urlValue = customerData.url || "https://www.example.com/";
    try {
      await (bot as any).typeDevExpressField(/xaf_dviURL_Edit_I$/, urlValue);
      logger.info("  URL set");
    } catch {
      logger.warn("  URL field not found");
    }

    await dumpState(page, "06-all-principale-fields-set");
    await dumpInputValues(page, "06-all-principale-fields-set");

    // === STEP 8: Save ===
    logger.info("STEP 8: Saving...");
    await dumpState(page, "07-before-save");

    try {
      await (bot as any).saveAndCloseCustomer();
      logger.info("STEP 8: saveAndCloseCustomer() completed");
    } catch (saveErr) {
      logger.error("STEP 8: saveAndCloseCustomer() FAILED", {
        error: saveErr instanceof Error ? saveErr.message : String(saveErr),
      });
      await dumpState(page, "08-save-failed");
      await dumpInputValues(page, "08-save-failed");
    }

    const finalUrl = await page.url();
    if (finalUrl.includes("DetailView")) {
      logger.error("RESULT: FAIL - form still open");
      await dumpState(page, "09-final-still-open");
      await dumpInputValues(page, "09-final-still-open");
    } else {
      logger.info("RESULT: SUCCESS - customer created, form closed");
    }

    logger.info("=== DIAGNOSTIC TEST COMPLETED ===");
  } catch (error) {
    logger.error("TEST FAILED", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    await new Promise((r) => setTimeout(r, 3000));
    await bot.close();
  }

  process.exit(0);
}

testCustomerCreateDiagnostic();
