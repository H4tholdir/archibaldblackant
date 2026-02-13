import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { logger } from "./logger";
import { BrowserPool } from "./browser-pool";
import type { OrderData } from "./types";
import { config } from "./config";
import { PriorityManager } from "./priority-manager";
import { CustomerSyncService } from "./customer-sync-service";
import { ProductSyncService } from "./product-sync-service";
import { PriceSyncService } from "./price-sync-service";
import { OrderSyncService } from "./order-sync-service";
import { DDTSyncService } from "./ddt-sync-service";
import { InvoiceSyncService } from "./invoice-sync-service";
import { operationTracker } from "./operation-tracker";
import { PendingRealtimeService } from "./pending-realtime.service";
import { getProgressMilestone } from "./job-progress-mapper";
import Database from "better-sqlite3";
import path from "path";

const ordersDb = new Database(path.join(__dirname, "../data/orders-new.db"));

/**
 * Job data per la coda ordini
 */
export interface OrderJobData {
  orderData: OrderData;
  userId: string;
  username: string;
  timestamp: number;
  pendingOrderId: string;
}

/**
 * Risultato di un job
 */
export interface OrderJobResult {
  orderId: string;
  duration: number;
  timestamp: number;
}

/**
 * Queue Manager
 * Gestisce la coda di ordini con BullMQ + Redis
 */
export class QueueManager {
  private static instance: QueueManager;
  private queue: Queue<OrderJobData, OrderJobResult>;
  private worker: Worker<OrderJobData, OrderJobResult> | null = null;
  private redisConnection: Redis;
  private browserPool: BrowserPool;
  private onOrderStart?: () => boolean;
  private onOrderEnd?: () => void;
  private jobToPendingMap: Map<
    string,
    { userId: string; pendingOrderId: string }
  > = new Map();

