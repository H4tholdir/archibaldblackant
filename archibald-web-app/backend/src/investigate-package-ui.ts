#!/usr/bin/env ts-node
/**
 * Investigation script for Archibald order creation and package selection UI
 * Purpose: Understand how package types work in Archibald order form
 *
 * Test articles:
 * - td1272.314: Simple case (1 package type)
 * - h129fsq.104.023: Complex case (2 package types: 5-piece and 1-piece)
 *
 * Test customer: "fresis"
 */

import puppeteer, { Browser, Page } from "puppeteer";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE_URL = process.env.ARCHIBALD_URL;
const USERNAME = process.env.ARCHIBALD_USERNAME;
const PASSWORD = process.env.ARCHIBALD_PASSWORD;

const SCREENSHOTS_DIR = path.join(__dirname, "../investigation-screenshots");

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot saved: ${name}.png`);
}

async function captureHTML(
  page: Page,
  name: string,
  selector?: string,
): Promise<void> {
  const html = selector
    ? await page.$eval(selector, (el) => el.outerHTML)
    : await page.content();

  const filepath = path.join(SCREENSHOTS_DIR, `${name}.html`);
  fs.writeFileSync(filepath, html, "utf-8");
  console.log(`💾 HTML saved: ${name}.html`);
}

async function investigateOrderCreationFlow(): Promise<void> {
  console.log("🔍 Starting Archibald Order Creation UI Investigation");
  console.log("=".repeat(60));

  if (!BASE_URL || !USERNAME || !PASSWORD) {
    throw new Error("Missing Archibald credentials in .env");
  }

  const browser: Browser = await puppeteer.launch({
    headless: false, // Show browser for manual observation
    defaultViewport: { width: 1920, height: 1080 },
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--ignore-certificate-errors",
    ],
  });

  const page: Page = await browser.newPage();

  try {
    // STEP 1: Login
    console.log("\n📋 STEP 1: Login to Archibald");
    await page.goto(`${BASE_URL}/Announcements_ListView/`, {
      waitUntil: "networkidle2",
    });
    await takeScreenshot(page, "01-login-page");

    const usernameInput = await page.$("#ctl00_Content_LoginControl_UserName");
    const passwordInput = await page.$("#ctl00_Content_LoginControl_Password");
    const loginButton = await page.$("#ctl00_Content_LoginControl_LoginButton");

    if (usernameInput && passwordInput && loginButton) {
      await usernameInput.type(USERNAME);
      await passwordInput.type(PASSWORD);
      await loginButton.click();
      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      console.log("✅ Logged in successfully");
    }

    await takeScreenshot(page, "02-after-login");

    // STEP 2: Navigate to Orders (Ordini)
    console.log("\n📋 STEP 2: Navigate to Orders");
    await page.goto(`${BASE_URL}/SALESTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
    });
    await takeScreenshot(page, "03-orders-list");

    // STEP 3: Click "Nuovo" (New Order)
    console.log("\n📋 STEP 3: Create new order");
    await page.goto(`${BASE_URL}/SALESTABLE_DetailViewAgent/?NewObject=true`, {
      waitUntil: "networkidle2",
    });
    await wait(2000);
    await takeScreenshot(page, "04-new-order-form");
    await captureHTML(page, "04-new-order-form");

    // STEP 4: Select customer "fresis"
    console.log("\n📋 STEP 4: Select customer 'fresis'");

    // Find customer input using the same logic as archibald-bot.ts
    const customerInputSelector = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );

      const customerInput = inputs.find((input) => {
        const id = (input as HTMLInputElement).id.toLowerCase();
        const name = (input as HTMLInputElement).name.toLowerCase();

        return (
          id.includes("account") ||
          id.includes("cliente") ||
          id.includes("custtable") ||
          id.includes("custaccount") ||
          name.includes("account") ||
          name.includes("cliente") ||
          name.includes("custtable")
        );
      });

      if (customerInput) {
        return "#" + (customerInput as HTMLInputElement).id;
      }
      return null;
    });

    if (!customerInputSelector) {
      console.error("❌ Customer input field not found");
      await takeScreenshot(page, "ERROR-no-customer-field");
      await captureHTML(page, "ERROR-no-customer-field");
      return;
    }

    console.log(`✅ Customer field found: ${customerInputSelector}`);

    // Extract base ID for dropdown button
    const customerInputId = customerInputSelector.startsWith("#")
      ? customerInputSelector.slice(1)
      : customerInputSelector;
    const customerBaseId = customerInputId.endsWith("_I")
      ? customerInputId.slice(0, -2)
      : customerInputId;

    // Click dropdown button
    const dropdownSelectors = [
      `#${customerBaseId}_B-1`,
      `#${customerBaseId}_B-1Img`,
      `#${customerBaseId}_B`,
    ];

    let dropdownClicked = false;
    for (const selector of dropdownSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && (await btn.boundingBox())) {
          await btn.click();
          dropdownClicked = true;
          console.log(`✅ Dropdown opened with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!dropdownClicked) {
      console.error("❌ Customer dropdown button not found");
      await takeScreenshot(page, "ERROR-no-dropdown-button");
      return;
    }

    await wait(800);
    await takeScreenshot(page, "05-customer-dropdown-opened");

    // Find search input in popup
    const searchInputSelectors = [
      `#${customerBaseId}_DDD_gv_DXSE_I`,
      'input[placeholder*="enter text to search" i]',
    ];

    let searchInput = null;
    for (const selector of searchInputSelectors) {
      searchInput = await page.$(selector);
      if (searchInput) {
        console.log(`✅ Search input found: ${selector}`);
        break;
      }
    }

    if (!searchInput) {
      console.error("❌ Search input not found in dropdown");
      await takeScreenshot(page, "ERROR-no-search-input");
      return;
    }

    // Type customer name
    await searchInput.click();
    await wait(200);
    await searchInput.type("fresis", { delay: 100 });
    await page.keyboard.press("Enter");
    await wait(1000);
    await takeScreenshot(page, "06-customer-search-results");
    await captureHTML(page, "06-customer-search-results");

    // Click first result
    const customerResults = await page.$$('tr[class*="dxgvDataRow"]');
    console.log(`📊 Found ${customerResults.length} customer results`);

    if (customerResults.length > 0) {
      const firstCell = await customerResults[0].$("td");
      if (firstCell) {
        await firstCell.click();
        await wait(1500);
        console.log("✅ Customer selected");
        await takeScreenshot(page, "07-customer-selected");
      }
    }

    // STEP 5: Click "New" button in sales lines grid
    console.log("\n📋 STEP 5: Add new sales line");

    // Wait for page to stabilize after customer selection
    await wait(1000);

    const newButtonSelectors = [
      'img[alt="New"]',
      'a[title="New"]',
      '[id*="dviSALESLINEs"] img[alt="New"]',
      'img[src*="New"]',
    ];

    let newButton = null;
    for (const selector of newButtonSelectors) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const isVisible = await el.evaluate((node) => {
          const element = node as HTMLElement;
          return element.offsetParent !== null;
        });
        if (isVisible) {
          newButton = el;
          console.log(`✅ New button found with selector: ${selector}`);
          break;
        }
      }
      if (newButton) break;
    }

    if (!newButton) {
      console.error("❌ New button not found");
      await takeScreenshot(page, "ERROR-no-new-button");
      await captureHTML(page, "ERROR-no-new-button-html");
      return;
    }

    await newButton.click();
    await wait(2000);
    await takeScreenshot(page, "08-after-new-click");
    await captureHTML(page, "08-after-new-click");

    // STEP 6: TEST ARTICLE 1 - td1272.314 (simple, 1 package)
    console.log("\n📋 STEP 6: Test article td1272.314 (simple case)");

    await testArticleSelection(page, "td1272.314", "TEST1");

    // STEP 7: TEST ARTICLE 2 - h129fsq.104.023 (complex, 2 packages)
    console.log("\n📋 STEP 7: Test article h129fsq.104.023 (complex case)");

    // Add another line
    newButton = await page.$('img[alt="New"]');
    if (newButton) {
      await newButton.click();
      await wait(2000);
    }

    await testArticleSelection(page, "h129fsq.104.023", "TEST2");

    console.log("\n" + "=".repeat(60));
    console.log(
      "✅ Investigation complete! Check investigation-screenshots/ folder",
    );
    console.log("🔍 Review HTML files to understand DevExpress selectors");
  } catch (error) {
    console.error("❌ Error during investigation:", error);
    await takeScreenshot(page, "ERROR-final");
    throw error;
  } finally {
    await wait(5000); // Keep browser open for manual inspection
    // await browser.close(); // Commented out for manual review
    console.log(
      "\n⏸️  Browser left open for manual inspection. Close it manually when done.",
    );
  }
}

