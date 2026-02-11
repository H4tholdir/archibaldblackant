import { ArchibaldBot } from "../archibald-web-app/backend/src/archibald-bot";
import { config } from "../archibald-web-app/backend/src/config";
import { logger } from "../archibald-web-app/backend/src/logger";
import { PasswordCache } from "../archibald-web-app/backend/src/password-cache";
import * as fs from "fs";

const USER_ID = process.env.USER_ID || "077c52ec-0ab0-4a35-89cb-51f23b06f94c";

async function dumpSalesTableElements() {
  logger.info("Analyzing SALESTABLE_ListView_Agent elements...");

  // Pre-populate password cache from env (same creds used by service users)
  PasswordCache.getInstance().set(USER_ID, config.archibald.password);

  // Use multi-user mode with BrowserPool (same as order creation)
  const bot = new ArchibaldBot(USER_ID);

  try {
    // initialize() acquires context from BrowserPool which handles login
    await bot.initialize();

    if (!bot.page) {
      throw new Error("Browser page is null");
    }

    const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
    logger.info(`Navigating to ${ordersUrl}...`);
    await bot.page.goto(ordersUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await bot.page.waitForSelector("table", { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const dump = await bot.page.evaluate(() => {
      const result: Record<string, any> = {};

      // 1. Search bar inputs
      const allInputs = Array.from(document.querySelectorAll("input"));
      result.searchInputs = allInputs
        .filter((input) => {
          const el = input as HTMLInputElement;
          return (
            el.type === "text" &&
            el.offsetParent !== null &&
            (el.id.includes("Search") ||
              el.id.includes("search") ||
              el.id.includes("Filter") ||
              el.id.includes("filter") ||
              el.id.includes("HeaderFilter") ||
              el.name?.includes("Search") ||
              el.placeholder?.toLowerCase().includes("search") ||
              el.placeholder?.toLowerCase().includes("cerca"))
          );
        })
        .map((input) => ({
          id: input.id,
          name: input.name,
          type: input.type,
          placeholder: input.placeholder,
          className: input.className,
          parentId: input.parentElement?.id,
        }));

      // Also capture all visible text inputs (for broader search)
      result.allVisibleTextInputs = allInputs
        .filter(
          (input) =>
            input.type === "text" &&
            (input as HTMLElement).offsetParent !== null,
        )
        .map((input) => ({
          id: input.id,
          name: input.name,
          placeholder: input.placeholder,
          className: input.className,
          value: input.value,
          parentId: input.parentElement?.id,
        }));

      // 2. Menu buttons (Nuovo, Cancellare, etc.)
      const menuLinks = Array.from(
        document.querySelectorAll(
          'a[id*="Vertical_mainMenu"], a[id*="mainMenu_Menu"]',
        ),
      );
      result.menuButtons = menuLinks.map((a) => ({
        id: a.id,
        text: a.textContent?.trim(),
        href: (a as HTMLAnchorElement).href,
        className: a.className,
        parentId: a.parentElement?.id,
      }));

      // 3. Grid rows structure
      const gridRows = Array.from(
        document.querySelectorAll('tr[class*="dxgvDataRow"]'),
      );
      result.gridRowCount = gridRows.length;

      if (gridRows.length > 0) {
        const firstRow = gridRows[0];
        const cells = Array.from(firstRow.querySelectorAll("td"));
        result.firstRowStructure = cells.map((td, idx) => ({
          index: idx,
          className: td.className,
          text: td.textContent?.trim().substring(0, 50),
          hasCheckbox: td.querySelector('input[type="checkbox"]') !== null,
          hasLink: td.querySelector("a") !== null,
          checkboxId: td.querySelector('input[type="checkbox"]')?.id,
        }));
      }

      // 4. All checkboxes in the grid
      const gridCheckboxes = Array.from(
        document.querySelectorAll(
          'tr[class*="dxgvDataRow"] input[type="checkbox"]',
        ),
      );
      result.gridCheckboxes = gridCheckboxes.map((cb) => ({
        id: cb.id,
        name: (cb as HTMLInputElement).name,
        className: cb.className,
        parentId: cb.parentElement?.id,
        grandParentId: cb.parentElement?.parentElement?.id,
      }));

      // 5. Header checkboxes (select all)
      const headerCheckboxes = Array.from(
        document.querySelectorAll(
          'tr[class*="dxgvHeader"] input[type="checkbox"], th input[type="checkbox"]',
        ),
      );
      result.headerCheckboxes = headerCheckboxes.map((cb) => ({
        id: cb.id,
        name: (cb as HTMLInputElement).name,
        className: cb.className,
      }));

      // 6. DevExpress grid control info
      const gridControl = document.querySelector(".dxgvControl");
      result.gridControlInfo = gridControl
        ? {
            id: gridControl.id,
            className: gridControl.className,
          }
        : null;

      // 7. Any popup/dialog elements already in DOM
      const popups = Array.from(
        document.querySelectorAll(
          '[id*="PopupControl"], [id*="popup"], [id*="Dialog"], [id*="dialog"], [class*="dxpc"]',
        ),
      );
      result.popupElements = popups.map((p) => ({
        id: p.id,
        className: p.className,
        visible: (p as HTMLElement).offsetParent !== null,
        display: (p as HTMLElement).style.display,
      }));

      return result;
    });

    logger.info("Dump completed:");
    logger.info(JSON.stringify(dump, null, 2));

    const outputPath = "scripts/dump-output.json";
    fs.writeFileSync(outputPath, JSON.stringify(dump, null, 2));
    logger.info(`Output saved to ${outputPath}`);

    // Take a screenshot for visual reference
    await bot.page.screenshot({
      path: "scripts/salestable-screenshot.png",
      fullPage: true,
    });
    logger.info("Screenshot saved to scripts/salestable-screenshot.png");
  } catch (error) {
    logger.error("Error during dump:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await bot.close();
  }
}

dumpSalesTableElements().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
