#!/usr/bin/env tsx

import { ArchibaldBot } from "../bot/archibald-bot";
import { config } from "../config";
import { logger } from "../logger";
import fs from "fs/promises";

type FieldSnapshot = {
  id: string;
  name: string;
  type: string;
  value: string;
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
  label: string | null;
};

async function snapshotAllFields(
  page: any,
  label: string,
): Promise<FieldSnapshot[]> {
  return page.evaluate((lbl: string) => {
    const inputs = Array.from(
      document.querySelectorAll(
        'input[type="text"], input[type="hidden"], textarea, select',
      ),
    ) as HTMLInputElement[];

    return inputs.map((el) => {
      const rect = el.getBoundingClientRect();
      const captionLabel =
        el
          .closest("tr")
          ?.querySelector("td.dxflCaption_DevEx")
          ?.textContent?.trim() ||
        el.closest("tr")?.querySelector("label")?.textContent?.trim() ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        null;

      const parentTd = el.closest("td");
      const siblingLabel =
        parentTd?.previousElementSibling?.textContent?.trim();

      return {
        id: el.id,
        name: el.name,
        type: el.type,
        value: el.value,
        visible: rect.width > 0 && rect.height > 0,
        disabled: el.disabled,
        readOnly: el.readOnly,
        label: captionLabel || siblingLabel || null,
      };
    });
  }, label);
}

