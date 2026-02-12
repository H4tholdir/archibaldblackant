#!/usr/bin/env tsx

import { ArchibaldBot } from "../archibald-bot";
import { config } from "../config";
import { logger } from "../logger";
import fs from "fs/promises";
import path from "path";

const ORDER_ID = process.argv[2] || "PENDING-72.972";
const LOGS_DIR = path.resolve(__dirname, "../../../logs");

async function testSendToVerona() {
  logger.info("=== TEST SEND TO VERONA E2E ===");
  logger.info(`Order ID: ${ORDER_ID}`);

  if (!config.features.sendToMilanoEnabled) {
    logger.error(
      "Feature flag SEND_TO_MILANO_ENABLED is not set. Run with: SEND_TO_MILANO_ENABLED=true npx tsx src/scripts/test-send-to-verona-e2e.ts",
    );
    process.exit(1);
  }

  await fs.mkdir(LOGS_DIR, { recursive: true });

  const bot = new ArchibaldBot();

  try {
    logger.info("1. Inizializzazione browser...");
    await bot.initialize();

    logger.info("2. Login...");
    await bot.login();

    logger.info(`3. Invio ordine ${ORDER_ID} a Verona...`);
    const result = await bot.sendOrderToVerona(ORDER_ID);

    logger.info("4. Risultato:", result);

    if (result.success) {
      logger.info(`Ordine ${ORDER_ID} inviato a Verona con successo!`);
    } else {
      logger.error(`Invio fallito: ${result.message}`);
      process.exit(1);
    }

    // Take final screenshot
    const page = (bot as any).page;
    if (page && !page.isClosed()) {
      const screenshotPath = path.join(
        LOGS_DIR,
        `send-to-verona-e2e-${Date.now()}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`Screenshot salvato: ${screenshotPath}`);

      // Optionally verify by navigating back to the list
      logger.info("5. Verifica: ri-navigazione alla lista ordini...");
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

      const verifyScreenshot = path.join(
        LOGS_DIR,
        `send-to-verona-verify-${Date.now()}.png`,
      );
      await page.screenshot({ path: verifyScreenshot, fullPage: true });
      logger.info(`Screenshot verifica salvato: ${verifyScreenshot}`);
    }
  } catch (error) {
    logger.error("Test E2E fallito", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  } finally {
    await bot.close();
  }

  logger.info("=== TEST E2E COMPLETATO ===");
}

testSendToVerona();