  private constructor() {
    // Connessione Redis (usa Redis locale su porta 6379)
    this.redisConnection = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: null,
    });

    // Inizializza la coda
    this.queue = new Queue<OrderJobData, OrderJobResult>("orders", {
      connection: this.redisConnection as any,
    });

    // Inizializza il browser pool
    this.browserPool = BrowserPool.getInstance();

    // Register sync services with PriorityManager
    const priorityManager = PriorityManager.getInstance();
    priorityManager.registerService(
      "customer-sync",
      CustomerSyncService.getInstance(),
    );
    priorityManager.registerService(
      "product-sync",
      ProductSyncService.getInstance(),
    );
    priorityManager.registerService(
      "price-sync",
      PriceSyncService.getInstance(),
    );
    priorityManager.registerService(
      "order-sync",
      OrderSyncService.getInstance(),
    );
    priorityManager.registerService("ddt-sync", DDTSyncService.getInstance());
    priorityManager.registerService(
      "invoice-sync",
      InvoiceSyncService.getInstance(),
    );

    logger.info("Queue Manager inizializzato");
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Setta i callback per gestire i lock durante la creazione ordini
   */
  setOrderLockCallbacks(onStart: () => boolean, onEnd: () => void): void {
    this.onOrderStart = onStart;
    this.onOrderEnd = onEnd;
  }

  private linkJobToPending(
    jobId: string,
    userId: string,
    pendingOrderId: string,
  ): void {
    this.jobToPendingMap.set(jobId, { userId, pendingOrderId });
    logger.debug(
      `[QueueManager] Linked job ${jobId} to pending ${pendingOrderId}`,
    );
  }

  private getPendingFromJob(
    jobId: string,
  ): { userId: string; pendingOrderId: string } | null {
    return this.jobToPendingMap.get(jobId) || null;
  }

  private unlinkJobFromPending(jobId: string): void {
    this.jobToPendingMap.delete(jobId);
    logger.debug(`[QueueManager] Unlinked job ${jobId}`);
  }

  private async broadcastJobProgress(
    jobId: string,
    operationCategory: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const pendingInfo = this.getPendingFromJob(jobId);
    if (!pendingInfo) {
      logger.warn(`[QueueManager] No pending linked to job ${jobId}`);
      return;
    }

    const { userId, pendingOrderId } = pendingInfo;
    const milestone = getProgressMilestone(operationCategory, metadata);
    if (!milestone) return;

    const { progress, label } = milestone;
    const pendingService = PendingRealtimeService.getInstance();
    pendingService.emitJobProgress(
      userId,
      jobId,
      pendingOrderId,
      progress,
      label,
      operationCategory,
      metadata,
    );
  }

  /**
   * Avvia il worker per processare i job
   */
  async startWorker(): Promise<void> {
    if (this.worker) {
      logger.warn("Worker già avviato");
      return;
    }

    // BrowserPool will initialize automatically on first use

    this.worker = new Worker<OrderJobData, OrderJobResult>(
      "orders",
      async (job: Job<OrderJobData, OrderJobResult>) => {
        return this.processOrder(job);
      },
      {
        connection: this.redisConnection as any,
        concurrency: 1, // Processa un ordine alla volta (sequenziale)
      },
    );

    // Event listeners
    this.worker.on("completed", (job: Job<OrderJobData, OrderJobResult>) => {
      logger.info(`Job ${job.id} completato`, {
        orderId: job.returnvalue?.orderId,
        duration: job.returnvalue?.duration,
      });
    });

    this.worker.on(
      "failed",
      (
        job: Job<OrderJobData, OrderJobResult> | undefined,
        err: Error | any,
      ) => {
        logger.error(`Job ${job?.id} fallito`, {
          error: err?.message || String(err),
          orderData: job?.data.orderData,
        });
      },
    );

    this.worker.on(
      "progress",
      (
        job: Job<OrderJobData, OrderJobResult>,
        progress: number | object | string | boolean,
      ) => {
        logger.debug(`Job ${job.id} progress`, { progress });
      },
    );

    logger.info("Worker avviato con concurrency: 3");
  }

  /**
   * Chiude eventuali browser Chrome zombie rimasti aperti
   */
  private async cleanupZombieBrowsers(): Promise<void> {
    try {
      const { execSync } = await import("child_process");
      // Su macOS, chiudi TUTTI i processi Chrome for Testing di Puppeteer
      // Non usare "headless" perché Puppeteer non usa quella flag
      execSync('pkill -f "Google Chrome for Testing" || true', {
        stdio: "ignore",
      });
      logger.debug("🧹 Pulizia browser zombie completata");
    } catch (error) {
      logger.debug("Nessun browser zombie da pulire");
    }
  }

  /**
   * Processa un ordine
   */
  private async processOrder(
    job: Job<OrderJobData, OrderJobResult>,
  ): Promise<OrderJobResult> {
    // Track this operation for graceful shutdown
    return operationTracker.track(async () => {
      const startTime = Date.now();
      const { orderData, userId, username, pendingOrderId } = job.data;

      let bot: any = null;

      try {
        // Acquisisci il lock per ordini con priorità assoluta (blocca sync)
        if (this.onOrderStart) {
          let acquired = false;
          let attempts = 0;
          const maxAttemptsPhase1 = 10; // Fase 1: 10 tentativi (0-10s)
          const maxAttemptsPhase2 = 15; // Fase 2-3: attesa force-stop (10-15s)
          const maxAttemptsTotal = 25; // Fase 4: retry post-nuclear (15-25s)
          let forceStopTriggered = false;

          while (!acquired && attempts < maxAttemptsTotal) {
            acquired = this.onOrderStart();

            if (!acquired) {
              // Fase 2: Dopo 10 tentativi (10 secondi), trigger force-stop nucleare
              if (attempts === maxAttemptsPhase1 && !forceStopTriggered) {
                logger.warn(
                  `⚠️ JOB ORDINE: 10 secondi di attesa, attivo FORCE-STOP NUCLEARE su tutti i sync...`,
                );
                try {
                  const { forceStopAllSyncs } = await import("./index");
                  if (forceStopAllSyncs) {
                    await forceStopAllSyncs();
                    forceStopTriggered = true;
                    logger.info(
                      `✅ JOB ORDINE: FORCE-STOP NUCLEARE completato, riprovo acquisizione lock...`,
                    );
                  }
                } catch (error) {
                  logger.error(`❌ JOB ORDINE: Errore durante FORCE-STOP`, {
                    error,
                  });
                }
              }

              const phase =
                attempts < maxAttemptsPhase1
                  ? "PRE-FORCE"
                  : attempts < maxAttemptsPhase2
                    ? "FORCE-STOP-WAIT"
                    : "POST-NUCLEAR";

              logger.info(
                `⏳ JOB ORDINE: Attendo rilascio lock... (tentativo ${attempts + 1}/${maxAttemptsTotal}) [${phase}]`,
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));
              attempts++;
            }
          }

          if (!acquired) {
            throw new Error(
              `Impossibile acquisire il lock per creare l'ordine dopo ${maxAttemptsTotal} secondi. Un'operazione di sync potrebbe essere bloccata.`,
            );
          }

          logger.info(
            `🔒 JOB ORDINE: Lock acquisito dopo ${attempts} tentativi`,
          );
        }

        logger.info(`📋 QUEUE: INIZIO processamento ordine`, {
          jobId: job.id,
          userId,
          username,
          customerName: orderData.customerName,
          itemsCount: orderData.items.length,
          items: orderData.items.map((item) => ({
            name: item.productName || item.articleCode,
            qty: item.quantity,
          })),
        });
        // Pulizia browser zombie prima di crearne uno nuovo
        await this.cleanupZombieBrowsers();

        // Per gli ordini, usa il bot con BrowserPool (fast login)
        // IMPORTANTE: Passa userId per usare password cache e sessione condivisa
        const botModulePath = "./archibald-bot";
        logger.info("⚡ Creazione bot con BrowserPool per ordine...", {
          bot: "archibald-bot",
        });

        const { ArchibaldBot } = await import(botModulePath);

        // Create bot with userId to use password cache and per-user sessions
        bot = new ArchibaldBot(userId);

        // Initialize via BrowserPool (fast login + cached context)
        await bot.initialize();

        logger.info(
          `🔐 Using BrowserPool context for user ${username} (${userId})`,
        );

        // Bot already logged in during initialize()
        // No need to call login() again

        // Set progress callback
        bot.setProgressCallback(
          async (operationCategory: string, metadata?: Record<string, any>) => {
            await this.broadcastJobProgress(
              job.id!,
              operationCategory,
              metadata,
            );
          },
        );

        // Aggiorna progress
        await job.updateProgress(25);

        // Crea l'ordine con priority lock (pausa tutti i servizi di sync)
        logger.debug(
          "[QueueManager] Acquiring priority lock for order creation...",
        );
        logger.info(`[QueueManager] Order flow: current`);

        const orderId = await PriorityManager.getInstance().withPriority(
          async () => {
            return await bot.createOrder(orderData);
          },
        );
        logger.debug("[QueueManager] Priority lock released");

        // Calculate total amount (subtotal with item discounts)
        const grossAmount = orderData.items.reduce((sum, item) => {
          const lineAmount =
            item.price * item.quantity * (1 - (item.discount || 0) / 100);
          return sum + lineAmount;
        }, 0);

        // Apply global discount if present
        const totalAmount = orderData.discountPercent
          ? grossAmount * (1 - orderData.discountPercent / 100)
          : grossAmount;

        // If order is completely from warehouse, create order record manually
        const isWarehouseOnly = orderId.startsWith("warehouse-");
        if (isWarehouseOnly) {
          try {
            const { OrderDatabaseNew } = await import("./order-db-new");
            const orderDb = OrderDatabaseNew.getInstance();

            // Create order record for warehouse-only order
            const orderRecord = {
              id: orderId, // Use warehouse ID as primary key
              orderNumber: orderId, // Same as ID
              customerProfileId: orderData.customerId,
              customerName: orderData.customerName,
              deliveryName: null,
              deliveryAddress: null,
              creationDate: new Date().toISOString(),
              deliveryDate: null,
              remainingSalesFinancial: null,
              customerReference: null,
              salesStatus: "WAREHOUSE_FULFILLED",
              orderType: "Warehouse",
              documentStatus: null,
              salesOrigin: "PWA",
              transferStatus: null,
              transferDate: null,
              completionDate: null,
              discountPercent: orderData.discountPercent?.toString() || null,
              grossAmount: grossAmount.toFixed(2),
              totalAmount: totalAmount.toFixed(2),
            };

            orderDb.upsertOrder(userId, orderRecord);
            logger.info(
              `[QueueManager] Created warehouse-only order record ${orderId}`,
              {
                customerName: orderData.customerName,
                grossAmount: grossAmount.toFixed(2),
                totalAmount: totalAmount.toFixed(2),
                globalDiscount: orderData.discountPercent || 0,
                itemsCount: orderData.items.length,
              },
            );
          } catch (err) {
            logger.error(
              `[QueueManager] Failed to create warehouse order record ${orderId}`,
              {
                error: err instanceof Error ? err.message : String(err),
              },
            );
            // Don't fail the order creation
          }
        } else {
          try {
            const { OrderDatabaseNew } = await import("./order-db-new");
            const orderDb = OrderDatabaseNew.getInstance();

            const orderRecord = {
              id: orderId,
              orderNumber: `PENDING-${orderId}`,
              customerProfileId: orderData.customerId,
              customerName: orderData.customerName,
              deliveryName: null,
              deliveryAddress: null,
              creationDate: new Date().toISOString(),
              deliveryDate: null,
              remainingSalesFinancial: null,
              customerReference: null,
              salesStatus: null,
              orderType: "Giornale",
              documentStatus: null,
              salesOrigin: "Agent",
              transferStatus: "Modifica",
              transferDate: null,
              completionDate: null,
              discountPercent: orderData.discountPercent?.toString() || null,
              grossAmount: grossAmount.toFixed(2),
              totalAmount: totalAmount.toFixed(2),
            };

            orderDb.upsertOrder(userId, orderRecord);
            logger.info(
              `[QueueManager] Created immediate order record ${orderId}`,
              {
                customerName: orderData.customerName,
                grossAmount: grossAmount.toFixed(2),
                totalAmount: totalAmount.toFixed(2),
                globalDiscount: orderData.discountPercent || 0,
                itemsCount: orderData.items.length,
              },
            );
          } catch (err) {
            logger.error(
              `[QueueManager] Failed to create immediate order record ${orderId}`,
              {
                error: err instanceof Error ? err.message : String(err),
              },
            );
            // Don't fail the order creation
          }
        }

        // Save order articles to database (with warehouse tracking)
        try {
          const { OrderDatabaseNew } = await import("./order-db-new");
          const orderDb = OrderDatabaseNew.getInstance();

          const articles = orderData.items.map((item) => ({
            orderId,
            articleCode: item.articleCode,
            articleDescription: item.description,
            quantity: item.quantity, // Full quantity from customer
            unitPrice: item.price,
            discountPercent: item.discount,
            lineAmount:
              item.price * item.quantity * (1 - (item.discount || 0) / 100),
            // Warehouse tracking fields
            warehouseQuantity: item.warehouseQuantity || 0,
            warehouseSourcesJson: item.warehouseSources
              ? JSON.stringify(item.warehouseSources)
              : undefined,
          }));

          const saved = orderDb.saveOrderArticles(articles);
          logger.info(
            `[QueueManager] Saved ${saved} articles for order ${orderId}`,
            {
              totalItems: articles.length,
              warehouseItems: articles.filter((a) => a.warehouseQuantity > 0)
                .length,
            },
          );
        } catch (err) {
          logger.error(
            `[QueueManager] Failed to save articles for order ${orderId}`,
            {
              error: err instanceof Error ? err.message : String(err),
            },
          );
          // Don't fail the order creation if article saving fails
        }

        // Aggiorna progress
        await job.updateProgress(100);

        const duration = Date.now() - startTime;

        // Broadcast JOB_COMPLETED
        const pendingService = PendingRealtimeService.getInstance();
        pendingService.emitJobCompleted(
          userId,
          job.id!,
          pendingOrderId,
          orderId,
          duration,
        );

        // Delete pending order from server DB so it won't be
        // re-pulled by the frontend sync (pullFromServer).
        try {
          const del = ordersDb
            .prepare("DELETE FROM pending_orders WHERE id = ?")
            .run(pendingOrderId);
          if (del.changes > 0) {
            logger.info(
              `🗑️ Pending order deleted from server DB: ${pendingOrderId}`,
            );
          }
        } catch (dbErr) {
          logger.error(`Failed to delete pending order ${pendingOrderId}`, {
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        }

        logger.info(`📋 QUEUE: FINE processamento ordine`, {
          orderId,
          duration: `${(duration / 1000).toFixed(2)}s`,
          jobId: job.id,
          userId,
          username,
          customerName: orderData.customerName,
          itemsCount: orderData.items.length,
        });

        return {
          orderId,
          duration,
          timestamp: Date.now(),
        };
      } catch (error) {
        // Mark bot as having error so context will be closed on release
        if (bot) {
          (bot as any).hasError = true;
        }

        // Broadcast JOB_FAILED
        const pendingService = PendingRealtimeService.getInstance();
        pendingService.emitJobFailed(
          userId,
          job.id!,
          pendingOrderId,
          error instanceof Error ? error.message : String(error),
          "order_creation",
        );

        // Persist failure in SQLite so frontend can recover on refresh
        try {
          ordersDb
            .prepare(
              "UPDATE pending_orders SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
            )
            .run(
              "error",
              error instanceof Error ? error.message : String(error),
              Date.now(),
              pendingOrderId,
            );
        } catch (dbErr) {
          logger.error("Failed to update pending order status", {
            error: dbErr,
          });
        }

        logger.error("Errore durante creazione ordine", {
          error,
          jobId: job.id,
          userId,
          username,
          orderData,
        });
        throw error;
      } finally {
        // Chiudi sempre il browser dedicato
        if (bot) {
          logger.info("🧹 Chiusura browser dedicato...");
          await bot.close().catch((err: unknown) => {
            logger.error("Errore durante chiusura browser", { error: err });
          });
        }

        // Unlink job
        this.unlinkJobFromPending(job.id!);

        // Rilascia il lock degli ordini
        if (this.onOrderEnd) {
          this.onOrderEnd();
        }
      }
    });
  }

  /**
   * Aggiunge un ordine alla coda
   */
  async addOrder(
    orderData: OrderData,
    userId: string,
    pendingOrderId: string,
  ): Promise<Job<OrderJobData, OrderJobResult>> {
    // Get username from userId
    const username = await this.getUsernameFromId(userId);

    const job = await this.queue.add(
      "create-order",
      {
        orderData,
        userId,
        username,
        timestamp: Date.now(),
        pendingOrderId,
      },
      {
        attempts: 1, // No automatic retries: failures are deterministic
        removeOnComplete: {
          count: 100, // Mantieni gli ultimi 100 job completati
        },
        removeOnFail: {
          count: 50, // Mantieni gli ultimi 50 job falliti
        },
      },
    );

    // Link job to pending
    this.linkJobToPending(job.id!, userId, pendingOrderId);

    // Broadcast JOB_STARTED
    const pendingService = PendingRealtimeService.getInstance();
    pendingService.emitJobStarted(userId, job.id!, pendingOrderId);

    logger.info(`📋 QUEUE: Ordine aggiunto alla coda`, {
      jobId: job.id,
      pendingOrderId,
      userId,
      username,
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
    });

    return job;
  }

  /**
   * Helper method to get username from userId
   */
  private async getUsernameFromId(userId: string): Promise<string> {
    try {
      const { UserDatabase } = await import("./user-db");
      const userDb = UserDatabase.getInstance();
      const user = userDb.getUserById(userId);
      return user?.username || "unknown";
    } catch (error) {
      logger.error("Error getting username from userId", { error, userId });
      return "unknown";
    }
  }

  /**
   * Ottiene lo stato di un job
   */
  async getJobStatus(jobId: string): Promise<{
    status: string;
    progress?: number | object;
    result?: OrderJobResult;
    error?: string;
  }> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return { status: "not_found" };
    }

    const state = await job.getState();
    const progress = job.progress;

    if (state === "completed") {
      return {
        status: "completed",
        result: job.returnvalue || undefined,
      };
    }

    if (state === "failed") {
      return {
        status: "failed",
        error: job.failedReason || "Unknown error",
      };
    }

    return {
      status: state,
      progress: (typeof progress === "number" || typeof progress === "object"
        ? progress
        : undefined) as number | object | undefined,
    };
  }

  /**
   * Ottiene tutti i job di un utente
   */
  async getUserJobs(userId: string): Promise<
    Array<{
      jobId: string;
      status: string;
      orderData: OrderData;
      createdAt: number;
      result?: OrderJobResult;
      error?: string;
    }>
  > {
    // Get all jobs (waiting, active, completed, failed)
    const [waitingJobs, activeJobs, completedJobs, failedJobs] =
      await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
      ]);

    const allJobs = [
      ...waitingJobs,
      ...activeJobs,
      ...completedJobs,
      ...failedJobs,
    ];

    // Filter by userId and map to response format
    const userJobs = await Promise.all(
      allJobs
        .filter((job) => job.data.userId === userId)
        .map(async (job) => {
          const state = await job.getState();

          return {
            jobId: job.id!,
            status: state,
            orderData: job.data.orderData,
            createdAt: job.data.timestamp,
            result: state === "completed" ? job.returnvalue : undefined,
            error:
              state === "failed"
                ? job.failedReason || "Unknown error"
                : undefined,
          };
        }),
    );

    // Sort by createdAt descending (most recent first)
    return userJobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Ottiene statistiche della coda
   */
  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      browserPool: this.browserPool.getStats(),
    };
  }

  /**
   * Retry a failed job by creating a new job with the same data
   */
  async retryJob(
    jobId: string,
  ): Promise<{ success: boolean; newJobId?: string; error?: string }> {
    try {
      // Get the failed job by ID
      const job = await this.queue.getJob(jobId);

      if (!job) {
        return { success: false, error: "Job not found" };
      }

      // Extract original job data
      const { orderData, userId, username, pendingOrderId } = job.data;

      // Create new job with same data
      const newJob = await this.addOrder(orderData, userId, pendingOrderId);

      // Remove old failed job
      await job.remove();

      logger.info(`📋 QUEUE: Job ${jobId} retried as new job ${newJob.id}`, {
        oldJobId: jobId,
        newJobId: newJob.id,
        userId,
        username,
      });

      return { success: true, newJobId: newJob.id! };
    } catch (error) {
      logger.error("Error retrying job", { error, jobId });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Cancel a stuck/active job by moving it to failed state
   */
  async cancelJob(
    jobId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const job = await this.queue.getJob(jobId);

      if (!job) {
        return { success: false, error: "Job not found" };
      }

      const state = await job.getState();

      if (state === "completed" || state === "failed") {
        return { success: false, error: `Job is already ${state}` };
      }

      if (state === "active") {
        await job.moveToFailed(new Error("Cancelled by admin"), "0", false);
      } else {
        await job.remove();
      }

      logger.info(`🚫 QUEUE: Job ${jobId} cancelled by admin`, {
        jobId,
        previousState: state,
      });

      return { success: true };
    } catch (error) {
      logger.error("Error cancelling job", { error, jobId });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get all jobs from all users (admin-only)
   */
  async getAllJobs(
    limit: number = 50,
    statusFilter?: string,
  ): Promise<
    Array<{
      jobId: string;
      status: string;
      userId: string;
      username: string;
      orderData: OrderData;
      createdAt: number;
      result?: OrderJobResult;
      error?: string;
    }>
  > {
    // Get all jobs from all states
    const [waitingJobs, activeJobs, completedJobs, failedJobs] =
      await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
      ]);

    const allJobs = [
      ...waitingJobs,
      ...activeJobs,
      ...completedJobs,
      ...failedJobs,
    ];

    // Map to response format
    const jobs = await Promise.all(
      allJobs.map(async (job) => {
        const state = await job.getState();

        return {
          jobId: job.id!,
          status: state,
          userId: job.data.userId,
          username: job.data.username,
          orderData: job.data.orderData,
          createdAt: job.data.timestamp,
          result: state === "completed" ? job.returnvalue : undefined,
          error:
            state === "failed"
              ? job.failedReason || "Unknown error"
              : undefined,
        };
      }),
    );

    // Filter by status if provided
    let filteredJobs = jobs;
    if (statusFilter && statusFilter !== "all") {
      filteredJobs = jobs.filter((job) => job.status === statusFilter);
    }

    // Sort by createdAt descending (most recent first)
    const sortedJobs = filteredJobs.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit
    return sortedJobs.slice(0, limit);
  }

  /**
   * Chiude la coda e il worker
   */
  async shutdown(): Promise<void> {
    logger.info("Shutdown Queue Manager...");

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    await this.queue.close();
    await this.browserPool.shutdown();
    await this.redisConnection.quit();

    logger.info("Queue Manager chiuso");
  }
}
