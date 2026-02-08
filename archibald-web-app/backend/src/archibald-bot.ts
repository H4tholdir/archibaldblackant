import * as fs from "fs";
import * as fsp from "fs/promises";
import puppeteer, {
  type Browser,
  type BrowserContext,
  type ElementHandle,
  type Page,
} from "puppeteer";
import { config } from "./config";
import { logger } from "./logger";
import { ProductDatabase } from "./product-db";
import { SessionCacheManager } from "./session-cache";
import { SessionCacheManager as MultiUserSessionCacheManager } from "./session-cache-manager";
import { BrowserPool } from "./browser-pool";
import { PasswordCache } from "./password-cache";
import type { OrderData } from "./types";
import {
  buildVariantCandidates,
  buildTextMatchCandidates,
  chooseBestTextMatchCandidate,
  chooseBestVariantCandidate,
  computeVariantHeaderIndices,
  normalizeLookupText,
} from "./variant-selection";

/**
 * Configuration for per-step slowdown values (in milliseconds).
 * Maps step names to their slowdown duration.
 * If a step is not in the config, the default 200ms is used.
 */
interface SlowdownConfig {
  [stepName: string]: number;
}

export class ArchibaldBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;
  private userId: string | null = null;
  private productDb: ProductDatabase;
  private legacySessionCache: SessionCacheManager | null = null;
  private multiUserSessionCache: MultiUserSessionCacheManager | null = null;
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

  constructor(userId?: string) {
    this.userId = userId || null;
    this.productDb = ProductDatabase.getInstance();

    // Use appropriate session cache based on mode
    if (this.userId) {
      // Multi-user mode: use per-user session cache
      this.multiUserSessionCache = MultiUserSessionCacheManager.getInstance();
    } else {
      // Legacy mode: use single-user session cache
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
      w.ASPxClientControl.GetControlCollection().ForEachControl(
        (c: any) => {
          if (
            c.name &&
            c.name.includes("dviSALESLINEs") &&
            typeof c.AddNewRow === "function"
          ) {
            found = c.name;
          }
        },
      );
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
          const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
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
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
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
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
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
      const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
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
          const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
          if (grid) grid.GotoPage(lastPage);
        },
        gridName,
        info.pageCount - 1,
      );

      await this.waitForGridCallback(gridName);
      logger.debug("Navigated to last page");
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

      const pool = BrowserPool.getInstance();
      this.context = await this.runOp(
        "browserPool.acquireContext",
        async () => {
          return pool.acquireContext(this.userId!);
        },
        "login",
      );

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
            protocolTimeout: config.puppeteer.protocolTimeout, // Increased timeout for large orders
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-web-security",
              "--ignore-certificate-errors",
            ],
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
          protocolTimeout: config.puppeteer.protocolTimeout, // Increased timeout for large orders
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security",
            "--ignore-certificate-errors",
          ],
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
      // Get username from UserDatabase
      const { UserDatabase } = await import("./user-db");
      const user = UserDatabase.getInstance().getUserById(this.userId);
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

    if (this.userId && this.multiUserSessionCache) {
      // Multi-user mode: load per-user session
      cachedCookies = await this.multiUserSessionCache.loadSession(this.userId);
    } else if (this.legacySessionCache) {
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

        // Clear the appropriate cache
        if (this.userId && this.multiUserSessionCache) {
          this.multiUserSessionCache.clearSession(this.userId);
        } else if (this.legacySessionCache) {
          this.legacySessionCache.clearSession();
        }
      } catch (error) {
        logger.warn(
          "Failed to restore session from cache, performing fresh login",
          {
            error,
          },
        );

        // Clear the appropriate cache
        if (this.userId && this.multiUserSessionCache) {
          this.multiUserSessionCache.clearSession(this.userId);
        } else if (this.legacySessionCache) {
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
            HTMLInputElement.prototype, "value",
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
            HTMLInputElement.prototype, "value",
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
          document.querySelectorAll("button, input[type='submit'], a, div[role='button']"),
        );
        const loginBtn = buttons.find((btn) => {
          const text = (btn.textContent || "").toLowerCase().replace(/\s+/g, "");
          const id = ((btn as HTMLElement).id || "").toLowerCase();
          return text.includes("accedi") ||
            text.includes("login") ||
            id.includes("login") ||
            id.includes("logon");
        });
        if (loginBtn) {
          (loginBtn as HTMLElement).click();
          return { ok: true, error: null, buttonId: (loginBtn as HTMLElement).id, buttonText: loginBtn.textContent };
        }
        return { ok: false, error: "login-button-not-found", buttonId: null, buttonText: null };
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

        if (this.userId && this.multiUserSessionCache) {
          // Multi-user mode: save to per-user cache
          await this.multiUserSessionCache.saveSession(
            this.userId,
            protocolCookies,
          );
        } else if (this.legacySessionCache) {
          // Legacy single-user mode
          this.legacySessionCache.saveSession(protocolCookies);
        }
      } else {
        const loginPageError = await this.page.evaluate(() => {
          const errorEl = document.querySelector(".dxeErrorCell, .error, .validation-summary-errors, [class*='error']");
          return errorEl?.textContent?.trim() || document.body?.innerText?.substring(0, 300);
        });
        logger.error("Login fallito - pagina di login ancora visibile", {
          url: currentUrl,
          urlPath,
          pageContent: loginPageError,
        });
        throw new Error(`Login fallito: ancora sulla pagina di login. ${loginPageError ? `Dettaglio: ${loginPageError.substring(0, 100)}` : ""}`);
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

  /**
   * Create a new order in Archibald
   * @param orderData - Order data with customer and items
   * @param slowdownConfig - Optional per-step slowdown configuration (milliseconds). Defaults to 200ms for all steps.
   * @returns Order ID
   */
  async createOrder(
    orderData: OrderData,
    slowdownConfig?: SlowdownConfig,
  ): Promise<string> {
    if (!this.page) throw new Error("Browser non inizializzato");

    // Store slowdown config for use in wait calls
    this.slowdownConfig = slowdownConfig || {};

    logger.info("🤖 BOT: INIZIO creazione ordine", {
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      items: orderData.items.map((item) => ({
        name: item.articleCode,
        qty: item.quantity,
      })),
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
                return elements.some(
                  (el) => el.textContent?.trim().toLowerCase() === "nuovo",
                );
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
              logger.warn(
                "Direct navigation to orders list failed, falling back to menu",
                {
                  error: error instanceof Error ? error.message : String(error),
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

      // STEP 2: Click "Nuovo" button
      await this.runOp(
        "order.click_nuovo",
        async () => {
          logger.debug('Clicking "Nuovo" button...');

          const urlBefore = this.page!.url();
          logger.debug(`URL before click: ${urlBefore}`);

          const clicked = await this.clickElementByText("Nuovo", {
            exact: true,
            selectors: ["button", "a", "span"],
          });

          if (!clicked) {
            throw new Error('Button "Nuovo" not found');
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
                return { inputId: customerInput.id, baseId, btnSelector: `#${btnId}` };
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
                const input = document.querySelector(sel) as HTMLInputElement | null;
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
            orderData.customerName,
          );

          logger.debug("✓ Customer name pasted and Enter triggered");

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
                      if (
                        typeof c?.GetGridView === "function"
                      ) {
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
            (baseId: string, customerName: string) => {
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
                return { clicked: false, reason: "no-container", rowsCount: 0, rows: [] as string[][] };
              }

              const rows = Array.from(
                container.querySelectorAll('tr[class*="dxgvDataRow"]'),
              ).filter(
                (r) => (r as HTMLElement).offsetParent !== null,
              );

              const rowData = rows.map((row) => {
                const cells = Array.from(row.querySelectorAll("td"));
                return cells.map(
                  (c) => c.textContent?.trim() || c.getAttribute("title")?.trim() || "",
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

              // Scenario 2: multiple rows - find exact match by name
              const queryLower = customerName.trim().toLowerCase();
              let bestIndex = -1;

              for (let i = 0; i < rowData.length; i++) {
                const hasExact = rowData[i].some(
                  (text) => text.trim().toLowerCase() === queryLower,
                );
                if (hasExact) {
                  bestIndex = i;
                  break;
                }
              }

              // Fallback: contains match on clean rows (no asterisks)
              if (bestIndex === -1) {
                for (let i = 0; i < rowData.length; i++) {
                  const combined = rowData[i].join(" ").toLowerCase();
                  if (combined.includes(queryLower)) {
                    bestIndex = i;
                    break;
                  }
                }
              }

              if (bestIndex >= 0) {
                const row = rows[bestIndex];
                const target =
                  row.querySelector("td") || (row as HTMLElement);
                (target as HTMLElement).scrollIntoView({ block: "center" });
                (target as HTMLElement).click();
                return {
                  clicked: true,
                  reason: rows.length === 1 ? "single-row" : "exact",
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

      // STEP 4: Add first new row in Linee di vendita
      await this.runOp(
        "order.lineditems.click_new",
        async () => {
          logger.debug('Adding new row in Linee di vendita...');

          // Strategy 0: DevExpress API (most reliable)
          let addNewDone = false;
          if (this.salesLinesGridName) {
            try {
              addNewDone = await this.gridAddNewRow();
              if (addNewDone) {
                logger.info("✅ AddNewRow via DevExpress API");
              }
            } catch (err) {
              logger.warn("DevExpress API AddNewRow failed, falling back to DOM", {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // Fallback: DOM-based click
          if (!addNewDone) {
            logger.debug("Using DOM fallback for AddNew...");
            await this.waitForDevExpressIdle({ timeout: 5000, label: "pre-addnew-idle" });

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
              throw new Error('Button "New" in line items not found (both API and DOM failed)');
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
            throw new Error(
              'New row did not appear after AddNew',
            );
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
            const directVariant = this.productDb.getProductById(
              item.articleCode,
            );
            const selectedVariant =
              directVariant ||
              this.productDb.selectPackageVariant(
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

            // 2. Focus sul campo Nome Articolo (INVENTTABLE)
            // Strategy 1: Coordinate click on INVENTTABLE cell in editnew row
            // Strategy 2: DevExpress FocusEditor API
            // Strategy 3: Tab fallback
            {
              let inventtableFocused = false;

              // DevExpress renders inline editors as overlays outside the <tr>
              // Search the entire page/grid container for the INVENTTABLE input
              logger.debug(
                `Article ${i + 1}: focusing INVENTTABLE editor`,
              );

              // Strategy 1: Find INVENTTABLE input anywhere on the page and click it
              try {
                const inventtableInfo = await this.page!.evaluate(() => {
                  // Search for visible INVENTTABLE inputs on the page
                  const inputs = Array.from(
                    document.querySelectorAll(
                      'input[id*="INVENTTABLE"][id$="_I"]',
                    ),
                  );
                  for (const inp of inputs) {
                    const el = inp as HTMLElement;
                    if (el.offsetParent !== null && el.offsetWidth > 0) {
                      el.scrollIntoView({ block: "center" });
                      const rect = el.getBoundingClientRect();
                      return {
                        id: (inp as HTMLInputElement).id,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                      };
                    }
                  }
                  return null;
                });

                if (inventtableInfo) {
                  await this.page!.mouse.click(
                    inventtableInfo.x,
                    inventtableInfo.y,
                  );
                  await this.wait(150);

                  inventtableFocused = await this.page!.evaluate(() => {
                    const focused =
                      document.activeElement as HTMLInputElement;
                    return focused?.id?.includes("INVENTTABLE") || false;
                  });

                  if (inventtableFocused) {
                    logger.debug(
                      "✅ INVENTTABLE field focused via coordinate click on page input",
                    );
                  }
                } else {
                  logger.debug(
                    "No visible INVENTTABLE input found on page",
                  );
                }
              } catch (clickError) {
                logger.warn("INVENTTABLE coordinate click failed", {
                  error:
                    clickError instanceof Error
                      ? clickError.message
                      : String(clickError),
                });
              }

              // Strategy 2: Click on the grid's "N/A" cell (NOME ARTICOLO column)
              // to activate the editor if it wasn't visible before
              if (!inventtableFocused) {
                logger.debug(
                  "Trying to click NOME ARTICOLO cell in grid",
                );
                try {
                  const naCell = await this.page!.evaluate(() => {
                    const row = document.querySelector(
                      'tr[id*="editnew"]',
                    );
                    if (!row) return null;
                    // Find cells containing "N/A" text or a dropdown
                    const cells = Array.from(
                      row.querySelectorAll("td"),
                    );
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
                    inventtableFocused = await this.page!.evaluate(
                      () => {
                        const focused =
                          document.activeElement as HTMLInputElement;
                        return (
                          focused?.id?.includes("INVENTTABLE") || false
                        );
                      },
                    );

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
                    document.querySelectorAll(
                      'input[id*="INVENTTABLE"]',
                    ),
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
              // Aspetta che appaiano righe del dropdown (senza visible:true perché popup può essere fuori viewport)
              await this.page!.waitForSelector('tr[id*="DXDataRow"]', {
                timeout: 5000,
              });

              // Verifica manualmente la visibilità e conta risultati
              const rowCount = await this.page!.evaluate(() => {
                const rows = document.querySelectorAll('tr[id*="DXDataRow"]');
                // Filtra solo righe effettivamente visibili nel dropdown popup
                return Array.from(rows).filter((row) => {
                  const rect = row.getBoundingClientRect();
                  // Considera visibili anche righe fuori viewport (popup può essere scrollabile)
                  return rect.width > 0 && rect.height > 0;
                }).length;
              });

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
                  document.querySelectorAll("div[id*='DX'], div[id*='Popup']"),
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
              logger.debug(`Searching for variant on page ${currentPage}...`);

              const snapshot = await this.page!.evaluate(() => {
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

                let activeContainer =
                  dropdownContainers.find((container) =>
                    container.querySelector('tr[class*="dxgvDataRow"]'),
                  ) || null;

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
              const candidates = buildVariantCandidates(
                snapshot.rows,
                headerIndices,
                {
                  variantId: selectedVariant.id,
                  variantSuffix,
                  packageContent: selectedVariant.packageContent,
                  multipleQty: selectedVariant.multipleQty,
                },
              );
              const { chosen, reason } = chooseBestVariantCandidate(candidates);

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
                  (containerId, inputId) => {
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
                          container.querySelector('tr[class*="dxgvDataRow"]'),
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

                    if (inputId) {
                      const input = document.getElementById(
                        inputId,
                      ) as HTMLInputElement | null;
                      if (input) {
                        const el = input as HTMLElement;
                        const style = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        const visible =
                          style.display !== "none" &&
                          style.visibility !== "hidden" &&
                          rect.width > 0 &&
                          rect.height > 0;
                        if (visible) {
                          input.focus();
                        }
                      }
                    }

                    return {
                      rowsCount: rows.length,
                      focusedIndex,
                      containerId: activeContainer
                        ? (activeContainer as HTMLElement).id || ""
                        : "",
                    };
                  },
                  snapshot.containerId,
                  inventtableInputId || null,
                );

                const rowsCount = keyboardState.rowsCount ?? snapshot.rowsCount;
                const focusedIndex = keyboardState.focusedIndex ?? -1;
                const targetIndex = chosen.index;

                if (!rowsCount || targetIndex < 0 || targetIndex >= rowsCount) {
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
                      keyboardState.containerId || snapshot.containerId || "",
                  };
                } else {
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
                    await this.wait(30); // Ridotto da 60ms
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

                  logger.debug("Quantity field state after variant callback", {
                    currentValue: currentQty.value,
                    fieldId: currentQty.id,
                    fieldTag: currentQty.tag,
                    targetQty,
                  });

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

                    // Tab → campo discount (già selezionato automaticamente)
                    await this.page!.keyboard.press("Tab");
                    await this.wait(100);

                    // Type discount (formato italiano, testo già selezionato)
                    const discountFormatted = item
                      .discount!.toString()
                      .replace(".", ",");
                    await this.page!.keyboard.type(discountFormatted, {
                      delay: 30,
                    });

                    logger.info(`✅ Discount set: ${item.discount}%`);
                    await this.wait(200);
                  }

                  // Save row via UpdateEdit
                  logger.debug("Saving row via UpdateEdit...");

                  let updateDone = false;

                  // Strategy 0: DevExpress API
                  if (this.salesLinesGridName) {
                    try {
                      updateDone = await this.gridUpdateEdit();
                      if (updateDone) {
                        logger.info("✅ UpdateEdit via DevExpress API");
                      }
                    } catch (err) {
                      logger.warn("DevExpress API UpdateEdit failed, falling back to DOM", {
                        error: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }

                  // Fallback: DOM-based click
                  if (!updateDone) {
                    const updateResult = await this.clickDevExpressGridCommand({
                      command: "UpdateEdit",
                      baseIdHint: "SALESLINEs",
                      timeout: 7000,
                      label: `item-${i}-update-integrated`,
                    });

                    if (!updateResult.clicked) {
                      await this.page!.screenshot({
                        path: `logs/update-button-not-found-${Date.now()}.png`,
                        fullPage: true,
                      });
                      throw new Error(
                        'Button "Update" not found (both API and DOM failed)',
                      );
                    }
                    logger.info("✅ UpdateEdit via DOM fallback");
                    await this.waitForDevExpressIdle({
                      timeout: 4000,
                      label: `item-${i}-row-saved`,
                    });
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
                      keyboardState.containerId || snapshot.containerId || "",
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
                  document.querySelectorAll("a.dxp-button, button.dxp-button"),
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

        // 5.8: Add new row for next article (if not last)
        if (i < itemsToOrder.length - 1) {
          await this.runOp(
            `order.item.${i}.click_new_for_next`,
            async () => {
              logger.debug(`Adding new row for article ${i + 2}...`);

              // Handle pagination: after UpdateEdit, grid may have paginated
              // Navigate to last page so AddNewRow works correctly
              if (this.salesLinesGridName) {
                await this.gridGotoLastPage();
              }

              // Strategy 0: DevExpress API AddNewRow (most reliable)
              let addNewDone = false;
              if (this.salesLinesGridName) {
                try {
                  addNewDone = await this.gridAddNewRow();
                  if (addNewDone) {
                    logger.info(`✅ AddNewRow via API for article ${i + 2}`);
                  }
                } catch (err) {
                  logger.warn("API AddNewRow failed for next article, falling back to DOM", {
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }

              // Fallback: DOM-based click
              if (!addNewDone) {
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
                  logger.warn("Edit row still visible before AddNew; proceeding");
                }

                const newCommandResult = await this.clickDevExpressGridCommand({
                  command: "AddNew",
                  baseIdHint: "SALESLINEs",
                  timeout: 7000,
                  label: `item-${i}-new-command`,
                });

                if (!newCommandResult.clicked) {
                  await this.page!.screenshot({
                    path: `logs/new-button-for-next-not-found-${Date.now()}.png`,
                    fullPage: true,
                  });
                  throw new Error(
                    `AddNew failed for article ${i + 2} (both API and DOM failed)`,
                  );
                }
                logger.debug("AddNew via DOM fallback for next article");
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
                logger.warn("editnew row not detected after AddNew, proceeding");
              }

              logger.info(`✅ Ready for article ${i + 2}`);
            },
            "multi-article-navigation",
          );
        }
      }

      const openPrezziEScontiTab = async (): Promise<boolean> => {
        logger.debug('Looking for "Prezzi e sconti" tab...');

        const tabClicked = await this.page!.evaluate(() => {
          // Find tab with text "Prezzi e sconti"
          const allLinks = Array.from(
            document.querySelectorAll("a.dxtc-link, span.dx-vam"),
          );

          for (const element of allLinks) {
            const text = element.textContent?.trim() || "";
            if (text.includes("Prezzi") && text.includes("sconti")) {
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

          // Alternative: Find by tab ID pattern (pg_AT2 = Prezzi e sconti)
          const tabs = Array.from(
            document.querySelectorAll('li[id*="_pg_AT"]'),
          );
          for (const tab of tabs) {
            const link = tab.querySelector("a.dxtc-link");
            const span = tab.querySelector("span.dx-vam");
            const text = span?.textContent?.trim() || "";

            if (text.includes("Prezzi") && text.includes("sconti")) {
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
              const col =
                w.ASPxClientControl?.GetControlCollection?.();
              if (!col || typeof col.ForEachControl !== "function")
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
        return true;
      };

      await this.emitProgress("form.articles.complete");

      let prezziTabOpened = false;

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

      // STEP 9.2: Set line discount to N/A (mandatory)
      await this.runOp(
        "order.apply_line_discount",
        async () => {
          const tabClicked = await openPrezziEScontiTab();
          prezziTabOpened = prezziTabOpened || tabClicked;

          logger.debug("Setting line discount to N/A...");

          // Phase 1: Attendi che il campo LINEDISC appaia nel DOM (il tab carica lazy)
          try {
            await this.page!.waitForFunction(
              () => {
                const input = document.querySelector(
                  'input[id*="LINEDISC"][id$="_I"]',
                ) as HTMLInputElement | null;
                return input && input.offsetParent !== null;
              },
              { timeout: 10000, polling: 200 },
            );
          } catch {
            logger.warn(
              "LINEDISC input not found after waiting, retrying tab click...",
            );
            await openPrezziEScontiTab();
            await this.wait(1000);
          }

          const inputInfo = await this.page!.evaluate(() => {
            const input = document.querySelector(
              'input[id*="LINEDISC"][id$="_I"]',
            ) as HTMLInputElement | null;
            if (!input || input.offsetParent === null) return null;
            input.scrollIntoView({ block: "center" });
            input.focus();
            input.click();
            return { id: input.id, currentValue: input.value };
          });

          if (!inputInfo) {
            throw new Error("LINEDISC input field not found");
          }

          logger.debug("LINEDISC input found", {
            id: inputInfo.id,
            currentValue: inputInfo.currentValue,
          });

          // Phase 2: Se già "N/A", skip
          if (
            inputInfo.currentValue.trim().toUpperCase() === "N/A"
          ) {
            logger.info("⚡ Line discount already N/A, skipping");
          } else {
            // Phase 3: Scrivi "N/A" direttamente nell'input
            await this.page!.evaluate((inputId) => {
              const input = document.getElementById(
                inputId,
              ) as HTMLInputElement;
              if (input) {
                input.value = "N/A";
                input.dispatchEvent(
                  new Event("input", { bubbles: true }),
                );
                input.dispatchEvent(
                  new Event("change", { bubbles: true }),
                );
              }
            }, inputInfo.id);

            // Phase 4: Tab per confermare
            await this.page!.keyboard.press("Tab");

            // Phase 5: Attendi callback conferma
            try {
              await this.page!.waitForFunction(
                () => {
                  const w = window as any;
                  const col =
                    w.ASPxClientControl?.GetControlCollection?.();
                  if (!col || typeof col.ForEachControl !== "function")
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

            // Phase 6: Verifica valore impostato
            const verifyValue = await this.page!.evaluate((inputId) => {
              const input = document.getElementById(
                inputId,
              ) as HTMLInputElement;
              return input?.value || "";
            }, inputInfo.id);

            logger.debug("LINEDISC verification", {
              setValue: "N/A",
              actualValue: verifyValue,
            });
          }

          logger.info("✅ Line discount set to N/A");
        },
        "form.discount",
      );

      // STEP 9.5: Apply global discount (if specified)
      if (orderData.discountPercent && orderData.discountPercent > 0) {
        await this.runOp(
          "order.apply_global_discount",
          async () => {
            logger.debug(
              `Applying global discount: ${orderData.discountPercent}%`,
            );

            // Apri tab Prezzi e Sconti se non già aperto
            if (!prezziTabOpened) {
              const tabClicked = await openPrezziEScontiTab();
              prezziTabOpened = prezziTabOpened || tabClicked;
            }

            // Attendi callback post-selezione linedisc
            try {
              await this.page!.waitForFunction(
                () => {
                  const w = window as any;
                  const col =
                    w.ASPxClientControl?.GetControlCollection?.();
                  if (!col || typeof col.ForEachControl !== "function")
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

            // Trova il campo "APPLICA SCONTO %" nel tab Prezzi e sconti
            // Pattern noti: ENDDISCPERCENT, ENDDISCP, DISCPERC, APPLYSCONTO
            const discountInputInfo = await this.page!.evaluate(() => {
              // Cerca tutti gli input nel tab Prezzi e sconti
              const candidates = Array.from(
                document.querySelectorAll(
                  'input[type="text"][id*="_Edit_I"]',
                ),
              ) as HTMLInputElement[];

              // Filtra solo quelli visibili nel tab Prezzi e sconti
              const visible = candidates.filter(
                (inp) =>
                  inp.offsetParent !== null &&
                  inp.getBoundingClientRect().width > 0,
              );

              // Cerca per pattern ID noti (sconto/discount)
              const patterns = [
                "ENDDISCPERCENT",
                "ENDDISCP",
                "DISCPERC",
                "DISCOUNT",
                "SCONTO",
              ];
              for (const pattern of patterns) {
                const match = visible.find((inp) =>
                  inp.id.toUpperCase().includes(pattern),
                );
                if (match) {
                  match.scrollIntoView({ block: "center" });
                  match.focus();
                  match.click();
                  return {
                    id: match.id,
                    value: match.value,
                    method: "pattern",
                    pattern,
                  };
                }
              }

              // Fallback: cerca label "Applica sconto" e prendi l'input associato
              const labels = Array.from(
                document.querySelectorAll(
                  "td, span, label, div",
                ),
              );
              for (const label of labels) {
                const text = label.textContent?.trim() || "";
                if (
                  text.includes("Applica sconto") ||
                  text.includes("APPLICA SCONTO")
                ) {
                  // Cerca input vicino (sibling, parent, next element)
                  const container =
                    label.closest("tr") || label.parentElement;
                  if (container) {
                    const nearInput = container.querySelector(
                      'input[type="text"]',
                    ) as HTMLInputElement | null;
                    if (nearInput && nearInput.offsetParent !== null) {
                      nearInput.scrollIntoView({ block: "center" });
                      nearInput.focus();
                      nearInput.click();
                      return {
                        id: nearInput.id,
                        value: nearInput.value,
                        method: "label-proximity",
                        pattern: text.substring(0, 30),
                      };
                    }
                  }
                }
              }

              // Debug: dump visible fields in Prezzi e sconti
              const debugFields = visible.map((inp) => ({
                id: inp.id.substring(
                  inp.id.lastIndexOf("_dvi") >= 0
                    ? inp.id.lastIndexOf("_dvi")
                    : Math.max(0, inp.id.length - 50),
                ),
                value: inp.value,
              }));

              return {
                id: "",
                value: "",
                method: "not-found",
                pattern: "",
                debugFields,
              };
            });

            if (!discountInputInfo.id) {
              logger.warn("Global discount field not found", {
                method: discountInputInfo.method,
                debugFields: (discountInputInfo as any).debugFields,
              });
              return;
            }

            logger.debug("Global discount field found", {
              id: discountInputInfo.id,
              currentValue: discountInputInfo.value,
              method: discountInputInfo.method,
            });

            // Scrivi il valore dello sconto
            const discountFormatted = orderData
              .discountPercent!.toString()
              .replace(".", ",");

            await this.page!.evaluate(
              (inputId, val) => {
                const input = document.getElementById(
                  inputId,
                ) as HTMLInputElement;
                if (input) {
                  input.value = val;
                  input.dispatchEvent(
                    new Event("input", { bubbles: true }),
                  );
                  input.dispatchEvent(
                    new Event("change", { bubbles: true }),
                  );
                }
              },
              discountInputInfo.id,
              discountFormatted,
            );

            // Tab per confermare
            await this.page!.keyboard.press("Tab");

            // Attendi callback ricalcolo
            try {
              await this.page!.waitForFunction(
                () => {
                  const w = window as any;
                  const col =
                    w.ASPxClientControl?.GetControlCollection?.();
                  if (!col || typeof col.ForEachControl !== "function")
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

            // Verifica
            const verifyValue = await this.page!.evaluate((inputId) => {
              const input = document.getElementById(
                inputId,
              ) as HTMLInputElement;
              return input?.value || "";
            }, discountInputInfo.id);

            logger.info(
              `✅ Global discount applied: ${orderData.discountPercent}%`,
              { setValue: discountFormatted, actualValue: verifyValue },
            );
          },
          "form.discount",
        );

        await this.emitProgress("form.discount");
      }

      // STEP 10: Save and close order
      await this.emitProgress("form.submit.start");

      await this.runOp(
        "order.save_and_close",
        async () => {
          logger.debug('Attempting direct "Salva e chiudi"...');

          const directSaveClicked = await this.clickElementByText(
            "Salva e chiudi",
            {
              exact: true,
              selectors: ["a", "span", "div", "li"],
            },
          );

          if (directSaveClicked) {
            logger.info('✅ Clicked "Salva e chiudi" directly');
            await this.wait(this.getSlowdown("click_salva_chiudi"));
            return;
          }

          logger.debug('Opening "Salvare" dropdown...');

          // Find "Salvare" button
          const dropdownOpened = await this.page!.evaluate(() => {
            const allElements = Array.from(
              document.querySelectorAll("span, button, a"),
            );
            const salvareBtn = allElements.find((el) => {
              const text = el.textContent?.trim() || "";
              return text.toLowerCase().includes("salvare");
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
            throw new Error('Button "Salvare" not found');
          }

          // Slowdown after salvare dropdown
          await this.wait(this.getSlowdown("click_salvare_dropdown"));

          // Click "Salva e chiudi"
          const saveClicked = await this.clickElementByText("Salva e chiudi", {
            exact: true,
            selectors: ["a", "span", "div"],
          });

          if (!saveClicked) {
            throw new Error('Option "Salva e chiudi" not found in dropdown');
          }

          logger.info('✅ Clicked "Salva e chiudi"');

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

    if (this.userId && this.context) {
      // Multi-user mode: release context to pool
      const pool = BrowserPool.getInstance();
      // Release with success=false if there were errors, so pool closes the context
      await pool.releaseContext(this.userId, this.context, !this.hasError);
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
    } = options;

    const page = await context.newPage();
    const startTime = Date.now();

    try {
      logger.info(`[ArchibaldBot] Starting ${filePrefix} PDF download`);

      await page.setExtraHTTPHeaders({
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      });

      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      logger.info(
        `[ArchibaldBot] Navigated to ${filePrefix} page: ${pageUrl}`,
      );

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
      });

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

          button.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true }),
          );
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
      if (!page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  async downloadCustomersPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl:
        "https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/",
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

    try {
      // Check if filter is visible or hidden in responsive menu
      const filterVisibility = await page.evaluate(() => {
        const input = document.querySelector(
          'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]',
        ) as HTMLInputElement;
        const showHiddenButton = document.querySelector(
          "#Vertical_mainMenu_Menu_DXI9_T",
        ) as HTMLElement;

        if (!input) {
          return {
            found: false,
            isVisible: false,
            hasShowHiddenButton: !!showHiddenButton,
          };
        }

        // Check if input is visible by checking offsetParent
        const isVisible = input.offsetParent !== null;

        return {
          found: true,
          isVisible,
          hasShowHiddenButton: !!showHiddenButton,
          currentValue: input.value,
        };
      });

      logger.info("[ArchibaldBot] Filter visibility check:", filterVisibility);

      // If filter is hidden, click "Show hidden items" button first
      if (
        filterVisibility.found &&
        !filterVisibility.isVisible &&
        filterVisibility.hasShowHiddenButton
      ) {
        logger.info(
          "[ArchibaldBot] Filter is hidden, clicking 'Show hidden items' button...",
        );

        await page.evaluate(() => {
          const showHiddenButton = document.querySelector(
            "#Vertical_mainMenu_Menu_DXI9_T",
          ) as HTMLElement;
          if (showHiddenButton) {
            showHiddenButton.click();
          }
        });

        logger.info(
          "[ArchibaldBot] 'Show hidden items' clicked, waiting for menu...",
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Wait for the filter dropdown to be present (now it should be visible)
      await page.waitForSelector(
        'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]',
        { timeout: 5000 },
      );

      // Check current filter value
      const currentFilterValue = await page.evaluate(() => {
        const input = document.querySelector(
          'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]',
        ) as HTMLInputElement;
        return input ? input.value : null;
      });

      logger.info("[ArchibaldBot] Current filter value:", {
        currentFilterValue,
      });

      // If already set to "Tutti gli ordini", no action needed
      if (currentFilterValue === "Tutti gli ordini") {
        logger.info(
          "[ArchibaldBot] Filter already set to 'Tutti gli ordini', no action needed",
        );
        return;
      }

      logger.info(
        "[ArchibaldBot] Filter not set to 'Tutti gli ordini', changing filter...",
      );

      // Click the dropdown button to open the list
      await page.evaluate(() => {
        const dropdownButton = document.querySelector(
          "#Vertical_mainMenu_Menu_ITCNT8_xaf_a1_Cb_B-1",
        ) as HTMLElement;
        if (dropdownButton) {
          dropdownButton.click();
        }
      });

      logger.info("[ArchibaldBot] Dropdown opened, waiting for list...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Wait for the "Tutti gli ordini" option to appear
      await page.waitForSelector(
        "#Vertical_mainMenu_Menu_ITCNT8_xaf_a1_Cb_DDD_L_LBI0T0",
        { timeout: 5000 },
      );

      // Click on "Tutti gli ordini" option
      await page.evaluate(() => {
        const allOrdersOption = document.querySelector(
          "#Vertical_mainMenu_Menu_ITCNT8_xaf_a1_Cb_DDD_L_LBI0T0",
        ) as HTMLElement;
        if (allOrdersOption) {
          allOrdersOption.click();
        }
      });

      logger.info(
        "[ArchibaldBot] 'Tutti gli ordini' option clicked, waiting for page update...",
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify the filter was changed
      const newFilterValue = await page.evaluate(() => {
        const input = document.querySelector(
          'input[name="Vertical$mainMenu$Menu$ITCNT8$xaf_a1$Cb"]',
        ) as HTMLInputElement;
        return input ? input.value : null;
      });

      logger.info("[ArchibaldBot] Filter change verification:", {
        newFilterValue,
        success: newFilterValue === "Tutti gli ordini",
      });

      if (newFilterValue !== "Tutti gli ordini") {
        logger.warn(
          "[ArchibaldBot] Filter change verification failed, but continuing anyway",
        );
      }
    } catch (error) {
      logger.error("[ArchibaldBot] Error while ensuring filter is set:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - we'll try to continue with the current filter
      logger.warn(
        "[ArchibaldBot] Continuing with current filter despite error",
      );
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
      pageUrl:
        "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
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
      pageUrl:
        "https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/",
      buttonSelector: "#Vertical_mainMenu_Menu_DXI3_T",
      containerSelector: "#Vertical_mainMenu_Menu_DXI3_",
      expectedFileNames: [
        "Documenti di trasporto.pdf",
        "Giornale di registrazione bolla di consegna.pdf",
        "Packing slip journal.pdf",
      ],
      filePrefix: "ddt",
    });
  }

  async downloadInvoicesPDF(context: BrowserContext): Promise<string> {
    return this.downloadPDFExport({
      context,
      pageUrl:
        "https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/",
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
      pageUrl:
        "https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/",
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

      const btnSelector =
        'a[id*="xaf_dviSALESLINEs_ToolBar_Menu_DXI1_T"]';
      await page.waitForSelector(btnSelector, { timeout: 15000 });
      logger.info("[ArchibaldBot] PDF export button found");

      const downloadComplete = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(checkFile);
          reject(
            new Error("PDF download timeout (120s exceeded)"),
          );
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
      });

      logger.info("[ArchibaldBot] Clicking PDF export button...");
      await page.evaluate((sel: string) => {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn) {
          btn.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true }),
          );
          btn.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true }),
          );
          btn.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
          );
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
      await import("./performance-dashboard-generator");
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
    await this.waitForDevExpressIdle({ timeout: 5000, label: `field-${result.id}` });

    logger.debug("setDevExpressField done", { id: result.id, value });
  }

  private async setDevExpressComboBox(
    fieldRegex: RegExp,
    value: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    const inputId = await this.page.evaluate(
      (regex: string, val: string) => {
        const inputs = Array.from(document.querySelectorAll("input"));
        const input = inputs.find((i) =>
          new RegExp(regex).test(i.id),
        ) as HTMLInputElement | null;
        if (!input) return null;

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

        return input.id;
      },
      fieldRegex.source,
      value,
    );

    if (!inputId) {
      throw new Error(`ComboBox input not found: ${fieldRegex}`);
    }

    await this.page.keyboard.press("Tab");
    await this.waitForDevExpressIdle({ timeout: 5000, label: `combo-${inputId}` });

    const actual = await this.page.evaluate((id: string) => {
      const input = document.getElementById(id) as HTMLInputElement;
      return input?.value || "";
    }, inputId);

    logger.debug("setDevExpressComboBox done", { id: inputId, requested: value, actual });
  }

  private async selectFromDevExpressLookup(
    buttonRegex: RegExp,
    searchValue: string,
    matchHint?: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.debug("selectFromDevExpressLookup", { pattern: buttonRegex.source, searchValue });

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
            document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl'),
          ).filter((node) => {
            const el = node as HTMLElement;
            return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
          });
          return dialogs.length > 0;
        },
        { timeout: 10000, polling: 100 },
      );
    } catch {
      logger.warn("Lookup dialog not detected by waitForFunction, proceeding with fallback...");
      await this.wait(2000);
    }

    logger.debug("Lookup dialog appeared");

    // Check if the popup content is inside an iframe (DevExpress FindPopup pattern)
    const iframeInfo = await this.page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll("iframe")).filter((f) => {
        const el = f as HTMLElement;
        return el.offsetParent !== null && f.src && f.src.includes("FindPopup");
      });
      if (iframes.length > 0) {
        return { hasIframe: true, src: iframes[0].src, id: iframes[0].id };
      }
      return { hasIframe: false, src: "", id: "" };
    });

    logger.debug("Iframe check", iframeInfo);

    if (iframeInfo.hasIframe) {
      await this.selectFromDevExpressLookupViaIframe(iframeInfo.id, searchValue, matchHint);
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
        document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl'),
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
          const selectors = '[id*="_DDD"], .dxpcLite, .dxpc-mainDiv, .dxpc-content, [id*="PopupControl"], [id*="_PW"], .dxpnlControl';
          const popups = Array.from(document.querySelectorAll(selectors)).filter((node) => {
            const el = node as HTMLElement;
            return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
          });
          for (const popup of popups) {
            const rows = popup.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]');
            if (rows.length > 0) return true;
          }
          return false;
        },
        { timeout: 12000, polling: 150 },
      );
    } catch {
      logger.warn("Rows not detected in direct lookup dialog");
    }

    await this.selectRowInLookupDialog(searchValue, matchHint);

    await this.wait(200);
    await this.clickElementByText("OK", { exact: true, selectors: ["span", "button", "a", "td"] });

    await this.page.waitForFunction(
      () => {
        const dialogs = Array.from(
          document.querySelectorAll('[id*="_DDD"], .dxpcLite'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        });
        return dialogs.every((d) =>
          d.querySelectorAll('tr[class*="dxgvDataRow"]').length === 0,
        );
      },
      { timeout: 5000, polling: 100 },
    ).catch(() => {});
  }

  private async selectFromDevExpressLookupViaIframe(
    iframeId: string,
    searchValue: string,
    matchHint?: string,
  ): Promise<void> {
    if (!this.page) return;

    const iframeHandle = await this.page.$(`#${iframeId}`);
    if (!iframeHandle) {
      logger.warn("Iframe element not found by id, falling back to direct mode");
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
          return document.readyState === "complete" && !!w.ASPxClientControl?.GetControlCollection;
        },
        { timeout: 10000, polling: 200 },
      );
    } catch {
      logger.warn("Iframe not fully ready, proceeding...");
    }

    await this.wait(300);

    // Find and focus the search input inside the iframe
    const searchFound = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(
        (i) => (i as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement[];

      const searchInput = inputs.find((i) =>
        /_DXSE_I$/.test(i.id) || /_DXFREditorcol0_I$/.test(i.id),
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

    logger.debug("Search value entered in iframe via real keyboard, waiting for results...");

    // Wait for rows to appear inside the iframe
    try {
      await frame.waitForFunction(
        () => {
          const w = window as any;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (col && typeof col.ForEachControl === "function") {
            let busy = false;
            col.ForEachControl((c: any) => {
              try { if (c.InCallback?.()) busy = true; } catch {}
            });
            if (busy) return false;
          }
          const rows = document.querySelectorAll('tr[class*="dxgvDataRow"], tr[class*="dxgvFocusedRow"]');
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
    const selectionResult = await frame.evaluate((query: string, hint?: string) => {
      const rows = Array.from(
        document.querySelectorAll('tr[class*="dxgvDataRow"]'),
      ).filter((r) => (r as HTMLElement).offsetParent !== null);

      const rowTexts = rows.slice(0, 10).map((r) => r.textContent?.trim().substring(0, 80) || "");

      if (rows.length === 0) return { clicked: false, reason: "no-rows", rowCount: 0, rowTexts };

      if (rows.length === 1) {
        const target = rows[0].querySelector("td") || (rows[0] as HTMLElement);
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
            return { clicked: true, reason: "hint-match", rowCount: rows.length, rowTexts, hint };
          }
        }
      }

      const queryLower = query.trim().toLowerCase();
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.some((c) => c.textContent?.trim().toLowerCase() === queryLower)) {
          const target = cells[0] || (row as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "exact-match", rowCount: rows.length, rowTexts };
        }
      }

      for (const row of rows) {
        if (row.textContent?.toLowerCase().includes(queryLower)) {
          const target = row.querySelector("td") || (row as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "contains-match", rowCount: rows.length, rowTexts };
        }
      }

      const target = rows[0].querySelector("td") || (rows[0] as HTMLElement);
      (target as HTMLElement).scrollIntoView({ block: "center" });
      (target as HTMLElement).click();
      return { clicked: true, reason: "fallback-first", rowCount: rows.length, rowTexts };
    }, searchValue, matchHint);

    logger.debug("Iframe row selection result", selectionResult);

    await this.wait(300);

    // Click OK — could be inside iframe or in main page
    let okClicked = await frame.evaluate(() => {
      const okBtns = Array.from(document.querySelectorAll("span, button, a, td"))
        .filter((el) => {
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
      okClicked = await this.clickElementByText("OK", { exact: true, selectors: ["span", "button", "a", "td"] });
    }
    logger.debug("OK button clicked", { okClicked, context: okClicked ? "found" : "not-found" });

    // Wait for popup to close in main page
    try {
      await this.page.waitForFunction(
        () => {
          const iframes = Array.from(document.querySelectorAll("iframe")).filter((f) => {
            const el = f as HTMLElement;
            return el.offsetParent !== null && f.src && f.src.includes("FindPopup");
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

  private async selectRowInLookupDialog(searchValue: string, matchHint?: string): Promise<void> {
    if (!this.page) return;

    const selectionResult = await this.page.evaluate((query: string, hint?: string) => {
      const dialogs = Array.from(
        document.querySelectorAll('[id*="_DDD"], .dxpcLite, .dxpc-content, .dxpc-mainDiv, [id*="PopupControl"], [id*="_PW"], .dxpnlControl'),
      ).filter((node) => {
        const el = node as HTMLElement;
        return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      });

      let container: Element | null = null;
      for (const d of dialogs) {
        if (d.querySelector('tr[class*="dxgvDataRow"]')) {
          container = d;
          break;
        }
      }
      if (!container) return { clicked: false, reason: "no-container", rowCount: 0, rowTexts: [] as string[] };

      const rows = Array.from(
        container.querySelectorAll('tr[class*="dxgvDataRow"]'),
      ).filter((r) => (r as HTMLElement).offsetParent !== null);

      const rowTexts = rows.slice(0, 10).map((r) => r.textContent?.trim().substring(0, 80) || "");

      if (rows.length === 0) return { clicked: false, reason: "no-rows", rowCount: 0, rowTexts };

      if (rows.length === 1) {
        const target = rows[0].querySelector("td") || (rows[0] as HTMLElement);
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
            return { clicked: true, reason: "hint-match", rowCount: rows.length, rowTexts, hint };
          }
        }
      }

      const queryLower = query.trim().toLowerCase();
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.some((c) => c.textContent?.trim().toLowerCase() === queryLower)) {
          const target = cells[0] || (row as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "exact-match", rowCount: rows.length, rowTexts };
        }
      }

      for (const row of rows) {
        if (row.textContent?.toLowerCase().includes(queryLower)) {
          const target = row.querySelector("td") || (row as HTMLElement);
          (target as HTMLElement).scrollIntoView({ block: "center" });
          (target as HTMLElement).click();
          return { clicked: true, reason: "contains-match", rowCount: rows.length, rowTexts };
        }
      }

      const target = rows[0].querySelector("td") || (rows[0] as HTMLElement);
      (target as HTMLElement).scrollIntoView({ block: "center" });
      (target as HTMLElement).click();
      return { clicked: true, reason: "fallback-first", rowCount: rows.length, rowTexts };
    }, searchValue, matchHint);

    logger.debug("Row selection result", selectionResult);
  }

  private async openCustomerTab(tabText: string): Promise<boolean> {
    if (!this.page) return false;

    const clicked = await this.page.evaluate((text: string) => {
      const links = Array.from(
        document.querySelectorAll("a.dxtc-link, span.dx-vam"),
      );

      for (const el of links) {
        const elText = el.textContent?.trim() || "";
        if (elText.includes(text)) {
          const clickTarget = el.tagName === "A" ? el : el.parentElement;
          if (clickTarget && (clickTarget as HTMLElement).offsetParent !== null) {
            (clickTarget as HTMLElement).click();
            return true;
          }
        }
      }

      const tabs = Array.from(
        document.querySelectorAll('li[id*="_pg_AT"]'),
      );
      for (const tab of tabs) {
        const link = tab.querySelector("a.dxtc-link");
        const span = tab.querySelector("span.dx-vam");
        const tabLabel = span?.textContent?.trim() || "";
        if (tabLabel.includes(text) && link && (link as HTMLElement).offsetParent !== null) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, tabText);

    if (!clicked) {
      logger.warn(`Tab "${tabText}" not found`);
      return false;
    }

    logger.info(`Tab "${tabText}" clicked`);

    try {
      await this.page.waitForFunction(
        () => {
          const w = window as any;
          const col = w.ASPxClientControl?.GetControlCollection?.();
          if (!col || typeof col.ForEachControl !== "function") return true;
          let busy = false;
          col.ForEachControl((c: any) => {
            try { if (c.InCallback?.()) busy = true; } catch {}
          });
          return !busy;
        },
        { timeout: 5000, polling: 100 },
      );
    } catch {}

    return true;
  }

  private async saveAndCloseCustomer(): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Saving customer (Salva e chiudi)");

    const saveAttempt = async (): Promise<boolean> => {
      const directSaveClicked = await this.clickElementByText("Salva e chiudi", {
        exact: true,
        selectors: ["a", "span", "div", "li"],
      });

      if (directSaveClicked) {
        logger.info('Clicked "Salva e chiudi" directly');
        return true;
      }

      logger.debug('Direct "Salva e chiudi" not found, trying "Salvare" dropdown...');

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
        const byId = await this.page!.evaluate(() => {
          const el = document.querySelector("#Vertical_mainMenu_Menu_DXI1i1_T") as HTMLElement;
          if (el) { el.click(); return true; }
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

    const warningFound = await this.page.evaluate(() => {
      const checkbox = document.querySelector(
        'input[id$="_ErrorInfo_Ch_S"]',
      ) as HTMLInputElement | null;
      if (!checkbox) return false;
      const wrapper = checkbox.closest('span[id$="_ErrorInfo_Ch_S_D"]');
      if (wrapper) {
        (wrapper as HTMLElement).click();
      } else {
        checkbox.click();
      }
      return true;
    });

    if (warningFound) {
      logger.info("Warning checkbox acknowledged, saving again");
      await this.waitForDevExpressIdle({ timeout: 3000, label: "warning-ack" });

      const savedAgain = await saveAttempt();
      if (!savedAgain) {
        logger.warn("Second save attempt failed, trying direct click fallback");
        await this.clickElementByText("Salva e chiudi", {
          selectors: ["a", "span", "button", "li"],
        });
      }
      await this.waitForDevExpressIdle({ timeout: 8000, label: "save-customer-2" });
    }

    logger.info("Customer saved");
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
    await this.waitForDevExpressIdle({ timeout: 5000, label: "tab-indirizzo-alt" });

    const altGridName = await this.page.evaluate(() => {
      const w = window as any;
      if (!w.ASPxClientControl?.GetControlCollection) return "";
      let found = "";
      w.ASPxClientControl.GetControlCollection().ForEachControl(
        (c: any) => {
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
        },
      );
      return found;
    });

    logger.debug("Alt address grid discovered", { altGridName });

    if (altGridName) {
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.AddNewRow();
      }, altGridName);
    } else {
      const addNewResult = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[data-args*="AddNew"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
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

    await this.waitForDevExpressIdle({ timeout: 8000, label: "address-addnew" });
    logger.debug("New row added to address grid");

    const tipoSet = await this.page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="text"]'),
      ).filter(
        (i) => (i as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement[];

      const tipoInput = inputs.find((i) => {
        const id = i.id.toLowerCase();
        return id.includes("type") || id.includes("tipo") || id.includes("addresstype");
      });

      if (tipoInput) {
        tipoInput.focus();
        tipoInput.click();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, "value",
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
            HTMLInputElement.prototype, "value",
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
      if (activeEl && activeEl.tagName === "INPUT" && editingRow.contains(activeEl)) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, "value",
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
    logger.debug("Delivery street set, cursor should be on INDIRIZZO LOGISTICO CODICE POSTALE");

    // CAP column is a lookup field — find the B0 (find) button in the editing row and use it
    logger.debug("Setting INDIRIZZO LOGISTICO CODICE POSTALE via lookup");

    const findBtnId = await this.page.evaluate(() => {
      const editingRow = document.querySelector('tr[class*="dxgvEditingRow"]');
      if (editingRow) {
        const btns = Array.from(editingRow.querySelectorAll('td, img, button, a, div'))
          .filter((el) => /LOGISTICSADDRESSZIPCODE.*_B0$|_find_Edit_B0$/.test(el.id));
        if (btns.length > 0) return btns[0].id;
      }
      // Fallback: search all visible B0 buttons near LOGISTICSADDRESSZIPCODE
      const allBtns = Array.from(document.querySelectorAll('td, img, button, a, div'))
        .filter((el) => {
          const h = el as HTMLElement;
          return h.offsetParent !== null && /LOGISTICSADDRESSZIPCODE.*_B0$/.test(el.id);
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
      logger.warn("CAP find button not found in editing row, trying direct input");
      const activeEl = document.activeElement as HTMLInputElement | null;
      await this.page.keyboard.type(deliveryPostalCode, { delay: 20 });
      await this.page.keyboard.press("Tab");
      await this.waitForDevExpressIdle({ timeout: 3000, label: "cap-set-direct" });
    }

    logger.debug("Delivery postal code set, confirming row with UpdateEdit");

    if (altGridName) {
      await this.page.evaluate((name: string) => {
        const w = window as any;
        const grid = w.ASPxClientControl?.GetControlCollection?.()?.GetByName?.(name);
        if (grid) grid.UpdateEdit();
      }, altGridName);
    } else {
      const updateResult = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[data-args*="UpdateEdit"]'),
        ).filter((node) => {
          const el = node as HTMLElement;
          return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
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

    await this.waitForDevExpressIdle({ timeout: 8000, label: "address-update-edit" });
    logger.info("Delivery address row confirmed");
  }

  // ─── Customer CRUD Operations ───────────────────────────────────────

  async createCustomer(
    customerData: import("./types").CustomerFormData,
  ): Promise<string> {
    if (!this.page) throw new Error("Browser page is null");

    logger.info("Creating new customer", { name: customerData.name });

    await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await this.waitForDevExpressReady({ timeout: 10000 });

    const nuovoClicked = await this.clickElementByText("Nuovo", {
      selectors: ["a", "span", "button"],
    });
    if (!nuovoClicked) throw new Error("'Nuovo' button not found");

    await this.emitProgress("customer.navigation");

    await this.page.waitForFunction(
      (baseUrl: string) => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
      config.archibald.url,
    );
    await this.waitForDevExpressReady({ timeout: 10000 });

    await this.emitProgress("customer.edit_loaded");

    logger.info("Customer form loaded, filling fields");

    await this.setDevExpressField(/xaf_dviNAME_Edit_I$/, customerData.name);

    if (customerData.deliveryMode) {
      await this.setDevExpressComboBox(
        /xaf_dviDLVMODE_Edit_dropdown_DD_I$/,
        customerData.deliveryMode,
      );
    }

    if (customerData.vatNumber) {
      await this.setDevExpressField(/xaf_dviVATNUM_Edit_I$/, customerData.vatNumber);
    }

    if (customerData.paymentTerms) {
      await this.selectFromDevExpressLookup(
        /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
        customerData.paymentTerms,
      );
    }

    if (customerData.pec) {
      await this.setDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, customerData.pec);
    }

    if (customerData.sdi) {
      await this.setDevExpressField(/xaf_dviLEGALAUTHORITY_Edit_I$/, customerData.sdi);
    }

    if (customerData.street) {
      await this.setDevExpressField(/xaf_dviSTREET_Edit_I$/, customerData.street);
    }

    await this.emitProgress("customer.field");

    if (customerData.postalCode) {
      await this.selectFromDevExpressLookup(
        /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
        customerData.postalCode,
        customerData.postalCodeCity,
      );
    }

    if (customerData.phone) {
      await this.setDevExpressField(/xaf_dviPHONE_Edit_I$/, customerData.phone);
    }

    if (customerData.email) {
      await this.setDevExpressField(/xaf_dviEMAIL_Edit_I$/, customerData.email);
    }

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
      logger.warn("LINEDISC not found after tab switch, retrying...");
      await this.openCustomerTab("Prezzi e sconti");
      await this.wait(1000);
    }

    await this.setDevExpressComboBox(
      /xaf_dviLINEDISC_Edit_dropdown_DD_I$/,
      customerData.lineDiscount || "N/A",
    );

    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }

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

    await this.waitForDevExpressIdle({ timeout: 5000, label: "get-profile-id" });

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

    logger.info("updateCustomerName: clearing NOME DI RICERCA and setting NOME", { newName });

    const searchNameCleared = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const searchNameInput = inputs.find(
        (i) => /SEARCHNAME.*_Edit_I$|NAMEALIAS.*_Edit_I$/.test(i.id),
      ) as HTMLInputElement | null;

      if (!searchNameInput) {
        const nameInput = inputs.find((i) => /xaf_dviNAME_Edit_I$/.test(i.id));
        if (nameInput) {
          const allVisible = inputs.filter(
            (i) => i.offsetParent !== null && i.type !== "hidden",
          );
          const nameIdx = allVisible.indexOf(nameInput as HTMLInputElement);
          if (nameIdx >= 0 && nameIdx + 1 < allVisible.length) {
            const candidate = allVisible[nameIdx + 1];
            candidate.scrollIntoView({ block: "center" });
            candidate.focus();
            candidate.click();
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )?.set;
            if (setter) setter.call(candidate, "");
            else candidate.value = "";
            candidate.dispatchEvent(new Event("input", { bubbles: true }));
            candidate.dispatchEvent(new Event("change", { bubbles: true }));
            return { cleared: true, id: candidate.id, method: "fallback-next-input" };
          }
        }
        return { cleared: false, id: "", method: "not-found" };
      }

      searchNameInput.scrollIntoView({ block: "center" });
      searchNameInput.focus();
      searchNameInput.click();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(searchNameInput, "");
      else searchNameInput.value = "";
      searchNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchNameInput.dispatchEvent(new Event("change", { bubbles: true }));
      return { cleared: true, id: searchNameInput.id, method: "direct-match" };
    });

    if (searchNameCleared.cleared) {
      await this.page.keyboard.press("Tab");
      await this.waitForDevExpressIdle({ timeout: 5000, label: "clear-searchname" });
      logger.debug("NOME DI RICERCA cleared", searchNameCleared);
    } else {
      logger.warn("NOME DI RICERCA field not found, proceeding without clearing");
    }

    await this.setDevExpressField(/xaf_dviNAME_Edit_I$/, newName + ".");
    await this.page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      document.body.click();
    });
    await this.waitForDevExpressIdle({ timeout: 5000, label: "name-blur-autoupdate" });

    await this.setDevExpressField(/xaf_dviNAME_Edit_I$/, newName);

    logger.info("updateCustomerName completed", { newName });
  }

  async updateCustomer(
    customerProfile: string,
    customerData: import("./types").CustomerFormData,
    originalName?: string,
  ): Promise<void> {
    if (!this.page) throw new Error("Browser page is null");

    const searchName = originalName || customerData.name;
    const fallbackName = searchName !== customerData.name ? customerData.name : null;
    logger.info("Updating customer", { customerProfile, searchName, fallbackName, newName: customerData.name });

    await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    if (this.page.url().includes("Login.aspx")) {
      throw new Error("Sessione scaduta: reindirizzato al login");
    }

    await this.waitForDevExpressReady({ timeout: 10000 });

    await this.emitProgress("customer.navigation");

    const searchAndFindCustomer = async (nameToSearch: string): Promise<{ found: boolean; reason: string; rowCount: number; rowNames?: string[] }> => {
      // Fill search field
      const fieldId = await this.page!.evaluate(
        (name: string) => {
          const inputs = Array.from(document.querySelectorAll("input"));
          const searchInput = inputs.find((i) =>
            /SearchAC.*Ed_I$/.test(i.id),
          ) as HTMLInputElement | null;
          if (!searchInput) return null;

          searchInput.scrollIntoView({ block: "center" });
          searchInput.focus();
          searchInput.click();
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, "value",
          )?.set;
          if (setter) setter.call(searchInput, name);
          else searchInput.value = name;
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
          searchInput.dispatchEvent(new Event("change", { bubbles: true }));
          return searchInput.id;
        },
        nameToSearch,
      );

      if (!fieldId) throw new Error("Search input not found");

      await this.page!.keyboard.press("Enter");
      await this.waitForDevExpressIdle({ timeout: 10000, label: "customer-search" });

      logger.info("Customer search completed", { nameToSearch });

      // Find exact match in filtered results and click Edit
      const result = await this.page!.evaluate(
        (targetName: string) => {
          const nameLower = targetName.trim().toLowerCase();
          const rows = Array.from(
            document.querySelectorAll('tr[class*="dxgvDataRow"]'),
          ).filter((r) => (r as HTMLElement).offsetParent !== null);

          if (rows.length === 0) return { found: false, reason: "no-rows", rowCount: 0 };

          const getCellTexts = (row: Element): string[] => {
            return Array.from(row.querySelectorAll("td")).map((c) => {
              const clone = c.cloneNode(true) as HTMLElement;
              clone.querySelectorAll("script, style").forEach((s) => s.remove());
              return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            }).filter(Boolean);
          };

          for (const row of rows) {
            const cellTexts = getCellTexts(row);
            if (cellTexts.some((t) => t === nameLower)) {
              const editBtn = row.querySelector('img[title="Modifica"], a[data-args*="Edit"]');
              if (editBtn) {
                const target = editBtn.tagName === "IMG"
                  ? editBtn.closest("a") || editBtn
                  : editBtn;
                (target as HTMLElement).click();
                return { found: true, reason: "exact-match", rowCount: rows.length };
              }
            }
          }

          for (const row of rows) {
            const cellTexts = getCellTexts(row);
            if (cellTexts.some((t) => t.includes(nameLower))) {
              const editBtn = row.querySelector('img[title="Modifica"], a[data-args*="Edit"]');
              if (editBtn) {
                const target = editBtn.tagName === "IMG"
                  ? editBtn.closest("a") || editBtn
                  : editBtn;
                (target as HTMLElement).click();
                return { found: true, reason: "contains-match", rowCount: rows.length };
              }
            }
          }

          const sampleTexts = rows.slice(0, 5).map((r) =>
            getCellTexts(r).filter((t) => t.length > 0 && t.length < 100).join(" | "),
          );

          return {
            found: false,
            reason: "no-match",
            rowCount: rows.length,
            rowNames: sampleTexts,
          };
        },
        nameToSearch,
      );

      return result;
    };

    // Try searching with the original name first
    let editResult = await searchAndFindCustomer(searchName);
    logger.info("Customer edit selection (primary)", editResult);

    // Fallback: if not found and we have an alternative name, retry with new name
    if (!editResult.found && fallbackName) {
      logger.info("Primary search failed, retrying with new name", { fallbackName });
      await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
      await this.waitForDevExpressReady({ timeout: 10000 });
      editResult = await searchAndFindCustomer(fallbackName);
      logger.info("Customer edit selection (fallback)", editResult);
    }

    await this.emitProgress("customer.search");

    if (!editResult.found) {
      throw new Error(`Cliente "${searchName}"${fallbackName ? ` e "${fallbackName}"` : ""} non trovato nei risultati (${editResult.reason}, ${editResult.rowCount} righe)`);
    }

    await this.page.waitForFunction(
      () => !window.location.href.includes("ListView"),
      { timeout: 15000, polling: 200 },
    );
    await this.waitForDevExpressReady({ timeout: 10000 });

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
      await this.setDevExpressField(/xaf_dviVATNUM_Edit_I$/, customerData.vatNumber);
    }

    if (customerData.paymentTerms) {
      await this.selectFromDevExpressLookup(
        /xaf_dviPAYMTERMID_Edit_find_Edit_B0/,
        customerData.paymentTerms,
      );
    }

    if (customerData.pec) {
      await this.setDevExpressField(/xaf_dviLEGALEMAIL_Edit_I$/, customerData.pec);
    }

    if (customerData.sdi) {
      await this.setDevExpressField(/xaf_dviLEGALAUTHORITY_Edit_I$/, customerData.sdi);
    }

    if (customerData.street) {
      await this.setDevExpressField(/xaf_dviSTREET_Edit_I$/, customerData.street);
    }

    await this.emitProgress("customer.field");

    if (customerData.postalCode) {
      await this.selectFromDevExpressLookup(
        /xaf_dviLOGISTICSADDRESSZIPCODE_Edit_find_Edit_B0/,
        customerData.postalCode,
        customerData.postalCodeCity,
      );
    }

    if (customerData.phone) {
      await this.setDevExpressField(/xaf_dviPHONE_Edit_I$/, customerData.phone);
    }

    if (customerData.email) {
      await this.setDevExpressField(/xaf_dviEMAIL_Edit_I$/, customerData.email);
    }

    if (customerData.lineDiscount) {
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
        customerData.lineDiscount,
      );
    }

    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }

    await this.emitProgress("customer.save");
    await this.saveAndCloseCustomer();

    logger.info("Customer updated successfully", {
      customerProfile,
      name: customerData.name,
    });

    await this.emitProgress("customer.complete");
  }
}
