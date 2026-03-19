import * as fs from "fs";
import * as fsp from "fs/promises";
import puppeteer, {
  type Browser,
  type BrowserContext,
  type ElementHandle,
  type Page,
} from "puppeteer";
import { config } from "../config";
import { logger } from "../logger";
import { SessionCacheManager } from "../session-cache";
import { PasswordCache } from "../password-cache";
import type { OrderData, AddressEntry } from "../types";
import type { AltAddress, CustomerAddress } from '../db/repositories/customer-addresses';
import type { SubmitOrderData } from '../operations/handlers/submit-order';
import {
  buildVariantCandidates,
  buildTextMatchCandidates,
  chooseBestTextMatchCandidate,
  chooseBestVariantCandidate,
  computeVariantHeaderIndices,
  normalizeLookupText,
} from "../variant-selection";

/**
 * Configuration for per-step slowdown values (in milliseconds).
 * Maps step names to their slowdown duration.
 * If a step is not in the config, the default 200ms is used.
 */
interface SlowdownConfig {
  [stepName: string]: number;
}

type BotBrowserPool = {
  acquireContext: (userId: string) => Promise<BrowserContext>;
  releaseContext: (userId: string, context: BrowserContext, success: boolean) => Promise<void>;
};

type BotProductDb = {
  getProductById: (code: string) => { id: string; packageContent?: string; multipleQty?: number } | undefined;
  selectPackageVariant: (name: string, quantity: number) => { id: string; packageContent?: string; multipleQty?: number } | undefined;
};

type BotGetUserById = (userId: string) => Promise<{ username: string } | null>;

type BotDeps = {
  browserPool?: BotBrowserPool;
  productDb?: BotProductDb;
  getUserById?: BotGetUserById;
};

export function buildOrderNotesText(noShipping?: boolean, notes?: string): string {
  const parts: string[] = [];
  if (noShipping) parts.push('NO SPESE DI SPEDIZIONE');
  if (notes?.trim()) parts.push(notes.trim());
  return parts.join('\n');
}

export class ArchibaldBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;
  private userId: string | null = null;
  private productDb: BotProductDb | null = null;
  private legacySessionCache: SessionCacheManager | null = null;
  private _browserPool: BotBrowserPool | null = null;
  private _getUserById: BotGetUserById | null = null;
  private slowdownConfig: SlowdownConfig = {}; // Per-step slowdown configuration
  private opSeq = 0;
  private lastOpEndNs: bigint | null = null;
  private hasError = false;
  private progressCallback?:
    | ((
        operationCategory: string,
        metadata?: Record<string, any>,
      ) => Promise<void>)
    | undefined;
  private opRecords: Array<{
    id: number;
    name: string;
    category: string;
    status: "ok" | "error";
    startIso: string;
    endIso: string;
    durationMs: number;
    gapMs: number;
    retryAttempt: number;
    memoryBefore: number;
    memoryAfter: number;
    meta: Record<string, unknown>;
    errorMessage?: string;
  }> = [];

  constructor(userId?: string, deps?: BotDeps) {
    this.userId = userId || null;
    this._browserPool = deps?.browserPool ?? null;
    this.productDb = deps?.productDb ?? null;
    this._getUserById = deps?.getUserById ?? null;

    if (!this.userId) {
      this.legacySessionCache = new SessionCacheManager();
    }
  }

  public setProgressCallback(
    callback: (
      operationCategory: string,
      metadata?: Record<string, any>,
    ) => Promise<void>,
  ): void {
    this.progressCallback = callback;
  }

  private async emitProgress(
    operationCategory: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (this.progressCallback) {
      try {
        await this.progressCallback(operationCategory, metadata);
      } catch (error) {
        logger.warn(`[Bot] Progress callback error: ${error}`);
      }
    }
  }

  private async runOp<T>(
    name: string,
    fn: () => Promise<T>,
    category: string,
    meta: Record<string, unknown> = {},
  ): Promise<T> {
    const opId = ++this.opSeq;
    const startIso = new Date().toISOString();
    const startNs = process.hrtime.bigint();
    const gapMs = this.lastOpEndNs
      ? Number(startNs - this.lastOpEndNs) / 1_000_000
      : 0;

    const retryAttempt =
      typeof meta.retryAttempt === "number" ? meta.retryAttempt : 0;
    const memoryBefore = process.memoryUsage().heapUsed;

    // Add slowdown config to metadata if non-empty
    const enrichedMeta = {
      ...meta,
      slowdownConfigActive:
        Object.keys(this.slowdownConfig).length > 0 ? true : false,
    };

    logger.debug(`[OP ${opId} START] ${name}`, { gapMs, ...enrichedMeta });

    try {
      const result = await fn();
      const memoryAfter = process.memoryUsage().heapUsed;
      const endNs = process.hrtime.bigint();
      const durationMs = Number(endNs - startNs) / 1_000_000;
      this.lastOpEndNs = endNs;
      this.opRecords.push({
        id: opId,
        name,
        category,
        status: "ok",
        startIso,
        endIso: new Date().toISOString(),
        durationMs,
        gapMs,
        retryAttempt,
        memoryBefore,
        memoryAfter,
        meta: enrichedMeta,
      });
      logger.debug(`[OP ${opId} END] ${name}`, { durationMs });
      return result;
    } catch (error) {
      const memoryAfter = process.memoryUsage().heapUsed;
      const endNs = process.hrtime.bigint();
      const durationMs = Number(endNs - startNs) / 1_000_000;
      this.lastOpEndNs = endNs;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.opRecords.push({
        id: opId,
        name,
        category,
        status: "error",
        startIso,
        endIso: new Date().toISOString(),
        durationMs,
        gapMs,
        retryAttempt,
        memoryBefore,
        memoryAfter,
        meta: enrichedMeta,
        errorMessage,
      });
      logger.error(`[OP ${opId} ERROR] ${name}`, {
        durationMs,
        errorMessage,
      });
      throw error;
    }
  }

  private buildOperationReport(): string {
    const totalDurationMs = this.opRecords.reduce(
      (sum, record) => sum + record.durationMs,
      0,
    );

    const totalGapMs = this.opRecords.reduce(
      (sum, record) => sum + record.gapMs,
      0,
    );

    // Trova le 5 operazioni più lente
    const slowest = [...this.opRecords]
      .filter((r) => r.status === "ok")
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    // Trova i 5 gap più lunghi
    const longestGaps = [...this.opRecords]
      .sort((a, b) => b.gapMs - a.gapMs)
      .slice(0, 5);

    const errors = this.opRecords.filter((record) => record.status === "error");
    const successCount = this.opRecords.filter((r) => r.status === "ok").length;

    const lines: string[] = [];
    lines.push("# 🤖 Archibald Bot Operation Report");
    lines.push("");
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## 📊 Summary");
    lines.push("");
    lines.push(`- **Total operations**: ${this.opRecords.length}`);
    lines.push(`- **Successful**: ${successCount}`);
    lines.push(`- **Failed**: ${errors.length}`);
    lines.push(`- **Total duration**: ${(totalDurationMs / 1000).toFixed(2)}s`);
    lines.push(`- **Total gaps**: ${(totalGapMs / 1000).toFixed(2)}s`);
    lines.push(
      `- **Average operation**: ${(totalDurationMs / this.opRecords.length).toFixed(0)}ms`,
    );
    lines.push("");

    if (slowest.length > 0) {
      lines.push("## 🐌 Slowest Operations (Top 5)");
      lines.push("");
      for (let i = 0; i < slowest.length; i++) {
        const op = slowest[i];
        lines.push(
          `${i + 1}. **${op.name}**: ${(op.durationMs / 1000).toFixed(2)}s`,
        );
      }
      lines.push("");
    }

    if (longestGaps.length > 0 && longestGaps[0].gapMs > 100) {
      lines.push("## ⏳ Longest Gaps (Top 5)");
      lines.push("");
      lines.push("*Gaps rappresentano attese inutili tra operazioni*");
      lines.push("");
      for (let i = 0; i < longestGaps.length; i++) {
        const op = longestGaps[i];
        if (op.gapMs > 100) {
          lines.push(
            `${i + 1}. Before **${op.name}**: ${(op.gapMs / 1000).toFixed(2)}s`,
          );
        }
      }
      lines.push("");
    }

    if (errors.length > 0) {
      lines.push("## ❌ Errors");
      lines.push("");
      for (const record of errors) {
        lines.push(`- **[${record.id}] ${record.name}**`);
        lines.push(`  - Error: \`${record.errorMessage ?? "unknown"}\``);
        lines.push(
          `  - Duration before fail: ${(record.durationMs / 1000).toFixed(2)}s`,
        );
      }
      lines.push("");
    }

    lines.push("## 📋 Detailed Timeline");
    lines.push("");
    lines.push(
      "| # | Name | Status | Duration ms | Gap ms | Start | End | Meta |",
    );
    lines.push(
      "| - | ---- | ------ | ----------- | ------ | ----- | --- | ---- |",
    );

    for (const record of this.opRecords) {
      const metaStr = Object.keys(record.meta).length
        ? JSON.stringify(record.meta).replace(/\|/g, "\\|")
        : "";
      const statusEmoji = record.status === "ok" ? "✅" : "❌";
      lines.push(
        `| ${record.id} | ${record.name} | ${statusEmoji} ${record.status} | ${record.durationMs.toFixed(
          1,
        )} | ${record.gapMs.toFixed(1)} | ${record.startIso} | ${
          record.endIso
        } | ${metaStr} |`,
      );
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("*Generated by Archibald Bot automation system*");

    return lines.join("\n");
  }

  /**
   * Calculate percentile statistics from an array of numeric values
   * @param values - Array of numeric values (e.g., operation durations in milliseconds)
   * @returns Object containing p50 (median), p95, and p99 percentile values
   * @example
   * const durations = [100, 200, 300, 400, 500];
   * const percentiles = this.calculatePercentiles(durations);
   * // percentiles = { p50: 300, p95: 500, p99: 500 }
   */
  private calculatePercentiles(values: number[]): {
    p50: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      p50: sorted[p50Index],
      p95: sorted[p95Index],
      p99: sorted[p99Index],
    };
  }

  /**
   * Build enhanced markdown performance report with category breakdown and profiling data
   *
   * Generates a comprehensive report including:
   * - Summary statistics with memory profiling
   * - Performance breakdown by operation category (login, navigation, form operations)
   * - Percentile statistics (p50, p95, p99) per category
   * - Retry analysis for operations that failed and were retried
   * - Slowest operations and longest idle gaps
   * - Detailed timeline with category and memory delta
   *
   * Category naming conventions:
   * - "login" - Authentication and browser initialization
   * - "login.cache" - Session cache operations
   * - "navigation.ordini" - Navigation to orders menu
   * - "navigation.form" - Navigation to order form
   * - "form.customer" - Customer selection operations
   * - "form.article" - Article search and selection
   * - "form.quantity" - Quantity field operations
   * - "form.discount" - Discount field operations
   * - "form.package" - Package variant selection
   * - "form.submit" - Save/update operations
   * - "form.multi_article" - Multi-article row operations
   *
   * @returns Markdown-formatted performance report string
   */
  private buildEnhancedReport(): string {
    const totalDurationMs = this.opRecords.reduce(
      (sum, record) => sum + record.durationMs,
      0,
    );

    const totalGapMs = this.opRecords.reduce(
      (sum, record) => sum + record.gapMs,
      0,
    );

    const errors = this.opRecords.filter((record) => record.status === "error");
    const successCount = this.opRecords.filter((r) => r.status === "ok").length;

    // Memory stats
    const peakMemoryBytes = Math.max(
      ...this.opRecords.map((r) => r.memoryAfter),
    );
    const avgMemoryBytes =
      this.opRecords.reduce((sum, r) => sum + r.memoryBefore, 0) /
      this.opRecords.length;

    // Category breakdown
    const categoryMap: Record<
      string,
      {
        count: number;
        durations: number[];
        memories: number[];
      }
    > = {};

    for (const record of this.opRecords) {
      if (record.status === "ok") {
        if (!categoryMap[record.category]) {
          categoryMap[record.category] = {
            count: 0,
            durations: [],
            memories: [],
          };
        }
        categoryMap[record.category].count++;
        categoryMap[record.category].durations.push(record.durationMs);
        categoryMap[record.category].memories.push(
          record.memoryAfter - record.memoryBefore,
        );
      }
    }

    // Retry analysis
    const retriedOperations = this.opRecords.filter((r) => r.retryAttempt > 0);

    // Build report
    const lines: string[] = [];
    lines.push("# 🤖 Archibald Bot Enhanced Performance Report");
    lines.push("");
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push("");

    // Summary section
    lines.push("## 📊 Summary");
    lines.push("");
    lines.push(`- **Total operations**: ${this.opRecords.length}`);
    lines.push(`- **Successful**: ${successCount}`);
    lines.push(`- **Failed**: ${errors.length}`);
    lines.push(`- **Total duration**: ${(totalDurationMs / 1000).toFixed(2)}s`);
    lines.push(`- **Total gaps**: ${(totalGapMs / 1000).toFixed(2)}s`);
    lines.push(
      `- **Average operation**: ${(totalDurationMs / this.opRecords.length).toFixed(0)}ms`,
    );
    lines.push(
      `- **Peak memory**: ${(peakMemoryBytes / 1024 / 1024).toFixed(2)} MB`,
    );
    lines.push(
      `- **Average memory**: ${(avgMemoryBytes / 1024 / 1024).toFixed(2)} MB`,
    );
    lines.push("");

    // Category breakdown
    lines.push("## 📂 Performance by Category");
    lines.push("");
    lines.push(
      "| Category | Count | Total (s) | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Avg Memory (KB) |",
    );
    lines.push(
      "| -------- | ----- | --------- | -------- | -------- | -------- | -------- | --------------- |",
    );

    const sortedCategories = Object.entries(categoryMap).sort(
      ([, a], [, b]) =>
        b.durations.reduce((s, d) => s + d, 0) -
        a.durations.reduce((s, d) => s + d, 0),
    );

    for (const [category, data] of sortedCategories) {
      const totalMs = data.durations.reduce((sum, d) => sum + d, 0);
      const avgMs = totalMs / data.count;
      const percentiles = this.calculatePercentiles(data.durations);
      const avgMemoryKB =
        data.memories.reduce((sum, m) => sum + m, 0) / data.count / 1024;

      lines.push(
        `| ${category} | ${data.count} | ${(totalMs / 1000).toFixed(2)} | ${avgMs.toFixed(0)} | ${percentiles.p50.toFixed(0)} | ${percentiles.p95.toFixed(0)} | ${percentiles.p99.toFixed(0)} | ${avgMemoryKB.toFixed(1)} |`,
      );
    }
    lines.push("");

    // Retry analysis
    if (retriedOperations.length > 0) {
      lines.push("## 🔄 Retry Analysis");
      lines.push("");
      lines.push(`**Total retried operations**: ${retriedOperations.length}`);
      lines.push("");
      lines.push("| Op ID | Name | Category | Retry # | Status |");
      lines.push("| ----- | ---- | -------- | ------- | ------ |");

      for (const op of retriedOperations) {
        const statusEmoji = op.status === "ok" ? "✅" : "❌";
        lines.push(
          `| ${op.id} | ${op.name} | ${op.category} | ${op.retryAttempt} | ${statusEmoji} ${op.status} |`,
        );
      }
      lines.push("");
    }

    // Slowest operations (from original report)
    const slowest = [...this.opRecords]
      .filter((r) => r.status === "ok")
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    if (slowest.length > 0) {
      lines.push("## 🐌 Slowest Operations (Top 5)");
      lines.push("");
      for (let i = 0; i < slowest.length; i++) {
        const op = slowest[i];
        lines.push(
          `${i + 1}. **${op.name}** (${op.category}): ${(op.durationMs / 1000).toFixed(2)}s`,
        );
      }
      lines.push("");
    }

    // Longest gaps (from original report)
    const longestGaps = [...this.opRecords]
      .sort((a, b) => b.gapMs - a.gapMs)
      .slice(0, 5);

    if (longestGaps.length > 0 && longestGaps[0].gapMs > 100) {
      lines.push("## ⏳ Longest Gaps (Top 5)");
      lines.push("");
      lines.push("*Gaps represent idle time between operations*");
      lines.push("");
      for (let i = 0; i < longestGaps.length; i++) {
        const op = longestGaps[i];
        if (op.gapMs > 100) {
          lines.push(
            `${i + 1}. Before **${op.name}** (${op.category}): ${(op.gapMs / 1000).toFixed(2)}s`,
          );
        }
      }
      lines.push("");
    }

    // Errors (from original report)
    if (errors.length > 0) {
      lines.push("## ❌ Errors");
      lines.push("");
      for (const record of errors) {
        lines.push(`- **[${record.id}] ${record.name}** (${record.category})`);
        lines.push(`  - Error: \`${record.errorMessage ?? "unknown"}\``);
        lines.push(
          `  - Duration before fail: ${(record.durationMs / 1000).toFixed(2)}s`,
        );
      }
      lines.push("");
    }

    // Detailed timeline (extended with category and memory)
    lines.push("## 📋 Detailed Timeline");
    lines.push("");
    lines.push(
      "| # | Name | Category | Status | Duration ms | Gap ms | Memory Δ (KB) | Start | End | Meta |",
    );
    lines.push(
      "| - | ---- | -------- | ------ | ----------- | ------ | ------------- | ----- | --- | ---- |",
    );

    for (const record of this.opRecords) {
      const metaStr = Object.keys(record.meta).length
        ? JSON.stringify(record.meta).replace(/\|/g, "\\|")
        : "";
      const statusEmoji = record.status === "ok" ? "✅" : "❌";
      const memoryDeltaKB = (
        (record.memoryAfter - record.memoryBefore) /
        1024
      ).toFixed(1);
      lines.push(
        `| ${record.id} | ${record.name} | ${record.category} | ${statusEmoji} ${record.status} | ${record.durationMs.toFixed(
          1,
        )} | ${record.gapMs.toFixed(1)} | ${memoryDeltaKB} | ${record.startIso} | ${
          record.endIso
        } | ${metaStr} |`,
      );
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("*Generated by Archibald Bot Enhanced Profiling System*");

    return lines.join("\n");
  }

  /**
   * Export structured profiling data as JSON for programmatic analysis
   *
   * Returns comprehensive performance metrics including:
   * - Summary: Overall statistics, success/failure counts, durations, memory usage
   * - Categories: Per-category breakdown with count, durations, percentiles (p50/p95/p99), and memory stats
   * - Retries: List of operations that required retry attempts with final status
   * - Operations: Complete array of all operation records with full details
   *
   * This data can be used for:
   * - Automated performance analysis and alerting
   * - Trend tracking across multiple test runs
   * - Integration with monitoring/analytics systems
   * - Generating custom reports and visualizations
   *
   * @returns Structured profiling data object
   */
  public exportProfilingData(): {
    summary: {
      totalOperations: number;
      successful: number;
      failed: number;
      totalDurationMs: number;
      totalGapMs: number;
      averageOperationMs: number;
      peakMemoryBytes: number;
    };
    categories: Record<
      string,
      {
        count: number;
        totalDurationMs: number;
        avgDurationMs: number;
        p50Ms: number;
        p95Ms: number;
        p99Ms: number;
        avgMemoryBytes: number;
      }
    >;
    retries: Array<{
      operationId: number;
      name: string;
      category: string;
      attempts: number;
      finalStatus: "ok" | "error";
    }>;
    operations: Array<{
      id: number;
      name: string;
      status: "ok" | "error";
      category: string;
      startIso: string;
      endIso: string;
      durationMs: number;
      gapMs: number;
      retryAttempt: number;
      memoryBefore: number;
      memoryAfter: number;
      meta: Record<string, unknown>;
      errorMessage?: string;
    }>;
  } {
    const totalDurationMs = this.opRecords.reduce(
      (sum, record) => sum + record.durationMs,
      0,
    );

    const totalGapMs = this.opRecords.reduce(
      (sum, record) => sum + record.gapMs,
      0,
    );

    const successful = this.opRecords.filter((r) => r.status === "ok").length;
    const failed = this.opRecords.filter((r) => r.status === "error").length;
    const peakMemoryBytes = Math.max(
      ...this.opRecords.map((r) => r.memoryAfter),
    );

    // Category breakdown
    const categoryMap: Record<
      string,
      {
        durations: number[];
        memories: number[];
      }
    > = {};

    for (const record of this.opRecords) {
      if (record.status === "ok") {
        if (!categoryMap[record.category]) {
          categoryMap[record.category] = { durations: [], memories: [] };
        }
        categoryMap[record.category].durations.push(record.durationMs);
        categoryMap[record.category].memories.push(
          record.memoryAfter - record.memoryBefore,
        );
      }
    }

    const categories: Record<
      string,
      {
        count: number;
        totalDurationMs: number;
        avgDurationMs: number;
        p50Ms: number;
        p95Ms: number;
        p99Ms: number;
        avgMemoryBytes: number;
      }
    > = {};

    for (const [category, data] of Object.entries(categoryMap)) {
      const totalMs = data.durations.reduce((sum, d) => sum + d, 0);
      const percentiles = this.calculatePercentiles(data.durations);
      const avgMemory =
        data.memories.reduce((sum, m) => sum + m, 0) / data.memories.length;

      categories[category] = {
        count: data.durations.length,
        totalDurationMs: totalMs,
        avgDurationMs: totalMs / data.durations.length,
        p50Ms: percentiles.p50,
        p95Ms: percentiles.p95,
        p99Ms: percentiles.p99,
        avgMemoryBytes: avgMemory,
      };
    }

    // Retry analysis
    const retries = this.opRecords
      .filter((r) => r.retryAttempt > 0)
      .map((r) => ({
        operationId: r.id,
        name: r.name,
        category: r.category,
        attempts: r.retryAttempt,
        finalStatus: r.status,
      }));

    return {
      summary: {
        totalOperations: this.opRecords.length,
        successful,
        failed,
        totalDurationMs,
        totalGapMs,
        averageOperationMs: totalDurationMs / this.opRecords.length,
        peakMemoryBytes,
      },
      categories,
      retries,
      operations: this.opRecords,
    };
  }

  /**
   * Helper method to wait for a specified number of milliseconds
   */
  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get slowdown value for a specific step from config, with 200ms default fallback
   * @param stepName - Name of the step (e.g., "click_ordini", "paste_customer")
   * @returns Slowdown value in milliseconds
   */
  private getSlowdown(stepName: string): number {
    return this.slowdownConfig[stepName] ?? 200;
  }

  /**
   * Find and click element by text content
   * @param text - Text to search for
   * @param options - Configuration options
   * @returns true if clicked, false if not found
   */
  private async clickElementByText(
    text: string,
    options?: {
      exact?: boolean;
      selectors?: string[];
      timeout?: number;
    },
  ): Promise<boolean> {
    const {
      exact = false,
      selectors = ["a", "span", "button", "div"],
      timeout = 3000,
    } = options || {};

    const clicked = await this.page!.evaluate(
      (searchText, isExact, selectorList) => {
        const elements = Array.from(
          document.querySelectorAll(selectorList.join(", ")),
        );

        const target = elements.find((el) => {
          const elementText = el.textContent?.trim() || "";
          const searchLower = searchText.toLowerCase();
          const elementLower = elementText.toLowerCase();

          if (isExact) {
            return elementLower === searchLower;
          }
          return elementLower.includes(searchLower) && elementText.length < 100;
        });

        if (target) {
          (target as HTMLElement).click();
          return true;
        }
        return false;
      },
      text,
      exact,
      selectors,
    );

    return clicked;
  }

  private async clickSaveOnly(): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    // Open the "Salvare" dropdown menu
    const dropdownOpened = await this.page.evaluate(() => {
      const allElements = Array.from(
        document.querySelectorAll("span, button, a"),
      );
      const salvareBtn = allElements.find((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        return text.includes("salvare") || text === "save";
      });

      if (!salvareBtn) return false;

      const parent = salvareBtn.closest("li") || salvareBtn.parentElement;
      if (!parent) return false;

      const popOut =
        parent.querySelector("div.dxm-popOut") ||
        parent.querySelector('[id*="_P"]');
      if (popOut && (popOut as HTMLElement).offsetParent !== null) {
        (popOut as HTMLElement).click();
        return true;
      }

      const arrow = parent.querySelector(
        'img[id*="_B-1"], img[alt*="down"]',
      );
      if (arrow) {
        (arrow as HTMLElement).click();
        return true;
      }

      (salvareBtn as HTMLElement).click();
      return true;
    });

    if (!dropdownOpened) {
      throw new Error('Button "Salvare" not found');
    }

    // Wait for the dropdown popup to appear (up to 3s instead of fixed 500ms)
    try {
      await this.page.waitForFunction(
        () => {
          const popups = Array.from(document.querySelectorAll(
            '[class*="dxm-popup"], [class*="subMenu"], [id*="_menu_DXI"], [class*="dxm-content"]',
          ));
          for (const popup of popups) {
            const el = popup as HTMLElement;
            if (el.offsetParent !== null && el.offsetHeight > 0) {
              const items = Array.from(popup.querySelectorAll("a, span"));
              for (const item of items) {
                const t = item.textContent?.trim(); if (t === "Salvare" || t === "Save") return true;
              }
            }
          }
          return false;
        },
        { timeout: 3000, polling: 100 },
      );
    } catch {
      logger.warn('Dropdown popup not detected via waitForFunction, proceeding with fallback...');
    }

    // Click "Salvare" item inside the dropdown popup (not "Salva e chiudi")
    const saveClicked = await this.page.evaluate(() => {
      // Search in popup/submenu containers for the exact "Salvare" text
      const popups = Array.from(
        document.querySelectorAll(
          '[class*="dxm-popup"], [class*="subMenu"], [id*="_menu_DXI"], [class*="dxm-content"]',
        ),
      );
      for (const popup of popups) {
        const items = Array.from(popup.querySelectorAll("a, span"));
        for (const item of items) {
          const text = item.textContent?.trim() || "";
          if (
            (text === "Salvare" || text === "Save") &&
            (item as HTMLElement).offsetParent !== null
          ) {
            (item as HTMLElement).click();
            return true;
          }
        }
      }

      // Fallback: search all visible elements with exact "Salvare" text
      // but exclude the main toolbar button (which is inside an LI with dropdown)
      const allItems = Array.from(document.querySelectorAll("a, span, li"));
      for (const item of allItems) {
        const text = item.textContent?.trim() || "";
        if (text === "Salvare" && (item as HTMLElement).offsetParent !== null) {
          const isMenuPopupItem =
            item.closest('[class*="dxm-popup"]') ||
            item.closest('[class*="subMenu"]') ||
            item.closest('[id*="_DXI"]') ||
            item.closest('[class*="dxm-content"]');
          if (isMenuPopupItem) {
            (item as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });

    if (!saveClicked) {
      throw new Error('"Salvare" option not found in dropdown');
    }

    logger.info('Clicked "Salvare" (save only)');
    await this.wait(1000);
  }

  /**
   * Find DevExpress dropdown by label text and click arrow
   * @param labelText - Label text to search for (e.g., "PROFILO CLIENTE")
   * @param options - Configuration options
   * @returns true if dropdown opened
   */
  private async openDevExpressDropdown(
    labelText: string,
    options?: { timeout?: number },
  ): Promise<boolean> {
    const { timeout = 3000 } = options || {};

    const dropdownOpened = await this.page!.evaluate((label) => {
      // Find label by text (try with and without colon)
      const allElements = Array.from(
        document.querySelectorAll("span, td, div, label"),
      );

      const normalizedLabel = label.toUpperCase().replace(/:/g, "").trim();

      const labelEl = allElements.find((el) => {
        const text =
          el.textContent?.toUpperCase().replace(/:/g, "").trim() || "";
        return text === normalizedLabel || text.includes(normalizedLabel);
      });

      if (!labelEl) return false;

      // Strategy 1: Look for dropdown arrow in same table row (TR)
      let parent = labelEl.parentElement;
      while (parent && parent.tagName !== "TR") {
        parent = parent.parentElement;
      }

      if (parent) {
        // Look in entire row for dropdown button image
        const images = parent.querySelectorAll("img");
        for (const img of Array.from(images)) {
          const id = img.id || "";
          const src = img.src || "";
          const alt = img.alt || "";

          // DevExpress dropdown arrow patterns
          if (
            id.includes("DDD") ||
            id.includes("_B-1") ||
            id.includes("_B_") ||
            src.includes("edtDropDown") ||
            src.includes("arrow") ||
            alt.toLowerCase().includes("dropdown")
          ) {
            img.click();
            return true;
          }
        }

        // Also try clicking on table element with DDD in ID
        const tables = parent.querySelectorAll("table");
        for (const table of Array.from(tables)) {
          if (table.id.includes("_DDD")) {
            table.click();
            return true;
          }
        }
      }

      // Strategy 2: Look for dropdown button near label (same TD or adjacent TD)
      parent = labelEl.parentElement;
      while (parent && parent.tagName !== "TD") {
        parent = parent.parentElement;
      }

      if (parent && parent.tagName === "TD") {
        // Look in same TD
        let dropdownArrow = parent.querySelector(
          'img[id*="DDD"], img[id*="_B-1"], img[src*="edtDropDown"]',
        );
        if (dropdownArrow) {
          (dropdownArrow as HTMLElement).click();
          return true;
        }

        // Look in next sibling TD
        const nextTd = parent.nextElementSibling;
        if (nextTd) {
          dropdownArrow = nextTd.querySelector(
            'img[id*="DDD"], img[id*="_B-1"], img[src*="edtDropDown"]',
          );
          if (dropdownArrow) {
            (dropdownArrow as HTMLElement).click();
            return true;
          }
        }
      }

      // Strategy 3: Fallback - look for any clickable element with DDD
      parent = labelEl.parentElement;
      if (parent) {
        const clickable = parent.closest('[id*="DDD"]');
        if (clickable) {
          (clickable as HTMLElement).click();
          return true;
        }
      }

      return false;
    }, labelText);

    if (dropdownOpened) {
      // Wait for dropdown panel to appear
      await this.wait(500);
    }

    return dropdownOpened;
  }

  /**
   * Paste text into input field (faster than typing character by character)
   * Sets value directly and triggers events to notify DevExpress
   * @param inputHandle - ElementHandle of the input field
   * @param text - Text to paste
   */
  private async pasteText(
    inputHandle: ElementHandle<Element>,
    text: string,
  ): Promise<void> {
    // Clear field first with triple click
    await inputHandle.click({ clickCount: 3 });
    await this.wait(100);

    // Set the value directly (faster than clipboard for DevExpress)
    await inputHandle.evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
      // Trigger input event to notify DevExpress
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, text);

    await this.wait(100);

    // Press a key to trigger DevExpress event handlers
    await inputHandle.press("End"); // Move cursor to end
    await this.wait(100);
  }

  /**
   * Type in dropdown search input and wait for filtering
   * @param searchText - Text to type in search input
   * @param options - Configuration options
   */
  private async searchInDropdown(
    searchText: string,
    options?: { timeout?: number; usePaste?: boolean },
  ): Promise<void> {
    const { timeout = 2000, usePaste = true } = options || {};

    // Wait for search input to appear in dropdown panel
    logger.debug("Waiting for dropdown search input to appear...");
    await this.wait(1500); // Give panel time to fully render

    // Find visible text input in dropdown panel with multiple strategies
    let searchInput = await this.page!.waitForSelector(
      'input[type="text"]:not([style*="display: none"]):not([style*="visibility: hidden"])',
      { timeout: 3000, visible: true },
    ).catch(() => null);

    // Fallback: look for any visible input in dropdown panel
    if (!searchInput) {
      logger.debug("First strategy failed, trying fallback...");
      const inputs = await this.page!.$$('input[type="text"]');
      for (const input of inputs) {
        const isVisible = await input.evaluate(
          (el) => (el as HTMLElement).offsetParent !== null,
        );
        if (isVisible) {
          searchInput = input;
          logger.debug("Found visible input via fallback");
          break;
        }
      }
    }

    if (!searchInput) {
      // Take screenshot to debug
      await this.page!.screenshot({
        path: `logs/search-input-not-found-${Date.now()}.png`,
        fullPage: true,
      });
      throw new Error("Search input not found in dropdown panel");
    }

    logger.debug(
      `Search input found, ${usePaste ? "pasting" : "typing"} text...`,
    );

    if (usePaste) {
      // Use faster paste method
      logger.debug(`Pasting: ${searchText}`);
      await this.pasteText(searchInput, searchText);
      await this.wait(300);
    } else {
      // Click to focus
      await searchInput.click({ clickCount: 1 });
      await this.wait(300);

      // Clear any existing value by selecting all and deleting
      await this.page!.keyboard.down("Control");
      await this.page!.keyboard.press("a");
      await this.page!.keyboard.up("Control");
      await this.wait(100);
      await this.page!.keyboard.press("Backspace");
      await this.wait(200);

      // Type new text slowly to trigger filtering
      logger.debug(`Typing: ${searchText}`);
      await searchInput.type(searchText, { delay: 80 });
      await this.wait(500);
    }

    // DON'T press Enter - it might close the dropdown
    // Just wait for filter to apply automatically
    logger.debug("Waiting for filter to apply...");
    await this.wait(1500);
  }

  /**
   * Select row in dropdown table by text match
   * @param matchText - Text to match in row
   * @param options - Configuration options
   * @returns true if row selected, false if not found
   */
  private async selectDropdownRow(
    matchText: string,
    options?: { exact?: boolean },
  ): Promise<boolean> {
    const { exact = false } = options || {};

    const rowSelected = await this.page!.evaluate(
      (text, isExact) => {
        // Find all visible table rows in dropdown
        const rows = Array.from(
          document.querySelectorAll('tr[class*="dxgvDataRow"]'),
        );

        const matchedRow = rows.find((row) => {
          const htmlRow = row as HTMLElement;
          const isVisible = htmlRow.offsetParent !== null;
          const rowText = row.textContent?.trim() || "";

          if (!isVisible) return false;

          if (isExact) {
            return rowText === text;
          }
          return rowText.includes(text);
        });

        if (matchedRow) {
          const firstCell = matchedRow.querySelector("td");
          if (firstCell) {
            (firstCell as HTMLElement).click();
            return true;
          }
        }

        return false;
      },
      matchText,
      exact,
    );

    return rowSelected;
  }

  /**
   * Double-click cell and type value (for quantity, discount)
   * OPTIMIZED: Uses JavaScript setValue with event dispatching for faster field editing
   * @param cellLabelText - Label text near the cell (e.g., "Qtà ordinata")
   * @param value - Value to set
   */
  private async editTableCell(
    cellLabelText: string,
    value: string | number,
  ): Promise<void> {
    // Find the input field by pattern matching on column label
    const inputInfo = await this.page!.evaluate((label) => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      );

      // Map label to ID pattern
      let idPattern = "";
      if (
        label.toLowerCase().includes("qtà") ||
        label.toLowerCase().includes("quantit")
      ) {
        idPattern = "qtyordered";
      } else if (
        label.toLowerCase().includes("sconto") ||
        label.toLowerCase().includes("discount")
      ) {
        idPattern = "discount";
      }

      // Find input with matching ID pattern
      const input = inputs.find((inp) => {
        const id = (inp as HTMLInputElement).id.toLowerCase();
        return (
          id.includes(idPattern) &&
          id.includes("salesline") &&
          (inp as HTMLElement).offsetParent !== null
        );
      });

      if (!input) return null;

      return {
        id: (input as HTMLInputElement).id,
        value: (input as HTMLInputElement).value,
      };
    }, cellLabelText);

    if (!inputInfo) {
      throw new Error(`Cell "${cellLabelText}" input not found`);
    }

    logger.debug(`Found input for "${cellLabelText}": ${inputInfo.id}`);
    logger.debug(`Current value: "${inputInfo.value}"`);

    // Extract base ID (remove _I suffix) for cell selector
    const baseId = inputInfo.id.endsWith("_I")
      ? inputInfo.id.slice(0, -2)
      : inputInfo.id;

    // Format value for DevExpress (use comma as decimal separator)
    // Use decimals only when necessary (4 → "4", 4.5 → "4,5")
    const formatValue = (val: number): string => {
      const fixed = Number.isInteger(val) ? val.toString() : val.toFixed(2);
      return fixed.replace(".", ",");
    };

    const formattedValue = formatValue(Number(value));

    // Wait for DOM stabilization after article selection
    await this.wait(300);

    // OPT-03 FINAL: Classic reliable approach - atomic double-click + keyboard simulation
    // This is the proven method that works 100% of the time with DevExpress
    logger.debug(
      `Field editing for "${cellLabelText}" with value: "${formattedValue}"`,
    );

    // Step 1: Atomic double-click to enter edit mode (prevents detachment issues)
    const dblClickSuccess = await this.page!.evaluate((inputId) => {
      const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
      if (!input) return false;

      try {
        input.focus();

        const dblClickEvent = new MouseEvent("dblclick", {
          view: window,
          bubbles: true,
          cancelable: true,
          detail: 2,
        });
        input.dispatchEvent(dblClickEvent);

        // Small sync wait for edit mode
        const start = Date.now();
        while (Date.now() - start < 150) {}

        return true;
      } catch (err) {
        return false;
      }
    }, inputInfo.id);

    if (!dblClickSuccess) {
      throw new Error(`Double-click failed for input ${inputInfo.id}`);
    }

    await this.wait(300);

    // Step 2: Select all existing content programmatically (more reliable than Ctrl+A)
    const selectSuccess = await this.page!.evaluate((inputId) => {
      const input = document.querySelector(`#${inputId}`) as HTMLInputElement;
      if (!input) return false;

      try {
        // Ensure field is focused
        input.focus();

        // Select all text programmatically
        input.select();
        // Alternative: input.setSelectionRange(0, input.value.length);

        return true;
      } catch (err) {
        return false;
      }
    }, inputInfo.id);

    if (!selectSuccess) {
      throw new Error(`Failed to select text in field: ${cellLabelText}`);
    }

    await this.wait(100);

    // Step 3: Clear selected content and type new value
    await this.page!.keyboard.press("Backspace"); // Delete selected text
    await this.wait(50);
    await this.page!.keyboard.type(formattedValue, { delay: 30 });
    logger.debug(`✅ Typed value: "${formattedValue}"`);

    // Step 4: DO NOT confirm with Enter or Tab!
    // Leave the value in the editor and let the Update button save it
    // This prevents DevExpress validation conflicts
    await this.wait(300); // Brief wait for typing to complete

    logger.debug(
      `✅ Field editing completed - value left in editor for Update button`,
    );
  }

  /**
   * Wait for DevExpress loading indicator to disappear
   * @param options - Configuration options
   */
  private async waitForDevExpressReady(options?: {
    timeout?: number;
  }): Promise<void> {
    const { timeout = 5000 } = options || {};

    try {
      await this.page!.waitForFunction(
        () => {
          const loadingIndicators = Array.from(
            document.querySelectorAll(
              '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
            ),
          );
          return loadingIndicators.every(
            (el) =>
              (el as HTMLElement).style.display === "none" ||
              (el as HTMLElement).offsetParent === null,
          );
        },
        { timeout, polling: 100 },
      );
    } catch {
      // Fallback: small wait if loading detection fails
      await this.wait(400);
    }
  }

  /**
   * Wait until DevExpress appears idle (no visible loading panels and no active callbacks).
   * This is callback-aware and more reliable than fixed sleeps on WebForms/XAF pages.
   */
  private async waitForDevExpressIdle(options?: {
    timeout?: number;
    stablePolls?: number;
    label?: string;
  }): Promise<void> {
    const { timeout = 6000, stablePolls = 2, label } = options || {};

    if (!this.page) return;

    try {
      await this.page.waitForFunction(
        (requiredStablePolls: number) => {
          const w = window as unknown as {
            ASPxClientControl?: {
              GetControlCollection?: () => {
                GetControls?: () => any[];
                GetControlsByType?: (type: any) => any[];
                GetControlsByPredicate?: (pred: (c: any) => boolean) => any[];
              };
            };
            ASPxClientGridView?: any;
            __codexDxIdleStableCount?: number;
          };

          const isElementVisible = (
            el: Element | null | undefined,
          ): boolean => {
            if (!el) return false;
            const node = el as HTMLElement;
            const style = window.getComputedStyle(node);
            if (style.display === "none") return false;
            if (style.visibility === "hidden") return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };

          const hasVisibleLoadingPanels = (): boolean => {
            const panels = Array.from(
              document.querySelectorAll(
                '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
              ),
            );
            return panels.some((panel) => isElementVisible(panel));
          };

          const getAllControls = (): any[] => {
            const collection =
              w.ASPxClientControl?.GetControlCollection?.() ?? null;
            if (!collection) return [];

            if (typeof collection.GetControls === "function") {
              try {
                return collection.GetControls() || [];
              } catch {
                // ignore
              }
            }

            if (
              typeof collection.GetControlsByType === "function" &&
              w.ASPxClientGridView
            ) {
              try {
                return collection.GetControlsByType(w.ASPxClientGridView) || [];
              } catch {
                // ignore
              }
            }

            if (typeof collection.GetControlsByPredicate === "function") {
              try {
                return (
                  collection.GetControlsByPredicate((c: any) => Boolean(c)) ||
                  []
                );
              } catch {
                // ignore
              }
            }

            return [];
          };

          const hasActiveCallbacks = (): boolean => {
            const controls = getAllControls();
            if (controls.length === 0) return false;

            const controlInCallback = (control: any): boolean => {
              try {
                if (typeof control.InCallback === "function") {
                  return Boolean(control.InCallback());
                }
              } catch {
                // ignore
              }
              return false;
            };

            for (const control of controls) {
              if (!control) continue;
              if (controlInCallback(control)) return true;

              // GridLookup and similar controls expose an embedded grid view.
              try {
                if (typeof control.GetGridView === "function") {
                  const grid = control.GetGridView();
                  if (grid && controlInCallback(grid)) return true;
                }
              } catch {
                // ignore
              }
            }

            return false;
          };

          const idleNow = !hasVisibleLoadingPanels() && !hasActiveCallbacks();

          if (idleNow) {
            w.__codexDxIdleStableCount = (w.__codexDxIdleStableCount || 0) + 1;
          } else {
            w.__codexDxIdleStableCount = 0;
          }

          return (w.__codexDxIdleStableCount || 0) >= requiredStablePolls;
        },
        { timeout, polling: 100 },
        stablePolls,
      );
    } catch {
      // Fallback: small stabilization wait when idle detection fails.
      await this.wait(600);
    }

    if (label) {
      logger.debug(`[DevExpressIdle] Completed idle wait: ${label}`, {
        timeout,
        stablePolls,
      });
    }
  }

  // ─── DevExpress Client-Side API Helpers ───────────────────────────────
  // These methods use the native DevExpress JavaScript API via page.evaluate()
  // instead of fragile CSS selector clicks. Discovered via control discovery script.

  private salesLinesGridName: string | null = null;

  private async discoverSalesLinesGrid(): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    const gridName = await this.page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return "";
      let found = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        if (
          c.name &&
          c.name.includes("dviSALESLINEs") &&
          typeof c.AddNewRow === "function"
        ) {
          found = c.name;
        }
      });
      return found;
    });

    if (!gridName) {
      logger.warn(
        "SALESLINEs grid not found via DevExpress API, will use DOM fallback",
      );
    } else {
      logger.info("SALESLINEs grid discovered via DevExpress API", {
        gridName,
      });
    }

    this.salesLinesGridName = gridName || null;
    return gridName;
  }

  private async waitForGridCallback(
    gridName: string,
    timeout = 15000,
  ): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForFunction(
        (name: string) => {
          const w = window as any;
          const grid =
            w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
          return grid && !grid.InCallback();
        },
        { polling: 100, timeout },
        gridName,
      );
    } catch {
      logger.warn("waitForGridCallback timed out, proceeding", {
        gridName,
        timeout,
      });
    }
  }

  private async gridAddNewRow(): Promise<boolean> {
    if (!this.page || !this.salesLinesGridName) return false;

    const gridName = this.salesLinesGridName;

    // Guard: wait for any pending callback to finish first
    await this.waitForGridCallback(gridName, 5000);

    await this.page.evaluate((name: string) => {
      const w = window as any;
      const grid =
        w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (grid) grid.AddNewRow();
    }, gridName);

    await this.waitForGridCallback(gridName);
    logger.debug("gridAddNewRow completed via API");
    return true;
  }

  private async gridUpdateEdit(): Promise<boolean> {
    if (!this.page || !this.salesLinesGridName) return false;

    const gridName = this.salesLinesGridName;

    // Guard: wait for any pending callback first
    await this.waitForGridCallback(gridName, 5000);

    await this.page.evaluate((name: string) => {
      const w = window as any;
      const grid =
        w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (grid) grid.UpdateEdit();
    }, gridName);

    await this.waitForGridCallback(gridName);
    logger.debug("gridUpdateEdit completed via API");
    return true;
  }

  private async getGridPageInfo(): Promise<{
    pageCount: number;
    pageIndex: number;
    visibleRows: number;
  }> {
    if (!this.page || !this.salesLinesGridName) {
      return { pageCount: 0, pageIndex: 0, visibleRows: 0 };
    }

    return await this.page.evaluate((name: string) => {
      const w = window as any;
      const grid =
        w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return { pageCount: 0, pageIndex: 0, visibleRows: 0 };
      return {
        pageCount: grid.GetPageCount?.() ?? 0,
        pageIndex: grid.GetPageIndex?.() ?? 0,
        visibleRows: grid.GetVisibleRowsOnPage?.() ?? 0,
      };
    }, this.salesLinesGridName);
  }

  private async gridGotoLastPage(): Promise<void> {
    if (!this.page || !this.salesLinesGridName) return;

    const gridName = this.salesLinesGridName;
    const info = await this.getGridPageInfo();

    if (info.pageCount > 1 && info.pageIndex < info.pageCount - 1) {
      logger.info("Grid paginated, navigating to last page", {
        currentPage: info.pageIndex + 1,
        totalPages: info.pageCount,
      });

      await this.page.evaluate(
        (name: string, lastPage: number) => {
          const w = window as any;
          const grid =
            w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
          if (grid) grid.GotoPage(lastPage);
        },
        gridName,
        info.pageCount - 1,
      );

      await this.waitForGridCallback(gridName);
      logger.debug("Navigated to last page");
    }
  }

  private async getSavedArticleCount(): Promise<number> {
    if (!this.page || !this.salesLinesGridName) return 0;
    const gridName = this.salesLinesGridName;

    return await this.page.evaluate((name: string) => {
      const w = window as any;
      const grid =
        w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
      if (!grid) return 0;

      const pageCount = grid.GetPageCount?.() ?? 1;
      const visibleOnPage = grid.GetVisibleRowsOnPage?.() ?? 0;

      if (pageCount <= 1) return visibleOnPage;

      const pageSize = grid.GetSettingsPageSize?.() ?? grid.pageSize ?? 20;
      return (pageCount - 1) * pageSize + visibleOnPage;
    }, gridName);
  }

  private async cleanupStaleDropdowns(): Promise<void> {
    if (!this.page) return;
    try {
      const stats = await this.page.evaluate(() => {
        let physicallyRemoved = 0;
        let hidden = 0;
        const selectors = ['.dxpcLite', '.dxpc-content', '[id*="_DDD"]'];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el) => {
            const htmlEl = el as HTMLElement;
            const insideEditRow =
              el.closest('tr[id*="editnew"]') || el.closest('tr[id*="newrow"]');
            if (insideEditRow) return;
            // offsetParent === null means invisible in layout — safe to remove entirely
            if (htmlEl.offsetParent === null) {
              el.remove();
              physicallyRemoved++;
            } else {
              htmlEl.style.display = 'none';
              hidden++;
            }
          });
        }
        return {
          physicallyRemoved,
          hidden,
          totalNodes: document.querySelectorAll('*').length,
        };
      });
      if (stats.physicallyRemoved > 0 || stats.hidden > 0) {
        logger.debug(
          `DOM cleanup: removed=${stats.physicallyRemoved} hidden=${stats.hidden} totalNodes=${stats.totalNodes}`,
        );
      }
    } catch {
      // Non-critical
    }
    // Force V8 GC to reclaim memory from removed nodes
    try {
      const session = await this.page.createCDPSession();
      await session.send('HeapProfiler.collectGarbage');
      await session.detach();
    } catch {
      // Non-critical
    }
  }

  /**
   * Identify the active (visible) DevExpress lookup/dropdown and capture a small snapshot.
   * This avoids reading rows from hidden or stale dropdowns after callbacks.
   */
  private async getActiveDevExpressLookupSnapshot(options?: {
    baseIdHint?: string | null;
    rowSampleLimit?: number;
  }): Promise<{
    containerId: string | null;
    rootId: string | null;
    rowCount: number;
    headerTexts: string[];
    rowSamples: string[][];
  }> {
    const { baseIdHint = null, rowSampleLimit = 5 } = options || {};

    if (!this.page) {
      return {
        containerId: null,
        rootId: null,
        rowCount: 0,
        headerTexts: [],
        rowSamples: [],
      };
    }

    return await this.page.evaluate(
      (hintBaseId: string | null, sampleLimit: number) => {
        const visibleDropdowns = Array.from(
          document.querySelectorAll('[id*="_DDD"]'),
        ).filter((node) => {
          const el = node as HTMLElement | null;
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none") return false;
          if (style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        const hintedDropdown =
          hintBaseId && hintBaseId.length > 0
            ? visibleDropdowns.find((node) =>
                (node as HTMLElement).id.includes(hintBaseId),
              ) || null
            : null;

        let activeContainer =
          hintedDropdown &&
          hintedDropdown.querySelector('tr[class*="dxgvDataRow"]')
            ? hintedDropdown
            : visibleDropdowns.find((node) =>
                node.querySelector('tr[class*="dxgvDataRow"]'),
              ) || null;

        if (!activeContainer) {
          const popupContainers = Array.from(
            document.querySelectorAll(".dxpcLite, .dxpc-content, .dxpcMainDiv"),
          ).filter((node) => {
            const el = node as HTMLElement | null;
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === "none") return false;
            if (style.visibility === "hidden") return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });

          const hintedPopup =
            hintBaseId && hintBaseId.length > 0
              ? popupContainers.find((node) =>
                  (node as HTMLElement).id.includes(hintBaseId),
                ) || null
              : null;

          activeContainer =
            hintedPopup && hintedPopup.querySelector('tr[class*="dxgvDataRow"]')
              ? hintedPopup
              : popupContainers.find((node) =>
                  node.querySelector('tr[class*="dxgvDataRow"]'),
                ) || null;
        }

        const root = activeContainer || document;

        const headerTexts: string[] = [];
        const headerTable = root.querySelector('table[id*="DXHeaderTable"]');
        let headerRow: Element | null = null;

        if (headerTable) {
          headerRow =
            headerTable.querySelector('tr[id*="DXHeadersRow"]') ||
            headerTable.querySelector("tr.dxgvHeaderRow") ||
            headerTable.querySelector('tr[class*="dxgvHeaderRow"]');
        }

        if (!headerRow) {
          headerRow =
            root.querySelector("tr.dxgvHeaderRow") ||
            root.querySelector('tr[class*="dxgvHeaderRow"]') ||
            root.querySelector('tr[id*="DXHeadersRow"]');
        }

        if (headerRow) {
          const headerCells = Array.from(headerRow.querySelectorAll("td, th"));
          for (const cell of headerCells) {
            const wrap = cell.querySelector(".dx-wrap");
            const text = (wrap?.textContent || cell.textContent || "").trim();
            headerTexts.push(text);
          }
        }

        const rows = Array.from(
          root.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((row) => {
          const el = row as HTMLElement | null;
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none") return false;
          if (style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        const rowSamples = rows.slice(0, sampleLimit).map((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          return cells.map((cell) => cell.textContent?.trim() || "");
        });

        return {
          containerId: activeContainer
            ? (activeContainer as HTMLElement).id || null
            : null,
          rootId:
            root instanceof HTMLElement
              ? root.id || null
              : activeContainer
                ? (activeContainer as HTMLElement).id || null
                : null,
          rowCount: rows.length,
          headerTexts,
          rowSamples,
        };
      },
      baseIdHint,
      rowSampleLimit,
    );
  }

  /**
   * Confirm that a lookup selection actually "stuck" by checking both input value
   * and (when possible) DevExpress client-side selection state.
   */
  private async confirmLookupSelection(options: {
    baseId?: string | null;
    expectedVariantId?: string | null;
    expectedVariantSuffix?: string | null;
    gridIdHint?: string | null;
  }): Promise<{
    confirmed: boolean;
    inputId: string | null;
    inputValue: string | null;
    selectedKeys: string[];
    focusedKey: string | null;
    stateKeys: string[];
    matchReason: string | null;
  }> {
    const {
      baseId = null,
      expectedVariantId = null,
      expectedVariantSuffix = null,
      gridIdHint = null,
    } = options;

    if (!this.page) {
      return {
        confirmed: false,
        inputId: null,
        inputValue: null,
        selectedKeys: [],
        focusedKey: null,
        stateKeys: [],
        matchReason: null,
      };
    }

    return await this.page.evaluate(
      (baseIdText, expectedId, expectedSuffix, gridIdText) => {
        const result = {
          confirmed: false,
          inputId: null as string | null,
          inputValue: null as string | null,
          selectedKeys: [] as string[],
          focusedKey: null as string | null,
          stateKeys: [] as string[],
          matchReason: null as string | null,
        };

        const expectedIdNorm = String(expectedId || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const expectedSuffixNorm = String(expectedSuffix || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

        const inputCandidates = Array.from(
          document.querySelectorAll("input[type='text']"),
        ) as HTMLInputElement[];

        const baseIdLower = String(baseIdText || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const input =
          inputCandidates.find((candidate) => {
            const idLower = String(candidate.id || "")
              .toLowerCase()
              .replace(/\s+/g, " ")
              .trim();
            if (!idLower) return false;
            if (baseIdLower && idLower.includes(baseIdLower)) return true;
            if (baseIdLower && idLower === `${baseIdLower}_i`) return true;
            return false;
          }) || null;

        if (input) {
          result.inputId = input.id || null;
          result.inputValue = input.value || "";
        }

        const stateInputId = gridIdText ? `${gridIdText}_State` : null;
        const stateInput = stateInputId
          ? (document.getElementById(stateInputId) as HTMLInputElement | null)
          : null;
        if (stateInput && stateInput.value) {
          try {
            const parsed = JSON.parse(stateInput.value);
            if (Array.isArray(parsed?.keys)) {
              result.stateKeys = parsed.keys.map((k: any) => String(k));
            }
            if (
              parsed?.focusedKey !== undefined &&
              parsed?.focusedKey !== null
            ) {
              result.focusedKey = String(parsed.focusedKey);
            }
          } catch {
            // ignore state parse issues
          }
        }

        const ASPx = (window as any).ASPxClientControl;
        if (ASPx?.GetControlCollection) {
          try {
            const collection = ASPx.GetControlCollection();
            const controls = collection?.GetControls?.() || [];
            for (const control of controls) {
              if (!control || typeof control.GetGridView !== "function")
                continue;
              const inputEl =
                typeof control.GetInputElement === "function"
                  ? control.GetInputElement()
                  : null;
              if (!inputEl) continue;
              const inputIdNorm = String(inputEl.id || "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
              if (baseIdLower && !inputIdNorm.includes(baseIdLower)) continue;

              const grid = control.GetGridView();
              if (!grid) continue;

              try {
                if (typeof grid.GetSelectedKeysOnPage === "function") {
                  const keys = grid.GetSelectedKeysOnPage() || [];
                  result.selectedKeys = keys.map((k: any) => String(k));
                }
              } catch {
                // ignore
              }

              try {
                if (
                  !result.focusedKey &&
                  typeof grid.GetFocusedRowKey === "function"
                ) {
                  const focused = grid.GetFocusedRowKey();
                  if (focused !== undefined && focused !== null) {
                    result.focusedKey = String(focused);
                  }
                }
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore client API issues
          }
        }

        const valueNorm = String(result.inputValue || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        let inputMatchReason: string | null = null;
        if (valueNorm) {
          if (expectedIdNorm && valueNorm.includes(expectedIdNorm)) {
            inputMatchReason = "input-variant-id";
          } else if (
            expectedSuffixNorm &&
            valueNorm.includes(expectedSuffixNorm)
          ) {
            inputMatchReason = "input-variant-suffix";
          }
        }

        let selectedKeysMatch = false;
        if (expectedIdNorm) {
          for (const key of result.selectedKeys) {
            const keyNorm = String(key || "")
              .toLowerCase()
              .replace(/\s+/g, " ")
              .trim();
            if (keyNorm === expectedIdNorm) {
              selectedKeysMatch = true;
              break;
            }
          }
        }

        let stateKeysMatch = false;
        if (expectedIdNorm) {
          for (const key of result.stateKeys) {
            const keyNorm = String(key || "")
              .toLowerCase()
              .replace(/\s+/g, " ")
              .trim();
            if (keyNorm === expectedIdNorm) {
              stateKeysMatch = true;
              break;
            }
          }
        }

        let focusedMatch = false;
        if (expectedIdNorm && result.focusedKey) {
          const focusedNorm = String(result.focusedKey || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          focusedMatch = focusedNorm === expectedIdNorm;
        }

        if (inputMatchReason) {
          result.confirmed = true;
          result.matchReason = inputMatchReason;
        } else if (selectedKeysMatch) {
          result.confirmed = true;
          result.matchReason = "client-selected-keys";
        } else if (stateKeysMatch) {
          result.confirmed = true;
          result.matchReason = "state-keys";
        } else if (focusedMatch) {
          result.confirmed = true;
          result.matchReason = "focused-key";
        }

        return result;
      },
      baseId,
      expectedVariantId,
      expectedVariantSuffix,
      gridIdHint,
    );
  }

  /**
   * Click a DevExpress grid command button using stable `data-args` selectors first.
   * Falls back to ID hints only when needed.
   */
  private async clickDevExpressGridCommand(options: {
    command: "AddNew" | "UpdateEdit" | "NewEdit";
    baseIdHint?: string | null;
    timeout?: number;
    label?: string;
  }): Promise<{
    clicked: boolean;
    strategy: string;
    id: string | null;
    reason: string | null;
  }> {
    const { command, baseIdHint = null, timeout = 4000, label } = options;

    if (!this.page) {
      return { clicked: false, strategy: "no-page", id: null, reason: null };
    }

    const result = await this.page.evaluate(
      (cmd: string, baseHint: string | null) => {
        const candidates = Array.from(
          document.querySelectorAll(`a[data-args*="${cmd}"]`),
        ).filter((node) => {
          const el = node as HTMLElement | null;
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none") return false;
          if (style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }) as HTMLElement[];

        if (candidates.length === 0) {
          return {
            clicked: false,
            strategy: "data-args-none",
            id: null,
            reason: null,
          };
        }

        const hinted =
          baseHint && baseHint.length > 0
            ? candidates.find((node) => (node.id || "").includes(baseHint)) ||
              null
            : null;

        const target = hinted || candidates[0];

        target.scrollIntoView({ block: "center", inline: "center" });
        const start = Date.now();
        while (Date.now() - start < 120) {
          // brief sync wait for scroll stabilization
        }
        target.click();

        return {
          clicked: true,
          strategy: hinted ? "data-args-hinted" : "data-args-first",
          id: target.id || null,
          reason: hinted ? "hint-match" : "first-visible",
        };
      },
      command,
      baseIdHint,
    );

    if (result.clicked) {
      await this.waitForDevExpressIdle({
        timeout,
        label: label || `grid-command-${command}`,
      });
    }

    if (label) {
      logger.debug(`[GridCommand] ${label}`, {
        command,
        baseIdHint,
        ...result,
      });
    }

    return result;
  }

  async writeOperationReport(filePath?: string): Promise<string> {
    const report = this.buildEnhancedReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fs = await import("fs/promises");
    const path = await import("path");
    const cwd = process.cwd();

    const exists = async (candidate: string): Promise<boolean> => {
      try {
        await fs.access(candidate);
        return true;
      } catch {
        return false;
      }
    };

    let baseLogsDir = path.resolve(cwd, "logs");
    if (await exists(path.resolve(cwd, "backend"))) {
      baseLogsDir = path.resolve(cwd, "backend", "logs");
    }

    const defaultPath = path.join(
      baseLogsDir,
      `operation-report-${timestamp}.md`,
    );
    const targetPath = filePath ?? defaultPath;
    const resolvedPath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(cwd, targetPath);

    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, report, "utf8");
    return resolvedPath;
  }

  async initialize(): Promise<void> {
    if (this.userId) {
      // Multi-user mode: acquire context from pool
      logger.info(`Inizializzazione bot per user ${this.userId}`);

      if (!this._browserPool) throw new Error('BrowserPool not provided. Pass browserPool in constructor deps.');
      this.context = await this.runOp(
        "browserPool.acquireContext",
        async () => {
          return this._browserPool!.acquireContext(this.userId!);
        },
        "login",
      );

      // Close orphan pages from previous operations to avoid ASP.NET session conflicts
      const existingPages = await this.context!.pages();
      for (const p of existingPages) {
        if (!p.isClosed()) {
          await p.close().catch(() => {});
        }
      }

      this.page = await this.runOp(
        "context.newPage",
        async () => {
          return this.context!.newPage();
        },
        "login",
      );

      // Set viewport to match Archibald UI requirements (same as legacy mode)
      await this.runOp(
        "page.setViewport",
        async () => {
          await this.page!.setViewport({ width: 1280, height: 800 });
        },
        "login",
      );

      // Force Italian locale so Archibald renders UI in Italian (server is in Germany)
      await this.page!.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      });

      logger.info(
        `Bot inizializzato per user ${this.userId} (multi-user mode)`,
      );
    } else {
      // Legacy single-user mode (for backwards compatibility)
      logger.info(
        "Inizializzazione browser Puppeteer (legacy single-user mode)...",
      );

      this.browser = await this.runOp(
        "browser.launch",
        async () => {
          return puppeteer.launch({
            headless: config.puppeteer.headless,
            slowMo: config.puppeteer.slowMo,
            protocolTimeout: config.puppeteer.protocolTimeout,
            args: [...config.puppeteer.args],
            defaultViewport: {
              width: 1280,
              height: 800,
            },
          });
        },
        "login",
      );

      this.page = await this.runOp(
        "browser.newPage",
        async () => {
          return this.browser!.newPage();
        },
        "login",
      );

      logger.info("Browser inizializzato con successo (legacy mode)");
    }

    // Abilita console logging dal browser per debug
    this.page!.on("console", (msg) => {
      const text = msg.text();
      if (text) {
        logger.debug(`[Browser Console] ${text}`);
      }
    });

    // Ignora errori certificato SSL
    await this.runOp(
      "page.setRequestInterception",
      async () => {
        await this.page!.setRequestInterception(false);
      },
      "login",
    );
  }

  /**
   * Initialize dedicated browser (legacy mode) with multi-user credentials
   * This method creates a dedicated browser instance using legacy mode
   * but with credentials from password cache (multi-user system)
   */
  async initializeDedicatedBrowser(): Promise<void> {
    logger.info(`🔧 Initializing dedicated browser for user ${this.userId}...`);

    // Create dedicated browser (same as legacy mode)
    this.browser = await this.runOp(
      "browser.launch",
      async () => {
        return puppeteer.launch({
          headless: config.puppeteer.headless,
          slowMo: config.puppeteer.slowMo,
          protocolTimeout: config.puppeteer.protocolTimeout,
          args: [...config.puppeteer.args],
          defaultViewport: {
            width: 1280,
            height: 800,
          },
        });
      },
      "login",
    );

    this.page = await this.runOp(
      "browser.newPage",
      async () => {
        return this.browser!.newPage();
      },
      "login",
    );

    // Enable console logging
    this.page!.on("console", (msg) => {
      const text = msg.text();
      if (text) {
        logger.debug(`[Browser Console] ${text}`);
      }
    });

    await this.runOp(
      "page.setRequestInterception",
      async () => {
        await this.page!.setRequestInterception(false);
      },
      "login",
    );

    logger.info(`✅ Dedicated browser initialized for user ${this.userId}`);

    // Now perform login with password cache credentials
    await this.login();
  }

  async login(): Promise<void> {
    if (!this.page) throw new Error("Browser non inizializzato");

    // Get credentials: use PasswordCache for multi-user, config for legacy
    let username: string;
    let password: string;

    if (this.userId) {
      // Multi-user mode: get password from cache
      const cachedPassword = PasswordCache.getInstance().get(this.userId);
      if (!cachedPassword) {
        throw new Error(
          `Password not found in cache for user ${this.userId}. User must login again.`,
        );
      }
      if (!this._getUserById) throw new Error('getUserById not provided. Pass getUserById in constructor deps.');
      const user = await this._getUserById(this.userId);
      if (!user) {
        throw new Error(`User ${this.userId} not found in database`);
      }
      username = user.username;
      password = cachedPassword;
      logger.info(`Using cached credentials for multi-user login`, {
        userId: this.userId,
        username,
      });
    } else {
      // Legacy mode: use config
      username = config.archibald.username;
      password = config.archibald.password;
      logger.info(`Using config credentials for legacy login`, { username });
    }

    // Try to restore session from persistent cache (daily expiration)
    let cachedCookies: any[] | null = null;

    if (this.legacySessionCache) {
      // Legacy mode: load single-user session
      cachedCookies = this.legacySessionCache.loadSession();
    }

    if (cachedCookies && cachedCookies.length > 0) {
      logger.info("Attempting to restore session from persistent cache...");
      try {
        await this.page.setCookie(...cachedCookies);
        await this.page.goto(`${config.archibald.url}/Default.aspx`, {
          waitUntil: "networkidle2",
          timeout: 10000,
        });

        // Verify we're still logged in
        const currentUrl = this.page.url();
        if (!currentUrl.includes("Login.aspx")) {
          logger.info("✅ Session restored successfully from persistent cache");
          return;
        }

        logger.info(
          "Session expired, clearing cache and performing fresh login",
        );

        if (this.legacySessionCache) {
          this.legacySessionCache.clearSession();
        }
      } catch (error) {
        logger.warn(
          "Failed to restore session from cache, performing fresh login",
          {
            error,
          },
        );

        if (this.legacySessionCache) {
          this.legacySessionCache.clearSession();
        }
      }
    }

    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;

    logger.info("Tentativo login su Archibald...", {
      loginUrl,
      username,
    });

    try {
      logger.debug(`Navigazione verso: ${loginUrl}`);

      const response = await this.runOp(
        "login.goto",
        async () => {
          return this.page!.goto(loginUrl, {
            waitUntil: "networkidle2",
            timeout: config.puppeteer.timeout,
          });
        },
        "login",
        { url: loginUrl },
      );

      if (!response) {
        throw new Error("Nessuna risposta dal server");
      }

      if (response.status() !== 200) {
        throw new Error(
          `Errore HTTP ${response.status()}: ${response.statusText()}`,
        );
      }

      // Step 1: Find login fields
      const fields = await this.page!.evaluate(() => {
        const textInputs = Array.from(
          document.querySelectorAll('input[type="text"]'),
        ) as HTMLInputElement[];
        const userInput =
          textInputs.find(
            (i) =>
              i.id.includes("UserName") ||
              i.name.includes("UserName") ||
              i.placeholder?.toLowerCase().includes("account") ||
              i.placeholder?.toLowerCase().includes("username"),
          ) || textInputs[0];

        const passInput = document.querySelector(
          'input[type="password"]',
        ) as HTMLInputElement | null;

        if (!userInput || !passInput) return null;
        return { userFieldId: userInput.id, passFieldId: passInput.id };
      });

      if (!fields) {
        await this.page.screenshot({ path: "logs/login-error.png" });
        throw new Error("Campi login non trovati nella pagina");
      }

      // Step 2: Fill username (like setDevExpressField)
      await this.page!.evaluate(
        (fieldId: string, val: string) => {
          const input = document.getElementById(fieldId) as HTMLInputElement;
          if (!input) return;
          input.scrollIntoView({ block: "center" });
          input.focus();
          input.click();
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          if (setter) setter.call(input, val);
          else input.value = val;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        fields.userFieldId,
        username,
      );
      await this.page!.keyboard.press("Tab");
      await this.waitForDevExpressIdle({ timeout: 3000, label: "login-user" });

      // Step 3: Fill password (like setDevExpressField)
      await this.page!.evaluate(
        (fieldId: string, val: string) => {
          const input = document.getElementById(fieldId) as HTMLInputElement;
          if (!input) return;
          input.scrollIntoView({ block: "center" });
          input.focus();
          input.click();
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          if (setter) setter.call(input, val);
          else input.value = val;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        fields.passFieldId,
        password,
      );
      await this.page!.keyboard.press("Tab");
      await this.waitForDevExpressIdle({ timeout: 3000, label: "login-pass" });

      // Step 4: Click login button
      const fillResult = await this.page!.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll(
            "button, input[type='submit'], a, div[role='button']",
          ),
        );
        // Priority 1: match by text content (most reliable)
        const byText = buttons.find((btn) => {
          const text = (btn.textContent || "")
            .toLowerCase()
            .replace(/\s+/g, "");
          return text.includes("accedi") || text === "login";
        });
        // Priority 2: match by id (fallback, skip logo links)
        const byId =
          !byText &&
          buttons.find((btn) => {
            const el = btn as HTMLElement;
            const id = (el.id || "").toLowerCase();
            if (id.includes("logo")) return false;
            return id.includes("login") || id.includes("logon");
          });
        const loginBtn = byText || byId || null;
        if (loginBtn) {
          (loginBtn as HTMLElement).click();
          return {
            ok: true,
            error: null,
            buttonId: (loginBtn as HTMLElement).id,
            buttonText: loginBtn.textContent,
          };
        }
        return {
          ok: false,
          error: "login-button-not-found",
          buttonId: null,
          buttonText: null,
        };
      });

      if (!fillResult.ok) {
        await this.page.screenshot({ path: "logs/login-error.png" });
        throw new Error("Bottone login non trovato nella pagina");
      }

      logger.debug("Credenziali inserite e login inviato", {
        buttonId: fillResult.buttonId,
        buttonText: fillResult.buttonText,
      });

      // Attendi redirect dopo login
      await this.runOp(
        "login.waitRedirect",
        async () => {
          await this.page!.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: config.puppeteer.timeout,
          });
        },
        "login",
      );

      const currentUrl = this.page.url();
      const urlPath = new URL(currentUrl).pathname;

      if (!urlPath.includes("Login.aspx")) {
        logger.info("Login riuscito!", { url: currentUrl });

        // Save session cookies to persistent cache
        const cookies = await this.page.cookies();
        logger.info("Cookies after login", {
          cookieNames: cookies.map((c) => c.name),
          cookieDetails: cookies.map((c) => ({
            name: c.name,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            session: c.session,
            expires: c.expires,
          })),
        });
        // Map cookies to Protocol.Network.Cookie format (use type assertion to handle version mismatch)
        const protocolCookies = cookies as any;

        if (this.legacySessionCache) {
          this.legacySessionCache.saveSession(protocolCookies);
        }
      } else {
        const loginPageError = await this.page.evaluate(() => {
          const errorEl = document.querySelector(
            ".dxeErrorCell, .error, .validation-summary-errors, [class*='error']",
          );
          return (
            errorEl?.textContent?.trim() ||
            document.body?.innerText?.substring(0, 300)
          );
        });
        logger.error("Login fallito - pagina di login ancora visibile", {
          url: currentUrl,
          urlPath,
          pageContent: loginPageError,
        });
        throw new Error(
          `Login fallito: ancora sulla pagina di login. ${loginPageError ? `Dettaglio: ${loginPageError.substring(0, 100)}` : ""}`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      const errorStack = error instanceof Error ? error.stack : "";

      logger.error("Errore durante login", {
        message: errorMessage,
        stack: errorStack,
        url: this.page?.url(),
      });

      // Salva screenshot anche in caso di altri errori
      try {
        if (this.page) {
          await this.page.screenshot({ path: "logs/login-error-final.png" });
          logger.error(
            "Screenshot errore salvato in logs/login-error-final.png",
          );
        }
      } catch (screenshotError) {
        logger.error("Impossibile salvare screenshot", { screenshotError });
      }

      throw new Error(`Login fallito: ${errorMessage}`);
    }
  }

  /**
   * Test login with provided credentials (used for authentication validation)
   * @param username - Archibald username
   * @param password - Archibald password
   * @returns true if login successful, false otherwise
   *
   * SECURITY: This method does NOT store credentials. It only validates them against Archibald.
   */
  async loginWithCredentials(
    username: string,
    password: string,
  ): Promise<boolean> {
    if (!this.page) throw new Error("Browser non inizializzato");

    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;

    logger.info("Testing credentials for user", { username });

    try {
      // Navigate to login page
      const response = await this.page.goto(loginUrl, {
        waitUntil: "networkidle2",
        timeout: config.puppeteer.timeout,
      });

      if (!response || response.status() !== 200) {
        logger.warn("Login page not accessible", {
          status: response?.status(),
        });
        return false;
      }

      // Wait for page to load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Find username field
      const usernameField = await this.page.evaluate(() => {
        const inputs = Array.from(
          document.querySelectorAll('input[type="text"]'),
        ) as HTMLInputElement[];
        const userInput = inputs.find(
          (input) =>
            input.id.includes("UserName") ||
            input.name.includes("UserName") ||
            input.placeholder?.toLowerCase().includes("account") ||
            input.placeholder?.toLowerCase().includes("username"),
        );
        if (userInput) {
          return userInput.id || userInput.name;
        }
        if (inputs.length > 0) {
          return inputs[0].id || inputs[0].name;
        }
        return null;
      });

      // Find password field
      const passwordField = await this.page.evaluate(() => {
        const inputs = Array.from(
          document.querySelectorAll('input[type="password"]'),
        );
        if (inputs.length > 0) {
          return (
            (inputs[0] as HTMLInputElement).id ||
            (inputs[0] as HTMLInputElement).name
          );
        }
        return null;
      });

      if (!usernameField || !passwordField) {
        logger.warn("Login fields not found");
        return false;
      }

      // Fill username
      const usernameSelector = `#${usernameField}`;
      await this.page.click(usernameSelector, { clickCount: 3 });
      await this.page.keyboard.press("Backspace");
      await this.page.type(usernameSelector, username, { delay: 50 });

      // Fill password
      const passwordSelector = `#${passwordField}`;
      await this.page.click(passwordSelector, { clickCount: 3 });
      await this.page.keyboard.press("Backspace");
      await this.page.type(passwordSelector, password, { delay: 50 });

      // Click login button
      const loginButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll('button, input[type="submit"], a'),
        );
        const loginBtn = buttons.find(
          (btn) =>
            btn.textContent?.toLowerCase().includes("accedi") ||
            btn.textContent?.toLowerCase().includes("login") ||
            (btn as HTMLElement).id?.toLowerCase().includes("login"),
        );
        if (loginBtn) {
          (loginBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!loginButtonClicked) {
        // Fallback: press Enter
        await this.page.keyboard.press("Enter");
      }

      // Wait for navigation
      await this.page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: config.puppeteer.timeout,
      });

      const currentUrl = this.page.url();

      // Check if login was successful (redirected away from Login.aspx)
      if (
        currentUrl.includes("Default.aspx") ||
        !currentUrl.includes("Login.aspx")
      ) {
        logger.info("Credentials validated successfully", { username });
        return true;
      } else {
        logger.warn("Invalid credentials - still on login page", { username });
        return false;
      }
    } catch (error) {
      logger.error("Error during credential validation", { error, username });
      return false;
    }
  }

  private async fillDevExpressFieldById(fieldIdPattern: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Browser non inizializzato');

    // After form saves, DevExpress needs real Puppeteer mouse events to activate fields.
    // Synthetic DOM clicks (el.click()) don't trigger DevExpress's editor activation.
    // Step 1: scroll into view
    const scrolled = await this.page.evaluate((pattern: string) => {
      const all = Array.from(document.querySelectorAll('input, textarea'));
      const el = all.find(e =>
        e.id.toUpperCase().includes(pattern.toUpperCase()) &&
        (e as HTMLInputElement).type !== 'hidden' &&
        (e as HTMLElement).getBoundingClientRect().width > 0,
      ) as HTMLElement | null;
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      return el.id;
    }, fieldIdPattern);

    if (!scrolled) {
      logger.warn(`DevExpress field with pattern "${fieldIdPattern}" not found in DOM`);
      return;
    }

    // Wait for scroll to settle, then get fresh coordinates
    await this.wait(300);

    const fieldInfo = await this.page.evaluate((id: string) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id };
    }, scrolled);

    if (!fieldInfo) {
      logger.warn(`DevExpress field "${scrolled}" disappeared after scroll`);
      return;
    }

    logger.info(`Clicking note field "${fieldIdPattern}" (id=${fieldInfo.id}) at (${Math.round(fieldInfo.x)}, ${Math.round(fieldInfo.y)})`);

    // Real Puppeteer mouse click to activate DevExpress editor
    await this.page.mouse.click(fieldInfo.x, fieldInfo.y);
    await this.wait(500);

    // Force focus + select on the actual input/textarea element.
    // For small INPUT fields (63x14px), the mouse click may activate a DevExpress
    // wrapper instead of the actual input, so keyboard.type would type into nothing.
    await this.page.evaluate((id: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }, fieldInfo.id);
    await this.wait(100);

    // Type value using real keyboard events
    await this.page.keyboard.type(value, { delay: 0 });
    await this.wait(300);

    // Do NOT call waitForDevExpressIdle here — it triggers/waits for callbacks
    // that regenerate the DOM, destroying other note fields.
    // Debug script confirmed: all 3 fields fill successfully WITHOUT idle waits.

    // Verify the value was actually set
    const verifiedValue = await this.page.evaluate((id: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      return el?.value ?? null;
    }, fieldInfo.id);
    logger.info(`Filled note field "${fieldIdPattern}" — verified value: "${verifiedValue?.substring(0, 50)}"`);

  }

  private async fillOrderNotes(notesText: string): Promise<void> {
    if (!this.page) throw new Error('Browser non inizializzato');

    logger.info('Filling order notes fields', { notesText });

    // After N/A workaround we're on "Prezzi e sconti" tab.
    // Click Panoramica/Overview tab to access the note fields.
    // The tab is the first tab (pg_T0) — click via dxtc-link.
    await this.waitForDevExpressIdle({ timeout: 15000, label: 'pre-notes-tab' });

    const tabClicked = await this.page!.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));
      for (const el of allLinks) {
        const text = (el.textContent || '').trim();
        if (text === 'Panoramica' || text === 'Overview') {
          const clickTarget = el.tagName === 'A' ? el : el.parentElement;
          if (clickTarget && (clickTarget as HTMLElement).offsetParent !== null) {
            (clickTarget as HTMLElement).click();
            return text;
          }
        }
      }
      return null;
    });
    if (tabClicked) {
      logger.info(`Clicked "${tabClicked}" tab for order notes`);
    }
    await this.waitForDevExpressIdle({ timeout: 10000, label: 'notes-tab-switch' });

    // After the N/A workaround's double save, the Panoramica tab fields may take
    // extra time to render. Poll until at least one note field appears in the DOM.
    let noteFieldIds: { id: string; tag: string; w: number }[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      noteFieldIds = await this.page!.evaluate(() => {
        const all = Array.from(document.querySelectorAll('input, textarea'));
        return all
          .filter(e => {
            const id = e.id.toUpperCase();
            return (id.includes('PURCHORDERFORMNUM') || id.includes('TEXTEXTERNAL') || id.includes('TEXTINTERNAL'))
              && (e as HTMLInputElement).type !== 'hidden'
              && (e as HTMLElement).getBoundingClientRect().width > 0;
          })
          .map(e => ({ id: e.id, tag: e.tagName, w: Math.round((e as HTMLElement).getBoundingClientRect().width) }));
      });
      if (noteFieldIds.length > 0) break;
      logger.info(`Note fields not yet in DOM, retrying (${attempt + 1}/10)...`);
      await this.wait(1000);
      // Re-click tab in case the first click didn't stick after form save
      if (attempt === 2 || attempt === 5) {
        await this.page!.evaluate(() => {
          const allLinks = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));
          for (const el of allLinks) {
            const text = (el.textContent || '').trim();
            if (text === 'Panoramica' || text === 'Overview') {
              const clickTarget = el.tagName === 'A' ? el : el.parentElement;
              if (clickTarget && (clickTarget as HTMLElement).offsetParent !== null) {
                (clickTarget as HTMLElement).click();
                return;
              }
            }
          }
        });
        await this.waitForDevExpressIdle({ timeout: 5000, label: 'notes-tab-retry' });
      }
    }
    logger.info('Note fields found in DOM', { noteFieldIds, count: noteFieldIds.length });

    // Use broad patterns: match any visible input/textarea containing the field name
    const targetFields = [
      { name: 'DESCRIZIONE', pattern: 'PURCHORDERFORMNUM' },
      { name: 'TESTO_ORDINE_ESTERNO', pattern: 'TEXTEXTERNAL' },
      { name: 'TESTO_ORDINE_INTERNO', pattern: 'TEXTINTERNAL' },
    ];

    for (const field of targetFields) {
      await this.runOp(`order.notes.fill_${field.name.toLowerCase()}`, async () => {
        await this.fillDevExpressFieldById(field.pattern, notesText);
      }, 'form.notes');
    }

    // Press Tab once after ALL fields are filled to confirm the last field's value.
    // Pressing Tab between fields triggers DevExpress callbacks that regenerate the DOM.
    await this.page!.keyboard.press('Tab');
    await this.waitForDevExpressIdle({ timeout: 5000, label: 'notes-final-tab' });

    logger.info('Order notes fields filled successfully');
  }

  private async selectDeliveryAddress(address: CustomerAddress): Promise<void> {
    if (!this.page) return;
    const via = address.via?.trim() ?? '';
    if (!via) {
      logger.warn('selectDeliveryAddress: via is empty, skipping');
      return;
    }

    // Phase 1: Wait for pending AJAX, then find field + dropdown button.
    // Mirrors the customer-selection flow (PROFILO CLIENTE) exactly.
    await this.waitForDevExpressIdle({ label: 'delivery-address-pre' });

    const fieldInfo = await this.page.evaluate(() => {
      const input = document.querySelector('[id$="DELIVERYPOSTALADDRESS_Edit_I"]') as HTMLInputElement | null;
      if (!input) return null;
      const baseId = input.id.replace(/_I$/, '');
      for (const btnId of [`${baseId}_B-1`, `${baseId}_B-1Img`, `${baseId}_B`]) {
        const btn = document.getElementById(btnId);
        if (btn && btn.offsetParent !== null) return { baseId, btnSelector: `#${btnId}` };
      }
      return { baseId, btnSelector: null };
    });

    if (!fieldInfo) {
      logger.warn('selectDeliveryAddress: field not found');
      return;
    }
    if (!fieldInfo.btnSelector) {
      logger.warn('selectDeliveryAddress: dropdown button not found', { baseId: fieldInfo.baseId });
      return;
    }

    // Phase 2: Click the dropdown button (same as customer: page.click on the button).
    await this.page.click(fieldInfo.btnSelector);

    // Phase 3: Wait for popup search input to be visible.
    const searchSelector = `[id*="${fieldInfo.baseId}_DDD_gv_DXSE_I"]`;
    try {
      await this.page.waitForFunction(
        (sel: string) => {
          const input = document.querySelector(sel) as HTMLInputElement | null;
          return input !== null && input.offsetParent !== null && !input.disabled;
        },
        { timeout: 5000, polling: 50 },
        searchSelector,
      );
    } catch {
      logger.warn('selectDeliveryAddress: search input not found in popup');
      return;
    }

    // Phase 4: Set value via property setter + dispatch events — identical to
    // the customer-selection paste technique (triggers DevExpress input handlers).
    await this.page.evaluate((sel: string, value: string) => {
      const input = document.querySelector(sel) as HTMLInputElement | null;
      if (!input) return;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }, searchSelector, via);

    // Phase 5: Wait for filtered rows (same InCallback-aware check as customer).
    await this.page.waitForFunction(
      (baseId: string) => {
        const w = window as any;
        const collection = w.ASPxClientControl?.GetControlCollection?.() ?? null;
        if (collection) {
          let inCallback = false;
          try {
            if (typeof collection.ForEachControl === 'function') {
              collection.ForEachControl((c: any) => {
                if (c?.name?.includes(baseId) && typeof c.InCallback === 'function' && c.InCallback()) inCallback = true;
                if (typeof c?.GetGridView === 'function') {
                  const gv = c.GetGridView();
                  if (gv && typeof gv.InCallback === 'function' && gv.InCallback()) inCallback = true;
                }
              });
            }
          } catch { /* ignore */ }
          if (inCallback) return false;
        }
        const container =
          Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite'))
            .filter(n => { const e = n as HTMLElement; return e.offsetParent !== null && e.getBoundingClientRect().width > 0; })
            .find(c => (c as HTMLElement).id.includes(baseId) && c.querySelector('tr[class*="dxgvDataRow"]')) ??
          Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite'))
            .find(c => c.querySelector('tr[class*="dxgvDataRow"]'));
        if (!container) return false;
        return Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]')).some(r => (r as HTMLElement).offsetParent !== null);
      },
      { timeout: 8000, polling: 100 },
      fieldInfo.baseId,
    ).catch(() => { /* no rows — auto-select check below */ });

    // Phase 6: Get row center coordinates, then click via CDP mouse events.
    // CDP click (page.mouse.click) triggers the full browser event pipeline including
    // the DevExpress RowClick → server postback that persists the address selection.
    // Synthetic target.click() inside evaluate only updates the DOM client-side and does
    // NOT trigger the server postback needed for DELIVERYPOSTALADDRESS to be saved.
    const rowCoords = await this.page.evaluate((baseId: string) => {
      const visible = (n: Element) => (n as HTMLElement).offsetParent !== null;
      const candidates = Array.from(document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpcMainDiv'))
        .filter(n => visible(n) && (n as HTMLElement).getBoundingClientRect().width > 0);
      const container =
        candidates.find(c => (c as HTMLElement).id.includes(baseId) && c.querySelector('tr[class*="dxgvDataRow"]')) ||
        candidates.find(c => c.querySelector('tr[class*="dxgvDataRow"]')) ||
        null;
      if (!container) return null;
      const rows = Array.from(container.querySelectorAll('tr[class*="dxgvDataRow"]')).filter(visible);
      if (rows.length === 0) return null;
      const target = (rows[0].querySelector('td') ?? rows[0]) as HTMLElement;
      target.scrollIntoView({ block: 'center' });
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rowsCount: rows.length };
    }, fieldInfo.baseId);

    if (!rowCoords) {
      const inputValue = await this.page.evaluate(
        () => (document.querySelector('[id$="DELIVERYPOSTALADDRESS_Edit_I"]') as HTMLInputElement | null)?.value ?? '',
      );
      if (inputValue && inputValue !== 'N/A') {
        logger.info('selectDeliveryAddress: auto-selected by DevExpress', { inputValue });
      } else {
        logger.warn('selectDeliveryAddress: no rows found after search', { via, cap: address.cap, citta: address.citta });
      }
      return;
    }

    await this.page.mouse.click(rowCoords.x, rowCoords.y);

    // Phase 7: Wait for popup close AND DLVADDRESS to update with the new address.
    // The DLVADDRESS update is the semantic confirmation that the server postback completed.
    const viaPrefix = via.substring(0, 15);
    await Promise.all([
      this.page.waitForFunction(
        () => Array.from(document.querySelectorAll('[id*="_DDD_PW"]'))
          .every(p => (p as HTMLElement).offsetParent === null || (p as HTMLElement).style.display === 'none'),
        { timeout: 5000, polling: 100 },
      ).catch(() => { /* proceed if popup close times out */ }),
      this.page.waitForFunction(
        (prefix: string) => {
          const el = document.querySelector('[id$="DLVADDRESS_Edit_I"]') as HTMLInputElement | null;
          return el !== null && el.value.includes(prefix);
        },
        { timeout: 15000, polling: 200 },
        viaPrefix,
      ).catch(() => {
        logger.warn('selectDeliveryAddress: DLVADDRESS did not update — postback may not have completed', { via });
      }),
    ]);

    await this.waitForDevExpressIdle({ label: 'delivery-address-select', timeout: 10000 });
  }

  /**
   * Create a new order in Archibald
   * @param orderData - Order data with customer and items
   * @param slowdownConfig - Optional per-step slowdown configuration (milliseconds). Defaults to 200ms for all steps.
   * @returns Order ID
   */
  async createOrder(
    orderData: SubmitOrderData,
    slowdownConfig?: SlowdownConfig,
  ): Promise<string> {
    if (!this.page) throw new Error("Browser non inizializzato");

    // Store slowdown config for use in wait calls
    this.slowdownConfig = slowdownConfig || {};

    // Sanitize customer name: PDF sync may introduce newlines from line wraps
    orderData.customerName = orderData.customerName
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    logger.info("🤖 BOT: INIZIO creazione ordine", {
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      items: orderData.items.map((item) => ({
        name: item.articleCode,
        qty: item.quantity,
        discount: item.discount,
      })),
      globalDiscount: orderData.discountPercent,
      slowdownConfig:
        Object.keys(this.slowdownConfig).length > 0
          ? this.slowdownConfig
          : "default (200ms)",
    });

    let orderId = "";

    try {
      // STEP 1: Go to Orders list (direct URL first, then menu fallback)
      await this.runOp(
        "order.menu.ordini",
        async () => {
          const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
          const waitForOrdersList = async (timeoutMs = 10000) => {
            await this.page!.waitForFunction(
              () => {
                const elements = Array.from(
                  document.querySelectorAll("span, button, a"),
                );
                return elements.some((el) => {
                  const text = el.textContent?.trim().toLowerCase() ?? "";
                  return text === "nuovo" || text === "new";
                });
              },
              { timeout: timeoutMs },
            );
          };

          if (!this.page!.url().includes("SALESTABLE_ListView_Agent")) {
            try {
              logger.debug("Navigating to orders list via direct URL...");
              await this.page!.goto(ordersUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });
              await waitForOrdersList();
              await this.wait(this.getSlowdown("click_ordini"));
              logger.info("✅ Navigated to orders list via direct URL");
              return;
            } catch (error) {
              const currentUrl = this.page!.url();
              const title = await this.page!.title().catch(() => "unknown");
              logger.warn(
                "Direct navigation to orders list failed, falling back to menu",
                {
                  error: error instanceof Error ? error.message : String(error),
                  currentUrl,
                  pageTitle: title,
                  isLoginPage: currentUrl.includes("Login.aspx"),
                },
              );
            }
          }

          logger.debug('Clicking "Ordini" menu item...');

          let clicked = false;

          try {
            await this.page!.waitForSelector(
              'a[href*="/Archibald/SALESTABLE_ListView_Agent/"]',
              { timeout: 6000 },
            );
            clicked = await this.page!.evaluate(() => {
              const link = document.querySelector(
                'a[href*="/Archibald/SALESTABLE_ListView_Agent/"]',
              ) as HTMLElement | null;
              if (!link) return false;
              link.click();
              return true;
            });
          } catch (error) {
            logger.debug("Orders link by href not found, using text fallback", {
              error: error instanceof Error ? error.message : String(error),
            });
          }

          if (!clicked) {
            clicked = await this.clickElementByText("Ordini", {
              exact: true,
              selectors: ["a", "span", "div", "td"],
            });
          }

          if (!clicked) {
            throw new Error('Menu "Ordini" not found');
          }

          await waitForOrdersList();

          // Slowdown after navigation
          await this.wait(this.getSlowdown("click_ordini"));

          logger.info("✅ Navigated to orders list");
        },
        "navigation.ordini",
      );

      await this.emitProgress("navigation.ordini");

      // STEP 2: Click "Nuovo"/"New" button
      await this.runOp(
        "order.click_nuovo",
        async () => {
          logger.debug('Clicking "Nuovo"/"New" button...');

          const urlBefore = this.page!.url();
          logger.debug(`URL before click: ${urlBefore}`);

          let clicked = await this.clickElementByText("Nuovo", {
            exact: true,
            selectors: ["button", "a", "span"],
          });
          if (!clicked) {
            clicked = await this.clickElementByText("New", {
              exact: true,
              selectors: ["button", "a", "span"],
            });
          }

          if (!clicked) {
            throw new Error('Button "Nuovo"/"New" not found');
          }

          logger.debug("Waiting for navigation after Nuovo click...");

          // Wait for URL to change (indicating navigation to form)
          try {
            await this.page!.waitForFunction(
              (oldUrl) => window.location.href !== oldUrl,
              { timeout: 5000 },
              urlBefore,
            );
            const urlAfter = this.page!.url();
            logger.info(`✅ Navigated to order form: ${urlAfter}`);
          } catch (timeoutError) {
            const urlAfter = this.page!.url();
            logger.error(
              `Navigation failed! URL did not change. Before: ${urlBefore}, After: ${urlAfter}`,
            );
            throw new Error(
              `Click on "Nuovo" did not navigate to form. URL remained: ${urlAfter}`,
            );
          }

          await this.waitForDevExpressReady({ timeout: 5000 });

          // Slowdown after form load
          await this.wait(this.getSlowdown("click_nuovo"));

          logger.info("✅ Order form loaded");
        },
        "navigation.form",
      );

      // STEP 2.5: Discover DevExpress controls for API-based operations
      await this.runOp(
        "order.discover_controls",
        async () => {
          await this.discoverSalesLinesGrid();
        },
        "form.discovery",
      );

      // STEP 3: Select customer via "Profilo cliente" dropdown
      await this.runOp(
        "order.customer.select",
        async () => {
          // Phase 1: Find customer field and dropdown button selector
          const fieldInfo = await this.page!.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[type="text"]'),
            );
            const customerInput = inputs.find((input) => {
              const id = (input as HTMLInputElement).id.toLowerCase();
              const el = input as HTMLInputElement;
              return (
                (id.includes("custtable") ||
                  id.includes("custaccount") ||
                  id.includes("custome") ||
                  id.includes("cliente") ||
                  id.includes("account") ||
                  id.includes("profilo")) &&
                !el.disabled &&
                el.getBoundingClientRect().height > 0
              );
            }) as HTMLInputElement | undefined;
            if (!customerInput) return null;

            const baseId = customerInput.id.endsWith("_I")
              ? customerInput.id.slice(0, -2)
              : customerInput.id;

            const btnSelectors = [
              `${baseId}_B-1`,
              `${baseId}_B-1Img`,
              `${baseId}_B`,
            ];
            for (const btnId of btnSelectors) {
              const btn = document.getElementById(btnId) as HTMLElement | null;
              if (btn && btn.offsetParent !== null) {
                return {
                  inputId: customerInput.id,
                  baseId,
                  btnSelector: `#${btnId}`,
                };
              }
            }
            return { inputId: customerInput.id, baseId, btnSelector: null };
          });

          if (!fieldInfo) {
            throw new Error("Customer input field not found");
          }

          const customerBaseId = fieldInfo.baseId;

          if (!fieldInfo.btnSelector) {
            throw new Error(
              `Dropdown button not found for customer field ${customerBaseId}`,
            );
          }

          await this.page!.click(fieldInfo.btnSelector);

          logger.debug("✓ Customer field found and dropdown opened", {
            baseId: customerBaseId,
          });

          // Phase 2: Wait for search input, paste value, press Enter - all fast
          const searchSelector = `#${customerBaseId}_DDD_gv_DXSE_I`;
          try {
            await this.page!.waitForFunction(
              (sel: string) => {
                const input = document.querySelector(
                  sel,
                ) as HTMLInputElement | null;
                return input && input.offsetParent !== null && !input.disabled;
              },
              { timeout: 3000, polling: 50 },
              searchSelector,
            );
          } catch {
            throw new Error(`Search input not found: ${searchSelector}`);
          }

          await this.page!.evaluate(
            (sel: string, value: string) => {
              const input = document.querySelector(sel) as HTMLInputElement;
              if (!input) return;
              input.focus();
              const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
              )?.set;
              if (setter) {
                setter.call(input, value);
              } else {
                input.value = value;
              }
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
              input.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  bubbles: true,
                }),
              );
              input.dispatchEvent(
                new KeyboardEvent("keyup", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  bubbles: true,
                }),
              );
            },
            searchSelector,
            orderData.customerName.substring(0, 50),
          );

          logger.debug("✓ Customer name pasted and Enter triggered", {
            original: orderData.customerName,
            truncated: orderData.customerName.substring(0, 50),
          });

          // Phase 3: Wait for filtered rows to appear (callback-aware)
          await this.page!.waitForFunction(
            (baseId: string) => {
              const w = window as any;
              const collection =
                w.ASPxClientControl?.GetControlCollection?.() ?? null;
              if (collection) {
                let inCallback = false;
                try {
                  if (typeof collection.ForEachControl === "function") {
                    collection.ForEachControl((c: any) => {
                      if (
                        c?.name?.includes(baseId) &&
                        typeof c.InCallback === "function" &&
                        c.InCallback()
                      ) {
                        inCallback = true;
                      }
                      if (typeof c?.GetGridView === "function") {
                        const gv = c.GetGridView();
                        if (
                          gv &&
                          typeof gv.InCallback === "function" &&
                          gv.InCallback()
                        ) {
                          inCallback = true;
                        }
                      }
                    });
                  }
                } catch {
                  // ignore
                }
                if (inCallback) return false;
              }

              const containers = Array.from(
                document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
              ).filter((node) => {
                const el = node as HTMLElement;
                return (
                  el.offsetParent !== null &&
                  el.getBoundingClientRect().width > 0
                );
              });
              const container =
                containers.find(
                  (c) =>
                    (c as HTMLElement).id.includes(baseId) &&
                    c.querySelector('tr[class*="dxgvDataRow"]'),
                ) ||
                containers.find((c) =>
                  c.querySelector('tr[class*="dxgvDataRow"]'),
                );
              if (!container) return false;

              const rows = Array.from(
                container.querySelectorAll('tr[class*="dxgvDataRow"]'),
              ).filter((r) => (r as HTMLElement).offsetParent !== null);
              return rows.length > 0;
            },
            { timeout: 8000, polling: 100 },
            customerBaseId,
          );

          logger.debug("✓ Filtered rows appeared");

          // Phase 4: Snapshot rows, match, and click - all in one evaluate
          const selectionResult = await this.page!.evaluate(
            (baseId: string, customerName: string, customerInternalId: string) => {
              const containers = Array.from(
                document.querySelectorAll(
                  '[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpcMainDiv',
                ),
              ).filter((node) => {
                const el = node as HTMLElement;
                return (
                  el.offsetParent !== null &&
                  el.getBoundingClientRect().width > 0
                );
              });
              const container =
                containers.find(
                  (c) =>
                    (c as HTMLElement).id.includes(baseId) &&
                    c.querySelector('tr[class*="dxgvDataRow"]'),
                ) ||
                containers.find((c) =>
                  c.querySelector('tr[class*="dxgvDataRow"]'),
                ) ||
                null;
              if (!container) {
                return {
                  clicked: false,
                  reason: "no-container",
                  rowsCount: 0,
                  rows: [] as string[][],
                };
              }

              const rows = Array.from(
                container.querySelectorAll('tr[class*="dxgvDataRow"]'),
              ).filter((r) => (r as HTMLElement).offsetParent !== null);

              const rowData = rows.map((row) => {
                const cells = Array.from(row.querySelectorAll("td"));
                return cells.map(
                  (c) =>
                    c.textContent?.trim() ||
                    c.getAttribute("title")?.trim() ||
                    "",
                );
              });

              // Scenario 1: single row - click immediately
              if (rows.length === 1) {
                const target =
                  rows[0].querySelector("td") || (rows[0] as HTMLElement);
                (target as HTMLElement).scrollIntoView({ block: "center" });
                (target as HTMLElement).click();
                return {
                  clicked: true,
                  reason: "single-row",
                  rowsCount: 1,
                  chosenIndex: 0,
                  rows: rowData,
                };
              }

              // Scenario 2a: multiple rows - disambiguate by PROFILO CLIENTE (customerInternalId)
              // The dropdown shows a "PROFILO CLIENTE" column; match it exactly to pick the right customer
              if (customerInternalId) {
                const internalIdLower = customerInternalId.trim().toLowerCase();
                for (let i = 0; i < rowData.length; i++) {
                  const hasProfileMatch = rowData[i].some(
                    (text) => text.trim().toLowerCase() === internalIdLower,
                  );
                  if (hasProfileMatch) {
                    const row = rows[i];
                    const target = row.querySelector("td") || (row as HTMLElement);
                    (target as HTMLElement).scrollIntoView({ block: "center" });
                    (target as HTMLElement).click();
                    return {
                      clicked: true,
                      reason: "profile-match",
                      rowsCount: rows.length,
                      chosenIndex: i,
                      rows: rowData,
                    };
                  }
                }
              }

              // Scenario 2b: fall back to name matching
              // Archibald ERP may truncate long customer names, so we check
              // if either string starts with the other (handles truncation)
              const queryLower = customerName.trim().toLowerCase();
              let bestIndex = -1;

              for (let i = 0; i < rowData.length; i++) {
                const hasExact = rowData[i].some((text) => {
                  const cellLower = text.trim().toLowerCase();
                  return (
                    cellLower.length > 0 &&
                    (cellLower === queryLower ||
                    cellLower.startsWith(queryLower) ||
                    queryLower.startsWith(cellLower))
                  );
                });
                if (hasExact) {
                  bestIndex = i;
                  break;
                }
              }

              // Fallback: contains match on clean rows (no asterisks)
              if (bestIndex === -1) {
                for (let i = 0; i < rowData.length; i++) {
                  const combined = rowData[i].join(" ").toLowerCase();
                  if (combined.includes(queryLower) || queryLower.includes(combined)) {
                    bestIndex = i;
                    break;
                  }
                }
              }

              if (bestIndex >= 0) {
                const row = rows[bestIndex];
                const target = row.querySelector("td") || (row as HTMLElement);
                (target as HTMLElement).scrollIntoView({ block: "center" });
                (target as HTMLElement).click();
                return {
                  clicked: true,
                  reason: "name-match",
                  rowsCount: rows.length,
                  chosenIndex: bestIndex,
                  rows: rowData,
                };
              }

              return {
                clicked: false,
                reason: "no-match",
                rowsCount: rows.length,
                rows: rowData,
              };
            },
            customerBaseId,
            orderData.customerName,
            orderData.customerInternalId ?? "",
          );

          logger.info("Customer selection", {
            reason: selectionResult.reason,
            rowsCount: selectionResult.rowsCount,
            chosenIndex: (selectionResult as any).chosenIndex ?? null,
            rows: selectionResult.rows,
          });

          if (!selectionResult.clicked) {
            throw new Error(
              `No matching customer row for: ${orderData.customerName}`,
            );
          }

          // Phase 5: Wait for dropdown to close and grid to be ready
          try {
            await this.page!.waitForFunction(
              () => {
                const panels = Array.from(
                  document.querySelectorAll('[id*="_DDD_PW"]'),
                );
                return panels.every(
                  (p) =>
                    (p as HTMLElement).offsetParent === null ||
                    (p as HTMLElement).style.display === "none",
                );
              },
              { timeout: 2000, polling: 100 },
            );
          } catch {
            // proceed anyway
          }

          logger.info(`✅ Customer selected: ${orderData.customerName}`);

          try {
            await this.page!.waitForFunction(
              () => {
                const addNewLinks = Array.from(
                  document.querySelectorAll('a[data-args*="AddNew"]'),
                ).filter((el) => (el as HTMLElement).offsetParent !== null);
                if (addNewLinks.length > 0) return true;
                const newImages = Array.from(
                  document.querySelectorAll(
                    'img[title="New"][src*="Action_Inline_New"]',
                  ),
                ).filter((el) => (el as HTMLElement).offsetParent !== null);
                return newImages.length > 0;
              },
              { timeout: 4000, polling: 100 },
            );
            logger.debug('✅ Line items grid ready ("New" visible)');
          } catch {
            logger.warn(
              'Line items "New" button not visible after customer selection, proceeding anyway',
            );
          }
        },
        "form.customer",
      );

      await this.emitProgress("form.customer");

      // NOTE: selectDeliveryAddress is called AFTER all articles are added (see STEP 9.7),
      // because XAF AJAX callbacks during article addition reset the server ObjectSpace and
      // overwrite any delivery address set before articles are entered.

      // Helper: open "Prezzi e sconti" tab
      const openPrezziEScontiTab = async (): Promise<boolean> => {
        logger.debug('Looking for "Prezzi e sconti" tab...');

        const tabClicked = await this.page!.evaluate(() => {
          // Find tab with text "Prezzi e sconti" (IT) or "Price Discount" (EN)
          const isMatch = (text: string) =>
            (text.includes("Prezzi") && text.includes("sconti")) ||
            (text.includes("Price") && text.includes("Discount"));

          const allLinks = Array.from(
            document.querySelectorAll("a.dxtc-link, span.dx-vam"),
          );

          for (const element of allLinks) {
            const text = element.textContent?.trim() || "";
            if (isMatch(text)) {
              const clickTarget =
                element.tagName === "A" ? element : element.parentElement;
              if (
                clickTarget &&
                (clickTarget as HTMLElement).offsetParent !== null
              ) {
                (clickTarget as HTMLElement).click();
                return true;
              }
            }
          }

          // Alternative: Find by tab ID pattern (pg_AT2 = Prezzi e sconti / Price Discount)
          const tabs = Array.from(
            document.querySelectorAll('li[id*="_pg_AT"], li[id*="_pg_T"]'),
          );
          for (const tab of tabs) {
            const link = tab.querySelector("a.dxtc-link");
            const span = tab.querySelector("span.dx-vam");
            const text = span?.textContent?.trim() || "";

            if (isMatch(text)) {
              if (link && (link as HTMLElement).offsetParent !== null) {
                (link as HTMLElement).click();
                return true;
              }
            }
          }

          return false;
        });

        if (!tabClicked) {
          logger.warn(
            '"Prezzi e sconti" tab not found, trying to continue anyway...',
          );
          return false;
        }

        logger.info('✅ Clicked "Prezzi e sconti" tab');
        try {
          await this.page!.waitForFunction(
            () => {
              const w = window as any;
              const col = w.ASPxClientControl?.GetControlCollection?.();
              if (!col || typeof col.ForEachControl !== "function") return true;
              let busy = false;
              col.ForEachControl((c: any) => {
                try {
                  if (c.InCallback?.()) busy = true;
                } catch {}
              });
              return !busy;
            },
            { timeout: 5000, polling: 100 },
          );
        } catch {
          // proceed
        }
        return true;
      };

      // prezziTabOpened removed — tab is opened explicitly when needed

      // STEP 4: Add first new row in Linee di vendita
      await this.runOp(
        "order.lineditems.click_new",
        async () => {
          logger.debug("Adding new row in Linee di vendita...");

          // Strategy 0: DevExpress API (most reliable)
          let addNewDone = false;
          if (this.salesLinesGridName) {
            try {
              addNewDone = await this.gridAddNewRow();
              if (addNewDone) {
                logger.info("✅ AddNewRow via DevExpress API");
              }
            } catch (err) {
              logger.warn(
                "DevExpress API AddNewRow failed, falling back to DOM",
                {
                  error: err instanceof Error ? err.message : String(err),
                },
              );
            }
          }

          // Fallback: DOM-based click
          if (!addNewDone) {
            logger.debug("Using DOM fallback for AddNew...");
            await this.waitForDevExpressIdle({
              timeout: 5000,
              label: "pre-addnew-idle",
            });

            const gridCommandResult = await this.clickDevExpressGridCommand({
              command: "AddNew",
              baseIdHint: "SALESLINEs",
              timeout: 6000,
              label: "lineitems-addnew-command",
            });

            if (!gridCommandResult.clicked) {
              await this.page!.screenshot({
                path: `logs/new-button-not-found-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error(
                'Button "New" in line items not found (both API and DOM failed)',
              );
            }

            logger.debug("AddNew clicked via DOM fallback", {
              strategy: gridCommandResult.strategy,
            });
            await this.waitForDevExpressIdle({
              timeout: 6000,
              label: "lineitems-addnew-dom-fallback",
            });
          }

          // Wait for new editable row to appear
          try {
            await this.page!.waitForFunction(
              () => {
                const editRows = document.querySelectorAll('tr[id*="editnew"]');
                return editRows.length > 0;
              },
              { timeout: 5000, polling: 100 },
            );
            logger.debug("✅ New editable row detected");
          } catch {
            logger.warn("editnew row not detected, verifying by input fields");
          }

          // Final verification
          const articleInputAppeared = await this.page!.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[type="text"]'),
            );
            return inputs.some((input) => {
              const id = (input as HTMLInputElement).id.toLowerCase();
              return (
                id.includes("itemid") ||
                id.includes("salesline") ||
                id.includes("articolo") ||
                id.includes("nome")
              );
            });
          });

          if (!articleInputAppeared) {
            throw new Error("New row did not appear after AddNew");
          }

          logger.info("✅ New line item row created and verified");
          await this.wait(this.getSlowdown("click_new_article"));
        },
        "form.multi_article",
      );

      // STEP 5-8: For each item, add article with package selection
      // Filter out items completely from warehouse, adjust quantities for partial warehouse items
      const itemsToOrder = orderData.items
        .map((item) => {
          const warehouseQty = item.warehouseQuantity || 0;
          const totalQty = item.quantity;

          // Skip items completely from warehouse
          if (warehouseQty >= totalQty) {
            logger.info("⚡ Skipping item (fully from warehouse)", {
              articleCode: item.articleCode,
              warehouseQty,
              totalQty,
              boxes: item.warehouseSources?.map((s) => s.boxName).join(", "),
            });
            return null;
          }

          // Adjust quantity for partial warehouse items
          const qtyToOrder = totalQty - warehouseQty;
          if (warehouseQty > 0) {
            logger.info("📦 Partial warehouse item", {
              articleCode: item.articleCode,
              totalQty,
              warehouseQty,
              toOrder: qtyToOrder,
              boxes: item.warehouseSources?.map((s) => s.boxName).join(", "),
            });
            return { ...item, quantity: qtyToOrder };
          }

          // No warehouse, order full quantity
          return item;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      logger.info("📊 Order items summary", {
        originalItems: orderData.items.length,
        itemsToOrder: itemsToOrder.length,
        skippedFromWarehouse: orderData.items.length - itemsToOrder.length,
      });

      if (itemsToOrder.length === 0) {
        const warehouseJobId = `warehouse-${Date.now()}`;
        logger.info(
          "✅ Order completely fulfilled from warehouse - no Archibald submission needed",
          { jobId: warehouseJobId },
        );
        // Order record will be created by queue-manager for tracking
        return warehouseJobId;
      }

      await this.emitProgress("form.articles.start");

      for (let i = 0; i < itemsToOrder.length; i++) {
        const item = itemsToOrder[i];

        logger.info(`Processing item ${i + 1}/${itemsToOrder.length}`, {
          articleCode: item.articleCode,
          quantity: item.quantity,
        });

        await this.emitProgress("form.articles.progress", {
          currentArticle: i + 1,
          totalArticles: itemsToOrder.length,
        });

        // 5.1: Query database for correct package variant
        await this.runOp(
          `order.item.${i}.select_variant`,
          async () => {
            const variantLookupName =
              item.productName?.trim() || item.articleCode;
            const directVariant = this.productDb?.getProductById(
              item.articleCode,
            );
            const selectedVariant =
              directVariant ||
              this.productDb?.selectPackageVariant(
                variantLookupName,
                item.quantity,
              );

            if (!selectedVariant) {
              throw new Error(
                `Article ${item.articleCode} not found in database` +
                  (item.productName
                    ? ` (product name: ${item.productName}). `
                    : ". ") +
                  `Ensure product sync has run.`,
              );
            }

            logger.info(`Selected package variant for ${item.articleCode}`, {
              variantId: selectedVariant.id,
              packageContent: selectedVariant.packageContent,
              multipleQty: selectedVariant.multipleQty,
              quantity: item.quantity,
            });

            // Store selected variant for next steps
            (item as any)._selectedVariant = selectedVariant;
          },
          "form.package",
        );

        // Retry wrapper for UI steps (5.2 - 5.8)
        // If a timeout occurs during article insertion, reload and resume
        let articleRetries = 0;
        const maxArticleRetries = 2;

        while (true) {
          try {
            // 5.2: Search article dropdown (ULTRA-OPTIMIZED)
            await this.runOp(
              `order.item.${i}.search_article_dropdown`,
              async () => {
                const searchQuery = item.articleCode || "";
                if (!searchQuery) {
                  throw new Error("Article code is required");
                }

                // La riga edit è già stata verificata dallo step che ha cliccato "New" (prima del loop o nello STEP 5.8)
                logger.debug("Starting article search");

                // For articles after the first, ensure INVENTTABLE is in the DOM
                // before attempting focus (DevExpress may still be rendering)
                if (i > 0) {
                  try {
                    await this.page!.waitForFunction(
                      () => {
                        const inputs = Array.from(
                          document.querySelectorAll(
                            'input[id*="INVENTTABLE"][id$="_I"]',
                          ),
                        );
                        return inputs.some(
                          (inp) =>
                            (inp as HTMLElement).offsetParent !== null &&
                            (inp as HTMLElement).offsetWidth > 0,
                        );
                      },
                      { timeout: 8000, polling: 300 },
                    );
                  } catch {
                    logger.warn(
                      `Article ${i + 1}: INVENTTABLE not visible after wait, proceeding with focus strategies`,
                    );
                  }
                }

                // 2. Focus sul campo Nome Articolo (INVENTTABLE)
                // Strategy 1: Coordinate click on INVENTTABLE cell in editnew row
                // Strategy 2: DevExpress FocusEditor API
                // Strategy 3: Tab fallback
                {
                  let inventtableFocused = false;

                  // DevExpress renders inline editors as overlays outside the <tr>
                  // Search the entire page/grid container for the INVENTTABLE input
                  logger.debug(`Article ${i + 1}: focusing INVENTTABLE editor`);

                  // Strategy 1: Focus INVENTTABLE input via JS (not mouse click).
                  // Mouse click at input coordinates can hit a saved row cell
                  // (z-index overlap) and open the "Linea di vendita" popup.
                  try {
                    const inventtableId = await this.page!.evaluate(() => {
                      const inputs = Array.from(
                        document.querySelectorAll(
                          'input[id*="INVENTTABLE"][id$="_I"]',
                        ),
                      );
                      for (const inp of inputs) {
                        const el = inp as HTMLElement;
                        if (el.offsetParent !== null && el.offsetWidth > 0) {
                          return (inp as HTMLInputElement).id;
                        }
                      }
                      return null;
                    });

                    if (inventtableId) {
                      await this.page!.evaluate((inputId: string) => {
                        const el = document.getElementById(
                          inputId,
                        ) as HTMLInputElement;
                        if (el) {
                          el.scrollIntoView({ block: "center" });
                          el.focus();
                          el.click();
                        }
                      }, inventtableId);
                      await this.wait(200);

                      inventtableFocused = await this.page!.evaluate(() => {
                        const focused =
                          document.activeElement as HTMLInputElement;
                        return focused?.id?.includes("INVENTTABLE") || false;
                      });

                      if (inventtableFocused) {
                        logger.debug(
                          "✅ INVENTTABLE field focused via JS focus",
                        );
                      }
                    } else {
                      logger.debug(
                        "No visible INVENTTABLE input found on page",
                      );
                    }
                  } catch (clickError) {
                    logger.warn("INVENTTABLE JS focus failed", {
                      error:
                        clickError instanceof Error
                          ? clickError.message
                          : String(clickError),
                    });
                  }

                  // Strategy 2: Click on the grid's "N/A" cell (NOME ARTICOLO column)
                  // to activate the editor if it wasn't visible before
                  if (!inventtableFocused) {
                    logger.debug("Trying to click NOME ARTICOLO cell in grid");
                    try {
                      const naCell = await this.page!.evaluate(() => {
                        const row = document.querySelector('tr[id*="editnew"]');
                        if (!row) return null;
                        // Find cells containing "N/A" text or a dropdown
                        const cells = Array.from(row.querySelectorAll("td"));
                        for (const cell of cells) {
                          const text = cell.textContent?.trim() || "";
                          if (
                            text === "N/A" ||
                            text.includes("N/A") ||
                            cell.querySelector('[class*="dxeDropDown"]')
                          ) {
                            const rect = cell.getBoundingClientRect();
                            if (rect.width > 0) {
                              return {
                                x: rect.x + rect.width / 2,
                                y: rect.y + rect.height / 2,
                              };
                            }
                          }
                        }
                        return null;
                      });

                      if (naCell) {
                        await this.page!.mouse.click(naCell.x, naCell.y);
                        await this.wait(500);

                        // After clicking the cell, the editor should appear
                        // Check for INVENTTABLE input now
                        inventtableFocused = await this.page!.evaluate(() => {
                          const focused =
                            document.activeElement as HTMLInputElement;
                          return focused?.id?.includes("INVENTTABLE") || false;
                        });

                        if (inventtableFocused) {
                          logger.debug(
                            "✅ INVENTTABLE field focused after clicking N/A cell",
                          );
                        }
                      }
                    } catch (_e) {
                      // ignore
                    }
                  }

                  // Strategy 3: Tab from "Nuovo" command button area
                  if (!inventtableFocused) {
                    const tabCount = i === 0 ? 3 : 4 * (i + 1);
                    logger.warn(
                      `Falling back to Tab × ${tabCount} for article ${i + 1}`,
                    );
                    // First click on the grid toolbar area to position focus
                    try {
                      await this.page!.evaluate(() => {
                        const toolbar = document.querySelector(
                          '[id*="dviSALESLINEs"] [class*="ToolBar"]',
                        );
                        if (toolbar) {
                          (toolbar as HTMLElement).click();
                        }
                      });
                      await this.wait(200);
                    } catch (_e) {
                      // ignore
                    }

                    for (let t = 0; t < tabCount; t++) {
                      await this.page!.keyboard.press("Tab");
                    }
                    await this.wait(100);

                    inventtableFocused = await this.page!.evaluate(() => {
                      const focused =
                        document.activeElement as HTMLInputElement;
                      return focused?.id?.includes("INVENTTABLE") || false;
                    });
                  }

                  if (!inventtableFocused) {
                    // Log all INVENTTABLE inputs on the page for debugging
                    const debugInfo = await this.page!.evaluate(() => {
                      const allInventtable = Array.from(
                        document.querySelectorAll('input[id*="INVENTTABLE"]'),
                      ).map((inp) => ({
                        id: (inp as HTMLInputElement).id,
                        visible: (inp as HTMLElement).offsetParent !== null,
                        w: (inp as HTMLElement).offsetWidth,
                        h: (inp as HTMLElement).offsetHeight,
                      }));
                      const focused =
                        document.activeElement as HTMLInputElement;
                      return {
                        focusedId: focused?.id || "none",
                        inventtableOnPage: allInventtable,
                      };
                    });
                    logger.error(
                      "INVENTTABLE focus failed - page debug",
                      debugInfo,
                    );

                    await this.page!.screenshot({
                      path: `logs/inventtable-focus-failed-${Date.now()}.png`,
                      fullPage: true,
                    });
                    throw new Error(
                      `INVENTTABLE field not focused. Article ${i + 1}. Debug: ${JSON.stringify(debugInfo)}`,
                    );
                  }
                }

                // 3. Leggi ID del campo focused (ora garantito)
                const inputId = await this.page!.evaluate(() => {
                  const focused = document.activeElement as HTMLInputElement;
                  return focused?.id || null;
                });

                if (!inputId || !inputId.includes("INVENTTABLE")) {
                  await this.page!.screenshot({
                    path: `logs/wrong-field-focused-${Date.now()}.png`,
                    fullPage: true,
                  });
                  throw new Error(
                    `Wrong field focused. Expected INVENTTABLE, got: ${inputId}`,
                  );
                }

                const inventtableInputId = inputId;
                const inventtableBaseId = inputId.endsWith("_I")
                  ? inputId.slice(0, -2)
                  : inputId;

                // Salva per STEP 5.3
                (item as any)._inventtableInputId = inventtableInputId;
                (item as any)._inventtableBaseId = inventtableBaseId;

                logger.debug("Focused on article field", {
                  inputId,
                  articleIndex: i,
                });

                // 4. Digita codice articolo (OTTIMIZZATO: paste tutti tranne ultimo + type ultimo)
                // DevExpress IncrementalFiltering si attiva SOLO quando digiti, non quando incolli
                // Quindi: incolla tutto tranne ultimo carattere, poi digita solo l'ultimo
                logger.debug("Typing article code (optimized)...", {
                  code: searchQuery,
                });

                if (searchQuery.length > 1) {
                  // Paste tutto tranne l'ultimo carattere
                  const pastePart = searchQuery.slice(0, -1);
                  const typePart = searchQuery.slice(-1);

                  await this.page!.evaluate((text: string) => {
                    const input = document.activeElement as HTMLInputElement;
                    if (input && input.tagName === "INPUT") {
                      input.value = text;
                      // Trigger input event per DevExpress
                      input.dispatchEvent(
                        new Event("input", { bubbles: true, cancelable: true }),
                      );
                    }
                  }, pastePart);

                  logger.debug("Pasted prefix, typing last char", {
                    pasted: pastePart,
                    toType: typePart,
                  });

                  // Type ultimo carattere per triggerare IncrementalFiltering
                  await this.page!.keyboard.type(typePart, { delay: 30 });
                } else {
                  // Codice articolo troppo corto, digita tutto
                  await this.page!.keyboard.type(searchQuery, { delay: 30 });
                }

                logger.debug(
                  "Article code typed, waiting for IncrementalFiltering dropdown...",
                );

                // 5. Aspetta che DevExpress IncrementalFiltering apra il dropdown AUTOMATICAMENTE
                // DevExpress rileva la digitazione e apre/filtra il dropdown DA SOLO
                try {
                  // Wait for the SPECIFIC INVENTTABLE dropdown popup to appear.
                  // The generic 'tr[id*="DXDataRow"]' selector matches rows from
                  // OTHER grids on the page (e.g., Corsi grid), resolving immediately
                  // before the actual article dropdown opens.
                  await this.page!.waitForFunction(
                    (baseId: string) => {
                      // Check if the dropdown popup appeared with visible data rows
                      for (const suffix of ["_DDD_L", "_DDD_PW", "_DDD"]) {
                        const el = document.getElementById(baseId + suffix);
                        if (el) {
                          const rect = el.getBoundingClientRect();
                          if (
                            rect.width > 0 &&
                            rect.height > 0 &&
                            el.querySelector('tr[class*="dxgvDataRow"]')
                          ) {
                            return true;
                          }
                        }
                      }
                      // Fallback: check for DevExpress popup containers
                      const popups = Array.from(
                        document.querySelectorAll(
                          ".dxpcLite, .dxpc-content",
                        ),
                      );
                      for (const popup of popups) {
                        const el = popup as HTMLElement;
                        if (
                          el.getBoundingClientRect().width > 0 &&
                          el.querySelector('tr[class*="dxgvDataRow"]')
                        ) {
                          return true;
                        }
                      }
                      return false;
                    },
                    { timeout: 5000, polling: 100 },
                    inventtableBaseId,
                  );

                  // Count visible rows in the dropdown
                  const rowCount = await this.page!.evaluate(
                    (baseId: string) => {
                      // Find the dropdown container
                      for (const suffix of ["_DDD_L", "_DDD_PW", "_DDD"]) {
                        const el = document.getElementById(baseId + suffix);
                        if (el && el.getBoundingClientRect().width > 0) {
                          const rows = el.querySelectorAll(
                            'tr[class*="dxgvDataRow"]',
                          );
                          if (rows.length > 0) return rows.length;
                        }
                      }
                      // Fallback
                      return document.querySelectorAll(
                        'tr[class*="dxgvDataRow"]',
                      ).length;
                    },
                    inventtableBaseId,
                  );

                  logger.info(
                    `✅ Dropdown auto-opened by IncrementalFiltering with ${rowCount} result(s)`,
                    { articleCode: searchQuery },
                  );
                } catch (error) {
                  // Timeout - analizziamo cosa c'è sulla pagina per debugging
                  const debugInfo = await this.page!.evaluate(() => {
                    // Cerca tutti i tipi di elementi che potrebbero essere il dropdown
                    const allTables = Array.from(
                      document.querySelectorAll("table[id]"),
                    ).map((t) => ({
                      id: t.id,
                      visible: t.getBoundingClientRect().height > 0,
                    }));

                    const allTRsWithId = Array.from(
                      document.querySelectorAll("tr[id]"),
                    ).map((tr) => ({
                      id: tr.id,
                      visible: tr.getBoundingClientRect().height > 0,
                      text: tr.textContent?.substring(0, 100) || "",
                    }));

                    const allDivs = Array.from(
                      document.querySelectorAll(
                        "div[id*='DX'], div[id*='Popup']",
                      ),
                    ).map((d) => ({
                      id: d.id,
                      visible: d.getBoundingClientRect().height > 0,
                    }));

                    return {
                      tables: allTables.filter((t) => t.visible).slice(0, 10),
                      trs: allTRsWithId.filter((tr) => tr.visible).slice(0, 10),
                      divs: allDivs.filter((d) => d.visible).slice(0, 10),
                    };
                  });

                  logger.error("Dropdown selector debug info", {
                    searchQuery,
                    debugInfo,
                  });

                  await this.page!.screenshot({
                    path: `logs/article-dropdown-not-opened-${Date.now()}.png`,
                    fullPage: true,
                  });

                  throw new Error(
                    `Dropdown did not auto-open after typing "${searchQuery}". ` +
                      `IncrementalFiltering should open dropdown automatically when typing. ` +
                      `Check if: 1) article code exists in system, 2) IncrementalFilteringMode is enabled in DevExpress, 3) field was correctly focused. ` +
                      `Debug: ${JSON.stringify(debugInfo, null, 2)}`,
                  );
                }
              },
              "form.article",
            );

            // Targeted callback check (replaces slow waitForDevExpressIdle)
            try {
              await this.page!.waitForFunction(
                () => {
                  const w = window as any;
                  const col = w.ASPxClientControl?.GetControlCollection?.();
                  if (!col || typeof col.ForEachControl !== "function")
                    return true;
                  let busy = false;
                  col.ForEachControl((c: any) => {
                    try {
                      if (c.InCallback?.()) busy = true;
                    } catch {}
                    try {
                      const gv = c.GetGridView?.();
                      if (gv?.InCallback?.()) busy = true;
                    } catch {}
                  });
                  return !busy;
                },
                { timeout: 5000, polling: 100 },
              );
            } catch {
              // proceed
            }
            logger.debug("✓ Article dropdown callbacks settled");

            // 5.3: Select article variant row (OPTIMIZED)
            await this.runOp(
              `order.item.${i}.select_article`,
              async () => {
                const selectedVariant = (item as any)._selectedVariant;
                const inventtableInputId = (item as any)._inventtableInputId as
                  | string
                  | undefined;
                const inventtableBaseId = (item as any)._inventtableBaseId as
                  | string
                  | undefined;

                // Estrai suffix variante (ultimi 2 caratteri)
                const variantSuffix = selectedVariant.id.substring(
                  selectedVariant.id.length - 2,
                );

                logger.debug(
                  `Selecting variant by suffix: ${variantSuffix} (from ${selectedVariant.id})`,
                );

                // Pagination support: loop attraverso pagine finché variante trovata
                let rowSelected = false;
                let currentPage = 1;
                const maxPages = 10;
                type VariantDomSelection = {
                  found?: boolean;
                  reason?: string;
                  rowIndex?: number;
                  rowsCount?: number;
                  contentIndex?: number;
                  packIndex?: number;
                  multipleIndex?: number;
                  contentValue?: string;
                  packValue?: string;
                  multipleValue?: string;
                  suffixCellIndex?: number;
                  suffixNeighborValue?: string;
                  rowText?: string;
                  containerId?: string;
                  rowId?: string;
                  headerTexts?: string[];
                  rowSamples?: string[];
                };
                let lastSelection: VariantDomSelection | null = null;
                const weakReasons = new Set([
                  "package",
                  "multiple",
                  "suffix",
                  "single-row",
                ]);

                while (!rowSelected && currentPage <= maxPages) {
                  logger.debug(
                    `Searching for variant on page ${currentPage}...`,
                  );

                  const snapshot = await this.page!.evaluate(
                    (baseId: string | undefined) => {
                    let activeContainer: Element | null = null;

                    // Strategy 1: Find the SPECIFIC dropdown for the INVENTTABLE field
                    // DevExpress dropdown IDs follow the pattern: {baseId}_DDD_L or {baseId}_DDD
                    if (baseId) {
                      for (const suffix of ["_DDD_L", "_DDD_PW", "_DDD"]) {
                        const el = document.getElementById(baseId + suffix);
                        if (el) {
                          const rect = el.getBoundingClientRect();
                          if (
                            rect.width > 0 &&
                            rect.height > 0 &&
                            el.querySelector('tr[class*="dxgvDataRow"]')
                          ) {
                            activeContainer = el;
                            break;
                          }
                        }
                      }
                    }

                    // Strategy 2: Search all _DDD containers (original fallback)
                    if (!activeContainer) {
                      const dropdownContainers = Array.from(
                        document.querySelectorAll('[id*="_DDD"]'),
                      ).filter((node) => {
                        const el = node as HTMLElement | null;
                        if (!el) return false;
                        const style = window.getComputedStyle(el);
                        if (style.display === "none") return false;
                        if (style.visibility === "hidden") return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                      });

                      activeContainer =
                        dropdownContainers.find((container) =>
                          container.querySelector('tr[class*="dxgvDataRow"]'),
                        ) || null;
                    }

                    // Strategy 3: Search popup containers
                    if (!activeContainer) {
                      const popupContainers = Array.from(
                        document.querySelectorAll(
                          ".dxpcLite, .dxpc-content, .dxpcMainDiv",
                        ),
                      ).filter((node) => {
                        const el = node as HTMLElement | null;
                        if (!el) return false;
                        const style = window.getComputedStyle(el);
                        if (style.display === "none") return false;
                        if (style.visibility === "hidden") return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                      });

                      activeContainer =
                        popupContainers.find((container) =>
                          container.querySelector('tr[class*="dxgvDataRow"]'),
                        ) || null;
                    }

                    const rowsRoot = activeContainer || document;
                    const headerTexts: string[] = [];
                    const headerTable = rowsRoot.querySelector(
                      'table[id*="DXHeaderTable"]',
                    );
                    let headerRow: Element | null = null;

                    if (headerTable) {
                      headerRow =
                        headerTable.querySelector('tr[id*="DXHeadersRow"]') ||
                        headerTable.querySelector("tr.dxgvHeaderRow") ||
                        headerTable.querySelector('tr[class*="dxgvHeaderRow"]');
                    }

                    if (!headerRow) {
                      headerRow =
                        rowsRoot.querySelector("tr.dxgvHeaderRow") ||
                        rowsRoot.querySelector('tr[class*="dxgvHeaderRow"]') ||
                        rowsRoot.querySelector('tr[id*="DXHeadersRow"]');
                    }

                    if (headerRow) {
                      const headerCells = Array.from(
                        headerRow.querySelectorAll("td, th"),
                      );
                      for (const cell of headerCells) {
                        const wrap = cell.querySelector(".dx-wrap");
                        const text = (
                          wrap?.textContent ||
                          cell.textContent ||
                          ""
                        ).trim();
                        headerTexts.push(text);
                      }
                    }

                    const rows = Array.from(
                      rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
                    ).filter((row) => {
                      const el = row as HTMLElement | null;
                      if (!el) return false;
                      const style = window.getComputedStyle(el);
                      if (style.display === "none") return false;
                      if (style.visibility === "hidden") return false;
                      const rect = el.getBoundingClientRect();
                      return rect.width > 0 && rect.height > 0;
                    });

                    const rowSnapshots = rows.map((row, index) => {
                      const cells = Array.from(row.querySelectorAll("td"));
                      const cellTexts = cells.map((cell) => {
                        return cell.textContent?.trim() || ""; // Rimosso fallback title
                      });

                      return {
                        index,
                        cellTexts,
                        rowId: row.getAttribute("id") || null,
                      };
                    });

                    return {
                      containerId: activeContainer
                        ? (activeContainer as HTMLElement).id || null
                        : null,
                      headerTexts,
                      rows: rowSnapshots,
                      rowsCount: rows.length,
                    };
                  }, inventtableBaseId);

                  logger.debug("Dropdown snapshot", {
                    containerId: snapshot.containerId,
                    rowsCount: snapshot.rowsCount,
                  });

                  if (snapshot.rowsCount === 1) {
                    logger.info(
                      `⚡ Scenario 1: single variant row - selecting immediately`,
                    );
                  } else if (snapshot.rowsCount > 1) {
                    logger.info(
                      `🔍 Scenario 2: ${snapshot.rowsCount} variant rows - matching by suffix/package`,
                    );
                  }

                  const headerIndices = computeVariantHeaderIndices(
                    snapshot.headerTexts,
                  );
                  const variantInputs = {
                    variantId: selectedVariant.id,
                    variantSuffix,
                    packageContent: selectedVariant.packageContent,
                    multipleQty: selectedVariant.multipleQty,
                    articleName: item.articleCode,
                  };
                  const candidates = buildVariantCandidates(
                    snapshot.rows,
                    headerIndices,
                    variantInputs,
                  );
                  const { chosen, reason } =
                    chooseBestVariantCandidate(candidates);

                  logger.debug("Variant selection diagnostics", {
                    inputs: variantInputs,
                    headerTexts: snapshot.headerTexts,
                    headerIndices,
                    candidateCount: candidates.length,
                    rawRowCount: snapshot.rows.length,
                    candidates: candidates.slice(0, 5).map((c) => ({
                      idx: c.index,
                      cells: c.cellTexts,
                      fullId: c.fullIdMatch,
                      article: c.articleNameMatch,
                      suffix: c.suffixMatch,
                      pkg: c.packageMatch,
                      mult: c.multipleMatch,
                    })),
                    chosenIndex: chosen?.index ?? null,
                    reason,
                  });

                  let selection: VariantDomSelection | null = null;

                  if (!chosen || !reason) {
                    selection = {
                      found: false,
                      rowsCount: snapshot.rowsCount,
                      contentIndex: headerIndices.contentIndex,
                      packIndex: headerIndices.packIndex,
                      multipleIndex: headerIndices.multipleIndex,
                      suffixCellIndex: -1,
                      contentValue: "",
                      packValue: "",
                      multipleValue: "",
                      suffixNeighborValue: "",
                      headerTexts: snapshot.headerTexts,
                      rowSamples: candidates
                        .slice(0, 3)
                        .map((entry) => entry.rowText),
                      containerId: snapshot.containerId || "",
                    };
                  } else {
                    const keyboardState = await this.page!.evaluate(
                      (containerId: string | null) => {
                        let activeContainer: Element | null = null;

                        if (containerId) {
                          const byId = document.getElementById(containerId);
                          if (byId) {
                            const el = byId as HTMLElement;
                            const style = window.getComputedStyle(el);
                            const rect = el.getBoundingClientRect();
                            const visible =
                              style.display !== "none" &&
                              style.visibility !== "hidden" &&
                              rect.width > 0 &&
                              rect.height > 0;
                            if (visible) {
                              activeContainer = byId;
                            }
                          }
                        }

                        if (!activeContainer) {
                          const dropdownContainers = Array.from(
                            document.querySelectorAll('[id*="_DDD"]'),
                          ).filter((node) => {
                            const el = node as HTMLElement | null;
                            if (!el) return false;
                            const style = window.getComputedStyle(el);
                            if (style.display === "none") return false;
                            if (style.visibility === "hidden") return false;
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0;
                          });

                          activeContainer =
                            dropdownContainers.find((container) =>
                              container.querySelector(
                                'tr[class*="dxgvDataRow"]',
                              ),
                            ) || null;
                        }

                        const rowsRoot = activeContainer || document;
                        const rows = Array.from(
                          rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
                        ).filter((row) => {
                          const el = row as HTMLElement | null;
                          if (!el) return false;
                          const style = window.getComputedStyle(el);
                          if (style.display === "none") return false;
                          if (style.visibility === "hidden") return false;
                          const rect = el.getBoundingClientRect();
                          return rect.width > 0 && rect.height > 0;
                        });

                        const focusedIndex = rows.findIndex((row) => {
                          const cls = (row as HTMLElement).className || "";
                          return (
                            cls.includes("dxgvFocusedRow") ||
                            cls.includes("dxgvSelectedRow")
                          );
                        });

                        return {
                          rowsCount: rows.length,
                          focusedIndex,
                          containerId: activeContainer
                            ? (activeContainer as HTMLElement).id || ""
                            : "",
                        };
                      },
                      snapshot.containerId,
                    );

                    const rowsCount =
                      keyboardState.rowsCount ?? snapshot.rowsCount;
                    const focusedIndex = keyboardState.focusedIndex ?? -1;
                    const targetIndex = chosen.index;

                    if (
                      !rowsCount ||
                      targetIndex < 0 ||
                      targetIndex >= rowsCount
                    ) {
                      selection = {
                        found: false,
                        rowsCount,
                        contentIndex: headerIndices.contentIndex,
                        packIndex: headerIndices.packIndex,
                        multipleIndex: headerIndices.multipleIndex,
                        suffixCellIndex: chosen.suffixCellIndex,
                        contentValue: chosen.contentValue,
                        packValue: chosen.packValue,
                        multipleValue: chosen.multipleValue,
                        suffixNeighborValue: chosen.suffixNeighborValue,
                        headerTexts: snapshot.headerTexts,
                        rowSamples: candidates
                          .slice(0, 3)
                          .map((entry) => entry.rowText),
                        containerId:
                          keyboardState.containerId ||
                          snapshot.containerId ||
                          "",
                      };
                    } else {
                      // Primary: get target row coordinates, then use
                      // Puppeteer mouse.click() for real mouse events.
                      // DOM cell.click() dispatches synthetic events that
                      // DevExpress may not register as row selection.
                      const cellCoords = await this.page!.evaluate(
                        (
                          cId: string | null,
                          targetIdx: number,
                        ) => {
                          let container: Element | null = null;
                          if (cId) {
                            const byId = document.getElementById(cId);
                            if (
                              byId &&
                              byId.getBoundingClientRect().width > 0
                            ) {
                              container = byId;
                            }
                          }
                          if (!container) {
                            container =
                              Array.from(
                                document.querySelectorAll('[id*="_DDD"]'),
                              ).find((c) => {
                                const el = c as HTMLElement;
                                return (
                                  el.getBoundingClientRect().width > 0 &&
                                  !!c.querySelector(
                                    'tr[class*="dxgvDataRow"]',
                                  )
                                );
                              }) || null;
                          }
                          const root = container || document;
                          const rows = Array.from(
                            root.querySelectorAll(
                              'tr[class*="dxgvDataRow"]',
                            ),
                          ).filter((row) => {
                            const el = row as HTMLElement;
                            return (
                              el.offsetParent !== null &&
                              el.getBoundingClientRect().width > 0
                            );
                          });
                          const target = rows[targetIdx] as
                            | HTMLElement
                            | undefined;
                          if (target) {
                            const cell = target.querySelector(
                              "td",
                            ) as HTMLElement | null;
                            if (cell) {
                              const rect = cell.getBoundingClientRect();
                              return {
                                x: rect.x + rect.width / 2,
                                y: rect.y + rect.height / 2,
                              };
                            }
                          }
                          return null;
                        },
                        keyboardState.containerId ||
                          snapshot.containerId ||
                          null,
                        targetIndex,
                      );

                      if (cellCoords) {
                        await this.page!.mouse.click(
                          cellCoords.x,
                          cellCoords.y,
                        );
                        logger.info(
                          `Variant row ${targetIndex}/${rowsCount} selected via mouse click (reason: ${reason})`,
                        );
                        await this.wait(200);
                      } else {
                        // Fallback: keyboard navigation
                        logger.warn(
                          `Mouse click failed for row ${targetIndex}, falling back to ArrowDown`,
                        );
                        let delta =
                          focusedIndex >= 0
                            ? targetIndex - focusedIndex
                            : targetIndex + 1;
                        const direction: "ArrowDown" | "ArrowUp" =
                          delta >= 0 ? "ArrowDown" : "ArrowUp";
                        delta = Math.abs(delta);

                        const maxSteps = Math.min(delta, rowsCount + 2);
                        for (let step = 0; step < maxSteps; step++) {
                          await this.page!.keyboard.press(direction);
                          await this.wait(30);
                        }
                      }

                      // Tab: seleziona variante e sposta focus al campo quantità
                      await this.page!.keyboard.press("Tab");

                      // CRITICAL: Attendere che DevExpress completi il callback di
                      // processamento variante. Questo callback auto-compila la quantità
                      // con il valore predefinito. Se scriviamo PRIMA che il callback
                      // finisca, il callback sovrascrive il nostro valore.
                      try {
                        await this.page!.waitForFunction(
                          () => {
                            const w = window as any;
                            const col =
                              w.ASPxClientControl?.GetControlCollection?.();
                            if (
                              !col ||
                              typeof col.ForEachControl !== "function"
                            )
                              return true;
                            let busy = false;
                            col.ForEachControl((c: any) => {
                              try {
                                if (c.InCallback?.()) busy = true;
                              } catch {}
                              try {
                                const gv = c.GetGridView?.();
                                if (gv?.InCallback?.()) busy = true;
                              } catch {}
                            });
                            return !busy;
                          },
                          { timeout: 8000, polling: 100 },
                        );
                      } catch {
                        // proceed
                      }
                      logger.debug("✓ Variant selection callbacks settled");

                      // Post-Tab verification: read INVENTTABLE field value
                      // to ensure the correct article was selected.
                      // DevExpress auto-fills the field after Tab with the
                      // selected row's article name.
                      if (inventtableInputId) {
                        const selectedArticle = await this.page!.evaluate(
                          (fieldId: string) => {
                            const input = document.getElementById(
                              fieldId,
                            ) as HTMLInputElement | null;
                            return input?.value?.trim() || "";
                          },
                          inventtableInputId,
                        );

                        const expectedArticle = item.articleCode;
                        if (
                          selectedArticle &&
                          expectedArticle &&
                          selectedArticle.toLowerCase() !==
                            expectedArticle.toLowerCase()
                        ) {
                          logger.warn(
                            `⚠️ Article mismatch after Tab: expected "${expectedArticle}", got "${selectedArticle}". Re-selecting via keyboard...`,
                          );

                          // Click back on the INVENTTABLE field to re-open dropdown
                          const fieldCoords = await this.page!.evaluate(
                            (fieldId: string) => {
                              const input = document.getElementById(
                                fieldId,
                              ) as HTMLElement | null;
                              if (input) {
                                const rect = input.getBoundingClientRect();
                                return {
                                  x: rect.x + rect.width / 2,
                                  y: rect.y + rect.height / 2,
                                };
                              }
                              return null;
                            },
                            inventtableInputId,
                          );

                          if (fieldCoords) {
                            await this.page!.mouse.click(
                              fieldCoords.x,
                              fieldCoords.y,
                            );
                            await this.wait(300);

                            // Clear and retype article code
                            await this.page!.evaluate(
                              (fieldId: string) => {
                                const input = document.getElementById(
                                  fieldId,
                                ) as HTMLInputElement | null;
                                if (input) {
                                  input.value = "";
                                  input.dispatchEvent(
                                    new Event("input", {
                                      bubbles: true,
                                      cancelable: true,
                                    }),
                                  );
                                }
                              },
                              inventtableInputId,
                            );

                            // Retype with full article code
                            await this.page!.keyboard.type(expectedArticle, {
                              delay: 30,
                            });

                            // Wait for dropdown
                            try {
                              await this.page!.waitForSelector(
                                'tr[id*="DXDataRow"]',
                                { timeout: 5000 },
                              );
                            } catch {
                              // proceed
                            }
                            await this.wait(300);

                            // Use keyboard navigation to select correct row
                            // Navigate to row matching exact article name
                            const retrySnapshot = await this.page!.evaluate(
                              () => {
                                const rows = Array.from(
                                  document.querySelectorAll(
                                    'tr[class*="dxgvDataRow"]',
                                  ),
                                ).filter((row) => {
                                  const el = row as HTMLElement;
                                  return (
                                    el.offsetParent !== null &&
                                    el.getBoundingClientRect().width > 0
                                  );
                                });
                                return rows.map((row, idx) => ({
                                  idx,
                                  text:
                                    row
                                      .querySelector("td")
                                      ?.textContent?.trim() || "",
                                }));
                              },
                            );

                            const exactRowIdx = retrySnapshot.findIndex(
                              (r) =>
                                r.text.toLowerCase() ===
                                expectedArticle.toLowerCase(),
                            );

                            if (exactRowIdx >= 0) {
                              // Navigate with ArrowDown from top (row 0)
                              for (let s = 0; s < exactRowIdx; s++) {
                                await this.page!.keyboard.press("ArrowDown");
                                await this.wait(30);
                              }
                              logger.info(
                                `Re-selected correct article at row ${exactRowIdx} via keyboard`,
                              );
                            }

                            await this.page!.keyboard.press("Tab");

                            // Wait for callbacks again
                            try {
                              await this.page!.waitForFunction(
                                () => {
                                  const w = window as any;
                                  const col =
                                    w.ASPxClientControl?.GetControlCollection?.();
                                  if (
                                    !col ||
                                    typeof col.ForEachControl !== "function"
                                  )
                                    return true;
                                  let busy = false;
                                  col.ForEachControl((c: any) => {
                                    try {
                                      if (c.InCallback?.()) busy = true;
                                    } catch {}
                                    try {
                                      const gv = c.GetGridView?.();
                                      if (gv?.InCallback?.()) busy = true;
                                    } catch {}
                                  });
                                  return !busy;
                                },
                                { timeout: 8000, polling: 100 },
                              );
                            } catch {
                              // proceed
                            }

                            // Final verification
                            const finalArticle = await this.page!.evaluate(
                              (fieldId: string) => {
                                const input = document.getElementById(
                                  fieldId,
                                ) as HTMLInputElement | null;
                                return input?.value?.trim() || "";
                              },
                              inventtableInputId,
                            );

                            if (
                              finalArticle.toLowerCase() !==
                              expectedArticle.toLowerCase()
                            ) {
                              logger.error(
                                `Article mismatch persists after retry: expected "${expectedArticle}", got "${finalArticle}"`,
                              );
                            } else {
                              logger.info(
                                `✅ Article corrected: "${finalArticle}"`,
                              );
                            }
                          }
                        } else if (selectedArticle) {
                          logger.info(
                            `✅ Article verified: "${selectedArticle}"`,
                          );
                        }
                      }

                      // Ora leggiamo la quantità DOPO che il callback ha finito
                      const targetQty = item.quantity;
                      const qtyFormatted = targetQty
                        .toString()
                        .replace(".", ",");

                      const currentQty = await this.page!.evaluate(() => {
                        const focused =
                          document.activeElement as HTMLInputElement;
                        return {
                          value: focused?.value || "",
                          id: focused?.id || "",
                          tag: focused?.tagName || "",
                        };
                      });

                      logger.debug(
                        "Quantity field state after variant callback",
                        {
                          currentValue: currentQty.value,
                          fieldId: currentQty.id,
                          fieldTag: currentQty.tag,
                          targetQty,
                        },
                      );

                      const qtyNum = Number.parseFloat(
                        currentQty.value.replace(",", "."),
                      );

                      if (
                        !Number.isFinite(qtyNum) ||
                        Math.abs(qtyNum - targetQty) >= 0.01
                      ) {
                        logger.info(
                          `Setting quantity: ${currentQty.value} → ${targetQty}`,
                        );

                        // Select all text via evaluate (robusto, non dipende da selezione preesistente)
                        await this.page!.evaluate(() => {
                          const input =
                            document.activeElement as HTMLInputElement;
                          if (input?.select) input.select();
                        });

                        // Type la quantità (sostituisce il testo selezionato)
                        await this.page!.keyboard.type(qtyFormatted, {
                          delay: 30,
                        });

                        // Attendere callback post-modifica quantità
                        try {
                          await this.page!.waitForFunction(
                            () => {
                              const w = window as any;
                              const col =
                                w.ASPxClientControl?.GetControlCollection?.();
                              if (
                                !col ||
                                typeof col.ForEachControl !== "function"
                              )
                                return true;
                              let busy = false;
                              col.ForEachControl((c: any) => {
                                try {
                                  if (c.InCallback?.()) busy = true;
                                } catch {}
                              });
                              return !busy;
                            },
                            { timeout: 5000, polling: 100 },
                          );
                        } catch {
                          // proceed
                        }

                        // VERIFICA: rileggiamo il valore per confermare che è persistito
                        const verifyQty = await this.page!.evaluate(() => {
                          const input =
                            document.activeElement as HTMLInputElement;
                          return input?.value || "";
                        });
                        const verifyNum = Number.parseFloat(
                          verifyQty.replace(",", "."),
                        );

                        if (Math.abs(verifyNum - targetQty) >= 0.01) {
                          logger.warn(
                            `⚠️ Quantity verification FAILED: expected ${targetQty}, got ${verifyQty}. Retrying...`,
                          );

                          // Retry: select all + retype
                          await this.page!.evaluate(() => {
                            const input =
                              document.activeElement as HTMLInputElement;
                            if (input?.select) input.select();
                          });
                          await this.page!.keyboard.type(qtyFormatted, {
                            delay: 50,
                          });
                          await this.wait(300);

                          // Seconda verifica
                          const retryQty = await this.page!.evaluate(() => {
                            const input =
                              document.activeElement as HTMLInputElement;
                            return input?.value || "";
                          });
                          logger.info(
                            `Quantity after retry: ${retryQty} (target: ${targetQty})`,
                          );
                        } else {
                          logger.info(
                            `✅ Quantity verified: ${verifyQty} (target: ${targetQty})`,
                          );
                        }
                      } else {
                        logger.info(
                          `⚡ Quantity already correct: ${currentQty.value} (target: ${targetQty})`,
                        );
                      }

                      // Edit discount se presente (5.6 integrato)
                      const hasDiscount =
                        item.discount !== undefined && item.discount > 0;
                      if (hasDiscount) {
                        logger.debug(`Setting discount: ${item.discount}%`);

                        // Find the visible MANUALDISCOUNT input (template editor)
                        const discInputId = await this.page!.evaluate(() => {
                          const inputs = Array.from(
                            document.querySelectorAll('input[type="text"]'),
                          ) as HTMLInputElement[];
                          const d = inputs.find((inp) => {
                            const id = inp.id.toLowerCase();
                            return (
                              id.includes("manualdiscount") &&
                              id.includes("salesline") &&
                              inp.offsetParent !== null
                            );
                          });
                          return d?.id || null;
                        });

                        if (discInputId) {
                          const discountStr = item.discount!.toString();
                          const MAX_DISCOUNT_ATTEMPTS = 3;
                          let discountConfirmed = false;

                          for (
                            let attempt = 1;
                            attempt <= MAX_DISCOUNT_ATTEMPTS;
                            attempt++
                          ) {
                            // Double-click to enter edit mode on the spin editor
                            const discCoord = await this.page!.evaluate(
                              (inputId: string) => {
                                const inp = document.getElementById(
                                  inputId,
                                ) as HTMLInputElement;
                                if (!inp) return null;
                                inp.scrollIntoView({ block: "center" });
                                const r = inp.getBoundingClientRect();
                                return {
                                  x: r.x + r.width / 2,
                                  y: r.y + r.height / 2,
                                };
                              },
                              discInputId,
                            );

                            if (discCoord) {
                              await this.page!.mouse.click(
                                discCoord.x,
                                discCoord.y,
                                { clickCount: 2 },
                              );
                              await this.wait(300);
                            }

                            // Select all + paste discount value via insertText
                            // Use Control (not Meta) — bot runs on Linux VPS
                            await this.page!.keyboard.down("Control");
                            await this.page!.keyboard.press("a");
                            await this.page!.keyboard.up("Control");
                            await this.wait(50);

                            await this.page!.evaluate((val: string) => {
                              document.execCommand("insertText", false, val);
                            }, discountStr);
                            await this.wait(200);

                            // Enter to confirm the value in the spin editor
                            await this.page!.keyboard.press("Enter");

                            // Smart wait: poll the input value until it reflects
                            // the discount (SpinEdit formats e.g. "63,00 %").
                            // This replaces a fixed wait and adapts to server speed.
                            const confirmed = await this.page!.waitForFunction(
                              (inputId: string, target: string) => {
                                const inp = document.getElementById(
                                  inputId,
                                ) as HTMLInputElement;
                                if (!inp) return false;
                                const val = inp.value
                                  .replace(/[^0-9.,]/g, "")
                                  .replace(",", ".");
                                const num = parseFloat(val);
                                return num === parseFloat(target);
                              },
                              { timeout: 3000 },
                              discInputId,
                              discountStr,
                            )
                              .then(() => true)
                              .catch(() => false);

                            const discAfter = await this.page!.evaluate(
                              (inputId: string) =>
                                (
                                  document.getElementById(
                                    inputId,
                                  ) as HTMLInputElement
                                )?.value || "",
                              discInputId,
                            );

                            if (confirmed) {
                              logger.info(
                                `✅ Discount set: ${item.discount}% (${discAfter}) [attempt ${attempt}]`,
                              );
                              discountConfirmed = true;
                              break;
                            }

                            logger.warn(
                              `⚠️ Discount attempt ${attempt}/${MAX_DISCOUNT_ATTEMPTS} failed: read "${discAfter}" instead of ${item.discount}%`,
                            );
                          }

                          if (!discountConfirmed) {
                            logger.error(
                              `❌ Discount NOT set after ${MAX_DISCOUNT_ATTEMPTS} attempts for ${item.discount}%`,
                            );
                          }
                        } else {
                          logger.warn(
                            `⚠️ MANUALDISCOUNT input not found, discount not set`,
                          );
                        }
                      }

                      // Save row via UpdateEdit
                      // DOM click is primary strategy — it returns immediately
                      // while the server processes the callback asynchronously.
                      // The API approach (grid.UpdateEdit()) can block the JS
                      // thread and freeze the page after several articles.
                      logger.debug("Saving row via UpdateEdit...");

                      let updateDone = false;

                      // Strategy 0: DOM-based click (primary — non-blocking)
                      const updateResult =
                        await this.clickDevExpressGridCommand({
                          command: "UpdateEdit",
                          baseIdHint: "SALESLINEs",
                          timeout: 7000,
                          label: `item-${i}-update-integrated`,
                        });

                      if (updateResult.clicked) {
                        logger.info("✅ UpdateEdit via DOM click");
                        updateDone = true;
                        // Wait for the grid to finish its server callback.
                        // With slowMo reduced from 200→50ms, the bot fires
                        // operations much faster; the ERP needs time to complete
                        // UpdateEdit callbacks especially on paginated grids (20+ rows).
                        if (this.salesLinesGridName) {
                          await this.waitForGridCallback(
                            this.salesLinesGridName,
                            20000,
                          );
                        }
                        await this.waitForDevExpressIdle({
                          timeout: 4000,
                          label: `item-${i}-row-saved`,
                        });
                      }

                      // Fallback: DevExpress API
                      if (!updateDone && this.salesLinesGridName) {
                        try {
                          updateDone = await this.gridUpdateEdit();
                          if (updateDone) {
                            logger.info(
                              "✅ UpdateEdit via DevExpress API (fallback)",
                            );
                          }
                        } catch (err) {
                          logger.warn("UpdateEdit failed (both DOM and API)", {
                            error:
                              err instanceof Error ? err.message : String(err),
                          });
                        }
                      }

                      if (!updateDone) {
                        await this.page!.screenshot({
                          path: `logs/update-button-not-found-${Date.now()}.png`,
                          fullPage: true,
                        });
                        throw new Error(
                          'Button "Update" not found (both DOM and API failed)',
                        );
                      }

                      await this.wait(200);

                      selection = {
                        found: true,
                        reason,
                        rowIndex: chosen.index,
                        rowsCount,
                        contentIndex: chosen.contentIndex,
                        packIndex: chosen.packIndex,
                        multipleIndex: chosen.multipleIndex,
                        contentValue: chosen.contentValue,
                        packValue: chosen.packValue,
                        multipleValue: chosen.multipleValue,
                        suffixCellIndex: chosen.suffixCellIndex,
                        suffixNeighborValue: chosen.suffixNeighborValue,
                        rowText: chosen.rowText,
                        containerId:
                          keyboardState.containerId ||
                          snapshot.containerId ||
                          "",
                        rowId: chosen.rowId || "",
                        headerTexts: snapshot.headerTexts,
                        rowSamples: candidates
                          .slice(0, 3)
                          .map((entry) => entry.rowText),
                      };
                    }
                  }

                  lastSelection = selection || null;
                  rowSelected = Boolean(selection?.found);

                  if (selection?.found) {
                    logger.info("✅ Variant row selected", {
                      reason: selection.reason,
                      rowIndex: selection.rowIndex,
                      rowsCount: selection.rowsCount,
                      contentValue: selection.contentValue,
                      packValue: selection.packValue,
                      multipleValue: selection.multipleValue,
                      suffixNeighborValue: selection.suffixNeighborValue,
                      variantSuffix,
                      packageContent: selectedVariant.packageContent,
                      multipleQty: selectedVariant.multipleQty,
                    });

                    if (selection.reason && weakReasons.has(selection.reason)) {
                      logger.warn("⚠️ Variant match reason is weak", {
                        reason: selection.reason,
                        variantId: selectedVariant.id,
                        variantSuffix,
                        packageContent: selectedVariant.packageContent,
                        multipleQty: selectedVariant.multipleQty,
                      });
                    }
                  } else if (selection) {
                    logger.warn("Variant row not found on current page", {
                      rowsCount: selection.rowsCount,
                      headerTexts: selection.headerTexts,
                      rowSamples: selection.rowSamples,
                      variantSuffix,
                      packageContent: selectedVariant.packageContent,
                      multipleQty: selectedVariant.multipleQty,
                    });
                  }

                  if (rowSelected) {
                    logger.info(`✅ Variant found on page ${currentPage}`);
                    break;
                  }

                  // Cerca next page (strategie unificate)
                  logger.debug(
                    `Variant not found on page ${currentPage}, checking for next page...`,
                  );

                  const nextPageClicked = await this.page!.evaluate(() => {
                    // Strategy 1: img alt="Next"
                    const images = Array.from(document.querySelectorAll("img"));
                    for (const img of images) {
                      const alt = img.getAttribute("alt") || "";
                      const className = img.className || "";

                      if (alt === "Next" || className.includes("pNext")) {
                        const parent = img.parentElement;
                        if (parent && parent.offsetParent !== null) {
                          const isDisabled =
                            parent.className.includes("dxp-disabled");
                          if (!isDisabled) {
                            (parent as HTMLElement).click();
                            return true;
                          }
                        }
                      }
                    }

                    // Strategy 2: button onclick PBN
                    const buttons = Array.from(
                      document.querySelectorAll(
                        "a.dxp-button, button.dxp-button",
                      ),
                    );
                    for (const btn of buttons) {
                      const onclick =
                        (btn as HTMLElement).getAttribute("onclick") || "";
                      const className = (btn as HTMLElement).className || "";
                      const isNextButton =
                        onclick.includes("'PBN'") || onclick.includes('"PBN"');
                      const isDisabled = className.includes("dxp-disabled");

                      if (
                        isNextButton &&
                        !isDisabled &&
                        (btn as HTMLElement).offsetParent !== null
                      ) {
                        (btn as HTMLElement).click();
                        return true;
                      }
                    }

                    return false;
                  });

                  if (!nextPageClicked) {
                    logger.debug("No next page available");
                    break;
                  }

                  // Aspetta caricamento nuova pagina
                  await this.waitForDevExpressIdle({
                    timeout: 3000, // Ridotto da 6000ms
                    label: `item-${i}-variant-pagination-${currentPage + 1}`,
                  });
                  currentPage++;
                }

                if (!rowSelected) {
                  await this.page!.screenshot({
                    path: `logs/variant-not-found-${Date.now()}.png`,
                    fullPage: true,
                  });
                  throw new Error(
                    `Variant ${variantSuffix} (package=${selectedVariant.packageContent}) not found in dropdown after searching ${currentPage} page(s). ` +
                      `Article: ${item.articleCode}, Full Variant ID: ${selectedVariant.id}`,
                  );
                }

                // Popola metadata articolo
                item.articleId = selectedVariant.id;
                item.packageContent = selectedVariant.packageContent
                  ? parseInt(selectedVariant.packageContent)
                  : undefined;

                logger.info(
                  `✅ Article variant selected`,
                  {
                    variantId: selectedVariant.id,
                    variantSuffix: variantSuffix,
                    packageContent: selectedVariant.packageContent,
                  },
                  "form.article",
                );
              },
              "form.article",
            );

            // Cleanup stale dropdowns between articles to prevent DOM bloat
            await this.cleanupStaleDropdowns();

            // Log DOM node count every 5 articles to monitor bloat growth
            if ((i + 1) % 5 === 0) {
              try {
                const session = await this.page!.createCDPSession();
                const counters = await session.send('Memory.getDOMCounters') as { nodes: number; jsEventListeners: number };
                await session.detach();
                logger.info(`DOM health after article ${i + 1}/${itemsToOrder.length}`, {
                  domNodes: counters.nodes,
                  jsListeners: counters.jsEventListeners,
                });
              } catch {
                // Non-critical
              }
            }

            // 5.7b: Periodic form save every 10 articles to flush DevExpress DOM bloat.
            // After 10+ articles, accumulated dropdowns/popups/editors cause
            // Runtime.callFunctionOn timeouts (>5min protocolTimeout).
            // "Salvare" triggers a form-level callback that re-renders the grid cleanly.
            const PERIODIC_SAVE_EVERY = 10;
            const articleNum = i + 1; // 1-based
            if (
              articleNum % PERIODIC_SAVE_EVERY === 0 &&
              i < itemsToOrder.length - 1
            ) {
              await this.runOp(
                `order.periodic_save_after_${articleNum}`,
                async () => {
                  logger.info(
                    `🔄 Periodic save after ${articleNum} articles to flush DOM`,
                  );
                  // Wait for any active loading/AJAX to finish before opening dropdown
                  await this.waitForDevExpressIdle({
                    timeout: 10000,
                    label: `pre-periodic-save-idle-${articleNum}`,
                  });
                  await this.clickSaveOnly();
                  await this.waitForDevExpressIdle({
                    timeout: 20000,
                    label: `periodic-save-${articleNum}`,
                  });

                  // Grid was re-rendered by the save — re-discover it
                  await this.discoverSalesLinesGrid();

                  const savedCount = await this.getSavedArticleCount();
                  logger.info(
                    `After periodic save: ${savedCount} articles in grid (expected ${articleNum})`,
                  );
                  if (savedCount < articleNum) {
                    throw new Error(
                      `Periodic save data loss: ${savedCount} articles in grid, expected ${articleNum}`,
                    );
                  }

                  // Navigate to last page and create new row for next article
                  await this.gridGotoLastPage();
                  if (this.salesLinesGridName) {
                    await this.gridAddNewRow();
                  } else {
                    const addResult = await this.clickDevExpressGridCommand({
                      command: "AddNew",
                      baseIdHint: "SALESLINEs",
                      timeout: 7000,
                      label: `periodic-save-addnew-${articleNum}`,
                    });
                    if (!addResult.clicked) {
                      throw new Error(
                        `AddNew failed after periodic save at article ${articleNum}`,
                      );
                    }
                  }
                  await this.waitForDevExpressIdle({
                    timeout: 6000,
                    label: `post-periodic-save-idle-${articleNum}`,
                  });

                  logger.info(
                    `✅ Periodic save complete, ready for article ${articleNum + 1}`,
                  );
                },
                "form.periodic-save",
              );

              // Skip normal click_new_for_next — we already created AddNew above
              break; // Exit retry loop — for loop advances to i+1
            }

            // 5.8: Add new row for next article (if not last)
            if (i < itemsToOrder.length - 1) {
              await this.runOp(
                `order.item.${i}.click_new_for_next`,
                async () => {
                  logger.debug(`Adding new row for article ${i + 2}...`);

                  // DOM click is primary strategy — it returns immediately
                  // while the server processes the callback asynchronously.
                  // The API approach (grid.AddNewRow()) can block the JS thread
                  // and freeze the page after several articles.
                  // See: successful 27-item orders before bcf4a05 refactoring.

                  // Ensure edit row is closed before creating a new one
                  try {
                    await this.page!.waitForFunction(
                      () => {
                        const editRows = Array.from(
                          document.querySelectorAll('tr[id*="editnew"]'),
                        ).filter(
                          (row) => (row as HTMLElement).offsetParent !== null,
                        );
                        return editRows.length === 0;
                      },
                      { timeout: 3000 },
                    );
                  } catch {
                    logger.warn(
                      "Edit row still visible before AddNew; proceeding",
                    );
                  }

                  // Strategy 0: DOM-based click (primary — non-blocking)
                  let addNewDone = false;
                  const newCommandResult =
                    await this.clickDevExpressGridCommand({
                      command: "AddNew",
                      baseIdHint: "SALESLINEs",
                      timeout: 7000,
                      label: `item-${i}-new-command`,
                    });

                  if (newCommandResult.clicked) {
                    addNewDone = true;
                    logger.info(
                      `✅ AddNewRow via DOM click for article ${i + 2}`,
                    );
                  }

                  // Fallback: DevExpress API
                  if (!addNewDone && this.salesLinesGridName) {
                    try {
                      addNewDone = await this.gridAddNewRow();
                      if (addNewDone) {
                        logger.info(
                          `✅ AddNewRow via API for article ${i + 2} (fallback)`,
                        );
                      }
                    } catch (err) {
                      logger.warn("AddNewRow failed (both DOM and API)", {
                        error: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }

                  if (!addNewDone) {
                    await this.page!.screenshot({
                      path: `logs/new-button-for-next-not-found-${Date.now()}.png`,
                      fullPage: true,
                    });
                    throw new Error(
                      `AddNew failed for article ${i + 2} (both DOM and API failed)`,
                    );
                  }

                  // Wait for new editable row to appear
                  try {
                    await this.page!.waitForFunction(
                      () => {
                        const editRows =
                          document.querySelectorAll('tr[id*="editnew"]');
                        return editRows.length > 0;
                      },
                      { timeout: 5000, polling: 100 },
                    );
                    logger.debug("✅ New editable row detected");
                  } catch {
                    logger.warn(
                      "editnew row not detected after AddNew, proceeding",
                    );
                  }

                  // Wait for DevExpress to finish rendering the editor
                  // (mirrors the initial AddNew flow which also waits for idle)
                  await this.waitForDevExpressIdle({
                    timeout: 6000,
                    label: `post-addnew-idle-${i}`,
                  });

                  // Wait for INVENTTABLE editor to be rendered in the new row
                  try {
                    await this.page!.waitForFunction(
                      () => {
                        const inputs = Array.from(
                          document.querySelectorAll(
                            'input[id*="INVENTTABLE"][id$="_I"]',
                          ),
                        );
                        return inputs.some(
                          (inp) =>
                            (inp as HTMLElement).offsetParent !== null &&
                            (inp as HTMLElement).offsetWidth > 0,
                        );
                      },
                      { timeout: 5000, polling: 200 },
                    );
                    logger.debug("✅ INVENTTABLE editor visible in new row");
                  } catch {
                    logger.warn(
                      "INVENTTABLE editor not yet visible after AddNew, will retry in focus step",
                    );
                  }

                  logger.info(`✅ Ready for article ${i + 2}`);
                },
                "multi-article-navigation",
              );
            }

            break; // Article succeeded — exit retry loop
          } catch (articleError) {
            const isTimeout =
              articleError instanceof Error &&
              (articleError.message.toLowerCase().includes("timed out") ||
                articleError.message.toLowerCase().includes("timeout"));

            if (articleRetries >= maxArticleRetries || !isTimeout) {
              throw articleError;
            }

            articleRetries++;
            logger.warn(
              `Article ${i + 1} timeout, retrying (${articleRetries}/${maxArticleRetries})...`,
            );

            try {
              await this.page!.screenshot({
                path: `logs/article-timeout-retry-${i}-${Date.now()}.png`,
                fullPage: true,
              });
            } catch {
              // Screenshot is best-effort
            }

            await this.page!.reload({
              waitUntil: "networkidle0",
              timeout: 30000,
            });
            await this.waitForDevExpressIdle({
              timeout: 10000,
              label: "post-reload",
            });

            await this.discoverSalesLinesGrid();

            const savedCount = await this.getSavedArticleCount();
            logger.info(
              `After reload: ${savedCount} articles already in grid, expected ${i} or ${i + 1}`,
            );

            if (savedCount > i) {
              logger.info(
                `Article ${i + 1} was already saved, skipping to next`,
              );

              // Create new editing row for the next article since
              // step 5.8 (click_new_for_next) was not completed before the timeout
              if (i < itemsToOrder.length - 1) {
                await this.gridGotoLastPage();
                if (this.salesLinesGridName) {
                  await this.gridAddNewRow();
                } else {
                  const addResult = await this.clickDevExpressGridCommand({
                    command: "AddNew",
                    baseIdHint: "SALESLINEs",
                    timeout: 7000,
                    label: `skip-addnew-${i}`,
                  });
                  if (!addResult.clicked) {
                    throw new Error("AddNew failed after skip");
                  }
                }
                await this.waitForDevExpressIdle({
                  timeout: 6000,
                  label: `post-skip-addnew-idle-${i}`,
                });
              }

              break; // Exit retry loop — for loop will advance to i+1
            }

            await this.gridGotoLastPage();

            if (this.salesLinesGridName) {
              await this.gridAddNewRow();
            } else {
              const addResult = await this.clickDevExpressGridCommand({
                command: "AddNew",
                baseIdHint: "SALESLINEs",
                timeout: 7000,
                label: `retry-addnew-${i}`,
              });
              if (!addResult.clicked) {
                throw new Error("AddNew failed after reload");
              }
            }
            await this.wait(500);
            continue; // Retry the article
          }
        } // end while (retry loop)
      }

      await this.emitProgress("form.articles.complete");

      // STEP 9: Extract order ID before saving (while still on form)
      await this.runOp(
        "order.extract_id",
        async () => {
          const currentUrl = this.page!.url();
          logger.debug(`Current URL before save: ${currentUrl}`);

          // Try to extract order ID from URL (if already saved with "Salva")
          const urlMatch = currentUrl.match(/ObjectKey=([^&]+)/);
          if (urlMatch) {
            orderId = decodeURIComponent(urlMatch[1]);
            logger.info(`✅ Order ID extracted from URL: ${orderId}`);
            return;
          }

          // Try to extract from page elements (order form fields)
          const extractedId = await this.page!.evaluate(() => {
            // Look for "Numero ordine cliente" or "ID" field
            const inputs = Array.from(
              document.querySelectorAll('input[type="text"]'),
            );

            // Find ID field (usually labeled as "ID" and has a numeric value)
            for (const input of inputs) {
              const htmlInput = input as HTMLInputElement;
              const id = htmlInput.id || "";

              // Look for ID field pattern
              if (id.includes("dviID_") || id.includes("SALESID_")) {
                const value = htmlInput.value?.trim();
                if (value && value !== "0" && value !== "") {
                  return { source: "form_field", value, fieldId: id };
                }
              }
            }

            return null;
          });

          if (extractedId) {
            orderId = extractedId.value;
            logger.info(
              `✅ Order ID extracted from form: ${orderId}`,
              {
                source: extractedId.source,
                fieldId: extractedId.fieldId,
              },
              "form.submit",
            );
            return;
          }

          // Fallback: use timestamp
          logger.warn("Order ID not found in URL or form, using timestamp");
          orderId = `ORDER-${Date.now()}`;
        },
        "form.submit",
      );

      // STEP 9.4: Fill order notes (no shipping + notes)
      // Fill notes BEFORE the N/A workaround — after the workaround's double save,
      // DevExpress regenerates the Panoramica tab DOM on click, destroying note fields.
      // We're still on Panoramica after STEP 9, so the form is stable.
      const notesText = buildOrderNotesText(orderData.noShipping, orderData.notes);
      if (notesText) {
        await this.emitProgress('form.notes');
        await this.fillOrderNotes(notesText);

        // STEP 9.45: Save to persist notes before the N/A workaround's double save
        await this.clickSaveOnly();
        await this.waitForDevExpressIdle({ timeout: 15000, label: 'save-after-notes' });
      }

      // STEP 9.5: N/A line discount workaround
      // Go to "Prezzi e sconti" tab, check LINEDISC value and article SCONTO %.
      // If "Discount to get street price" with 20% on articles → clear LINEDISC, save — repeat until clean.
      // If already N/A/null with 0% on articles → skip.
      // IMPORTANT: After each save, DevExpress may switch back to Panoramica tab,
      // so we must re-open "Prezzi e sconti" before every round.
      {
        try {
          await this.runOp(
            "order.na_discount_workaround",
            async () => {
              const checkArticlesHave20Percent = async (): Promise<boolean> => {
                return this.page!.evaluate(() => {
                  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
                  for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    for (const cell of cells) {
                      const text = (cell.textContent || '').trim();
                      if (text.match(/^20[.,]00\s*%$/)) return true;
                    }
                  }
                  return false;
                });
              };

              const openTabAndWait = async (label: string) => {
                const opened = await openPrezziEScontiTab();
                if (!opened) {
                  logger.warn(`"Prezzi e sconti" tab not found at ${label}`);
                }
                await this.waitForDevExpressIdle({ timeout: 10000, label });
                return opened;
              };

              await openTabAndWait("na-open-tab-initial");

              // Read LINEDISC value
              const lineDiscValue = await this.page!.evaluate(() => {
                const input = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement | null;
                return input?.value?.trim() || '';
              });
              logger.info('LINEDISC current value', { lineDiscValue });

              const isAlreadyNA = lineDiscValue.toUpperCase() === 'N/A' || lineDiscValue === '';

              if (isAlreadyNA) {
                const hasNonZeroDiscount = await checkArticlesHave20Percent();
                if (!hasNonZeroDiscount) {
                  logger.info('LINEDISC already N/A and articles have 0% discount — skipping workaround');
                  return;
                }
                logger.warn('LINEDISC is N/A but articles still have 20% — proceeding with workaround');
              }

              // Clear LINEDISC using the DevExpress "Clear" button (B1).
              // The LINEDISC is a xafLookupEditor — synthetic .click() on the dropdown
              // button doesn't open the popup (DevExpress needs real mouse events).
              // The Clear button has an inline onclick calling ASPx.BEClick() which
              // properly resets the hidden _VI value and triggers server-side recalculation.
              const clearLineDisc = async (): Promise<boolean> => {
                const clearResult = await this.page!.evaluate(() => {
                  // Find the Clear button (B1, not B-1 which is the dropdown button)
                  const clearBtn = document.querySelector('td[id*="LINEDISC"][id$="_B1"]') as HTMLElement | null;
                  if (clearBtn) {
                    clearBtn.scrollIntoView({ block: 'center' });
                    clearBtn.click();
                    return { strategy: 'clear-button', id: clearBtn.id };
                  }
                  // Fallback: call ASPx.BEClick directly by finding the control name
                  const input = document.querySelector('input[id*="LINEDISC"][id$="_I"]') as HTMLInputElement | null;
                  if (input) {
                    // Extract the DevExpress control name from the input id (remove _I suffix)
                    const controlName = input.id.replace(/_I$/, '');
                    (window as any).ASPx?.BEClick(controlName, 1);
                    return { strategy: 'aspx-beclick', controlName };
                  }
                  return null;
                });
                if (clearResult) {
                  logger.info('LINEDISC Clear button clicked', clearResult);
                } else {
                  logger.warn('LINEDISC Clear button not found — tab may not be active');
                }
                await this.waitForDevExpressIdle({ timeout: 10000, label: 'linedisc-clear' });
                return clearResult !== null;
              };

              const saveWithRetry = async (label: string) => {
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    await this.clickSaveOnly();
                    return;
                  } catch (saveError) {
                    logger.warn(`${label} save attempt ${attempt}/3 failed`, {
                      error: saveError instanceof Error ? saveError.message : String(saveError),
                    });
                    if (attempt === 3) throw saveError;
                    await this.wait(2000);
                    await this.waitForDevExpressIdle({ timeout: 10000, label: `${label}-retry-idle-${attempt}` });
                  }
                }
              };

              // Round 1: clear first row discount + save.
              // Round 2: clear remaining rows discount + save.
              // Re-open tab before each round because save switches back to Panoramica.
              const MAX_ROUNDS = 3;
              for (let round = 1; round <= MAX_ROUNDS; round++) {
                logger.debug(`LINEDISC workaround round ${round}/${MAX_ROUNDS}...`);

                await openTabAndWait(`na-reopen-tab-round-${round}`);

                const cleared = await clearLineDisc();
                if (!cleared) {
                  logger.warn(`LINEDISC Clear button not found in round ${round} — retrying after tab reopen`);
                  await this.wait(1000);
                  await openTabAndWait(`na-reopen-tab-round-${round}-retry`);
                  await clearLineDisc();
                }

                await saveWithRetry(`linedisc-round-${round}`);
                await this.waitForDevExpressIdle({ timeout: 15000, label: `save-after-clear-${round}` });
              }

              // Verification: re-open tab and check articles no longer have 20%
              await openTabAndWait("na-verify-tab");
              const stillHas20 = await checkArticlesHave20Percent();
              if (stillHas20) {
                logger.error('LINEDISC workaround FAILED — articles still show 20% discount after all rounds');
              } else {
                logger.info('LINEDISC workaround verified — no 20% discount found on articles');
              }
            },
            "form.discount",
          );
        } catch (naError) {
          logger.warn("N/A discount workaround failed (non-fatal, continuing)", {
            errorMessage: naError instanceof Error ? naError.message : String(naError),
          });
        }
      }

      // STEP 9.6: Apply global discount (if specified)
      // Must be AFTER N/A workaround to avoid being overwritten by the double-save.
      if (orderData.discountPercent && orderData.discountPercent > 0) {
        await this.runOp(
          "order.apply_global_discount",
          async () => {
            logger.debug(`Applying global discount: ${orderData.discountPercent}%`);

            // Ensure we're on Prezzi e sconti tab
            await openPrezziEScontiTab();
            await this.waitForDevExpressIdle({ timeout: 5000, label: "pre-global-discount" });

            // Find MANUALDISCOUNT / ENDDISCPERCENT field
            const discountField = await this.page!.evaluate(() => {
              const patterns = ['MANUALDISCOUNT', 'ENDDISCPERCENT', 'ENDDISCP'];
              const all = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
              for (const pattern of patterns) {
                const match = all.find(inp =>
                  inp.id.toUpperCase().includes(pattern) && inp.offsetParent !== null && inp.getBoundingClientRect().width > 0,
                );
                if (match) {
                  match.scrollIntoView({ block: 'center' });
                  match.focus();
                  match.click();
                  return { id: match.id, value: match.value };
                }
              }
              return null;
            });

            if (!discountField) {
              logger.warn('Global discount field not found');
              return;
            }

            const discountFormatted = orderData.discountPercent!.toString().replace('.', ',');
            await this.page!.evaluate((inputId, val) => {
              const input = document.getElementById(inputId) as HTMLInputElement;
              if (input) {
                input.value = val;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, discountField.id, discountFormatted);

            await this.page!.keyboard.press('Tab');
            await this.waitForDevExpressIdle({ timeout: 5000, label: 'global-discount-set' });

            logger.info(`✅ Global discount applied: ${orderData.discountPercent}%`);
          },
          "form.discount",
        );
        await this.emitProgress("form.discount");
      }

      // STEP 9.7: Select delivery address RIGHT BEFORE save.
      // Must be done after all articles (and any periodic saves) because XAF AJAX callbacks
      // during article addition reset the server-side ObjectSpace, reverting any delivery
      // address change made earlier to the customer's default address.
      if (orderData.deliveryAddress) {
        // Ensure we are on the Overview tab so DELIVERYPOSTALADDRESS is in the DOM.
        const navigatedToOverview = await this.page!.evaluate(() => {
          const allLinks = Array.from(document.querySelectorAll('a.dxtc-link, li[id*="_pg_T"] a, li[id*="_pg_AT"] a'));
          const overviewLink = allLinks.find(el => {
            const t = el.textContent?.trim().toLowerCase() ?? '';
            return t === 'overview' || t === 'panoramica' || t === 'panoramique';
          });
          if (overviewLink && (overviewLink as HTMLElement).offsetParent !== null) {
            (overviewLink as HTMLElement).click();
            return true;
          }
          return false;
        });
        if (navigatedToOverview) {
          await this.waitForDevExpressIdle({ label: 'overview-tab-for-delivery-address', timeout: 6000 });
        }
        await this.selectDeliveryAddress(orderData.deliveryAddress);
      }

      // STEP 10: Save and close order
      await this.emitProgress("form.submit.start");

      await this.runOp(
        "order.save_and_close",
        async () => {
          logger.debug('Attempting direct "Salva e chiudi" / "Save and close"...');

          let directSaveClicked = await this.clickElementByText(
            "Salva e chiudi",
            { exact: true, selectors: ["a", "span", "div", "li"] },
          );
          if (!directSaveClicked) {
            directSaveClicked = await this.clickElementByText(
              "Save and close",
              { exact: true, selectors: ["a", "span", "div", "li"] },
            );
          }

          if (directSaveClicked) {
            logger.info('✅ Clicked "Salva e chiudi" / "Save and close" directly');
            await this.wait(this.getSlowdown("click_salva_chiudi"));
            return;
          }

          logger.debug('Opening "Salvare" dropdown...');

          // Find "Salvare" / "Save" button
          const dropdownOpened = await this.page!.evaluate(() => {
            const allElements = Array.from(
              document.querySelectorAll("span, button, a"),
            );
            const salvareBtn = allElements.find((el) => {
              const text = el.textContent?.trim().toLowerCase() || "";
              return text.includes("salvare") || text === "save";
            });

            if (!salvareBtn) return false;

            // Click dropdown popout if available
            const parent = salvareBtn.closest("li") || salvareBtn.parentElement;
            if (!parent) return false;

            const popOut =
              parent.querySelector("div.dxm-popOut") ||
              parent.querySelector('[id*="_P"]');
            if (popOut && (popOut as HTMLElement).offsetParent !== null) {
              (popOut as HTMLElement).click();
              return true;
            }

            // Click dropdown arrow
            const arrow = parent.querySelector(
              'img[id*="_B-1"], img[alt*="down"]',
            );
            if (arrow) {
              (arrow as HTMLElement).click();
              return true;
            }

            // Fallback: click button itself
            (salvareBtn as HTMLElement).click();
            return true;
          });

          if (!dropdownOpened) {
            throw new Error('Button "Salvare" / "Save" not found');
          }

          // Slowdown after salvare dropdown
          await this.wait(this.getSlowdown("click_salvare_dropdown"));

          // Click "Salva e chiudi" / "Save and close"
          let saveClicked = await this.clickElementByText("Salva e chiudi", {
            exact: true,
            selectors: ["a", "span", "div"],
          });
          if (!saveClicked) {
            saveClicked = await this.clickElementByText("Save and close", {
              exact: true,
              selectors: ["a", "span", "div"],
            });
          }

          if (!saveClicked) {
            throw new Error('Option "Salva e chiudi" / "Save and close" not found in dropdown');
          }

          logger.info('✅ Clicked "Salva e chiudi" / "Save and close"');

          // Slowdown after salva e chiudi
          await this.wait(this.getSlowdown("click_salva_chiudi"));
        },
        "form.submit",
      );

      logger.info("🎉 BOT: ORDINE COMPLETATO", { orderId });

      await this.emitProgress("form.submit.complete");

      // Write operation report
      await this.writeOperationReport();

      return orderId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Errore durante creazione ordine", {
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
        orderData,
      });

      // Save screenshot on error
      try {
        await this.page!.screenshot({
          path: `logs/order-error-${Date.now()}.png`,
          fullPage: true,
        });
      } catch (screenshotError) {
        logger.error("Failed to save error screenshot", { screenshotError });
      }

      // Write operation report even on error
      await this.writeOperationReport();

      throw error;
    }
  }

  async getCustomers(): Promise<
    Array<{ id: string; name: string; vatNumber?: string; email?: string }>
  > {
    return this.runOp(
      "getCustomers",
      async () => {
        if (!this.page) {
          throw new Error("Browser non inizializzato");
        }

        // Verifica che la pagina sia ancora valida e ricarica se necessario
        try {
          const url = this.page.url();
          logger.info(`Pagina corrente: ${url}`);
        } catch (error) {
          logger.warn("Frame detached, ricarico la pagina...");
          await this.page.goto(`${config.archibald.url}/`, {
            waitUntil: "networkidle2",
            timeout: 60000,
          });
        }

        logger.info("Navigazione alla pagina clienti...");
        await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView/`, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });

        await this.page.waitForSelector("table", { timeout: 10000 });

        const allCustomers: Array<{
          id: string;
          name: string;
          vatNumber?: string;
          email?: string;
        }> = [];
        let currentPage = 1;
        let hasMorePages = true;

        logger.info("Inizio estrazione clienti con paginazione...");

        while (hasMorePages) {
          logger.info(`Estrazione pagina ${currentPage}...`);

          // Attendi che la tabella sia completamente caricata
          await this.page.waitForSelector("table tbody tr", { timeout: 10000 });

          // Breve pausa per assicurarsi che il DOM sia stabile
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Estrai i clienti dalla pagina corrente
          const pageCustomers = await this.page.evaluate(() => {
            const rows = Array.from(
              document.querySelectorAll("table tbody tr"),
            ) as Element[];
            const results: Array<{
              id: string;
              name: string;
              vatNumber?: string;
              email?: string;
            }> = [];

            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll("td")) as Element[];
              if (cells.length < 3) continue;

              // Dalla screenshot: colonne per indice
              // Col 0: checkbox, Col 1: ID interno, Col 2: NUMERO DI CONTO, Col 3: NOME, Col 4: PARTITA IVA, Col 5: PEC
              const id = (cells[1] as Element)?.textContent?.trim() || "";
              const accountNumber =
                (cells[2] as Element)?.textContent?.trim() || "";
              const name = (cells[3] as Element)?.textContent?.trim() || "";
              const vatNumber =
                (cells[4] as Element)?.textContent?.trim() || "";
              const email = (cells[5] as Element)?.textContent?.trim() || "";

              if (name && (accountNumber || id)) {
                results.push({
                  id: accountNumber || id,
                  name,
                  vatNumber: vatNumber || undefined,
                  email: email || undefined,
                });
              }
            }

            return results;
          });

          logger.info(
            `Estratti ${pageCustomers.length} clienti dalla pagina ${currentPage}`,
          );
          allCustomers.push(...pageCustomers);

          // Verifica se esiste un pulsante "Next" o "Successiva"
          hasMorePages = await this.page.evaluate(() => {
            // Cerca pulsanti di paginazione comuni nei controlli DevExpress
            const nextButtons = [
              document.querySelector('img[alt="Next"]'),
              document.querySelector('img[title="Next"]'),
              document.querySelector('a[title="Next"]'),
              document.querySelector('button[title="Next"]'),
              document.querySelector('.dxp-button.dxp-bi[title*="Next"]'),
              document.querySelector(".dxWeb_pNext_XafTheme"),
            ];

            for (const btn of nextButtons) {
              if (
                btn &&
                !(btn as HTMLElement).classList?.contains("dxp-disabled") &&
                !(btn.parentElement as HTMLElement)?.classList?.contains(
                  "dxp-disabled",
                )
              ) {
                return true;
              }
            }

            return false;
          });

          if (hasMorePages) {
            logger.info("Navigazione alla pagina successiva...");

            // Clicca sul pulsante Next
            const clicked = await this.page.evaluate(() => {
              const nextButtons = [
                document.querySelector('img[alt="Next"]'),
                document.querySelector('img[title="Next"]'),
                document.querySelector('a[title="Next"]'),
                document.querySelector('button[title="Next"]'),
                document.querySelector('.dxp-button.dxp-bi[title*="Next"]'),
                document.querySelector(".dxWeb_pNext_XafTheme"),
              ];

              for (const btn of nextButtons) {
                if (
                  btn &&
                  !(btn as HTMLElement).classList?.contains("dxp-disabled")
                ) {
                  const clickable =
                    btn.tagName === "A" || btn.tagName === "BUTTON"
                      ? btn
                      : btn.closest("a") ||
                        btn.closest("button") ||
                        btn.parentElement;

                  if (clickable) {
                    (clickable as HTMLElement).click();
                    return true;
                  }
                }
              }
              return false;
            });

            if (!clicked) {
              logger.warn(
                "Pulsante Next trovato ma non cliccabile, interruzione paginazione",
              );
              hasMorePages = false;
            } else {
              // Attendi che la navigazione completi
              await new Promise((resolve) => setTimeout(resolve, 1000));
              await this.page.waitForSelector("table tbody tr", {
                timeout: 10000,
              });
              currentPage++;
            }
          }

          // Limite di sicurezza per evitare loop infiniti (max 100 pagine)
          if (currentPage > 100) {
            logger.warn(
              "Raggiunto limite di 100 pagine, interruzione paginazione",
            );
            hasMorePages = false;
          }
        }

        logger.info(
          `Estrazione completata: ${allCustomers.length} clienti totali da ${currentPage} pagine`,
        );
        return allCustomers;
      },
      "operation",
    );
  }

  private deleteOrderFilterReady = false;

  async deleteOrderFromArchibald(
    archibaldOrderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedId = archibaldOrderId.replace(/\./g, "");
    logger.info(
      `[deleteOrder] Deleting order ${archibaldOrderId} (normalized: ${normalizedId}) from Archibald...`,
    );

    if (!this.page) {
      return { success: false, message: "Browser page not initialized" };
    }

    try {
      // Step 1: Navigate to SALESTABLE_ListView_Agent (only if not already there)
      const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
      if (!this.page.url().includes("SALESTABLE_ListView_Agent")) {
        logger.debug("[deleteOrder] Navigating to orders list...");
        await this.emitProgress("delete.navigation");
        await this.page.goto(ordersUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await this.page.waitForFunction(
          () => {
            const elements = Array.from(
              document.querySelectorAll("span, button, a"),
            );
            return elements.some(
              (el) => { const t = el.textContent?.trim().toLowerCase() ?? ""; return t === "nuovo" || t === "new"; },
            );
          },
          { timeout: 15000 },
        );
        await this.wait(500);
        this.deleteOrderFilterReady = false;
      }

      // Step 2: Set filter to "Tutti gli ordini" (skip if already done)
      if (!this.deleteOrderFilterReady) {
        logger.debug("[deleteOrder] Setting filter to 'Tutti gli ordini'...");
        await this.emitProgress("delete.filter");
        await this.ensureOrdersFilterSetToAll(this.page);
        await this.wait(500);
        this.deleteOrderFilterReady = true;
      }

      // Step 3: Find the search input and paste the normalized ID
      logger.debug(`[deleteOrder] Searching for order ${normalizedId}...`);
      await this.emitProgress("delete.search");

      const searchSelector = "#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I";
      const searchHandle = await this.page
        .waitForSelector(searchSelector, { timeout: 5000, visible: true })
        .catch(() => null);

      if (!searchHandle) {
        await this.page.screenshot({
          path: `logs/delete-order-search-not-found-${Date.now()}.png`,
          fullPage: true,
        });
        return {
          success: false,
          message: "Search input not found on orders list page",
        };
      }

      // Record row count before search to detect change
      const rowCountBefore = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      await this.pasteText(searchHandle, normalizedId);
      await this.page.keyboard.press("Enter");

      // Wait for grid to update: either row count changes or loading panel disappears
      await this.page
        .waitForFunction(
          (prevCount: number) => {
            // Check if loading panels are gone
            const loadingPanels = Array.from(
              document.querySelectorAll(
                '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
              ),
            );
            const hasLoading = loadingPanels.some((el) => {
              const style = window.getComputedStyle(el as HTMLElement);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                (el as HTMLElement).getBoundingClientRect().width > 0
              );
            });
            if (hasLoading) return false;

            // Grid has updated if row count changed or empty data row appeared
            const currentCount = document.querySelectorAll(
              'tr[class*="dxgvDataRow"]',
            ).length;
            const hasEmpty =
              document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
            return currentCount !== prevCount || hasEmpty || currentCount <= 5;
          },
          { timeout: 15000, polling: 200 },
          rowCountBefore,
        )
        .catch(() => null);
      await this.wait(300);

      // Step 4: Check if any rows are visible after filtering
      const rowCount = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      if (rowCount === 0) {
        logger.warn(
          `[deleteOrder] No rows found after searching for ${normalizedId}`,
        );
        return {
          success: false,
          message: `Order ${archibaldOrderId} not found in Archibald`,
        };
      }

      logger.debug(`[deleteOrder] Found ${rowCount} row(s) after search`);

      // Step 5: Select the first row by clicking the command column cell
      await this.emitProgress("delete.select");
      const rowSelected = await this.page.evaluate(() => {
        const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
        if (!firstRow) return false;

        const commandCell = firstRow.querySelector(
          "td.dxgvCommandColumn_XafTheme",
        ) as HTMLElement | null;
        if (commandCell) {
          commandCell.click();
          return true;
        }

        const firstCell = firstRow.querySelector("td") as HTMLElement | null;
        if (firstCell) {
          firstCell.click();
          return true;
        }

        return false;
      });

      if (!rowSelected) {
        return {
          success: false,
          message: "Could not select the order row",
        };
      }

      // Wait for "Cancellare" button to become enabled (loses dxm-disabled class)
      await this.page
        .waitForFunction(
          () => {
            const btn = document.querySelector(
              "#Vertical_mainMenu_Menu_DXI1_T",
            );
            return btn && !btn.classList.contains("dxm-disabled");
          },
          { timeout: 5000, polling: 100 },
        )
        .catch(() => null);
      logger.debug("[deleteOrder] Row selected, delete button enabled");

      // Step 6: Set up dialog handler BEFORE clicking delete
      const dialogPromise = new Promise<boolean>((resolve) => {
        let resolved = false;
        const handler = (dialog: any) => {
          if (resolved) return;
          resolved = true;
          logger.debug(
            `[deleteOrder] Dialog appeared: ${dialog.type()} - ${dialog.message()}`,
          );
          dialog.accept();
          resolve(true);
        };
        this.page!.once("dialog", handler);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.page!.off("dialog", handler);
            resolve(false);
          }
        }, 10000);
      });

      // Step 7: Click "Cancellare" button
      logger.debug('[deleteOrder] Clicking "Cancellare" button...');
      await this.emitProgress("delete.confirm");
      const deleteClicked = await this.page.evaluate(() => {
        const deleteBtn = document.querySelector(
          "#Vertical_mainMenu_Menu_DXI1_T",
        ) as HTMLElement | null;
        if (deleteBtn) {
          deleteBtn.click();
          return { clicked: true, strategy: "by-id" };
        }

        const menuLinks = Array.from(
          document.querySelectorAll(
            'a[id*="Vertical_mainMenu"], a[id*="mainMenu_Menu"]',
          ),
        );
        for (const link of menuLinks) {
          const text = link.textContent?.trim().toLowerCase();
          if (
            text === "cancellare" ||
            text === "elimina" ||
            text === "delete"
          ) {
            (link as HTMLElement).click();
            return { clicked: true, strategy: "by-text" };
          }
        }

        return { clicked: false, strategy: "none" };
      });

      if (!deleteClicked.clicked) {
        return {
          success: false,
          message: '"Cancellare" button not found in menu',
        };
      }

      // Step 8: Wait for dialog and handle it
      const dialogHandled = await dialogPromise;
      if (!dialogHandled) {
        logger.warn("[deleteOrder] No confirmation dialog appeared");
      }

      // Step 9: Wait for grid to reflect deletion (rows disappear or empty state)
      await this.page
        .waitForFunction(
          (prevCount: number) => {
            const currentCount = document.querySelectorAll(
              'tr[class*="dxgvDataRow"]',
            ).length;
            const hasEmpty =
              document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
            return currentCount < prevCount || hasEmpty;
          },
          { timeout: 15000, polling: 200 },
          rowCount,
        )
        .catch(() => null);
      await this.wait(300);

      // Step 10: Verify deletion
      await this.emitProgress("delete.verify");
      const remainingRows = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      const emptyMessage = await this.page.evaluate(() => {
        const emptyRow = document.querySelector('tr[class*="dxgvEmptyData"]');
        return emptyRow ? emptyRow.textContent?.trim() : null;
      });

      if (remainingRows === 0 || emptyMessage) {
        logger.info(
          `[deleteOrder] Order ${archibaldOrderId} deleted successfully from Archibald`,
        );
        await this.emitProgress("delete.complete");
        return {
          success: true,
          message: `Order ${archibaldOrderId} deleted from Archibald`,
        };
      }

      logger.warn(
        `[deleteOrder] ${remainingRows} rows still present after deletion attempt`,
      );
      await this.emitProgress("delete.complete");
      return {
        success: true,
        message: `Delete command sent for order ${archibaldOrderId}. ${remainingRows} row(s) remain in grid (may be other orders).`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[deleteOrder] Error deleting order ${archibaldOrderId}:`, {
        error: errorMsg,
      });

      try {
        await this.page!.screenshot({
          path: `logs/delete-order-error-${normalizedId}-${Date.now()}.png`,
          fullPage: true,
        });
      } catch {
        // ignore screenshot errors
      }

      return {
        success: false,
        message: `Error deleting order: ${errorMsg}`,
      };
    }
  }

  private sendToVeronaFilterReady = false;

  async sendOrderToVerona(
    archibaldOrderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedId = archibaldOrderId.replace(/\./g, "");
    logger.info(
      `[sendToVerona] Sending order ${archibaldOrderId} (normalized: ${normalizedId}) to Verona...`,
    );

    if (!this.page) {
      return { success: false, message: "Browser page not initialized" };
    }

    try {
      // Step 1: Navigate to SALESTABLE_ListView_Agent (only if not already there)
      const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
      if (!this.page.url().includes("SALESTABLE_ListView_Agent")) {
        logger.debug("[sendToVerona] Navigating to orders list...");
        await this.emitProgress("sendToVerona.navigation");
        await this.page.goto(ordersUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await this.page.waitForFunction(
          () => {
            const elements = Array.from(
              document.querySelectorAll("span, button, a"),
            );
            return elements.some(
              (el) => { const t = el.textContent?.trim().toLowerCase() ?? ""; return t === "nuovo" || t === "new"; },
            );
          },
          { timeout: 15000 },
        );
        await this.wait(500);
        this.sendToVeronaFilterReady = false;
      }

      // Step 2: Set filter to "Tutti gli ordini" (skip if already done)
      // NOTE: The filter element IDs may change between Archibald versions.
      // If the filter fails, we continue anyway - the grid typically shows all orders.
      if (!this.sendToVeronaFilterReady) {
        logger.debug("[sendToVerona] Setting filter to 'Tutti gli ordini'...");
        await this.emitProgress("sendToVerona.filter");
        await this.ensureOrdersFilterSetToAll(this.page);
        this.sendToVeronaFilterReady = true;
      }

      // Step 3: Find the search input using resilient partial-ID selector
      // Archibald's DevExpress generates dynamic IDs where parts like xaf_a0/xaf_a1 can change.
      // Use partial match on stable ID fragments: "SearchAC" and "Ed_I".
      logger.debug(`[sendToVerona] Searching for order ${normalizedId}...`);
      await this.emitProgress("sendToVerona.search");

      let searchHandle = (await this.page
        .waitForSelector('input[id*="SearchAC"][id*="Ed_I"]', {
          timeout: 15000,
          visible: true,
        })
        .catch(() => null)) as ElementHandle<HTMLInputElement> | null;

      // Fallback: try without visible constraint
      if (!searchHandle) {
        logger.warn(
          "[sendToVerona] Search input not found with visible:true, trying without...",
        );
        searchHandle = (await this.page
          .$('input[id*="SearchAC"][id*="Ed_I"]')
          .catch(() => null)) as ElementHandle<HTMLInputElement> | null;
      }

      // Fallback: exact legacy ID
      if (!searchHandle) {
        logger.warn(
          "[sendToVerona] Partial match failed, trying exact legacy ID...",
        );
        searchHandle = (await this.page
          .$("#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I")
          .catch(() => null)) as ElementHandle<HTMLInputElement> | null;
      }

      if (!searchHandle) {
        const diag = await this.page.evaluate(() => {
          const inputs = Array.from(
            document.querySelectorAll("input"),
          ).map((i) => ({
            id: i.id.substring(0, 80),
            type: i.type,
            value: i.value.substring(0, 50),
          }));
          return {
            url: window.location.href,
            inputCount: inputs.length,
            inputs: inputs.slice(0, 15),
          };
        });
        logger.error(
          "[sendToVerona] Search input not found after all attempts. Page state:",
          diag,
        );
        await this.page.screenshot({
          path: `logs/send-to-verona-search-not-found-${Date.now()}.png`,
          fullPage: true,
        });
        return {
          success: false,
          message: "Search input not found on orders list page",
        };
      }

      const rowCountBefore = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      await this.pasteText(searchHandle, normalizedId);
      await this.page.keyboard.press("Enter");

      await this.page
        .waitForFunction(
          (prevCount: number) => {
            const loadingPanels = Array.from(
              document.querySelectorAll(
                '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
              ),
            );
            const hasLoading = loadingPanels.some((el) => {
              const style = window.getComputedStyle(el as HTMLElement);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                (el as HTMLElement).getBoundingClientRect().width > 0
              );
            });
            if (hasLoading) return false;

            const currentCount = document.querySelectorAll(
              'tr[class*="dxgvDataRow"]',
            ).length;
            const hasEmpty =
              document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
            return currentCount !== prevCount || hasEmpty || currentCount <= 5;
          },
          { timeout: 15000, polling: 200 },
          rowCountBefore,
        )
        .catch(() => null);
      await this.wait(300);

      // Step 4: Check if any rows are visible after filtering
      const rowCount = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      if (rowCount === 0) {
        logger.warn(
          `[sendToVerona] No rows found after searching for ${normalizedId}`,
        );
        return {
          success: false,
          message: `Order ${archibaldOrderId} not found in Archibald`,
        };
      }

      logger.debug(`[sendToVerona] Found ${rowCount} row(s) after search`);

      // Step 5: Select the first row by clicking the command column cell
      await this.emitProgress("sendToVerona.select");
      const rowSelected = await this.page.evaluate(() => {
        const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
        if (!firstRow) return false;

        const commandCell = firstRow.querySelector(
          "td.dxgvCommandColumn_XafTheme",
        ) as HTMLElement | null;
        if (commandCell) {
          commandCell.click();
          return true;
        }

        const firstCell = firstRow.querySelector("td") as HTMLElement | null;
        if (firstCell) {
          firstCell.click();
          return true;
        }

        return false;
      });

      if (!rowSelected) {
        return {
          success: false,
          message: "Could not select the order row",
        };
      }

      // Wait for "invia ordine/i" button (DXI4_T) to become enabled
      await this.page
        .waitForFunction(
          () => {
            const btn = document.querySelector(
              "#Vertical_mainMenu_Menu_DXI4_T",
            );
            if (!btn) return false;
            const li = document.querySelector("#Vertical_mainMenu_Menu_DXI4_");
            return (
              !btn.classList.contains("dxm-disabled") &&
              (!li || !li.classList.contains("dxm-disabled"))
            );
          },
          { timeout: 5000, polling: 100 },
        )
        .catch(() => null);
      logger.debug(
        '[sendToVerona] Row selected, "invia ordine/i" button enabled',
      );

      // Step 6: Set up dialog handler BEFORE clicking send
      await this.emitProgress("sendToVerona.confirm");
      const dialogPromise = new Promise<boolean>((resolve) => {
        let resolved = false;
        const handler = (dialog: any) => {
          if (resolved) return;
          resolved = true;
          logger.debug(
            `[sendToVerona] Dialog appeared: ${dialog.type()} - ${dialog.message()}`,
          );
          dialog.accept();
          resolve(true);
        };
        this.page!.once("dialog", handler);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.page!.off("dialog", handler);
            resolve(false);
          }
        }, 10000);
      });

      // Step 7: Click "invia ordine/i" button
      logger.debug('[sendToVerona] Clicking "invia ordine/i" button...');
      const sendClicked = await this.page.evaluate(() => {
        const sendBtn = document.querySelector(
          "#Vertical_mainMenu_Menu_DXI4_T",
        ) as HTMLElement | null;
        if (sendBtn) {
          sendBtn.click();
          return { clicked: true, strategy: "by-id" };
        }

        const menuLinks = Array.from(
          document.querySelectorAll(
            'a[id*="Vertical_mainMenu"], a[id*="mainMenu_Menu"]',
          ),
        );
        for (const link of menuLinks) {
          const text = link.textContent?.trim().toLowerCase();
          if (
            text === "invia ordine/i" ||
            text === "invia ordini" ||
            text === "invia ordine"
          ) {
            (link as HTMLElement).click();
            return { clicked: true, strategy: "by-text" };
          }
        }

        return { clicked: false, strategy: "none" };
      });

      if (!sendClicked.clicked) {
        return {
          success: false,
          message: '"Invia ordine/i" button not found in menu',
        };
      }

      logger.debug(
        `[sendToVerona] Send button clicked via ${sendClicked.strategy}`,
      );

      // Step 8: Wait for dialog and handle it
      const dialogHandled = await dialogPromise;
      if (dialogHandled) {
        logger.debug("[sendToVerona] Browser dialog accepted");
      } else {
        logger.debug(
          "[sendToVerona] No browser dialog appeared, checking for DevExpress popup...",
        );
        // Try DevExpress popup confirmation
        const dxPopupHandled = await this.page.evaluate(() => {
          const confirmSelectors = [
            'div[id*="Confirm"] a[id*="btnOk"]',
            'div[id*="Dialog"] a[id*="btnOk"]',
            '[class*="dxpc"] a[id*="btnOk"]',
            'div[id*="Confirm"] a[id*="btnYes"]',
            'div[id*="Dialog"] a[id*="btnYes"]',
            '[class*="dxpc"] button',
          ];
          for (const sel of confirmSelectors) {
            const btn = document.querySelector(sel) as HTMLElement | null;
            if (btn && btn.offsetParent !== null) {
              btn.click();
              return { handled: true, selector: sel };
            }
          }
          return { handled: false, selector: "" };
        });
        if (dxPopupHandled.handled) {
          logger.debug(
            `[sendToVerona] DevExpress popup confirmed via ${dxPopupHandled.selector}`,
          );
        } else {
          logger.warn(
            "[sendToVerona] No confirmation dialog or popup appeared",
          );
        }
      }

      // Step 9: Wait for grid to reflect the change
      await this.emitProgress("sendToVerona.verify");
      await this.page
        .waitForFunction(
          (prevCount: number) => {
            const loadingPanels = Array.from(
              document.querySelectorAll(
                '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
              ),
            );
            const hasLoading = loadingPanels.some((el) => {
              const style = window.getComputedStyle(el as HTMLElement);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                (el as HTMLElement).getBoundingClientRect().width > 0
              );
            });
            if (hasLoading) return false;

            const currentCount = document.querySelectorAll(
              'tr[class*="dxgvDataRow"]',
            ).length;
            const hasEmpty =
              document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
            return currentCount < prevCount || hasEmpty;
          },
          { timeout: 15000, polling: 200 },
          rowCount,
        )
        .catch(() => null);
      await this.wait(500);

      // Step 10: Screenshot for audit trail
      try {
        await this.page.screenshot({
          path: `logs/send-to-verona-complete-${normalizedId}-${Date.now()}.png`,
          fullPage: true,
        });
      } catch {
        // ignore screenshot errors
      }

      // Step 11: Verify success
      const remainingRows = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      const emptyMessage = await this.page.evaluate(() => {
        const emptyRow = document.querySelector('tr[class*="dxgvEmptyData"]');
        return emptyRow ? emptyRow.textContent?.trim() : null;
      });

      if (remainingRows === 0 || emptyMessage) {
        logger.info(
          `[sendToVerona] Order ${archibaldOrderId} sent to Verona successfully (grid empty)`,
        );
        await this.emitProgress("sendToVerona.complete");
        return {
          success: true,
          message: `Order ${archibaldOrderId} sent to Verona`,
        };
      }

      logger.info(
        `[sendToVerona] Send command executed for ${archibaldOrderId}. ${remainingRows} row(s) remain in grid.`,
      );
      await this.emitProgress("sendToVerona.complete");
      return {
        success: true,
        message: `Send to Verona command sent for order ${archibaldOrderId}. ${remainingRows} row(s) remain in grid (may be other orders).`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[sendToVerona] Error sending order ${archibaldOrderId}:`, {
        error: errorMsg,
      });

      try {
        await this.page!.screenshot({
          path: `logs/send-to-verona-error-${normalizedId}-${Date.now()}.png`,
          fullPage: true,
        });
      } catch {
        // ignore screenshot errors
      }

      return {
        success: false,
        message: `Error sending order to Verona: ${errorMsg}`,
      };
    }
  }

  private editOrderFilterReady = false;

  async editOrderInArchibald(
    archibaldOrderId: string,
    modifications: Array<
      | {
          type: "update";
          rowIndex: number;
          articleCode: string;
          quantity: number;
          discount?: number;
          productName?: string;
          articleChanged?: boolean;
        }
      | {
          type: "add";
          articleCode: string;
          quantity: number;
          discount?: number;
          productName?: string;
        }
      | { type: "delete"; rowIndex: number }
    >,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedId = archibaldOrderId.replace(/\./g, "");
    logger.info(
      `[editOrder] Editing order ${archibaldOrderId} (normalized: ${normalizedId}) with ${modifications.length} modification(s)...`,
    );

    if (!this.page) {
      return { success: false, message: "Browser page not initialized" };
    }

    try {
      // Step 1: Navigate to SALESTABLE_ListView_Agent
      const ordersUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
      if (!this.page.url().includes("SALESTABLE_ListView_Agent")) {
        logger.debug("[editOrder] Navigating to orders list...");
        await this.emitProgress("edit.navigation");
        await this.page.goto(ordersUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await this.page.waitForFunction(
          () => {
            const elements = Array.from(
              document.querySelectorAll("span, button, a"),
            );
            return elements.some(
              (el) => { const t = el.textContent?.trim().toLowerCase() ?? ""; return t === "nuovo" || t === "new"; },
            );
          },
          { timeout: 15000 },
        );
        await this.wait(500);
        this.editOrderFilterReady = false;
      }

      // Step 2: Set filter to "Tutti gli ordini"
      if (!this.editOrderFilterReady) {
        logger.debug("[editOrder] Setting filter to 'Tutti gli ordini'...");
        await this.emitProgress("edit.filter");
        await this.ensureOrdersFilterSetToAll(this.page);
        await this.wait(500);
        this.editOrderFilterReady = true;
      }

      // Step 3: Search for the order
      logger.debug(`[editOrder] Searching for order ${normalizedId}...`);
      await this.emitProgress("edit.search");

      const searchSelector = "#Vertical_SearchAC_Menu_ITCNT0_xaf_a0_Ed_I";
      const searchHandle = await this.page
        .waitForSelector(searchSelector, { timeout: 5000, visible: true })
        .catch(() => null);

      if (!searchHandle) {
        return {
          success: false,
          message: "Search input not found on orders list page",
        };
      }

      const rowCountBefore = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      await this.pasteText(searchHandle, normalizedId);
      await this.page.keyboard.press("Enter");

      await this.page
        .waitForFunction(
          (prevCount: number) => {
            const loadingPanels = Array.from(
              document.querySelectorAll(
                '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
              ),
            );
            const hasLoading = loadingPanels.some((el) => {
              const style = window.getComputedStyle(el as HTMLElement);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                (el as HTMLElement).getBoundingClientRect().width > 0
              );
            });
            if (hasLoading) return false;
            const currentCount = document.querySelectorAll(
              'tr[class*="dxgvDataRow"]',
            ).length;
            const hasEmpty =
              document.querySelector('tr[class*="dxgvEmptyData"]') !== null;
            return currentCount !== prevCount || hasEmpty || currentCount <= 5;
          },
          { timeout: 15000, polling: 200 },
          rowCountBefore,
        )
        .catch(() => null);
      await this.wait(300);

      const rowCount = await this.page.evaluate(() => {
        return document.querySelectorAll('tr[class*="dxgvDataRow"]').length;
      });

      if (rowCount === 0) {
        return {
          success: false,
          message: `Order ${archibaldOrderId} not found in Archibald`,
        };
      }

      // Step 4: Click "Modifica" on the first row
      logger.debug("[editOrder] Clicking Modifica...");
      await this.emitProgress("edit.open");

      const editClicked = await this.page.evaluate(() => {
        const firstRow = document.querySelector('tr[class*="dxgvDataRow"]');
        if (!firstRow) return false;

        // Strategy 1: a[data-args*="Edit"]
        const editLink = firstRow.querySelector(
          'a[data-args*="Edit"]',
        ) as HTMLElement | null;
        if (editLink) {
          editLink.click();
          return true;
        }

        // Strategy 2: img[title="Modifica"]
        const editImg = firstRow.querySelector(
          'img[title="Modifica"]',
        ) as HTMLElement | null;
        if (editImg) {
          editImg.click();
          return true;
        }

        // Strategy 3: command column edit icon
        const commandCell = firstRow.querySelector(
          "td.dxgvCommandColumn_XafTheme",
        ) as HTMLElement | null;
        if (commandCell) {
          const editIcon = commandCell.querySelector(
            "a, img",
          ) as HTMLElement | null;
          if (editIcon) {
            editIcon.click();
            return true;
          }
        }

        return false;
      });

      if (!editClicked) {
        await this.page.screenshot({
          path: `logs/edit-order-modifica-not-found-${Date.now()}.png`,
          fullPage: true,
        });
        return {
          success: false,
          message: "Could not find Modifica button on order row",
        };
      }

      // Step 5: Wait for detail view to load
      await this.page.waitForFunction(
        () => window.location.href.includes("SALESTABLE_DetailViewAgent"),
        { timeout: 15000 },
      );
      await this.wait(1000);

      // Wait for page to be fully loaded
      await this.page.waitForFunction(
        () => {
          const elements = Array.from(
            document.querySelectorAll("span, button, a"),
          );
          return elements.some((el) => {
            const text = el.textContent?.trim().toLowerCase() || "";
            return text.includes("salvare") || text.includes("salva");
          });
        },
        { timeout: 15000 },
      );

      await this.discoverSalesLinesGrid();
      logger.info("[editOrder] Detail view loaded, grid discovered", {
        salesLinesGridName: this.salesLinesGridName,
      });

      // Wait for the SALESLINES grid to have data rows (it may load asynchronously)
      if (this.salesLinesGridName) {
        await this.page
          .waitForFunction(
            (gridName: string) => {
              const gridEl =
                document.getElementById(gridName) ||
                document.querySelector(`[id*="${gridName}"]`);
              if (!gridEl) return false;
              const dataRows = gridEl.querySelectorAll(
                'tr[class*="dxgvDataRow"]',
              );
              return dataRows.length > 0;
            },
            { timeout: 15000, polling: 300 },
            this.salesLinesGridName,
          )
          .catch(() => null);

        // Scroll the SALESLINES grid into view
        await this.page.evaluate((gridName: string) => {
          const gridEl =
            document.getElementById(gridName) ||
            document.querySelector(`[id*="${gridName}"]`);
          if (gridEl) gridEl.scrollIntoView({ block: "center" });
        }, this.salesLinesGridName);
        await this.wait(500);
      } else {
        // Retry discovery after a longer wait
        await this.wait(2000);
        await this.discoverSalesLinesGrid();
        logger.info("[editOrder] Retry grid discovery", {
          salesLinesGridName: this.salesLinesGridName,
        });
      }

      // Log grid state before processing
      const gridDebug = await this.page.evaluate((gridName: string | null) => {
        let container: Element | Document = document;
        if (gridName) {
          const gridEl =
            document.getElementById(gridName) ||
            document.querySelector(`[id*="${gridName}"]`);
          if (gridEl) container = gridEl;
        }
        const dataRows = Array.from(
          container.querySelectorAll('tr[class*="dxgvDataRow"]'),
        );
        return {
          gridName,
          gridFound: gridName
            ? !!(
                document.getElementById(gridName) ||
                document.querySelector(`[id*="${gridName}"]`)
              )
            : false,
          dataRowCount: dataRows.length,
          rowTexts: dataRows
            .slice(0, 5)
            .map((r) => r.textContent?.substring(0, 100)),
        };
      }, this.salesLinesGridName);
      logger.info("[editOrder] Grid state", gridDebug);

      // Sort modifications: updates first (stable indices), then adds, then deletes (highest index first)
      const updates = modifications.filter(
        (m) => m.type === "update",
      ) as Array<{
        type: "update";
        rowIndex: number;
        articleCode: string;
        quantity: number;
        discount?: number;
        productName?: string;
        articleChanged?: boolean;
      }>;
      const adds = modifications.filter((m) => m.type === "add") as Array<{
        type: "add";
        articleCode: string;
        quantity: number;
        discount?: number;
        productName?: string;
      }>;
      const deletes = modifications
        .filter((m) => m.type === "delete")
        .sort((a, b) => (b as any).rowIndex - (a as any).rowIndex) as Array<{
        type: "delete";
        rowIndex: number;
      }>;

      const totalMods = updates.length + adds.length + deletes.length;
      let completedMods = 0;

      // Process UPDATES
      for (const mod of updates) {
        completedMods++;
        await this.emitProgress("edit.modify", {
          current: completedMods,
          total: totalMods,
        });
        logger.info(
          `[editOrder] Updating row ${mod.rowIndex}: ${mod.articleCode} qty=${mod.quantity}`,
        );

        // Start editing the row by clicking the StartEdit pencil button on the row
        let editStarted = false;

        // Strategy 1: Click the StartEdit button (pencil icon) on the target SALESLINES row via DOM
        editStarted = await this.page.evaluate(
          (rowIdx: number, gridName: string | null) => {
            // Scope query to SALESLINES grid container to avoid picking rows from other grids
            let container: Element | Document = document;
            if (gridName) {
              const gridEl =
                document.getElementById(gridName) ||
                document.querySelector(`[id*="${gridName}"]`);
              if (gridEl) container = gridEl;
            }
            const dataRows = Array.from(
              container.querySelectorAll('tr[class*="dxgvDataRow"]'),
            );
            const targetRow = dataRows[rowIdx];
            if (!targetRow) return false;

            // Scroll target row into view
            targetRow.scrollIntoView({ block: "center" });

            // Look for StartEdit link: a[data-args*="StartEdit"]
            const startEditLink = targetRow.querySelector(
              'a[data-args*="StartEdit"]',
            ) as HTMLElement | null;
            if (startEditLink) {
              startEditLink.click();
              return true;
            }

            // Look for edit icon: img[title="Edit"] or img[alt="Edit"] or img[title="Modifica"]
            const editImg = targetRow.querySelector(
              'img[title="Edit"], img[alt="Edit"], img[title="Modifica"]',
            ) as HTMLElement | null;
            if (editImg) {
              (editImg.parentElement || editImg).click();
              return true;
            }

            // Look for command column with any clickable element
            const commandCell = targetRow.querySelector(
              'td.dxgvCommandColumn_XafTheme, td[class*="CommandColumn"]',
            ) as HTMLElement | null;
            if (commandCell) {
              const link = commandCell.querySelector(
                "a, img",
              ) as HTMLElement | null;
              if (link) {
                link.click();
                return true;
              }
            }

            return false;
          },
          mod.rowIndex,
          this.salesLinesGridName,
        );

        logger.debug(
          `[editOrder] StartEdit Strategy 1 (DOM click): ${editStarted}`,
        );

        // Strategy 2: DevExpress API StartEditRow
        if (!editStarted && this.salesLinesGridName) {
          logger.debug(
            "[editOrder] Trying StartEdit Strategy 2 (DevExpress API)",
          );
          await this.page.evaluate(
            (gridName: string, rowIdx: number) => {
              const w = window as any;
              const grid =
                w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(
                  gridName,
                );
              if (grid) grid.StartEditRow(rowIdx);
            },
            this.salesLinesGridName,
            mod.rowIndex,
          );
          editStarted = true;
        }

        if (editStarted && this.salesLinesGridName) {
          await this.waitForGridCallback(this.salesLinesGridName);
        }
        await this.wait(800);

        // Wait for edit row to appear (scoped to SALESLINES grid)
        let editRowAppeared = false;
        try {
          await this.page.waitForFunction(
            (gridName: string | null) => {
              let container: Element | Document = document;
              if (gridName) {
                const el = document.getElementById(gridName);
                if (el) container = el;
              }
              const editRows = container.querySelectorAll(
                'tr[id*="DXEditingRow"]',
              );
              return editRows.length > 0;
            },
            { timeout: 5000, polling: 100 },
            this.salesLinesGridName,
          );
          editRowAppeared = true;
        } catch {
          logger.warn(
            "[editOrder] DXEditingRow not found after first attempt, retrying...",
          );
        }

        // Retry: double-click the row to enter edit mode
        if (!editRowAppeared) {
          const rowClicked = await this.page.evaluate(
            (rowIdx: number, gridName: string | null) => {
              let container: Element | Document = document;
              if (gridName) {
                const gridEl =
                  document.getElementById(gridName) ||
                  document.querySelector(`[id*="${gridName}"]`);
                if (gridEl) container = gridEl;
              }
              const dataRows = Array.from(
                container.querySelectorAll('tr[class*="dxgvDataRow"]'),
              );
              const targetRow = dataRows[rowIdx];
              if (!targetRow) return null;
              const firstCell = targetRow.querySelector(
                "td:nth-child(2)",
              ) as HTMLElement | null;
              if (firstCell) {
                const rect = firstCell.getBoundingClientRect();
                return {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                };
              }
              return null;
            },
            mod.rowIndex,
            this.salesLinesGridName,
          );

          if (rowClicked) {
            await this.page.mouse.click(rowClicked.x, rowClicked.y, {
              clickCount: 2,
            });
            await this.wait(1000);

            try {
              await this.page.waitForFunction(
                (gridName: string | null) => {
                  let container: Element | Document = document;
                  if (gridName) {
                    const el = document.getElementById(gridName);
                    if (el) container = el;
                  }
                  return (
                    container.querySelectorAll('tr[id*="DXEditingRow"]')
                      .length > 0
                  );
                },
                { timeout: 5000, polling: 100 },
                this.salesLinesGridName,
              );
              editRowAppeared = true;
              logger.debug(
                "[editOrder] DXEditingRow appeared after double-click retry",
              );
            } catch {
              logger.warn(
                "[editOrder] DXEditingRow still not found after double-click",
              );
            }
          }
        }

        if (!editRowAppeared) {
          const debugState = await this.page.evaluate(
            (gridName: string | null) => {
              let container: Element | Document = document;
              if (gridName) {
                const gridEl =
                  document.getElementById(gridName) ||
                  document.querySelector(`[id*="${gridName}"]`);
                if (gridEl) container = gridEl;
              }
              return {
                dataRows: container.querySelectorAll('tr[class*="dxgvDataRow"]')
                  .length,
                editRows: container.querySelectorAll('tr[id*="DXEditingRow"]')
                  .length,
                editNewRows:
                  container.querySelectorAll('tr[id*="editnew"]').length,
                allTrs: container.querySelectorAll("tr").length,
                activeElementId: (document.activeElement as HTMLElement)?.id,
                url: window.location.href,
              };
            },
            this.salesLinesGridName,
          );
          logger.error("[editOrder] Failed to enter edit mode for row", {
            rowIndex: mod.rowIndex,
            ...debugState,
          });
          await this.page.screenshot({
            path: `logs/edit-startrow-failed-${Date.now()}.png`,
            fullPage: true,
          });
          throw new Error(
            `Failed to start editing row ${mod.rowIndex}. Grid state: ${JSON.stringify(debugState)}`,
          );
        }

        // Only re-type article code if the article actually changed
        if (mod.articleChanged !== false) {
          await this.focusAndTypeArticle(mod.articleCode, mod.quantity, mod.productName);
        }

        // Set quantity
        await this.setEditRowQuantity(mod.quantity);

        // Set discount if present
        if (mod.discount !== undefined && mod.discount > 0) {
          await this.setEditRowDiscount(mod.discount);
        }

        // Save the row
        await this.saveEditRow();
        logger.info(`[editOrder] Row ${mod.rowIndex} updated (articleChanged: ${mod.articleChanged !== false})`);
      }

      // Process ADDS
      for (const mod of adds) {
        completedMods++;
        await this.emitProgress("edit.modify", {
          current: completedMods,
          total: totalMods,
        });
        logger.info(
          `[editOrder] Adding article: ${mod.articleCode} qty=${mod.quantity}`,
        );

        // Add new row
        let addNewDone = false;
        const newCommandResult = await this.clickDevExpressGridCommand({
          command: "AddNew",
          baseIdHint: "SALESLINEs",
          timeout: 7000,
          label: "edit-add-new-row",
        });

        if (newCommandResult.clicked) {
          addNewDone = true;
        }

        if (!addNewDone && this.salesLinesGridName) {
          addNewDone = await this.gridAddNewRow();
        }

        if (!addNewDone) {
          return {
            success: false,
            message: "Could not add new row to order",
          };
        }

        // Wait for editable row (scoped to SALESLINES grid - tr[id*="editnew"] can match dropdown headers)
        await this.page
          .waitForFunction(
            (gridName: string | null) => {
              let container: Element | Document = document;
              if (gridName) {
                const el = document.getElementById(gridName);
                if (el) container = el;
              }
              // Look for DXEditingRow (the actual inline edit row) within the grid
              const editRows = container.querySelectorAll(
                'tr[id*="DXEditingRow"], tr[class*="dxgvInlineEditRow"]',
              );
              return editRows.length > 0;
            },
            { timeout: 5000, polling: 100 },
            this.salesLinesGridName,
          )
          .catch(() => null);
        await this.wait(300);

        // Focus INVENTTABLE and type article code
        await this.focusAndTypeArticle(mod.articleCode, mod.quantity, mod.productName);

        // Set quantity
        await this.setEditRowQuantity(mod.quantity);

        // Set discount if present
        if (mod.discount !== undefined && mod.discount > 0) {
          await this.setEditRowDiscount(mod.discount);
        }

        // Save the row
        await this.saveEditRow();
        logger.info(`[editOrder] Article ${mod.articleCode} added`);
      }

      // Process DELETES (highest index first to preserve lower indices)
      // Strategy: select row checkbox via grid.SelectRowOnPage() → click "Cancellare" toolbar →
      // handle XAF confirmation popup (NOT a native window.confirm) → verify row removed
      for (const mod of deletes) {
        completedMods++;
        await this.emitProgress("edit.modify", {
          current: completedMods,
          total: totalMods,
        });
        logger.info(`[editOrder] Deleting row ${mod.rowIndex}`);

        // Count rows before delete to verify later
        const rowCountBefore = await this.page.evaluate(() => {
          return document.querySelectorAll(
            'tr[id*="dviSALESLINEs"][class*="dxgvDataRow"]',
          ).length;
        });

        // Step 1: Select the row checkbox via grid.SelectRowOnPage()
        if (this.salesLinesGridName) {
          await this.page.evaluate(
            (gridName: string, rowIdx: number) => {
              const w = window as any;
              const grid =
                w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(
                  gridName,
                );
              if (grid && typeof grid.SelectRowOnPage === "function") {
                grid.SelectRowOnPage(rowIdx);
              }
            },
            this.salesLinesGridName,
            mod.rowIndex,
          );
        } else {
          // Fallback: click the checkbox cell directly
          await this.page.evaluate((rowIdx: number) => {
            const rows = Array.from(
              document.querySelectorAll(
                'tr[id*="dviSALESLINEs"][class*="dxgvDataRow"]',
              ),
            );
            const row = rows[rowIdx];
            if (!row) return;
            const checkbox = row.querySelector(
              'td[class*="dxgvCommandColumn"] span[class*="dxICheckBox"]',
            ) as HTMLElement | null;
            if (checkbox) checkbox.click();
          }, mod.rowIndex);
        }

        // Step 2: Wait for "Cancellare" toolbar button to become enabled
        await this.page
          .waitForFunction(
            () => {
              const btn = document.querySelector(
                'a[id*="dviSALESLINEs_ToolBar_Menu_DXI0"]',
              );
              return btn && !btn.classList.contains("dxm-disabled");
            },
            { timeout: 5000, polling: 100 },
          )
          .catch(() => null);
        logger.debug("[editOrder] Row selected, Cancellare button enabled");

        // Step 3: Set up native dialog handler + click "Cancellare"
        let nativeDialogHandled = false;
        const dialogHandler = (dialog: any) => {
          nativeDialogHandled = true;
          logger.debug(
            `[editOrder] Native delete dialog: ${dialog.type()} - ${dialog.message()}`,
          );
          dialog.accept();
        };
        this.page.once("dialog", dialogHandler);

        await this.page.evaluate(() => {
          const btn = document.querySelector(
            'a[id*="dviSALESLINEs_ToolBar_Menu_DXI0"]',
          ) as HTMLElement | null;
          if (btn) btn.click();
        });
        logger.debug(
          "[editOrder] Cancellare clicked, waiting for confirmation...",
        );

        // Step 4: Poll for XAF/DevExpress confirmation popup and click OK
        // The popup may take time to appear (requires server callback round-trip)
        if (!nativeDialogHandled) {
          const popupHandled = await this.page
            .waitForFunction(
              () => {
                // Look for DevExpress popup controls that are visible
                const popups = Array.from(
                  document.querySelectorAll(
                    '.dxpcLite_XafTheme, [class*="dxpc-mainDiv"], [id*="DXPEForm"], [id*="Confirmation"], [id*="PopupControl"]',
                  ),
                );
                for (const popup of popups) {
                  const style = window.getComputedStyle(popup);
                  if (
                    style.display !== "none" &&
                    style.visibility !== "hidden"
                  ) {
                    const buttons = Array.from(
                      popup.querySelectorAll(
                        'a, button, input[type="button"], .dxbButton_XafTheme, [class*="dxbButton"]',
                      ),
                    );
                    for (const btn of buttons) {
                      const text = (
                        btn.textContent ||
                        (btn as HTMLInputElement).value ||
                        ""
                      )
                        .trim()
                        .toLowerCase();
                      if (
                        text === "ok" ||
                        text === "sì" ||
                        text === "yes" ||
                        text === "conferma" ||
                        text === "confirm"
                      ) {
                        (btn as HTMLElement).click();
                        return true;
                      }
                    }
                    const footerBtns = Array.from(
                      popup.querySelectorAll(
                        '[class*="Footer"] a, [class*="Footer"] button, [class*="dxpc-footer"] a',
                      ),
                    );
                    for (const btn of footerBtns) {
                      (btn as HTMLElement).click();
                      return true;
                    }
                  }
                }
                return false;
              },
              { timeout: 15000, polling: 300 },
            )
            .then(() => true)
            .catch(() => false);

          if (!popupHandled && !nativeDialogHandled) {
            logger.warn(
              "[editOrder] No confirmation dialog/popup detected for delete",
            );
          }
        }

        // Cleanup dialog handler
        this.page.off("dialog", dialogHandler);

        // Step 5: Wait for grid callback to complete and row to disappear
        if (this.salesLinesGridName) {
          await this.waitForGridCallback(this.salesLinesGridName);
        }

        // Verify row was actually removed
        await this.page
          .waitForFunction(
            (prevCount: number) => {
              const currentCount = document.querySelectorAll(
                'tr[id*="dviSALESLINEs"][class*="dxgvDataRow"]',
              ).length;
              return currentCount < prevCount;
            },
            { timeout: 10000, polling: 200 },
            rowCountBefore,
          )
          .catch(() => {
            logger.warn(
              `[editOrder] Row count did not decrease after deleting row ${mod.rowIndex}`,
            );
          });

        await this.wait(500);
        logger.info(`[editOrder] Row ${mod.rowIndex} deleted`);
      }

      // Step 6: Save and close via "Salvare" dropdown → "Salva e chiudi"
      // The dump confirmed "Salva e chiudi" is hidden inside the "Salvare" dropdown popup.
      // We must open the dropdown first, then click the sub-item.
      logger.debug(
        '[editOrder] Opening Salvare dropdown for "Salva e chiudi"...',
      );
      await this.emitProgress("edit.save");

      // Strategy 1: Open dropdown via popOut arrow, then click "Salva e chiudi" by ID pattern
      const saveClicked = await this.page.evaluate(() => {
        // Find the "Salvare" dropdown LI (class contains "dropDownSave")
        const dropdownLi = document.querySelector(
          'li[class*="dropDownSave"]',
        ) as HTMLElement | null;
        if (!dropdownLi) return { step: "no-dropdown-li" };

        // Click the popOut arrow to open the dropdown
        const popOut = dropdownLi.querySelector(
          "div.dxm-popOut",
        ) as HTMLElement | null;
        if (popOut) {
          popOut.click();
          return { step: "popout-clicked" };
        }

        // Fallback: click the LI itself
        dropdownLi.click();
        return { step: "li-clicked" };
      });

      logger.debug("[editOrder] Salvare dropdown open:", saveClicked);
      await this.wait(800);

      // Now click "Salva e chiudi" - it should be visible in the popup
      const salvaEChiudiClicked = await this.page.evaluate(() => {
        // Strategy 1: By ID pattern (dump confirmed: mainMenu_Menu_DXI1i1_T)
        const byId = document.querySelector(
          'a[id*="mainMenu_Menu_DXI1i1"]',
        ) as HTMLElement | null;
        if (byId) {
          byId.click();
          return { clicked: true, strategy: "id-pattern" };
        }

        // Strategy 2: Search visible sub-items under dropDownSave popup
        const popup = document.querySelector(
          'div[id*="mainMenu_Menu_DXME1"]',
        ) as HTMLElement | null;
        if (popup) {
          const links = Array.from(popup.querySelectorAll("a"));
          for (const link of links) {
            if (link.textContent?.toLowerCase().includes("salva e chiudi")) {
              (link as HTMLElement).click();
              return { clicked: true, strategy: "popup-text-search" };
            }
          }
        }

        // Strategy 3: Any visible element with exact "Salva e chiudi" text
        const allLinks = Array.from(document.querySelectorAll("a, span"));
        for (const el of allLinks) {
          const text = el.textContent?.trim() || "";
          if (
            text === "Salva e chiudi" &&
            (el as HTMLElement).offsetParent !== null
          ) {
            (el as HTMLElement).click();
            return { clicked: true, strategy: "visible-text" };
          }
        }

        return { clicked: false, strategy: "none" };
      });

      logger.info("[editOrder] Salva e chiudi click:", salvaEChiudiClicked);
      await this.wait(1000);

      // Wait for navigation back to list or confirmation
      try {
        await this.page.waitForFunction(
          () =>
            window.location.href.includes("SALESTABLE_ListView_Agent") ||
            !window.location.href.includes("mode=Edit"),
          { timeout: 15000 },
        );
      } catch {
        logger.warn(
          "[editOrder] Did not navigate back to list after save, proceeding",
        );
      }

      await this.emitProgress("edit.complete");
      logger.info(`[editOrder] Order ${archibaldOrderId} edited successfully`);
      return {
        success: true,
        message: `Order ${archibaldOrderId} edited successfully with ${modifications.length} modification(s)`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[editOrder] Error editing order ${archibaldOrderId}:`, {
        error: errorMsg,
      });

      try {
        await this.page!.screenshot({
          path: `logs/edit-order-error-${normalizedId}-${Date.now()}.png`,
          fullPage: true,
        });
      } catch {
        // ignore screenshot errors
      }

      return {
        success: false,
        message: `Error editing order: ${errorMsg}`,
      };
    }
  }

  private async focusAndTypeArticle(
    articleCode: string,
    quantity: number,
    productName?: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    // Step 1: Look up the correct variant from the product database
    const variantLookupName = productName?.trim() || articleCode;
    let selectedVariant =
      this.productDb?.getProductById(articleCode) ||
      this.productDb?.selectPackageVariant(variantLookupName, quantity);

    // Fallback: strip variant suffix (e.g., "016869K2" → "016869") and retry
    if (!selectedVariant && articleCode.length > 2) {
      const baseCode = articleCode.replace(/[A-Z]\d+$/, "");
      if (baseCode !== articleCode) {
        selectedVariant =
          this.productDb?.getProductById(baseCode) ||
          this.productDb?.selectPackageVariant(baseCode, quantity);
      }
    }

    if (!selectedVariant) {
      throw new Error(
        `Article ${articleCode} not found in product database` +
          (productName ? ` (product name: ${productName}). ` : '. ') +
          `Ensure product sync has run.`,
      );
    }

    logger.info(`[editOrder] Selected variant for ${articleCode}`, {
      variantId: selectedVariant.id,
      packageContent: selectedVariant.packageContent,
      multipleQty: selectedVariant.multipleQty,
    });

    // Step 2: Focus INVENTTABLE input
    let inventtableFocused = false;

    // Strategy 1: Find visible INVENTTABLE input and focus via JS
    const inventtableId = await this.page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'),
      );
      for (const inp of inputs) {
        const el = inp as HTMLElement;
        if (el.offsetParent !== null && el.offsetWidth > 0) {
          return (inp as HTMLInputElement).id;
        }
      }
      return null;
    });

    if (inventtableId) {
      await this.page.evaluate((inputId: string) => {
        const el = document.getElementById(inputId) as HTMLInputElement;
        if (el) {
          el.scrollIntoView({ block: "center" });
          el.focus();
          el.click();
        }
      }, inventtableId);
      await this.wait(300);

      inventtableFocused = await this.page.evaluate(() => {
        const focused = document.activeElement as HTMLInputElement;
        return focused?.id?.includes("INVENTTABLE") || false;
      });
      if (inventtableFocused) {
        logger.debug(
          "[editOrder] INVENTTABLE focused via JS focus (Strategy 1)",
        );
      }
    }

    // Strategy 2: Click on the article cell in the editing row (N/A for new rows, or existing article text)
    if (!inventtableFocused) {
      const articleCell = await this.page.evaluate(
        (gridName: string | null) => {
          let container: Element | Document = document;
          if (gridName) {
            const gridEl =
              document.getElementById(gridName) ||
              document.querySelector(`[id*="${gridName}"]`);
            if (gridEl) container = gridEl;
          }
          const row = container.querySelector(
            'tr[id*="editnew"], tr[id*="DXEditingRow"]',
          );
          if (!row) return null;
          const cells = Array.from(row.querySelectorAll("td"));
          for (const cell of cells) {
            const text = cell.textContent?.trim() || "";
            if (
              text === "N/A" ||
              text.includes("N/A") ||
              cell.querySelector('[class*="dxeDropDown"]') ||
              cell.querySelector('input[id*="INVENTTABLE"]')
            ) {
              const rect = cell.getBoundingClientRect();
              if (rect.width > 0) {
                return {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                };
              }
            }
          }
          // Fallback: click the first cell that contains an input or has a dropdown editor
          for (const cell of cells) {
            const hasInput =
              cell.querySelector("input") ||
              cell.querySelector('[class*="dxeEditArea"]');
            if (hasInput) {
              const rect = cell.getBoundingClientRect();
              if (rect.width > 0) {
                return {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                };
              }
            }
          }
          return null;
        },
        this.salesLinesGridName,
      );

      if (articleCell) {
        await this.page.mouse.click(articleCell.x, articleCell.y);
        await this.wait(500);

        inventtableFocused = await this.page.evaluate(() => {
          const focused = document.activeElement as HTMLInputElement;
          return focused?.id?.includes("INVENTTABLE") || false;
        });

        if (!inventtableFocused) {
          // After clicking, the INVENTTABLE input might now be visible but not focused
          const newInventtableId = await this.page.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[id*="INVENTTABLE"][id$="_I"]'),
            );
            for (const inp of inputs) {
              const el = inp as HTMLElement;
              if (el.offsetParent !== null && el.offsetWidth > 0) {
                return (inp as HTMLInputElement).id;
              }
            }
            return null;
          });
          if (newInventtableId) {
            await this.page.evaluate((inputId: string) => {
              const el = document.getElementById(inputId) as HTMLInputElement;
              if (el) {
                el.focus();
                el.click();
              }
            }, newInventtableId);
            await this.wait(200);
            inventtableFocused = await this.page.evaluate(() => {
              const focused = document.activeElement as HTMLInputElement;
              return focused?.id?.includes("INVENTTABLE") || false;
            });
          }
        }

        if (inventtableFocused) {
          logger.debug(
            "[editOrder] INVENTTABLE focused after clicking cell (Strategy 2)",
          );
        }
      }
    }

    // Strategy 3: DevExpress FocusEditor API
    if (!inventtableFocused && this.salesLinesGridName) {
      try {
        await this.page.evaluate((gridName: string) => {
          const w = window as any;
          const grid =
            w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(
              gridName,
            );
          if (!grid) return;
          // Try focusing each column editor until we find INVENTTABLE
          for (let col = 0; col < 10; col++) {
            try {
              const editor = grid.GetEditor?.(col);
              if (editor) {
                const mainEl = editor.GetMainElement?.();
                const inputEl = editor.GetInputElement?.();
                const id = mainEl?.id || inputEl?.id || "";
                if (id.includes("INVENTTABLE")) {
                  editor.Focus?.();
                  if (inputEl) {
                    inputEl.focus();
                    inputEl.click();
                  }
                  break;
                }
              }
            } catch (_) {
              /* skip column */
            }
          }
        }, this.salesLinesGridName);
        await this.wait(300);

        inventtableFocused = await this.page.evaluate(() => {
          const focused = document.activeElement as HTMLInputElement;
          return focused?.id?.includes("INVENTTABLE") || false;
        });

        if (inventtableFocused) {
          logger.debug(
            "[editOrder] INVENTTABLE focused via DevExpress API (Strategy 3)",
          );
        }
      } catch (_e) {
        // ignore
      }
    }

    // Strategy 4: Tab navigation fallback
    if (!inventtableFocused) {
      logger.warn(
        "[editOrder] Falling back to Tab navigation for INVENTTABLE (Strategy 4)",
      );
      try {
        // Click on the grid toolbar area first
        await this.page.evaluate(() => {
          const toolbar = document.querySelector(
            '[id*="dviSALESLINEs"] [class*="ToolBar"]',
          );
          if (toolbar) (toolbar as HTMLElement).click();
        });
        await this.wait(200);

        for (let t = 0; t < 6; t++) {
          await this.page.keyboard.press("Tab");
          await this.wait(100);
          inventtableFocused = await this.page.evaluate(() => {
            const focused = document.activeElement as HTMLInputElement;
            return focused?.id?.includes("INVENTTABLE") || false;
          });
          if (inventtableFocused) {
            logger.debug(
              `[editOrder] INVENTTABLE focused after ${t + 1} Tab presses (Strategy 4)`,
            );
            break;
          }
        }
      } catch (_e) {
        // ignore
      }
    }

    if (!inventtableFocused) {
      const debugInfo = await this.page.evaluate(() => {
        const allInventtable = Array.from(
          document.querySelectorAll('input[id*="INVENTTABLE"]'),
        ).map((inp) => ({
          id: (inp as HTMLInputElement).id,
          visible: (inp as HTMLElement).offsetParent !== null,
          w: (inp as HTMLElement).offsetWidth,
          h: (inp as HTMLElement).offsetHeight,
        }));
        const editRow = document.querySelector(
          'tr[id*="DXEditingRow"], tr[id*="editnew"]',
        );
        return {
          inventtableInputs: allInventtable,
          editRowExists: !!editRow,
          editRowId: editRow?.id || null,
          activeElementTag: document.activeElement?.tagName,
          activeElementId: (document.activeElement as HTMLElement)?.id,
        };
      });
      logger.error("[editOrder] INVENTTABLE focus failed - debug", debugInfo);
      await this.page.screenshot({
        path: `logs/edit-inventtable-focus-failed-${Date.now()}.png`,
        fullPage: true,
      });
      throw new Error(
        `INVENTTABLE field not focused for article edit. Debug: ${JSON.stringify(debugInfo)}`,
      );
    }

    // Step 3: Type article code (optimized: paste all except last char, then type last)
    if (articleCode.length > 1) {
      const pastePart = articleCode.slice(0, -1);
      const typePart = articleCode.slice(-1);

      await this.page.evaluate((text: string) => {
        const input = document.activeElement as HTMLInputElement;
        if (input && input.tagName === "INPUT") {
          input.value = text;
          input.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true }),
          );
        }
      }, pastePart);

      await this.page.keyboard.type(typePart, { delay: 30 });
    } else {
      await this.page.keyboard.type(articleCode, { delay: 30 });
    }

    // Step 4: Wait for dropdown to open
    try {
      await this.page.waitForSelector('tr[id*="DXDataRow"]', { timeout: 5000 });
    } catch {
      throw new Error(`Article dropdown did not open for "${articleCode}"`);
    }

    // Wait for callbacks to settle
    try {
      await this.page.waitForFunction(
        () => {
          const w = window as any;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (!col || typeof col.ForEachControl !== "function") return true;
          let busy = false;
          col.ForEachControl((c: any) => {
            try {
              if (c.InCallback?.()) busy = true;
            } catch {}
            try {
              const gv = c.GetGridView?.();
              if (gv?.InCallback?.()) busy = true;
            } catch {}
          });
          return !busy;
        },
        { timeout: 5000, polling: 100 },
      );
    } catch {
      // proceed
    }

    // Step 5: Select correct variant using buildVariantCandidates + chooseBestVariantCandidate
    const variantSuffix = selectedVariant.id.substring(
      selectedVariant.id.length - 2,
    );
    logger.debug(
      `[editOrder] Selecting variant by suffix: ${variantSuffix} (from ${selectedVariant.id})`,
    );

    let rowSelected = false;
    let currentPage = 1;
    const maxPages = 10;

    while (!rowSelected && currentPage <= maxPages) {
      // Snapshot the dropdown rows
      const snapshot = await this.page.evaluate(() => {
        const dropdownContainers = Array.from(
          document.querySelectorAll('[id*="_DDD"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden")
            return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        let activeContainer =
          dropdownContainers.find((c) =>
            c.querySelector('tr[class*="dxgvDataRow"]'),
          ) || null;

        if (!activeContainer) {
          const popupContainers = Array.from(
            document.querySelectorAll(".dxpcLite, .dxpc-content, .dxpcMainDiv"),
          ).filter((node) => {
            const el = node as HTMLElement;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden")
              return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          activeContainer =
            popupContainers.find((c) =>
              c.querySelector('tr[class*="dxgvDataRow"]'),
            ) || null;
        }

        const rowsRoot = activeContainer || document;

        const headerTexts: string[] = [];
        const headerTable = rowsRoot.querySelector(
          'table[id*="DXHeaderTable"]',
        );
        let headerRow: Element | null = null;
        if (headerTable) {
          headerRow =
            headerTable.querySelector('tr[id*="DXHeadersRow"]') ||
            headerTable.querySelector("tr.dxgvHeaderRow");
        }
        if (!headerRow) {
          headerRow =
            rowsRoot.querySelector("tr.dxgvHeaderRow") ||
            rowsRoot.querySelector('tr[id*="DXHeadersRow"]');
        }
        if (headerRow) {
          Array.from(headerRow.querySelectorAll("td, th")).forEach((cell) => {
            const wrap = cell.querySelector(".dx-wrap");
            headerTexts.push(
              (wrap?.textContent || cell.textContent || "").trim(),
            );
          });
        }

        const rows = Array.from(
          rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((row) => {
          const el = row as HTMLElement;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden")
            return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        const rowSnapshots = rows.map((row, index) => {
          const cells = Array.from(row.querySelectorAll("td"));
          return {
            index,
            cellTexts: cells.map((cell) => cell.textContent?.trim() || ""),
            rowId: row.getAttribute("id") || null,
          };
        });

        return {
          containerId: activeContainer
            ? (activeContainer as HTMLElement).id || null
            : null,
          headerTexts,
          rows: rowSnapshots,
          rowsCount: rows.length,
        };
      });

      if (snapshot.rowsCount === 0) {
        throw new Error(
          `No variant rows found in dropdown for "${articleCode}"`,
        );
      }

      const headerIndices = computeVariantHeaderIndices(snapshot.headerTexts);
      const candidates = buildVariantCandidates(snapshot.rows, headerIndices, {
        variantId: selectedVariant.id,
        variantSuffix,
        packageContent: selectedVariant.packageContent,
        multipleQty: selectedVariant.multipleQty,
        articleName: articleCode,
      });
      const { chosen, reason } = chooseBestVariantCandidate(candidates);

      if (chosen && reason) {
        // Navigate to the correct row
        const keyboardState = await this.page.evaluate(
          (containerId: string | null) => {
            let activeContainer: Element | null = null;
            if (containerId) {
              const byId = document.getElementById(containerId);
              if (byId) {
                const style = window.getComputedStyle(byId);
                const rect = byId.getBoundingClientRect();
                if (
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  rect.width > 0
                ) {
                  activeContainer = byId;
                }
              }
            }
            if (!activeContainer) {
              const dds = Array.from(
                document.querySelectorAll('[id*="_DDD"]'),
              ).filter((node) => {
                const el = node as HTMLElement;
                const s = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return (
                  s.display !== "none" &&
                  s.visibility !== "hidden" &&
                  r.width > 0
                );
              });
              activeContainer =
                dds.find((c) => c.querySelector('tr[class*="dxgvDataRow"]')) ||
                null;
            }
            const rowsRoot = activeContainer || document;
            const rows = Array.from(
              rowsRoot.querySelectorAll('tr[class*="dxgvDataRow"]'),
            ).filter((row) => {
              const el = row as HTMLElement;
              const s = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return (
                s.display !== "none" && s.visibility !== "hidden" && r.width > 0
              );
            });
            const focusedIndex = rows.findIndex((row) => {
              const cls = (row as HTMLElement).className || "";
              return (
                cls.includes("dxgvFocusedRow") ||
                cls.includes("dxgvSelectedRow")
              );
            });
            return { rowsCount: rows.length, focusedIndex };
          },
          snapshot.containerId,
        );

        const rowsCount = keyboardState.rowsCount ?? snapshot.rowsCount;
        const focusedIndex = keyboardState.focusedIndex ?? -1;
        const targetIndex = chosen.index;

        if (targetIndex >= 0 && targetIndex < rowsCount) {
          // Primary: click the target row directly
          const rowClicked = await this.page.evaluate(
            (cId: string | null, targetIdx: number) => {
              let container: Element | null = null;
              if (cId) {
                const byId = document.getElementById(cId);
                if (byId && byId.getBoundingClientRect().width > 0) {
                  container = byId;
                }
              }
              if (!container) {
                container =
                  Array.from(
                    document.querySelectorAll('[id*="_DDD"]'),
                  ).find((c) => {
                    const el = c as HTMLElement;
                    return (
                      el.getBoundingClientRect().width > 0 &&
                      !!c.querySelector('tr[class*="dxgvDataRow"]')
                    );
                  }) || null;
              }
              const root = container || document;
              const rows = Array.from(
                root.querySelectorAll('tr[class*="dxgvDataRow"]'),
              ).filter((row) => {
                const el = row as HTMLElement;
                return (
                  el.offsetParent !== null &&
                  el.getBoundingClientRect().width > 0
                );
              });
              const target = rows[targetIdx] as HTMLElement | undefined;
              if (target) {
                const cell = target.querySelector("td") as HTMLElement | null;
                if (cell) {
                  cell.click();
                  return true;
                }
              }
              return false;
            },
            snapshot.containerId,
            targetIndex,
          );

          if (rowClicked) {
            logger.info(
              `[editOrder] Variant row ${targetIndex}/${rowsCount} selected via DOM click (reason: ${reason})`,
            );
            await this.wait(200);
          } else {
            // Fallback: keyboard navigation
            logger.warn(
              `[editOrder] DOM click failed for row ${targetIndex}, falling back to ArrowDown`,
            );
            let delta =
              focusedIndex >= 0
                ? targetIndex - focusedIndex
                : targetIndex + 1;
            const direction: "ArrowDown" | "ArrowUp" =
              delta >= 0 ? "ArrowDown" : "ArrowUp";
            delta = Math.abs(delta);

            const maxSteps = Math.min(delta, rowsCount + 2);
            for (let step = 0; step < maxSteps; step++) {
              await this.page.keyboard.press(direction);
              await this.wait(30);
            }
          }

          // Tab to confirm variant selection and move to quantity field
          await this.page.keyboard.press("Tab");
          rowSelected = true;

          logger.info(
            `[editOrder] Variant selected: ${reason}, row ${targetIndex}/${rowsCount}`,
          );
        }
      }

      if (rowSelected) break;

      // Try next page in dropdown
      const nextPageClicked = await this.page.evaluate(() => {
        const images = Array.from(document.querySelectorAll("img"));
        for (const img of images) {
          const alt = img.getAttribute("alt") || "";
          const className = img.className || "";
          if (alt === "Next" || className.includes("pNext")) {
            const parent = img.parentElement;
            if (
              parent &&
              parent.offsetParent !== null &&
              !parent.className.includes("dxp-disabled")
            ) {
              (parent as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });

      if (!nextPageClicked) break;

      await this.waitForDevExpressIdle({
        timeout: 3000,
        label: "edit-variant-pagination",
      });
      currentPage++;
    }

    if (!rowSelected) {
      await this.page.screenshot({
        path: `logs/edit-variant-not-found-${Date.now()}.png`,
        fullPage: true,
      });
      throw new Error(
        `Variant ${variantSuffix} not found in dropdown for "${articleCode}" after ${currentPage} page(s)`,
      );
    }

    // Wait for variant selection callbacks to settle
    try {
      await this.page.waitForFunction(
        () => {
          const w = window as any;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (!col || typeof col.ForEachControl !== "function") return true;
          let busy = false;
          col.ForEachControl((c: any) => {
            try {
              if (c.InCallback?.()) busy = true;
            } catch {}
            try {
              const gv = c.GetGridView?.();
              if (gv?.InCallback?.()) busy = true;
            } catch {}
          });
          return !busy;
        },
        { timeout: 8000, polling: 100 },
      );
    } catch {
      // proceed
    }
    logger.debug(
      `[editOrder] Article "${articleCode}" variant callbacks settled`,
    );
  }

  private async setEditRowQuantity(quantity: number): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    const qtyFormatted = quantity.toString().replace(".", ",");

    const currentQty = await this.page.evaluate(() => {
      const focused = document.activeElement as HTMLInputElement;
      return { value: focused?.value || "", id: focused?.id || "" };
    });

    const qtyNum = Number.parseFloat(currentQty.value.replace(",", "."));

    if (!Number.isFinite(qtyNum) || Math.abs(qtyNum - quantity) >= 0.01) {
      logger.info(
        `[editOrder] Setting quantity: ${currentQty.value} → ${quantity}`,
      );

      await this.page.evaluate(() => {
        const input = document.activeElement as HTMLInputElement;
        if (input?.select) input.select();
      });

      await this.page.keyboard.type(qtyFormatted, { delay: 30 });

      // Wait for callback
      try {
        await this.page.waitForFunction(
          () => {
            const w = window as any;
            const col = w.ASPxClientControl?.GetControlCollection?.();
            if (!col || typeof col.ForEachControl !== "function") return true;
            let busy = false;
            col.ForEachControl((c: any) => {
              try {
                if (c.InCallback?.()) busy = true;
              } catch {}
            });
            return !busy;
          },
          { timeout: 5000, polling: 100 },
        );
      } catch {
        // proceed
      }

      // Verify
      const verifyQty = await this.page.evaluate(() => {
        const input = document.activeElement as HTMLInputElement;
        return input?.value || "";
      });
      const verifyNum = Number.parseFloat(verifyQty.replace(",", "."));

      if (Math.abs(verifyNum - quantity) >= 0.01) {
        logger.warn(
          `[editOrder] Quantity verify failed: expected ${quantity}, got ${verifyQty}. Retrying...`,
        );
        await this.page.evaluate(() => {
          const input = document.activeElement as HTMLInputElement;
          if (input?.select) input.select();
        });
        await this.page.keyboard.type(qtyFormatted, { delay: 50 });
        await this.wait(300);
      }
    } else {
      logger.info(`[editOrder] Quantity already correct: ${currentQty.value}`);
    }
  }

  private async setEditRowDiscount(discount: number): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    const discInputId = await this.page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ) as HTMLInputElement[];
      const d = inputs.find((inp) => {
        const id = inp.id.toLowerCase();
        return (
          id.includes("manualdiscount") &&
          id.includes("salesline") &&
          inp.offsetParent !== null
        );
      });
      return d?.id || null;
    });

    if (!discInputId) {
      logger.warn(
        "[editOrder] MANUALDISCOUNT input not found, discount not set",
      );
      return;
    }

    const discountStr = discount.toString();
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const discCoord = await this.page.evaluate((inputId: string) => {
        const inp = document.getElementById(inputId) as HTMLInputElement;
        if (!inp) return null;
        inp.scrollIntoView({ block: "center" });
        const r = inp.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, discInputId);

      if (discCoord) {
        await this.page.mouse.click(discCoord.x, discCoord.y, {
          clickCount: 2,
        });
        await this.wait(300);
      }

      await this.page.keyboard.down("Control");
      await this.page.keyboard.press("a");
      await this.page.keyboard.up("Control");
      await this.wait(50);

      await this.page.evaluate((val: string) => {
        document.execCommand("insertText", false, val);
      }, discountStr);
      await this.wait(200);

      await this.page.keyboard.press("Enter");

      const confirmed = await this.page
        .waitForFunction(
          (inputId: string, target: string) => {
            const inp = document.getElementById(inputId) as HTMLInputElement;
            if (!inp) return false;
            const val = inp.value.replace(/[^0-9.,]/g, "").replace(",", ".");
            const num = parseFloat(val);
            return num === parseFloat(target);
          },
          { timeout: 3000 },
          discInputId,
          discountStr,
        )
        .then(() => true)
        .catch(() => false);

      if (confirmed) {
        logger.info(
          `[editOrder] Discount set: ${discount}% [attempt ${attempt}]`,
        );
        return;
      }

      logger.warn(
        `[editOrder] Discount attempt ${attempt}/${MAX_ATTEMPTS} failed`,
      );
    }

    logger.error(
      `[editOrder] Discount NOT set after ${MAX_ATTEMPTS} attempts for ${discount}%`,
    );
  }

  private async saveEditRow(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    let updateDone = false;

    // Strategy 1: DOM click
    const updateResult = await this.clickDevExpressGridCommand({
      command: "UpdateEdit",
      baseIdHint: "SALESLINEs",
      timeout: 7000,
      label: "edit-order-update-row",
    });

    if (updateResult.clicked) {
      updateDone = true;
      if (this.salesLinesGridName) {
        await this.waitForGridCallback(this.salesLinesGridName, 20000);
      }
      await this.waitForDevExpressIdle({
        timeout: 4000,
        label: "edit-row-saved",
      });
    }

    // Strategy 2: DevExpress API fallback
    if (!updateDone && this.salesLinesGridName) {
      try {
        updateDone = await this.gridUpdateEdit();
      } catch (err) {
        logger.warn("[editOrder] UpdateEdit failed (both DOM and API)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!updateDone) {
      throw new Error(
        "UpdateEdit failed for edit row (both DOM and API failed)",
      );
    }

    await this.wait(200);
    await this.cleanupStaleDropdowns();
  }

  async close(): Promise<void> {
    // Genera e salva report automaticamente prima di chiudere
    try {
      const reportPath = await this.writeOperationReport();
      logger.info(`Report operazioni salvato: ${reportPath}`);
    } catch (error) {
      logger.error("Errore nel salvataggio report operazioni", { error });
    }

    if (this.page && !this.page.isClosed()) {
      await this.page.close();
      this.page = null;
    }

    if (this.userId && this.context && this._browserPool) {
      // Multi-user mode: release context to pool
      // Release with success=false if there were errors, so pool closes the context
      await this._browserPool.releaseContext(this.userId, this.context, !this.hasError);
      this.context = null;
      logger.info(
        `Context released for user ${this.userId}, success=${!this.hasError}`,
      );
    } else if (this.browser) {
      // Legacy mode: close browser
      await this.browser.close();
      this.browser = null;
      logger.info("Browser chiuso (legacy mode)");
    }
  }

  private async waitForDevExpressReadyOnPage(
    page: Page,
    timeout = 5000,
  ): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const loadingIndicators = Array.from(
            document.querySelectorAll(
              '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
            ),
          );
          return loadingIndicators.every(
            (el) =>
              (el as HTMLElement).style.display === "none" ||
              (el as HTMLElement).offsetParent === null,
          );
        },
        { timeout, polling: 100 },
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async downloadPDFExport(options: {
    context: BrowserContext;
    pageUrl: string;
    buttonSelector: string;
    containerSelector: string;
    expectedFileNames: string[];
    filePrefix: string;
    downloadTimeout?: number;
    beforeClick?: (page: Page) => Promise<void>;
    clickStrategy?: "direct" | "responsive-fallback";
    responsiveMenuButtonSelector?: string;
    responsiveExportButtonSelector?: string;
    retryOnDataStoreError?: boolean;
  }): Promise<string> {
    const {
      context,
      pageUrl,
      buttonSelector,
      containerSelector,
      expectedFileNames,
      filePrefix,
      downloadTimeout = 120000,
      beforeClick,
      clickStrategy = "direct",
      responsiveMenuButtonSelector,
      responsiveExportButtonSelector,
      retryOnDataStoreError = false,
    } = options;

    const page = await context.newPage();
    const startTime = Date.now();
    let cancelDownload: () => void = () => {};

    try {
      logger.info(`[ArchibaldBot] Starting ${filePrefix} PDF download`);

      await page.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      });

      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      logger.info(`[ArchibaldBot] Navigated to ${filePrefix} page: ${pageUrl}`);

      await this.waitForDevExpressReadyOnPage(page);

      if (beforeClick) {
        await beforeClick(page);
      }

      const timestamp = Date.now();
      const userId = this.userId || "unknown";
      const downloadPath = `/tmp/${filePrefix}-${timestamp}-${userId}.pdf`;

      const client = await page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: "/tmp",
      });

      await page.waitForSelector(containerSelector, { timeout: 10000 });
      logger.info(`[ArchibaldBot] Menu container found: ${containerSelector}`);

      const isVisible = await page.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, buttonSelector);

      if (!isVisible) {
        logger.info(
          "[ArchibaldBot] Button not visible, hovering parent menu...",
        );
        try {
          await page.hover("a.dxm-content");
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch {
          logger.warn(
            "[ArchibaldBot] Could not hover on parent menu, proceeding anyway",
          );
        }
      }

      const downloadComplete = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(checkFile);
          reject(
            new Error(
              `PDF download timeout (${downloadTimeout / 1000}s exceeded)`,
            ),
          );
        }, downloadTimeout);

        const checkFile = setInterval(async () => {
          try {
            const files = await fsp.readdir("/tmp");
            const pdfFiles = files.filter(
              (f) =>
                expectedFileNames.includes(f) ||
                (f.startsWith(`${filePrefix}-`) && f.endsWith(".pdf")),
            );

            if (pdfFiles.length > 0) {
              const recentPdf =
                pdfFiles.find((f) => expectedFileNames.includes(f)) ||
                pdfFiles[pdfFiles.length - 1];
              const tempPath = `/tmp/${recentPdf}`;

              try {
                await fsp.rename(tempPath, downloadPath);
                clearTimeout(timeout);
                clearInterval(checkFile);
                resolve();
              } catch (renameErr) {
                logger.warn(
                  `[ArchibaldBot] Rename failed, retrying next poll`,
                  { error: renameErr },
                );
              }
            }
          } catch (pollErr) {
            logger.error("[ArchibaldBot] Error during PDF polling", {
              error: pollErr,
            });
            clearTimeout(timeout);
            clearInterval(checkFile);
            reject(pollErr);
          }
        }, 500);

        cancelDownload = () => {
          clearTimeout(timeout);
          clearInterval(checkFile);
        };
      });
      // Suppress unhandled rejection if we throw before reaching await downloadComplete
      downloadComplete.catch(() => {});

      logger.info("[ArchibaldBot] Clicking PDF export button...");

      let clicked = false;

      if (
        clickStrategy === "responsive-fallback" &&
        responsiveMenuButtonSelector &&
        responsiveExportButtonSelector
      ) {
        const showHiddenResult = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel) as HTMLElement;
          if (!btn) return { success: false };
          btn.click();
          return { success: true };
        }, responsiveMenuButtonSelector);

        if (showHiddenResult.success) {
          logger.info(
            "[ArchibaldBot] Responsive menu opened, waiting for submenu...",
          );
          await new Promise((resolve) => setTimeout(resolve, 500));

          const respClickResult = await page.evaluate((sel: string) => {
            const btn = document.querySelector(sel) as HTMLElement;
            if (!btn) return { success: false };
            btn.click();
            return { success: true };
          }, responsiveExportButtonSelector);

          if (respClickResult.success) {
            logger.info(
              "[ArchibaldBot] PDF export clicked via responsive menu",
            );
            clicked = true;
          }
        }
      }

      if (!clicked) {
        const clickResult = await page.evaluate((sel: string) => {
          const button = document.querySelector(sel) as HTMLElement;
          if (!button)
            return { success: false, error: "Button not found in DOM" };

          button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          return { success: true };
        }, buttonSelector);

        if (!clickResult.success) {
          const screenshotPath = `/tmp/${filePrefix}-click-failed-${Date.now()}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true });
          logger.error(
            `[ArchibaldBot] Click failed. Screenshot: ${screenshotPath}`,
          );
          throw new Error(
            `Failed to click PDF export button: ${clickResult.error}`,
          );
        }
      }

      logger.info(
        "[ArchibaldBot] PDF export button clicked, waiting for download...",
      );

      if (retryOnDataStoreError) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        let needsRetry = false;

        try {
          const hasDataStoreError = await page.evaluate(() => {
            return document.body.innerText.includes(
              "Requested objects cannot be loaded",
            );
          });
          if (hasDataStoreError) {
            logger.warn(
              "[ArchibaldBot] Detected 'Requested objects cannot be loaded' error (inline banner)",
            );
            needsRetry = true;
          }
        } catch {
          logger.warn(
            "[ArchibaldBot] Page context destroyed (likely navigated due to data store error)",
          );
          try {
            await page.waitForNavigation({
              waitUntil: "domcontentloaded",
              timeout: 10000,
            });
          } catch {
            // navigation already completed
          }
          needsRetry = true;
        }

        if (needsRetry) {
          logger.info("[ArchibaldBot] Retrying PDF export click...");

          await this.waitForDevExpressReadyOnPage(page);
          await page.waitForSelector(containerSelector, { timeout: 10000 });

          await page.evaluate((sel: string) => {
            const button = document.querySelector(sel) as HTMLElement;
            if (button) {
              button.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true }),
              );
              button.dispatchEvent(
                new MouseEvent("mouseup", { bubbles: true }),
              );
              button.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
              );
            }
          }, buttonSelector);

          logger.info(
            "[ArchibaldBot] Retry click performed after data store error",
          );
        } else {
          logger.info(
            "[ArchibaldBot] No data store error detected, PDF download proceeding normally",
          );
        }
      }

      await downloadComplete;

      const stats = fs.statSync(downloadPath);
      if (stats.size === 0) {
        throw new Error("Downloaded PDF is empty (0 bytes)");
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[ArchibaldBot] ${filePrefix} PDF downloaded to ${downloadPath} in ${duration}ms (${(stats.size / 1024).toFixed(2)} KB)`,
      );

      return downloadPath;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(
        `[ArchibaldBot] ${filePrefix} PDF download failed after ${duration}ms`,
        { error: error.message },
      );
      throw new Error(`PDF download failed: ${error.message}`);
    } finally {
      cancelDownload();
      if (!page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  async downloadCustomersPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl: "https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI6_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI6_",
      expectedFileNames: ["Clienti.pdf", "Customers.pdf"],
      filePrefix: "clienti",
    });
  }

  async downloadProductsPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl: "https://4.231.124.90/Archibald/INVENTTABLE_ListView/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI3_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI3_",
      expectedFileNames: ["Prodotti.pdf", "Products.pdf"],
      filePrefix: "prodotti",
    });
  }

  /**
   * Ensures the orders filter is set to "Tutti gli ordini" (All orders)
   * @param page Page object to use
   */
  private async ensureOrdersFilterSetToAll(page: Page): Promise<void> {
    logger.info("[ArchibaldBot] Checking orders filter setting...");

    // Resilient selectors - DevExpress IDs can change between Archibald versions
    const FILTER_INPUT_SELECTOR = 'input[name*="mainMenu"][name*="Cb"]';
    const FILTER_INPUT_EXACT = 'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]';

    try {
      const filterVisibility = await page.evaluate(
        (sel: string, exactSel: string) => {
          const input = (
            document.querySelector(exactSel) ||
            document.querySelector(sel)
          ) as HTMLInputElement;
          const showHiddenButton = document.querySelector(
            "#Vertical_mainMenu_Menu_DXI9_T",
          ) as HTMLElement;

          if (!input) {
            return {
              found: false,
              isVisible: false,
              hasShowHiddenButton: !!showHiddenButton,
              currentValue: null as string | null,
            };
          }

          return {
            found: true,
            isVisible: input.offsetParent !== null,
            hasShowHiddenButton: !!showHiddenButton,
            currentValue: input.value,
          };
        },
        FILTER_INPUT_SELECTOR,
        FILTER_INPUT_EXACT,
      );

      logger.info("[ArchibaldBot] Filter visibility check:", filterVisibility);

      if (!filterVisibility.found) {
        if (filterVisibility.hasShowHiddenButton) {
          logger.info("[ArchibaldBot] Filter not found, clicking 'Show hidden items'...");
          await page.evaluate(() => {
            const btn = document.querySelector("#Vertical_mainMenu_Menu_DXI9_T") as HTMLElement;
            if (btn) btn.click();
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const appeared = await page
          .waitForSelector(FILTER_INPUT_SELECTOR, { timeout: 3000 })
          .catch(() => null);

        if (!appeared) {
          logger.warn("[ArchibaldBot] Filter input never appeared, continuing without filter");
          return;
        }
      }

      // Read current filter value using resilient selector
      const currentFilterValue = await page.evaluate((sel: string, exactSel: string) => {
        const input = (
          document.querySelector(exactSel) ||
          document.querySelector(sel)
        ) as HTMLInputElement;
        return input ? input.value : null;
      }, FILTER_INPUT_SELECTOR, FILTER_INPUT_EXACT);

      logger.info("[ArchibaldBot] Current filter value:", { currentFilterValue });

      // DevExpress combo has two inputs: display ("Tutti gli ordini") and hidden value
      // ("xaf_xaf_a0ListViewSalesTableOrdersAll"). Both indicate "all orders" filter.
      const isAllOrders =
        currentFilterValue === "Tutti gli ordini" ||
        (currentFilterValue != null && currentFilterValue.endsWith("OrdersAll"));

      if (isAllOrders) {
        logger.info("[ArchibaldBot] Filter already set to all orders, no action needed", {
          currentFilterValue,
        });
        return;
      }

      logger.info("[ArchibaldBot] Filter not set to 'Tutti gli ordini', changing filter...");

      // Open the dropdown - derive button ID from input's name ($ -> _, append _B-1)
      const dropdownClicked = await page.evaluate((sel: string, exactSel: string) => {
        const input = (
          document.querySelector(exactSel) ||
          document.querySelector(sel)
        ) as HTMLInputElement;
        if (!input) return false;

        // Strategy 1: Derive button ID from input name (Vertical$mainMenu$...Cb -> Vertical_mainMenu_..._Cb_B-1)
        if (input.name) {
          const buttonId = input.name.replace(/\$/g, "_") + "_B-1";
          const button = document.getElementById(buttonId) as HTMLElement;
          if (button) {
            button.click();
            return true;
          }
        }

        // Strategy 2: Find button in nearest parent containing both input and button
        const parent = input.closest("td, div");
        if (parent) {
          const button = parent.querySelector("[id$='_B-1']") as HTMLElement;
          if (button) {
            button.click();
            return true;
          }
        }

        // Strategy 3: Broad search for mainMenu combo button
        const fallback = document.querySelector("[id*='mainMenu'][id*='Cb_B-1']") as HTMLElement;
        if (fallback) {
          fallback.click();
          return true;
        }

        return false;
      }, FILTER_INPUT_SELECTOR, FILTER_INPUT_EXACT);

      if (!dropdownClicked) {
        logger.warn("[ArchibaldBot] Could not click filter dropdown, continuing anyway");
        return;
      }

      logger.info("[ArchibaldBot] Dropdown opened, waiting for list...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Find and click "Tutti gli ordini" in the dropdown by text content
      const optionClicked = await page.evaluate(() => {
        // Try exact ID first
        const exactOption = document.querySelector(
          "#Vertical_mainMenu_Menu_ITCNT8_xaf_a1_Cb_DDD_L_LBI0T0",
        ) as HTMLElement;
        if (exactOption) {
          exactOption.click();
          return true;
        }
        // Fallback: find by text in any visible dropdown list item
        const listItems = Array.from(
          document.querySelectorAll("[id*='Cb_DDD_L_LBI'] td, [class*='dxeListBoxItem']"),
        );
        for (const item of listItems) {
          if ((item as HTMLElement).textContent?.trim() === "Tutti gli ordini") {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!optionClicked) {
        logger.warn("[ArchibaldBot] Could not find 'Tutti gli ordini' option, continuing anyway");
        return;
      }

      logger.info("[ArchibaldBot] 'Tutti gli ordini' option clicked, waiting for page update...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify filter change
      const newFilterValue = await page.evaluate((sel: string, exactSel: string) => {
        const input = (
          document.querySelector(exactSel) ||
          document.querySelector(sel)
        ) as HTMLInputElement;
        return input ? input.value : null;
      }, FILTER_INPUT_SELECTOR, FILTER_INPUT_EXACT);

      const newIsAllOrders =
        newFilterValue === "Tutti gli ordini" ||
        (newFilterValue != null && newFilterValue.endsWith("OrdersAll"));

      logger.info("[ArchibaldBot] Filter change verification:", {
        newFilterValue,
        success: newIsAllOrders,
      });

      if (!newIsAllOrders) {
        logger.warn("[ArchibaldBot] Filter change verification failed, but continuing anyway");
      }
    } catch (error) {
      logger.error("[ArchibaldBot] Error while ensuring filter is set:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      logger.warn("[ArchibaldBot] Continuing with current filter despite error");
    }
  }

  /**
   * Download orders PDF export from Archibald
   * @param context Browser context to use
   * @returns Path to downloaded PDF file in /tmp
   */
  async downloadOrdersPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl: "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI3_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI3_",
      expectedFileNames: [
        "Ordini.pdf",
        "Ordini cliente.pdf",
        "Customer orders.pdf",
      ],
      filePrefix: "ordini",
      beforeClick: (page) => this.ensureOrdersFilterSetToAll(page),
      clickStrategy: "responsive-fallback",
      responsiveMenuButtonSelector: "#Vertical_mainMenu_Menu_DXI9_T",
      responsiveExportButtonSelector: "#Vertical_mainMenu_Menu_DXI7_T",
    });
  }

  async downloadDDTPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl: "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI3_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI3_",
      expectedFileNames: [
        "Documenti di trasporto.pdf",
        "Giornale di registrazione bolla di consegna.pdf",
        "Packing slip journal.pdf",
      ],
      filePrefix: "ddt",
      retryOnDataStoreError: true,
    });
  }

  async downloadInvoicesPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl: "https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI3_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI3_",
      expectedFileNames: [
        "Fatture.pdf",
        "Giornale di registrazione fatture cliente.pdf",
        "Customer invoice journal.pdf",
      ],
      filePrefix: "fatture",
    });
  }

  async downloadPricesPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl: "https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI3_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI3_",
      expectedFileNames: ["Tabella prezzi.pdf", "Price table.pdf"],
      filePrefix: "prezzi",
    });
  }

  async downloadOrderArticlesPDF(
    context: BrowserContext,
    archibaldOrderId: string,
  ): Promise<string> {
    const page = await context.newPage();
    const startTime = Date.now();
    let cancelDownload: () => void = () => {};

    try {
      logger.info("[ArchibaldBot] Starting Order Articles PDF download", {
        archibaldOrderId,
      });

      await page.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      });

      const cleanOrderId = archibaldOrderId.replace(/\./g, "");
      const orderUrl = `https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/${cleanOrderId}/?mode=View`;
      await page.goto(orderUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      logger.info("[ArchibaldBot] Navigated to order detail page", {
        archibaldOrderId,
        cleanOrderId,
      });

      await this.waitForDevExpressReadyOnPage(page);

      const timestamp = Date.now();
      const userId = this.userId || "unknown";
      const downloadPath = `/tmp/saleslines-${archibaldOrderId}-${timestamp}-${userId}.pdf`;

      const client = await page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: "/tmp",
      });

      const btnSelector = 'a[id*="xaf_dviSALESLINEs_ToolBar_Menu_DXI1_T"]';
      await page.waitForSelector(btnSelector, { timeout: 15000 });
      logger.info("[ArchibaldBot] PDF export button found");

      const downloadComplete = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(checkFile);
          reject(new Error("PDF download timeout (120s exceeded)"));
        }, 120000);

        const checkFile = setInterval(async () => {
          try {
            const files = await fsp.readdir("/tmp");
            const pdfFiles = files.filter(
              (f) =>
                (f.startsWith("Salesline") && f.endsWith(".pdf")) ||
                (f.startsWith(`saleslines-${archibaldOrderId}`) &&
                  f.endsWith(".pdf")),
            );

            if (pdfFiles.length > 0) {
              const sorted = await Promise.all(
                pdfFiles.map(async (f) => {
                  const stat = await fsp.stat(`/tmp/${f}`);
                  return { name: f, mtime: stat.mtime };
                }),
              );
              sorted.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

              const tempPath = `/tmp/${sorted[0].name}`;
              try {
                await fsp.rename(tempPath, downloadPath);
                clearTimeout(timeout);
                clearInterval(checkFile);
                resolve();
              } catch {
                // retry next poll
              }
            }
          } catch (pollErr) {
            clearTimeout(timeout);
            clearInterval(checkFile);
            reject(pollErr);
          }
        }, 500);

        cancelDownload = () => {
          clearTimeout(timeout);
          clearInterval(checkFile);
        };
      });
      // Suppress unhandled rejection if we throw before reaching await downloadComplete
      downloadComplete.catch(() => {});

      logger.info("[ArchibaldBot] Clicking PDF export button...");
      await page.evaluate((sel: string) => {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn) {
          btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      }, btnSelector);

      await downloadComplete;

      const stats = fs.statSync(downloadPath);
      if (stats.size === 0) {
        throw new Error("Downloaded PDF is empty (0 bytes)");
      }

      const duration = Date.now() - startTime;
      logger.info("[ArchibaldBot] Order Articles PDF downloaded successfully", {
        archibaldOrderId,
        downloadPath,
        durationMs: duration,
        sizeKB: (stats.size / 1024).toFixed(2),
      });

      return downloadPath;
    } catch (error: any) {
      logger.error("[ArchibaldBot] Failed to download Order Articles PDF", {
        archibaldOrderId,
        error: error.message,
        durationMs: Date.now() - startTime,
      });
      throw new Error(`PDF download failed: ${error.message}`);
    } finally {
      cancelDownload();
      if (!page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  private formatDateForArchibald(isoDate: string): string {
    // Converte da YYYY-MM-DD a DD/MM/YYYY
    const [year, month, day] = isoDate.split("-");
    return `${day}/${month}/${year}`;
  }

  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Generate performance dashboard with HTML, JSON, and CSV exports
   *
   * Creates three files in the specified output directory:
   * - HTML: Interactive dashboard with charts and bottleneck analysis
   * - JSON: Raw profiling data for external tools
   * - CSV: Tabular operation data for spreadsheet analysis
   *
   * @param outputDir Directory to save dashboard files (default: './profiling-reports')
   * @returns Paths to the generated files
   */
  public async generatePerformanceDashboard(
    outputDir: string = "./profiling-reports",
  ): Promise<{
    htmlPath: string;
    jsonPath: string;
    csvPath: string;
  }> {
    const { PerformanceDashboardGenerator } =
      await import("../performance-dashboard-generator");
    const profilingData = this.exportProfilingData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `profiling-${timestamp}`;

    const htmlPath = `${outputDir}/${baseName}.html`;
    const jsonPath = `${outputDir}/${baseName}.json`;
    const csvPath = `${outputDir}/${baseName}.csv`;

    await PerformanceDashboardGenerator.saveDashboard(profilingData, htmlPath, {
      format: "html",
    });

    await PerformanceDashboardGenerator.saveDashboard(profilingData, jsonPath, {
      format: "json",
    });

    await PerformanceDashboardGenerator.saveDashboard(profilingData, csvPath, {
      format: "csv",
    });

    return {
      htmlPath,
      jsonPath,
      csvPath,
    };
  }

  // ─── DevExpress-aware Customer Helpers ────────────────────────────────

  private async dumpVisibleInputIds(): Promise<void> {
    if (!this.page) return;
    const inputIds = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll("input"))
        .filter((i) => i.offsetParent !== null && i.id)
        .map((i) => i.id)
        .filter((id) => id.includes("xaf_dvi"));
    });
    logger.info("Visible DevExpress input IDs on page", { inputIds });
  }

  private async setDevExpressField(
    fieldRegex: RegExp,
    value: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    const result = await this.page.evaluate(
      (regex: string, val: string) => {
        const inputs = Array.from(document.querySelectorAll("input"));
        const input = inputs.find((i) =>
          new RegExp(regex).test(i.id),
        ) as HTMLInputElement | null;
        if (!input) return { found: false, id: "" };

        input.scrollIntoView({ block: "center" });
        input.focus();
        input.click();

        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) {
          setter.call(input, val);
        } else {
          input.value = val;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return { found: true, id: input.id };
      },
      fieldRegex.source,
      value,
    );

    if (!result.found) {
      throw new Error(`Input field not found: ${fieldRegex}`);
    }

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({
      timeout: 5000,
      label: `field-${result.id}`,
    });

    logger.debug("setDevExpressField done", { id: result.id, value });
  }

  private async typeDevExpressField(
    fieldRegex: RegExp,
    value: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    // Step 1: Find the field, scroll into view, focus it, and clear it.
    // We use the native value setter (not execCommand) to clear without
    // triggering DevExpress events prematurely.
    const inputId = await this.page.evaluate(
      (regex: string) => {
        const inputs = Array.from(document.querySelectorAll("input"));
        const input = inputs.find((i) =>
          new RegExp(regex).test(i.id),
        ) as HTMLInputElement | null;
        if (!input) return null;

        input.scrollIntoView({ block: "center" });
        input.focus();
        input.click();
        input.select();

        // Clear via native setter so page.type() appends to an empty field
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(input, "");
        else input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        return input.id;
      },
      fieldRegex.source,
    );

    if (!inputId) {
      throw new Error(`Input field not found: ${fieldRegex}`);
    }

    // Step 2: Type the value via real CDP keyboard events.
    // page.type() generates authentic keydown/keypress/keyup/input events that
    // DevExpress XAF tracks to trigger server-side model updates on Tab/blur.
    // execCommand('insertText') only fires the 'input' event and does NOT cause
    // DevExpress to commit the value to the server model, leading to save errors.
    await this.page.type(`#${inputId}`, value, { delay: 5 });

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({
      timeout: 8000,
      label: `typed-${inputId}`,
    });

    const actual = await this.page.evaluate((id: string) => {
      const input = document.getElementById(id) as HTMLInputElement | null;
      return input?.value ?? "";
    }, inputId);

    if (actual !== value) {
      logger.warn("typeDevExpressField value mismatch, retrying", {
        id: inputId,
        expected: value,
        actual,
      });

      await this.page.evaluate((id: string) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input) return;
        input.scrollIntoView({ block: "center" });
        input.focus();
        input.click();
        input.select();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(input, "");
        else input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, inputId);

      await this.page.type(`#${inputId}`, value, { delay: 5 });

      await this.page.keyboard.press("Tab");
      await this.waitForDevExpressIdle({
        timeout: 8000,
        label: `typed-retry-${inputId}`,
      });
    }

    logger.debug("typeDevExpressField done", { id: inputId, value });
  }

  private async setDevExpressComboBox(
    fieldRegex: RegExp,
    value: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    const result = await this.page.evaluate(
      (regex: string, val: string) => {
        const w = window as any;
        const inputs = Array.from(document.querySelectorAll("input"));
        const input = inputs.find((i) =>
          new RegExp(regex).test(i.id),
        ) as HTMLInputElement | null;
        if (!input) return { found: false, inputId: "", method: "" };

        input.scrollIntoView({ block: "center" });

        // Find DevExpress control that owns this input or a parent element
        const collection = w.ASPxClientControl?.GetControlCollection?.();
        if (collection) {
          let comboControl: any = null;

          // Strategy 1: match via GetInputElement()
          collection.ForEachControl((c: any) => {
            if (comboControl) return;
            try {
              const el = c.GetInputElement?.();
              if (el === input || (el && el.id === input.id)) {
                comboControl = c;
                return;
              }
            } catch {}
            // Strategy 2: the combo's main element contains our input
            try {
              const mainEl = c.GetMainElement?.();
              if (mainEl && mainEl.contains(input)) {
                if (
                  typeof c.GetItemCount === "function" ||
                  typeof c.SetSelectedIndex === "function"
                ) {
                  comboControl = c;
                }
              }
            } catch {}
          });

          if (comboControl) {
            // Try to find the item and select by index (most reliable)
            if (typeof comboControl.GetItemCount === "function") {
              const count = comboControl.GetItemCount();
              for (let i = 0; i < count; i++) {
                const itemText =
                  typeof comboControl.GetItem === "function"
                    ? comboControl.GetItem(i)?.text
                    : null;
                if (itemText === val) {
                  if (typeof comboControl.SetSelectedIndex === "function") {
                    comboControl.SetSelectedIndex(i);
                    return {
                      found: true,
                      inputId: input.id,
                      method: "api-SetSelectedIndex",
                      actual: input.value,
                    };
                  }
                }
              }
            }

            if (typeof comboControl.SetText === "function") {
              comboControl.SetText(val);
              return {
                found: true,
                inputId: input.id,
                method: "api-SetText",
                actual: input.value,
              };
            }

            if (typeof comboControl.SetValue === "function") {
              comboControl.SetValue(val);
              return {
                found: true,
                inputId: input.id,
                method: "api-SetValue",
                actual: input.value,
              };
            }
          }
        }

        // Fallback: type text, ArrowDown, Enter
        input.focus();
        input.click();
        input.select();
        document.execCommand("insertText", false, "");
        document.execCommand("insertText", false, val);

        return {
          found: true,
          inputId: input.id,
          method: "keyboard-fallback",
          actual: input.value,
        };
      },
      fieldRegex.source,
      value,
    );

    if (!result.found) {
      throw new Error(`ComboBox input not found: ${fieldRegex}`);
    }

    if (result.method === "keyboard-fallback") {
      await this.wait(500);
      await this.page.keyboard.press("ArrowDown");
      await this.wait(200);
      await this.page.keyboard.press("Enter");
      await this.wait(200);
    }

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({
      timeout: 5000,
      label: `combo-${result.inputId}`,
    });

    const actual = await this.page.evaluate((id: string) => {
      const input = document.getElementById(id) as HTMLInputElement;
      return input?.value || "";
    }, result.inputId);

    logger.debug("setDevExpressComboBox done", {
      id: result.inputId,
      requested: value,
      method: result.method,
      actual,
    });
  }

  private async selectFromDevExpressLookup(
    buttonRegex: RegExp,
    searchValue: string,
    matchHint?: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.debug("selectFromDevExpressLookup", {
      pattern: buttonRegex.source,
      searchValue,
    });

    const buttonId = await this.page.evaluate((regex: string) => {
      const allEls = Array.from(
        document.querySelectorAll("td, img, button, a, div"),
      );
      const btn = allEls.find((el) => new RegExp(regex).test(el.id));
      if (btn) {
        (btn as HTMLElement).scrollIntoView({ block: "center" });
        (btn as HTMLElement).click();
        return btn.id;
      }
      return null;
    }, buttonRegex.source);

    if (!buttonId) {
      throw new Error(`Lookup button not found: ${buttonRegex}`);
    }

    logger.debug("Lookup button clicked", { buttonId });

    try {
      await this.page.waitForFunction(
        () => {
          const dialogs = Array.from(
            document.querySelectorAll(
              '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
            ),
          ).filter((node) => {
            const el = node as HTMLElement;
            return (
              el.offsetParent !== null && el.getBoundingClientRect().width > 0
            );
          });
          return dialogs.length > 0;
        },
        { timeout: 10000, polling: 100 },
      );
    } catch {
      logger.warn(
        "Lookup dialog not detected by waitForFunction, proceeding with fallback...",
      );
      await this.wait(2000);
    }

    logger.debug("Lookup dialog appeared");

    // Wait for an iframe to appear inside the popup (some lookups load iframe late)
    let iframeInfo = { hasIframe: false, src: "", id: "" };
    const iframeWaitStart = Date.now();
    const iframeWaitTimeout = 5000;

    while (Date.now() - iframeWaitStart < iframeWaitTimeout) {
      iframeInfo = await this.page.evaluate(() => {
        const visibleIframes = Array.from(
          document.querySelectorAll("iframe"),
        ).filter((f) => {
          const el = f as HTMLElement;
          return el.offsetParent !== null && f.src;
        });

        const findPopup = visibleIframes.find((f) =>
          f.src.includes("FindPopup"),
        );
        if (findPopup) {
          return { hasIframe: true, src: findPopup.src, id: findPopup.id };
        }

        for (const f of visibleIframes) {
          const parent = f.closest(
            '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, [id*="PopupControl"], [id*="_PW"]',
          );
          if (parent) {
            return { hasIframe: true, src: f.src, id: f.id };
          }
        }

        return { hasIframe: false, src: "", id: "" };
      });

      if (iframeInfo.hasIframe) break;
      await this.wait(300);
    }

    logger.info("Lookup iframe check", {
      hasIframe: iframeInfo.hasIframe,
      src: iframeInfo.src?.substring(0, 100),
      id: iframeInfo.id,
      waitMs: Date.now() - iframeWaitStart,
    });

    if (iframeInfo.hasIframe) {
      await this.selectFromDevExpressLookupViaIframe(
        iframeInfo.id,
        searchValue,
        matchHint,
      );
    } else {
      await this.selectFromDevExpressLookupDirect(searchValue, matchHint);
    }

    await this.waitForDevExpressIdle({ timeout: 5000, label: "lookup-close" });
    logger.debug("selectFromDevExpressLookup completed");
  }

  private async selectFromDevExpressLookupDirect(
    searchValue: string,
    matchHint?: string,
  ): Promise<void> {
    if (!this.page) return;

    const searchInputId = await this.page.evaluate(() => {
      const dialogs = Array.from(
        document.querySelectorAll(
          '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
        ),
      ).filter((node) => {
        const el = node as HTMLElement;
        return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      });

      for (const dialog of dialogs) {
        const searchInput = dialog.querySelector(
          'input[id*="_DXSE_I"], input[id*="_DXFREditorcol0_I"]',
        ) as HTMLInputElement | null;
        if (searchInput && searchInput.offsetParent !== null) {
          return searchInput.id;
        }
        const visibleInputs = Array.from(
          dialog.querySelectorAll('input[type="text"]'),
        ).filter(
          (i) => (i as HTMLElement).offsetParent !== null,
        ) as HTMLInputElement[];
        if (visibleInputs.length > 0) {
          return visibleInputs[0].id;
        }
      }
      return null;
    });

    logger.info("Direct lookup search input", { searchInputId, searchValue });

    if (searchInputId) {
      await this.page.evaluate(
        (id: string, val: string) => {
          const input = document.getElementById(id) as HTMLInputElement;
          if (!input) return;
          input.focus();
          input.click();
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          if (setter) setter.call(input, val);
          else input.value = val;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        searchInputId,
        searchValue,
      );
      await this.page.keyboard.press("Enter");
    } else {
      await this.page.keyboard.type(searchValue, { delay: 30 });
      await this.page.keyboard.press("Enter");
    }

    logger.debug("Search value entered (direct), waiting for results...");

    try {
      await this.page.waitForFunction(
        () => {
          const selectors =
            '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl';
          const popups = Array.from(
            document.querySelectorAll(selectors),
          ).filter((node) => {
            const el = node as HTMLElement;
            return (
              el.offsetParent !== null && el.getBoundingClientRect().width > 0
            );
          });
          for (const popup of popups) {
            const rows = popup.querySelectorAll(
              'tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]',
            );
            if (rows.length > 0) return true;
          }
          return false;
        },
        { timeout: 12000, polling: 150 },
      );
    } catch {
      const popupDiag = await this.page.evaluate(() => {
        const selectors =
          '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl';
        const popups = Array.from(document.querySelectorAll(selectors)).filter(
          (node) => {
            const el = node as HTMLElement;
            return (
              el.offsetParent !== null && el.getBoundingClientRect().width > 0
            );
          },
        );
        return popups.map((p) => ({
          id: p.id,
          tagName: p.tagName,
          childIframes: Array.from(p.querySelectorAll("iframe")).map((f) => ({
            id: f.id,
            src: f.src?.substring(0, 200),
          })),
          inputs: Array.from(p.querySelectorAll("input"))
            .filter((i) => (i as HTMLElement).offsetParent !== null)
            .map((i) => ({
              id: i.id,
              type: (i as HTMLInputElement).type,
              value: (i as HTMLInputElement).value?.substring(0, 50),
            })),
          rows: p.querySelectorAll('tr[class*="dxgvDataRow"]').length,
          html: (p as HTMLElement).innerHTML?.substring(0, 500),
        }));
      });
      logger.warn("Rows not detected in direct lookup dialog", {
        searchValue,
        popupDiag,
      });
    }

    await this.selectRowInLookupDialog(searchValue, matchHint);

    await this.wait(200);
    await this.clickElementByText("OK", {
      exact: true,
      selectors: ["span", "button", "a", "td"],
    });

    await this.page
      .waitForFunction(
        () => {
          const dialogs = Array.from(
            document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
          ).filter((node) => {
            const el = node as HTMLElement;
            return (
              el.offsetParent !== null && el.getBoundingClientRect().width > 0
            );
          });
          return dialogs.every(
            (d) => d.querySelectorAll('tr[class*="dxgvDataRow"]').length === 0,
          );
        },
        { timeout: 5000, polling: 100 },
      )
      .catch(() => {});
  }

  private async selectFromDevExpressLookupViaIframe(
    iframeId: string,
    searchValue: string,
    matchHint?: string,
  ): Promise<void> {
    if (!this.page) return;

    const iframeHandle = await this.page.$(`#${iframeId}`);
    if (!iframeHandle) {
      logger.warn(
        "Iframe element not found by id, falling back to direct mode",
      );
      return this.selectFromDevExpressLookupDirect(searchValue, matchHint);
    }

    const frame = await iframeHandle.contentFrame();
    if (!frame) {
      logger.warn("Could not get contentFrame, falling back to direct mode");
      return this.selectFromDevExpressLookupDirect(searchValue, matchHint);
    }

    logger.debug("Working inside iframe for lookup");

    // Wait for iframe content to load and DevExpress to initialize
    try {
      await frame.waitForFunction(
        () => {
          const w = window as any;
          return (
            document.readyState === "complete" &&
            !!w.ASPxClientControl?.GetControlCollection
          );
        },
        { timeout: 10000, polling: 200 },
      );
    } catch {
      logger.warn("Iframe not fully ready, proceeding...");
    }

    await this.wait(300);

    // Find and focus the search input inside the iframe
    const searchFound = await frame.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).filter(
        (i) => (i as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement[];

      const searchInput =
        inputs.find(
          (i) => /_DXSE_I$/.test(i.id) || /_DXFREditorcol0_I$/.test(i.id),
        ) || inputs[0];

      if (!searchInput) return false;

      searchInput.focus();
      searchInput.click();
      // Clear any existing value
      searchInput.value = "";
      return true;
    });

    if (!searchFound) {
      logger.warn("No search input found inside iframe");
      return;
    }

    // Use real keyboard to type and press Enter (dispatchEvent doesn't trigger DevExpress callbacks)
    await this.page!.keyboard.type(searchValue, { delay: 20 });
    await this.wait(200);
    await this.page!.keyboard.press("Enter");

    logger.debug(
      "Search value entered in iframe via real keyboard, waiting for results...",
    );

    // Wait for rows to appear inside the iframe
    try {
      await frame.waitForFunction(
        () => {
          const w = window as any;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (col && typeof col.ForEachControl === "function") {
            let busy = false;
            col.ForEachControl((c: any) => {
              try {
                if (c.InCallback?.()) busy = true;
              } catch {}
            });
            if (busy) return false;
          }
          const rows = document.querySelectorAll(
            'tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]',
          );
          return rows.length > 0;
        },
        { timeout: 12000, polling: 150 },
      );
    } catch {
      logger.warn("Rows not detected inside iframe lookup");
      const iframeDiag = await frame.evaluate(() => {
        return {
          bodyHtml: document.body?.innerHTML?.substring(0, 800) || "(empty)",
          inputCount: document.querySelectorAll("input").length,
          rowCount: document.querySelectorAll("tr").length,
        };
      });
      logger.debug("Iframe diagnostic", iframeDiag);
    }

    // Select the matching row inside the iframe
    const selectionResult = await frame.evaluate(
      (query: string, hint?: string) => {
        const rows = Array.from(
          document.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);

        const rowTexts = rows
          .slice(0, 10)
          .map((r) => r.textContent?.trim().substring(0, 80) || "");

        if (rows.length === 0)
          return { clicked: false, reason: "no-rows", rowCount: 0, rowTexts };

        if (rows.length === 1) {
          const target =
            rows[0].querySelector("td") || (rows[0] as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "single-row", rowCount: 1, rowTexts };
        }

        if (hint) {
          const hintLower = hint.trim().toLowerCase();
          for (const row of rows) {
            if (row.textContent?.toLowerCase().includes(hintLower)) {
              const target = row.querySelector("td") || (row as HTMLElement);
              (target as HTMLElement).scrollIntoView({ block: "center" });
              (target as HTMLElement).click();
              return {
                clicked: true,
                reason: "hint-match",
                rowCount: rows.length,
                rowTexts,
                hint,
              };
            }
          }
        }

        const queryLower = query.trim().toLowerCase();
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          if (
            cells.some(
              (c) => c.textContent?.trim().toLowerCase() === queryLower,
            )
          ) {
            const target = cells[0] || (row as HTMLElement);
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return {
              clicked: true,
              reason: "exact-match",
              rowCount: rows.length,
              rowTexts,
            };
          }
        }

        for (const row of rows) {
          if (row.textContent?.toLowerCase().includes(queryLower)) {
            const target = row.querySelector("td") || (row as HTMLElement);
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return {
              clicked: true,
              reason: "contains-match",
              rowCount: rows.length,
              rowTexts,
            };
          }
        }

        const target = rows[0].querySelector("td") || (rows[0] as HTMLElement);
        (target as HTMLElement).scrollIntoView({ block: "center" });
        (target as HTMLElement).click();
        return {
          clicked: true,
          reason: "fallback-first",
          rowCount: rows.length,
          rowTexts,
        };
      },
      searchValue,
      matchHint,
    );

    logger.debug("Iframe row selection result", selectionResult);

    await this.wait(300);

    // Click OK — could be inside iframe or in main page
    let okClicked = await frame.evaluate(() => {
      const okBtns = Array.from(
        document.querySelectorAll("span, button, a, td"),
      ).filter((el) => {
        const h = el as HTMLElement;
        return h.offsetParent !== null && h.textContent?.trim() === "OK";
      });
      if (okBtns.length > 0) {
        (okBtns[0] as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!okClicked) {
      okClicked = await this.clickElementByText("OK", {
        exact: true,
        selectors: ["span", "button", "a", "td"],
      });
    }
    logger.debug("OK button clicked", {
      okClicked,
      context: okClicked ? "found" : "not-found",
    });

    // Wait for popup to close in main page
    try {
      await this.page.waitForFunction(
        () => {
          const iframes = Array.from(
            document.querySelectorAll("iframe"),
          ).filter((f) => {
            const el = f as HTMLElement;
            return (
              el.offsetParent !== null && f.src && f.src.includes("FindPopup")
            );
          });
          return iframes.length === 0;
        },
        { timeout: 8000, polling: 200 },
      );
    } catch {
      logger.warn("Iframe popup did not close within timeout, trying Escape");
      await this.page.keyboard.press("Escape");
      await this.wait(1000);
    }
  }

  private async selectRowInLookupDialog(
    searchValue: string,
    matchHint?: string,
  ): Promise<void> {
    if (!this.page) return;

    const selectionResult = await this.page.evaluate(
      (query: string, hint?: string) => {
        const dialogs = Array.from(
          document.querySelectorAll(
            '[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpc-mainDiv, [id*="PopupControl"], [id*="_PW"], .dxpnlControl',
          ),
        ).filter((node) => {
          const el = node as HTMLElement;
          return (
            el.offsetParent !== null && el.getBoundingClientRect().width > 0
          );
        });

        let container: Element | null = null;
        for (const d of dialogs) {
          if (d.querySelector('tr[class*="dxgvDataRow"]')) {
            container = d;
            break;
          }
        }
        if (!container)
          return {
            clicked: false,
            reason: "no-container",
            rowCount: 0,
            rowTexts: [] as string[],
          };

        const rows = Array.from(
          container.querySelectorAll('tr[class*="dxgvDataRow"]'),
        ).filter((r) => (r as HTMLElement).offsetParent !== null);

        const rowTexts = rows
          .slice(0, 10)
          .map((r) => r.textContent?.trim().substring(0, 80) || "");

        if (rows.length === 0)
          return { clicked: false, reason: "no-rows", rowCount: 0, rowTexts };

        if (rows.length === 1) {
          const target =
            rows[0].querySelector("td") || (rows[0] as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "single-row", rowCount: 1, rowTexts };
        }

        if (hint) {
          const hintLower = hint.trim().toLowerCase();
          for (const row of rows) {
            if (row.textContent?.toLowerCase().includes(hintLower)) {
              const target = row.querySelector("td") || (row as HTMLElement);
              (target as HTMLElement).scrollIntoView({ block: "center" });
              (target as HTMLElement).click();
              return {
                clicked: true,
                reason: "hint-match",
                rowCount: rows.length,
                rowTexts,
                hint,
              };
            }
          }
        }

        const queryLower = query.trim().toLowerCase();
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td"));
          if (
            cells.some(
              (c) => c.textContent?.trim().toLowerCase() === queryLower,
            )
          ) {
            const target = cells[0] || (row as HTMLElement);
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return {
              clicked: true,
              reason: "exact-match",
              rowCount: rows.length,
              rowTexts,
            };
          }
        }

        for (const row of rows) {
          if (row.textContent?.toLowerCase().includes(queryLower)) {
            const target = row.querySelector("td") || (row as HTMLElement);
            (target as HTMLElement).scrollIntoView({ block: "center" });
            (target as HTMLElement).click();
            return {
              clicked: true,
              reason: "contains-match",
              rowCount: rows.length,
              rowTexts,
            };
          }
        }

        const target = rows[0].querySelector("td") || (rows[0] as HTMLElement);
        (target as HTMLElement).scrollIntoView({ block: "center" });
        (target as HTMLElement).click();
        return {
          clicked: true,
          reason: "fallback-first",
          rowCount: rows.length,
          rowTexts,
        };
      },
      searchValue,
      matchHint,
    );

    logger.debug("Row selection result", selectionResult);
  }

  private static readonly TAB_ALIASES: Record<string, string[]> = {
    "Principale": ["Principale", "Main"],
    "Main": ["Main", "Principale"],
    "Prezzi e sconti": ["Prezzi e sconti", "Price Discount", "Prices and Discounts"],
    "Price Discount": ["Price Discount", "Prezzi e sconti", "Prices and Discounts"],
    "Indirizzo alt": ["Indirizzo alt", "Alt. address", "Alt. Address", "Alternative address"],
    "Alt. address": ["Alt. address", "Alt. Address", "Indirizzo alt", "Alternative address"],
    "Dettagli fiscali": ["Dettagli fiscali", "Tax", "Tax Details"],
    "Tax": ["Tax", "Tax Details", "Dettagli fiscali"],
    "Orari di consegna": ["Orari di consegna", "Deliverytimes", "Delivery times"],
    "Deliverytimes": ["Deliverytimes", "Delivery times", "Orari di consegna"],
    "Info CRM": ["Info CRM", "CRM Infos", "CRM Info"],
    "CRM Infos": ["CRM Infos", "CRM Info", "Info CRM"],
    "Altre informazioni": ["Altre informazioni", "Other Information"],
    "Other Information": ["Other Information", "Altre informazioni"],
  };

  private async openCustomerTab(tabText: string): Promise<boolean> {
    if (!this.page) return false;

    const candidates = ArchibaldBot.TAB_ALIASES[tabText] || [tabText];

    for (const candidate of candidates) {
      const result = await this.tryOpenTab(candidate);
      if (result) return true;
    }

    logger.warn(`Tab "${tabText}" not found (tried: ${candidates.join(", ")})`);
    return false;
  }

  private async tryOpenTab(tabText: string): Promise<boolean> {
    if (!this.page) return false;

    const clicked = await this.page.evaluate((text: string) => {
      const links = Array.from(
        document.querySelectorAll("a.dxtc-link, span.dx-vam"),
      );

      for (const el of links) {
        const elText = el.textContent?.trim() || "";
        if (elText.includes(text)) {
          const clickTarget = el.tagName === "A" ? el : el.parentElement;
          if (
            clickTarget &&
            (clickTarget as HTMLElement).offsetParent !== null
          ) {
            (clickTarget as HTMLElement).click();
            return true;
          }
        }
      }

      const tabs = Array.from(document.querySelectorAll('li[id*="_pg_AT"]'));
      for (const tab of tabs) {
        const link = tab.querySelector("a.dxtc-link");
        const span = tab.querySelector("span.dx-vam");
        const tabLabel = span?.textContent?.trim() || "";
        if (
          tabLabel.includes(text) &&
          link &&
          (link as HTMLElement).offsetParent !== null
        ) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, tabText);

    if (!clicked) return false;

    logger.info(`Tab "${tabText}" clicked`);

    try {
      await this.page.waitForFunction(
        () => {
          const w = window as any;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (!col || typeof col.ForEachControl !== "function") return true;
          let busy = false;
          col.ForEachControl((c: any) => {
            try {
              if (c.InCallback?.()) busy = true;
            } catch {}
          });
          return !busy;
        },
        { timeout: 5000, polling: 100 },
      );
    } catch {}

    return true;
  }

  private async dismissDevExpressPopups(): Promise<boolean> {
    if (!this.page) return false;

    const result = await this.page.evaluate(() => {
      const w = window as any;
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (!collection) return { dismissed: false, popups: [] as string[] };

      const popups: string[] = [];
      collection.ForEachControl((c: any) => {
        const name = c?.name || c?.GetName?.() || "";
        if (
          (name.includes("PopupWindow") || name.includes("popupWindow") || name.includes("UPPopup")) &&
          typeof c.Hide === "function"
        ) {
          try {
            const isVisible = typeof c.IsVisible === "function" ? c.IsVisible() : true;
            if (isVisible) {
              c.Hide();
              popups.push(name);
            }
          } catch {
            c.Hide();
            popups.push(name);
          }
        }
      });

      return { dismissed: popups.length > 0, popups };
    });

    if (result.dismissed) {
      logger.info("Dismissed DevExpress popups", { popups: result.popups });
      await this.waitForDevExpressIdle({ timeout: 3000, label: "dismiss-popups" });
    }

    return result.dismissed;
  }

  private async ensureNameFieldBeforeSave(expectedName: string): Promise<void> {
    if (!this.page) return;

    const { currentValue, maxLength } = await this.page.evaluate(() => {
      const input = document.querySelector(
        'input[id*="dviNAME"][id$="_I"]',
      ) as HTMLInputElement | null;
      return {
        currentValue: input?.value ?? null,
        maxLength: input?.maxLength ?? 0,
      };
    });

    // Truncate to field's maxLength so comparison and re-type use the actual storable value
    const effectiveExpected =
      maxLength > 0 ? expectedName.substring(0, maxLength) : expectedName;

    if (currentValue !== effectiveExpected) {
      logger.warn("NAME field empty/wrong before save", {
        expected: effectiveExpected.substring(0, 60),
        actual: String(currentValue).substring(0, 60),
        maxLength,
      });
    }

    // Always re-type NAME right before save to guarantee the server-side model has the
    // latest value. Without this, rapid typing of subsequent fields (PEC, SDI, …) can
    // race with NAME's DevExpress callback and leave the server model without NAME.
    const inputId = await this.page.evaluate(() => {
      const input = document.querySelector(
        'input[id*="dviNAME"][id$="_I"]',
      ) as HTMLInputElement | null;
      if (!input) return null;
      input.scrollIntoView({ block: "center" });
      input.focus();
      input.click();
      input.select();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(input, "");
      else input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return input.id;
    });

    if (!inputId) {
      logger.warn("NAME field not found for pre-save refill");
      return;
    }

    await this.page.type(`#${inputId}`, effectiveExpected, { delay: 20 });
    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({ timeout: 5000, label: "name-prefill" });

    const verifiedValue = await this.page.evaluate((id: string) => {
      return (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    }, inputId);

    logger.info("NAME field pre-save re-type result", {
      expected: effectiveExpected.substring(0, 60),
      actual: verifiedValue.substring(0, 60),
      ok: verifiedValue === effectiveExpected,
    });
  }

  private async saveAndCloseCustomer(): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Saving customer (Salva e chiudi)");

    const saveAttempt = async (): Promise<boolean> => {
      let directSaveClicked = await this.clickElementByText(
        "Salva e chiudi",
        {
          exact: true,
          selectors: ["a", "span", "div", "li"],
        },
      );

      if (!directSaveClicked) {
        directSaveClicked = await this.clickElementByText(
          "Save and Close",
          { exact: true, selectors: ["a", "span", "div", "li"] },
        );
      }

      if (directSaveClicked) {
        logger.info('Clicked save button directly');
        return true;
      }

      logger.debug(
        'Direct save button not found, trying "Salvare" dropdown...',
      );

      const dropdownOpened = await this.page!.evaluate(() => {
        const allElements = Array.from(
          document.querySelectorAll("span, button, a"),
        );
        const salvareBtn = allElements.find((el) => {
          const text = el.textContent?.trim() || "";
          return text.toLowerCase().includes("salvare");
        });

        if (!salvareBtn) return false;

        const parent = salvareBtn.closest("li") || salvareBtn.parentElement;
        if (!parent) return false;

        const popOut =
          parent.querySelector("div.dxm-popOut") ||
          parent.querySelector('[id*="_P"]');
        if (popOut && (popOut as HTMLElement).offsetParent !== null) {
          (popOut as HTMLElement).click();
          return true;
        }

        const arrow = parent.querySelector('img[id*="_B-1"], img[alt*="down"]');
        if (arrow) {
          (arrow as HTMLElement).click();
          return true;
        }

        (salvareBtn as HTMLElement).click();
        return true;
      });

      if (!dropdownOpened) {
        const byId = await this.page!.evaluate(() => {
          const el = document.querySelector(
            "#Vertical_mainMenu_Menu_DXI1i1_T",
          ) as HTMLElement;
          if (el) {
            el.click();
            return true;
          }
          return false;
        });
        return byId;
      }

      await this.wait(500);

      const saveClicked = await this.clickElementByText("Salva e chiudi", {
        exact: true,
        selectors: ["a", "span", "div"],
      });

      if (!saveClicked) {
        logger.warn('"Salva e chiudi" not found in dropdown');
        return false;
      }

      logger.info('Clicked "Salva e chiudi" from dropdown');
      return true;
    };

    const saved = await saveAttempt();
    if (!saved) throw new Error("Save button not found");

    await this.waitForDevExpressIdle({ timeout: 8000, label: "save-customer" });

    // Find the "Ignore warnings" checkbox or button (detect first, click natively)
    const warningSelector = await this.page.evaluate(() => {
      // Try DevExpress ErrorInfo checkbox wrapper (the input is type="text", not "checkbox")
      const checkbox = document.querySelector(
        'input[id$="_ErrorInfo_Ch_S"]',
      ) as HTMLElement | null;
      if (checkbox) {
        const wrapper = checkbox.closest(
          'span[id$="_ErrorInfo_Ch_S_D"]',
        ) as HTMLElement | null;
        if (wrapper)
          return { selector: `#${wrapper.id}`, type: "errorinfo-checkbox" };
        return { selector: `#${checkbox.id}`, type: "errorinfo-checkbox" };
      }

      // Try "Ignore warnings" button/link in DevExpress popup
      const allClickable = Array.from(
        document.querySelectorAll("a, span, button, div, td"),
      );
      for (const el of allClickable) {
        const text = (el as HTMLElement).textContent?.trim();
        if (text === "Ignore warnings" || text === "Ignora avvisi") {
          const htmlEl = el as HTMLElement;
          if (htmlEl.id)
            return {
              selector: `#${htmlEl.id}`,
              type: "ignore-warnings-button",
            };
          // Fallback: JS click for elements without id
          htmlEl.click();
          return { selector: null, type: "ignore-warnings-button-js" };
        }
      }

      return null;
    });

    let warningFound: string | null = null;
    if (warningSelector) {
      if (warningSelector.selector) {
        // Try DevExpress global control API first (most reliable for ASPxCheckBox)
        const apiResult = await this.page.evaluate(() => {
          const input = document.querySelector(
            'input[id$="_ErrorInfo_Ch_S"]',
          ) as HTMLInputElement | null;
          if (!input) return null;
          // DevExpress registers ASPxCheckBox as window[clientId]
          const ctrl = (window as unknown as Record<string, unknown>)[input.id] as {
            SetChecked?: (v: boolean) => void;
          } | undefined;
          if (ctrl?.SetChecked) {
            ctrl.SetChecked(true);
            return { method: "SetChecked-global", inputId: input.id };
          }
          return null;
        });
        if (apiResult) {
          logger.info("Acknowledged warning checkbox via DevExpress API", apiResult);
        } else {
          // Fallback: Puppeteer native click
          await this.page.click(warningSelector.selector);
          logger.info("Clicked warning element with native click", warningSelector);
        }
      } else {
        logger.info("Clicked warning element with JS click", warningSelector);
      }
      warningFound = warningSelector.type;
    }

    // Check for inline "Data Validation Error" with any checkbox on the page
    const hasValidationError = await this.page.evaluate(() => {
      const body = document.body.innerText || "";
      return (
        body.includes("Data Validation Error") ||
        body.includes("non deve essere vuoto")
      );
    });

    if (hasValidationError && !warningFound) {
      logger.info(
        "Inline validation error detected, searching for any checkbox to acknowledge",
      );

      const allCheckboxes = await this.page.evaluate(() => {
        const results: {
          tag: string;
          id: string;
          type: string;
          checked: boolean;
          className: string;
          parentText: string;
        }[] = [];

        document
          .querySelectorAll(
            'input[type="checkbox"], span[class*="CheckBox"], span[class*="dxeCheck"], span[class*="dxWeb_edtCheckBox"]',
          )
          .forEach((el) => {
            const htmlEl = el as HTMLElement;
            const input =
              el.tagName === "INPUT" ? (el as HTMLInputElement) : null;
            const parent = htmlEl.closest("tr") || htmlEl.parentElement;
            results.push({
              tag: el.tagName,
              id: htmlEl.id || "",
              type: input?.type || "",
              checked: input?.checked ?? false,
              className: htmlEl.className.substring(0, 100),
              parentText: (parent?.textContent || "").substring(0, 200),
            });
          });

        return results;
      });

      logger.info("All checkboxes found on page", {
        count: allCheckboxes.length,
        checkboxes: allCheckboxes,
      });

      // Find any visible checkbox, return selector for native click
      const checkboxToClick = await this.page.evaluate(() => {
        // Try DevExpress ErrorInfo checkbox wrapper first
        const errorCheckbox = document.querySelector(
          'input[id$="_ErrorInfo_Ch_S"]',
        ) as HTMLElement | null;
        if (errorCheckbox) {
          const wrapper = errorCheckbox.closest(
            'span[id$="_ErrorInfo_Ch_S_D"]',
          ) as HTMLElement | null;
          if (wrapper && wrapper.offsetParent !== null) {
            return {
              selector: `#${wrapper.id}`,
              id: wrapper.id,
              method: "errorinfo-wrapper",
            };
          }
        }

        // Try standard HTML checkboxes
        const checkboxes = Array.from(
          document.querySelectorAll('input[type="checkbox"]'),
        ) as HTMLInputElement[];
        for (const cb of checkboxes) {
          if (!cb.checked && cb.offsetParent !== null) {
            if (cb.id)
              return {
                selector: `#${cb.id}`,
                id: cb.id,
                method: "input-checkbox",
              };
            const wrapper = cb.closest("span") || cb.parentElement;
            if (wrapper) {
              (wrapper as HTMLElement).click();
              return { selector: null, id: cb.id, method: "input-checkbox-js" };
            }
          }
        }

        // Try DevExpress checkbox spans
        const dxCheckboxes = Array.from(
          document.querySelectorAll(
            'span[class*="CheckBox"], span[class*="dxeCheck"], span[class*="dxWeb_edtCheckBox"]',
          ),
        );
        for (const el of dxCheckboxes) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent !== null && htmlEl.id) {
            return {
              selector: `#${htmlEl.id}`,
              id: htmlEl.id,
              method: "dx-checkbox-span",
            };
          }
        }

        return null;
      });

      const clickedCheckbox = checkboxToClick;
      if (checkboxToClick?.selector) {
        await this.page.click(checkboxToClick.selector);
      }

      if (clickedCheckbox) {
        logger.info("Validation error checkbox clicked", clickedCheckbox);
        await this.waitForDevExpressIdle({
          timeout: 3000,
          label: "validation-checkbox-ack",
        });

        const savedAgain = await saveAttempt();
        if (!savedAgain) {
          await this.clickElementByText("Salva e chiudi", {
            selectors: ["a", "span", "button", "li"],
          });
        }
        await this.waitForDevExpressIdle({
          timeout: 8000,
          label: "save-customer-after-validation-ack",
        });
      } else {
        logger.warn("Validation error detected but no checkbox found to click");
      }
    } else if (warningFound) {
      logger.info(
        "Warning acknowledged via " + warningFound + ", saving again",
      );
      await this.waitForDevExpressIdle({ timeout: 3000, label: "warning-ack" });

      const alreadyClosed = await this.page.evaluate(
        () => !window.location.href.includes("DetailView"),
      );

      if (!alreadyClosed) {
        const savedAgain = await saveAttempt();
        if (!savedAgain) {
          logger.warn(
            "Second save attempt failed, trying direct click fallback",
          );
          await this.clickElementByText("Salva e chiudi", {
            selectors: ["a", "span", "button", "li"],
          });
        }
        await this.waitForDevExpressIdle({
          timeout: 8000,
          label: "save-customer-2",
        });
      }
    }

    // Verify the form actually closed (URL should navigate away from DetailView)
    let formClosed = false;
    try {
      await this.page.waitForFunction(
        () => !window.location.href.includes("DetailView"),
        { timeout: 10000, polling: 500 },
      );
      formClosed = true;
    } catch {
      formClosed = false;
    }

    if (!formClosed) {
      // Form still open — retry: the warning may have appeared late
      logger.info("Form still open after save, retrying warning check");

      // Detect late checkbox/button, then click natively
      const lateSelector = await this.page.evaluate(() => {
        // Try DevExpress ErrorInfo checkbox wrapper
        const checkbox = document.querySelector(
          'input[id$="_ErrorInfo_Ch_S"]',
        ) as HTMLElement | null;
        if (checkbox) {
          const wrapper = checkbox.closest(
            'span[id$="_ErrorInfo_Ch_S_D"]',
          ) as HTMLElement | null;
          if (wrapper) return { selector: `#${wrapper.id}`, type: "checkbox" };
          return { selector: `#${checkbox.id}`, type: "checkbox" };
        }

        // Try any clickable element with "Ignore warnings" / "Ignora avvisi"
        const all = Array.from(document.querySelectorAll("*"));
        for (const el of all) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.children.length > 0) continue;
          const text = htmlEl.textContent?.trim();
          if (text === "Ignore warnings" || text === "Ignora avvisi") {
            if (htmlEl.id) return { selector: `#${htmlEl.id}`, type: "button" };
            htmlEl.click();
            return { selector: null, type: "button-js" };
          }
        }

        return null;
      });

      let lateWarning: string | null = null;
      if (lateSelector) {
        if (lateSelector.selector) {
          const lateApiResult = await this.page.evaluate(() => {
            const input = document.querySelector(
              'input[id$="_ErrorInfo_Ch_S"]',
            ) as HTMLInputElement | null;
            if (!input) return null;
            const ctrl = (window as unknown as Record<string, unknown>)[input.id] as {
              SetChecked?: (v: boolean) => void;
            } | undefined;
            if (ctrl?.SetChecked) {
              ctrl.SetChecked(true);
              return { method: "SetChecked-global", inputId: input.id };
            }
            return null;
          });
          if (!lateApiResult) {
            await this.page.click(lateSelector.selector);
          }
          logger.info("Late warning acknowledged", { lateApiResult, lateSelector });
        }
        lateWarning = lateSelector.type;
      }

      if (lateWarning) {
        logger.info(
          "Late warning acknowledged via " + lateWarning + ", saving again",
        );
        await this.waitForDevExpressIdle({
          timeout: 3000,
          label: "late-warning-ack",
        });

        const alreadyClosed = await this.page.evaluate(
          () => !window.location.href.includes("DetailView"),
        );

        if (!alreadyClosed) {
          const savedAgain = await saveAttempt();
          if (!savedAgain) {
            await this.clickElementByText("Salva e chiudi", {
              selectors: ["a", "span", "button", "li"],
            });
          }
          await this.waitForDevExpressIdle({
            timeout: 8000,
            label: "save-customer-3",
          });
        }

        // Final form-closed check
        try {
          await this.page.waitForFunction(
            () => !window.location.href.includes("DetailView"),
            { timeout: 10000, polling: 500 },
          );
          formClosed = true;
        } catch {
          formClosed = false;
        }
      }
    }

    if (!formClosed) {
      const popupDismissed = await this.dismissDevExpressPopups();

      if (popupDismissed) {
        const savedAfterPopup = await saveAttempt();
        if (!savedAfterPopup) {
          await this.clickElementByText("Salva e chiudi", {
            selectors: ["a", "span", "button", "li"],
          });
        }

        try {
          await this.page.waitForFunction(
            () => !window.location.href.includes("DetailView"),
            { timeout: 10000, polling: 500 },
          );
          formClosed = true;
        } catch {
          formClosed = false;
        }
      }
    }

    if (!formClosed) {
      const screenshotPath = `logs/customer-save-failed-${Date.now()}.png`;
      try {
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info("Save-failure screenshot saved", { screenshotPath });
      } catch {
        logger.warn("Failed to save diagnostic screenshot");
      }

      const diagnostics = await this.page.evaluate(() => {
        const errorTexts: string[] = [];
        const checkboxes: { id: string; checked: boolean; text: string }[] = [];
        const popups: { id: string; visible: boolean; text: string }[] = [];

        document.querySelectorAll('input[id*="ErrorInfo"]').forEach((el) => {
          const input = el as HTMLInputElement;
          const row = el.closest("tr") || el.parentElement;
          const text = row?.textContent?.trim() || "";
          checkboxes.push({
            id: input.id,
            checked: input.checked,
            text: text.substring(0, 300),
          });
          if (text) errorTexts.push(text);
        });

        document
          .querySelectorAll(".dxpc-content, .dxpc-contentWrapper")
          .forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.offsetParent !== null && htmlEl.textContent?.trim()) {
              errorTexts.push(htmlEl.textContent.trim());
            }
          });

        document
          .querySelectorAll(
            '[role="alert"], [role="alertdialog"], .dxeErrorCell',
          )
          .forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.offsetParent !== null && htmlEl.textContent?.trim()) {
              errorTexts.push(htmlEl.textContent.trim());
            }
          });

        document
          .querySelectorAll(
            ".dxeErrorFrameSys, .dxeEditError, .dxeValidationError, .dxpc-main",
          )
          .forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.offsetParent !== null && htmlEl.textContent?.trim()) {
              errorTexts.push(
                `[${htmlEl.className.substring(0, 50)}] ${htmlEl.textContent.trim()}`,
              );
            }
          });

        document
          .querySelectorAll(
            'div[id*="Popup"], div[id*="popup"], div[id*="Dialog"], div[id*="dialog"]',
          )
          .forEach((el) => {
            const htmlEl = el as HTMLElement;
            const isVisible =
              htmlEl.offsetParent !== null || htmlEl.style.display !== "none";
            const text = htmlEl.textContent?.trim() || "";
            if (text.length > 0 && text.length < 1000) {
              popups.push({
                id: htmlEl.id,
                visible: isVisible,
                text: text.substring(0, 500),
              });
              if (isVisible) errorTexts.push(text);
            }
          });

        let visibleFormText = "";
        const formArea =
          document.querySelector(".dxflGroupBox, .xafContent, form") ||
          document.body;
        if (formArea) {
          visibleFormText = (formArea as HTMLElement).innerText
            .replace(/\n{3,}/g, "\n\n")
            .substring(0, 2000);
        }

        return { errorTexts, checkboxes, popups, visibleFormText };
      });

      logger.error("Save failed: form did not close after save", {
        screenshotPath,
        errorTexts: diagnostics.errorTexts,
        checkboxes: diagnostics.checkboxes,
        popups: diagnostics.popups,
        visibleFormText: diagnostics.visibleFormText.substring(0, 1000),
      });

      const errorDetail =
        diagnostics.errorTexts.length > 0
          ? diagnostics.errorTexts.join("; ").substring(0, 500)
          : `errore di validazione non rilevato. Screenshot: ${screenshotPath}. Testo visibile: ${diagnostics.visibleFormText.substring(0, 300)}`;

      throw new Error(
        `Salvataggio fallito: il form non si è chiuso. Dettaglio: ${errorDetail}`,
      );
    }

    logger.info("Customer saved (form closed successfully)");
  }

  private async writeAltAddresses(addresses: AddressEntry[]): Promise<void> {
    if (!this.page) throw new Error('Browser page is null');

    await this.openCustomerTab('Indirizzo alt');
    await this.waitForDevExpressIdle({ timeout: 5000, label: 'tab-indirizzo-alt-write' });

    // ── 1. Discover grid name (the ADDRESSes XAF list editor) ─────────────────
    // The grid control name contains "ADDRESSes" (XAF property name). Searching
    // for this is more reliable than "Address" or "LOGISTICS" which don't appear.
    const altGridName = await this.page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return '';
      let found = '';
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        const cName = c?.name || c?.GetName?.() || '';
        if (cName.includes('ADDRESSes') && typeof c?.AddNewRow === 'function') {
          found = cName;
        }
      });
      return found;
    });

    if (!altGridName) {
      logger.warn('writeAltAddresses: ADDRESSes grid control not found — skipping alt-address write');
      return;
    }

    // ── 2. Delete all existing rows ────────────────────────────────────────────
    // XAF grid delete flow:
    //   1. Click the DXSelBtn checkbox in the first data row to select it
    //      (server callback enables the toolbar Delete button)
    //   2. Click the toolbar Delete button
    //   3. Accept the window.confirm() dialog DevExpress raises
    // Observed behavior: after dialog accept the server callback may lag, so we
    // poll until rowCount actually decreases (up to ~6 s).  If a Delete click
    // doesn't immediately reduce the count the loop retries — the toolbar stays
    // enabled and a second click (without dialog) completes the deletion.
    {
      let rowCount = await this.page.evaluate(() => {
        const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
        return grid ? grid.querySelectorAll('[class*="dxgvDataRow_"]').length : 0;
      });

      // Native Playwright click selector: auto-retries and handles visibility.
      const selBtnSelector =
        '[id*="ADDRESSes"][class*="dxgvControl"] [class*="dxgvDataRow_"]:first-of-type [id*="DXSelBtn"]';

      for (let attempt = 0; attempt < rowCount + 5 && rowCount > 0; attempt++) {
        // DXSelBtn is a toggle — skip if toolbar is already enabled to avoid deselecting.
        const alreadyEnabled = await this.page.evaluate(() => {
          const btn = document.querySelector('[id*="ADDRESSes"][id*="ToolBar_Menu_DXI0_T"]');
          return btn ? !btn.classList.contains('dxm-disabled') : false;
        });

        if (!alreadyEnabled) {
          // Use Playwright page.click() as primary (handles visibility/retry automatically).
          // Fall back to evaluate-based click if the native selector times out.
          try {
            const selBtnEl = await this.page.waitForSelector(selBtnSelector, { timeout: 4000 });
            await selBtnEl?.click();
          } catch {
            const clicked = await this.page.evaluate(() => {
              const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
              if (!grid) return false;
              const firstRow = grid.querySelector('[class*="dxgvDataRow_"]');
              if (!firstRow) return false;
              const selBtn = (firstRow.querySelector('[id*="DXSelBtn"]') as HTMLElement | null)
                ?? (firstRow.querySelector('td:first-child [id*="Sel"]') as HTMLElement | null);
              if (selBtn) { selBtn.click(); return true; }
              return false;
            });
            if (!clicked) {
              logger.warn('writeAltAddresses: DXSelBtn not found, stopping delete loop', { attempt });
              break;
            }
          }
          await this.waitForDevExpressIdle({ timeout: 4000, label: 'alt-select-row' });
        }

        const toolbarEnabled = await this.page.evaluate(() => {
          const btn = document.querySelector('[id*="ADDRESSes"][id*="ToolBar_Menu_DXI0_T"]');
          return btn ? !btn.classList.contains('dxm-disabled') : false;
        });

        if (!toolbarEnabled) {
          logger.warn('writeAltAddresses: toolbar Delete not enabled after selection', { attempt });
          break;
        }

        // Register dialog handler BEFORE clicking Delete (DevExpress uses window.confirm).
        this.page.once('dialog', (dialog) => { void dialog.accept(); });

        await this.page.evaluate(() => {
          const btn = document.querySelector('[id*="ADDRESSes"][id*="ToolBar_Menu_DXI0_T"]') as HTMLElement | null;
          if (btn) btn.click();
        });
        await this.waitForDevExpressIdle({ timeout: 5000, label: 'alt-delete-confirm' });

        // Poll until the row actually disappears from the DOM (server callback may lag).
        const prevCount = rowCount;
        for (let w = 0; w < 15; w++) {
          rowCount = await this.page.evaluate(() => {
            const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]');
            return grid ? grid.querySelectorAll('[class*="dxgvDataRow_"]').length : 0;
          });
          if (rowCount < prevCount) break;
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (rowCount > 0) {
        logger.warn('writeAltAddresses: delete step incomplete', { remaining: rowCount });
      }
    }

    // ── 3. Insert each address ─────────────────────────────────────────────────
    // TYPE values for DevExpress SetValue() API.
    // 'Delivery' is omitted: the ERP server-side converts it to 'AlternateDelivery'
    // for alt addresses, so we map all delivery-type names to 'AlternateDelivery' directly.
    const TIPO_DX: Record<string, string> = {
      'consegna':           'AlternateDelivery',
      'indir. cons. alt.':  'AlternateDelivery',
      'delivery':           'AlternateDelivery',
      'alternate delivery': 'AlternateDelivery',
      'business':           'Business',
      'fattura':            'Facture',
      'facture':            'Facture',
    };

    for (const address of addresses) {
      const via   = address.via   ?? null;
      const cap   = address.cap   ?? null;
      const citta = address.citta ?? null;

      if (!via && !cap && !citta) continue;

      // 3a. Add new row via grid API
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.AddNewRow();
      }, altGridName);
      await this.waitForDevExpressIdle({ timeout: 8000, label: 'alt-addnew' });

      // 3b. Compute TYPE value (set after CAP lookup to avoid server-callback reset)
      const tipoRaw  = address.tipo || 'Consegna';
      const tipoDX   = TIPO_DX[tipoRaw.toLowerCase()] ?? 'AlternateDelivery';

      // 3c. NAME — set directly by field ID (no Tab navigation needed)
      if (address.nome) {
        await this.page.evaluate((nome: string) => {
          const input = document.querySelector('[id*="ADDRESSes"][id*="NAME_Edit_I"]') as HTMLInputElement | null;
          if (!input) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, nome); else input.value = nome;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, address.nome);
      }

      // 3d. STREET — set directly by field ID
      if (via) {
        await this.page.evaluate((street: string) => {
          const input = document.querySelector('[id*="ADDRESSes"][id*="STREET_Edit_I"]') as HTMLInputElement | null;
          if (!input) return;
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, street); else input.value = street;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, via);
      }

      // 3e. CAP — lookup with city as disambiguation hint.
      // The lookup auto-populates COUNTY, STATE, COUNTRYREGIONID; CITY must be
      // set explicitly afterward (not auto-populated in the grid editing row).
      if (cap) {
        const findBtnId = await this.page.evaluate(() => {
          const allBtns = Array.from(document.querySelectorAll('td, img, button, a, div')).filter((el) => {
            const h = el as HTMLElement;
            return h.offsetParent !== null && /LOGISTICSADDRESSZIPCODE.*_B0$/.test(el.id);
          });
          return allBtns.length > 0 ? (allBtns[allBtns.length - 1] as HTMLElement).id : null;
        });

        if (findBtnId) {
          await this.selectFromDevExpressLookup(
            new RegExp(findBtnId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            cap,
            citta ?? undefined,
          );
        } else {
          logger.warn('writeAltAddresses: CAP find button not found, typing directly', { cap });
          await this.page.keyboard.type(cap, { delay: 20 });
        }
        await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-cap-done' });
      }

      // 3f. CITY — set directly by field ID after CAP lookup
      if (citta) {
        await this.page.evaluate((city: string) => {
          const input = document.querySelector('[id*="ADDRESSes"][id*="CITY_Edit_I"]') as HTMLInputElement | null;
          if (!input) return;
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, city); else input.value = city;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, citta);
        await this.waitForDevExpressIdle({ timeout: 3000, label: 'alt-city-done' });
        // The CITY change event may open a DevExpress autocomplete popup that captures
        // subsequent keyboard events. Click STREET to dismiss it, then wait for it to close.
        await this.page.evaluate(() => {
          const street = document.querySelector('[id*="ADDRESSes"][id*="STREET_Edit_I"]') as HTMLElement | null;
          if (street) street.focus();
        });
        await new Promise((r) => setTimeout(r, 400));
      }

      // 3g. Set TYPE via DevExpress SetValue() API — must be AFTER CAP/CITY server
      // callbacks because they reset the combobox to index 0 (Business).
      if (tipoDX !== 'Business') {
        const typeSet = await this.page.evaluate((tv: string) => {
          const w = window as any;
          let cb: any = null;
          w.ASPxClientControl?.GetControlCollection?.()?.ForEachControl?.((c: any) => {
            if ((c.name || '').includes('TYPE_Edit') && typeof c.SetValue === 'function') cb = c;
          });
          if (!cb) return false;
          cb.SetValue(tv);
          return true;
        }, tipoDX);
        if (!typeSet) {
          logger.warn('writeAltAddresses: TYPE combobox not found for SetValue', { tipoDX });
        }
      }

      // 3h. Confirm row with UpdateEdit via grid API
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.UpdateEdit();
      }, altGridName);
      await this.waitForDevExpressIdle({ timeout: 8000, label: 'alt-update-edit' });
      logger.debug('writeAltAddresses: row confirmed', { tipo: tipoDX, via, cap, citta });
    }

    logger.info('writeAltAddresses: complete', { addressCount: addresses.length });
  }

  private async fillDeliveryAddress(
    deliveryStreet: string,
    deliveryPostalCode: string,
    deliveryPostalCodeCity?: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Filling delivery address in 'Indirizzo alt.' tab", {
      deliveryStreet,
      deliveryPostalCode,
    });

    await this.openCustomerTab("Indirizzo alt");
    await this.waitForDevExpressIdle({
      timeout: 5000,
      label: "tab-indirizzo-alt",
    });

    const altGridName = await this.page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return "";
      let found = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl((c: any) => {
        if (typeof c?.GetGridView === "function") {
          const gv = c.GetGridView?.();
          const name = gv?.GetName?.() || c.GetName?.() || "";
          if (
            name.includes("LOGISTICS") ||
            name.includes("Address") ||
            name.includes("address")
          ) {
            found = c.GetName?.() || "";
          }
        }
        const cName = c?.name || c?.GetName?.() || "";
        if (
          cName.includes("LOGISTICS") ||
          cName.includes("Address") ||
          cName.includes("address")
        ) {
          if (typeof c?.AddNewRow === "function") {
            found = cName;
          }
        }
      });
      return found;
    });

    logger.debug("Alt address grid discovered", { altGridName });

    if (altGridName) {
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid =
          w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.AddNewRow();
      }, altGridName);
    } else {
      const addNewResult = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[data-args*="AddNew"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return (
            el.offsetParent !== null && el.getBoundingClientRect().width > 0
          );
        }) as HTMLElement[];
        if (candidates.length > 0) {
          candidates[0].click();
          return true;
        }
        return false;
      });
      if (!addNewResult) {
        throw new Error("AddNew button not found in address grid");
      }
    }

    await this.waitForDevExpressIdle({
      timeout: 8000,
      label: "address-addnew",
    });
    logger.debug("New row added to address grid");

    const tipoSet = await this.page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).filter(
        (i) => (i as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement[];

      const tipoInput = inputs.find((i) => {
        const id = i.id.toLowerCase();
        return (
          id.includes("type") ||
          id.includes("tipo") ||
          id.includes("addresstype")
        );
      });

      if (tipoInput) {
        tipoInput.focus();
        tipoInput.click();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(tipoInput, "Consegna");
        else tipoInput.value = "Consegna";
        tipoInput.dispatchEvent(new Event("input", { bubbles: true }));
        tipoInput.dispatchEvent(new Event("change", { bubbles: true }));
        return { found: true, id: tipoInput.id };
      }

      for (const inp of inputs) {
        const row = inp.closest("tr");
        if (row && row.classList.toString().includes("dxgvEditingRow")) {
          inp.focus();
          inp.click();
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          if (setter) setter.call(inp, "Consegna");
          else inp.value = "Consegna";
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          return { found: true, id: inp.id };
        }
      }

      return { found: false, id: "" };
    });

    if (!tipoSet.found) {
      logger.warn("TIPO input not found, trying Tab to first cell");
      await this.page.keyboard.type("Consegna", { delay: 30 });
    }

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({ timeout: 3000, label: "tipo-set" });
    logger.debug("TIPO set to 'Consegna'");

    // Grid columns: TIPO → NOME → VIA → INDIRIZZO LOGISTICO CODICE POSTALE
    // After Tab from TIPO, cursor is on NOME — skip it with another Tab
    logger.debug("Skipping NOME column (Tab)");
    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({ timeout: 3000, label: "nome-skip" });

    // Now cursor should be on VIA — type the delivery street
    logger.debug("Setting VIA column");
    const editingRowInputs = await this.page.evaluate((street: string) => {
      const editingRow = document.querySelector('tr[class*="dxgvEditingRow"]');
      if (!editingRow) return { inputs: [] as string[], streetSet: false };

      const inputs = Array.from(
        editingRow.querySelectorAll('input[type="text"]'),
      ).filter(
        (i) => (i as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement[];

      const inputIds = inputs.map((i) => i.id.substring(i.id.length - 40));

      // The focused/active input should be VIA after the two Tabs
      const activeEl = document.activeElement as HTMLInputElement;
      if (
        activeEl &&
        activeEl.tagName === "INPUT" &&
        editingRow.contains(activeEl)
      ) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(activeEl, street);
        else activeEl.value = street;
        activeEl.dispatchEvent(new Event("input", { bubbles: true }));
        activeEl.dispatchEvent(new Event("change", { bubbles: true }));
        return { inputs: inputIds, streetSet: true, activeId: activeEl.id };
      }

      return { inputs: inputIds, streetSet: false };
    }, deliveryStreet);

    logger.debug("Editing row state after VIA", editingRowInputs);

    if (!editingRowInputs.streetSet) {
      logger.warn("Active element not in editing row, typing VIA directly");
      await this.page.keyboard.type(deliveryStreet, { delay: 30 });
    }

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({ timeout: 3000, label: "street-set" });
    logger.debug(
      "Delivery street set, cursor should be on INDIRIZZO LOGISTICO CODICE POSTALE",
    );

    // CAP column is a lookup field — find the B0 (find) button in the editing row and use it
    logger.debug("Setting INDIRIZZO LOGISTICO CODICE POSTALE via lookup");

    const findBtnId = await this.page.evaluate(() => {
      const editingRow = document.querySelector('tr[class*="dxgvEditingRow"]');
      if (editingRow) {
        const btns = Array.from(
          editingRow.querySelectorAll("td, img, button, a, div"),
        ).filter((el) =>
          /LOGISTICSADDRESSZIPCODE.*_B0$|_find_Edit_B0$/.test(el.id),
        );
        if (btns.length > 0) return btns[0].id;
      }
      // Fallback: search all visible B0 buttons near LOGISTICSADDRESSZIPCODE
      const allBtns = Array.from(
        document.querySelectorAll("td, img, button, a, div"),
      ).filter((el) => {
        const h = el as HTMLElement;
        return (
          h.offsetParent !== null && /LOGISTICSADDRESSZIPCODE.*_B0$/.test(el.id)
        );
      });
      return allBtns.length > 0 ? allBtns[allBtns.length - 1].id : null;
    });

    if (findBtnId) {
      logger.debug("CAP find button found in grid", { findBtnId });
      await this.selectFromDevExpressLookup(
        new RegExp(findBtnId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        deliveryPostalCode,
        deliveryPostalCodeCity,
      );
    } else {
      // Fallback: try direct input if find button not found
      logger.warn(
        "CAP find button not found in editing row, trying direct input",
      );
      const activeEl = document.activeElement as HTMLInputElement | null;
      await this.page.keyboard.type(deliveryPostalCode, { delay: 20 });
      await this.page.keyboard.press("Tab");
      await this.waitForDevExpressIdle({
        timeout: 3000,
        label: "cap-set-direct",
      });
    }

    logger.debug("Delivery postal code set, confirming row with UpdateEdit");

    if (altGridName) {
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid =
          w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.UpdateEdit();
      }, altGridName);
    } else {
      const updateResult = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[data-args*="UpdateEdit"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return (
            el.offsetParent !== null && el.getBoundingClientRect().width > 0
          );
        }) as HTMLElement[];
        if (candidates.length > 0) {
          candidates[0].click();
          return true;
        }
        return false;
      });
      if (!updateResult) {
        logger.warn("UpdateEdit button not found, trying keyboard");
        await this.page.keyboard.press("Enter");
      }
    }

    await this.waitForDevExpressIdle({
      timeout: 8000,
      label: "address-update-edit",
    });
    logger.info("Delivery address row confirmed");
  }

  // ─── Customer CRUD Operations ───────────────────────────────────────

  async createCustomer(
    customerData: import("../types").CustomerFormData,
  ): Promise<string> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Creating new customer", { name: customerData.name });

    await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await this.waitForDevExpressReady({ timeout: 10000 });

    let nuovoClicked = await this.clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    if (!nuovoClicked) {
      nuovoClicked = await this.clickElementByText("New", {
        selectors: ["a", "span", "button"],
      });
    }
    if (!nuovoClicked) throw new Error("'Nuovo'/'New' button not found");

    await this.emitProgress("customer.navigation");

    await this.page.waitForFunction(
      (baseUrl: string) => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
      config.archibald.url,
    );
    await this.waitForDevExpressReady({ timeout: 10000 });

    await this.emitProgress("customer.edit_loaded");

    logger.info("Customer form loaded, filling fields");

    // Step 1: "Prezzi e sconti" tab — set SCONTO LINEA first (before filling Principale)
    await this.openCustomerTab("Prezzi e sconti");
    await this.dismissDevExpressPopups();

    try {
      await this.page.waitForFunction(
        () => {
          const input = document.querySelector(
            'input[id*="LINEDISC"][id$="_I"]',
          ) as HTMLInputElement | null;
          return input && input.offsetParent !== null;
        },
        { timeout: 10000, polling: 200 },
      );
    } catch {
      logger.warn("LINEDISC not found after tab switch, retrying...");
      await this.openCustomerTab("Prezzi e sconti");
      await this.dismissDevExpressPopups();
      await this.wait(1000);
    }

    await this.setDevExpressComboBox(
      /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      customerData.lineDiscount || "N/A",
    );

    // Step 2: Back to "Principale" tab — fill ALL fields last so they persist at save time
    // Order: lookups first (they trigger callbacks), then combo boxes, then text fields
    await this.openCustomerTab("Principale");
    await this.dismissDevExpressPopups();
    await this.waitForDevExpressIdle({
      timeout: 5000,
      label: "tab-principale",
    });

    // Phase A: Lookups (trigger server callbacks that may reset other fields)
    if (customerData.paymentTerms) {
      await this.selectFromDevExpressLookup(
        /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
        customerData.paymentTerms,
      );
    }

    if (customerData.postalCode) {
      try {
        await this.selectFromDevExpressLookup(
          /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
          customerData.postalCode,
          customerData.postalCodeCity,
        );
      } catch (capErr) {
        logger.warn("CAP lookup failed, dismissing any lingering dialog", {
          error: String(capErr),
        });
        await this.page.keyboard.press("Escape");
        await this.wait(500);
        await this.page.keyboard.press("Escape");
        await this.wait(300);
      }
    }

    // Phase B: vatNumber (triggers async VAT validation — must complete before other fields)
    if (customerData.vatNumber) {
      await this.typeDevExpressField(
        /xaf_dviVATNUM_Edit_I$/,
        customerData.vatNumber,
      );
      // Wait for the async VAT validation callback to fully complete
      await this.wait(5000);
      await this.waitForDevExpressIdle({
        timeout: 10000,
        label: "vat-validation",
      });
    }

    // Phase C: Combo boxes (after VAT callback so they don't get cleared)
    if (customerData.deliveryMode) {
      await this.setDevExpressComboBox(
        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
        customerData.deliveryMode,
      );
    }

    // Phase D: All other text fields (after VAT callback completed)
    await this.typeDevExpressField(/xaf_dviNAME_Edit_I$/, customerData.name);

    if (customerData.pec) {
      await this.typeDevExpressField(
        /xaf_dviLEGALEMAIL_Edit_I$/,
        customerData.pec,
      );
    }

    if (customerData.sdi) {
      await this.typeDevExpressField(
        /xaf_dviLEGALAUTHORITY_Edit_I$/,
        customerData.sdi,
      );
    }

    if (customerData.street) {
      await this.typeDevExpressField(
        /xaf_dviSTREET_Edit_I$/,
        customerData.street,
      );
    }

    await this.emitProgress("customer.field");

    if (customerData.phone) {
      await this.typeDevExpressField(/xaf_dviPHONE_Edit_I$/, customerData.phone);
    }

    if (customerData.mobile) {
      await this.typeDevExpressField(
        /xaf_dviCELLULARPHONE_Edit_I$/,
        customerData.mobile,
      );
    }

    if (customerData.email) {
      await this.typeDevExpressField(/xaf_dviEMAIL_Edit_I$/, customerData.email);
    }

    if (customerData.url) {
      await this.typeDevExpressField(/xaf_dviURL_Edit_I$/, customerData.url);
    }

    await this.ensureNameFieldBeforeSave(customerData.name);

    // Step 3: "Indirizzo alt." tab — write all alt addresses (full replace)
    await this.writeAltAddresses(customerData.addresses ?? []);

    await this.emitProgress("customer.save");
    await this.saveAndCloseCustomer();

    const customerProfileId = await this.getCustomerProfileId();
    logger.info("Customer created successfully", {
      customerProfileId,
      name: customerData.name,
    });

    await this.emitProgress("customer.complete");

    return customerProfileId;
  }

  private async getCustomerProfileId(): Promise<string> {
    if (!this.page) throw new Error("Browser page is null");

    await this.waitForDevExpressIdle({
      timeout: 5000,
      label: "get-profile-id",
    });

    const profileId = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const profileInput = inputs.find((input) =>
        /xaf_dviACCOUNTNUM_Edit_I$/.test(input.id),
      );
      if (profileInput) {
        return (profileInput as HTMLInputElement).value;
      }
      return "";
    });

    if (!profileId || profileId.trim() === "") {
      logger.warn("Could not extract customer profile ID");
      return "UNKNOWN";
    }

    return profileId;
  }

  private async updateCustomerName(newName: string): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("updateCustomerName", { newName });

    // Set NAME field.
    await this.typeDevExpressField(/xaf_dviNAME_Edit_I$/, newName);

    // DevExpress does not autofill NOME DI RICERCA (SEARCHNAME) on edit forms —
    // only on record creation. Set it explicitly to the same value as NAME.
    await this.typeDevExpressField(/SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/, newName);

    logger.info("updateCustomerName completed", { newName });
  }

  async updateCustomer(
    customerProfile: string,
    customerData: import("../types").CustomerFormData,
    originalName?: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    const sanitize = (s: string) =>
      s.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const searchName = sanitize(originalName || customerData.name);
    const fallbackName =
      searchName !== sanitize(customerData.name)
        ? sanitize(customerData.name)
        : null;
    logger.info("Updating customer", {
      customerProfile,
      searchName,
      fallbackName,
      newName: customerData.name,
    });

    await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    if (this.page.url().includes("Login.aspx")) {
      throw new Error("Sessione scaduta: reindirizzato al login");
    }

    await this.waitForDevExpressReady({ timeout: 10000 });

    await this.emitProgress("customer.navigation");

    // Try searching with the original name first
    let searchError: Error | null = null;
    try {
      await this.searchAndOpenCustomer(searchName);
      logger.info("Customer edit selection (primary)", { searchName });
    } catch (err) {
      searchError = err as Error;
      logger.info("Primary search failed, retrying with new name", {
        searchName,
        error: String(err),
      });
    }

    // Fallback 1: if not found and we have an alternative name, retry with new name
    if (searchError && fallbackName) {
      await this.page.goto(
        `${config.archibald.url}/CUSTTABLE_ListView_Agent/`,
        {
          waitUntil: "networkidle2",
          timeout: 60000,
        },
      );
      await this.waitForDevExpressReady({ timeout: 10000 });
      try {
        await this.searchAndOpenCustomer(fallbackName);
        logger.info("Customer edit selection (fallback name)", { fallbackName });
        searchError = null;
      } catch (err) {
        searchError = err as Error;
        logger.info("Fallback name search failed, retrying with customerProfile", {
          fallbackName,
          error: String(err),
        });
      }
    }

    // Fallback 2: search by customerProfile code
    if (searchError) {
      logger.info("Name searches failed, retrying with customerProfile", {
        customerProfile,
      });
      await this.page.goto(
        `${config.archibald.url}/CUSTTABLE_ListView_Agent/`,
        {
          waitUntil: "networkidle2",
          timeout: 60000,
        },
      );
      await this.waitForDevExpressReady({ timeout: 10000 });
      try {
        await this.searchAndOpenCustomer(customerProfile);
        logger.info("Customer edit selection (fallback profile)", { customerProfile });
        searchError = null;
      } catch (err) {
        searchError = err as Error;
      }
    }

    await this.emitProgress("customer.search");

    if (searchError) {
      throw new Error(
        `Cliente "${searchName}"${fallbackName ? `, "${fallbackName}"` : ""} e profilo "${customerProfile}" non trovato nei risultati`,
      );
    }

    await this.emitProgress("customer.edit_loaded");

    logger.info("Edit form loaded, updating fields");

    if (customerData.name) {
      await this.updateCustomerName(customerData.name);
    }

    if (customerData.deliveryMode) {
      await this.setDevExpressComboBox(
        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
        customerData.deliveryMode,
      );
    }

    if (customerData.vatNumber) {
      await this.typeDevExpressField(
        /xaf_dviVATNUM_Edit_I$/,
        customerData.vatNumber,
      );
    }

    if (customerData.paymentTerms) {
      await this.selectFromDevExpressLookup(
        /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
        customerData.paymentTerms,
      );
    }

    if (customerData.pec) {
      await this.typeDevExpressField(
        /xaf_dviLEGALEMAIL_Edit_I$/,
        customerData.pec,
      );
    }

    if (customerData.sdi) {
      await this.typeDevExpressField(
        /xaf_dviLEGALAUTHORITY_Edit_I$/,
        customerData.sdi,
      );
    }

    if (customerData.street) {
      await this.typeDevExpressField(
        /xaf_dviSTREET_Edit_I$/,
        customerData.street,
      );
    }

    await this.emitProgress("customer.field");

    if (customerData.postalCode) {
      try {
        await this.selectFromDevExpressLookup(
          /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
          customerData.postalCode,
          customerData.postalCodeCity,
        );
      } catch (capErr) {
        logger.warn("CAP lookup failed, dismissing any lingering dialog", {
          error: String(capErr),
        });
        await this.page.keyboard.press("Escape");
        await this.wait(500);
        await this.page.keyboard.press("Escape");
        await this.wait(300);
      }
    }

    if (customerData.phone) {
      await this.typeDevExpressField(/xaf_dviPHONE_Edit_I$/, customerData.phone);
    }

    if (customerData.mobile) {
      await this.typeDevExpressField(
        /xaf_dviCELLULARPHONE_Edit_I$/,
        customerData.mobile,
      );
    }

    if (customerData.email) {
      await this.typeDevExpressField(/xaf_dviEMAIL_Edit_I$/, customerData.email);
    }

    if (customerData.url) {
      await this.typeDevExpressField(/xaf_dviURL_Edit_I$/, customerData.url);
    }

    // Always reset LINEDISC to N/A (or the requested value) to prevent
    // "Discount to get street price" from remaining and causing issues with orders.
    {
      const targetLineDisc = customerData.lineDiscount || "N/A";
      await this.openCustomerTab("Prezzi e sconti");

      try {
        await this.page.waitForFunction(
          () => {
            const input = document.querySelector(
              'input[id*="LINEDISC"][id$="_I"]',
            ) as HTMLInputElement | null;
            return input && input.offsetParent !== null;
          },
          { timeout: 10000, polling: 200 },
        );
      } catch {
        await this.openCustomerTab("Prezzi e sconti");
        await this.wait(1000);
      }

      await this.setDevExpressComboBox(
        /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
        targetLineDisc,
      );
    }

    // Step 3: "Indirizzo alt." tab — write all alt addresses (full replace)
    await this.writeAltAddresses(customerData.addresses ?? []);

    await this.emitProgress("customer.save");
    await this.saveAndCloseCustomer();

    logger.info("Customer updated successfully", {
      customerProfile,
      name: customerData.name,
    });

    await this.emitProgress("customer.complete");
  }

  private async searchAndOpenCustomer(nameToSearch: string): Promise<void> {
    // Fill search field
    const fieldId = await this.page!.evaluate((name: string) => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const searchInput = inputs.find((i) =>
        /SearchAC.*Ed_I$/.test(i.id),
      ) as HTMLInputElement | null;
      if (!searchInput) return null;

      searchInput.scrollIntoView({ block: "center" });
      searchInput.focus();
      searchInput.click();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(searchInput, name);
      else searchInput.value = name;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      return searchInput.id;
    }, nameToSearch);

    if (!fieldId) throw new Error("Search input not found");

    // Try clicking the search/find button if present, otherwise press Enter
    const searchBtnClicked = await this.page!.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll(
          'img[id*="Search"], td[id*="Search"][id*="_B0"], div[id*="Search"][id*="_B"]',
        ),
      );
      for (const btn of btns) {
        if ((btn as HTMLElement).offsetParent !== null) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!searchBtnClicked) {
      await this.page!.keyboard.press("Enter");
    }

    await this.wait(1000);
    await this.waitForDevExpressIdle({
      timeout: 15000,
      label: "customer-search",
    });
    await this.wait(500);

    logger.info("Customer search completed", {
      nameToSearch,
      searchBtnClicked,
    });

    // Find exact match in filtered results and click Edit
    const result = await this.page!.evaluate((targetName: string) => {
      const nameLower = targetName.trim().toLowerCase();
      const rows = Array.from(
        document.querySelectorAll('tr[class*="dxgvDataRow"]'),
      ).filter((r) => (r as HTMLElement).offsetParent !== null);

      if (rows.length === 0)
        return { found: false, reason: "no-rows", rowCount: 0 };

      const getCellTexts = (row: Element): string[] => {
        return Array.from(row.querySelectorAll("td"))
          .map((c) => {
            const clone = c.cloneNode(true) as HTMLElement;
            clone
              .querySelectorAll("script, style")
              .forEach((s) => s.remove());
            return (clone.innerText || clone.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase();
          })
          .filter(Boolean);
      };

      for (const row of rows) {
        const cellTexts = getCellTexts(row);
        if (cellTexts.some((t) => t === nameLower)) {
          const editBtn = row.querySelector(
            'img[title="Modifica"], a[data-args*="Edit"]',
          );
          if (editBtn) {
            const target =
              editBtn.tagName === "IMG"
                ? editBtn.closest("a") || editBtn
                : editBtn;
            (target as HTMLElement).click();
            return {
              found: true,
              reason: "exact-match",
              rowCount: rows.length,
            };
          }
        }
      }

      for (const row of rows) {
        const cellTexts = getCellTexts(row);
        if (cellTexts.some((t) => t.includes(nameLower))) {
          const editBtn = row.querySelector(
            'img[title="Modifica"], a[data-args*="Edit"]',
          );
          if (editBtn) {
            const target =
              editBtn.tagName === "IMG"
                ? editBtn.closest("a") || editBtn
                : editBtn;
            (target as HTMLElement).click();
            return {
              found: true,
              reason: "contains-match",
              rowCount: rows.length,
            };
          }
        }
      }

      const sampleTexts = rows.slice(0, 5).map((r) =>
        getCellTexts(r)
          .filter((t) => t.length > 0 && t.length < 100)
          .join(" | "),
      );

      return {
        found: false,
        reason: "no-match",
        rowCount: rows.length,
        rowNames: sampleTexts,
      };
    }, nameToSearch);

    if (!result.found) {
      throw new Error(`Cliente non trovato: ${nameToSearch}`);
    }

    await this.page!.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await this.waitForDevExpressReady({ timeout: 10000 });
  }

  async navigateToEditCustomerForm(name: string): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("navigateToEditCustomerForm: navigating via list", { name });

    await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    if (this.page.url().includes("Login.aspx")) {
      throw new Error("Sessione scaduta: reindirizzato al login");
    }

    await this.waitForDevExpressReady({ timeout: 10000 });
    await this.searchAndOpenCustomer(name);

    // Clicca il pulsante Edit / Modifica se non già in edit mode
    const isEditMode = this.page.url().includes("mode=Edit");
    if (!isEditMode) {
      await this.page.evaluate(() => {
        const editBtn = Array.from(document.querySelectorAll("a, button")).find(
          (el) => /modifica|edit/i.test(el.textContent || ""),
        );
        (editBtn as HTMLElement)?.click();
      });
      await this.page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    }

    await this.waitForDevExpressReady({ timeout: 10000 });
    logger.info("navigateToEditCustomerForm: edit form loaded", { name });
  }

  async readEditFormFieldValues(): Promise<Record<string, string>> {
    if (!this.page) throw new Error("Browser page is null");

    const values = await this.page.evaluate(() => {
      const getVal = (regex: RegExp): string => {
        const input = Array.from(document.querySelectorAll("input")).find((i) =>
          regex.test(i.id),
        ) as HTMLInputElement | null;
        return input?.value?.trim() ?? "";
      };
      return {
        email:    getVal(/xaf_dviEMAIL_Edit_I$/),
        pec:      getVal(/xaf_dviLEGALEMAIL_Edit_I$/),
        sdi:      getVal(/xaf_dviLEGALAUTHORITY_Edit_I$/),
        phone:    getVal(/xaf_dviPHONE_Edit_I$/),
        street:   getVal(/xaf_dviSTREET_Edit_I$/),
        vatNumber:getVal(/xaf_dviVATNUM_Edit_I$/),
      };
    });

    logger.info("readEditFormFieldValues", values);
    return values;
  }

  async readAltAddresses(): Promise<AltAddress[]> {
    if (!this.page) throw new Error('Browser page is null');

    await this.openCustomerTab('Indirizzo alt');
    await this.waitForDevExpressIdle({ timeout: 5000, label: 'tab-indirizzo-alt-read' });

    // The alt-addresses grid is loaded asynchronously after the tab click.
    // Its DOM element has an ID containing "ADDRESSes" (XAF property name).
    // Wait until that grid element appears in the DOM.
    await this.page.waitForFunction(
      () => document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]') !== null,
      { timeout: 12000, polling: 300 },
    ).catch(() => {
      logger.warn('readAltAddresses: ADDRESSes grid not found after 12s — proceeding with DOM snapshot');
    });

    const addresses = await this.page.evaluate(() => {
      // Target the alt-addresses list-editor grid by its XAF property-name fragment.
      // Using [id*="ADDRESSes"] avoids theme-suffix coupling (_Aqua vs _XafTheme) and
      // skips other grids on the page (e.g. SALESTABLES) whose IDs never contain "ADDRESSes".
      const grid = document.querySelector('[id*="ADDRESSes"][class*="dxgvControl"]') as HTMLElement | null;
      if (!grid) return [];

      const rows = Array.from(grid.querySelectorAll('[class*="dxgvDataRow_"]'));
      return rows.map((row) => {
        // Command column cells carry class "dxgvCommandColumn_XafTheme dxgv dx-ac".
        // Data cells carry only "dxgv dx-al". The :not() filter skips the 2 leading
        // command/button cells so indices map directly to data columns.
        const cells = Array.from(row.querySelectorAll('td.dxgv:not([class*="dxgvCommandColumn"])'));
        const cellText = (i: number) => cells[i]?.textContent?.trim() || null;
        return {
          tipo: cellText(0) ?? '',
          nome: cellText(1),
          via: cellText(2),
          cap: cellText(3),
          citta: cellText(4),
          contea: cellText(5),
          idRegione: cellText(6),
          stato: cellText(7),
          contra: cellText(8),
        };
      });
    }) as AltAddress[];

    return addresses;
  }

  // ─── Interactive Customer Creation (VAT auto-fill flow) ───────────

  async navigateToNewCustomerForm(): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Interactive: navigating to new customer form");

    await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await this.waitForDevExpressReady({ timeout: 10000 });

    let nuovoClicked = await this.clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    if (!nuovoClicked) {
      nuovoClicked = await this.clickElementByText("New", {
        selectors: ["a", "span", "button"],
      });
    }
    if (!nuovoClicked) throw new Error("'Nuovo'/'New' button not found");

    await this.page.waitForFunction(
      (baseUrl: string) => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
      config.archibald.url,
    );
    await this.waitForDevExpressReady({ timeout: 10000 });

    logger.info("Interactive: new customer form ready");
  }

  async submitVatAndReadAutofill(
    vatNumber: string,
  ): Promise<import("../types").VatLookupResult> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Interactive: submitting VAT number", { vatNumber });

    // Focus the VAT input field and type character by character
    // DevExpress only triggers server-side callbacks on Tab/blur when it
    // tracks the keystrokes internally, so programmatic SetValue() won't work.
    const vatInputId = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const input = inputs.find((i) =>
        /xaf_dviVATNUM_Edit_I$/.test(i.id),
      ) as HTMLInputElement | null;
      if (!input) return null;
      input.scrollIntoView({ block: "center" });
      input.focus();
      input.click();
      // Clear any existing value
      input.value = "";
      return input.id;
    });

    if (!vatInputId) {
      throw new Error("VAT input field not found");
    }

    // Type the VAT number character by character so DevExpress tracks it
    await this.page.type(`[id="${vatInputId}"]`, vatNumber, { delay: 30 });

    logger.info("Interactive: VAT field typed", { vatNumber, vatInputId });

    // Tab to leave the field and trigger the DevExpress server-side callback
    await this.page.keyboard.press("Tab");

    // Brief delay to let the callback start
    await this.wait(500);

    // Wait for DevExpress callbacks to complete
    await this.waitForDevExpressIdle({
      timeout: 20000,
      label: "vat-autofill",
    });

    // Poll until VAT fields are populated (server can take seconds to respond)
    const maxPollAttempts = 10;
    const pollIntervalMs = 2000;

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const hasData = await this.page.evaluate(() => {
        const w = window as any;
        const collection = w.ASPxClientControl?.GetControlCollection?.();
        if (!collection) return false;

        let foundValue = false;
        collection.ForEachControl((c: any) => {
          if (foundValue) return;
          const name = (c.name || "").toLowerCase();
          if (
            name.includes("vatlastcheck") ||
            name.includes("vataddress") ||
            name.includes("legalemail")
          ) {
            try {
              const val = c.GetValue?.() || c.GetText?.() || "";
              if (val) foundValue = true;
            } catch {
              /* ignore */
            }
          }
        });
        if (foundValue) return true;

        // Also check DOM for captions with populated values
        const captionCells = Array.from(
          document.querySelectorAll(
            "td.dxflCaption_DevEx, td.dxflCaptionCell_DevEx, .dxflCaption_DevEx",
          ),
        );
        for (const cell of captionCells) {
          const label = (cell.textContent?.trim() || "").toLowerCase();
          if (
            label.includes("ultimo controllo") ||
            label.includes("indirizzo iva")
          ) {
            const row = cell.closest("tr");
            if (!row) continue;
            const inputs = Array.from(
              row.querySelectorAll("input, textarea"),
            ) as HTMLInputElement[];
            if (inputs.some((i) => i.value.trim().length > 0)) return true;
          }
        }
        return false;
      });

      if (hasData) {
        logger.info("Interactive: VAT data populated", {
          attempt: attempt + 1,
        });
        break;
      }

      if (attempt < maxPollAttempts - 1) {
        logger.info("Interactive: VAT data not yet populated, waiting...", {
          attempt: attempt + 1,
        });
        await this.wait(pollIntervalMs);
        // Re-check DevExpress idle in case a new callback fired
        await this.waitForDevExpressIdle({
          timeout: 5000,
          label: "vat-autofill-poll",
        });
      }
    }

    // Read fields using both DevExpress API and DOM
    const rawFields = await this.page.evaluate(() => {
      const w = window as any;

      // Read values via DevExpress control API
      const dxValues: Record<string, string> = {};
      const collection = w.ASPxClientControl?.GetControlCollection?.();
      if (collection) {
        collection.ForEachControl((c: any) => {
          const name = c.name || "";
          try {
            const val =
              typeof c.GetValue === "function"
                ? String(c.GetValue() ?? "")
                : "";
            const text =
              typeof c.GetText === "function" ? String(c.GetText() ?? "") : "";
            if (val || text) {
              dxValues[name] = val || text;
            }
          } catch {
            /* ignore */
          }
        });
      }

      // Read values via DOM caption matching
      const captionCells = Array.from(
        document.querySelectorAll(
          "td.dxflCaption_DevEx, td.dxflCaptionCell_DevEx, .dxflCaption_DevEx",
        ),
      );

      const fieldsByLabel: Record<string, string> = {};
      for (const cell of captionCells) {
        const labelText = (cell.textContent?.trim() || "").toLowerCase();
        if (
          labelText.includes("ultimo controllo") ||
          labelText.includes("last vat") ||
          labelText.includes("iva validata") ||
          labelText.includes("vat valid") ||
          labelText.includes("indirizzo iva") ||
          labelText.includes("vat address") ||
          labelText.includes("controllo iva")
        ) {
          const row = cell.closest("tr");
          if (!row) continue;
          const inputsInRow = Array.from(
            row.querySelectorAll("input, textarea"),
          ) as HTMLInputElement[];
          const val = inputsInRow
            .map((i) => i.value)
            .filter((v) => v)
            .join(" | ");
          if (val) {
            fieldsByLabel[cell.textContent?.trim() || ""] = val;
          }
        }
      }

      return { fieldsByLabel, dxValues };
    });

    logger.info("Interactive: raw VAT autofill fields", rawFields);

    const { parseIndirizzoIva } = await import("../parse-indirizzo-iva");

    // Extract values: prefer DOM fieldsByLabel, fallback to DevExpress API values
    const findByLabel = (
      labels: Record<string, string>,
      ...keywords: string[]
    ): string => {
      const key = Object.keys(labels).find((k) =>
        keywords.some((kw) => k.toLowerCase().includes(kw)),
      );
      return key ? labels[key] : "";
    };

    const findByDxControl = (
      dxVals: Record<string, string>,
      ...keywords: string[]
    ): string => {
      const key = Object.keys(dxVals).find((name) =>
        keywords.some((kw) => name.toLowerCase().includes(kw)),
      );
      return key ? dxVals[key] : "";
    };

    const lastVatCheckRaw =
      findByLabel(rawFields.fieldsByLabel, "ultimo controllo") ||
      findByDxControl(rawFields.dxValues, "vatlastcheck");

    // Format the date if it's a JS Date string (e.g. "Mon Feb 16 2026 11:39:34 GMT+0000")
    let lastVatCheck = lastVatCheckRaw;
    if (lastVatCheckRaw && lastVatCheckRaw.includes("GMT")) {
      try {
        const d = new Date(lastVatCheckRaw);
        lastVatCheck = d.toLocaleString("it-IT", { timeZone: "Europe/Rome" });
      } catch {
        /* keep raw */
      }
    }

    // DevExpress field has a typo: VATVALIED instead of VATVALID
    const vatValidated =
      findByLabel(rawFields.fieldsByLabel, "iva validata", "vat valid") ||
      findByDxControl(rawFields.dxValues, "vatvalied");

    const vatAddress =
      findByLabel(rawFields.fieldsByLabel, "indirizzo iva", "vat address") ||
      findByDxControl(rawFields.dxValues, "vataddress");

    const pec = findByDxControl(rawFields.dxValues, "legalemail");
    const sdi = findByDxControl(rawFields.dxValues, "legalauthority");

    const parsed = parseIndirizzoIva(vatAddress);

    const result: import("../types").VatLookupResult = {
      lastVatCheck,
      vatValidated,
      vatAddress,
      parsed,
      pec,
      sdi,
    };

    logger.info("Interactive: VAT lookup result", result);
    return result;
  }

  async completeCustomerCreation(
    customerData: import("../types").CustomerFormData,
  ): Promise<string> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Interactive: completing customer creation", {
      name: customerData.name,
    });

    // Step 1: "Prezzi e sconti" tab — set SCONTO LINEA first (before filling Principale)
    await this.emitProgress("customer.tab.prezzi");
    await this.openCustomerTab("Prezzi e sconti");
    await this.dismissDevExpressPopups();

    try {
      await this.page.waitForFunction(
        () => {
          const input = document.querySelector(
            'input[id*="LINEDISC"][id$="_I"]',
          ) as HTMLInputElement | null;
          return input && input.offsetParent !== null;
        },
        { timeout: 10000, polling: 200 },
      );
    } catch {
      logger.warn("LINEDISC not found after tab switch, retrying...");
      await this.openCustomerTab("Prezzi e sconti");
      await this.dismissDevExpressPopups();
      await this.wait(1000);
    }

    await this.setDevExpressComboBox(
      /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      customerData.lineDiscount || "N/A",
    );

    // Step 2: Back to "Principale" tab — fill ALL fields last so they persist at save time
    await this.emitProgress("customer.tab.principale");
    await this.openCustomerTab("Principale");
    await this.dismissDevExpressPopups();
    await this.waitForDevExpressIdle({
      timeout: 5000,
      label: "tab-principale-interactive",
    });

    // Phase A: Lookups (trigger server callbacks that may reset other fields)
    await this.emitProgress("customer.lookup");
    if (customerData.paymentTerms) {
      await this.selectFromDevExpressLookup(
        /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
        customerData.paymentTerms,
      );
    }

    if (customerData.postalCode) {
      try {
        await this.selectFromDevExpressLookup(
          /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
          customerData.postalCode,
          customerData.postalCodeCity,
        );
      } catch (capErr) {
        logger.warn("CAP lookup failed, dismissing any lingering dialog", {
          error: String(capErr),
        });
        await this.page.keyboard.press("Escape");
        await this.wait(500);
        await this.page.keyboard.press("Escape");
        await this.wait(300);
      }
    }

    // Phase B: Combo boxes
    if (customerData.deliveryMode) {
      await this.setDevExpressComboBox(
        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
        customerData.deliveryMode,
      );
    }

    // Phase C: Text fields (set after lookups so they don't get cleared)
    await this.typeDevExpressField(/xaf_dviNAME_Edit_I$/, customerData.name);

    if (customerData.pec) {
      await this.typeDevExpressField(
        /xaf_dviLEGALEMAIL_Edit_I$/,
        customerData.pec,
      );
    }

    if (customerData.sdi) {
      await this.typeDevExpressField(
        /xaf_dviLEGALAUTHORITY_Edit_I$/,
        customerData.sdi,
      );
    }

    if (customerData.street) {
      await this.typeDevExpressField(
        /xaf_dviSTREET_Edit_I$/,
        customerData.street,
      );
    }

    await this.emitProgress("customer.field");

    if (customerData.phone) {
      await this.typeDevExpressField(/xaf_dviPHONE_Edit_I$/, customerData.phone);
    }

    if (customerData.mobile) {
      await this.typeDevExpressField(
        /xaf_dviCELLULARPHONE_Edit_I$/,
        customerData.mobile,
      );
    }

    if (customerData.email) {
      await this.typeDevExpressField(/xaf_dviEMAIL_Edit_I$/, customerData.email);
    }

    if (customerData.url) {
      await this.typeDevExpressField(/xaf_dviURL_Edit_I$/, customerData.url);
    }

    await this.ensureNameFieldBeforeSave(customerData.name);

    // Step 3: "Indirizzo alt." tab — write all alt addresses (full replace)
    await this.emitProgress("customer.tab.indirizzo");
    await this.writeAltAddresses(customerData.addresses ?? []);

    await this.emitProgress("customer.save");
    await this.saveAndCloseCustomer();

    const customerProfileId = await this.getCustomerProfileId();
    logger.info("Interactive: customer created successfully", {
      customerProfileId,
      name: customerData.name,
    });

    await this.emitProgress("customer.complete");

    return customerProfileId;
  }

  private async downloadSingleDocumentPDF(
    context: BrowserContext,
    pageUrl: string,
    searchTerm: string,
    tmpDir: string,
    timeout: number,
  ): Promise<Buffer> {
    const page = await context.newPage();

    try {
      logger.info("[ArchibaldBot] downloadSingleDocumentPDF: navigating", { pageUrl, searchTerm });

      if (!searchTerm) {
        throw new Error("Search term is required for PDF download");
      }

      await page.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      });

      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await this.waitForDevExpressReadyOnPage(page);

      // Step 1: Find and fill search bar with paste (DevExpress-compatible)
      const searchInputSelector = 'input[id*="SearchAC"][id*="Ed_I"]';
      const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 15000 });
      if (!searchInput) throw new Error("Search input not found");

      await page.click(searchInputSelector);
      await new Promise((resolve) => setTimeout(resolve, 300));

      await page.evaluate((sel: string, term: string) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (!input) return;
        input.value = "";
        input.focus();
        input.value = term;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
        if (typeof (window as any).ASPx !== "undefined") {
          const aspx = (window as any).ASPx;
          if (aspx.EValueChanged) {
            aspx.EValueChanged(input.id);
          }
        }
      }, searchInputSelector, searchTerm);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 2: Press Enter to trigger search
      await page.keyboard.press("Enter");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 3: Verify results
      const rowCount = await page.evaluate(() =>
        document.querySelectorAll("tr.dxgvDataRow_XafTheme").length,
      );
      logger.info("[ArchibaldBot] downloadSingleDocumentPDF: search results", { searchTerm, rowCount });

      if (rowCount === 0) {
        throw new Error(`No results found for search term: ${searchTerm}`);
      }

      // Step 4: Select the first row via DevExpress checkbox
      const checkboxCell = await page.waitForSelector(
        'td.dxgvCommandColumn_XafTheme[onclick*="Select"]',
        { timeout: 10000 },
      );
      if (!checkboxCell) throw new Error("Checkbox cell not found");
      await checkboxCell.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 5: Click "Scarica PDF" button
      const scaricaPdfBtn = await page.waitForSelector(
        'li[title="Scarica PDF"] a.dxm-content',
        { timeout: 10000 },
      );
      if (!scaricaPdfBtn) throw new Error("Scarica PDF button not found");

      const isDisabled = await page.evaluate(() => {
        const btn = document.querySelector('li[title*="Scarica PDF"] a.dxm-content');
        return btn?.classList.contains("dxm-disabled") ?? true;
      });
      if (isDisabled) {
        throw new Error("Scarica PDF button is still disabled after selecting row");
      }

      await scaricaPdfBtn.click();
      logger.info("[ArchibaldBot] downloadSingleDocumentPDF: clicked Scarica PDF");

      // Step 6: Wait for PDF link to appear in the row
      const pdfLinkSelector = 'div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor';
      const pdfLink = await page.waitForSelector(pdfLinkSelector, { timeout }).catch(() => null);

      if (!pdfLink) {
        const cellContent = await page.evaluate(() => {
          const div = document.querySelector('div[id$="_xaf_InvoicePDF"]');
          return div?.textContent?.trim() ?? "element not found";
        });
        if (cellContent === "N/A" || cellContent.includes("N/A")) {
          throw new Error("PDF non disponibile per questo documento (N/A)");
        }
        throw new Error(`PDF link not found after ${timeout}ms (cell content: ${cellContent})`);
      }

      // Step 7: Setup download and click PDF link
      await fsp.mkdir(tmpDir, { recursive: true });

      const client = await page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: tmpDir,
      });

      await page.click(pdfLinkSelector);

      const downloadedFile = await this.waitForDownloadedFile(tmpDir, 30000);
      const buffer = await fsp.readFile(downloadedFile);

      await fsp.unlink(downloadedFile).catch(() => {});

      logger.info("[ArchibaldBot] downloadSingleDocumentPDF: success", {
        searchTerm,
        size: buffer.length,
      });

      return buffer;
    } finally {
      if (!page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  private async waitForDownloadedFile(dir: string, timeoutMs: number): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const files = await fsp.readdir(dir);
      const pdfFiles = files.filter(
        (f) => f.endsWith(".pdf") && !f.endsWith(".crdownload"),
      );
      if (pdfFiles.length > 0) {
        return `${dir}/${pdfFiles[0]}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`PDF download timed out after ${timeoutMs}ms`);
  }

  async downloadSingleDDTPDF(
    context: BrowserContext,
    orderNumber: string,
  ): Promise<Buffer> {
    return this.downloadSingleDocumentPDF(
      context,
      `${config.archibald.url}/CUSTPACKINGSLIPJOUR_ListView/`,
      orderNumber,
      "/tmp/archibald-ddt",
      15000,
    );
  }

  async downloadSingleInvoicePDF(
    context: BrowserContext,
    orderNumber: string,
  ): Promise<Buffer> {
    return this.downloadSingleDocumentPDF(
      context,
      `${config.archibald.url}/CUSTINVOICEJOUR_ListView/`,
      orderNumber,
      "/tmp/archibald-invoices",
      30000,
    );
  }
}
