#!/usr/bin/env tsx

import { ArchibaldBot } from "../bot/archibald-bot";
import { config } from "../config";
import { logger } from "../logger";
import fs from "fs/promises";

async function discoverAllDxControls(page: any, label: string) {
  return page.evaluate((lbl: string) => {
    const results: any[] = [];
    const w = window as any;

    if (!w.ASPxClientControl?.GetControlCollection) {
      return { label: lbl, error: "ASPxClientControl not found", controls: [] };
    }

    const collection = w.ASPxClientControl.GetControlCollection();
    collection.ForEachControl((c: any) => {
      const methods: string[] = [];
      const allMethods = [
        "AddNewRow", "UpdateEdit", "CancelEdit", "DeleteRow",
        "GotoPage", "NextPage", "PrevPage", "GetPageIndex", "GetPageCount",
        "GetVisibleRowsOnPage", "InCallback", "IsEditing", "IsNewRowEditing",
        "SetEditValue", "GetEditValue", "GetEditor", "FocusEditor",
        "SetFocusedRowIndex", "GetFocusedRowIndex", "Refresh", "PerformCallback",
        "StartEditRow", "GetRowValues",
        "SetValue", "GetValue", "SetText", "GetText",
        "SetSelectedIndex", "FindItemByValue", "FindItemByText",
        "ShowDropDown", "HideDropDown", "GetItemCount", "EnsureDropDownLoaded",
        "SetActiveTab", "GetActiveTab", "GetActiveTabIndex", "SetActiveTabIndex",
        "GetTabCount", "GetTab",
        "GetItemByName", "GetItem",
        "Focus", "GetInputElement", "SetEnabled", "GetEnabled",
        "GetVisible", "SetVisible",
      ];

      for (const method of allMethods) {
        if (typeof c[method] === "function") {
          methods.push(method);
        }
      }

      const isGrid = typeof c.AddNewRow === "function";
      const isComboBox =
        typeof c.ShowDropDown === "function" &&
        typeof c.FindItemByValue === "function";
      const isLookup =
        typeof c.ShowDropDown === "function" && !isComboBox;
      const isTabControl =
        typeof c.SetActiveTab === "function" ||
        typeof c.GetActiveTab === "function";
      const isMenu = typeof c.GetItemByName === "function";
      const isTextBox =
        typeof c.GetInputElement === "function" &&
        !isComboBox &&
        !isLookup &&
        !isGrid;

      const entry: any = {
        name: c.name || "(no name)",
        type: c.constructor?.name || "(unknown)",
        methods,
        isGrid,
        isComboBox,
        isLookup,
        isTabControl,
        isMenu,
        isTextBox,
      };

      if (isComboBox || isLookup) {
        try {
          entry.currentValue = c.GetValue?.();
          entry.currentText = c.GetText?.();
          entry.itemCount = c.GetItemCount?.();
        } catch { /* ignore */ }
      }

      if (isGrid) {
        try {
          entry.pageCount = c.GetPageCount?.();
          entry.pageIndex = c.GetPageIndex?.();
          entry.isEditing = c.IsEditing?.();
          entry.visibleRowsOnPage = c.GetVisibleRowsOnPage?.();
        } catch { /* ignore */ }
      }

      if (isTabControl) {
        try {
          entry.activeTabIndex = c.GetActiveTabIndex?.();
          entry.tabCount = c.GetTabCount?.();
          const tabs: any[] = [];
          for (let i = 0; i < (entry.tabCount || 0); i++) {
            const tab = c.GetTab?.(i);
            if (tab) {
              tabs.push({
                index: i,
                name: tab.name || `tab-${i}`,
                text: tab.text || tab.GetText?.() || "",
              });
            }
          }
          entry.tabs = tabs;
        } catch { /* ignore */ }
      }

      if (isTextBox) {
        try {
          const inputEl = c.GetInputElement?.();
          entry.inputId = inputEl?.id || null;
          entry.inputName = inputEl?.name || null;
          entry.inputValue = inputEl?.value || null;
        } catch { /* ignore */ }
      }

      results.push(entry);
    });

    return { label: lbl, error: null, controls: results };
  }, label);
}

