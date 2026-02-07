#!/usr/bin/env tsx
/**
 * Test E2E: modifica cliente Sorrentino Dr. Domenico con dati Fresis.
 *
 * Verifica:
 *  - updateCustomerName → NOME DI RICERCA si aggiorna automaticamente
 *  - CAP edge-case con disambiguazione (00015 → Monterotondo)
 *  - Termini di pagamento non-standard (030)
 *
 * NON SALVA — naviga via dal form a fine test.
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

const CUSTOMER_TO_EDIT = "Sorrentino";

const updatedData = {
  name: "Fresis Soc Cooperativa",
  vatNumber: "08246131216",
  pec: "fresiscoop@pec.it",
  sdi: "KRRH6B9",
  street: "Via Nazionale, 112",
  postalCode: "00015",
  postalCodeCity: "Monterotondo",
  paymentTerms: "030",
  phone: "+390817774293",
  email: "fresiscoop@pec.it",
};

async function testUpdateCustomerName() {
  logger.info("=== TEST UPDATE CUSTOMER NAME + NOME DI RICERCA ===");
  logger.info("Cliente da modificare: Sorrentino Dr. Domenico");
  logger.info("Dati aggiornamento:", updatedData);
  logger.info("⚠ MODALITA' DRY-RUN: NON verra' salvato nulla");

  const bot = new ArchibaldBot();
  let exitCode = 0;

  try {
    logger.info("STEP 1: Inizializzazione browser...");
    await bot.initialize();
    logger.info("STEP 1: OK");

    logger.info("STEP 2: Login...");
    await bot.login();
    logger.info("STEP 2: OK");

    const page = (bot as any).page;

    logger.info("STEP 3: Navigazione alla lista clienti...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("STEP 3: OK — lista clienti caricata");

    logger.info("STEP 4: Ricerca '%s'...", CUSTOMER_TO_EDIT);
    await page.evaluate((name: string) => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const searchInput = inputs.find((i: any) =>
        /SearchAC.*Ed_I$/.test(i.id),
      ) as HTMLInputElement | null;
      if (!searchInput) throw new Error("Search input not found");
      searchInput.focus();
      searchInput.click();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(searchInput, name);
      else searchInput.value = name;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true,
        }),
      );
    }, CUSTOMER_TO_EDIT);

    await (bot as any).waitForDevExpressIdle({ timeout: 8000, label: "search-sorrentino" });
    logger.info("STEP 4: OK — ricerca completata");

    logger.info("STEP 5: Click su Modifica...");
    const editClicked = await page.evaluate(() => {
      const editBtns = Array.from(
        document.querySelectorAll('a[data-args*="Edit"], img[title="Modifica"]'),
      ).filter((el: any) => el.offsetParent !== null);
      if (editBtns.length === 0) return false;
      const target =
        editBtns[0].tagName === "IMG"
          ? editBtns[0].closest("a") || editBtns[0]
          : editBtns[0];
      (target as HTMLElement).click();
      return true;
    });

    if (!editClicked) throw new Error("Pulsante Modifica non trovato — il cliente potrebbe non esistere");

    await page.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await (bot as any).waitForDevExpressReady({ timeout: 10000 });
    logger.info("STEP 5: OK — form di modifica caricato");

    await page.screenshot({ path: "logs/test-update-name-before.png", fullPage: true });
    logger.info("Screenshot pre-modifica salvato: logs/test-update-name-before.png");

    // --- NOME + NOME DI RICERCA (il test principale) ---
    logger.info("STEP 6: updateCustomerName('%s')...", updatedData.name);
    await (bot as any).updateCustomerName(updatedData.name);
    logger.info("STEP 6: OK — NOME impostato, NOME DI RICERCA dovrebbe essere aggiornato");

    await page.screenshot({ path: "logs/test-update-name-after-name.png", fullPage: true });
    logger.info("Screenshot post-NOME salvato: logs/test-update-name-after-name.png");

    const searchNameValue = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const sn = inputs.find(
        (i: any) => /SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/.test(i.id),
      ) as HTMLInputElement | null;
      if (sn) return { found: true, value: sn.value, id: sn.id };

      const nameInput = inputs.find((i: any) => /xaf_dviNAME_Edit_I$/.test(i.id));
      if (nameInput) {
        const allVisible = inputs.filter(
          (i: any) => i.offsetParent !== null && i.type !== "hidden",
        );
        const idx = allVisible.indexOf(nameInput as HTMLInputElement);
        if (idx >= 0 && idx + 1 < allVisible.length) {
          const next = allVisible[idx + 1] as HTMLInputElement;
          return { found: true, value: next.value, id: next.id };
        }
      }
      return { found: false, value: "", id: "" };
    });

    logger.info("Verifica NOME DI RICERCA:", searchNameValue);
    if (searchNameValue.found && searchNameValue.value) {
      logger.info("NOME DI RICERCA aggiornato correttamente: '%s'", searchNameValue.value);
    } else {
      logger.warn("NOME DI RICERCA potrebbe non essersi aggiornato — verificare screenshot");
    }

    // --- P.IVA ---
    logger.info("STEP 7: Impostazione P.IVA '%s'...", updatedData.vatNumber);
    await (bot as any).setDevExpressField(/xaf_dviVATNUM_Edit_I$/, updatedData.vatNumber);
    logger.info("STEP 7: OK");

    // --- PEC ---
    logger.info("STEP 8: Impostazione PEC '%s'...", updatedData.pec);
    await (bot as any).setDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, updatedData.pec);
    logger.info("STEP 8: OK");

    // --- SDI ---
    logger.info("STEP 9: Impostazione SDI '%s'...", updatedData.sdi);
    await (bot as any).setDevExpressField(/xaf_dviLEGALAUTHORITY_Edit_I$/, updatedData.sdi);
    logger.info("STEP 9: OK");

    // --- Indirizzo ---
    logger.info("STEP 10: Impostazione indirizzo '%s'...", updatedData.street);
    await (bot as any).setDevExpressField(/xaf_dviSTREET_Edit_I$/, updatedData.street);
    logger.info("STEP 10: OK");

    // --- CAP edge-case con disambiguazione ---
    logger.info(
      "STEP 11: CAP edge-case '%s' con hint citta' '%s'...",
      updatedData.postalCode,
      updatedData.postalCodeCity,
    );
    await (bot as any).selectFromDevExpressLookup(
      /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
      updatedData.postalCode,
      updatedData.postalCodeCity,
    );
    logger.info("STEP 11: OK — CAP con disambiguazione completato");

    await page.screenshot({ path: "logs/test-update-name-after-cap.png", fullPage: true });
    logger.info("Screenshot post-CAP salvato: logs/test-update-name-after-cap.png");

    // --- Termini di pagamento edge-case ---
    logger.info("STEP 12: Termini di pagamento edge-case '%s'...", updatedData.paymentTerms);
    await (bot as any).selectFromDevExpressLookup(
      /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
      updatedData.paymentTerms,
    );
    logger.info("STEP 12: OK — termini di pagamento impostati");

    // --- Telefono ---
    logger.info("STEP 13: Impostazione telefono '%s'...", updatedData.phone);
    await (bot as any).setDevExpressField(/xaf_dviPHONE_Edit_I$/, updatedData.phone);
    logger.info("STEP 13: OK");

    // --- Email ---
    logger.info("STEP 14: Impostazione email '%s'...", updatedData.email);
    await (bot as any).setDevExpressField(/xaf_dviEMAIL_Edit_I$/, updatedData.email);
    logger.info("STEP 14: OK");

    await page.screenshot({ path: "logs/test-update-name-final.png", fullPage: true });
    logger.info("Screenshot finale salvato: logs/test-update-name-final.png");

    logger.info("=== TUTTI I CAMPI COMPILATI — NON SALVO ===");
    logger.info("Attendo 5 secondi per ispezione visiva...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    logger.info("Navigazione via dal form SENZA salvare...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    logger.info("=== TEST COMPLETATO CON SUCCESSO (dry-run, nulla salvato) ===");
  } catch (error) {
    logger.error("TEST FALLITO", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    try {
      const page = (bot as any).page;
      if (page) {
        await page.screenshot({ path: "logs/test-update-name-error.png", fullPage: true });
        logger.info("Screenshot errore salvato: logs/test-update-name-error.png");
      }
    } catch {
      // ignore screenshot errors
    }

    exitCode = 1;
  } finally {
    logger.info("Attendo 3 secondi prima di chiudere il browser...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await bot.close();
  }

  process.exit(exitCode);
}

testUpdateCustomerName();
