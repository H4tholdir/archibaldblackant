import { ArchibaldBot } from "./archibald-bot";
import { logger } from "./logger";
import { SessionManager } from "./session-manager";
import { config } from "./config";

/**
 * Browser Pool Manager
 * Gestisce un pool di browser pre-autenticati per riutilizzo
 * Elimina ~25s di login per ogni ordine
 */
export class BrowserPool {
  private static instance: BrowserPool;
  private pool: ArchibaldBot[] = [];
  private inUse: Set<ArchibaldBot> = new Set();
  private readonly maxSize: number;
  private readonly minSize: number;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor(minSize = 1, maxSize = 3) {
    this.minSize = minSize;
    this.maxSize = maxSize;
  }

  static getInstance(minSize = 1, maxSize = 3): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool(minSize, maxSize);
    }
    return BrowserPool.instance;
  }

  /**
   * Inizializza il pool con browser pre-autenticati
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      logger.info(
        `Inizializzazione Browser Pool (minSize: ${this.minSize}, maxSize: ${this.maxSize})`,
      );

      const initPromises: Promise<void>[] = [];
      for (let i = 0; i < this.minSize; i++) {
        initPromises.push(this.createAndAuthenticateBrowser());
      }

      await Promise.all(initPromises);
      this.isInitialized = true;
      logger.info(`Browser Pool inizializzato con ${this.pool.length} browser`);
    })();

    return this.initializationPromise;
  }

  /**
   * Crea un nuovo browser e lo autentica (o riutilizza sessione esistente)
   */
  private async createAndAuthenticateBrowser(): Promise<void> {
    try {
      const bot = new ArchibaldBot();
      const sessionManager = SessionManager.getInstance();

      await bot.initialize();

      // Prova a caricare sessione esistente
      const cookies = await sessionManager.loadSession();

      if (cookies && cookies.length > 0 && bot.page) {
        // Riutilizza sessione esistente
        logger.info("Riutilizzo sessione Archibald esistente");
        await bot.page.setCookie(...cookies);

        // Naviga alla home per verificare la sessione
        await bot.page.goto(config.archibald.url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        // Verifica se siamo ancora autenticati
        const isLoggedIn = await bot.page.evaluate(() => {
          // Verifica presenza elementi che indicano login avvenuto
          return !document.querySelector('input[type="password"]');
        });

        if (isLoggedIn) {
          logger.info("✅ Sessione Archibald ancora valida, skip login");
          this.pool.push(bot);
          logger.debug(
            `Browser aggiunto al pool (totale: ${this.pool.length})`,
          );
          return;
        } else {
          logger.warn("Sessione scaduta lato server, eseguo nuovo login");
          sessionManager.clearSession();
        }
      }

      // Esegui login se non c'è sessione valida
      await bot.login();

      // Salva i cookies dopo login
      if (bot.page) {
        const newCookies = await bot.page.cookies();
        await sessionManager.saveSession(newCookies);
      }

      this.pool.push(bot);
      logger.debug(`Browser aggiunto al pool (totale: ${this.pool.length})`);
    } catch (error) {
      logger.error("Errore durante creazione browser per pool", { error });
      throw error;
    }
  }

  /**
   * Acquisisce un browser dal pool
   * Se il pool è vuoto e non abbiamo raggiunto maxSize, crea un nuovo browser
   * Altrimenti attende che un browser si liberi
   */
  async acquire(): Promise<ArchibaldBot> {
    await this.initialize();

    // Se ci sono browser disponibili nel pool, usa quello
    if (this.pool.length > 0) {
      const bot = this.pool.pop()!;
      this.inUse.add(bot);
      logger.debug(
        `Browser acquisito dal pool (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
      );
      return bot;
    }

    // Se possiamo creare nuovi browser (non abbiamo raggiunto maxSize), creane uno
    const totalBrowsers = this.pool.length + this.inUse.size;
    if (totalBrowsers < this.maxSize) {
      logger.info("Pool vuoto, creazione nuovo browser...");
      const bot = new ArchibaldBot();
      const sessionManager = SessionManager.getInstance();

      await bot.initialize();

      // Prova a caricare sessione esistente
      const cookies = await sessionManager.loadSession();
      if (cookies && cookies.length > 0 && bot.page) {
        logger.info("Riutilizzo sessione Archibald esistente");
        await bot.page.setCookie(...cookies);
        await bot.page.goto(config.archibald.url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        const isLoggedIn = await bot.page.evaluate(() => {
          return !document.querySelector('input[type="password"]');
        });

        if (!isLoggedIn) {
          logger.warn("Sessione scaduta lato server, eseguo nuovo login");
          sessionManager.clearSession();
          await bot.login();

          // Salva nuovi cookies
          const newCookies = await bot.page.cookies();
          await sessionManager.saveSession(newCookies);
        } else {
          logger.info("✅ Sessione ancora valida");
        }
      } else {
        // Esegui login se non c'è sessione
        await bot.login();

        // Salva cookies
        if (bot.page) {
          const newCookies = await bot.page.cookies();
          await sessionManager.saveSession(newCookies);
        }
      }

      this.inUse.add(bot);
      logger.debug(
        `Nuovo browser creato (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
      );
      return bot;
    }

    // Pool pieno, attendi che un browser si liberi
    logger.warn("Pool pieno, attesa browser disponibile...");
    return this.waitForAvailableBrowser();
  }

  /**
   * Attende che un browser si liberi
   */
  private async waitForAvailableBrowser(): Promise<ArchibaldBot> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.pool.length > 0) {
          clearInterval(checkInterval);
          const bot = this.pool.pop()!;
          this.inUse.add(bot);
          logger.debug(
            `Browser acquisito dopo attesa (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
          );
          resolve(bot);
        }
      }, 100); // Check ogni 100ms
    });
  }

  /**
   * Rilascia un browser e lo rimette nel pool
   * @param bot Browser da rilasciare
   * @param success Se true, l'operazione è riuscita e il browser può essere riutilizzato. Se false, il browser viene chiuso.
   */
  async release(bot: ArchibaldBot, success: boolean = true): Promise<void> {
    if (!this.inUse.has(bot)) {
      logger.warn("Tentativo di rilasciare browser non in uso");
      return;
    }

    this.inUse.delete(bot);

    // Se l'operazione è fallita, chiudi sempre il browser invece di riutilizzarlo
    if (!success) {
      logger.warn("Browser rilasciato dopo errore, verrà chiuso");
      await bot.close().catch((err) => {
        logger.error("Errore durante chiusura browser dopo errore", { error: err });
      });
      logger.debug(
        `Browser chiuso dopo errore (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
      );
      return;
    }

    // Se il pool è sotto minSize, rimetti il browser nel pool
    if (this.pool.length < this.minSize) {
      // Reset browser alla home page prima di rimetterlo nel pool
      try {
        if (bot.page && !bot.page.isClosed()) {
          logger.debug("Reset browser alla home page prima di rilasciarlo...");
          await bot.page.goto(config.archibald.url, {
            waitUntil: "networkidle2",
            timeout: 10000,
          });
          logger.debug("✓ Browser resettato alla home");
        }
      } catch (error) {
        logger.warn("Errore durante reset browser, verrà chiuso", { error });
        // Se il reset fallisce, chiudi il browser invece di rimetterlo nel pool
        await bot.close().catch((err) => {
          logger.error("Errore durante chiusura browser", { error: err });
        });
        logger.debug(
          `Browser chiuso dopo errore reset (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
        );
        return;
      }

      this.pool.push(bot);
      logger.debug(
        `Browser rilasciato e rimesso nel pool (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
      );
    } else {
      // Pool pieno, chiudi il browser
      bot.close().catch((err) => {
        logger.error("Errore durante chiusura browser in eccesso", {
          error: err,
        });
      });
      logger.debug(
        `Browser rilasciato e chiuso (pool pieno) (disponibili: ${this.pool.length}, in uso: ${this.inUse.size})`,
      );
    }
  }

  /**
   * Chiude tutti i browser nel pool
   */
  async shutdown(): Promise<void> {
    logger.info("Shutdown Browser Pool...");

    const closePromises: Promise<void>[] = [];

    // Chiudi tutti i browser nel pool
    for (const bot of this.pool) {
      closePromises.push(bot.close());
    }

    // Chiudi tutti i browser in uso
    for (const bot of this.inUse) {
      closePromises.push(bot.close());
    }

    await Promise.allSettled(closePromises);

    this.pool = [];
    this.inUse.clear();
    this.isInitialized = false;
    this.initializationPromise = null;

    logger.info("Browser Pool chiuso");
  }

  /**
   * Statistiche del pool
   */
  getStats() {
    return {
      available: this.pool.length,
      inUse: this.inUse.size,
      total: this.pool.length + this.inUse.size,
      maxSize: this.maxSize,
      minSize: this.minSize,
    };
  }
}