async function discoverFormInputs(page: any, label: string) {
  return page.evaluate((lbl: string) => {
    const inputs = Array.from(
      document.querySelectorAll(
        'input[type="text"], input[type="hidden"], textarea, select',
      ),
    ) as HTMLInputElement[];

    const mapped = inputs.map((el) => {
      const rect = el.getBoundingClientRect();
      const label =
        el.closest("tr")?.querySelector("td.dxflCaption_DevEx")
          ?.textContent?.trim() ||
        el.closest("tr")?.querySelector("label")?.textContent?.trim() ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        null;

      const parentTd = el.closest("td");
      const siblingLabel = parentTd?.previousElementSibling?.textContent?.trim();

      return {
        id: el.id,
        name: el.name,
        type: el.type,
        value: el.value,
        placeholder: el.placeholder || null,
        label: label || siblingLabel || null,
        visible: rect.width > 0 && rect.height > 0,
        disabled: el.disabled,
        readOnly: el.readOnly,
        className: el.className?.substring(0, 100),
      };
    });

    const buttons = Array.from(
      document.querySelectorAll("a, button, span"),
    ) as HTMLElement[];
    const actionButtons = buttons
      .filter((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        return (
          text.includes("salva") ||
          text.includes("save") ||
          text.includes("chiudi") ||
          text.includes("close") ||
          text.includes("nuovo") ||
          text.includes("new") ||
          text.includes("modifica") ||
          text.includes("edit") ||
          text.includes("find") ||
          text.includes("cerca") ||
          text.includes("elimina") ||
          text.includes("delete")
        );
      })
      .map((el) => ({
        tag: el.tagName,
        id: el.id,
        text: el.textContent?.trim().substring(0, 80),
        className: el.className?.substring(0, 100),
        visible:
          el.getBoundingClientRect().width > 0 &&
          el.getBoundingClientRect().height > 0,
      }));

    return {
      label: lbl,
      inputs: mapped,
      actionButtons,
      totalInputs: mapped.length,
      visibleInputs: mapped.filter((i) => i.visible).length,
    };
  }, label);
}

