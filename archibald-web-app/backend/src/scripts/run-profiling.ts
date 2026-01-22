import { ArchibaldBot } from "../archibald-bot";
import { SlowdownOptimizer } from "../slowdown-optimizer";
import { BrowserPool } from "../browser-pool";
import { logger } from "../logger";
import fs from "fs/promises";
import path from "path";

/**
 * Orchestrates automated profiling execution across all instrumented steps
 * to find optimal slowdown values.
 *
 * Steps profiled (10 total):
 * - click_ordini
 * - click_nuovo
 * - select_customer
 * - click_new_article
 * - paste_article_direct
 * - select_article
 * - paste_qty
 * - click_update
 * - click_salvare_dropdown
 * - click_salva_chiudi
 */

async function runProfilingOrchestrator() {
  const steps = [
    "click_ordini",
    "click_nuovo",
    "select_customer",
    "click_new_article",
    "paste_article_direct",
    "select_article",
    "paste_qty",
    "click_update",
    "click_salvare_dropdown",
    "click_salva_chiudi",
  ];

  const browserPool = BrowserPool.getInstance();
  const bot = new ArchibaldBot("profiling-service");
  const optimizer = new SlowdownOptimizer(bot, "fresis", "TD1272.314");

  const results: Record<string, number> = {};
  const metadata = {
    profiled_at: new Date().toISOString(),
    test_customer: "fresis",
    test_article: "TD1272.314",
    iterations_total: 0,
    crashes_total: 0,
  };

  logger.info("[Profiling] Starting automated profiling for all steps", {
    totalSteps: steps.length,
    customer: metadata.test_customer,
    article: metadata.test_article,
  });

  // Initialize bot before profiling
  await bot.initialize();
  await bot.login();

  for (let i = 0; i < steps.length; i++) {
    const stepName = steps[i];
    const progress = `Step ${i + 1}/${steps.length}`;

    logger.info(
      `[Profiling] ${progress}: Starting optimization for ${stepName}`,
    );

    const optimalValue = await optimizer.optimizeStep(stepName);
    results[stepName] = optimalValue;

    logger.info(
      `[Profiling] ${progress}: Optimal value for ${stepName}: ${optimalValue}ms`,
    );
  }

  // Collect metadata from optimizer
  const state = optimizer.getState();
  for (const [_, stepState] of state) {
    metadata.iterations_total += stepState.testedValues.length;
    metadata.crashes_total += stepState.crashes.length;
  }

  logger.info("[Profiling] All steps optimized successfully", {
    totalIterations: metadata.iterations_total,
    totalCrashes: metadata.crashes_total,
  });

  // Cleanup
  await bot.close();
  await browserPool.shutdown();

  return { results, metadata };
}

/**
 * Write slowdown configuration to JSON file
 * @param results - Map of step names to optimal slowdown values
 * @param metadata - Profiling metadata (timestamps, iterations, crashes)
 * @returns Path to the written config file
 */
async function writeSlowdownConfig(
  results: Record<string, number>,
  metadata: Record<string, any>,
): Promise<string> {
  const config = {
    version: "1.0.0",
    baseline: 200,
    optimized: results,
    metadata,
  };

  const outputPath = path.join(__dirname, "../../slowdown-config.json");

  await fs.writeFile(outputPath, JSON.stringify(config, null, 2), "utf-8");

  logger.info(`[Profiling] Config written to ${outputPath}`);

  return outputPath;
}

// Main execution
async function main() {
  try {
    logger.info("[Profiling] Starting profiling orchestrator...");

    const { results, metadata } = await runProfilingOrchestrator();

    const configPath = await writeSlowdownConfig(results, metadata);

    logger.info("[Profiling] Profiling complete!", {
      configPath,
      results,
      metadata,
    });

    process.exit(0);
  } catch (error) {
    logger.error("[Profiling] Fatal error during profiling:", error);
    process.exit(1);
  }
}

main();
