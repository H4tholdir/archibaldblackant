#!/usr/bin/env tsx
/**
 * E2E test: create a new customer with all fields,
 * handle the "Ignore warnings" checkbox, and verify save completes.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import type { CustomerFormData } from "../types.js";

async function testCustomerCreateE2E() {
  logger.info("=== TEST CREATE CUSTOMER E2E (with save) ===");

  const bot = new ArchibaldBot();

  const customerData: CustomerFormData = {
    name: "Dr. Canfora massimo",
    deliveryMode: "FedEx",
    paymentTerms: "206",
    sdi: "W7YVJK9",
    street: "via IV Novembre, 25",
    postalCode: "80056",
    phone: "+390817397466",
    email: "massimocanfora@inwind.it",
    lineDiscount: "N/A",
  };

  try {
    logger.info("STEP 1: Inizializzazione browser...");
    await bot.initialize();
    logger.info("STEP 1: OK");

    logger.info("STEP 2: Login...");
    await bot.login();
    logger.info("STEP 2: OK");

    const page = (bot as any).page;

    logger.info("STEP 3: Navigating to customer list...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("Customer list loaded");

    logger.info("STEP 4: Click 'Nuovo'...");
    const nuovoClicked = await (bot as any).clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    if (!nuovoClicked) throw new Error("'Nuovo' button not found");

    await page.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("Customer form loaded");

    logger.info("STEP 5: Filling fields...");

    await (bot as any).setDevExpressField(
      /xaf_dviNAME_Edit_I$/,
      customerData.name,
    );
    logger.info("  NAME set");

    await (bot as any).setDevExpressComboBox(
      /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
      customerData.deliveryMode,
    );
    logger.info("  DLVMODE set");

    await (bot as any).selectFromDevExpressLookup(
      /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
      customerData.paymentTerms!,
    );
    logger.info("  PAYMTERMID set");

    await (bot as any).setDevExpressField(
      /xaf_dviLEGALAUTHORITY_Edit_I$/,
      customerData.sdi!,
    );
    logger.info("  SDI set");

    await (bot as any).setDevExpressField(
      /xaf_dviSTREET_Edit_I$/,
      customerData.street!,
    );
    logger.info("  STREET set");

    await (bot as any).selectFromDevExpressLookup(
      /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
      customerData.postalCode!,
    );
    logger.info("  POSTALCODE set");

    await (bot as any).setDevExpressField(
      /xaf_dviPHONE_Edit_I$/,
      customerData.phone!,
    );
    logger.info("  PHONE set");

    await (bot as any).setDevExpressField(
      /xaf_dviEMAIL_Edit_I$/,
      customerData.email!,
    );
    logger.info("  EMAIL set");

    await (bot as any).openCustomerTab("Prezzi e sconti");
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
      await (bot as any).openCustomerTab("Prezzi e sconti");
      await new Promise((r) => setTimeout(r, 1000));
    }

    await (bot as any).setDevExpressComboBox(
      /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      "N/A",
    );
    logger.info("  LINEDISC set");

    await page.screenshot({
      path: "logs/e2e-customer-before-save.png",
      fullPage: true,
    });
    logger.info("Screenshot pre-save taken");

    // ====== SAVE USING BOT METHOD (with checkbox fix) ======
    logger.info("STEP 6: Calling saveAndCloseCustomer()...");
    await (bot as any).saveAndCloseCustomer();
    logger.info("STEP 6: saveAndCloseCustomer() completed");

    await page.screenshot({
      path: "logs/e2e-customer-after-save.png",
      fullPage: true,
    });

    const finalUrl = await page.url();
    logger.info("Final URL after save:", { url: finalUrl });

    if (finalUrl.includes("DetailView")) {
      logger.error("SAVE FAILED — form still open after saveAndCloseCustomer");
    } else {
      logger.info("SUCCESS — customer created, form closed")
    }

    logger.info("=== TEST COMPLETED ===");
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

testCustomerCreateE2E();