async function discoverVatAutofill() {
  logger.info("=== VAT AUTO-FILL DISCOVERY ===");
  logger.info(
    "ATTENZIONE: NON verra' MAI premuto 'Salva e Chiudi' - scoperta solo lettura!",
  );

  const bot = new ArchibaldBot();
  const results: any = {
    timestamp: new Date().toISOString(),
    testVatNumber: "06104510653",
    phases: {},
  };

  try {
    logger.info("1. Inizializzazione browser e login...");
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page!;

    // ============================
    // FASE A: Navigazione al form nuovo cliente
    // ============================
    logger.info("2. Navigazione alla lista clienti...");
    await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    logger.info("3. Clicco 'Nuovo' per aprire form creazione cliente...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      page.evaluate(() => {
        const elements = Array.from(
          document.querySelectorAll("span, button, a"),
        );
        const btn = elements.find(
          (el) => el.textContent?.trim().toLowerCase() === "nuovo",
        );
        if (btn) (btn as HTMLElement).click();
      }),
    ]);

    logger.info("Form creazione cliente caricato:", { url: page.url() });
    await new Promise((resolve) => setTimeout(resolve, 4000));

    await page.screenshot({
      path: "/tmp/vat-autofill-01-form-loaded.png",
      fullPage: true,
    });

    // ============================
    // FASE B: Snapshot PRIMA dell'inserimento P.IVA (baseline)
    // ============================
    logger.info("4. Snapshot baseline (prima di inserire P.IVA)...");
    const baselineFields = await snapshotAllFields(page, "baseline");
    results.phases.baseline = {
      fieldCount: baselineFields.length,
      fields: baselineFields,
    };

    logger.info(`Baseline: ${baselineFields.length} campi trovati`);

    // Log dei campi che contengono "VAT" o "IVA" nel loro ID o label
    const vatRelatedBaseline = baselineFields.filter(
      (f) =>
        f.id.toLowerCase().includes("vat") ||
        f.id.toLowerCase().includes("iva") ||
        (f.label &&
          (f.label.toLowerCase().includes("iva") ||
            f.label.toLowerCase().includes("vat"))),
    );
    logger.info("Campi VAT-related nel baseline:");
    for (const f of vatRelatedBaseline) {
      logger.info(
        `  id=${f.id} label="${f.label}" value="${f.value}" visible=${f.visible}`,
      );
    }

    // ============================
    // FASE C: Inserimento P.IVA di test
    // ============================
    const testVat = "06104510653";
    logger.info(`5. Inserimento P.IVA di test: ${testVat}...`);

    const vatFieldResult = await page.evaluate((vatNumber: string) => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const vatInput = inputs.find((i) =>
        /xaf_dviVATNUM_Edit_I$/.test(i.id),
      ) as HTMLInputElement | null;

      if (!vatInput) return { found: false, id: "" };

      vatInput.scrollIntoView({ block: "center" });
      vatInput.focus();
      vatInput.click();

      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(vatInput, vatNumber);
      else vatInput.value = vatNumber;

      vatInput.dispatchEvent(new Event("input", { bubbles: true }));
      vatInput.dispatchEvent(new Event("change", { bubbles: true }));

      return { found: true, id: vatInput.id };
    }, testVat);

    results.phases.vatInsertion = vatFieldResult;
    logger.info("Campo P.IVA trovato:", vatFieldResult);

    if (!vatFieldResult.found) {
      logger.error("Campo P.IVA non trovato! Uscita.");
      return;
    }

    // Tab per trigger il lookup server-side
    logger.info("6. Tab per attivare il lookup server-side...");
    await page.keyboard.press("Tab");

    await page.screenshot({
      path: "/tmp/vat-autofill-02-after-tab.png",
      fullPage: true,
    });

    // Attesa estesa per il lookup (fino a 20 secondi)
    logger.info("7. Attesa auto-fill dal server (timeout 20s)...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Controlliamo se ci sono callback in corso
    const waitResult = await page.evaluate(() => {
      const w = window as any;
      if (w.ASPxClientControl?.GetControlCollection) {
        const collection = w.ASPxClientControl.GetControlCollection();
        let inCallback = false;
        collection.ForEachControl((c: any) => {
          if (typeof c.InCallback === "function" && c.InCallback()) {
            inCallback = true;
          }
        });
        return { inCallback };
      }
      return { inCallback: false };
    });

    logger.info("Stato callback dopo 5s:", waitResult);

    if (waitResult.inCallback) {
      logger.info("Callback ancora in corso, attendo altri 15s...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
    } else {
      logger.info("Nessuna callback attiva, attendo altri 5s per sicurezza...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    await page.screenshot({
      path: "/tmp/vat-autofill-03-after-wait.png",
      fullPage: true,
    });

    // ============================
    // FASE D: Snapshot DOPO l'auto-fill
    // ============================
    logger.info("8. Snapshot dopo auto-fill...");
    const afterFields = await snapshotAllFields(page, "after-vat");
    results.phases.afterVat = {
      fieldCount: afterFields.length,
      fields: afterFields,
    };

    logger.info(`Dopo auto-fill: ${afterFields.length} campi trovati`);

    // Log dei campi VAT-related dopo
    const vatRelatedAfter = afterFields.filter(
      (f) =>
        f.id.toLowerCase().includes("vat") ||
        f.id.toLowerCase().includes("iva") ||
        (f.label &&
          (f.label.toLowerCase().includes("iva") ||
            f.label.toLowerCase().includes("vat"))),
    );
    logger.info("Campi VAT-related dopo auto-fill:");
    for (const f of vatRelatedAfter) {
      logger.info(
        `  id=${f.id} label="${f.label}" value="${f.value}" visible=${f.visible}`,
      );
    }

    // ============================
    // FASE E: Diff tra baseline e after
    // ============================
    logger.info("9. Calcolo diff tra baseline e after...");
    const changedFields: any[] = [];
    const newFields: any[] = [];

    const baselineMap = new Map(baselineFields.map((f) => [f.id, f]));
    const afterMap = new Map(afterFields.map((f) => [f.id, f]));

    // Campi con valore cambiato
    for (const [id, after] of afterMap) {
      const before = baselineMap.get(id);
      if (!before) {
        newFields.push({ ...after, changeType: "new" });
      } else if (before.value !== after.value) {
        changedFields.push({
          id,
          label: after.label || before.label,
          beforeValue: before.value,
          afterValue: after.value,
          visible: after.visible,
          disabled: after.disabled,
          readOnly: after.readOnly,
        });
      }
    }

    // Campi spariti
    const removedFields: any[] = [];
    for (const [id, before] of baselineMap) {
      if (!afterMap.has(id)) {
        removedFields.push({ ...before, changeType: "removed" });
      }
    }

    results.phases.diff = {
      changedFields,
      newFields,
      removedFields,
      summary: {
        totalChanged: changedFields.length,
        totalNew: newFields.length,
        totalRemoved: removedFields.length,
      },
    };

    logger.info("=== DIFF RISULTATI ===");
    logger.info(`Campi cambiati: ${changedFields.length}`);
    for (const f of changedFields) {
      logger.info(
        `  CHANGED: id=${f.id} label="${f.label}" "${f.beforeValue}" -> "${f.afterValue}"`,
      );
    }
    logger.info(`Campi nuovi: ${newFields.length}`);
    for (const f of newFields) {
      logger.info(`  NEW: id=${f.id} label="${f.label}" value="${f.value}"`);
    }
    logger.info(`Campi rimossi: ${removedFields.length}`);
    for (const f of removedFields) {
      logger.info(
        `  REMOVED: id=${f.id} label="${f.label}" value="${f.value}"`,
      );
    }

    // ============================
    // FASE F: Esplorazione specifica dei campi "ultimo controllo", "validata", "indirizzo"
    // ============================
    logger.info(
      "10. Ricerca specifica campi ULTIMO CONTROLLO IVA, IVA VALIDATA, INDIRIZZO IVA...",
    );

    const specificSearch = await page.evaluate(() => {
      const captionCells = Array.from(
        document.querySelectorAll(
          "td.dxflCaption_DevEx, td.dxflCaptionCell_DevEx, .dxflCaption_DevEx",
        ),
      );

      const found: any[] = [];
      for (const cell of captionCells) {
        const labelText = (cell.textContent?.trim() || "").toLowerCase();
        if (
          labelText.includes("ultimo controllo") ||
          labelText.includes("last vat") ||
          labelText.includes("iva validata") ||
          labelText.includes("vat valid") ||
          labelText.includes("indirizzo iva") ||
          labelText.includes("vat address") ||
          labelText.includes("controllo iva") ||
          labelText.includes("vat check")
        ) {
          const row = cell.closest("tr");
          if (!row) continue;

          const inputsInRow = Array.from(
            row.querySelectorAll(
              'input[type="text"], input[type="hidden"], textarea, select',
            ),
          ) as HTMLInputElement[];

          found.push({
            label: cell.textContent?.trim(),
            inputs: inputsInRow.map((inp) => ({
              id: inp.id,
              name: inp.name,
              type: inp.type,
              value: inp.value,
              visible:
                inp.getBoundingClientRect().width > 0 &&
                inp.getBoundingClientRect().height > 0,
              disabled: inp.disabled,
              readOnly: inp.readOnly,
            })),
          });
        }
      }
      return found;
    });

    results.phases.specificVatFields = specificSearch;
    logger.info(`Campi specifici VAT trovati: ${specificSearch.length}`);
    for (const f of specificSearch) {
      logger.info(
        `  "${f.label}" => inputs: [${f.inputs.map((i: any) => `${i.id}="${i.value}"`).join(", ")}]`,
      );
    }

    // Cerchiamo anche tramite ID patterns comuni
    const idPatternSearch = await page.evaluate(() => {
      const patterns = [
        /VATCHECK/i,
        /VATVALID/i,
        /VATADDR/i,
        /LASTCHECK/i,
        /ULTIMOCONTROLLO/i,
        /IVAVALID/i,
        /INDIRIZZO.*IVA/i,
        /VATDATE/i,
        /CHECKDATE/i,
        /VATRESULT/i,
        /VATADDRESS/i,
      ];

      const inputs = Array.from(
        document.querySelectorAll("input, textarea, select"),
      ) as HTMLInputElement[];

      return inputs
        .filter((el) => patterns.some((p) => p.test(el.id) || p.test(el.name)))
        .map((el) => ({
          id: el.id,
          name: el.name,
          type: el.type,
          value: el.value,
          visible:
            el.getBoundingClientRect().width > 0 &&
            el.getBoundingClientRect().height > 0,
        }));
    });

    results.phases.idPatternSearch = idPatternSearch;
    logger.info(`Campi trovati via ID pattern: ${idPatternSearch.length}`);
    for (const f of idPatternSearch) {
      logger.info(`  id=${f.id} value="${f.value}" visible=${f.visible}`);
    }

    // ============================
    // FASE G: Dump DevExpress controls con valori
    // ============================
    logger.info("11. Dump completo DevExpress controls con valori...");
    const dxControlsDump = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) {
        return { error: "No ASPxClientControl" };
      }

      const controls: any[] = [];
      const collection = w.ASPxClientControl.GetControlCollection();

      collection.ForEachControl((c: any) => {
        const entry: any = {
          name: c.name || "(no name)",
          type: c.constructor?.name || "(unknown)",
        };

        try {
          if (typeof c.GetValue === "function") entry.value = c.GetValue();
          if (typeof c.GetText === "function") entry.text = c.GetText();
        } catch {
          /* ignore */
        }

        try {
          const inputEl = c.GetInputElement?.();
          if (inputEl) {
            entry.inputId = inputEl.id;
            entry.inputValue = inputEl.value;
          }
        } catch {
          /* ignore */
        }

        controls.push(entry);
      });

      return { controls };
    });

    results.phases.dxControlsDump = dxControlsDump;

    // Filter per trovare quelli con valori diversi dal baseline
    if (dxControlsDump.controls) {
      const withValues = dxControlsDump.controls.filter(
        (c: any) => c.value || c.text || c.inputValue,
      );
      logger.info(`DevExpress controls con valori: ${withValues.length}`);
      for (const c of withValues) {
        logger.info(
          `  name=${c.name} value="${c.value}" text="${c.text}" inputValue="${c.inputValue}"`,
        );
      }
    }

    // ============================
    // SALVA RISULTATI
    // ============================
    const outputPath = "/tmp/vat-autofill-discovery.json";
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    logger.info(`\nRisultati completi salvati in: ${outputPath}`);

    logger.info("\n=== VAT AUTO-FILL DISCOVERY COMPLETATA ===");
    logger.info(
      "NON e' stato premuto 'Salva e Chiudi' - nessuna modifica su Archibald.",
    );
  } catch (error) {
    logger.error("Discovery fallita", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  } finally {
    await bot.close();
  }
}

discoverVatAutofill();
