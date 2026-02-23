import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import { config } from './config';
import { createPool } from './db/pool';
import { runMigrations, loadMigrationFiles } from './db/migrate';
import { createOperationQueue } from './operations/operation-queue';
import { createAgentLock } from './operations/agent-lock';
import { createBrowserPool } from './bot/browser-pool';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { generateJWT, verifyJWT } from './auth-utils';
import { PasswordCache } from './password-cache';
import { createApp } from './server';
import { logger } from './logger';
import type { BrowserLike } from './bot/browser-pool';

const DEFAULT_AGENT_SYNC_MS = 5 * 60 * 1000;
const DEFAULT_SHARED_SYNC_MS = 30 * 60 * 1000;

async function bootstrap(): Promise<void> {
  logger.info('Starting Archibald backend...');

  const pool = createPool(config.database);

  const migrationsDir = path.resolve(__dirname, 'db/migrations');
  const migrations = loadMigrationFiles(migrationsDir);
  const migrationResult = await runMigrations(pool, migrations);
  logger.info('Migrations complete', {
    applied: migrationResult.applied.length,
    skipped: migrationResult.skipped.length,
  });

  const agentLock = createAgentLock();

  const queue = createOperationQueue();

  const browserPool = createBrowserPool(
    {
      maxBrowsers: 2,
      maxContextsPerBrowser: 5,
      contextExpiryMs: 30 * 60 * 1000,
      launchOptions: {
        headless: config.puppeteer.headless,
        slowMo: config.puppeteer.slowMo,
        protocolTimeout: config.puppeteer.protocolTimeout,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--ignore-certificate-errors',
        ],
        defaultViewport: { width: 1280, height: 800 },
      },
      sessionValidationUrl: config.archibald.url,
    },
    (options) => puppeteer.launch(options) as unknown as Promise<BrowserLike>,
  );

  const syncScheduler = createSyncScheduler(
    queue.enqueue,
    () => [],
  );

  const wsServer = createWebSocketServer({
    createWss: (server) => new WebSocketServer({ server }),
    verifyToken: verifyJWT,
  });

  const passwordCache = PasswordCache.getInstance();

  const pdfStore = {
    save: (_buffer: Buffer, originalName: string, _req: unknown) => ({
      id: originalName,
      url: `/api/share/pdf/${originalName}`,
    }),
    get: (_id: string) => null as { buffer: Buffer; originalName: string } | null,
    delete: (_id: string) => {},
  };

  const sendEmail = async (
    _to: string, _subject: string, _body: string,
    _fileBuffer: Buffer, _fileName: string,
  ) => ({ messageId: 'not-configured' });

  const uploadToDropbox = async (_fileBuffer: Buffer, _fileName: string) =>
    ({ path: 'not-configured' });

  const app = createApp({
    pool,
    queue,
    agentLock,
    browserPool,
    syncScheduler,
    wsServer,
    passwordCache,
    pdfStore,
    generateJWT,
    verifyToken: verifyJWT,
    sendEmail,
    uploadToDropbox,
  });

  const server = http.createServer(app);
  wsServer.initialize(server);

  server.listen(config.server.port, () => {
    logger.info(`Server listening on port ${config.server.port}`);
  });

  syncScheduler.start({
    agentSyncMs: DEFAULT_AGENT_SYNC_MS,
    sharedSyncMs: DEFAULT_SHARED_SYNC_MS,
  });

  const shutdown = async () => {
    logger.info('Graceful shutdown initiated...');
    syncScheduler.stop();
    await queue.close();
    await wsServer.shutdown();
    await browserPool.shutdown();
    await pool.end();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { bootstrap };

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.error('Bootstrap failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
