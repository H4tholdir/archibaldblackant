#!/usr/bin/env tsx

import { ArchibaldBot } from "../archibald-bot";
import { config } from "../config";
import { logger } from "../logger";
import fs from "fs/promises";
import path from "path";

const DOCS_DIR = path.resolve(__dirname, "../../../docs");

async function dumpSendToVeronaElements() {
  logger.info("=== DUMP SEND TO VERONA ELEMENTS ===");

  const bot = new ArchibaldBot();
  const dump: Record<string, unknown> = { timestamp: new Date().toISOString() };

  try {
    logger.info("1. Inizializzazione browser e login...");
    await bot.initialize();
    await bot.login();

    const page = (bot as any).page!;

    // Phase 2: Navigate to SALESTABLE_ListView_Agent
    logger.info("2. Navigazione alla lista ordini...");
    await page.goto(`${config.archibald.url}/SALESTABLE_ListView_Agent/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
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
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Phase 3: Dump complete menu
    logger.info("3. Dump menu completo...");
    const menuItems = await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('li[id*="mainMenu_Menu_DXI"]'),
      );
      return items.map((li) => {
        const anchor = li.querySelector("a");
        const span = li.querySelector("span");
        return {
          id: li.id,
          text: anchor?.textContent?.trim() || span?.textContent?.trim() || "",
          title: (li as HTMLElement).title || anchor?.title || "",
          className: li.className,
          disabled: li.className.includes("dxm-disabled"),
          role: li.getAttribute("role") || "",
          anchorId: anchor?.id || "",
          anchorClassName: anchor?.className || "",
          offsetWidth: (li as HTMLElement).offsetWidth,
          offsetHeight: (li as HTMLElement).offsetHeight,
        };
      });
    });
    dump.menuItems = menuItems;
    logger.info(`Menu items trovati: ${menuItems.length}`);
    for (const item of menuItems) {
      logger.info(`  ${item.id}: "${item.text}" disabled=${item.disabled}`);
    }

    // Phase 4: Dump search bar
    logger.info("4. Dump barra ricerca...");
    const searchBar = await page.evaluate(() => {
      const input = document.querySelector(
        "#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I",
      ) as HTMLInputElement | null;
      if (!input) return { found: false };
      return {
        found: true,
        id: input.id,
        name: input.name,
        type: input.type,
        value: input.value,
        placeholder: input.placeholder,
        className: input.className,
        offsetParent: input.offsetParent !== null,
        parentId: input.parentElement?.id || "",
      };
    });
    dump.searchBar = searchBar;
    logger.info("Search bar:", searchBar);

    // Phase 5: Dump filter
    logger.info("5. Dump filtro...");
    const filterInfo = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]',
      ) as HTMLInputElement | null;
      const dropdownBtn = document.querySelector(
        "#Vertical_mainMenu_Menu_ITCNT8_xaf_a1_Cb_B-1",
      ) as HTMLElement | null;
      return {
        found: !!input,
        currentValue: input?.value || "",
        isVisible: input ? input.offsetParent !== null : false,
        dropdownButtonFound: !!dropdownBtn,
      };
    });
    dump.filter = filterInfo;
    logger.info("Filter:", filterInfo);

    // Phase 6: Set filter to "Tutti gli ordini"
    logger.info("6. Impostazione filtro 'Tutti gli ordini'...");
    await (bot as any).ensureOrdersFilterSetToAll(page);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Phase 7: Search for "72972"
    logger.info('7. Ricerca "72972" nella barra di ricerca...');
    const searchSelector = "#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I";
    const searchHandle = await page.waitForSelector(searchSelector, {
      timeout: 5000,
      visible: true,
    });

    const rowCountBefore = await page.evaluate(() => {
      return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
    });
    logger.info(`Righe prima della ricerca: ${rowCountBefore}`);

    await (bot as any).pasteText(searchHandle, "72972");
    await page.keyboard.press("Enter");

    await page
      .waitForFunction(
        (prevCount: number) => {
          const loadingPanels = Array.from(
            document.querySelectorAll(
              '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
            ),
          );
          const hasLoading = loadingPanels.some((el) => {
            const style = window.getComputedStyle(el as HTMLElement);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              (el as HTMLElement).getBoundingClientRect().width > 0
            );
          });
          if (hasLoading) return false;
          const currentCount = document.querySelectorAll(
            'tr[class*="dxgvDataRow"]',
          ).length;
          const hasEmpty =
            document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
          return currentCount !== prevCount || hasEmpty || currentCount <= 5;
        },
        { timeout: 15000, polling: 200 },
        rowCountBefore,
      )
      .catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Phase 8: Dump grid
    logger.info("8. Dump griglia dopo ricerca...");
    const gridDump = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('tr[class*="dxgvDataRow"]'),
      );
      const emptyRow = document.querySelector('tr[class*="dxgvEmptyData"]');
      return {
        rowCount: rows.length,
        hasEmptyData: !!emptyRow,
        emptyText: emptyRow?.textContent?.trim() || "",
        rows: rows.slice(0, 5).map((row, ri) => {
          const cells = Array.from(row.querySelectorAll("td"));
          return {
            rowIndex: ri,
            className: row.className,
            id: row.id,
            cells: cells.map((cell, ci) => ({
              cellIndex: ci,
              className: cell.className,
              text: cell.textContent?.trim().substring(0, 100) || "",
              isCommandColumn: cell.className.includes("dxgvCommandColumn"),
              hasCheckbox: !!cell.querySelector(
                'span[class*="dxICheckBox"], input[type="checkbox"]',
              ),
              innerHTML: cell.innerHTML.substring(0, 200),
            })),
          };
        }),
      };
    });
    dump.gridAfterSearch = gridDump;
    logger.info(`Righe trovate: ${gridDump.rowCount}`);
    if (gridDump.rowCount > 0) {
      logger.info(
        "Prima riga cells:",
        gridDump.rows[0]?.cells.map((c) => `[${c.cellIndex}] ${c.text}`),
      );
    }

    // Phase 9: Screenshot pre-selezione
    logger.info("9. Screenshot pre-selezione...");
    await page.screenshot({
      path: path.join(DOCS_DIR, "send-to-verona-pre-selection.png"),
      fullPage: true,
    });

    // Phase 10: Select first row
    logger.info("10. Selezione prima riga (click command column)...");
    const selectionResult = await page.evaluate(() => {
      const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
      if (!firstRow) return { selected: false, reason: "no data rows" };

      const commandCell = firstRow.querySelector(
        "td.dxgvCommandColumn_XafTheme",
      ) as HTMLElement | null;
      if (commandCell) {
        commandCell.click();
        return { selected: true, strategy: "commandColumn" };
      }

      const firstCell = firstRow.querySelector("td") as HTMLElement | null;
      if (firstCell) {
        firstCell.click();
        return { selected: true, strategy: "firstCell" };
      }

      return { selected: false, reason: "no clickable cell" };
    });
    dump.selectionResult = selectionResult;
    logger.info("Selection result:", selectionResult);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Phase 11: Dump menu post-selezione
    logger.info("11. Dump menu post-selezione...");
    const menuItemsAfter = await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('li[id*="mainMenu_Menu_DXI"]'),
      );
      return items.map((li) => {
        const anchor = li.querySelector("a");
        const span = li.querySelector("span");
        return {
          id: li.id,
          text: anchor?.textContent?.trim() || span?.textContent?.trim() || "",
          className: li.className,
          disabled: li.className.includes("dxm-disabled"),
          anchorId: anchor?.id || "",
          anchorClassName: anchor?.className || "",
        };
      });
    });
    dump.menuItemsAfterSelection = menuItemsAfter;
    logger.info("Menu post-selezione:");
    for (const item of menuItemsAfter) {
      logger.info(`  ${item.id}: "${item.text}" disabled=${item.disabled}`);
    }

    // Phase 12: Dump DXI4_T detail
    logger.info("12. Dump dettaglio DXI4_T...");
    const dxi4Detail = await page.evaluate(() => {
      const anchor = document.querySelector(
        "#Vertical_mainMenu_Menu_DXI4_T",
      ) as HTMLElement | null;
      const li = document.querySelector(
        "#Vertical_mainMenu_Menu_DXI4_",
      ) as HTMLElement | null;
      if (!anchor && !li) return { found: false };
      return {
        found: true,
        anchorId: anchor?.id || "",
        anchorText: anchor?.textContent?.trim() || "",
        anchorClassName: anchor?.className || "",
        anchorDisabled: anchor?.className.includes("dxm-disabled") || false,
        liId: li?.id || "",
        liClassName: li?.className || "",
        liDisabled: li?.className.includes("dxm-disabled") || false,
        anchorHref: anchor?.getAttribute("href") || "",
        anchorOnclick: anchor?.getAttribute("onclick") || "",
        anchorTitle: anchor?.title || "",
        computedDisplay: anchor ? window.getComputedStyle(anchor).display : "",
        computedVisibility: anchor
          ? window.getComputedStyle(anchor).visibility
          : "",
        offsetWidth: anchor?.offsetWidth || 0,
        offsetHeight: anchor?.offsetHeight || 0,
        parentOffsetWidth: li?.offsetWidth || 0,
        parentOffsetHeight: li?.offsetHeight || 0,
      };
    });
    dump.dxi4Detail = dxi4Detail;
    logger.info("DXI4_T detail:", dxi4Detail);

    // Phase 13: Dump confirmation patterns
    logger.info("13. Dump pattern di conferma nel DOM...");
    const confirmPatterns = await page.evaluate(() => {
      const patterns: Array<{
        selector: string;
        count: number;
        elements: Array<{
          id: string;
          className: string;
          text: string;
          visible: boolean;
          tagName: string;
        }>;
      }> = [];

      const selectors = [
        'div[id*="Confirm"]',
        'div[id*="Dialog"]',
        'div[id*="Popup"]',
        'div[id*="popup"]',
        '[class*="dxpc"]',
        '[class*="dxPopup"]',
        'div[id*="Modal"]',
        'div[id*="modal"]',
        '[class*="dxmPopup"]',
        'div[id*="MessageBox"]',
        'a[id*="btnOk"]',
        'a[id*="btnYes"]',
        'button[id*="btnOk"]',
        'button[id*="btnYes"]',
      ];

      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length > 0) {
          patterns.push({
            selector: sel,
            count: els.length,
            elements: els.slice(0, 5).map((el) => ({
              id: el.id,
              className: el.className.substring(0, 200),
              text: el.textContent?.trim().substring(0, 100) || "",
              visible:
                (el as HTMLElement).offsetParent !== null ||
                window.getComputedStyle(el as HTMLElement).display !== "none",
              tagName: el.tagName,
            })),
          });
        }
      }

      return patterns;
    });
    dump.confirmPatterns = confirmPatterns;
    logger.info(`Confirm patterns trovati: ${confirmPatterns.length}`);
    for (const p of confirmPatterns) {
      logger.info(`  ${p.selector}: ${p.count} elementi`);
      for (const el of p.elements) {
        logger.info(
          `    id=${el.id} visible=${el.visible} text="${el.text.substring(0, 50)}"`,
        );
      }
    }

    // Phase 14: Dump ASPxClientControl
    logger.info("14. Dump ASPxClientControl...");
    const aspxControls = await page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) {
        return { error: "ASPxClientControl not found", controls: [] };
      }

      const results: Array<{
        name: string;
        type: string;
        methods: string[];
      }> = [];

      const collection = w.ASPxClientControl.GetControlCollection();
      collection.ForEachControl((c: any) => {
        const methodNames: string[] = [];
        const checkMethods = [
          "AddNewRow",
          "UpdateEdit",
          "CancelEdit",
          "DeleteRow",
          "GotoPage",
          "GetPageCount",
          "GetVisibleRowsOnPage",
          "InCallback",
          "IsEditing",
          "Refresh",
          "PerformCallback",
          "StartEditRow",
          "GetRowValues",
          "SetValue",
          "GetValue",
          "ShowDropDown",
          "GetItemByName",
          "GetItem",
          "SelectRows",
          "UnselectRows",
          "GetSelectedRowCount",
          "SelectAllRowsOnPage",
        ];

        for (const method of checkMethods) {
          if (typeof c[method] === "function") {
            methodNames.push(method);
          }
        }

        results.push({
          name: c.name || "(no name)",
          type: c.constructor?.name || "(unknown)",
          methods: methodNames,
        });
      });

      return { error: null, controls: results };
    });
    dump.aspxControls = aspxControls;
    logger.info(
      `ASPxClientControl: ${aspxControls.controls?.length || 0} controlli`,
    );
    for (const c of aspxControls.controls || []) {
      if (c.methods.length > 0) {
        logger.info(`  ${c.name} (${c.type}): ${c.methods.join(", ")}`);
      }
    }

    // Phase 15: Screenshot post-selezione
    logger.info("15. Screenshot post-selezione...");
    await page.screenshot({
      path: path.join(DOCS_DIR, "send-to-verona-post-selection.png"),
      fullPage: true,
    });

    // Phase 16: NON clicca "invia ordine/i" — safety!
    logger.info("16. ⚠️  NON si clicca 'invia ordine/i' — dump only!");

    // Phase 17: Dump all DXI items in detail for reference
    logger.info("17. Dump dettaglio tutti i DXI con anchor...");
    const allDxiAnchors = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('a[id*="mainMenu_Menu_DXI"]'),
      );
      return anchors.map((a) => ({
        id: a.id,
        text: a.textContent?.trim() || "",
        className: a.className,
        href: a.getAttribute("href") || "",
        onclick: a.getAttribute("onclick")?.substring(0, 200) || "",
        disabled: a.className.includes("dxm-disabled"),
        parentId: a.parentElement?.id || "",
        parentDisabled:
          a.parentElement?.className.includes("dxm-disabled") || false,
      }));
    });
    dump.allDxiAnchors = allDxiAnchors;

    // Save JSON
    const jsonPath = path.join(DOCS_DIR, "dump-send-to-verona-elements.json");
    await fs.writeFile(jsonPath, JSON.stringify(dump, null, 2));
    logger.info(`JSON salvato: ${jsonPath}`);

    logger.info("18. Browser aperto 2 minuti per ispezione manuale...");
    await new Promise((resolve) => setTimeout(resolve, 120000));
  } catch (error) {
    logger.error("Dump fallito", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorJsonPath = path.join(
      DOCS_DIR,
      "dump-send-to-verona-elements-error.json",
    );
    await fs
      .writeFile(
        errorJsonPath,
        JSON.stringify(
          {
            ...dump,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      )
      .catch(() => {});

    process.exit(1);
  } finally {
    await bot.close();
  }

  logger.info("=== DUMP COMPLETATO ===");
}

dumpSendToVeronaElements();
