import { EventEmitter } from "events";
import { CustomerSyncService } from "./customer-sync-service";
import { ProductSyncService } from "./product-sync-service";
import { PriceSyncService } from "./price-sync-service";
import { OrderSyncService } from "./order-sync-service";
import { DDTSyncService } from "./ddt-sync-service";
import { InvoiceSyncService } from "./invoice-sync-service";
import { logger } from "./logger";
import { UserDatabase } from "./user-db";

export type SyncType =
  | "customers"
  | "products"
  | "prices"
  | "orders"
  | "ddt"
  | "invoices";

export interface SyncRequest {
  type: SyncType;
  priority: number;
  requestedAt: Date;
  userId?: string;
}

export interface SyncStatus {
  type: SyncType;
  isRunning: boolean;
  lastRunTime: Date | null;
  queuePosition: number | null;
}

export interface OrchestratorStatus {
  currentSync: SyncType | null;
  queue: SyncRequest[];
  statuses: Record<SyncType, SyncStatus>;
  smartCustomerSyncActive: boolean;
  sessionCount: number;
  safetyTimeoutActive: boolean;
}

/**
 * Centralized coordinator for all sync operations.
 * Ensures mutual exclusion - only one sync runs at a time.
 * Handles priority queueing and Smart Customer Sync.
 */
export class SyncOrchestrator extends EventEmitter {
  private static instance: SyncOrchestrator;

  // Sync services
  private customerSync: CustomerSyncService;
  private productSync: ProductSyncService;
  private priceSync: PriceSyncService;
  private orderSync: OrderSyncService;
  private ddtSync: DDTSyncService;
  private invoiceSync: InvoiceSyncService;

  // Mutex and queue
  private currentSync: SyncType | null = null;
  private queue: SyncRequest[] = [];
  private lastRunTimes: Record<SyncType, Date | null> = {
    customers: null,
    products: null,
    prices: null,
    orders: null,
    ddt: null,
    invoices: null,
  };

  // Smart Customer Sync tracking
  private smartCustomerSyncActive = false;
  private sessionCount = 0;
  private safetyTimeout: NodeJS.Timeout | null = null;
  private readonly SAFETY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  // Auto-sync scheduling
  private autoSyncTimers: NodeJS.Timeout[] = [];
  private autoSyncIntervals: NodeJS.Timeout[] = [];

  // Sync history tracking (max 100 entries per type)
  private syncHistory: Record<
    SyncType,
    Array<{
      timestamp: Date;
      duration: number; // milliseconds
      success: boolean;
      error: string | null;
      syncType: SyncType;
    }>
  > = {
    customers: [],
    products: [],
    prices: [],
    orders: [],
    ddt: [],
    invoices: [],
  };
  private readonly MAX_HISTORY_PER_TYPE = 100;

  // Custom interval overrides (in minutes)
  private customIntervals: Partial<Record<SyncType, number>> = {};

  private constructor() {
    super();
    this.customerSync = CustomerSyncService.getInstance();
    this.productSync = ProductSyncService.getInstance();
    this.priceSync = PriceSyncService.getInstance();
    this.orderSync = OrderSyncService.getInstance();
    this.ddtSync = DDTSyncService.getInstance();
    this.invoiceSync = InvoiceSyncService.getInstance();
  }

  static getInstance(): SyncOrchestrator {
    if (!SyncOrchestrator.instance) {
      SyncOrchestrator.instance = new SyncOrchestrator();
    }
    return SyncOrchestrator.instance;
  }

  /**
   * Get default priority for a sync type.
   * Higher number = higher priority.
   */
  private getDefaultPriority(type: SyncType): number {
    const priorities: Record<SyncType, number> = {
      orders: 6, // Highest priority (real-time data, most critical)
      customers: 5, // High priority (needed for orders)
      ddt: 4, // Medium-high priority (transport documents)
      invoices: 3, // Medium priority (financial data)
      products: 2, // Products before prices (needed for price matching)
      prices: 1, // Lowest priority (requires products to exist first)
    };
    return priorities[type];
  }

