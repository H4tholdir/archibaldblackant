import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from './logger';
import { BrowserPool } from './browser-pool';
import type { OrderData } from './types';
import { config } from './config';
import { PriorityManager } from './priority-manager';
import { CustomerSyncService } from './customer-sync-service';
import { ProductSyncService } from './product-sync-service';
import { PriceSyncService } from './price-sync-service';

/**
 * Job data per la coda ordini
 */
export interface OrderJobData {
  orderData: OrderData;
  requestId?: string;
  timestamp: number;
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
  private progressBroadcaster?: (jobId: string, progress: any) => void;

  private constructor() {
    // Connessione Redis (usa Redis locale su porta 6379)
    this.redisConnection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });

    // Inizializza la coda
    this.queue = new Queue<OrderJobData, OrderJobResult>('orders', {
      connection: this.redisConnection,
    });

    // Inizializza il browser pool
    this.browserPool = BrowserPool.getInstance(1, 3);

    // Register sync services with PriorityManager
    const priorityManager = PriorityManager.getInstance();
    priorityManager.registerService('customer-sync', CustomerSyncService.getInstance());
    priorityManager.registerService('product-sync', ProductSyncService.getInstance());
    priorityManager.registerService('price-sync', PriceSyncService.getInstance());

    logger.info('Queue Manager inizializzato');
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

  /**
   * Setta il broadcaster per il progress tracking via WebSocket
   */
  setProgressBroadcaster(fn: (jobId: string, progress: any) => void): void {
    this.progressBroadcaster = fn;
  }

  /**
   * Emette un evento di progress per il job specificato
   */
  private emitProgress(jobId: string, progress: any): void {
    if (this.progressBroadcaster) {
      this.progressBroadcaster(jobId, progress);
    }
  }

  /**
   * Avvia il worker per processare i job
   */
  async startWorker(): Promise<void> {
    if (this.worker) {
      logger.warn('Worker già avviato');
      return;
    }

    // Inizializza il browser pool
    await this.browserPool.initialize();

    this.worker = new Worker<OrderJobData, OrderJobResult>(
      'orders',
      async (job: Job<OrderJobData, OrderJobResult>) => {
        return this.processOrder(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 3, // Processa fino a 3 ordini in parallelo
      },
    );

    // Event listeners
    this.worker.on('completed', (job: Job<OrderJobData, OrderJobResult>) => {
      logger.info(`Job ${job.id} completato`, {
        orderId: job.returnvalue?.orderId,
        duration: job.returnvalue?.duration,
      });
    });

    this.worker.on('failed', (job: Job<OrderJobData, OrderJobResult> | undefined, err: Error) => {
      logger.error(`Job ${job?.id} fallito`, {
        error: err.message,
        orderData: job?.data.orderData,
      });
    });

    this.worker.on('progress', (job: Job<OrderJobData, OrderJobResult>, progress: number | object) => {
      logger.debug(`Job ${job.id} progress`, { progress });

      // Emit progress to WebSocket clients
      this.emitProgress(job.id!, progress);
    });

    logger.info('Worker avviato con concurrency: 3');
  }

  /**
   * Chiude eventuali browser Chrome zombie rimasti aperti
   */
  private async cleanupZombieBrowsers(): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      // Su macOS, chiudi TUTTI i processi Chrome for Testing di Puppeteer
      // Non usare "headless" perché Puppeteer non usa quella flag
      execSync('pkill -f "Google Chrome for Testing" || true', { stdio: 'ignore' });
      logger.debug('🧹 Pulizia browser zombie completata');
    } catch (error) {
      logger.debug('Nessun browser zombie da pulire');
    }
  }

  /**
   * Processa un ordine
   */
  private async processOrder(job: Job<OrderJobData, OrderJobResult>): Promise<OrderJobResult> {
    const startTime = Date.now();
    const { orderData, requestId } = job.data;

    // Acquisisci il lock per ordini (blocca sync)
    if (this.onOrderStart) {
      let acquired = false;
      let attempts = 0;
      const maxAttempts = 60; // Max 1 minuto di attesa

      while (!acquired && attempts < maxAttempts) {
        acquired = this.onOrderStart();
        if (!acquired) {
          logger.info(`⏳ Attendo rilascio operazione in corso... (tentativo ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      }

      if (!acquired) {
        throw new Error('Impossibile acquisire il lock per creare l\'ordine dopo 60 secondi');
      }
    }

    logger.info(`📋 QUEUE: INIZIO processamento ordine`, {
      jobId: job.id,
      requestId,
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      items: orderData.items.map(item => ({
        name: item.productName || item.articleCode,
        qty: item.quantity
      }))
    });

    let bot = null;

    try {
      // Pulizia browser zombie prima di crearne uno nuovo
      await this.cleanupZombieBrowsers();

      // Per gli ordini, crea un browser dedicato invece di usare il pool
      // Il pool causa problemi con i retry e lo stato del browser
      logger.info('🔧 Creazione browser dedicato per ordine...');

      const { ArchibaldBot } = await import('./archibald-bot');
      const { SessionManager } = await import('./session-manager');

      bot = new ArchibaldBot();
      await bot.initialize();

      // Progress: 10% - Browser initialization started
      await job.updateProgress({
        percent: 10,
        step: 'browser_init',
        message: 'Inizializzazione browser...',
        estimatedRemainingSeconds: 75
      });

      // Prova a riutilizzare sessione esistente
      const sessionManager = SessionManager.getInstance();
      const cookies = await sessionManager.loadSession();

      if (cookies && cookies.length > 0 && bot.page) {
        logger.info('🔐 Riutilizzo sessione login esistente...');
        await bot.page.setCookie(...cookies);
        await bot.page.goto(config.archibald.url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        // Verifica se siamo ancora autenticati
        const isLoggedIn = await bot.page.evaluate(() => {
          return !document.querySelector('input[type="password"]');
        });

        if (isLoggedIn) {
          logger.info('✅ Sessione ancora valida, skip login');
        } else {
          logger.info('⚠️ Sessione scaduta, eseguo nuovo login...');
          await bot.login();
          // Salva nuova sessione
          const newCookies = await bot.page.cookies();
          await sessionManager.saveSession(newCookies);
        }
      } else {
        logger.info('🔐 Nessuna sessione, eseguo login...');
        await bot.login();
        // Salva sessione
        if (bot.page) {
          const newCookies = await bot.page.cookies();
          await sessionManager.saveSession(newCookies);
        }
      }

      // Progress: 15% - Login/session check complete
      await job.updateProgress({
        percent: 15,
        step: 'login',
        message: 'Login completato',
        estimatedRemainingSeconds: 70
      });

      // Progress: 25% - Session validated (EXISTING milestone)
      await job.updateProgress({
        percent: 25,
        step: 'session_validated',
        message: 'Sessione validata',
        estimatedRemainingSeconds: 65
      });

      // Progress: 35% - Customer selection started
      await job.updateProgress({
        percent: 35,
        step: 'customer_selection',
        message: 'Selezione cliente in corso...',
        estimatedRemainingSeconds: 55
      });

      // Crea l'ordine con priority lock (pausa tutti i servizi di sync)
      logger.debug('[QueueManager] Acquiring priority lock for order creation...');
      const orderId = await PriorityManager.getInstance().withPriority(async () => {
        // Progress: 50% - Customer selected (estimated midpoint)
        await job.updateProgress({
          percent: 50,
          step: 'customer_selected',
          message: 'Cliente selezionato',
          estimatedRemainingSeconds: 40
        });

        // Progress: 65% - Article addition started
        await job.updateProgress({
          percent: 65,
          step: 'article_addition',
          message: 'Aggiunta articoli...',
          estimatedRemainingSeconds: 30
        });

        const result = await bot.createOrder(orderData);

        // Progress: 80% - Articles added
        await job.updateProgress({
          percent: 80,
          step: 'articles_added',
          message: 'Articoli aggiunti',
          estimatedRemainingSeconds: 15
        });

        // Progress: 90% - Order save initiated
        await job.updateProgress({
          percent: 90,
          step: 'order_save',
          message: 'Salvataggio ordine...',
          estimatedRemainingSeconds: 8
        });

        return result;
      });
      logger.debug('[QueueManager] Priority lock released');

      // Progress: 100% - Order creation complete
      await job.updateProgress({
        percent: 100,
        step: 'complete',
        message: 'Ordine creato!',
        estimatedRemainingSeconds: 0
      });

      const duration = Date.now() - startTime;

      logger.info(`📋 QUEUE: FINE processamento ordine`, {
        orderId,
        duration: `${(duration / 1000).toFixed(2)}s`,
        jobId: job.id,
        customerName: orderData.customerName,
        itemsCount: orderData.items.length
      });

      return {
        orderId,
        duration,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Errore durante creazione ordine', {
        error,
        jobId: job.id,
        orderData,
      });
      throw error;
    } finally {
      // Chiudi sempre il browser dedicato
      if (bot) {
        logger.info('🧹 Chiusura browser dedicato...');
        await bot.close().catch((err) => {
          logger.error('Errore durante chiusura browser', { error: err });
        });
      }

      // Rilascia il lock degli ordini
      if (this.onOrderEnd) {
        this.onOrderEnd();
      }
    }
  }

  /**
   * Aggiunge un ordine alla coda
   */
  async addOrder(
    orderData: OrderData,
    requestId?: string,
  ): Promise<Job<OrderJobData, OrderJobResult>> {
    const job = await this.queue.add(
      'create-order',
      {
        orderData,
        requestId,
        timestamp: Date.now(),
      },
      {
        attempts: 3, // Riprova fino a 3 volte in caso di errore
        backoff: {
          type: 'exponential',
          delay: 5000, // Attendi 5s prima del primo retry
        },
        removeOnComplete: {
          count: 100, // Mantieni gli ultimi 100 job completati
        },
        removeOnFail: {
          count: 50, // Mantieni gli ultimi 50 job falliti
        },
      },
    );

    logger.info(`📋 QUEUE: Ordine aggiunto alla coda`, {
      jobId: job.id,
      requestId,
      customerName: orderData.customerName,
      itemsCount: orderData.items.length
    });

    return job;
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
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress;

    if (state === 'completed') {
      return {
        status: 'completed',
        result: job.returnvalue || undefined,
      };
    }

    if (state === 'failed') {
      return {
        status: 'failed',
        error: job.failedReason || 'Unknown error',
      };
    }

    return {
      status: state,
      progress: progress || undefined,
    };
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
   * Chiude la coda e il worker
   */
  async shutdown(): Promise<void> {
    logger.info('Shutdown Queue Manager...');

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    await this.queue.close();
    await this.browserPool.shutdown();
    await this.redisConnection.quit();

    logger.info('Queue Manager chiuso');
  }
}
