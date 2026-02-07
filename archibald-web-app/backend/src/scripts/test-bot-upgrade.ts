#!/usr/bin/env tsx
/**
 * Test E2E per verifica paginazione griglia ordini
 * DevExpress pagina a 20 righe: verifica che righe 21-25 funzionino
 *
 * Ordine di test:
 * - Cliente: Fresis Soc Cooperativa
 * - 25x TD1272.314. con quantità = numero riga (1,2,3...25)
 */

import { ArchibaldBot } from "../archibald-bot.js";
import { logger } from "../logger.js";
import type { OrderData } from "../types.js";

async function testBotUpgrade() {
  logger.info("=== TEST BOT UPGRADE - DevExpress API Migration ===");

  const bot = new ArchibaldBot();
  let exitCode = 0;

  const testOrder: OrderData = {
    customerId: "fresis",
    customerName: "Fresis Soc Cooperativa",
    discountPercent: 25,
    items: [
      {
        articleCode: "TD1272.314.",
        description: "TD1272.314.",
        quantity: 6,
        price: 0,
      },
      {
        articleCode: "TD1272.314.",
        description: "TD1272.314.",
        quantity: 3,
        price: 0,
      },
    ],
  };

  try {
    logger.info("STEP 1: Inizializzazione browser...");
    await bot.initialize();
    logger.info("STEP 1: OK - Browser inizializzato");

    logger.info("STEP 2: Login...");
    await bot.login();
    logger.info("STEP 2: OK - Login completato");

    logger.info("STEP 3: Creazione ordine di test...");
    logger.info("Dati ordine:", {
      cliente: testOrder.customerName,
      articoli: testOrder.items.length,
      dettagli: testOrder.items.map((item, idx) => ({
        riga: idx + 1,
        articolo: item.articleCode,
        quantita: item.quantity,
      })),
    });

    const orderId = await bot.createOrder(testOrder);
    logger.info(`ORDINE CREATO CON SUCCESSO! ID: ${orderId}`);
  } catch (error) {
    logger.error("TEST FALLITO", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    exitCode = 1;
  } finally {
    try {
      const reportPath = await bot.writeOperationReport();
      logger.info("Report operazioni salvato", { reportPath });
    } catch (error) {
      logger.warn("Impossibile salvare report operazioni", { error });
    }

    logger.info("Attendo 5 secondi prima di chiudere per ispezione...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await bot.close();
  }

  logger.info("=== TEST COMPLETATO ===");
  process.exitCode = exitCode;
}

testBotUpgrade();
