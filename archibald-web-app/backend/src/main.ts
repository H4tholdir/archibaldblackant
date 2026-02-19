import http from 'http';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import { Dropbox } from 'dropbox';

import { config } from './config';
import { logger } from './logger';
import { createApp } from './server';
import { createPool } from './db/pool';
import { runMigrations, loadMigrationFiles } from './db/migrate';
import { createOperationQueue } from './operations/operation-queue';
import { createAgentLock } from './operations/agent-lock';
import { createBrowserPool } from './bot/browser-pool';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { PasswordCache } from './password-cache';
import { generateJWT, verifyJWT } from './auth-utils';
import path from 'path';

function createPdfStore() {
  const store = new Map<string, { buffer: Buffer; originalName: string }>();

  return {
    save: (buffer: Buffer, originalName: string, _req: unknown) => {
      const id = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.set(id, { buffer, originalName });
      const url = `${config.share.baseUrl}/api/share/pdf/${id}`;
      return { id, url };
    },
    get: (id: string) => store.get(id) ?? null,
    delete: (id: string) => { store.delete(id); },
  };
}

function createEmailService() {
  if (!config.smtp.host) {
    return async () => ({ messageId: 'email-disabled' });
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });

  return async (to: string, subject: string, body: string, fileBuffer: Buffer, fileName: string) => {
    const result = await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html: body,
      attachments: [{ content: fileBuffer, filename: fileName }],
    });
    return { messageId: result.messageId };
  };
}

function createDropboxService() {
  if (!config.dropbox.refreshToken) {
    return async () => ({ path: '/disabled' });
  }

  const dbx = new Dropbox({
    clientId: config.dropbox.appKey,
    clientSecret: config.dropbox.appSecret,
    refreshToken: config.dropbox.refreshToken,
  });

  return async (fileBuffer: Buffer, fileName: string) => {
    const filePath = `${config.dropbox.basePath}/${fileName}`;
    const result = await dbx.filesUpload({ path: filePath, contents: fileBuffer, autorename: true });
    return { path: result.result.path_display ?? filePath };
  };
}

async function main() {
  logger.info('Starting Archibald backend', { port: config.server.port, env: config.server.nodeEnv });

  const pool = createPool(config.database);
  logger.info('Database pool created', { host: config.database.host, port: config.database.port });

  try {
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = loadMigrationFiles(migrationsDir);
    const result = await runMigrations(pool, files);
    logger.info('Database migrations complete', { applied: result.applied.length, skipped: result.skipped.length });
  } catch (err) {
    logger.warn('Migration files not found or already applied, continuing', { error: String(err) });
  }

  const queue = createOperationQueue({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  });
  logger.info('Operation queue initialized');

  const agentLock = createAgentLock();

  const browserPool = createBrowserPool(
    {
      maxBrowsers: parseInt(process.env.BROWSER_POOL_SIZE || '3', 10),
      maxContextsPerBrowser: 5,
      contextExpiryMs: 30 * 60 * 1000,
      launchOptions: {
        headless: config.puppeteer.headless,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
      sessionValidationUrl: config.archibald.url,
    },
    puppeteer.launch.bind(puppeteer) as any,
  );

  try {
    await browserPool.initialize();
    logger.info('Browser pool initialized');
  } catch (err) {
    logger.warn('Browser pool initialization failed, continuing without it', { error: String(err) });
  }

  const syncScheduler = createSyncScheduler(
    queue.enqueue.bind(queue),
    () => Array.from(agentLock.getAllActive().keys()),
  );

  const passwordCache = PasswordCache.getInstance();
  const pdfStore = createPdfStore();
  const sendEmail = createEmailService();
  const uploadToDropbox = createDropboxService();

  const wsServer = createWebSocketServer({
    createWss: (httpServer: http.Server) => new WebSocketServer({ server: httpServer }),
    verifyToken: async (token: string) => {
      const payload = await verifyJWT(token);
      return payload ? { userId: payload.userId } : null;
    },
  });

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
    verifyToken: async (token: string) => {
      const payload = await verifyJWT(token);
      return payload ? { userId: payload.userId } : null;
    },
    sendEmail,
    uploadToDropbox,
    broadcast: (userId, msg) => wsServer.broadcast(userId, msg),
  });

  const httpServer = http.createServer(app);
  wsServer.initialize(httpServer);

  httpServer.listen(config.server.port, () => {
    logger.info(`Server listening on port ${config.server.port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    syncScheduler.stop();

    httpServer.close(async () => {
      try {
        await wsServer.shutdown();
        await browserPool.shutdown();
        await queue.close();
        await pool.end();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: String(err) });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Bootstrap failed', { error: String(err) });
  process.exit(1);
});
