import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';

/**
 * Statistiche per un'operazione
 */
interface OperationStats {
  operationName: string;
  successCount: number;
  failureCount: number;
  totalTime: number; // Somma di tutti i tempi in ms
  minTime: number;
  maxTime: number;
  avgTime: number;
  currentTimeout: number;
  lastAdjustment: number; // Timestamp ultimo aggiustamento
}

/**
 * Configurazione per un timeout adattivo
 */
interface AdaptiveTimeoutConfig {
  minTimeout: number; // Timeout minimo assoluto
  maxTimeout: number; // Timeout massimo assoluto
  initialTimeout: number; // Timeout iniziale
  adjustmentStep: number; // Step di incremento/decremento in ms
  adjustmentInterval: number; // Ogni quanti successi/fallimenti aggiustare
  successThreshold: number; // % di successo per ridurre timeout
  failureThreshold: number; // % di fallimento per aumentare timeout
}

/**
 * Manager per timeout adattivi
 * Impara automaticamente i timeout ottimali per ogni operazione
 */
export class AdaptiveTimeoutManager {
  private static instance: AdaptiveTimeoutManager;
  private stats: Map<string, OperationStats> = new Map();
  private configs: Map<string, AdaptiveTimeoutConfig> = new Map();
  private statsFilePath: string;

  private constructor() {
    this.statsFilePath = path.join(__dirname, '../data/adaptive-timeouts.json');
    this.loadStats();
  }

  static getInstance(): AdaptiveTimeoutManager {
    if (!AdaptiveTimeoutManager.instance) {
      AdaptiveTimeoutManager.instance = new AdaptiveTimeoutManager();
    }
    return AdaptiveTimeoutManager.instance;
  }

  /**
   * Registra una configurazione per un'operazione
   */
  registerOperation(
    operationName: string,
    config: Partial<AdaptiveTimeoutConfig> = {}
  ): void {
    const defaultConfig: AdaptiveTimeoutConfig = {
      minTimeout: 100,
      maxTimeout: 5000,
      initialTimeout: 1000,
      adjustmentStep: 50, // Piccoli step di 50ms
      adjustmentInterval: 3, // Aggiusta ogni 3 operazioni
      successThreshold: 0.9, // 90% di successo
      failureThreshold: 0.3, // 30% di fallimento
      ...config,
    };

    this.configs.set(operationName, defaultConfig);

    if (!this.stats.has(operationName)) {
      const cfg = defaultConfig;
      this.stats.set(operationName, {
        operationName,
        successCount: 0,
        failureCount: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        currentTimeout: cfg.initialTimeout,
        lastAdjustment: Date.now(),
      });
    }
  }

  /**
   * Ottiene il timeout corrente per un'operazione
   */
  getTimeout(operationName: string): number {
    const stats = this.stats.get(operationName);
    if (!stats) {
      logger.warn(`Operazione ${operationName} non registrata, uso timeout default 1000ms`);
      return 1000;
    }
    return stats.currentTimeout;
  }

  /**
   * Registra il successo di un'operazione e il tempo impiegato
   */
  recordSuccess(operationName: string, actualTime: number): void {
    const stats = this.stats.get(operationName);
    if (!stats) return;

    stats.successCount++;
    stats.totalTime += actualTime;
    stats.minTime = Math.min(stats.minTime, actualTime);
    stats.maxTime = Math.max(stats.maxTime, actualTime);
    stats.avgTime = stats.totalTime / (stats.successCount + stats.failureCount);

    logger.debug(`✅ ${operationName}: ${actualTime}ms (timeout: ${stats.currentTimeout}ms, avg: ${stats.avgTime.toFixed(0)}ms)`);

    this.adjustTimeout(operationName);
  }

  /**
   * Registra il fallimento di un'operazione
   */
  recordFailure(operationName: string): void {
    const stats = this.stats.get(operationName);
    if (!stats) return;

    stats.failureCount++;

    logger.debug(`❌ ${operationName}: timeout (${stats.currentTimeout}ms)`);

    this.adjustTimeout(operationName);
  }