async function testArticleSelection(
  page: Page,
  articleCode: string,
  testName: string,
): Promise<void> {
  console.log(`\n🔬 Testing article: ${articleCode}`);

  // Find article dropdown
  const articleDropdownSelectors = [
    'input[id*="INVENTTABLEID"]',
    'input[id*="InventTableId"]',
    '[id*="NOME_ARTICOLO"] input',
  ];

  let articleInput = null;
  for (const selector of articleDropdownSelectors) {
    const elements = await page.$$(selector);
    for (const el of elements) {
      const isVisible = await el.evaluate((node) => {
        const element = node as HTMLElement;
        return element.offsetParent !== null;
      });
      if (isVisible) {
        articleInput = el;
        break;
      }
    }
    if (articleInput) break;
  }

  if (!articleInput) {
    console.error("❌ Article dropdown not found");
    await takeScreenshot(page, `${testName}-ERROR-no-article-dropdown`);
    return;
  }

  await articleInput.click();
  await wait(500);
  await articleInput.type(articleCode, { delay: 100 });
  await wait(2000);
  await takeScreenshot(page, `${testName}-01-article-search`);
  await captureHTML(page, `${testName}-01-article-search`);

  // Inspect the search results popup for package options
  console.log("🔍 Inspecting article search results...");

  const popupHTML = await page.evaluate(() => {
    const popup = document.querySelector('[id*="_DDD"]');
    return popup ? popup.outerHTML : "NOT FOUND";
  });
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, `${testName}-02-popup-structure.html`),
    popupHTML,
    "utf-8",
  );

  // Look for grid rows
  const articleResults = await page.$$('tr[class*="dxgvDataRow"]');
  console.log(`📊 Found ${articleResults.length} article rows`);

  // Capture grid structure with DETAILED CELL ANALYSIS
  for (let i = 0; i < Math.min(articleResults.length, 5); i++) {
    const row = articleResults[i];
    const rowText = await row.evaluate((el) => el.textContent);
    const rowHTML = await row.evaluate((el) => el.outerHTML);

    // CRITICAL: Extract each cell's content to understand column structure
    const cellsData = await row.evaluate((el) => {
      const cells = Array.from(el.querySelectorAll("td"));
      return cells.map((cell, idx) => ({
        index: idx,
        textContent: (cell.textContent || "").trim(),
        innerHTML: cell.innerHTML.substring(0, 200), // First 200 chars
        className: cell.className,
      }));
    });

    console.log(`\n   📋 Row ${i + 1} - Full Analysis:`);
    console.log(`      Raw text: ${rowText?.substring(0, 100)}`);
    console.log(`      Cells breakdown (${cellsData.length} cells):`);
    cellsData.forEach((cell) => {
      if (cell.textContent) {
        console.log(
          `         [${cell.index}]: "${cell.textContent}" (${cell.className || "no class"})`,
        );
      }
    });

    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, `${testName}-03-row-${i + 1}.html`),
      rowHTML,
      "utf-8",
    );

    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, `${testName}-03-row-${i + 1}-cells.json`),
      JSON.stringify(cellsData, null, 2),
      "utf-8",
    );
  }

  // CRITICAL: Check for package selection dropdown or radio buttons
  console.log("🔍 Checking for package type selector...");

  const packageSelectors = await page.evaluate(() => {
    const selectors: string[] = [];

    // Look for dropdowns with "confezione", "imballaggio", "package", "contenuto"
    const allSelects = Array.from(document.querySelectorAll("select"));
    allSelects.forEach((select, idx) => {
      const label = select.labels?.[0]?.textContent || "";
      const id = select.id;
      const name = select.name;
      if (
        label.toLowerCase().includes("confez") ||
        label.toLowerCase().includes("imball") ||
        label.toLowerCase().includes("contenuto") ||
        id.toLowerCase().includes("confez") ||
        id.toLowerCase().includes("package")
      ) {
        selectors.push(`SELECT[${idx}]: ${id || name} - ${label}`);
      }
    });

    // Look for radio buttons
    const allRadios = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );
    allRadios.forEach((radio, idx) => {
      const label = radio.labels?.[0]?.textContent || radio.value || "";
      const id = radio.id;
      const name = radio.name;
      if (
        label.toLowerCase().includes("confez") ||
        label.toLowerCase().includes("contenuto") ||
        name.toLowerCase().includes("confez") ||
        name.toLowerCase().includes("package")
      ) {
        selectors.push(`RADIO[${idx}]: ${id || name} - ${label}`);
      }
    });

    // Look for DevExpress combo boxes
    const allInputs = Array.from(document.querySelectorAll("input"));
    allInputs.forEach((input, idx) => {
      const id = input.id;
      const name = input.name;
      if (
        id.toLowerCase().includes("confez") ||
        id.toLowerCase().includes("package") ||
        id.toLowerCase().includes("contenuto") ||
        id.toLowerCase().includes("inventdim")
      ) {
        selectors.push(`INPUT[${idx}]: ${id || name}`);
      }
    });

    return selectors;
  });

  console.log("📦 Package selector candidates:");
  packageSelectors.forEach((sel) => console.log(`   ${sel}`));

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, `${testName}-04-package-selectors.json`),
    JSON.stringify(packageSelectors, null, 2),
    "utf-8",
  );

  // Click first article result to proceed
  if (articleResults.length > 0) {
    const firstCell = await articleResults[0].$("td");
    if (firstCell) {
      await firstCell.click();
      await wait(2000);
      await takeScreenshot(page, `${testName}-05-article-selected`);
      await captureHTML(page, `${testName}-05-article-selected`);
      console.log("✅ Article selected, checking for package dropdown...");

      // After selecting article, check AGAIN for package selectors that may have appeared
      const postSelectionPackageSelectors = await page.evaluate(() => {
        const selectors: Array<{
          type: string;
          id: string;
          name: string;
          label: string;
          visible: boolean;
        }> = [];

        const allElements = Array.from(
          document.querySelectorAll("select, input, [id*='combo']"),
        );
        allElements.forEach((el) => {
          const element = el as HTMLElement;
          const id = element.id || "";
          const name = (element as any).name || "";
          const label =
            (element as any).labels?.[0]?.textContent ||
            element.getAttribute("aria-label") ||
            "";
          const visible = element.offsetParent !== null;

          if (
            id.toLowerCase().includes("confez") ||
            id.toLowerCase().includes("package") ||
            id.toLowerCase().includes("contenuto") ||
            id.toLowerCase().includes("inventdim") ||
            label.toLowerCase().includes("confez") ||
            label.toLowerCase().includes("contenuto") ||
            label.toLowerCase().includes("imball")
          ) {
            selectors.push({
              type: element.tagName,
              id,
              name,
              label,
              visible,
            });
          }
        });

        return selectors;
      });

      console.log("📦 Post-selection package selectors:");
      postSelectionPackageSelectors.forEach((sel) =>
        console.log(
          `   ${sel.type} #${sel.id} - ${sel.label} [visible: ${sel.visible}]`,
        ),
      );

      fs.writeFileSync(
        path.join(
          SCREENSHOTS_DIR,
          `${testName}-06-post-selection-package-selectors.json`,
        ),
        JSON.stringify(postSelectionPackageSelectors, null, 2),
        "utf-8",
      );
    }
  }

  console.log(`✅ Completed test for ${articleCode}`);
}

// Run investigation
investigateOrderCreationFlow().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