async function discoverCustomerControls() {
  logger.info("=== CUSTOMER DEVEXPRESS CONTROL DISCOVERY ===");
  logger.info(
    "ATTENZIONE: NON verra' MAI premuto 'Salva e Chiudi' - i clienti non si possono cancellare!",
  );

  const bot = new ArchibaldBot();
  const allResults: any = { timestamp: new Date().toISOString(), pages: {} };

  try {
    logger.info("1. Inizializzazione browser e login...");
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page!;

    // ============================
    // FASE A: Lista clienti
    // ============================
    logger.info("2. Navigazione alla lista clienti...");
    await page.goto(
      `${config.archibald.url}/CUSTTABLE_ListView_Agent/`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));

    logger.info("2a. Discovery controlli lista clienti...");
    allResults.pages.customerList = {
      url: page.url(),
      dxControls: await discoverAllDxControls(page, "customer-list"),
      formInputs: await discoverFormInputs(page, "customer-list"),
    };

    await page.screenshot({
      path: "/tmp/customer-list-screenshot.png",
      fullPage: true,
    });
    logger.info("Screenshot lista clienti salvato: /tmp/customer-list-screenshot.png");

    // ============================
    // FASE B: Creazione nuovo cliente
    // ============================
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

    logger.info("3a. Discovery controlli DevExpress form creazione...");
    allResults.pages.customerCreateForm = {
      url: page.url(),
      dxControls: await discoverAllDxControls(page, "customer-create-form"),
      formInputs: await discoverFormInputs(page, "customer-create-form"),
    };

    await page.screenshot({
      path: "/tmp/customer-create-form-screenshot.png",
      fullPage: true,
    });
    logger.info("Screenshot form creazione salvato: /tmp/customer-create-form-screenshot.png");

    // Scopriamo i tab disponibili
    logger.info("3b. Esplorazione tab del form...");
    const tabDiscovery = await page.evaluate(() => {
      const w = window as any;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (!collection) return { error: "No collection", tabs: [] };

      const tabControls: any[] = [];
      collection.ForEachControl((c: any) => {
        if (typeof c.SetActiveTab === "function" || typeof c.GetActiveTab === "function") {
          const tabs: any[] = [];
          const count = c.GetTabCount?.() || 0;
          for (let i = 0; i < count; i++) {
            const tab = c.GetTab?.(i);
            tabs.push({
              index: i,
              name: tab?.name,
              text: tab?.text || tab?.GetText?.(),
            });
          }
          tabControls.push({
            controlName: c.name,
            activeIndex: c.GetActiveTabIndex?.(),
            tabCount: count,
            tabs,
          });
        }
      });
      return { error: null, tabControls };
    });

    allResults.pages.customerCreateForm.tabs = tabDiscovery;
    logger.info("Tab trovati:", tabDiscovery);

    // Cerchiamo specificamente i campi del form usando le label DevExpress
    logger.info("3c. Mapping campi form con label...");
    const fieldMapping = await page.evaluate(() => {
      const fields: any[] = [];

      // Pattern DevExpress: caption in <td class="dxflCaption_DevEx"> + input nella cella successiva
      const captionCells = Array.from(
        document.querySelectorAll("td.dxflCaption_DevEx, td.dxflCaptionCell_DevEx, .dxflCaption_DevEx"),
      );

      for (const cell of captionCells) {
        const labelText = cell.textContent?.trim() || "";
        const row = cell.closest("tr");
        if (!row) continue;

        const inputsInRow = Array.from(
          row.querySelectorAll('input[type="text"], textarea, select'),
        ) as HTMLInputElement[];

        const hiddenInputsInRow = Array.from(
          row.querySelectorAll('input[type="hidden"]'),
        ) as HTMLInputElement[];

        const buttonsInRow = Array.from(
          row.querySelectorAll("a, button, img"),
        ).filter((el) => {
          const id = (el as HTMLElement).id || "";
          return (
            id.includes("_B-1") ||
            id.includes("_B0") ||
            id.includes("Find") ||
            id.includes("find")
          );
        }) as HTMLElement[];

        if (inputsInRow.length > 0 || hiddenInputsInRow.length > 0) {
          fields.push({
            label: labelText,
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
            hiddenInputs: hiddenInputsInRow.map((inp) => ({
              id: inp.id,
              name: inp.name,
              value: inp.value,
            })),
            buttons: buttonsInRow.map((btn) => ({
              id: btn.id,
              title: btn.getAttribute("title") || "",
              className: btn.className?.substring(0, 80),
            })),
          });
        }
      }

      return fields;
    });

    allResults.pages.customerCreateForm.fieldMapping = fieldMapping;
    logger.info(`Campi form mappati: ${fieldMapping.length}`);
    for (const field of fieldMapping) {
      logger.info(
        `  "${field.label}" => inputs: [${field.inputs.map((i: any) => i.id).join(", ")}] buttons: [${field.buttons.map((b: any) => b.id).join(", ")}]`,
      );
    }

    // Scopriamo i "Find" buttons (lenti di ingrandimento) per campi lookup
    logger.info("3d. Ricerca pulsanti 'Find' (lenti di ingrandimento)...");
    const findButtons = await page.evaluate(() => {
      const allAnchors = Array.from(document.querySelectorAll("a, img, button"));
      return allAnchors
        .filter((el) => {
          const id = (el as HTMLElement).id || "";
          const title = el.getAttribute("title") || "";
          const text = el.textContent?.trim() || "";
          return (
            id.toLowerCase().includes("find") ||
            title.toLowerCase().includes("find") ||
            title.toLowerCase().includes("cerca") ||
            text.toLowerCase() === "find" ||
            text.toLowerCase() === "cerca"
          );
        })
        .map((el) => ({
          id: (el as HTMLElement).id,
          tag: el.tagName,
          title: el.getAttribute("title"),
          text: el.textContent?.trim().substring(0, 50),
          visible:
            (el as HTMLElement).getBoundingClientRect().width > 0 &&
            (el as HTMLElement).getBoundingClientRect().height > 0,
          parentId: el.closest("td")?.id || el.closest("div")?.id || null,
        }));
    });

    allResults.pages.customerCreateForm.findButtons = findButtons;
    logger.info(`Pulsanti Find trovati: ${findButtons.length}`);
    for (const btn of findButtons) {
      logger.info(`  Find button: id=${btn.id} title="${btn.title}" tag=${btn.tag} visible=${btn.visible}`);
    }

    // ============================
    // FASE C: Esploriamo tab "Prezzi e sconti"
    // ============================
    logger.info("4. Navigazione al tab 'Prezzi e sconti'...");
    const priceTabResult = await page.evaluate(() => {
      const w = window as any;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (!collection) return { error: "No collection" };

      let tabControl: any = null;
      let priceTabIndex = -1;

      collection.ForEachControl((c: any) => {
        if (typeof c.GetTabCount === "function") {
          const count = c.GetTabCount();
          for (let i = 0; i < count; i++) {
            const tab = c.GetTab(i);
            const text = (tab?.text || tab?.GetText?.() || "").toLowerCase();
            if (text.includes("prezzi") || text.includes("price") || text.includes("sconti")) {
              tabControl = c;
              priceTabIndex = i;
            }
          }
        }
      });

      if (tabControl && priceTabIndex >= 0) {
        tabControl.SetActiveTabIndex(priceTabIndex);
        return { success: true, tabIndex: priceTabIndex };
      }
      return { success: false, error: "Tab 'Prezzi e sconti' not found" };
    });

    logger.info("Navigazione tab Prezzi e sconti:", priceTabResult);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (priceTabResult.success) {
      const priceTabControls = await discoverAllDxControls(page, "price-tab");
      const priceTabInputs = await discoverFormInputs(page, "price-tab");
      const priceTabFieldMapping = await page.evaluate(() => {
        const fields: any[] = [];
        const captionCells = Array.from(
          document.querySelectorAll("td.dxflCaption_DevEx, td.dxflCaptionCell_DevEx, .dxflCaption_DevEx"),
        );
        for (const cell of captionCells) {
          const labelText = cell.textContent?.trim() || "";
          const row = cell.closest("tr");
          if (!row) continue;
          const inputsInRow = Array.from(
            row.querySelectorAll('input[type="text"], textarea, select'),
          ) as HTMLInputElement[];
          if (inputsInRow.length > 0) {
            const rect = inputsInRow[0].getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              fields.push({
                label: labelText,
                inputs: inputsInRow.map((inp) => ({
                  id: inp.id,
                  name: inp.name,
                  value: inp.value,
                })),
              });
            }
          }
        }
        return fields;
      });

      allResults.pages.customerCreateFormPriceTab = {
        dxControls: priceTabControls,
        formInputs: priceTabInputs,
        fieldMapping: priceTabFieldMapping,
      };

      await page.screenshot({
        path: "/tmp/customer-create-price-tab-screenshot.png",
        fullPage: true,
      });
      logger.info("Screenshot tab Prezzi e sconti salvato");
      logger.info("Campi tab Prezzi e sconti:");
      for (const f of priceTabFieldMapping) {
        logger.info(`  "${f.label}" => [${f.inputs.map((i: any) => i.id).join(", ")}]`);
      }
    }

    // ============================
    // FASE D: Modifica cliente esistente
    // ============================
    logger.info("5. Navigazione indietro alla lista clienti per test modifica...");
    await page.goto(
      `${config.archibald.url}/CUSTTABLE_ListView_Agent/`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Cerco un cliente specifico (simuliamo la ricerca)
    logger.info("5a. Discovery barra di ricerca lista clienti...");
    const searchBarDiscovery = await page.evaluate(() => {
      const searchInputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).filter((el) => {
        const id = (el as HTMLInputElement).id || "";
        return (
          id.includes("DXSE") ||
          id.includes("Search") ||
          id.includes("search") ||
          id.includes("FilterEditor")
        );
      }) as HTMLInputElement[];

      return searchInputs.map((el) => ({
        id: el.id,
        name: el.name,
        placeholder: el.placeholder,
        value: el.value,
        visible:
          el.getBoundingClientRect().width > 0 &&
          el.getBoundingClientRect().height > 0,
      }));
    });

    allResults.pages.customerListSearch = searchBarDiscovery;
    logger.info("Barre di ricerca trovate:", searchBarDiscovery);

    // Cerco i pulsanti Modifica (matita) nella griglia
    logger.info("5b. Discovery pulsanti Modifica nella griglia...");
    const editButtons = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll("a, img"));
      return allLinks
        .filter((el) => {
          const id = (el as HTMLElement).id || "";
          const title = el.getAttribute("title") || "";
          const text = el.textContent?.trim().toLowerCase() || "";
          const cls = (el as HTMLElement).className || "";
          return (
            text.includes("modifica") ||
            text.includes("edit") ||
            title.toLowerCase().includes("modifica") ||
            title.toLowerCase().includes("edit") ||
            id.includes("EditAction") ||
            id.includes("editAction") ||
            cls.includes("edit")
          );
        })
        .map((el) => ({
          id: (el as HTMLElement).id,
          tag: el.tagName,
          title: el.getAttribute("title"),
          text: el.textContent?.trim().substring(0, 50),
          href: (el as HTMLAnchorElement).href || null,
          className: (el as HTMLElement).className?.substring(0, 100),
          visible:
            (el as HTMLElement).getBoundingClientRect().width > 0 &&
            (el as HTMLElement).getBoundingClientRect().height > 0,
        }));
    });

    allResults.pages.customerListEditButtons = editButtons;
    logger.info(`Pulsanti Modifica trovati: ${editButtons.length}`);
    for (const btn of editButtons) {
      logger.info(
        `  Edit button: id=${btn.id} tag=${btn.tag} title="${btn.title}" text="${btn.text}" visible=${btn.visible}`,
      );
    }

    // Navighiamo alla pagina di modifica di un cliente noto
    logger.info("5c. Navigazione diretta alla pagina di modifica cliente (ID 57213)...");
    await page.goto(
      `${config.archibald.url}/CUSTTABLE_DetailView/57213/?mode=Edit`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 4000));

    logger.info("5d. Discovery controlli form modifica cliente...");
    allResults.pages.customerEditForm = {
      url: page.url(),
      dxControls: await discoverAllDxControls(page, "customer-edit-form"),
      formInputs: await discoverFormInputs(page, "customer-edit-form"),
    };

    const editFieldMapping = await page.evaluate(() => {
      const fields: any[] = [];
      const captionCells = Array.from(
        document.querySelectorAll("td.dxflCaption_DevEx, td.dxflCaptionCell_DevEx, .dxflCaption_DevEx"),
      );
      for (const cell of captionCells) {
        const labelText = cell.textContent?.trim() || "";
        const row = cell.closest("tr");
        if (!row) continue;
        const inputsInRow = Array.from(
          row.querySelectorAll('input[type="text"], textarea, select'),
        ) as HTMLInputElement[];
        const hiddenInputsInRow = Array.from(
          row.querySelectorAll('input[type="hidden"]'),
        ) as HTMLInputElement[];
        const buttonsInRow = Array.from(
          row.querySelectorAll("a, button, img"),
        ).filter((el) => {
          const id = (el as HTMLElement).id || "";
          return id.includes("_B-1") || id.includes("_B0") || id.includes("Find") || id.includes("find");
        }) as HTMLElement[];

        if (inputsInRow.length > 0 || hiddenInputsInRow.length > 0) {
          fields.push({
            label: labelText,
            inputs: inputsInRow.map((inp) => ({
              id: inp.id,
              name: inp.name,
              value: inp.value,
              visible: inp.getBoundingClientRect().width > 0 && inp.getBoundingClientRect().height > 0,
              disabled: inp.disabled,
              readOnly: inp.readOnly,
            })),
            hiddenInputs: hiddenInputsInRow.map((inp) => ({
              id: inp.id,
              name: inp.name,
              value: inp.value,
            })),
            buttons: buttonsInRow.map((btn) => ({
              id: btn.id,
              title: btn.getAttribute("title") || "",
            })),
          });
        }
      }
      return fields;
    });

    allResults.pages.customerEditForm.fieldMapping = editFieldMapping;
    logger.info(`Campi form modifica mappati: ${editFieldMapping.length}`);
    for (const field of editFieldMapping) {
      const vals = field.inputs.map((i: any) => `${i.id}="${i.value}"`).join(", ");
      logger.info(`  "${field.label}" => [${vals}]`);
    }

    // Find buttons nella pagina edit
    const editFindButtons = await page.evaluate(() => {
      const allAnchors = Array.from(document.querySelectorAll("a, img, button"));
      return allAnchors
        .filter((el) => {
          const id = (el as HTMLElement).id || "";
          const title = el.getAttribute("title") || "";
          return (
            id.toLowerCase().includes("find") ||
            title.toLowerCase().includes("find") ||
            title.toLowerCase().includes("cerca")
          );
        })
        .map((el) => ({
          id: (el as HTMLElement).id,
          title: el.getAttribute("title"),
          visible:
            (el as HTMLElement).getBoundingClientRect().width > 0 &&
            (el as HTMLElement).getBoundingClientRect().height > 0,
        }));
    });

    allResults.pages.customerEditForm.findButtons = editFindButtons;

    await page.screenshot({
      path: "/tmp/customer-edit-form-screenshot.png",
      fullPage: true,
    });
    logger.info("Screenshot form modifica salvato: /tmp/customer-edit-form-screenshot.png");

    // ============================
    // SALVA RISULTATI
    // ============================
    const outputPath = "/tmp/customer-devexpress-discovery.json";
    await fs.writeFile(outputPath, JSON.stringify(allResults, null, 2));
    logger.info(`\nRisultati completi salvati in: ${outputPath}`);

    logger.info("\n=== DISCOVERY COMPLETATA ===");
    logger.info("NON e' stato premuto 'Salva e Chiudi' - nessuna modifica effettuata su Archibald.");

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

discoverCustomerControls();
