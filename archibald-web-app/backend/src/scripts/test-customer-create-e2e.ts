#!/usr/bin/env tsx
/**
 * E2E test: create a new customer, click "Salva e chiudi",
 * and dump the DOM to find the validation-error checkbox.
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

    // ====== CLICK SALVA E CHIUDI ======
    logger.info("STEP 6: Clicking 'Salva e chiudi'...");
    const directSaveClicked = await (bot as any).clickElementByText(
      "Salva e chiudi",
      { exact: true, selectors: ["a", "span", "div", "li"] },
    );
    logger.info("Salva e chiudi clicked: " + directSaveClicked);

    await (bot as any).waitForDevExpressIdle({
      timeout: 10000,
      label: "e2e-save-customer",
    });

    logger.info("STEP 7: Waiting 5s for Archibald to process...");
    await new Promise((r) => setTimeout(r, 5000));

    await page.screenshot({
      path: "logs/e2e-customer-after-save.png",
      fullPage: true,
    });
    logger.info("Screenshot post-save taken");

    // ====== DOM DUMP ======
    logger.info("STEP 8: DOM dump — searching for ALL interactive elements...");

    const domDump = await page.evaluate(() => {
      const result: Record<string, unknown> = {};

      // 1. All checkboxes (any type)
      const checkboxes: Record<string, unknown>[] = [];
      document.querySelectorAll("input").forEach((el) => {
        const input = el as HTMLInputElement;
        if (
          input.type === "checkbox" ||
          input.id.toLowerCase().includes("check") ||
          input.id.toLowerCase().includes("error")
        ) {
          checkboxes.push({
            tag: "input",
            id: input.id,
            type: input.type,
            checked: input.checked,
            visible: input.offsetParent !== null,
            className: input.className.substring(0, 100),
            parentId: input.parentElement?.id || "",
            parentClass: input.parentElement?.className.substring(0, 100) || "",
            nearText: (
              input.closest("tr") ||
              input.closest("div") ||
              input.parentElement
            )?.textContent
              ?.trim()
              .substring(0, 200),
          });
        }
      });
      result.checkboxes = checkboxes;

      // 2. DevExpress checkbox spans
      const dxCheckboxes: Record<string, unknown>[] = [];
      document
        .querySelectorAll(
          'span[class*="CheckBox"], span[class*="dxeCheck"], span[class*="dxWeb_edtCheck"], label[class*="check"], div[class*="check"]',
        )
        .forEach((el) => {
          const htmlEl = el as HTMLElement;
          dxCheckboxes.push({
            tag: el.tagName,
            id: htmlEl.id,
            className: htmlEl.className.substring(0, 150),
            visible: htmlEl.offsetParent !== null,
            display: htmlEl.style.display,
            innerHTML: htmlEl.innerHTML.substring(0, 300),
            nearText: htmlEl.closest("tr")?.textContent?.trim().substring(0, 200) || "",
          });
        });
      result.dxCheckboxes = dxCheckboxes;

      // 3. Validation error area — everything in/near the error block
      const validationArea: Record<string, unknown>[] = [];
      const errorBlock = Array.from(document.querySelectorAll("*")).find(
        (el) => {
          const text = (el as HTMLElement).textContent || "";
          return (
            text.includes("Data Validation Error") &&
            el.children.length < 20
          );
        },
      );
      if (errorBlock) {
        const parent = errorBlock.parentElement || errorBlock;
        const allChildren = parent.querySelectorAll("*");
        allChildren.forEach((child) => {
          const htmlChild = child as HTMLElement;
          if (
            htmlChild.tagName === "INPUT" ||
            htmlChild.tagName === "SPAN" ||
            htmlChild.tagName === "BUTTON" ||
            htmlChild.tagName === "A" ||
            htmlChild.tagName === "LABEL" ||
            htmlChild.getAttribute("role") === "checkbox"
          ) {
            validationArea.push({
              tag: htmlChild.tagName,
              id: htmlChild.id,
              type: (htmlChild as HTMLInputElement).type || "",
              className: htmlChild.className.substring(0, 150),
              role: htmlChild.getAttribute("role"),
              visible: htmlChild.offsetParent !== null,
              text: htmlChild.textContent?.trim().substring(0, 100),
              href: (htmlChild as HTMLAnchorElement).href || "",
            });
          }
        });
        result.validationAreaParentTag = (parent as HTMLElement).tagName;
        result.validationAreaParentId = (parent as HTMLElement).id;
        result.validationAreaParentClass = (
          parent as HTMLElement
        ).className.substring(0, 150);
      }
      result.validationAreaElements = validationArea;

      // 4. All visible popups/dialogs
      const popups: Record<string, unknown>[] = [];
      document
        .querySelectorAll(
          '.dxpc-main, .dxpc-mainDiv, div[id*="Popup"], div[id*="Dialog"], div[id*="popup"]',
        )
        .forEach((el) => {
          const htmlEl = el as HTMLElement;
          const isVisible =
            htmlEl.offsetParent !== null ||
            htmlEl.style.display !== "none";
          if (isVisible) {
            const children: string[] = [];
            htmlEl.querySelectorAll("input, span, button, a").forEach((c) => {
              const hc = c as HTMLElement;
              children.push(
                `${hc.tagName}#${hc.id}[${hc.className.substring(0, 60)}] type=${(hc as HTMLInputElement).type || ""} text="${hc.textContent?.trim().substring(0, 50)}"`,
              );
            });
            popups.push({
              id: htmlEl.id,
              className: htmlEl.className.substring(0, 100),
              childCount: htmlEl.children.length,
              innerTextPreview: htmlEl.innerText?.substring(0, 500),
              interactiveChildren: children.slice(0, 30),
            });
          }
        });
      result.popups = popups;

      // 5. Page URL
      result.url = window.location.href;

      // 6. Full visible text summary
      result.bodyTextPreview = document.body.innerText
        .replace(/\n{3,}/g, "\n\n")
        .substring(0, 3000);

      return result;
    });

    logger.info("=== DOM DUMP RESULTS ===");
    logger.info("Checkboxes found:", {
      count: (domDump.checkboxes as unknown[]).length,
      items: domDump.checkboxes,
    });
    logger.info("DX Checkbox spans found:", {
      count: (domDump.dxCheckboxes as unknown[]).length,
      items: domDump.dxCheckboxes,
    });
    logger.info("Validation area elements:", {
      parentTag: domDump.validationAreaParentTag,
      parentId: domDump.validationAreaParentId,
      parentClass: domDump.validationAreaParentClass,
      count: (domDump.validationAreaElements as unknown[]).length,
      items: domDump.validationAreaElements,
    });
    logger.info("Visible popups:", {
      count: (domDump.popups as unknown[]).length,
      items: domDump.popups,
    });
    logger.info("Page URL:", { url: domDump.url });
    logger.info("Body text preview:", {
      text: (domDump.bodyTextPreview as string).substring(0, 1500),
    });

    // ====== ABANDON ======
    logger.info("STEP 9: Navigating away to abandon...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

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
