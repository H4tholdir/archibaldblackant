#!/usr/bin/env tsx

import { QueueManager } from "../queue-manager";
import { logger } from "../logger";
import type { OrderData } from "../types";

/**
 * Test del Queue System con ordini multipli
 * Verifica che il sistema possa processare più ordini in parallelo
 */
async function testQueueSystem() {
  logger.info("=== TEST QUEUE SYSTEM ===");

  const queueManager = QueueManager.getInstance();

  try {
    // Avvia il worker
    logger.info("Avvio worker...");
    await queueManager.startWorker();

    // Crea 3 ordini di test
    const testOrders: OrderData[] = [
      {
        customerId: "fresis",
        customerName: "fresis",
        items: [
          {
            articleCode: "td1272.314",
            description: "td1272.314",
            quantity: 2,
            price: 5.0,
          },
        ],
      },
      {
        customerId: "fresis",
        customerName: "fresis",
        items: [
          {
            articleCode: "sf1000",
            description: "sf1000",
            quantity: 3,
            price: 10.0,
          },
        ],
      },
      {
        customerId: "fresis",
        customerName: "fresis",
        items: [
          {
            articleCode: "h250e 104 040",
            description: "h250e 104 040",
            quantity: 1,
            price: 15.0,
          },
        ],
      },
    ];

    // Aggiungi tutti gli ordini alla coda contemporaneamente
    logger.info(`Aggiunta ${testOrders.length} ordini alla coda...`);
    const jobs = await Promise.all(
      testOrders.map((order, i) =>
        queueManager.addOrder(order, `test-request-${i + 1}`),
      ),
    );

    logger.info("Ordini aggiunti alla coda:", {
      jobIds: jobs.map((j) => j.id),
    });

    // Monitora lo stato ogni 5 secondi
    const monitorInterval = setInterval(async () => {
      const stats = await queueManager.getQueueStats();
      logger.info("📊 Queue Stats:", stats);

      // Se tutti i job sono completati o falliti, termina
      if (stats.active === 0 && stats.waiting === 0) {
        clearInterval(monitorInterval);

        // Verifica i risultati
        logger.info("\n=== RISULTATI ===");
        for (const job of jobs) {
          const status = await queueManager.getJobStatus(job.id!);
          logger.info(`Job ${job.id}:`, status);
        }

        logger.info("\n=== TEST COMPLETATO ===");
        await queueManager.shutdown();
        process.exit(0);
      }
    }, 5000);
  } catch (error) {
    logger.error("❌ TEST FALLITO", { error });
    await queueManager.shutdown();
    process.exit(1);
  }
}

testQueueSystem();
