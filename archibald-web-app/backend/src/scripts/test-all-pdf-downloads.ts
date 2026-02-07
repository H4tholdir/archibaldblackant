#!/usr/bin/env tsx

import { BrowserPool } from "../browser-pool";
import { ArchibaldBot } from "../archibald-bot";
import { PasswordCache } from "../password-cache";
import { UserDatabase } from "../user-db";
import { logger } from "../logger";
import { config } from "../config";
import { promises as fs } from "fs";

type TestResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  durationMs: number;
  fileSizeKB?: number;
  error?: string;
};

const results: TestResult[] = [];

async function setup(): Promise<{ userId: string; browserPool: BrowserPool }> {
  const username = config.archibald.username;
  const password = config.archibald.password;

  if (!username || !password) {
    throw new Error(
      "ARCHIBALD_USERNAME and ARCHIBALD_PASSWORD must be set in .env",
    );
  }

  const userDb = UserDatabase.getInstance();
  let user = userDb.getUserByUsername(username);

  if (!user) {
    user = userDb.createUser(username, "Test PDF Downloads", "admin");
    logger.info(`Created test user: ${user.id}`);
  }

  PasswordCache.getInstance().set(user.id, password);
  logger.info(`Setup complete. User: ${user.id} (${username})`);

  return { userId: user.id, browserPool: BrowserPool.getInstance() };
}

async function testDownload(
  name: string,
  downloadFn: (
    bot: ArchibaldBot,
    context: any,
  ) => Promise<string>,
  userId: string,
  browserPool: BrowserPool,
): Promise<void> {
  const start = Date.now();
  let context: any = null;

  try {
    logger.info(`\n${"=".repeat(60)}`);
    logger.info(`TEST: ${name}`);
    logger.info(`${"=".repeat(60)}`);

    context = await browserPool.acquireContext(userId);
    const bot = new ArchibaldBot(userId);

    const pdfPath = await downloadFn(bot, context);

    const stats = await fs.stat(pdfPath);
    const sizeKB = Math.round(stats.size / 1024);

    if (stats.size === 0) {
      throw new Error("PDF file is empty (0 bytes)");
    }

    logger.info(`PASS: ${name} - ${sizeKB} KB - ${pdfPath}`);

    await fs.unlink(pdfPath);

    await browserPool.releaseContext(userId, context, true);
    context = null;

    results.push({
      name,
      status: "PASS",
      durationMs: Date.now() - start,
      fileSizeKB: sizeKB,
    });
  } catch (error: any) {
    logger.error(`FAIL: ${name} - ${error.message}`);

    if (context) {
      await browserPool.releaseContext(userId, context, false);
      context = null;
    }

    results.push({
      name,
      status: "FAIL",
      durationMs: Date.now() - start,
      error: error.message,
    });
  }
}

async function main() {
  logger.info("=== TEST ALL PDF DOWNLOADS (post-refactor) ===\n");

  const { userId, browserPool } = await setup();

  // Test 1: Clienti PDF
  await testDownload(
    "downloadCustomersPDF",
    (bot, ctx) => bot.downloadCustomersPDF(ctx),
    userId,
    browserPool,
  );

  // Test 2: Prodotti PDF
  await testDownload(
    "downloadProductsPDF",
    (bot, ctx) => bot.downloadProductsPDF(ctx),
    userId,
    browserPool,
  );

  // Test 3: Ordini PDF (ha filter + responsive fallback)
  await testDownload(
    "downloadOrdersPDF",
    (bot, ctx) => bot.downloadOrdersPDF(ctx),
    userId,
    browserPool,
  );

  // Test 4: DDT PDF
  await testDownload(
    "downloadDDTPDF",
    (bot, ctx) => bot.downloadDDTPDF(ctx),
    userId,
    browserPool,
  );

  // Test 5: Fatture PDF
  await testDownload(
    "downloadInvoicesPDF",
    (bot, ctx) => bot.downloadInvoicesPDF(ctx),
    userId,
    browserPool,
  );

  // Test 6: Prezzi PDF (nuovo, era duplicato in price-sync-service)
  await testDownload(
    "downloadPricesPDF",
    (bot, ctx) => bot.downloadPricesPDF(ctx),
    userId,
    browserPool,
  );

  // Test 7: Order Articles PDF (pattern diverso, detail page)
  await testDownload(
    "downloadOrderArticlesPDF",
    (bot, ctx) => bot.downloadOrderArticlesPDF(ctx, "71723"),
    userId,
    browserPool,
  );

  // Print summary
  logger.info(`\n${"=".repeat(60)}`);
  logger.info("RIEPILOGO TEST");
  logger.info(`${"=".repeat(60)}`);

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  for (const r of results) {
    const sizeInfo = r.fileSizeKB ? ` (${r.fileSizeKB} KB)` : "";
    const errorInfo = r.error ? ` - ${r.error}` : "";
    const timeInfo = `${(r.durationMs / 1000).toFixed(1)}s`;
    logger.info(`  ${r.status === "PASS" ? "PASS" : "FAIL"} ${r.name} [${timeInfo}]${sizeInfo}${errorInfo}`);
  }

  logger.info(`\nTotale: ${passed} passed, ${failed} failed su ${results.length} test`);

  if (failed > 0) {
    logger.error("Alcuni test sono falliti!");
    process.exit(1);
  }

  logger.info("Tutti i test superati!");
  process.exit(0);
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