  /**
   * Aggiusta il timeout in base alle statistiche
   */
  private adjustTimeout(operationName: string): void {
    const stats = this.stats.get(operationName);
    const config = this.configs.get(operationName);
    if (!stats || !config) return;

    const totalOps = stats.successCount + stats.failureCount;

    // Aggiusta solo ogni N operazioni
    if (totalOps % config.adjustmentInterval !== 0) return;

    const successRate = stats.successCount / totalOps;
    const oldTimeout = stats.currentTimeout;

    // Se il tasso di successo è alto e il tempo medio è molto inferiore al timeout
    // riduci il timeout per velocizzare
    if (successRate >= config.successThreshold && stats.avgTime > 0) {
      // Riduci il timeout, ma non andare sotto minTimeout
      // Usa il massimo tra avgTime * 1.5 e currentTimeout - step
      const targetTimeout = Math.max(
        stats.avgTime * 1.5, // 50% di margine sopra il tempo medio
        stats.currentTimeout - config.adjustmentStep
      );
      stats.currentTimeout = Math.max(config.minTimeout, Math.floor(targetTimeout));
    }
    // Se il tasso di fallimento è alto, aumenta il timeout
    else if (successRate <= (1 - config.failureThreshold)) {
      stats.currentTimeout = Math.min(
        config.maxTimeout,
        stats.currentTimeout + config.adjustmentStep
      );
    }

    if (stats.currentTimeout !== oldTimeout) {
      stats.lastAdjustment = Date.now();
      logger.info(`🔧 ${operationName}: timeout ${oldTimeout}ms → ${stats.currentTimeout}ms (success: ${(successRate * 100).toFixed(1)}%, avg: ${stats.avgTime.toFixed(0)}ms)`);
      this.saveStats();
    }
  }

  /**
   * Ottiene le statistiche di un'operazione
   */
  getStats(operationName: string): OperationStats | null {
    return this.stats.get(operationName) || null;
  }

  /**
   * Ottiene tutte le statistiche
   */
  getAllStats(): OperationStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Resetta le statistiche (mantiene i timeout correnti)
   */
  resetStats(operationName?: string): void {
    if (operationName) {
      const stats = this.stats.get(operationName);
      if (stats) {
        stats.successCount = 0;
        stats.failureCount = 0;
        stats.totalTime = 0;
        stats.minTime = Infinity;
        stats.maxTime = 0;
        stats.avgTime = 0;
      }
    } else {
      for (const stats of this.stats.values()) {
        stats.successCount = 0;
        stats.failureCount = 0;
        stats.totalTime = 0;
        stats.minTime = Infinity;
        stats.maxTime = 0;
        stats.avgTime = 0;
      }
    }
    this.saveStats();
  }

  /**
   * Forza un timeout specifico per un'operazione
   */
  setTimeout(operationName: string, timeout: number): void {
    const stats = this.stats.get(operationName);
    if (stats) {
      stats.currentTimeout = timeout;
      logger.info(`🔧 ${operationName}: timeout forzato a ${timeout}ms`);
      this.saveStats();
    }
  }

  /**
   * Salva le statistiche su file
   */
  private async saveStats(): Promise<void> {
    try {
      const data = Array.from(this.stats.entries()).map(([name, stats]) => ({
        name,
        ...stats,
      }));

      const dir = path.dirname(this.statsFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.statsFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Errore salvando statistiche timeout adattivi', { error });
    }
  }

  /**
   * Carica le statistiche da file
   */
  private async loadStats(): Promise<void> {
    try {
      const data = await fs.readFile(this.statsFilePath, 'utf-8');
      const stats = JSON.parse(data);

      for (const stat of stats) {
        const { name, ...statData } = stat;
        this.stats.set(name, statData);
      }

      logger.info(`📊 Caricati timeout adattivi per ${stats.length} operazioni`);
    } catch (error) {
      // File non esiste ancora, normale al primo avvio
      logger.debug('Nessun file statistiche timeout adattivi trovato, inizializzo da zero');
    }
  }
}
