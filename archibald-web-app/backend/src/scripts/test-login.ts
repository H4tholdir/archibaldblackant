#!/usr/bin/env tsx

import { ArchibaldBot } from "../bot/archibald-bot";
import { logger } from "../logger";

async function testLogin() {
  logger.info("=== TEST LOGIN ARCHIBALD ===");

  const bot = new ArchibaldBot();

  try {
    logger.info("1. Inizializzazione browser...");
    await bot.initialize();

    logger.info("2. Tentativo login...");
    await bot.login();

    logger.info("✅ LOGIN RIUSCITO!");

    // Attendi 5 secondi per vedere la dashboard
    logger.info("Attendo 5 secondi per ispezionare la pagina...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    logger.error("❌ TEST FALLITO", { error });
    process.exit(1);
  } finally {
    await bot.close();
  }

  logger.info("=== TEST COMPLETATO ===");
}

testLogin();
