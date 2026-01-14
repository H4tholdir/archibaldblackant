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

export class ArchibaldBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;
  private userId: string | null = null;
  private productDb: ProductDatabase;
  private legacySessionCache: SessionCacheManager | null = null;
  private multiUserSessionCache: MultiUserSessionCacheManager | null = null;
  private opSeq = 0;
  private lastOpEndNs: bigint | null = null;
  private hasError = false;
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

    logger.debug(`[OP ${opId} START] ${name}`, { gapMs, ...meta });

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
        meta,
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
        meta,
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
    operations: typeof this.opRecords;
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
      throw new Error(`Failed to select text in field: ${fieldLabel}`);
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

      // Additional stabilization wait
      await this.wait(300);
    } catch {
      // Fallback: just wait fixed time if loading detection fails
      await this.wait(1000);
    }
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

      logger.info(`Bot inizializzato per user ${this.userId} (multi-user mode)`);
    } else {
      // Legacy single-user mode (for backwards compatibility)
      logger.info("Inizializzazione browser Puppeteer (legacy single-user mode)...");

      this.browser = await this.runOp(
        "browser.launch",
        async () => {
          return puppeteer.launch({
            headless: config.puppeteer.headless,
            slowMo: config.puppeteer.slowMo,
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

  async login(): Promise<void> {
    if (!this.page) throw new Error("Browser non inizializzato");

    // Get credentials: use PasswordCache for multi-user, config for legacy
    let username: string;
    let password: string;

    if (this.userId) {
      // Multi-user mode: get password from cache
      const cachedPassword = PasswordCache.getInstance().get(this.userId);
      if (!cachedPassword) {
        throw new Error(`Password not found in cache for user ${this.userId}. User must login again.`);
      }
      // Get username from UserDatabase
      const { UserDatabase } = await import('./user-db');
      const user = UserDatabase.getInstance().getUserById(this.userId);
      if (!user) {
        throw new Error(`User ${this.userId} not found in database`);
      }
      username = user.username;
      password = cachedPassword;
      logger.info(`Using cached credentials for multi-user login`, { userId: this.userId, username });
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
      // Naviga alla pagina di login
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

      logger.debug(`Pagina caricata con status: ${response.status()}`);

      if (response.status() !== 200) {
        throw new Error(
          `Errore HTTP ${response.status()}: ${response.statusText()}`,
        );
      }

      // Aspetta che la pagina sia completamente caricata
      await this.runOp(
        "login.wait_page",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        },
        "login",
      );

      logger.debug("Pagina login caricata, cerco campi username/password...");

      // Cerca i campi di login (DevExpress usa nomi complessi)
      // Dall'analisi HAR sappiamo che il pattern è: Logon$v0_*$MainLayoutEdit$...$dviUserName_Edit

      // Strategia: trova input type=text e type=password visibili
      logger.debug("Cerco campo username...");

      const usernameField = await this.runOp(
        "login.findUsernameField",
        async () =>
          this.page!.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[type="text"]'),
            );

            const userInput = inputs.find(
              (input) =>
                input.id.includes("UserName") ||
                input.name.includes("UserName") ||
                input.placeholder?.toLowerCase().includes("account") ||
                input.placeholder?.toLowerCase().includes("username"),
            );

            if (userInput) {
              return (
                (userInput as HTMLInputElement).id ||
                (userInput as HTMLInputElement).name
              );
            }

            // Fallback: prendi il primo input text visibile
            if (inputs.length > 0) {
              return (
                (inputs[0] as HTMLInputElement).id ||
                (inputs[0] as HTMLInputElement).name
              );
            }

            return null;
          }),
        "login",
      );

      logger.debug("Cerco campo password...");

      const passwordField = await this.runOp(
        "login.findPasswordField",
        async () =>
          this.page!.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[type="password"]'),
            );

            if (inputs.length > 0) {
              const pwdField =
                (inputs[0] as HTMLInputElement).id ||
                (inputs[0] as HTMLInputElement).name;
              return pwdField;
            }
            return null;
          }),
        "login",
      );

      if (!usernameField || !passwordField) {
        // Salva screenshot per debug
        await this.page.screenshot({ path: "logs/login-error.png" });
        logger.error("Screenshot salvato in logs/login-error.png");

        throw new Error("Campi login non trovati nella pagina");
      }

      logger.debug("Campi trovati", { usernameField, passwordField });

      // Compila username (svuota prima eventuali valori esistenti)
      await this.runOp(
        "login.typeUsername",
        async () => {
          const usernameSelector = `#${usernameField}`;
          // Seleziona tutto il testo esistente e sostituiscilo
          await this.page!.click(usernameSelector, { clickCount: 3 });
          await this.page!.keyboard.press("Backspace");
          await this.page!.type(usernameSelector, username, {
            delay: 50,
          });
        },
        "login",
        { field: usernameField },
      );
      logger.debug("Username inserito");

      // Compila password (svuota prima eventuali valori esistenti)
      await this.runOp(
        "login.typePassword",
        async () => {
          const passwordSelector = `#${passwordField}`;
          // Seleziona tutto il testo esistente e sostituiscilo
          await this.page!.click(passwordSelector, { clickCount: 3 });
          await this.page!.keyboard.press("Backspace");
          await this.page!.type(passwordSelector, password, {
            delay: 50,
          });
        },
        "login",
        { field: passwordField },
      );
      logger.debug("Password inserita");

      // Cerca e clicca pulsante login
      const loginButtonClicked = await this.runOp(
        "login.clickLoginButton",
        async () =>
          this.page!.evaluate(() => {
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
          }),
        "login",
      );

      if (!loginButtonClicked) {
        // Fallback: premi Enter sul campo password
        await this.runOp(
          "login.submitFallback",
          async () => {
            await this.page!.keyboard.press("Enter");
          },
          "login",
        );
      }

      logger.debug("Pulsante login cliccato, attendo redirect...");

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

      if (
        currentUrl.includes("Default.aspx") ||
        !currentUrl.includes("Login.aspx")
      ) {
        logger.info("Login riuscito!", { url: currentUrl });

        // Save session cookies to persistent cache
        const cookies = await this.page.cookies();

        if (this.userId && this.multiUserSessionCache) {
          // Multi-user mode: save to per-user cache
          await this.multiUserSessionCache.saveSession(this.userId, cookies);
        } else if (this.legacySessionCache) {
          // Legacy single-user mode
          this.legacySessionCache.saveSession(cookies);
        }
      } else {
        throw new Error("Login fallito: ancora sulla pagina di login");
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
  async loginWithCredentials(username: string, password: string): Promise<boolean> {
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
        logger.warn("Login page not accessible", { status: response?.status() });
        return false;
      }

      // Wait for page to load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Find username field
      const usernameField = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const userInput = inputs.find(
          (input) =>
            input.id.includes("UserName") ||
            input.name.includes("UserName") ||
            input.placeholder?.toLowerCase().includes("account") ||
            input.placeholder?.toLowerCase().includes("username"),
        );
        if (userInput) {
          return (userInput as HTMLInputElement).id || (userInput as HTMLInputElement).name;
        }
        if (inputs.length > 0) {
          return (inputs[0] as HTMLInputElement).id || (inputs[0] as HTMLInputElement).name;
        }
        return null;
      });

      // Find password field
      const passwordField = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        if (inputs.length > 0) {
          return (inputs[0] as HTMLInputElement).id || (inputs[0] as HTMLInputElement).name;
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
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
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
      if (currentUrl.includes("Default.aspx") || !currentUrl.includes("Login.aspx")) {
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
   * @returns Order ID
   */
  async createOrder(orderData: OrderData): Promise<string> {
    if (!this.page) throw new Error("Browser non inizializzato");

    logger.info("🤖 BOT: INIZIO creazione ordine", {
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      items: orderData.items.map((item) => ({
        name: item.articleCode,
        qty: item.quantity,
      })),
    });

    let orderId = "";

    try {
      // STEP 1: Click "Ordini" in left menu
      await this.runOp(
        "order.menu.ordini",
        async () => {
          logger.debug('Clicking "Ordini" menu item...');

          const clicked = await this.clickElementByText("Ordini", {
            exact: true,
            selectors: ["a", "span", "div", "td"],
          });

          if (!clicked) {
            throw new Error('Menu "Ordini" not found');
          }

          // Wait for orders list page
          await this.page!.waitForFunction(
            () => {
              const elements = Array.from(
                document.querySelectorAll("span, button, a"),
              );
              return elements.some(
                (el) => el.textContent?.trim().toLowerCase() === "nuovo",
              );
            },
            { timeout: 5000 },
          );

          logger.info("✅ Navigated to orders list");
        },
        "navigation.ordini",
      );

      // STEP 2: Click "Nuovo" button
      await this.runOp(
        "order.click_nuovo",
        async () => {
          logger.debug('Clicking "Nuovo" button...');

          const clicked = await this.clickElementByText("Nuovo", {
            exact: true,
            selectors: ["button", "a", "span"],
          });

          if (!clicked) {
            throw new Error('Button "Nuovo" not found');
          }

          await this.waitForDevExpressReady({ timeout: 5000 });
          logger.info("✅ Order form loaded");
        },
        "navigation.form",
      );

      // STEP 3: Select customer via "Profilo cliente" dropdown
      await this.runOp(
        "order.customer.select",
        async () => {
          logger.debug('Opening "Profilo cliente" dropdown...');

          // OPT-12: Immediate check (eliminate wait for already-present elements)
          // Try immediate synchronous check first, then mutation polling if not found
          logger.debug("Finding customer field...");

          // First: Immediate synchronous check (no wait if element already exists)
          let customerInputId = await this.page!.evaluate(() => {
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
            });
            return customerInput
              ? (customerInput as HTMLInputElement).id
              : null;
          });

          // If not found immediately, use mutation polling to wait for it
          if (!customerInputId) {
            logger.debug("Field not ready, using mutation polling...");
            customerInputId = (await this.page!.waitForFunction(
              () => {
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
                });
                return customerInput
                  ? (customerInput as HTMLInputElement).id
                  : null;
              },
              { timeout: 3000, polling: "mutation" },
            ).then((result) => result.jsonValue())) as string;
          } else {
            logger.debug("✓ Field found immediately (no wait needed)");
          }

          if (!customerInputId) {
            throw new Error("Customer input field not found");
          }

          logger.debug(`✓ Customer field: ${customerInputId}`);

          // Extract base ID (remove _I suffix if present)
          const customerBaseId = customerInputId.endsWith("_I")
            ? customerInputId.slice(0, -2)
            : customerInputId;

          logger.debug(`Customer base ID: ${customerBaseId}`);

          // Try multiple dropdown button selectors based on base ID
          const dropdownSelectors = [
            `#${customerBaseId}_B-1`,
            `#${customerBaseId}_B-1Img`,
            `#${customerBaseId}_B`,
            `#${customerBaseId}_DDD`,
            `#${customerBaseId}_DropDown`,
          ];

          let dropdownOpened = false;
          for (const selector of dropdownSelectors) {
            const handle = await this.page!.$(selector);
            if (!handle) continue;
            const box = await handle.boundingBox();
            if (!box) continue;
            await handle.click();
            dropdownOpened = true;
            logger.debug(`✓ Dropdown clicked: ${selector}`);
            break;
          }

          if (!dropdownOpened) {
            throw new Error(
              `Dropdown button not found for customer field ${customerBaseId}`,
            );
          }

          // OPT-05: Event-driven wait for search input (eliminate fixed wait)
          // Find search input using specific DevExpress ID pattern
          const searchInputSelectors = [
            `#${customerBaseId}_DDD_gv_DXSE_I`, // DevExpress standard pattern
            'input[placeholder*="enter text to search" i]', // Generic fallback
          ];

          let searchInput = null;
          let foundSelector: string | null = null;

          // Wait for search input with waitForFunction (no fixed wait needed)
          logger.debug("Waiting for search input to appear...");
          try {
            const result = await this.page!.waitForFunction(
              (selectors: string[]) => {
                for (const sel of selectors) {
                  const input = document.querySelector(
                    sel,
                  ) as HTMLInputElement | null;
                  if (
                    input &&
                    input.offsetParent !== null &&
                    !input.disabled &&
                    !input.readOnly
                  ) {
                    return sel;
                  }
                }
                return null;
              },
              { timeout: 3000, polling: 50 }, // Increased timeout for reliability
              searchInputSelectors,
            );

            foundSelector = (await result.jsonValue()) as string | null;
            if (foundSelector) {
              searchInput = await this.page!.$(foundSelector);
              logger.debug(`✓ Search input found: ${foundSelector}`);
            }
          } catch (error) {
            // Fallback: try each selector
            for (const selector of searchInputSelectors) {
              const input = await this.page!.$(selector);
              if (input) {
                const isVisible = await input.evaluate(
                  (el) => (el as HTMLElement).offsetParent !== null,
                );
                if (isVisible) {
                  searchInput = input;
                  foundSelector = selector;
                  logger.debug(`✓ Search input found (fallback): ${selector}`);
                  break;
                }
              }
            }
          }

          if (!searchInput || !foundSelector) {
            const screenshotPath = `logs/search-input-not-found-${Date.now()}.png`;
            await this.page!.screenshot({
              path: screenshotPath,
              fullPage: true,
            });
            throw new Error(
              `Search input not found in dropdown. Tried: ${searchInputSelectors.join(", ")}`,
            );
          }

          // Use paste method (much faster than typing character by character)
          logger.debug(`Pasting search value: ${orderData.customerName}`);
          logger.debug(`Using input handle`);

          // OPT-06: Use paste helper with event-driven verification (no fixed wait)
          await this.pasteText(searchInput, orderData.customerName);
          logger.debug("Finished pasting customer name");

          // Event-driven: Wait for value to be present in input (no fixed wait)
          const actualValue = (await this.page!.waitForFunction(
            (selector: string, expectedValue: string) => {
              const input = document.querySelector(
                selector,
              ) as HTMLInputElement;
              return input && input.value === expectedValue
                ? input.value
                : null;
            },
            { timeout: 1000, polling: 50 },
            foundSelector,
            orderData.customerName,
          ).then((result) => result.jsonValue())) as string;

          logger.debug(`✓ Value verified in input: "${actualValue}"`);

          if (actualValue !== orderData.customerName) {
            logger.warn(
              `Value mismatch! Expected "${orderData.customerName}", got "${actualValue}"`,
            );
          }

          // Press Enter to trigger search
          await this.page!.keyboard.press("Enter");
          logger.debug("Pressed Enter, checking for filtered results...");

          // OPT-12: Immediate check for filtered results
          let stableRowCount = 0;
          try {
            // First: Immediate synchronous check (results might already be visible)
            stableRowCount = await this.page!.evaluate(() => {
              const rows = Array.from(
                document.querySelectorAll('tr[class*="dxgvDataRow"]'),
              );
              const visibleRows = rows.filter((row) => {
                const el = row as HTMLElement;
                return (
                  el.offsetParent !== null &&
                  el.getBoundingClientRect().height > 0
                );
              });
              return visibleRows.length;
            });

            // OPT-15: If no rows found immediately, wait and click in one operation
            if (stableRowCount === 0) {
              logger.debug(
                "Results not ready, waiting and will click immediately...",
              );
              const clicked = (await this.page!.waitForFunction(
                () => {
                  const rows = Array.from(
                    document.querySelectorAll('tr[class*="dxgvDataRow"]'),
                  );
                  const visibleRows = rows.filter((row) => {
                    const el = row as HTMLElement;
                    return (
                      el.offsetParent !== null &&
                      el.getBoundingClientRect().height > 0
                    );
                  });

                  if (visibleRows.length > 0) {
                    // Click immediately when first row appears
                    const firstRow = visibleRows[0] as HTMLElement;
                    const firstCell = firstRow.querySelector(
                      "td",
                    ) as HTMLElement;
                    const clickTarget = firstCell || firstRow;
                    clickTarget.click();
                    return true;
                  }
                  return false;
                },
                { timeout: 2000, polling: "mutation" },
              ).then((result) => result.jsonValue())) as boolean;

              if (!clicked) {
                throw new Error("Failed to click customer row");
              }
              logger.debug(`✓ Results appeared and clicked immediately`);
            } else {
              // Results already visible, click directly
              logger.debug(
                `✓ Results found immediately: ${stableRowCount} row(s), clicking now...`,
              );
              const clickResult = await this.page!.evaluate(() => {
                const rows = Array.from(
                  document.querySelectorAll('tr[class*="dxgvDataRow"]'),
                );
                const visibleRows = rows.filter((row) => {
                  const el = row as HTMLElement;
                  return (
                    el.offsetParent !== null &&
                    el.getBoundingClientRect().height > 0
                  );
                });

                if (visibleRows.length === 0) {
                  return false;
                }

                const firstRow = visibleRows[0] as HTMLElement;
                const firstCell = firstRow.querySelector("td") as HTMLElement;
                const clickTarget = firstCell || firstRow;
                clickTarget.click();
                return true;
              });

              if (!clickResult) {
                throw new Error(
                  `No customer results found for: ${orderData.customerName}`,
                );
              }
            }

            logger.debug("✓ Customer selected");
          } catch (err) {
            logger.warn("Row click failed, attempting fallback...");
            // Fallback: try Puppeteer handle click
            const rows = await this.page!.$$('tr[class*="dxgvDataRow"]');
            if (rows.length > 0) {
              const firstCell = await rows[0].$("td");
              const clickTarget = firstCell || rows[0];
              await clickTarget.click();
              logger.debug("✓ Customer selected via fallback");
            } else {
              throw new Error(
                `No customer results found for: ${orderData.customerName}`,
              );
            }
          }

          // OPT-05: Event-driven wait for dropdown to close and customer data to load
          // Instead of fixed wait, check for dropdown disappearance and line items grid readiness
          logger.debug("Waiting for customer data to load...");
          try {
            // Wait for dropdown panel to disappear
            await this.page!.waitForFunction(
              () => {
                // Check if dropdown panel is gone
                const dropdownPanels = Array.from(
                  document.querySelectorAll('[id*="_DDD_PW"]'),
                );
                const visiblePanels = dropdownPanels.filter(
                  (panel) =>
                    (panel as HTMLElement).offsetParent !== null &&
                    (panel as HTMLElement).style.display !== "none",
                );
                return visiblePanels.length === 0;
              },
              { timeout: 2000, polling: 100 },
            );
            logger.debug("✅ Dropdown closed");
          } catch (err) {
            logger.debug("Dropdown close check timed out, proceeding...");
          }

          logger.info(`✅ Customer selected: ${orderData.customerName}`);
          await this.waitForDevExpressReady({ timeout: 3000 });
        },
        "form.customer",
      );

      // STEP 4: Click "New" button in Linee di vendita
      await this.runOp(
        "order.lineditems.click_new",
        async () => {
          logger.debug('Clicking "New" in Linee di vendita...');

          // Wait for line items grid to be fully loaded
          await this.wait(1000);

          // Look for DevExpress "New" button in sales lines grid
          // Pattern: <a class="dxbButton_XafTheme" with <img title="New">
          const buttonInfo = await this.page!.evaluate(() => {
            // Strategy 1: Find by data-args containing 'AddNew'
            const buttons = Array.from(
              document.querySelectorAll('a[data-args*="AddNew"]'),
            );
            if (buttons.length > 0) {
              const button = buttons[0] as HTMLElement;
              return {
                found: true,
                strategy: 1,
                id: button.id || "no-id",
                selector: 'a[data-args*="AddNew"]',
              };
            }

            // Strategy 2: Find img with title="New" and src containing "Action_Inline_New"
            const images = Array.from(
              document.querySelectorAll('img[title="New"]'),
            );
            for (const img of images) {
              const src = (img as HTMLImageElement).src || "";
              if (src.includes("Action_Inline_New")) {
                const parent = img.parentElement;
                if (parent && parent.tagName === "A") {
                  return {
                    found: true,
                    strategy: 2,
                    id: parent.id || "no-id",
                    selector: 'img[title="New"] parent',
                  };
                }
              }
            }

            // Strategy 3: Find by ID pattern containing "SALESLINEs" and "DXCBtn"
            const allLinks = Array.from(
              document.querySelectorAll("a.dxbButton_XafTheme"),
            );
            for (const link of allLinks) {
              const id = link.id || "";
              if (id.includes("SALESLINEs") && id.includes("DXCBtn")) {
                return {
                  found: true,
                  strategy: 3,
                  id: id,
                  selector: "a.dxbButton_XafTheme with SALESLINEs",
                };
              }
            }

            return { found: false };
          });

          if (!buttonInfo.found) {
            await this.page!.screenshot({
              path: `logs/new-button-not-found-${Date.now()}.png`,
              fullPage: true,
            });
            throw new Error('Button "New" in line items not found');
          }

          logger.debug(
            `Found "New" button using strategy ${buttonInfo.strategy}`,
            {
              id: buttonInfo.id,
              selector: buttonInfo.selector,
            },
          );

          // Use Puppeteer click instead of JavaScript click for more reliable interaction
          let buttonHandle = null;

          if (buttonInfo.strategy === 1) {
            buttonHandle = await this.page!.$('a[data-args*="AddNew"]');
          } else if (buttonInfo.strategy === 2) {
            const imgHandle = await this.page!.$(
              'img[title="New"][src*="Action_Inline_New"]',
            );
            if (imgHandle) {
              buttonHandle = await imgHandle.evaluateHandle(
                (img) => img.parentElement,
              );
            }
          } else if (buttonInfo.strategy === 3) {
            buttonHandle = await this.page!.$(`#${buttonInfo.id}`);
          }

          if (!buttonHandle) {
            throw new Error(
              "Found button in evaluate but could not get handle",
            );
          }

          // Ensure button is visible and scroll into view
          await buttonHandle.evaluate((el) => {
            (el as HTMLElement).scrollIntoView({ block: "center" });
          });
          await this.wait(300);

          // OPT-10: Remove debug screenshots (save I/O time)
          // Click the button
          await buttonHandle.click();
          logger.debug("New button clicked, waiting for row...");

          // OPT-04: Event-driven waiting for grid row insertion
          // Wait for DevExpress to insert new row with article input field (event-based with fallback)
          try {
            await this.page!.waitForFunction(
              () => {
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
              },
              { timeout: 3000 }, // Fallback timeout (was 1500ms fixed wait)
            );
            logger.debug("✅ New row detected via event-driven waiting");
          } catch (err) {
            logger.warn(
              "Event-driven wait timed out, verifying row presence manually",
            );
          }

          // Final verification that row appeared
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
              'New row did not appear after clicking "New" button',
            );
          }

          logger.info("✅ New line item row created and verified");
        },
        "form.multi_article",
      );

      // STEP 5-8: For each item, add article with package selection
      for (let i = 0; i < orderData.items.length; i++) {
        const item = orderData.items[i];

        logger.info(`Processing item ${i + 1}/${orderData.items.length}`, {
          articleCode: item.articleCode,
          quantity: item.quantity,
        });

        // 5.1: Query database for correct package variant
        await this.runOp(
          `order.item.${i}.select_variant`,
          async () => {
            const selectedVariant = this.productDb.selectPackageVariant(
              item.articleCode,
              item.quantity,
            );

            if (!selectedVariant) {
              throw new Error(
                `Article ${item.articleCode} not found in database. ` +
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

        // 5.2: Open "Nome articolo" dropdown (GRID CELL APPROACH)
        await this.runOp(
          `order.item.${i}.open_article_dropdown`,
          async () => {
            logger.debug("Looking for article dropdown in grid cell...");

            // Wait for grid to be ready
            await this.wait(1000);

            // In DevExpress grids, dropdowns in edit mode work differently
            // Strategy 1: Find the table cell for "NOME ARTICOLO" column and click it
            // Strategy 2: Look for the dropdown with "N/A" value (default for empty article)

            const articleDropdownInfo = await this.page!.evaluate(() => {
              // Look for all visible dropdown inputs in the grid
              const inputs = Array.from(
                document.querySelectorAll('input[type="text"]'),
              );

              // Strategy 1: Find by column pattern - look for ITEMID specifically
              const itemIdInput = inputs.find((input) => {
                const id = (input as HTMLInputElement).id.toLowerCase();
                const value = (input as HTMLInputElement).value;
                // ITEMID is the article code column, typically shows N/A when empty
                return (
                  id.includes("itemid") &&
                  id.includes("salesline") &&
                  (input as HTMLElement).offsetParent !== null
                );
              });

              if (itemIdInput) {
                return {
                  found: true,
                  strategy: "itemid",
                  id: (itemIdInput as HTMLInputElement).id,
                  value: (itemIdInput as HTMLInputElement).value,
                };
              }

              // Strategy 2: Find by value "N/A" in the grid (common default for empty article)
              const naInput = inputs.find((input) => {
                const value = (input as HTMLInputElement).value;
                const id = (input as HTMLInputElement).id.toLowerCase();
                return (
                  value === "N/A" &&
                  id.includes("salesline") &&
                  !id.includes("linenum") && // Exclude line number field
                  (input as HTMLElement).offsetParent !== null
                );
              });

              if (naInput) {
                return {
                  found: true,
                  strategy: "na-value",
                  id: (naInput as HTMLInputElement).id,
                  value: (naInput as HTMLInputElement).value,
                };
              }

              // Strategy 3: Look for first editable field in SALESLINES that is NOT LINENUM
              const firstEditableInGrid = inputs.find((input) => {
                const id = (input as HTMLInputElement).id.toLowerCase();
                const value = (input as HTMLInputElement).value;
                return (
                  id.includes("salesline") &&
                  id.includes("editnew") &&
                  !id.includes("linenum") && // Skip line number
                  !id.includes("qty") && // Skip quantity (we'll handle that later)
                  !id.includes("price") && // Skip price
                  !id.includes("discount") && // Skip discount
                  (input as HTMLElement).offsetParent !== null &&
                  !(input as HTMLInputElement).readOnly
                );
              });

              if (firstEditableInGrid) {
                return {
                  found: true,
                  strategy: "first-editable",
                  id: (firstEditableInGrid as HTMLInputElement).id,
                  value: (firstEditableInGrid as HTMLInputElement).value,
                };
              }

              return { found: false };
            });

            if (!articleDropdownInfo.found) {
              await this.page!.screenshot({
                path: `logs/article-dropdown-not-found-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error("Article dropdown not found in grid");
            }

            logger.debug(
              `Found article dropdown using strategy: ${articleDropdownInfo.strategy}`,
              {
                id: articleDropdownInfo.id,
                value: articleDropdownInfo.value,
              },
            );

            // Store for later use
            const articleInputId = articleDropdownInfo.id;
            const articleBaseId = articleInputId.endsWith("_I")
              ? articleInputId.slice(0, -2)
              : articleInputId;

            // Click the dropdown button
            const dropdownSelectors = [
              `#${articleBaseId}_B-1`, // Standard DevExpress dropdown button
              `#${articleBaseId}_B-1Img`,
              `#${articleBaseId}_B`,
              `#${articleBaseId}_DDD_B-1`, // Alternative pattern
            ];

            let dropdownOpened = false;
            for (const selector of dropdownSelectors) {
              const handle = await this.page!.$(selector);
              if (!handle) continue;
              const box = await handle.boundingBox();
              if (!box) continue;

              // Scroll into view
              await handle.evaluate((el) => {
                (el as HTMLElement).scrollIntoView({ block: "center" });
              });
              await this.wait(200);

              await handle.click();
              dropdownOpened = true;
              logger.debug(`✓ Article dropdown clicked: ${selector}`);
              break;
            }

            if (!dropdownOpened) {
              // Try clicking the input field directly (might open dropdown)
              const inputHandle = await this.page!.$(`#${articleInputId}`);
              if (inputHandle) {
                logger.debug("Trying to click input field directly...");
                await inputHandle.click();
                await this.wait(500);

                // Check if dropdown appeared
                const dropdownAppeared = await this.page!.evaluate(() => {
                  const dropdowns = Array.from(
                    document.querySelectorAll('[class*="dxeListBox"]'),
                  );
                  return dropdowns.some(
                    (d) => (d as HTMLElement).offsetParent !== null,
                  );
                });

                if (dropdownAppeared) {
                  dropdownOpened = true;
                  logger.debug("✓ Dropdown opened by clicking input");
                }
              }
            }

            if (!dropdownOpened) {
              await this.page!.screenshot({
                path: `logs/article-dropdown-button-not-found-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error(
                `Article dropdown button not found for field ${articleBaseId}`,
              );
            }

            await this.wait(800);
            logger.info("✅ Article dropdown opened");
          },
          "form.article",
        );

        // 5.3: Search by ARTICLE NAME (not variant ID)
        await this.runOp(
          `order.item.${i}.search_article`,
          async () => {
            const selectedVariant = (item as any)._selectedVariant;
            // IMPORTANT: Search by article name/code, not variant ID
            // The variant ID is used to SELECT from results, not to search
            const searchTerm = item.articleCode; // Use article code like "10839.314.016"
            logger.debug(
              `Searching for article: ${searchTerm} (will select variant: ${selectedVariant.id})`,
            );

            // Find article field using same strategy as dropdown opening
            const articleInputId = await this.page!.evaluate(() => {
              const inputs = Array.from(
                document.querySelectorAll('input[type="text"]'),
              );

              // Strategy 1: INVENTTABLE (article inventory table field)
              const inventTableInput = inputs.find((input) => {
                const id = (input as HTMLInputElement).id.toLowerCase();
                return (
                  id.includes("inventtable") &&
                  id.includes("salesline") &&
                  (input as HTMLElement).offsetParent !== null
                );
              });

              if (inventTableInput) {
                return (inventTableInput as HTMLInputElement).id;
              }

              // Strategy 2: ITEMID
              const itemIdInput = inputs.find((input) => {
                const id = (input as HTMLInputElement).id.toLowerCase();
                return (
                  id.includes("itemid") &&
                  id.includes("salesline") &&
                  (input as HTMLElement).offsetParent !== null
                );
              });

              if (itemIdInput) {
                return (itemIdInput as HTMLInputElement).id;
              }

              // Strategy 3: N/A value (fallback)
              const naInput = inputs.find((input) => {
                const value = (input as HTMLInputElement).value;
                const id = (input as HTMLInputElement).id.toLowerCase();
                return (
                  value === "N/A" &&
                  id.includes("salesline") &&
                  !id.includes("linenum") &&
                  (input as HTMLElement).offsetParent !== null
                );
              });

              return naInput ? (naInput as HTMLInputElement).id : null;
            });

            if (!articleInputId) {
              await this.page!.screenshot({
                path: `logs/article-input-not-found-search-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error("Article input not found for search");
            }

            logger.debug(`Found article input for search: ${articleInputId}`);

            const articleBaseId = articleInputId.endsWith("_I")
              ? articleInputId.slice(0, -2)
              : articleInputId;

            // Find search input using DevExpress pattern
            const searchInputSelectors = [
              `#${articleBaseId}_DDD_gv_DXSE_I`,
              'input[placeholder*="enter text to search" i]',
            ];

            let searchInput = null;
            let foundSelector: string | null = null;

            // Try to find search input
            try {
              const result = await this.page!.waitForFunction(
                (selectors: string[]) => {
                  for (const sel of selectors) {
                    const input = document.querySelector(
                      sel,
                    ) as HTMLInputElement | null;
                    if (
                      input &&
                      input.offsetParent !== null &&
                      !input.disabled &&
                      !input.readOnly
                    ) {
                      return sel;
                    }
                  }
                  return null;
                },
                { timeout: 800, polling: 50 },
                searchInputSelectors,
              );

              foundSelector = (await result.jsonValue()) as string | null;
              if (foundSelector) {
                searchInput = await this.page!.$(foundSelector);
                logger.debug(`✓ Article search input found: ${foundSelector}`);
              }
            } catch (error) {
              // Fallback
              for (const selector of searchInputSelectors) {
                const input = await this.page!.$(selector);
                if (input) {
                  const isVisible = await input.evaluate(
                    (el) => (el as HTMLElement).offsetParent !== null,
                  );
                  if (isVisible) {
                    searchInput = input;
                    foundSelector = selector;
                    logger.debug(
                      `✓ Article search input found (fallback): ${selector}`,
                    );
                    break;
                  }
                }
              }
            }

            if (!searchInput) {
              await this.page!.screenshot({
                path: `logs/article-search-input-not-found-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error(
                `Article search input not found. Tried: ${searchInputSelectors.join(", ")}`,
              );
            }

            // Use paste method (much faster than typing character by character)
            logger.debug(`Pasting article code: ${searchTerm}`);
            await this.pasteText(searchInput, searchTerm);
            logger.debug("Finished pasting article code");

            // OPT-06: Event-driven verification of paste (no fixed wait)
            const actualValue = (await this.page!.waitForFunction(
              (selector: string, expectedValue: string) => {
                const input = document.querySelector(
                  selector,
                ) as HTMLInputElement;
                return input && input.value === expectedValue
                  ? input.value
                  : null;
              },
              { timeout: 1000, polling: 50 },
              foundSelector,
              searchTerm,
            ).then((result) => result.jsonValue())) as string;

            logger.debug(`✓ Article code verified in input: "${actualValue}"`);

            // Press Enter
            await this.page!.keyboard.press("Enter");
            logger.debug("Pressed Enter, waiting for article results...");
            await this.wait(2000);

            // OPT-10: Remove debug screenshot (save I/O time)
            // Check if results appeared by looking for table rows with article data
            // The dropdown shows results as table rows with cells containing article parts
            const resultsAppeared = await this.page!.evaluate(() => {
              // Look for tables with visible rows containing article data
              const tables = Array.from(document.querySelectorAll("table"));
              for (const table of tables) {
                if ((table as HTMLElement).offsetParent === null) continue;

                const rows = Array.from(table.querySelectorAll("tr"));
                // Check if any row has multiple cells with text content
                for (const row of rows) {
                  const cells = Array.from(row.querySelectorAll("td"));
                  if (cells.length >= 3) {
                    // Check if cells have content (not just "No data to display")
                    const hasContent = cells.some((cell) => {
                      const text = cell.textContent?.trim() || "";
                      return text.length > 0 && text !== "No data to display";
                    });
                    if (hasContent) {
                      return true; // Found results table
                    }
                  }
                }
              }
              return false;
            });

            if (!resultsAppeared) {
              await this.page!.screenshot({
                path: `logs/article-results-not-found-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error("Article results did not appear after search");
            }

            await this.wait(800);
            logger.info("✅ Article results loaded and displayed");
          },
          "form.article",
        );

        // 5.4: Select article variant row (with pagination support)
        await this.runOp(
          `order.item.${i}.select_article`,
          async () => {
            const selectedVariant = (item as any)._selectedVariant;

            // For article dropdowns, the variant ID appears as partial suffix
            // Example: "005159K3" appears as "K3" in the dropdown
            // Row structure: [10839, 314, 016, icon, 1, K3, 10839.314.016, 1,00]
            // We need to extract the suffix (K3, K2, etc.) from the variant ID
            const variantSuffix = selectedVariant.id.substring(
              selectedVariant.id.length - 2,
            );
            logger.debug(
              `Selecting variant by suffix: ${variantSuffix} (from ${selectedVariant.id})`,
            );

            // Pagination support: loop through pages until variant found
            let rowSelected = false;
            let currentPage = 1;
            const maxPages = 10; // Safety limit to prevent infinite loops

            while (!rowSelected && currentPage <= maxPages) {
              logger.debug(`Searching for variant on page ${currentPage}...`);

              // Try to find and select the row on current page
              rowSelected = await this.page!.evaluate(
                (variantSuffix, packageContent) => {
                  // Find all visible rows with dxgvDataRow class
                  const rows = Array.from(
                    document.querySelectorAll('tr[class*="dxgvDataRow"]'),
                  );
                  const visibleRows = rows.filter(
                    (row) => (row as HTMLElement).offsetParent !== null,
                  );

                  // Primary strategy: Find row by package content alone
                  // The dropdown shows: [part1, part2, part3, icon, packageQty, variantCode, fullCode, price]
                  // We match on packageQty (column 4) which is most reliable
                  for (const row of visibleRows) {
                    const cells = Array.from(row.querySelectorAll("td"));
                    if (cells.length < 6) continue;

                    const cellTexts = cells.map(
                      (cell) => cell.textContent?.trim() || "",
                    );

                    // Look for packageContent in the cells (typically column 4)
                    // Package content appears as a standalone number like "1", "5", "10"
                    const packageStr = String(packageContent);
                    const hasPackageMatch = cellTexts.some((text, index) => {
                      // Check columns 3-5 for package content (flexible matching)
                      if (index >= 3 && index <= 5) {
                        return text === packageStr;
                      }
                      return false;
                    });

                    if (hasPackageMatch) {
                      // Found a row with matching package content
                      // If there's only one match, use it. If multiple, prefer the one with variant suffix match
                      const hasVariantMatch = cellTexts.some(
                        (text) => text === variantSuffix,
                      );

                      // Click this row if package matches (variant check is secondary)
                      const firstCell = cells[0];
                      if (firstCell) {
                        (firstCell as HTMLElement).click();
                        return true;
                      }
                    }
                  }

                  return false;
                },
                variantSuffix,
                selectedVariant.packageContent,
              );

              if (rowSelected) {
                logger.info(`✅ Variant found on page ${currentPage}`);
                break;
              }

              // Row not found on current page, check if there's a next page
              logger.debug(`Variant not found on page ${currentPage}, checking for next page...`);

              const nextPageInfo = await this.page!.evaluate(() => {
                // Look for DevExpress pagination controls
                // Pattern from user: <a class="dxp-button dxp-bi" onclick="ASPx.GVPagerOnClick(...)">
                //                      <img class="dxWeb_pNext_XafTheme" alt="Next">

                // Strategy 1: Find img with alt="Next" or class containing "pNext"
                const images = Array.from(document.querySelectorAll('img'));
                for (const img of images) {
                  const alt = img.getAttribute('alt') || "";
                  const className = img.className || "";

                  // Check for Next image (DevExpress pattern)
                  if (alt === "Next" || className.includes("pNext")) {
                    const parent = img.parentElement;
                    if (parent && parent.offsetParent !== null) {
                      // Check if parent button is disabled
                      const parentClass = parent.className || "";
                      const isDisabled = parentClass.includes('dxp-disabled') ||
                                       parentClass.includes('disabled');

                      if (!isDisabled) {
                        return {
                          hasNextPage: true,
                          buttonElement: true,
                          isImage: true,
                          id: parent.id
                        };
                      }
                    }
                  }
                }

                // Strategy 2: Find link/button with dxp-button class and PBN onclick
                const allButtons = Array.from(document.querySelectorAll('a.dxp-button, button.dxp-button'));
                for (const btn of allButtons) {
                  const onclick = (btn as HTMLElement).getAttribute('onclick') || "";
                  const className = (btn as HTMLElement).className || "";

                  // Check for "PBN" (Page Button Next) in onclick
                  const isNextButton = onclick.includes("'PBN'") || onclick.includes('"PBN"');

                  // Make sure it's not disabled
                  const isDisabled = className.includes('dxp-disabled') ||
                                   className.includes('disabled');

                  if (isNextButton && !isDisabled && (btn as HTMLElement).offsetParent !== null) {
                    return {
                      hasNextPage: true,
                      buttonElement: true,
                      className: className,
                      id: (btn as HTMLElement).id
                    };
                  }
                }

                return {
                  hasNextPage: false
                };
              });

              if (!nextPageInfo.hasNextPage) {
                logger.debug("No next page button found, article not in results");
                break;
              }

              // Click next page button
              logger.debug("Found next page button, navigating to next page...");

              const nextPageClicked = await this.page!.evaluate(() => {
                // Strategy 1: Find img with alt="Next" and click parent
                const images = Array.from(document.querySelectorAll('img'));
                for (const img of images) {
                  const alt = img.getAttribute('alt') || "";
                  const className = img.className || "";

                  if (alt === "Next" || className.includes("pNext")) {
                    const parent = img.parentElement;
                    if (parent && parent.offsetParent !== null) {
                      const parentClass = parent.className || "";
                      const isDisabled = parentClass.includes('dxp-disabled') ||
                                       parentClass.includes('disabled');

                      if (!isDisabled) {
                        (parent as HTMLElement).click();
                        return true;
                      }
                    }
                  }
                }

                // Strategy 2: Find button with PBN onclick
                const allButtons = Array.from(document.querySelectorAll('a.dxp-button, button.dxp-button'));
                for (const btn of allButtons) {
                  const onclick = (btn as HTMLElement).getAttribute('onclick') || "";
                  const className = (btn as HTMLElement).className || "";

                  const isNextButton = onclick.includes("'PBN'") || onclick.includes('"PBN"');
                  const isDisabled = className.includes('dxp-disabled') ||
                                   className.includes('disabled');

                  if (isNextButton && !isDisabled && (btn as HTMLElement).offsetParent !== null) {
                    (btn as HTMLElement).click();
                    return true;
                  }
                }

                return false;
              });

              if (!nextPageClicked) {
                logger.warn("Failed to click next page button");
                break;
              }

              // Wait for page to load new results
              await this.wait(1500);
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

            logger.info(
              `✅ Article variant selected`,
              {
                variantId: selectedVariant.id,
                variantSuffix: variantSuffix,
                packageContent: selectedVariant.packageContent,
              },
              "form.article",
            );

            // Populate metadata
            item.articleId = selectedVariant.id;
            item.packageContent = selectedVariant.packageContent
              ? parseInt(selectedVariant.packageContent)
              : undefined;

            // Validate quantity against package rules
            const validation = this.productDb.validateQuantity(
              selectedVariant,
              item.quantity,
            );

            if (!validation.valid) {
              const errorMsg = `Quantity ${item.quantity} is invalid for article ${item.articleCode} (variant ${selectedVariant.id}): ${validation.errors.join(", ")}`;
              const suggestMsg = validation.suggestions
                ? ` Suggested quantities: ${validation.suggestions.join(", ")}`
                : "";

              logger.error(`❌ ${errorMsg}${suggestMsg}`);
              throw new Error(`${errorMsg}${suggestMsg}`);
            }

            logger.info(`✅ Quantity ${item.quantity} validated successfully`, {
              articleCode: item.articleCode,
              variantId: selectedVariant.id,
              minQty: selectedVariant.minQty,
              multipleQty: selectedVariant.multipleQty,
              maxQty: selectedVariant.maxQty,
            });

            await this.wait(1000);
            await this.waitForDevExpressReady({ timeout: 3000 });

            // CRITICAL: Wait for DevExpress to fully load article data into grid
            // DevExpress needs time to populate all fields (price, quantity, etc.)
            // If we edit quantity too soon, the loading process will reset it to default
            logger.debug(
              "Waiting for DevExpress to complete article data loading...",
            );
            await this.wait(2400); // Optimized wait for complete article loading
          },
          "form.article",
        );

        // 5.5: Set quantity (OPT-03: optimized field editing with smart skip)
        await this.runOp(
          `order.item.${i}.set_quantity`,
          async () => {
            const selectedVariant = (item as any)._selectedVariant;

            // SMART OPTIMIZATION: If quantity == multipleQty, DevExpress auto-fills correctly
            // Skip manual editing for exact package matches (1 for pack=1, 5 for pack=5, etc.)
            if (item.quantity === selectedVariant.multipleQty) {
              logger.info(
                `⚡ Quantity ${item.quantity} matches multipleQty - skipping edit (auto-filled by DevExpress)`,
              );
              await this.wait(500); // Let DevExpress stabilize
              return;
            }

            logger.debug(
              `Setting quantity: ${item.quantity} (multipleQty: ${selectedVariant.multipleQty})`,
            );
            await this.editTableCell("Qtà ordinata", item.quantity);
            logger.info(`✅ Quantity set: ${item.quantity}`);
            await this.wait(300);
          },
          "field-editing",
        );

        // 5.6: Set discount (optional) (OPT-03: optimized field editing)
        if (item.discount && item.discount > 0) {
          await this.runOp(
            `order.item.${i}.set_discount`,
            async () => {
              logger.debug(`Setting discount: ${item.discount}%`);
              await this.editTableCell("Applica sconto", item.discount);
              logger.info(`✅ Discount set: ${item.discount}%`);
              await this.wait(300);
            },
            "field-editing",
          );
        }

        // 5.7: Click "Update" button (floppy icon)
        await this.runOp(
          `order.item.${i}.click_update`,
          async () => {
            logger.debug('Clicking "Update" button (floppy icon)...');

            // DevExpress Update button pattern:
            // <a data-args="[['UpdateEdit'],1]" with <img title="Update" src="Action_Save">
            const buttonInfo = await this.page!.evaluate(() => {
              // Strategy 1: Find by data-args containing 'UpdateEdit'
              const buttons = Array.from(
                document.querySelectorAll('a[data-args*="UpdateEdit"]'),
              );
              if (buttons.length > 0) {
                return {
                  found: true,
                  strategy: 1,
                  id: (buttons[0] as HTMLElement).id || "no-id",
                };
              }

              // Strategy 2: Find img with title="Update" and src containing "Action_Save"
              const images = Array.from(
                document.querySelectorAll('img[title="Update"]'),
              );
              for (const img of images) {
                const src = (img as HTMLImageElement).src || "";
                if (src.includes("Action_Save")) {
                  const parent = img.parentElement;
                  if (parent && parent.tagName === "A") {
                    return {
                      found: true,
                      strategy: 2,
                      id: parent.id || "no-id",
                    };
                  }
                }
              }

              // Strategy 3: Find by ID pattern containing "SALESLINEs" and "DXCBtn0"
              const allLinks = Array.from(
                document.querySelectorAll("a.dxbButton_XafTheme"),
              );
              for (const link of allLinks) {
                const id = link.id || "";
                if (id.includes("SALESLINEs") && id.includes("DXCBtn0")) {
                  return {
                    found: true,
                    strategy: 3,
                    id: id,
                  };
                }
              }

              return { found: false };
            });

            if (!buttonInfo.found) {
              await this.page!.screenshot({
                path: `logs/update-button-not-found-${Date.now()}.png`,
                fullPage: true,
              });
              throw new Error('Button "Update" not found');
            }

            logger.debug(
              `Found Update button using strategy ${buttonInfo.strategy}`,
              {
                id: buttonInfo.id,
              },
            );

            // Click the button
            let clicked = false;

            if (buttonInfo.strategy === 1) {
              // OPT-03: Use atomic click to avoid detachment after scroll
              const clickSuccess = await this.page!.evaluate(() => {
                const button = document.querySelector(
                  'a[data-args*="UpdateEdit"]',
                ) as HTMLElement;
                if (!button) return false;

                button.scrollIntoView({ block: "center" });
                // Small sync wait for scroll stabilization
                const start = Date.now();
                while (Date.now() - start < 200) {}

                button.click();
                return true;
              });

              if (clickSuccess) {
                clicked = true;
              }
            } else if (buttonInfo.strategy === 2) {
              // OPT-03: Atomic click for strategy 2
              const clickSuccess = await this.page!.evaluate(() => {
                const img = document.querySelector(
                  'img[title="Update"][src*="Action_Save"]',
                ) as HTMLElement;
                if (!img || !img.parentElement) return false;

                img.parentElement.scrollIntoView({ block: "center" });
                const start = Date.now();
                while (Date.now() - start < 200) {}

                img.parentElement.click();
                return true;
              });

              if (clickSuccess) {
                clicked = true;
              }
            } else if (buttonInfo.strategy === 3) {
              // OPT-03: Atomic click for strategy 3
              const clickSuccess = await this.page!.evaluate((buttonId) => {
                const button = document.querySelector(
                  `#${buttonId}`,
                ) as HTMLElement;
                if (!button) return false;

                button.scrollIntoView({ block: "center" });
                const start = Date.now();
                while (Date.now() - start < 200) {}

                button.click();
                return true;
              }, buttonInfo.id);

              if (clickSuccess) {
                clicked = true;
              }
            }

            if (!clicked) {
              throw new Error("Failed to click Update button");
            }

            logger.info(`✅ Line item ${i + 1} saved`);
            await this.waitForDevExpressReady({ timeout: 3000 });
          },
          "form.submit",
        );

        // 5.8: Click "New" for next article (if not last)
        if (i < orderData.items.length - 1) {
          await this.runOp(
            `order.item.${i}.click_new_for_next`,
            async () => {
              logger.debug('Clicking "New" button for next article...');

              // OPT-04: Optimized wait for "New" button reappearance after Update
              // Strategy: Wait for disappearance, then wait for reappearance (based on Puppeteer best practices)
              logger.debug(
                'Step 1: Waiting for "New" button to disappear after Update...',
              );
              try {
                await this.page!.waitForFunction(
                  () => {
                    const buttons = Array.from(
                      document.querySelectorAll('a[data-args*="AddNew"]'),
                    );
                    return buttons.length === 0;
                  },
                  { timeout: 2000 }, // Wait for button to disappear
                );
                logger.debug("✅ Button disappeared");
              } catch (err) {
                logger.debug(
                  "Button may not have disappeared yet, continuing...",
                );
              }

              logger.debug('Step 2: Waiting for "New" button to reappear...');
              try {
                await this.page!.waitForFunction(
                  () => {
                    const buttons = Array.from(
                      document.querySelectorAll('a[data-args*="AddNew"]'),
                    );
                    return buttons.length > 0;
                  },
                  { timeout: 5000 }, // Wait for button to reappear
                );
                logger.debug(
                  '✅ "New" button reappeared - event-driven waiting successful',
                );
              } catch (err) {
                logger.warn(
                  "Event-driven wait timed out for New button reappearance",
                );
              }

              // Small stability wait after button appears (let DevExpress finish DOM updates)
              await this.wait(200);

              // After Update, the "New" button may be DXCBtn1 or DXCBtn0 depending on state
              // Pattern: <a data-args="[['AddNew'],1]" with <img title="New" src="Action_Inline_New">
              const buttonInfo = await this.page!.evaluate(() => {
                // Strategy 1: Find by data-args containing 'AddNew'
                const buttons = Array.from(
                  document.querySelectorAll('a[data-args*="AddNew"]'),
                );

                // Debug: Log all buttons found
                const allButtonIds = buttons.map((b) => (b as HTMLElement).id);

                // First try to find DXCBtn1 (preferred after Update)
                for (const btn of buttons) {
                  const id = (btn as HTMLElement).id || "";
                  if (id.includes("DXCBtn1")) {
                    return {
                      found: true,
                      strategy: 1,
                      id: id,
                      debug: `Found DXCBtn1. All buttons: ${allButtonIds.join(", ")}`,
                    };
                  }
                }

                // Fallback: Accept DXCBtn0 if DXCBtn1 not found
                for (const btn of buttons) {
                  const id = (btn as HTMLElement).id || "";
                  if (id.includes("SALESLINEs") && id.includes("DXCBtn0")) {
                    return {
                      found: true,
                      strategy: 1,
                      id: id,
                      debug: `Found DXCBtn0. All buttons: ${allButtonIds.join(", ")}`,
                    };
                  }
                }

                // Strategy 2: Find img with title="New" and src containing "Action_Inline_New"
                const images = Array.from(
                  document.querySelectorAll('img[title="New"]'),
                );
                for (const img of images) {
                  const src = (img as HTMLImageElement).src || "";
                  if (src.includes("Action_Inline_New")) {
                    const parent = img.parentElement;
                    if (parent && parent.tagName === "A") {
                      const parentId = parent.id || "";
                      // Any valid New button
                      if (parentId.includes("SALESLINE")) {
                        return {
                          found: true,
                          strategy: 2,
                          id: parentId,
                          debug: `Found via image. All buttons: ${allButtonIds.join(", ")}`,
                        };
                      }
                    }
                  }
                }

                return {
                  found: false,
                  debug: `NO MATCH. All AddNew buttons found: ${allButtonIds.join(", ") || "NONE"}`,
                };
              });

              // Log debug info
              logger.debug(
                `Button search result: ${buttonInfo.debug || "no debug info"}`,
              );

              if (!buttonInfo.found) {
                await this.page!.screenshot({
                  path: `logs/new-button-for-next-not-found-${Date.now()}.png`,
                  fullPage: true,
                });
                throw new Error(
                  `Button "New" not found for next article. ${buttonInfo.debug || ""}`,
                );
              }

              logger.debug(
                `Found "New" button using strategy ${buttonInfo.strategy}`,
                {
                  id: buttonInfo.id,
                },
              );

              // Click the button
              let clicked = false;

              if (buttonInfo.strategy === 1) {
                // Find by ID directly
                const handle = await this.page!.$(`#${buttonInfo.id}`);
                if (handle) {
                  await handle.evaluate((el) =>
                    (el as HTMLElement).scrollIntoView({ block: "center" }),
                  );
                  await this.wait(300);
                  await handle.click();
                  clicked = true;
                }
              } else if (buttonInfo.strategy === 2) {
                // Find by img and click parent
                const imgHandle = await this.page!.$(
                  'img[title="New"][src*="Action_Inline_New"]',
                );
                if (imgHandle) {
                  const parentHandle = await imgHandle.evaluateHandle(
                    (img) => img.parentElement,
                  );
                  if (parentHandle) {
                    await parentHandle.evaluate((el) =>
                      (el as HTMLElement).scrollIntoView({ block: "center" }),
                    );
                    await this.wait(300);
                    await (parentHandle as any).click();
                    clicked = true;
                  }
                }
              }

              if (!clicked) {
                throw new Error(
                  'Failed to click "New" button for next article',
                );
              }

              // OPT-04: Event-driven waiting for next row insertion
              logger.debug("Waiting for new row to appear...");
              try {
                await this.page!.waitForFunction(
                  (expectedRowIndex) => {
                    // Wait for DevExpress to insert the new editable row
                    // Check for presence of new article input field
                    const inputs = Array.from(
                      document.querySelectorAll('input[type="text"]'),
                    );
                    const articleInputs = inputs.filter((input) => {
                      const id = (input as HTMLInputElement).id.toLowerCase();
                      return (
                        id.includes("itemid") ||
                        id.includes("salesline") ||
                        id.includes("articolo") ||
                        id.includes("nome")
                      );
                    });
                    // Should have at least one article input for the new row
                    return articleInputs.length > 0;
                  },
                  { timeout: 3000 }, // Fallback timeout (was 1500ms fixed wait)
                  i + 1, // Expected row index
                );
                logger.debug("✅ New row detected via event-driven waiting");
              } catch (err) {
                logger.warn("Event-driven wait timed out, proceeding anyway");
              }

              await this.waitForDevExpressReady({ timeout: 3000 });
              logger.info(`✅ Ready for article ${i + 2}`);
            },
            "multi-article-navigation",
          );
        }
      }

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

      // STEP 9.5: Apply global discount (if specified)
      if (orderData.discountPercent && orderData.discountPercent > 0) {
        await this.runOp(
          "order.apply_global_discount",
          async () => {
            logger.debug(`Applying global discount: ${orderData.discountPercent}%`);

            // STEP 9.5.1: Click "Prezzi e sconti" tab to make discount field visible
            logger.debug('Looking for "Prezzi e sconti" tab...');

            const tabClicked = await this.page!.evaluate(() => {
              // Find tab with text "Prezzi e sconti"
              const allLinks = Array.from(document.querySelectorAll('a.dxtc-link, span.dx-vam'));

              for (const element of allLinks) {
                const text = element.textContent?.trim() || '';
                if (text.includes('Prezzi') && text.includes('sconti')) {
                  // Click the link or its parent
                  const clickTarget = element.tagName === 'A' ? element : element.parentElement;
                  if (clickTarget && (clickTarget as HTMLElement).offsetParent !== null) {
                    (clickTarget as HTMLElement).click();
                    return true;
                  }
                }
              }

              // Alternative: Find by tab ID pattern (pg_AT2 = Prezzi e sconti)
              const tabs = Array.from(document.querySelectorAll('li[id*="_pg_AT"]'));
              for (const tab of tabs) {
                const link = tab.querySelector('a.dxtc-link');
                const span = tab.querySelector('span.dx-vam');
                const text = span?.textContent?.trim() || '';

                if (text.includes('Prezzi') && text.includes('sconti')) {
                  if (link && (link as HTMLElement).offsetParent !== null) {
                    (link as HTMLElement).click();
                    return true;
                  }
                }
              }

              return false;
            });

            if (!tabClicked) {
              logger.warn('"Prezzi e sconti" tab not found, trying to find discount field anyway...');
            } else {
              logger.info('✅ Clicked "Prezzi e sconti" tab');
              await this.wait(2000); // Wait longer for tab content to load and render
            }

            // Find the MANUALDISCOUNT field (APPLICA SCONTO %) with debug info
            const discountFieldInfo = await this.page!.evaluate(() => {
              const inputs = Array.from(
                document.querySelectorAll('input[type="text"]'),
              ) as HTMLInputElement[];

              // DEBUG: Log all input IDs to help troubleshoot
              const allInputIds = inputs.map(i => ({
                id: i.id,
                visible: i.offsetParent !== null,
                readOnly: i.readOnly,
                value: i.value
              })).filter(i => i.id.toLowerCase().includes('discount') || i.id.toLowerCase().includes('sconto'));

              // Search for MANUALDISCOUNT field
              const manualDiscountInput = inputs.find((input) => {
                const id = input.id.toLowerCase();
                return (
                  (id.includes("manualdiscount") || id.includes("dvimanualdiscount") || id.includes("applica") || id.includes("sconto")) &&
                  !id.includes("salesline") && // Not a line-level discount
                  input.offsetParent !== null && // Visible
                  !input.readOnly // Editable
                );
              });

              if (manualDiscountInput) {
                return {
                  found: true,
                  id: manualDiscountInput.id,
                  currentValue: manualDiscountInput.value,
                  debug: allInputIds
                };
              }

              return {
                found: false,
                debug: allInputIds
              };
            });

            if (!discountFieldInfo.found) {
              logger.warn("Global discount field (MANUALDISCOUNT) not found", {
                debugInputs: discountFieldInfo.debug
              });
              return;
            }

            logger.debug(`Found global discount field: ${discountFieldInfo.id}`, {
              currentValue: discountFieldInfo.currentValue,
            });

            // Double-click strategy (same as quantity fields)
            const discountInput = await this.page!.$(`#${discountFieldInfo.id}`);
            if (!discountInput) {
              throw new Error("Discount input element not found");
            }

            // Double-click to activate cell editing mode
            await discountInput.click({ clickCount: 2 });
            await this.wait(300);

            // Select all existing content with Ctrl+A
            await this.page!.keyboard.down('Control');
            await this.page!.keyboard.press('KeyA');
            await this.page!.keyboard.up('Control');
            await this.wait(100);

            // Type the discount percentage (will replace selected content)
            // Format: "XX,XX" (Italian format with comma, without % symbol)
            const discountFormatted = orderData.discountPercent.toFixed(2).replace(".", ",");
            await this.page!.keyboard.type(discountFormatted, { delay: 50 });

            await this.wait(500);

            // Press Tab to confirm and move to next field (triggers DevExpress validation)
            await this.page!.keyboard.press('Tab');

            await this.wait(1000); // Wait for Archibald to recalculate order totals

            logger.info(`✅ Global discount applied: ${orderData.discountPercent}%`);
          },
          "form.discount",
        );
      }

      // STEP 10: Save and close order
      await this.runOp(
        "order.save_and_close",
        async () => {
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

            // Click dropdown arrow
            const parent = salvareBtn.parentElement;
            if (!parent) return false;

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

          await this.wait(500);

          // Click "Salva e chiudi"
          const saveClicked = await this.clickElementByText("Salva e chiudi", {
            exact: true,
            selectors: ["a", "span", "div"],
          });

          if (!saveClicked) {
            throw new Error('Option "Salva e chiudi" not found in dropdown');
          }

          logger.info('✅ Clicked "Salva e chiudi"');
          await this.wait(3000);
        },
        "form.submit",
      );

      logger.info("🎉 BOT: ORDINE COMPLETATO", { orderId });

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

  async createOrderOLD_BACKUP(orderData: OrderData): Promise<string> {
    if (!this.page) throw new Error("Browser non inizializzato");

    logger.info("🤖 BOT: INIZIO creazione ordine", {
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      items: orderData.items.map((item) => ({
        name: item.productName || item.articleCode,
        qty: item.quantity,
      })),
    });

    let orderId = "";

    try {
      // STEP 1: Click "Ordini" in left menu
      await this.runOp("order.menu.ordini", async () => {
        logger.debug('Clicking "Ordini" menu item...');

        const clicked = await this.clickElementByText("Ordini", {
          exact: true,
          selectors: ["a", "span", "div", "td"],
        });

        if (!clicked) {
          throw new Error('Menu "Ordini" not found');
        }

        // Wait for orders list page to load
        await this.page!.waitForFunction(
          () => {
            const elements = Array.from(
              document.querySelectorAll("span, button, a"),
            );
            return elements.some(
              (el) => el.textContent?.trim().toLowerCase() === "nuovo",
            );
          },
          { timeout: 5000 },
        );

        logger.info("✅ Navigated to orders list");
      });

      // STEP 2: Click "Nuovo" button
      await this.runOp("order.click_nuovo", async () => {
        logger.debug('Clicking "Nuovo" button...');

        const clicked = await this.clickElementByText("Nuovo", {
          exact: true,
          selectors: ["button", "a", "span"],
        });

        if (!clicked) {
          throw new Error('Button "Nuovo" not found');
        }

        // Wait for order form to load
        await this.waitForDevExpressReady({ timeout: 5000 });

        logger.info("✅ Order form loaded");
      });

      // 3. STEP 6.2: Compila campo "Account esterno" (codice cliente)
      await this.runOp("order.customer.select", async () => {
        logger.debug(
          'Cerco campo "Account esterno" per inserire codice cliente...',
        );

        const allInputs = await this.page.evaluate(() => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="text"]'),
          );
          return inputs.slice(0, 30).map(
            (input) => ({
              id: (input as HTMLInputElement).id,
              name: (input as HTMLInputElement).name,
              placeholder: (input as HTMLInputElement).placeholder,
              value: (input as HTMLInputElement).value,
              visible: (input as HTMLElement).offsetParent !== null,
            }),
            "form.article",
          );
        });

        logger.debug("Input text trovati sulla pagina", {
          count: allInputs.length,
          inputs: allInputs,
        });

        // Cerca campo "Account esterno" usando Puppeteer (non evaluate) per usare .type()
        const customerInputSelector = await this.page.evaluate(() => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="text"]'),
          );

          // Cerca per label vicino all'input o per id/name che contiene "account", "cliente", "custtable"
          const customerInput = inputs.find((input) => {
            const id = (input as HTMLInputElement).id.toLowerCase();
            const name = (input as HTMLInputElement).name.toLowerCase();

            // Cerca pattern comuni
            return (
              id.includes("account") ||
              id.includes("cliente") ||
              id.includes("custtable") ||
              id.includes("custaccount") ||
              name.includes("account") ||
              name.includes("cliente") ||
              name.includes("custtable")
            );
          });

          if (customerInput) {
            const fieldId = (customerInput as HTMLInputElement).id;
            return "#" + fieldId;
          }

          return null;
        });

        if (!customerInputSelector) {
          logger.warn('Campo "Account esterno" non trovato');
          // await this.page.screenshot({
          // path: "logs/order-step2-no-customer-field.png",
          // fullPage: true,
          // });
          throw new Error("Campo cliente non trovato");
        }

        logger.debug(
          `Campo "Account esterno" trovato: ${customerInputSelector}`,
        );

        // Usa il nome cliente invece dell'ID
        const customerQuery =
          orderData.customerName?.trim() || orderData.customerId?.trim();

        if (!customerQuery) {
          throw new Error("Nome o codice cliente non fornito");
        }

        // Apri il dropdown a destra del campo cliente
        logger.debug('Cerco dropdown a destra del campo "Account esterno"...');

        const customerInputId = customerInputSelector.startsWith("#")
          ? customerInputSelector.slice(1)
          : customerInputSelector;
        const customerBaseId = customerInputId.endsWith("_I")
          ? customerInputId.slice(0, -2)
          : customerInputId;

        const dropdownSelectors = [
          `#${customerBaseId}_B-1`,
          `#${customerBaseId}_B-1Img`,
          `#${customerBaseId}_B`,
          `#${customerBaseId}_DDD`,
          `#${customerBaseId}_DropDown`,
        ];

        let dropdownClicked = false;

        for (const selector of dropdownSelectors) {
          const handle = await this.page.$(selector);
          if (!handle) continue;
          const box = await handle.boundingBox();
          if (!box) continue;
          await handle.click();
          dropdownClicked = true;
          break;
        }

        if (!dropdownClicked) {
          const [fallbackHandle] = await this.page.$x(
            `//*[@id="${customerInputId}"]/following::*[contains(@id,"_B-1") or contains(@id,"_DDD")][1]`,
          );
          if (fallbackHandle && (await fallbackHandle.boundingBox())) {
            await fallbackHandle.click();
            dropdownClicked = true;
          }
        }

        if (!dropdownClicked) {
          // await this.page.screenshot({
          // path: "logs/order-step2-no-customer-dropdown.png",
          // fullPage: true,
          // });
          throw new Error("Dropdown cliente non trovato");
        }

        logger.debug("Dropdown cliente cliccato, attendo popup...");

        // USA TIMEOUT ADATTIVO per dropdown cliente
        const searchInputSelectors = [
          `#${customerBaseId}_DDD_gv_DXSE_I`,
          'input[placeholder*="enter text to search" i]',
        ];

        let searchInput = null;
        let foundSelector: string | null = "";

        try {
          // STEP 1b: Aspetta dropdown cliente (ottimizzato a 800ms da 1500ms)
          const result = await this.page!.waitForFunction(
            (selectors: string[]) => {
              for (const sel of selectors) {
                const input = document.querySelector(
                  sel,
                ) as HTMLInputElement | null;
                if (
                  input &&
                  input.offsetParent !== null &&
                  !input.disabled &&
                  !input.readOnly
                ) {
                  return sel;
                }
              }
              return null;
            },
            { timeout: 800, polling: 50 }, // Ottimizzato da 1500ms
            searchInputSelectors,
          );

          foundSelector = (await result.jsonValue()) as string | null;

          if (foundSelector) {
            searchInput = await this.page!.$(foundSelector);
          }
        } catch (error) {
          // Fallback: prova selector per selector
          for (const selector of searchInputSelectors) {
            const input = await this.page!.$(selector);
            if (input) {
              const isVisible = await input.evaluate(
                (el) => (el as HTMLElement).offsetParent !== null,
              );
              if (isVisible) {
                searchInput = input;
                foundSelector = selector;
                break;
              }
            }
          }
        }

        // await this.page!.screenshot({
        // path: "logs/order-step2-dropdown-opened.png",
        // fullPage: true,
        // });

        if (!searchInput) {
          // await this.page.screenshot({
          // path: "logs/order-step2-no-search-input.png",
          // fullPage: true,
          // });
          throw new Error(
            'Barra di ricerca "Enter text to search" non trovata',
          );
        }

        // OTTIMIZZAZIONE ULTRA: Incolla direttamente senza click/backspace (più veloce!)
        await this.page!.evaluate(
          (selector, value) => {
            const input = document.querySelector(selector) as HTMLInputElement;
            if (input) {
              input.value = value;
              input.focus();
              input.dispatchEvent(
                new Event("input", { bubbles: true }),
                "form.article",
              );
              input.dispatchEvent(
                new Event("change", { bubbles: true }),
                "form.article",
              );
            }
          },
          foundSelector,
          customerQuery,
        );

        await this.page!.keyboard.press("Enter");

        // STEP 2: Aspetta risultati clienti (timeout ottimizzato)
        await this.page!.waitForSelector('tr[class*="dxgvDataRow"]', {
          visible: true,
          timeout: 1500, // Ottimizzato da 3000ms
        });

        const rows = await this.page!.$$('tr[class*="dxgvDataRow"]');

        if (rows.length > 0) {
          // FIX: Clicca sulla prima cella <td> invece che sulla riga
          const firstCell = await rows[0].$("td");
          const clickTarget = firstCell || rows[0];

          try {
            await clickTarget.click();
            logger.debug("Cliente selezionato dalla griglia risultati");
          } catch (error: unknown) {
            // Fallback: click JavaScript
            await clickTarget.evaluate((el) => (el as HTMLElement).click());
            logger.debug("Cliente selezionato via JavaScript click");
          }
        } else {
          logger.warn("Nessuna riga cliente trovata dopo la ricerca");
        }

        logger.info(`Ricerca cliente avviata con: ${customerQuery}`);

        // OTTIMIZZAZIONE: Aspetta che il popup si chiuda invece di timeout fisso
        await this.page!.waitForFunction(
          (baseId: string) => {
            const popup = document.querySelector(
              `#${baseId}_DDD`,
            ) as HTMLElement | null;
            return (
              !popup ||
              popup.style.display === "none" ||
              popup.offsetParent === null
            );
          },
          { timeout: 1500, polling: 100 },
          customerBaseId,
        );

        // OTTIMIZZAZIONE: Ridotto da 1000ms a 300ms per stabilizzazione dati cliente
        await this.wait(300);

        // await this.page.screenshot({
        // path: "logs/order-step2-customer-filled.png",
        // fullPage: true,
        // });
        logger.debug("Screenshot salvato: customer-filled.png");
      });

      // 4. STEP 6.3: Inserimento articoli (ciclo per ogni articolo)
      logger.info(`Inizio inserimento di ${orderData.items.length} articoli`);

      // OTTIMIZZAZIONE: Aspetta che la griglia articoli sia visibile invece di 2000ms fissi
      await this.runOp("order.wait.items_grid", async () => {
        try {
          await this.page!.waitForSelector('[id*="dviSALESLINEs"]', {
            visible: true,
            timeout: 3000,
          });
          await this.wait(200);
        } catch {
          // Fallback
          await this.wait(1000);
        }
      });

      for (let i = 0; i < orderData.items.length; i++) {
        const item = orderData.items[i];
        const itemDisplay = item.productName || item.articleCode;
        logger.info(
          `Articolo ${i + 1}/${orderData.items.length}: ${itemDisplay}`,
        );

        // 4.1: Click sul pulsante + per aggiungere nuovo articolo
        await this.runOp(`order.item.${i}.add_row`, async () => {
          logger.debug(
            "Cerco pulsante + diretto per SALESLINE usando ID specifico...",
          );

          // await this.page.screenshot({
          // path: `logs/order-step3-before-add-item-${i}.png`,
          // fullPage: true,
          // });

          // APPROCCIO DIRETTO: Cerca il pulsante "New" per aggiungere articoli
          const plusButtonClicked = await this.page.evaluate(() => {
            // Strategia 1: Cerca img con title="New" e id che contiene "SALESLINE" e "DXCBtn"
            const newButtonImages = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[title="New"], img[alt="New"]',
              ),
            ).filter((el) => {
              const visible = el.offsetParent !== null;
              const hasSaleslineInId =
                el.id.includes("SALESLINE") || el.id.includes("SalesLine");
              // FIXED: Accetta DXCBtn con qualsiasi numero (DXCBtn0Img, DXCBtn1Img, ecc.)
              const hasDXCBtn =
                el.id.includes("DXCBtn") && el.id.includes("Img");
              return visible && hasSaleslineInId && hasDXCBtn;
            });

            if (newButtonImages.length > 0) {
              const btn = newButtonImages[0];
              btn.click();
              return true;
            }

            // Strategia 2: Cerca qualsiasi DXCBtn nella griglia SALESLINE
            // Cerca direttamente tutti i pulsanti DXCBtn nella sezione SALESLINE
            const allDXCButtons = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[id*="SALESLINE"][id*="DXCBtn"][id*="Img"]',
              ),
            ).filter((img) => {
              const visible = img.offsetParent !== null;
              const isNew = img.title === "New" || img.alt === "New";
              return visible && isNew;
            });

            if (allDXCButtons.length > 0) {
              allDXCButtons[0].click();
              return true;
            }

            return false;
          });

          if (!plusButtonClicked) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-plus-button.png`,
            // fullPage: true,
            // });
            throw new Error(
              "Pulsante + per aggiungere articolo non trovato (SALESLINE)",
            );
          }

          logger.debug("Pulsante New cliccato, attendo apertura nuova riga...");

          // OTTIMIZZAZIONE: Aspetta che appaia la nuova riga editnew invece di 2000ms fissi
          try {
            await this.page!.waitForFunction(
              (itemIndex: number) => {
                const editRows = document.querySelectorAll('tr[id*="editnew"]');
                return editRows.length >= itemIndex + 1;
              },
              { timeout: 3000, polling: 100 },
              i,
            );
            // Breve attesa per stabilizzazione DOM
            await this.wait(300);
          } catch {
            // Fallback al timeout ridotto
            await this.wait(800);
          }

          // await this.page.screenshot({
          // path: `logs/order-step4-after-plus-${i}.png`,
          // fullPage: true,
          // });
        });

        // 4.2: Apri dropdown articolo e cerca nel popup
        let inventtableInputId = "";
        let inventtableBaseId = "";
        let inventtableInput = null;
        await this.runOp(`order.item.${i}.article.find_input`, async () => {
          logger.debug(
            "Cerco campo INVENTTABLE per aprire dropdown articolo...",
          );

          // OTTIMIZZAZIONE: Usa evaluate() per trovare il campo in JS nativo (molto più veloce!)
          const fieldInfo = await this.page!.evaluate(() => {
            // Cerca nella riga editnew più recente
            const editRows = Array.from(
              document.querySelectorAll(
                '[id*="dviSALESLINEs"] tr[id*="editnew"]',
              ),
            );

            // Ordina per ID numerico (l'ultima riga ha numero più alto)
            editRows.sort((a, b) => {
              const aEl = a as HTMLElement;
              const bEl = b as HTMLElement;
              const aNum = parseInt(
                (aEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              const bNum = parseInt(
                (bEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              return bNum - aNum; // Ordine decrescente
            });

            // Cerca INVENTTABLE nella prima riga (la più recente)
            for (const row of editRows) {
              const inputs = Array.from(
                (row as HTMLElement).querySelectorAll(
                  'input[id*="INVENTTABLE_Edit"]',
                ),
              );

              for (const input of inputs) {
                const inp = input as HTMLInputElement;
                // Salta campi nascosti o di ricerca interna
                if (inp.id.includes("DXSE") || inp.offsetParent === null)
                  continue;

                // Trovato!
                return {
                  id: inp.id,
                  found: true,
                };
              }
            }

            // Fallback: cerca ovunque
            const allInputs = Array.from(
              document.querySelectorAll('input[id*="INVENTTABLE_Edit"]'),
            );

            for (const input of allInputs) {
              const inp = input as any;
              if (inp.id.includes("DXSE") || inp.offsetParent === null)
                continue;
              if (inp.id.toLowerCase().includes("salesline")) {
                return { id: inp.id, found: true };
              }
            }

            return { id: "", found: false };
          });

          if (!fieldInfo.found) {
            throw new Error("Campo INVENTTABLE (Nome articolo) non trovato");
          }

          inventtableInputId = fieldInfo.id;
          inventtableBaseId = inventtableInputId.endsWith("_I")
            ? inventtableInputId.slice(0, -2)
            : inventtableInputId;

          logger.debug(`Campo INVENTTABLE trovato: ${inventtableInputId}`);

          // Ora seleziona e click
          inventtableInput = await this.page!.$(`#${inventtableInputId}`);
          if (!inventtableInput) {
            throw new Error(
              `Campo INVENTTABLE con ID ${inventtableInputId} non trovato nel DOM`,
            );
          }

          await inventtableInput.click();
          await this.wait(200);
        });

        // OTTIMIZZAZIONE: popupContainer viene inizializzato dentro open_dropdown
        let popupContainer = null;
        let searchInput = null;

        await this.runOp(`order.item.${i}.article.open_dropdown`, async () => {
          const dropdownSelectors = [
            `#${inventtableBaseId}_B-1Img`,
            `#${inventtableBaseId}_B-1`,
            `#${inventtableBaseId}_B`,
            `#${inventtableBaseId}_DDD`,
          ];

          const isArticlePopupOpen = async (): Promise<boolean> => {
            const popup = await this.page.$(`#${inventtableBaseId}_DDD`);
            if (popup && (await popup.boundingBox())) return true;

            const genericPopup = await this.page.$(
              '[id*="INVENTTABLE_Edit_DDD"]',
            );
            if (genericPopup && (await genericPopup.boundingBox())) return true;

            const search = await this.page.$(
              'input[id*="INVENTTABLE_Edit_DDD_gv_DXSE_I"], input[placeholder*="Enter text to search"], input[placeholder*="enter text to search"]',
            );
            if (search && (await search.boundingBox())) return true;

            return false;
          };

          let dropdownClicked = false;
          let dropdownMethod: string | null = null;
          const dropdownAttempts: string[] = [];

          const confirmPopup = async (method: string): Promise<boolean> => {
            dropdownAttempts.push(method);
            // OTTIMIZZAZIONE: Ridotto da 600ms a 300ms e usa waitForSelector invece di polling
            try {
              await this.page!.waitForSelector(`#${inventtableBaseId}_DDD`, {
                visible: true,
                timeout: 500,
              });
              dropdownClicked = true;
              dropdownMethod = method;
              return true;
            } catch {
              // Prova con gli altri selettori
              if (await isArticlePopupOpen()) {
                dropdownClicked = true;
                dropdownMethod = method;
                return true;
              }
            }
            return false;
          };

          const directResult = await this.page.evaluate((inputId) => {
            const input = document.getElementById(inputId);
            if (!input) return null;

            const selectors = [
              'td[id*="INVENTTABLE_Edit_B-1"]',
              'img[id*="INVENTTABLE_Edit_B-1Img"]',
              'img[id*="_B-1Img"]',
              'img[id*="_B-1"]',
              ".dxeButtonEditButton",
              'img[alt="▼"]',
            ];

            const containers: Array<Element | null> = [
              document.querySelector('tr[id*="editnew"]'),
              document.querySelector('[id*="dviSALESLINEs"]'),
              input.closest("tr"),
              input.closest("table"),
              input.parentElement,
              document.body,
            ];

            for (const container of containers) {
              if (!container) continue;
              for (const selector of selectors) {
                const candidate = container.querySelector(
                  selector,
                ) as HTMLElement | null;
                if (candidate && candidate.offsetParent !== null) {
                  candidate.scrollIntoView({
                    block: "center",
                    inline: "center",
                  });
                  candidate.click();
                  return candidate.id || selector;
                }
              }
            }

            return null;
          }, inventtableInputId);

          if (directResult) {
            await confirmPopup(`direct:${directResult}`);
          }

          for (const selector of dropdownSelectors) {
            if (dropdownClicked) break;
            const handles = await this.page.$$(selector);
            if (handles.length === 0) continue;
            for (const handle of handles) {
              if (dropdownClicked) break;
              const box = await handle.boundingBox();
              if (!box) continue;
              await handle.click();
              await confirmPopup(`selector:${selector}`);
            }
          }

          /* DISABLED: broad fallback for nearby dropdowns
          if (!dropdownClicked) {
            const fallbackId = await this.page.evaluate(function (inputId) {
              const input = document.getElementById(inputId);
              if (!input) return null;

              let container = input.parentElement;
              for (let i = 0; i < 6 && container; i++) {
                const candidates = Array.from(
                  container.querySelectorAll(
                    '[id*="_B-1"], [id*="_DDD"], .dxeButtonEditButton, [class*="DropDown"], button, span, img',
                  ),
                ).filter((el) => (el as HTMLElement).offsetParent !== null);

                if (candidates.length > 0) {
                  const id = (candidates[0] as HTMLElement).id || null;
                  if (id) return id;
                }

                container = container.parentElement;
              }

              return null;
            }, inventtableInputId);

            if (fallbackId) {
              const fallbackHandle = await this.page.$(`[id="${fallbackId}"]`);
              if (fallbackHandle && (await fallbackHandle.boundingBox())) {
                await fallbackHandle.click();
                await confirmPopup(`fallback:${fallbackId}`);
              }
            }
          }
          */

          /* DISABLED: row-level DOM click fallback
          if (!dropdownClicked) {
            const domResult = await this.page.evaluate(function (inputId) {
              const input = document.getElementById(inputId);
              if (!input) return null;

              const row =
                input.closest("tr") || input.closest("table") || input.parentElement;
              if (!row) return null;

              const selectors = [
                '[id*="INVENTTABLE_Edit_B-1Img"]',
                '[id*="INVENTTABLE_Edit_B-1"]',
                '[id*="INVENTTABLE_Edit_B"]',
                '[id*="INVENTTABLE_Edit_DDD"]',
                ".dxeButtonEditButton",
                'img[alt="▼"]',
              ];

              const candidate = row.querySelector(
                selectors.join(", "),
              ) as HTMLElement | null;

              if (candidate && candidate.offsetParent !== null) {
                candidate.click();
                return candidate.id || selectors.join(",");
              }

              return null;
            }, inventtableInputId);

            if (domResult) {
              await confirmPopup(`dom:${domResult}`);
            }
          }
          */

          /* DISABLED: edit-row specific fallback
          if (!dropdownClicked) {
            const rowResult = await this.page.evaluate(() => {
              const row = document.querySelector('tr[id*="editnew"]');
              if (!row) return null;
              const candidate = row.querySelector(
                'img[id*="INVENTTABLE_Edit_B-1Img"], img[id*="INVENTTABLE_Edit_B-1"], img[alt="▼"]',
              ) as HTMLElement | null;

              if (candidate && candidate.offsetParent !== null) {
                candidate.click();
                return candidate.id || "row-editnew";
              }

              return null;
            });

            if (rowResult) {
              await confirmPopup(`row:${rowResult}`);
            }
          }
          */

          if (!dropdownClicked) {
            const genericDropdowns = await this.page.$$(
              'img[id*="INVENTTABLE_Edit_B-1Img"], img[id*="INVENTTABLE_Edit_B-1"], [id*="INVENTTABLE_Edit_B-1Img"], [id*="INVENTTABLE_Edit_B-1"]',
            );
            for (const dropdown of genericDropdowns) {
              if (dropdownClicked) break;
              const box = await dropdown.boundingBox();
              if (!box) continue;
              await dropdown.click();
              const dropdownId = await dropdown.evaluate(
                (el) => (el as HTMLElement).id || "generic",
              );
              await confirmPopup(`generic:${dropdownId}`);
            }
          }

          /* DISABLED: keyboard/mouse fallbacks
          if (!dropdownClicked) {
            const box = await inventtableInput.boundingBox();
            if (box) {
              const clickX = box.x + box.width - 6;
              const clickY = box.y + box.height / 2;
              await this.page.mouse.click(clickX, clickY);
              await confirmPopup("edge-click");
            }
          }

          if (!dropdownClicked) {
            await this.page.keyboard.down("Alt");
            await this.page.keyboard.press("ArrowDown");
            await this.page.keyboard.up("Alt");
            await confirmPopup("alt-down");
          }

          if (!dropdownClicked) {
            await this.page.keyboard.press("F4");
            await confirmPopup("f4");
          }
          */

          if (!dropdownClicked) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-article-dropdown-${i}.png`,
            // fullPage: true,
            // });
            logger.debug(
              `Tentativi dropdown articolo: ${dropdownAttempts.join(" | ")}`,
            );
            throw new Error("Dropdown articolo non trovato");
          }

          logger.debug(
            `Dropdown articolo cliccato (${dropdownMethod ?? "unknown"}), attendo popup...`,
          );

          // OTTIMIZZAZIONE: Aspetta dinamicamente che il popup search sia caricato invece di 1200ms fissi
          try {
            await this.page!.waitForSelector(
              `#${inventtableBaseId}_DDD_gv_DXSE_I, input[placeholder*="Enter text to search"], input[placeholder*="enter text to search"]`,
              { visible: true, timeout: 2000 },
            );
          } catch {
            // Fallback al timeout ridotto
            await this.wait(500);
          }

          popupContainer =
            (await this.page.$(`#${inventtableBaseId}_DDD`)) ||
            (await this.page.$(`[id*="${inventtableBaseId}_DDD"]`)) ||
            (await this.page.$('[id*="INVENTTABLE_Edit_DDD"]')) ||
            null;
        });

        await this.runOp(`order.item.${i}.article.find_search`, async () => {
          const directSearchSelectors = [
            `#${inventtableBaseId}_DDD_gv_DXSE_I`,
            `[id*="${inventtableBaseId}_DDD_gv_DXSE_I"]`,
            'input[placeholder*="Enter text to search"]',
            'input[placeholder*="enter text to search"]',
            'input[id$="_DXSE_I"]',
            'input[id*="_DXSE_I"]',
          ];

          // Cerca input articolo con timeout ottimizzato
          for (const selector of directSearchSelectors) {
            try {
              await this.page.waitForSelector(selector, {
                visible: true,
                timeout: 800, // Ottimizzato da 3000ms
              });

              const input = await this.page.$(selector);
              if (!input) continue;
              const box = await input.boundingBox();
              if (!box) continue;
              searchInput = input;
              break;
            } catch {
              // Prova il prossimo selettore
            }
          }

          if (!searchInput) {
            const candidates = popupContainer
              ? await popupContainer.$$('input[type="text"]')
              : await this.page.$$('input[type="text"]');

            for (const candidate of candidates) {
              const info = await candidate.evaluate((el) => {
                const input = el as HTMLInputElement;
                const placeholder = (input.placeholder || "").toLowerCase();
                const value = (input.value || "").toLowerCase();
                const id = (input.id || "").toLowerCase();
                const visible = (input as HTMLElement).offsetParent !== null;
                return { placeholder, value, id, visible };
              });

              if (!info.visible) continue;

              const looksLikeSearch =
                info.id.includes("dxse") ||
                info.placeholder.includes("enter text to search") ||
                info.value.includes("enter text to search");

              if (looksLikeSearch) {
                searchInput = candidate;
                break;
              }
            }
          }

          if (!searchInput) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-article-search-${i}.png`,
            // fullPage: true,
            // });
            throw new Error("Barra ricerca articolo non trovata");
          }
        });

        await this.runOp(`order.item.${i}.article.search_type`, async () => {
          if (!searchInput) {
            throw new Error("Barra ricerca articolo non trovata");
          }

          // Query database for correct package variant
          const selectedVariant = this.productDb.selectPackageVariant(
            item.articleCode,
            item.quantity,
          );

          if (!selectedVariant) {
            throw new Error(
              `Article ${item.articleCode} not found in database. ` +
                `Ensure product sync has run and article exists in Archibald.`,
            );
          }

          logger.info(`Selected package variant for ${item.articleCode}`, {
            variantId: selectedVariant.id,
            packageContent: selectedVariant.packageContent,
            multipleQty: selectedVariant.multipleQty,
            quantity: item.quantity,
          });

          // OTTIMIZZAZIONE ULTRA: Incolla direttamente senza click/backspace (più veloce!)
          // Search by VARIANT ID instead of article name for precise matching
          const searchQuery = selectedVariant.id;

          // Ottieni il selector dall'elemento
          const inputSelector = await searchInput.evaluate((el) => {
            const htmlEl = el as HTMLInputElement;
            if (htmlEl.id) return `#${htmlEl.id}`;
            if (htmlEl.placeholder)
              return `input[placeholder="${htmlEl.placeholder}"]`;
            return null;
          });

          if (inputSelector) {
            await this.page!.evaluate(
              (selector: string, value: string) => {
                const input = document.querySelector(
                  selector,
                ) as HTMLInputElement | null;
                if (input) {
                  input.value = value;
                  input.focus();
                  input.dispatchEvent(
                    new Event("input", { bubbles: true }),
                    "form.article",
                  );
                  input.dispatchEvent(
                    new Event("change", { bubbles: true }),
                    "form.article",
                  );
                }
              },
              inputSelector,
              searchQuery,
            );
          }

          await this.page!.keyboard.press("Enter");

          // STEP 3: Aspetta risultati articoli (timeout ottimizzato)
          try {
            await this.page!.waitForSelector('tr[class*="dxgvDataRow"]', {
              visible: true,
              timeout: 1000, // Ottimizzato da 3000ms
            });
            // Attesa minima di stabilizzazione
            await this.wait(100);
          } catch {
            // Fallback ridotto
            await this.wait(300);
          }
        });

        await this.runOp(`order.item.${i}.article.select_row`, async () => {
          const rowSelectors = [
            `#${inventtableBaseId}_DDD_gv_DXMainTable tr`,
            `[id*="${inventtableBaseId}_DDD_gv_DXMainTable"] tr`,
            'tr[class*="dxgvDataRow"]',
            "tr[data-idx]",
          ];

          let rows: Array<import("puppeteer").ElementHandle<Element>> = [];
          for (const selector of rowSelectors) {
            const found = popupContainer
              ? await popupContainer.$$(selector)
              : await this.page.$$(selector);
            if (found.length > 0) {
              rows = found;
              break;
            }
          }

          // Match row by variant ID (more precise than article name)
          let selectedRow = null;
          let matchedText = "";

          for (const row of rows) {
            const text = await row.evaluate((el) =>
              (el.textContent ?? "").toString(),
            );

            // NEW: Match by variant ID for precise selection
            if (text.includes(selectedVariant.id)) {
              selectedRow = row;
              matchedText = text.substring(0, 100);
              break;
            }
          }

          if (!selectedRow) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-article-row-${i}.png`,
            // fullPage: true,
            // });
            throw new Error(
              `Variant ID ${selectedVariant.id} not found in Archibald popup. ` +
                `Expected article: ${item.articleCode}, package: ${selectedVariant.packageContent}`,
            );
          }

          logger.info(
            `Selected row for variant ${selectedVariant.id} (match: ${matchedText})`,
          );

          // Scroll into view
          await selectedRow.evaluate((el) =>
            el.scrollIntoView({ block: "center" }),
          );
          await this.wait(100);

          // FIX: Le righe <tr> non sono cliccabili, clicca sulla prima cella <td>
          let clickableElement = selectedRow;
          try {
            const firstCell = await selectedRow.$("td");
            if (firstCell) {
              clickableElement = firstCell;
              logger.debug("Trovata cella <td> cliccabile nella riga");
            }
          } catch {
            logger.debug("Nessuna cella <td> trovata, clicco sulla riga");
          }

          // Click with retry
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await clickableElement.click();
              logger.debug(`Click riuscito (attempt ${attempt})`);
              break;
            } catch (error: unknown) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              logger.warn(`Click attempt ${attempt}/3 failed: ${errorMsg}`);
              if (attempt === 3) {
                // Ultimo tentativo: usa click JavaScript diretto
                try {
                  await clickableElement.evaluate((el) =>
                    (el as HTMLElement).click(),
                  );
                  logger.debug("Click JavaScript riuscito come fallback");
                  break;
                } catch {
                  throw error;
                }
              }
              await this.wait(300);
            }
          }

          // OTTIMIZZAZIONE: Aspetta che il popup si chiuda invece di 800ms fissi
          try {
            await this.page!.waitForFunction(
              (baseId: string) => {
                const popup = document.querySelector(
                  `#${baseId}_DDD`,
                ) as HTMLElement | null;
                return (
                  !popup ||
                  popup.style.display === "none" ||
                  popup.offsetParent === null
                );
              },
              { timeout: 2000, polling: 100 },
              inventtableBaseId,
            );
          } catch {
            // Fallback
            await this.wait(300);
          }

          // Populate article metadata for tracking
          item.articleId = selectedVariant.id;
          item.packageContent = selectedVariant.packageContent
            ? parseInt(selectedVariant.packageContent)
            : undefined;

          logger.debug(`Article metadata populated`, {
            articleId: item.articleId,
            packageContent: item.packageContent,
          });

          // await this.page!.screenshot({
          // path: `logs/order-step5-article-selected-${i}.png`,
          // fullPage: true,
          // });
        });

        // CRITICO: Aspetta che DevExpress finisca di caricare l'articolo
        // Il "Loading..." indica che sta rigenerando la riga con nuovo ID
        await this.runOp(`order.item.${i}.wait_loading_complete`, async () => {
          logger.debug(
            "Attendo che DevExpress completi il caricamento articolo...",
          );

          try {
            // Aspetta che il loading indicator sparisca (massimo 10 secondi)
            await this.page.waitForFunction(
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
              { timeout: 3000, polling: 100 },
            );

            // Aspetta ulteriore 500ms per sicurezza che DOM sia stabile
            await this.wait(500);
            logger.debug("DevExpress ha completato il caricamento");
          } catch (error) {
            logger.warn(
              "Timeout waiting for loading indicator, continuo comunque...",
            );
          }
        });

        // 4.3: Inserisci quantità articolo prima del salvataggio
        const quantityValue = item.quantity ?? 1;
        let quantityInputId = "";
        let quantityBaseId = "";
        let quantityInput = null;

        await this.runOp(`order.item.${i}.quantity.find_input`, async () => {
          logger.debug(`Imposto quantità articolo: ${quantityValue}`);

          // OTTIMIZZAZIONE: Usa evaluate() per trovare il campo QTYORDERED (molto più veloce!)
          const qtyFieldInfo = await this.page!.evaluate(() => {
            // Cerca nella riga editnew più recente (ordinata per ID decrescente)
            const editRows = Array.from(
              document.querySelectorAll(
                '[id*="dviSALESLINEs"] tr[id*="editnew"]',
              ),
            );

            editRows.sort((a, b) => {
              const aEl = a as HTMLElement;
              const bEl = b as HTMLElement;
              const aNum = parseInt(
                (aEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              const bNum = parseInt(
                (bEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              return bNum - aNum;
            });

            // Cerca QTYORDERED nella prima riga (la più recente)
            for (const row of editRows) {
              const inputs = Array.from(
                (row as any).querySelectorAll('input[id*="QTYORDERED_Edit"]'),
              );

              for (const input of inputs) {
                const inp = input as any;
                // Salta campi nascosti e assicurati che finisca con _I
                if (inp.offsetParent === null) continue;
                if (!inp.id.endsWith("_I")) continue;

                return {
                  id: inp.id,
                  found: true,
                };
              }
            }

            // Fallback: cerca ovunque
            const allInputs = Array.from(
              document.querySelectorAll(
                'input[id*="QTYORDERED_Edit"][id$="_I"]',
              ),
            );

            for (const input of allInputs) {
              const inp = input as any;
              if (inp.offsetParent !== null) {
                return { id: inp.id, found: true };
              }
            }

            return { id: "", found: false };
          });

          if (!qtyFieldInfo.found) {
            throw new Error("Campo quantità articolo non trovato");
          }

          quantityInputId = qtyFieldInfo.id;
          quantityBaseId = quantityInputId.endsWith("_I")
            ? quantityInputId.slice(0, -2)
            : quantityInputId;

          logger.debug(`Campo QTYORDERED trovato: ${quantityInputId}`);

          // Ora seleziona il campo
          quantityInput = await this.page!.$(`#${quantityInputId}`);
          if (!quantityInput) {
            throw new Error(
              `Campo QTYORDERED con ID ${quantityInputId} non trovato nel DOM`,
            );
          }
        });

        await this.runOp(`order.item.${i}.quantity.activate_cell`, async () => {
          // IMPORTANTE: Attendi un po' per stabilizzazione DOM dopo loading
          await this.wait(300);

          // Ri-ottieni SEMPRE gli elementi fresh prima del click
          quantityInput = await this.page!.$(`#${quantityInputId}`);

          if (!quantityInput) {
            throw new Error("Campo quantita articolo non trovato");
          }

          // Prova prima con la cella, se fallisce usa l'input diretto
          const quantityCell = await this.page!.$(`#${quantityBaseId}`);

          let clicked = false;
          if (quantityCell) {
            try {
              // Verifica che sia cliccabile
              const box = await quantityCell.boundingBox();
              if (box) {
                await quantityCell.click({ clickCount: 2 });
                await this.wait(200);
                clicked = true;
              }
            } catch (error: unknown) {
              // Se detached o altro errore, fallback all'input
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              logger.debug(
                `Click su quantityCell fallito (${errorMsg}), uso input diretto`,
              );
            }
          }

          // Fallback: click diretto sull'input
          if (!clicked) {
            // Ri-ottieni input fresh
            quantityInput = await this.page!.$(`#${quantityInputId}`);
            if (!quantityInput) {
              throw new Error("Campo quantita articolo non trovato dopo retry");
            }
            await quantityInput.click({ clickCount: 2 });
            await this.wait(200);
          }
        });

        const formatQuantity = (value: number): string => {
          const fixed = Number.isInteger(value)
            ? value.toFixed(0)
            : value.toFixed(2);
          return fixed.replace(".", ",");
        };

        await this.runOp(`order.item.${i}.quantity.type`, async () => {
          if (!quantityInput) {
            throw new Error("Campo quantita articolo non trovato");
          }

          await quantityInput.focus();
          await this.page.keyboard.down("Control");
          await this.page.keyboard.press("A");
          await this.page.keyboard.up("Control");
          await this.page.keyboard.press("Backspace");
          await quantityInput.type(formatQuantity(quantityValue), {
            delay: 30,
          });
          await this.page.keyboard.press("Enter");
          await this.page.keyboard.press("Tab");
        });

        await this.runOp(`order.item.${i}.quantity.verify`, async () => {
          if (!quantityInput) {
            throw new Error("Campo quantita articolo non trovato");
          }

          const readQuantityValue = async (): Promise<string> => {
            return quantityInput.evaluate(
              (el) => (el as HTMLInputElement).value || "",
            );
          };

          await this.wait(600);
          const rawValue = await readQuantityValue();
          logger.debug(`Quantita inserita (raw): "${rawValue}"`);

          const parsedValue = Number(
            rawValue
              .replace(/\s/g, "")
              .replace(/\./g, "")
              .replace(",", ".")
              .replace(/[^\d.]/g, ""),
          );

          if (!Number.isNaN(parsedValue) && parsedValue !== quantityValue) {
            await quantityInput.evaluate((el, value) => {
              const input = el as HTMLInputElement;
              input.value = value;
              input.dispatchEvent(
                new Event("input", { bubbles: true }),
                "form.article",
              );
              input.dispatchEvent(
                new Event("change", { bubbles: true }),
                "form.article",
              );
              input.blur();
            }, formatQuantity(quantityValue));

            const devExpressSet = await this.page.evaluate(
              (baseId, numericValue, textValue) => {
                const w = window as any;
                const collection =
                  w.ASPxClientControl?.GetControlCollection?.() ||
                  w.ASPx?.GetControlCollection?.();
                if (!collection) return null;

                const byName =
                  collection.GetByName?.(baseId) ||
                  collection.GetByName?.(baseId.replace(/_/g, "$"));
                const control = byName || collection.GetById?.(baseId);
                if (!control) return null;

                if (control.SetValue) {
                  control.SetValue(numericValue);
                } else if (control.SetText) {
                  control.SetText(textValue);
                }
                if (control.RaiseValueChanged) {
                  control.RaiseValueChanged();
                }
                return true;
              },
              quantityBaseId,
              quantityValue,
              formatQuantity(quantityValue),
            );

            logger.debug(`Quantita set via DevExpress: ${devExpressSet}`);

            await this.page.keyboard.press("Tab");
            await this.wait(600);
            const rawRetry = await readQuantityValue();
            logger.debug(`Quantita dopo retry (raw): "${rawRetry}"`);
          }
        });

        // 4.3.5: STEP 13 - Inserisci sconto se presente nel PWA
        if (item.discount && item.discount > 0) {
          let discountInputId = "";
          let discountBaseId = "";
          let discountInput: ElementHandle<Element> | null = null;

          await this.runOp(`order.item.${i}.discount.find_input`, async () => {
            logger.debug(`Imposto sconto articolo: ${item.discount}%`);

            // Cerca il campo sconto (LINEDISC, DISCOUNT, etc.)
            const discountFieldInfo = await this.page!.evaluate(() => {
              // Cerca nella riga editnew più recente
              const editRows = Array.from(
                document.querySelectorAll(
                  '[id*="dviSALESLINEs"] tr[id*="editnew"]',
                ),
              );

              editRows.sort((a, b) => {
                const aEl = a as HTMLElement;
                const bEl = b as HTMLElement;
                const aNum = parseInt(
                  (aEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
                );
                const bNum = parseInt(
                  (bEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
                );
                return bNum - aNum;
              });

              // Cerca LINEDISC o DISCOUNT nella prima riga (la più recente)
              for (const row of editRows) {
                const inputs = Array.from(
                  (row as any).querySelectorAll(
                    'input[id*="LINEDISC_Edit"], input[id*="DISCOUNT_Edit"], input[id*="Discount_Edit"]',
                  ),
                );

                for (const input of inputs) {
                  const inp = input as any;
                  // Salta campi nascosti
                  if (inp.offsetParent === null) continue;
                  if (!inp.id.endsWith("_I")) continue;

                  return {
                    id: inp.id,
                    found: true,
                  };
                }
              }

              // Fallback: cerca ovunque
              const allInputs = Array.from(
                document.querySelectorAll(
                  'input[id*="LINEDISC_Edit"][id$="_I"], input[id*="DISCOUNT_Edit"][id$="_I"], input[id*="Discount_Edit"][id$="_I"]',
                ),
              );

              for (const input of allInputs) {
                const inp = input as any;
                if (inp.offsetParent !== null) {
                  return { id: inp.id, found: true };
                }
              }

              return { id: "", found: false };
            });

            if (!discountFieldInfo.found) {
              logger.warn("Campo sconto non trovato, salto questo step");
              return; // Non bloccante, continua senza sconto
            }

            discountInputId = discountFieldInfo.id;
            discountBaseId = discountInputId.endsWith("_I")
              ? discountInputId.slice(0, -2)
              : discountInputId;

            logger.debug(`Campo SCONTO trovato: ${discountInputId}`);

            // Seleziona il campo
            discountInput = await this.page!.$(`#${discountInputId}`);
            if (!discountInput) {
              logger.warn(
                `Campo sconto con ID ${discountInputId} non trovato nel DOM`,
              );
              return;
            }
          });

          // Se il campo sconto non è stato trovato, salta
          if (!discountInput) {
            logger.warn("Campo sconto non trovato, continuo senza");
          } else {
            await this.runOp(
              `order.item.${i}.discount.activate_cell`,
              "form.discount",
              async () => {
                // Attendi stabilizzazione DOM
                await this.wait(300);

                // Ri-ottieni l'elemento fresh
                discountInput = await this.page!.$(`#${discountInputId}`);

                if (!discountInput) {
                  logger.warn("Campo sconto non trovato");
                  return;
                }

                // Prova prima con la cella, con fallback all'input
                const discountCell = await this.page!.$(`#${discountBaseId}`);

                let clicked = false;
                if (discountCell) {
                  try {
                    const box = await discountCell.boundingBox();
                    if (box) {
                      await discountCell.click({ clickCount: 2 });
                      await this.wait(200);
                      clicked = true;
                    }
                  } catch (error: unknown) {
                    const errorMsg =
                      error instanceof Error ? error.message : String(error);
                    logger.debug(
                      `Click su discountCell fallito (${errorMsg}), uso input diretto`,
                    );
                  }
                }

                // Fallback: click diretto
                if (!clicked) {
                  discountInput = await this.page!.$(`#${discountInputId}`);
                  if (discountInput) {
                    await discountInput.click({ clickCount: 2 });
                    await this.wait(200);
                  }
                }
              },
            );

            const formatDiscount = (value: number): string => {
              const fixed = Number.isInteger(value)
                ? value.toFixed(0)
                : value.toFixed(2);
              return fixed.replace(".", ",");
            };

            await this.runOp(`order.item.${i}.discount.type`, async () => {
              if (!discountInput) {
                return;
              }

              await discountInput.focus();
              await this.page.keyboard.down("Control");
              await this.page.keyboard.press("A");
              await this.page.keyboard.up("Control");
              await this.page.keyboard.press("Backspace");
              await discountInput.type(formatDiscount(item.discount!), {
                delay: 30,
              });
              // STEP 13: Premi Invio dopo aver inserito lo sconto
              await this.page.keyboard.press("Enter");
              await this.page.keyboard.press("Tab");

              logger.info(`✅ Sconto inserito: ${item.discount}%`);
            });

            await this.runOp(`order.item.${i}.discount.verify`, async () => {
              // Attendi che il valore si stabilizzi
              await this.wait(600);

              const discountValue = await discountInput!.evaluate(
                (el) => (el as HTMLInputElement).value || "",
              );
              logger.debug(
                `Sconto inserito (valore finale): "${discountValue}"`,
              );
            });
          }
        } else {
          // STEP 14: Se non presente sconto, procedere oltre
          logger.debug("Nessuno sconto da applicare, procedo");
        }

        // 4.4: Click su pulsante "Update" per salvare l'articolo
        // Il pulsante ha title="Update" e id che contiene "DXCBtn0Img"
        await this.runOp(`order.item.${i}.save_article`, async () => {
          logger.debug("Cerco pulsante Update per salvare articolo...");

          const updateButtonClicked = await this.page.evaluate(() => {
            // FIXED: Accetta qualsiasi DXCBtn, non solo DXCBtn0
            const updateButtons = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[title="Update"], img[alt="Update"]',
              ),
            ).filter((el) => {
              const visible = el.offsetParent !== null;
              const hasDXCBtn =
                el.id.includes("DXCBtn") && el.id.includes("Img");
              const hasSalesLine = el.id.includes("SALESLINE");
              return visible && hasDXCBtn && hasSalesLine;
            });

            if (updateButtons.length > 0) {
              const btn = updateButtons[0];
              btn.click();
              return true;
            }

            // Fallback: cerca qualsiasi Update con DXCBtn
            const fallbackButtons = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[title="Update"], img[alt="Update"]',
              ),
            ).filter((el) => {
              const visible = el.offsetParent !== null;
              const hasDXCBtn =
                el.id.includes("DXCBtn") && el.id.includes("Img");
              return visible && hasDXCBtn;
            });

            if (fallbackButtons.length > 0) {
              const btn = fallbackButtons[0];
              btn.click();
              return true;
            }

            return false;
          });

          if (!updateButtonClicked) {
            throw new Error(
              'Pulsante "Update" per salvare articolo non trovato',
            );
          }

          logger.debug("Pulsante Update cliccato, attendo salvataggio...");
          await this.wait(2000);

          // await this.page.screenshot({
          // path: `logs/order-step6-article-saved-${i}.png`,
          // fullPage: true,
          // });

          logger.info(`Articolo ${i + 1}/${orderData.items.length} salvato`);
        });
      }

      logger.info(
        "🤖 BOT: Tutti gli articoli inseriti con successo, ora salvo l'ordine",
      );

      // 5. STEP 6.4: Click su "Salva e chiudi"
      const orderId = await this.runOp("order.save_and_close", async () => {
        logger.info('🤖 BOT: Click su "Salva e chiudi" per salvare l\'ordine');
        logger.debug('Cerco azione "Salva e chiudi"...');

        // await this.page!.screenshot({
        // path: "logs/order-step7-before-final-save.png",
        // fullPage: true,
        // });

        const tryClickSaveAndClose = async (): Promise<string | null> => {
          if (!this.page) return null;

          return this.page.evaluate(() => {
            const candidates = Array.from(
              document.querySelectorAll(
                'button, a, span, div, img, input[type="button"], input[type="submit"]',
              ),
            );

            const directTargets = [
              "salva e chiudi",
              "salvare e chiudere",
              "save and close",
            ];

            for (const el of candidates) {
              if ((el as HTMLElement).offsetParent === null) continue;
              const text = (el.textContent ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              const attr = [
                (el as HTMLElement).getAttribute?.("title") ?? "",
                (el as HTMLElement).getAttribute?.("aria-label") ?? "",
                (el as HTMLImageElement).alt ?? "",
              ]
                .join(" ")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");

              if (
                directTargets.some((term) => text === term || attr === term)
              ) {
                (el as HTMLElement).click();
                return "direct-text";
              }
            }

            for (const el of candidates) {
              if ((el as HTMLElement).offsetParent === null) continue;
              const text = (el.textContent ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              const attr = [
                (el as HTMLElement).getAttribute?.("title") ?? "",
                (el as HTMLElement).getAttribute?.("aria-label") ?? "",
                (el as HTMLImageElement).alt ?? "",
              ]
                .join(" ")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              const hasSave =
                text.includes("salva") ||
                text.includes("salvare") ||
                attr.includes("salva") ||
                attr.includes("salvare") ||
                text.includes("save") ||
                attr.includes("save");
              const hasClose =
                text.includes("chiudi") ||
                attr.includes("chiudi") ||
                text.includes("close") ||
                attr.includes("close");

              if (hasSave && hasClose) {
                (el as HTMLElement).click();
                return "combined-text";
              }
            }

            return null;
          });
        };

        let saveMethod = await tryClickSaveAndClose();

        if (!saveMethod) {
          logger.debug('Apro il menu "Salvare" per mostrare le opzioni...');

          const dropdownOpened = await this.page!.evaluate(() => {
            const dropdownSelectors = [
              'div[id*="mainMenu_Menu_DXI"][id*="_P"]',
              'div[id*="mainMenu_Menu_DXI"][id*="_p"]',
              '[class*="dxm-subMenu"]',
              '[class*="dxm-dropDown"]',
            ];

            for (const selector of dropdownSelectors) {
              const el = document.querySelector(selector);
              if (el && (el as HTMLElement).offsetParent !== null) {
                (el as HTMLElement).click();
                return true;
              }
            }

            const saveLabels = Array.from(
              document.querySelectorAll("span, a, div, button"),
            ).filter((el) => (el as HTMLElement).offsetParent !== null);

            const saveLabel = saveLabels.find((el) => {
              const text = (el.textContent ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              return text === "salvare" || text === "salva";
            });

            if (saveLabel) {
              (saveLabel as HTMLElement).click();
              return true;
            }

            return false;
          });

          if (!dropdownOpened) {
            logger.warn('Menu "Salvare" non trovato, provo alternative');
          } else {
            logger.debug("Menu aperto, attendo render submenu...");
            await this.wait(1500);

            // await this.page!.screenshot({
            // path: "logs/order-step7-dropdown-opened.png",
            // fullPage: true,
            // });
          }

          saveMethod = await tryClickSaveAndClose();
        }

        if (!saveMethod) {
          logger.debug("Fallback: cerco pulsante di salvataggio visibile...");

          const fallbackClicked = await this.page!.evaluate(() => {
            const candidates = Array.from(
              document.querySelectorAll(
                'button, a, img, input[type="button"], input[type="submit"]',
              ),
            );

            for (const el of candidates) {
              if ((el as HTMLElement).offsetParent === null) continue;
              const attr = [
                (el as HTMLElement).getAttribute?.("title") ?? "",
                (el as HTMLElement).getAttribute?.("aria-label") ?? "",
                (el as HTMLImageElement).alt ?? "",
                (el as HTMLImageElement).src ?? "",
              ]
                .join(" ")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              if (
                attr.includes("salva") ||
                attr.includes("salvare") ||
                attr.includes("save") ||
                attr.includes("ok") ||
                attr.includes("check")
              ) {
                (el as HTMLElement).click();
                return true;
              }
            }

            return false;
          });

          if (fallbackClicked) {
            saveMethod = "fallback-save";
          }
        }

        if (!saveMethod) {
          logger.error('Pulsante "Salva e chiudi" non trovato');
          // await this.page!.screenshot({
          // path: "logs/order-error-no-save-button.png",
          // fullPage: true,
          // });
          throw new Error('Pulsante "Salva e chiudi" non trovato');
        }

        logger.debug(
          `Azione salvataggio cliccata (${saveMethod}), attendo conferma...`,
        );

        // 9. Attendi salvataggio - può essere redirect O aggiornamento AJAX
        try {
          // Prova prima con navigation (con timeout ridotto)
          await this.page!.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 1500,
          });
          logger.debug("Navigation rilevata dopo salvataggio");
        } catch (navError) {
          // Se non c'è navigation, aspetta che DevExpress completi l'operazione
          logger.debug("Nessuna navigation, attendo completamento AJAX...");

          await this.wait(2000);

          // Verifica che non ci siano più indicatori di caricamento
          try {
            await this.page!.waitForFunction(
              () => {
                const loadingIndicators = Array.from(
                  document.querySelectorAll(
                    '[id*="LPV"], .dxlp, .dxlpLoadingPanel',
                  ),
                );
                return loadingIndicators.every(
                  (el) =>
                    (el as HTMLElement).style.display === "none" ||
                    (el as HTMLElement).offsetParent === null,
                );
              },
              { timeout: 3000, polling: 100 },
            );
          } catch {
            logger.warn("Timeout waiting for loading indicators after save");
          }
        }

        // 10. Estrai ID ordine dall'URL o dalla pagina
        const currentUrl = this.page!.url();
        const orderIdMatch = currentUrl.match(/\/(\d+)\//);
        let orderId = orderIdMatch ? orderIdMatch[1] : "UNKNOWN";

        // Se l'ID non è nell'URL, prova a cercarlo nella pagina
        if (orderId === "UNKNOWN") {
          try {
            orderId = await this.page!.evaluate(() => {
              // Cerca nel campo ID ordine
              const idField = document.querySelector(
                'input[id*="SALESID"]',
              ) as HTMLInputElement;
              if (idField && idField.value) {
                return idField.value;
              }

              // Cerca in elementi con testo che contiene un numero ordine
              const textElements = Array.from(
                document.querySelectorAll("*"),
              ).filter((el) => {
                const text = el.textContent || "";
                return (
                  /ordine\s*:\s*\d+/i.test(text) ||
                  /order\s*:\s*\d+/i.test(text)
                );
              });

              for (const el of textElements) {
                const match = (el.textContent || "").match(/\d{5,}/);
                if (match) return match[0];
              }

              return "SAVED";
            });
          } catch {
            orderId = "SAVED";
          }
        }

        logger.info("Ordine creato con successo!", {
          orderId,
          url: currentUrl,
        });

        return orderId;
      });

      logger.info("🤖 BOT: FINE creazione ordine", {
        orderId,
        customerName: orderData.customerName,
        itemsCount: orderData.items.length,
      });

      return orderId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : "";
      logger.error("Errore durante creazione ordine", {
        errorMessage,
        errorStack,
        orderData,
      });
      throw error;
    }
  }

  async getCustomers(): Promise<
    Array<{ id: string; name: string; vatNumber?: string; email?: string }>
  > {
    return this.runOp("getCustomers", "login", async () => {
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
            const vatNumber = (cells[4] as Element)?.textContent?.trim() || "";
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
    });
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
      logger.info(`Context released for user ${this.userId}, success=${!this.hasError}`);
    } else if (this.browser) {
      // Legacy mode: close browser
      await this.browser.close();
      this.browser = null;
      logger.info("Browser chiuso (legacy mode)");
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
}