  /**
   * Request a sync operation.
   * Adds to queue if another sync is running, otherwise starts immediately.
   */
  async requestSync(
    type: SyncType,
    priority?: number,
    userId?: string,
  ): Promise<void> {
    const finalPriority = priority ?? this.getDefaultPriority(type);

    // If Smart Customer Sync is active, queue non-customer syncs
    if (this.smartCustomerSyncActive && type !== "customers") {
      logger.info(
        `[SyncOrchestrator] Smart Customer Sync active, queueing ${type}`,
      );
      this.addToQueue(type, finalPriority, userId);
      return;
    }

    // If a sync is already running, queue this request
    if (this.currentSync !== null) {
      logger.info(
        `[SyncOrchestrator] ${this.currentSync} sync in progress, queueing ${type}`,
      );
      this.addToQueue(type, finalPriority, userId);
      return;
    }

    // No sync running, start immediately
    await this.executeSync(type, userId);
  }

  /**
   * Add sync request to priority queue.
   */
  private addToQueue(type: SyncType, priority: number, userId?: string): void {
    // Check if already queued
    const existingIndex = this.queue.findIndex((req) => req.type === type);
    if (existingIndex !== -1) {
      // Update priority if higher
      if (priority > this.queue[existingIndex].priority) {
        this.queue[existingIndex].priority = priority;
        this.sortQueue();
      }
      return;
    }

    // Add new request
    this.queue.push({
      type,
      priority,
      requestedAt: new Date(),
      userId,
    });

    this.sortQueue();
    this.emit("queue-updated", this.getStatus());
  }

  /**
   * Sort queue by priority (highest first).
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute a sync operation.
   */
  private async executeSync(type: SyncType, userId?: string): Promise<void> {
    this.currentSync = type;
    const startTime = Date.now();
    let success = false;
    let errorMessage: string | null = null;

    this.emit("sync-started", { type });

    logger.info(`[SyncOrchestrator] Starting ${type} sync`, { userId });

    // Default userId for sync operations: use first admin user if not provided
    let defaultUserId = userId;
    if (!defaultUserId) {
      const userDb = UserDatabase.getInstance();
      const adminUser = userDb.getAllUsers().find(u => u.role === 'admin');
      if (adminUser) {
        defaultUserId = adminUser.id;
        logger.info(`[SyncOrchestrator] Using admin user ${adminUser.username} (${adminUser.id}) for auto-sync`);
      } else {
        defaultUserId = "sync-orchestrator";
        logger.warn(`[SyncOrchestrator] No admin user found, falling back to 'sync-orchestrator'`);
      }
    }

    try {
      switch (type) {
        case "customers":
          await this.customerSync.syncCustomers(undefined, defaultUserId);
          break;
        case "products":
          await this.productSync.syncProducts();
          break;
        case "prices":
          await this.priceSync.syncPrices();
          break;
        case "orders":
          await this.orderSync.syncOrders(defaultUserId);
          break;
        case "ddt":
          await this.ddtSync.syncDDT(defaultUserId);
          break;
        case "invoices":
          await this.invoiceSync.syncInvoices(defaultUserId);
          break;
      }

      success = true;
      this.lastRunTimes[type] = new Date();
      logger.info(`[SyncOrchestrator] Completed ${type} sync`);
      this.emit("sync-completed", { type });
    } catch (error: any) {
      success = false;
      errorMessage = error?.message || String(error);
      logger.error(`[SyncOrchestrator] Error in ${type} sync:`, {
        error: errorMessage,
        stack: error?.stack,
      });
      this.emit("sync-error", { type, error });
    } finally {
      const duration = Date.now() - startTime;

      // Record history entry
      this.addHistoryEntry(type, duration, success, errorMessage);

      this.currentSync = null;
      await this.processQueue();
    }
  }

