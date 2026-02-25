#!/usr/bin/env tsx

import { ArchibaldBot } from "../bot/archibald-bot";
import { config } from "../config";
import { logger } from "../logger";
import fs from "fs/promises";

async function discoverControls() {
  logger.info("=== DEVEXPRESS CONTROL DISCOVERY ===");

  const bot = new ArchibaldBot();

  try {
    logger.info("1. Inizializzazione browser...");
    await bot.initialize();

    logger.info("2. Login...");
    await bot.login();

    const page = (bot as any).page!;

    logger.info("3. Navigazione alla lista ordini...");
    await page.goto(
      `${config.archibald.url}/SALESTABLE_ListView_Agent/`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForFunction(
      () => {
        const elements = Array.from(
          document.querySelectorAll("span, button, a"),
        );
        return elements.some(
          (el) => el.textContent?.trim().toLowerCase() === "nuovo",
        );
      },
      { timeout: 15000 },
    );

    logger.info("3a. Discovery controlli sulla LISTA ORDINI...");
    const listControls = await page.evaluate(() => {
      const results: Array<{
        name: string;
        type: string;
        hasAddNewRow: boolean;
        hasUpdateEdit: boolean;
        hasInCallback: boolean;
        hasGotoPage: boolean;
        hasGetEditor: boolean;
      }> = [];

      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) {
        return { error: "ASPxClientControl not found", controls: [] };
      }

      const collection = w.ASPxClientControl.GetControlCollection();
      collection.ForEachControl((c: any) => {
        results.push({
          name: c.name || "(no name)",
          type: c.constructor?.name || "(unknown)",
          hasAddNewRow: typeof c.AddNewRow === "function",
          hasUpdateEdit: typeof c.UpdateEdit === "function",
          hasInCallback: typeof c.InCallback === "function",
          hasGotoPage: typeof c.GotoPage === "function",
          hasGetEditor: typeof c.GetEditor === "function",
        });
      });

      return { error: null, controls: results };
    });

    logger.info("Lista ordini - Controlli trovati:", {
      count: listControls.controls?.length || 0,
    });

    logger.info("4. Clicco 'Nuovo' per aprire il form ordine...");

    // Click + waitForNavigation in parallelo
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

    logger.info("Form ordine caricato:", { url: page.url() });

    // Attendi ancora un po' per DevExpress init
    await new Promise((resolve) => setTimeout(resolve, 3000));

    logger.info("5. Form ordine caricato. Discovery controlli...");

    const formControls = await page.evaluate(() => {
      const results: Array<{
        name: string;
        type: string;
        methods: string[];
        isGrid: boolean;
        isComboBox: boolean;
        isLookup: boolean;
        isTabControl: boolean;
        isMenu: boolean;
        pageCount?: number;
        pageIndex?: number;
        isEditing?: boolean;
        visibleRowsOnPage?: number;
      }> = [];

      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) {
        return { error: "ASPxClientControl not found", controls: [] };
      }

      const collection = w.ASPxClientControl.GetControlCollection();
      collection.ForEachControl((c: any) => {
        const methodNames: string[] = [];
        const gridMethods = [
          "AddNewRow",
          "UpdateEdit",
          "CancelEdit",
          "DeleteRow",
          "GotoPage",
          "NextPage",
          "PrevPage",
          "GetPageIndex",
          "GetPageCount",
          "GetVisibleRowsOnPage",
          "InCallback",
          "IsEditing",
          "IsNewRowEditing",
          "SetEditValue",
          "GetEditValue",
          "GetEditor",
          "FocusEditor",
          "SetFocusedRowIndex",
          "GetFocusedRowIndex",
          "Refresh",
          "PerformCallback",
          "StartEditRow",
          "GetRowValues",
        ];

        const comboMethods = [
          "SetValue",
          "GetValue",
          "SetText",
          "GetText",
          "SetSelectedIndex",
          "FindItemByValue",
          "FindItemByText",
          "ShowDropDown",
          "HideDropDown",
          "GetItemCount",
          "EnsureDropDownLoaded",
        ];

        const allMethods = [...new Set([...gridMethods, ...comboMethods])];

        for (const method of allMethods) {
          if (typeof c[method] === "function") {
            methodNames.push(method);
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

        const entry: any = {
          name: c.name || "(no name)",
          type: c.constructor?.name || "(unknown)",
          methods: methodNames,
          isGrid,
          isComboBox,
          isLookup,
          isTabControl,
          isMenu,
        };

        if (isGrid) {
          try {
            entry.pageCount = c.GetPageCount?.() ?? null;
            entry.pageIndex = c.GetPageIndex?.() ?? null;
            entry.isEditing = c.IsEditing?.() ?? null;
            entry.visibleRowsOnPage = c.GetVisibleRowsOnPage?.() ?? null;
          } catch {
            // ignore
          }
        }

        results.push(entry);
      });

      return { error: null, controls: results };
    });

    logger.info("Form ordine - Controlli trovati:", {
      count: formControls.controls?.length || 0,
    });

    // Log dettagliato dei controlli piu importanti
    const grids = formControls.controls.filter((c: any) => c.isGrid);
    const combos = formControls.controls.filter(
      (c: any) => c.isComboBox || c.isLookup,
    );
    const tabs = formControls.controls.filter((c: any) => c.isTabControl);
    const menus = formControls.controls.filter((c: any) => c.isMenu);

    logger.info("=== GRIDS ===");
    for (const g of grids) {
      logger.info(`  Grid: ${g.name}`, {
        type: g.type,
        methods: g.methods.join(", "),
        pageCount: g.pageCount,
        pageIndex: g.pageIndex,
        visibleRowsOnPage: g.visibleRowsOnPage,
      });
    }

    logger.info("=== COMBOBOX / LOOKUP ===");
    for (const c of combos) {
      logger.info(`  Combo: ${c.name}`, {
        type: c.type,
        methods: c.methods.join(", "),
      });
    }

    logger.info("=== TAB CONTROLS ===");
    for (const t of tabs) {
      logger.info(`  Tab: ${t.name}`, {
        type: t.type,
        methods: t.methods.join(", "),
      });
    }

    logger.info("=== MENUS ===");
    for (const m of menus) {
      logger.info(`  Menu: ${m.name}`, {
        type: m.type,
        methods: m.methods.join(", "),
      });
    }

    // Ora esploriamo anche cosa succede DOPO aver selezionato un cliente
    // (la grid sales lines potrebbe non apparire finche non si seleziona un cliente)
    logger.info(
      "6. Cerco campo cliente per triggerare caricamento grid sales lines...",
    );

    const customerFieldFound = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );
      const customerInput = inputs.find((input) => {
        const id = (input as HTMLInputElement).id.toLowerCase();
        return (
          id.includes("custtable") ||
          id.includes("custaccount") ||
          id.includes("account") ||
          id.includes("profilo")
        );
      });
      return customerInput
        ? (customerInput as HTMLInputElement).id
        : null;
    });

    logger.info("Campo cliente trovato:", { customerFieldFound });

    // Salva tutti i risultati in un file JSON
    const discoveryResult = {
      timestamp: new Date().toISOString(),
      url: page.url(),
      listPageControls: listControls,
      orderFormControls: formControls,
      summary: {
        totalControls: formControls.controls?.length || 0,
        grids: grids.map((g: any) => ({
          name: g.name,
          type: g.type,
          pageCount: g.pageCount,
          visibleRowsOnPage: g.visibleRowsOnPage,
          methods: g.methods,
        })),
        comboBoxes: combos.map((c: any) => ({
          name: c.name,
          type: c.type,
          methods: c.methods,
        })),
        tabControls: tabs.map((t: any) => ({
          name: t.name,
          type: t.type,
        })),
        menus: menus.map((m: any) => ({
          name: m.name,
          type: m.type,
        })),
        customerFieldId: customerFieldFound,
      },
    };

    const outputPath =
      "/Users/hatholdir/Downloads/Archibald/archibald-web-app/docs/devexpress-discovery-result.json";
    await fs.writeFile(outputPath, JSON.stringify(discoveryResult, null, 2));
    logger.info(`Risultati salvati in: ${outputPath}`);

    // Screenshot per riferimento visivo
    await page.screenshot({
      path: "/Users/hatholdir/Downloads/Archibald/archibald-web-app/docs/order-form-screenshot.png",
      fullPage: true,
    });
    logger.info("Screenshot form ordine salvato");

    // Attendi per ispezione manuale
    logger.info(
      "Browser aperto per ispezione. Premi Ctrl+C per chiudere.",
    );
    await new Promise((resolve) => setTimeout(resolve, 120000)); // 2 minuti
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

discoverControls();
