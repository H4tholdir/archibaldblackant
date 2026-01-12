#!/usr/bin/env tsx

import { ArchibaldBot } from "../archibald-bot";
import { logger } from "../logger";
import type { OrderData } from "../types";

async function testCreateOrder() {
  logger.info("=== TEST CREAZIONE ORDINE ===");

  const bot = new ArchibaldBot();
  let exitCode = 0;

  const testOrder: OrderData = {
    customerId: "fresis",
    customerName: "fresis",
    items: [
      {
        articleCode: "td1272.314",
        description: "td1272.314",
        quantity: 3,
        price: 5.0,
      },
      {
        articleCode: "sf1000",
        description: "sf1000",
        quantity: 5,
        price: 10.0,
      },
      {
        articleCode: "h250e 104 040",
        description: "h250e 104 040",
        quantity: 10,
        price: 15.0,
      },
    ],
  };

  try {
    logger.info("1. Inizializzazione browser...");
    await bot.initialize();

    logger.info("2. Login...");
    await bot.login();

    logger.info("3. Creazione ordine...");
    const orderId = await bot.createOrder(testOrder);

    logger.info(`✅ ORDINE CREATO CON SUCCESSO! ID: ${orderId}`);
  } catch (error) {
    logger.error("❌ TEST FALLITO", { error });
    exitCode = 1;
  } finally {
    try {
      const reportPath = await bot.writeOperationReport();
      logger.info("Report operazioni salvato", { reportPath });
    } catch (error) {
      logger.warn("Impossibile salvare report operazioni", { error });
    }

    logger.info("Attendo 10 secondi prima di chiudere per ispezionare...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await bot.close();
  }

  logger.info("=== TEST COMPLETATO ===");
  process.exitCode = exitCode;
}

testCreateOrder();