  /**
   * Process next item in queue.
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    // If Smart Customer Sync is active, don't process queue
    if (this.smartCustomerSyncActive) {
      logger.info(
        "[SyncOrchestrator] Smart Customer Sync active, not processing queue",
      );
      return;
    }

    const nextRequest = this.queue.shift();
    if (nextRequest) {
      await this.executeSync(nextRequest.type, nextRequest.userId);
    }
  }

  /**
   * Smart Customer Sync: fast, on-demand sync triggered when entering order form.
   * Pauses other syncs to ensure quick completion (3-5 seconds).
   */
  async smartCustomerSync(): Promise<void> {
    if (this.smartCustomerSyncActive) {
      logger.info(
        "[SyncOrchestrator] Smart Customer Sync already active, incrementing session count",
      );
      this.sessionCount++;
      this.resetSafetyTimeout();
      return;
    }

    logger.info("[SyncOrchestrator] Starting Smart Customer Sync");
    this.smartCustomerSyncActive = true;
    this.sessionCount = 1;
    this.resetSafetyTimeout();

    this.emit("smart-sync-started");

    try {
      // Wait for current sync to finish if one is running
      if (this.currentSync !== null && this.currentSync !== "customers") {
        logger.info(
          `[SyncOrchestrator] Waiting for ${this.currentSync} to complete`,
        );
        await this.waitForCurrentSync();
      }

      // Execute fast customer sync with high priority
      await this.requestSync("customers", 100);
    } catch (error) {
      logger.error("[SyncOrchestrator] Smart Customer Sync error:", error);
      this.smartCustomerSyncActive = false;
      this.sessionCount = 0;
      this.clearSafetyTimeout();
      throw error;
    }
  }

  /**
   * Resume other syncs when user exits order form.
   * Uses reference counting to handle multiple browser tabs.
   */
  resumeOtherSyncs(): void {
    if (!this.smartCustomerSyncActive) {
      logger.warn(
        "[SyncOrchestrator] Resume called but Smart Customer Sync not active",
      );
      return;
    }

    this.sessionCount--;
    logger.info(
      `[SyncOrchestrator] Session count decremented to ${this.sessionCount}`,
    );

    if (this.sessionCount <= 0) {
      this.sessionCount = 0;
      this.smartCustomerSyncActive = false;
      this.clearSafetyTimeout();

      logger.info(
        "[SyncOrchestrator] Smart Customer Sync ended, resuming queue",
      );
      this.emit("smart-sync-ended");

      // Process queued syncs
      this.processQueue();
    } else {
      this.resetSafetyTimeout();
    }
  }

  /**
   * Wait for current sync to complete.
   */
  private waitForCurrentSync(): Promise<void> {
    return new Promise((resolve) => {
      if (this.currentSync === null) {
        resolve();
        return;
      }

      const onComplete = () => {
        this.off("sync-completed", onComplete);
        this.off("sync-error", onComplete);
        resolve();
      };

      this.on("sync-completed", onComplete);
      this.on("sync-error", onComplete);
    });
  }

  /**
   * Reset safety timeout: auto-resume syncs after 10 minutes of inactivity.
   */
  private resetSafetyTimeout(): void {
    this.clearSafetyTimeout();

    this.safetyTimeout = setTimeout(() => {
      logger.warn(
        "[SyncOrchestrator] Safety timeout reached, force-resuming syncs",
      );
      this.smartCustomerSyncActive = false;
      this.sessionCount = 0;
      this.emit("smart-sync-timeout");
      this.processQueue();
    }, this.SAFETY_TIMEOUT_MS);
  }

  /**
   * Clear safety timeout.
   */
  private clearSafetyTimeout(): void {
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
  }

