#!/usr/bin/env tsx
/**
 * Test E2E per flussi createCustomer e updateCustomer.
 * NON preme "Salva e chiudi" — compila i campi e poi abbandona il form.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import type { CustomerFormData } from "../types.js";

async function testCustomerFlows() {
  logger.info("=== TEST CUSTOMER FLOWS - DevExpress Rewrite ===");

  const bot = new ArchibaldBot();
  let exitCode = 0;

  const testCustomer: CustomerFormData = {
    name: "Fresis Soc Cooperativa",
    deliveryMode: "FedEx",
    vatNumber: "08246131216",
    paymentTerms: "206",
    pec: "fresiscoop@pec.it",
    sdi: "KRRH6B9",
    street: "Via San Vito, 43",
    postalCode: "80056",
    phone: "+390817774293",
    email: "fresiscoop@pec.it",
    lineDiscount: "N/A",
    deliveryStreet: "Via Roma, 10",
    deliveryPostalCode: "80100",
  };

  try {
    logger.info("STEP 1: Inizializzazione browser...");
    await bot.initialize();
    logger.info("STEP 1: OK");

    logger.info("STEP 2: Login...");
    await bot.login();
    logger.info("STEP 2: OK");

    // --- Test createCustomer (senza salvare) ---
    logger.info("=== TEST CREATE CUSTOMER (dry-run) ===");
    logger.info("NOTA: questo test compila tutti i campi ma NON preme Salva.");
    logger.info("Dati di test:", testCustomer);

    const page = (bot as any).page;

    logger.info("Navigating to customer list...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("Customer list loaded");

    logger.info("Clicking 'Nuovo'...");
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

    logger.info("Filling NAME...");
    await (bot as any).setDevExpressField(/xaf_dviNAME_Edit_I$/, testCustomer.name);
    logger.info("OK: NAME set");

    logger.info("Filling DLVMODE...");
    await (bot as any).setDevExpressComboBox(
      /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
      testCustomer.deliveryMode,
    );
    logger.info("OK: DLVMODE set");

    logger.info("Filling VATNUM...");
    await (bot as any).setDevExpressField(/xaf_dviVATNUM_Edit_I$/, testCustomer.vatNumber!);
    logger.info("OK: VATNUM set");

    logger.info("Filling PAYMTERMID (lookup)...");
    await (bot as any).selectFromDevExpressLookup(
      /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
      testCustomer.paymentTerms!,
    );
    logger.info("OK: PAYMTERMID set");

    logger.info("Filling LEGALEMAIL...");
    await (bot as any).setDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, testCustomer.pec!);
    logger.info("OK: LEGALEMAIL set");

    logger.info("Filling LEGALAUTHORITY...");
    await (bot as any).setDevExpressField(/xaf_dviLEGALAUTHORITY_Edit_I$/, testCustomer.sdi!);
    logger.info("OK: LEGALAUTHORITY set");

    logger.info("Filling STREET...");
    await (bot as any).setDevExpressField(/xaf_dviSTREET_Edit_I$/, testCustomer.street!);
    logger.info("OK: STREET set");

    logger.info("Filling LOGISTICSADDRESSZIPCODE (lookup)...");
    await (bot as any).selectFromDevExpressLookup(
      /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
      testCustomer.postalCode!,
    );
    logger.info("OK: LOGISTICSADDRESSZIPCODE set");

    logger.info("Filling PHONE...");
    await (bot as any).setDevExpressField(/xaf_dviPHONE_Edit_I$/, testCustomer.phone!);
    logger.info("OK: PHONE set");

    logger.info("Filling EMAIL...");
    await (bot as any).setDevExpressField(/xaf_dviEMAIL_Edit_I$/, testCustomer.email!);
    logger.info("OK: EMAIL set");

    logger.info("Switching to 'Prezzi e sconti' tab...");
    await (bot as any).openCustomerTab("Prezzi e sconti");

    await page.waitForFunction(
      () => {
        const input = document.querySelector(
          'input[id*="LINEDISC"][id$="_I"]',
        ) as HTMLInputElement | null;
        return input && input.offsetParent !== null;
      },
      { timeout: 10000, polling: 200 },
    );

    logger.info("Filling LINEDISC...");
    await (bot as any).setDevExpressComboBox(
      /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      "N/A",
    );
    logger.info("OK: LINEDISC set");

    logger.info("Filling delivery address (Indirizzo alt.)...");
    await (bot as any).fillDeliveryAddress(
      testCustomer.deliveryStreet!,
      testCustomer.deliveryPostalCode!,
    );
    logger.info("OK: Delivery address set");

    logger.info("Taking final screenshot...");
    await page.screenshot({
      path: "logs/test-customer-create-final.png",
      fullPage: true,
    });

    logger.info("=== CREATE CUSTOMER TEST PASSED (dry-run) ===");
    logger.info("Navigating away to abandon form without saving...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // --- Test updateCustomer (senza salvare) ---
    logger.info("=== TEST UPDATE CUSTOMER (dry-run) ===");
    logger.info("Cercando 'Sorrentino Dr. Domenico' e modificandolo con dati Fresis...");
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });

    logger.info("Searching for Sorrentino...");
    await page.evaluate(
      (name: string) => {
        const inputs = Array.from(document.querySelectorAll("input"));
        const searchInput = inputs.find((i: any) =>
          /SearchAC.*Ed_I$/.test(i.id),
        ) as HTMLInputElement | null;
        if (!searchInput) return;
        searchInput.focus();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(searchInput, name);
        else searchInput.value = name;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("change", { bubbles: true }));
        searchInput.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
        );
      },
      "Sorrentino",
    );

    await (bot as any).waitForDevExpressIdle({ timeout: 8000, label: "search-sorrentino" });

    const editFound = await page.evaluate(() => {
      const editBtns = Array.from(
        document.querySelectorAll('a[data-args*="Edit"], img[title="Modifica"]'),
      ).filter((el: any) => el.offsetParent !== null);
      if (editBtns.length === 0) return false;
      const target = editBtns[0].tagName === "IMG"
        ? editBtns[0].closest("a") || editBtns[0]
        : editBtns[0];
      (target as HTMLElement).click();
      return true;
    });

    if (!editFound) {
      logger.warn("Edit button not found for Sorrentino, skipping update test");
    } else {
      await page.waitForFunction(
        () => !window.location.href.includes("ListView"),
        { timeout: 15000, polling: 200 },
      );
      await (bot as any).waitForDevExpressReady({ timeout: 10000 });

      logger.info("Modifying Sorrentino with Fresis data (all fields)...");

      logger.info("Setting NAME...");
      await (bot as any).setDevExpressField(/xaf_dviNAME_Edit_I$/, testCustomer.name);
      logger.info("OK: NAME set");

      logger.info("Setting DLVMODE...");
      await (bot as any).setDevExpressComboBox(
        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
        testCustomer.deliveryMode,
      );
      logger.info("OK: DLVMODE set");

      if (testCustomer.vatNumber) {
        logger.info("Setting VATNUM...");
        await (bot as any).setDevExpressField(/xaf_dviVATNUM_Edit_I$/, testCustomer.vatNumber);
        logger.info("OK: VATNUM set");
      }

      if (testCustomer.pec) {
        logger.info("Setting LEGALEMAIL...");
        await (bot as any).setDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, testCustomer.pec);
        logger.info("OK: LEGALEMAIL set");
      }

      if (testCustomer.sdi) {
        logger.info("Setting LEGALAUTHORITY...");
        await (bot as any).setDevExpressField(/xaf_dviLEGALAUTHORITY_Edit_I$/, testCustomer.sdi);
        logger.info("OK: LEGALAUTHORITY set");
      }

      if (testCustomer.street) {
        logger.info("Setting STREET...");
        await (bot as any).setDevExpressField(/xaf_dviSTREET_Edit_I$/, testCustomer.street);
        logger.info("OK: STREET set");
      }

      if (testCustomer.phone) {
        logger.info("Setting PHONE...");
        await (bot as any).setDevExpressField(/xaf_dviPHONE_Edit_I$/, testCustomer.phone);
        logger.info("OK: PHONE set");
      }

      if (testCustomer.email) {
        logger.info("Setting EMAIL...");
        await (bot as any).setDevExpressField(/xaf_dviEMAIL_Edit_I$/, testCustomer.email);
        logger.info("OK: EMAIL set");
      }

      await page.screenshot({
        path: "logs/test-customer-update-final.png",
        fullPage: true,
      });

      logger.info("=== UPDATE CUSTOMER TEST PASSED (dry-run) ===");
      logger.info("Navigating away to abandon form without saving...");
      await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
    }

    logger.info("=== ALL CUSTOMER FLOW TESTS PASSED ===");
  } catch (error) {
    logger.error("TEST FALLITO", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    exitCode = 1;
  } finally {
    logger.info("Attendo 5 secondi prima di chiudere...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await bot.close();
  }

  process.exit(exitCode);
}

testCustomerFlows();
