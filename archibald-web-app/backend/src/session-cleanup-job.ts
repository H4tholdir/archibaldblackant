import { SessionCacheManager } from './session-cache-manager';
import { BrowserPool } from './browser-pool';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

/**
 * Background job to cleanup expired sessions
 * Runs every 1 hour
 */
export class SessionCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  start(): void {
    logger.info('Starting session cleanup job (runs every 1 hour)');

    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Run immediately on start
    this.cleanup();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Session cleanup job stopped');
    }
  }

  private async cleanup(): Promise<void> {
    try {
      logger.info('Running session cleanup job...');

      const cacheDir = path.join(__dirname, '..', '.cache');
      if (!fs.existsSync(cacheDir)) {
        return;
      }

      const files = fs.readdirSync(cacheDir).filter(f => f.startsWith('session-'));
      let expiredCount = 0;

      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          if (Date.now() > data.expiresAt) {
            // Session expired
            const userId = data.userId;
            fs.unlinkSync(filePath);

            // Close BrowserContext if still open
            const pool = BrowserPool.getInstance();
            await pool.closeUserContext(userId);

            expiredCount++;
            logger.info(`Cleaned up expired session for user ${userId}`);
          }
        } catch (error) {
          logger.warn(`Error cleaning up session file ${file}`, { error });
          // Delete corrupted file
          fs.unlinkSync(filePath);
        }
      }

      logger.info(`Session cleanup complete`, {
        totalSessions: files.length,
        expiredSessions: expiredCount,
      });

    } catch (error) {
      logger.error('Error in session cleanup job', { error });
    }
  }
}