  /**
   * Get current orchestrator status.
   */
  getStatus(): OrchestratorStatus {
    const statuses: Record<SyncType, SyncStatus> = {
      customers: {
        type: "customers",
        isRunning: this.currentSync === "customers",
        lastRunTime: this.lastRunTimes.customers,
        queuePosition: this.getQueuePosition("customers"),
      },
      products: {
        type: "products",
        isRunning: this.currentSync === "products",
        lastRunTime: this.lastRunTimes.products,
        queuePosition: this.getQueuePosition("products"),
      },
      prices: {
        type: "prices",
        isRunning: this.currentSync === "prices",
        lastRunTime: this.lastRunTimes.prices,
        queuePosition: this.getQueuePosition("prices"),
      },
      orders: {
        type: "orders",
        isRunning: this.currentSync === "orders",
        lastRunTime: this.lastRunTimes.orders,
        queuePosition: this.getQueuePosition("orders"),
      },
      ddt: {
        type: "ddt",
        isRunning: this.currentSync === "ddt",
        lastRunTime: this.lastRunTimes.ddt,
        queuePosition: this.getQueuePosition("ddt"),
      },
      invoices: {
        type: "invoices",
        isRunning: this.currentSync === "invoices",
        lastRunTime: this.lastRunTimes.invoices,
        queuePosition: this.getQueuePosition("invoices"),
      },
    };

    return {
      currentSync: this.currentSync,
      queue: [...this.queue],
      statuses,
      smartCustomerSyncActive: this.smartCustomerSyncActive,
      sessionCount: this.sessionCount,
      safetyTimeoutActive: this.safetyTimeout !== null,
    };
  }

  /**
   * Get queue position for a sync type (null if not queued).
   */
  private getQueuePosition(type: SyncType): number | null {
    const index = this.queue.findIndex((req) => req.type === type);
    return index === -1 ? null : index + 1;
  }

  /**
   * Start staggered auto-sync with approved frequencies
   *
   * Frequencies (based on research and user approval):
   * - Orders: 10min (T+0 start) - High priority, real-time data
   * - Customers: 30min (T+5 start) - Medium priority, needed for orders
   * - Prices: 30min (T+10 start) - CRITICAL, pricing errors = 1.8% margin loss
   * - Invoices: 30min (T+15 start) - Financial data, important
   * - DDT: 45min (T+20 start) - Transport documents, less frequent
   * - Products: 90min (T+30 start) - Catalog changes rare
   *
   * Staggered starts prevent resource spikes
   */
  startStaggeredAutoSync(): void {
    logger.info("[SyncOrchestrator] Starting staggered auto-sync...");

    // Get intervals (use custom if set, otherwise defaults)
    const intervals = this.getIntervals();

    // Define sync configurations
    const syncConfigs = [
      { type: "orders" as SyncType, interval: intervals.orders * 60 * 1000, startDelay: 0 },
      {
        type: "customers" as SyncType,
        interval: intervals.customers * 60 * 1000,
        startDelay: 5 * 60 * 1000,
      },
      {
        type: "prices" as SyncType,
        interval: intervals.prices * 60 * 1000,
        startDelay: 10 * 60 * 1000,
      },
      {
        type: "invoices" as SyncType,
        interval: intervals.invoices * 60 * 1000,
        startDelay: 15 * 60 * 1000,
      },
      {
        type: "ddt" as SyncType,
        interval: intervals.ddt * 60 * 1000,
        startDelay: 20 * 60 * 1000,
      },
      {
        type: "products" as SyncType,
        interval: intervals.products * 60 * 1000,
        startDelay: 30 * 60 * 1000,
      },
    ];

    // Start each sync with its configured interval and delay
    syncConfigs.forEach((config) => {
      const timer = setTimeout(() => {
        logger.info(
          `[SyncOrchestrator] Starting ${config.type} auto-sync (interval: ${config.interval / 60000}min)`,
        );

        // Initial sync
        this.requestSync(config.type);

        // Repeat at interval
        const intervalTimer = setInterval(() => {
          this.requestSync(config.type);
        }, config.interval);

        this.autoSyncIntervals.push(intervalTimer);
      }, config.startDelay);

      this.autoSyncTimers.push(timer);
    });

    logger.info("[SyncOrchestrator] Staggered auto-sync configured");
    logger.info("  Orders: 10min (T+0)");
    logger.info("  Customers: 30min (T+5)");
    logger.info("  Prices: 30min (T+10)");
    logger.info("  Invoices: 30min (T+15)");
    logger.info("  DDT: 45min (T+20)");
    logger.info("  Products: 90min (T+30)");
  }

