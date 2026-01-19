import { pdfParserService } from "./pdf-parser-service";
import { CustomerDatabase } from "./customer-db";
import { logger } from "./logger";
import * as crypto from "crypto";
import puppeteer from "puppeteer";

/**
 * Direct sync test that bypasses BrowserPool and uses direct bot login
 * This is for testing purposes only - production uses BrowserPool
 */
async function testSyncDirect() {
  let browser: any = null;
  let pdfPath: string | null = null;

  try {
    logger.info("Starting direct sync test (no BrowserPool)...");

    // Stage 1: Launch browser and login
    logger.info("[Test] Launching browser...");
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Login to Archibald (use credentials from environment)
    const username = process.env.ARCHIBALD_USERNAME;
    const password = process.env.ARCHIBALD_PASSWORD;

    if (!username || !password) {
      throw new Error(
        "ARCHIBALD_USERNAME and ARCHIBALD_PASSWORD must be set in .env",
      );
    }

    logger.info("[Test] Logging in to Archibald...");
    await page.goto(
      "https://4.231.124.90/Archibald/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx",
      {
        timeout: 10000,
        waitUntil: "domcontentloaded",
      },
    );

    // Wait for form fields
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });

    // Fill credentials using evaluate (instant, like paste)
    await page.evaluate(
      (user: string, pass: string) => {
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>('input[type="text"]'),
        );
        const userInput =
          inputs.find(
            (input) =>
              input.name?.includes("UserName") ||
              input.placeholder?.toLowerCase().includes("account") ||
              input.placeholder?.toLowerCase().includes("username"),
          ) || inputs[0];

        const passwordField = document.querySelector<HTMLInputElement>(
          'input[type="password"]',
        );

        if (userInput && passwordField) {
          userInput.value = user;
          passwordField.value = pass;

          userInput.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true }),
          );
          passwordField.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true }),
          );
        }
      },
      username,
      password,
    );

    // Find and click login button
    const loginButton = await page.$('input[type="submit"]');
    if (loginButton) {
      await loginButton.click();
      // Wait for navigation after login
      await page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" });
    }

    // Verify we're logged in by checking URL or page content
    const currentUrl = page.url();
    logger.info(`[Test] Current URL after login: ${currentUrl}`);

    // If still on login page, wait a bit more
    if (currentUrl.includes("Login.aspx")) {
      logger.info("[Test] Still on login page, waiting for redirect...");
      await page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" });
    }

    logger.info("[Test] ✅ Logged in successfully");

    // Stage 2: Navigate to Clienti and download PDF
    logger.info("[Test] Navigating to Clienti page...");
    const clientiUrl =
      "https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/";
    await page.goto(clientiUrl, { timeout: 10000, waitUntil: "networkidle2" });
    logger.info("[Test] ✅ Navigated to Clienti page");

    // Wait a bit for dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Screenshot for debugging
    await page.screenshot({ path: "/tmp/clienti-page.png" });
    logger.info("[Test] Screenshot saved to /tmp/clienti-page.png");

    // Setup download
    const timestamp = Date.now();
    pdfPath = `/tmp/clienti-test-${timestamp}.pdf`;

    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: "/tmp",
    });

    logger.info("[Test] Clicking export button...");

    // Try multiple possible selectors
    const exportButtonSelector =
      '#Vertical_mainMenu_Menu_DXI6_T[title="Esportare in PDF File"]';

    // Check if element exists
    const exportButton = await page.$(exportButtonSelector);
    if (!exportButton) {
      // Try alternative selector - just by text
      logger.info("[Test] Primary selector not found, trying text-based...");
      await page.waitForSelector("text=Esportare", { timeout: 5000 });
    } else {
      logger.info("[Test] Found export button with ID selector");
    }

    // Setup download detection
    const fs = require("fs");
    const downloadComplete = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("PDF download timeout (20s exceeded)"));
      }, 20000);

      const checkFile = setInterval(() => {
        const files = fs.readdirSync("/tmp");
        const pdfFiles = files.filter(
          (f: string) => f.startsWith("clienti-") && f.endsWith(".pdf"),
        );

        if (pdfFiles.length > 0) {
          const recentPdf = pdfFiles[pdfFiles.length - 1];
          const tempPath = `/tmp/${recentPdf}`;

          // Rename to our expected path
          if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, pdfPath);
            clearTimeout(timeout);
            clearInterval(checkFile);
            resolve();
          }
        }
      }, 500);
    });

    // Click the button (use the one we found)
    if (exportButton) {
      await exportButton.click();
    } else {
      // Click by text if ID selector didn't work
      const buttons = await page.$$("a");
      for (const btn of buttons) {
        const text = await page.evaluate((el: Element) => el.textContent, btn);
        if (text?.includes("Esportare")) {
          await btn.click();
          break;
        }
      }
    }
    logger.info("[Test] ✅ Clicked export button, waiting for download...");

    await downloadComplete;
    logger.info(`[Test] ✅ PDF downloaded to ${pdfPath}`);

    // Verify file size
    const stats = fs.statSync(pdfPath);
    logger.info(`[Test] PDF size: ${(stats.size / 1024).toFixed(2)} KB`);

    // Stage 3: Parse PDF
    logger.info("[Test] Parsing PDF...");
    const parseResult = await pdfParserService.parsePDF(pdfPath);
    logger.info(
      `[Test] ✅ Parsed ${parseResult.total_customers} customers from PDF`,
    );

    // Stage 4: Apply delta to database
    logger.info("[Test] Applying delta to database...");
    const db = CustomerDatabase.getInstance();

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const customer of parseResult.customers) {
      const hash = computeHash(customer);
      const existing = db
        .getAllCustomers()
        .find((c) => c.customerProfile === customer.customer_profile);

      if (!existing) {
        // Would insert - just count for now
        inserted++;
      } else if (existing.hash !== hash) {
        // Would update - just count for now
        updated++;
      } else {
        skipped++;
      }
    }

    logger.info(
      `[Test] ✅ Delta: ${inserted} would be inserted, ${updated} would be updated, ${skipped} unchanged`,
    );

    // Show sample customers
    logger.info("[Test] Sample customers from PDF:");
    parseResult.customers.slice(0, 3).forEach((c, i) => {
      logger.info(`  ${i + 1}. ${c.customer_profile} - ${c.name}`);
    });

    // Cleanup
    if (pdfPath && fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
      logger.info("[Test] ✅ Cleaned up temp PDF");
    }

    await browser.close();
    logger.info("[Test] 🎉 Test completed successfully!");
    process.exit(0);
  } catch (error: any) {
    logger.error("[Test] ❌ Test failed:", error);

    // Cleanup on error
    if (pdfPath) {
      const fs = require("fs");
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }

    if (browser) {
      await browser.close();
    }

    process.exit(1);
  }
}

function computeHash(customer: any): string {
  const hashFields = [
    customer.customer_profile,
    customer.name,
    customer.vat_number || "",
    customer.pec || "",
    customer.sdi || "",
    customer.fiscal_code || "",
    customer.delivery_terms || "",
    customer.street || "",
    customer.logistics_address || "",
    customer.postal_code || "",
    customer.city || "",
    customer.phone || "",
    customer.mobile || "",
    customer.url || "",
    customer.attention_to || "",
    customer.last_order_date || "",
    String(customer.actual_order_count ?? ""),
    customer.customer_type || "",
    String(customer.previous_order_count_1 ?? ""),
    String(customer.previous_sales_1 ?? ""),
    String(customer.previous_order_count_2 ?? ""),
    String(customer.previous_sales_2 ?? ""),
    customer.description || "",
    customer.type || "",
    customer.external_account_number || "",
    customer.our_account_number || "",
  ];

  const data = hashFields.join("|");
  return crypto.createHash("md5").update(data).digest("hex");
}

testSyncDirect();