  /**
   * Stop all auto-sync timers
   */
  stopAutoSync(): void {
    logger.info("[SyncOrchestrator] Stopping auto-sync...");

    // Clear all setTimeout timers
    this.autoSyncTimers.forEach((timer) => clearTimeout(timer));
    this.autoSyncTimers = [];

    // Clear all setInterval timers
    this.autoSyncIntervals.forEach((interval) => clearInterval(interval));
    this.autoSyncIntervals = [];

    logger.info("[SyncOrchestrator] Auto-sync stopped");
  }

  /**
   * Check if auto-sync is currently running
   */
  isAutoSyncRunning(): boolean {
    return this.autoSyncTimers.length > 0 || this.autoSyncIntervals.length > 0;
  }

  /**
   * Get sync history for a specific type or all types.
   */
  getHistory(
    type?: SyncType,
    limit?: number,
  ): Array<{
    timestamp: Date;
    duration: number;
    success: boolean;
    error: string | null;
    syncType: SyncType;
  }> {
    if (type) {
      const history = this.syncHistory[type];
      return limit ? history.slice(0, limit) : history;
    }

    // Return all history sorted by timestamp (newest first)
    const allHistory: Array<{
      timestamp: Date;
      duration: number;
      success: boolean;
      error: string | null;
      syncType: SyncType;
    }> = [];

    for (const syncType of Object.keys(this.syncHistory) as SyncType[]) {
      allHistory.push(...this.syncHistory[syncType]);
    }

    allHistory.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? allHistory.slice(0, limit) : allHistory;
  }

  /**
   * Add entry to sync history.
   * Maintains max 100 entries per type (FIFO).
   */
  private addHistoryEntry(
    type: SyncType,
    duration: number,
    success: boolean,
    error: string | null,
  ): void {
    const entry = {
      timestamp: new Date(),
      duration,
      success,
      error,
      syncType: type,
    };

    this.syncHistory[type].unshift(entry); // Add to front (newest first)

    // Trim to max size
    if (this.syncHistory[type].length > this.MAX_HISTORY_PER_TYPE) {
      this.syncHistory[type] = this.syncHistory[type].slice(
        0,
        this.MAX_HISTORY_PER_TYPE,
      );
    }
  }

  /**
   * Get current intervals for all sync types.
   */
  getIntervals(): Record<SyncType, number> {
    // Default intervals (in minutes)
    const defaults: Record<SyncType, number> = {
      orders: 10,
      customers: 30,
      prices: 30,
      invoices: 30,
      ddt: 45,
      products: 90,
    };

    // Merge with custom intervals if any
    return { ...defaults, ...this.customIntervals };
  }

  /**
   * Update sync interval for a specific type.
   * Dynamically restarts auto-sync with new intervals.
   */
  updateInterval(type: SyncType, intervalMinutes: number): void {
    if (intervalMinutes < 5 || intervalMinutes > 1440) {
      throw new Error("Interval must be between 5 and 1440 minutes");
    }

    logger.info(`[SyncOrchestrator] Updating ${type} interval to ${intervalMinutes} minutes`);

    // Stop current auto-sync
    this.stopAutoSync();

    // Update interval in custom intervals
    this.customIntervals[type] = intervalMinutes;

    // Restart auto-sync with new intervals
    this.startStaggeredAutoSync();

    logger.info(`[SyncOrchestrator] Auto-sync restarted with new ${type} interval`);
  }
}
