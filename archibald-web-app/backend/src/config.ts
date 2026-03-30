import dotenv from "dotenv";

dotenv.config();

export const config = {
  archibald: {
    // Centralized Archibald server URL - all services use this
    // Change ARCHIBALD_URL environment variable to point to different environments
    // Format: https://host:port/Archibald (with trailing path, no trailing slash after path)
    // Used by: customer-sync, product-sync, price-sync, browser-pool, queue-manager
    url: process.env.ARCHIBALD_URL || "https://4.231.124.90/Archibald",
    username: process.env.ARCHIBALD_USERNAME || "",
    password: process.env.ARCHIBALD_PASSWORD || "",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  puppeteer: {
    headless: process.env.NODE_ENV !== "development", // Headless in production and test, visible only in dev
    slowMo: process.env.NODE_ENV === "production" ? 50 : 200, // 50ms in production (fast but stable), 200ms in dev
    timeout: 60000, // Increased to 60s for slow Archibald responses
    protocolTimeout: 300000, // 5 minutes - increased for large orders (12+ items)
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--ignore-certificate-errors",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--no-zygote",
      "--disable-accelerated-2d-canvas",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--memory-pressure-off",
      "--js-flags=--max-old-space-size=512",
    ],
  },
  features: {
    // Feature flag for Send to Verona - disabled by default until safe test order available
    sendToVeronaEnabled: process.env.SEND_TO_VERONA_ENABLED === "true",
  },
  share: {
    baseUrl: process.env.SHARE_BASE_URL || "http://localhost:3000",
    pdfTtlMs: 24 * 60 * 60 * 1000,
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "",
  },
  queue: {
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "10", 10),
  },
  queues: {
    writes: {
      concurrency: parseInt(process.env.WRITES_CONCURRENCY || "5", 10),
      lockDuration: 420_000,
      stalledInterval: 30_000,
      removeOnComplete: { count: 500 } as const,
    },
    'agent-sync': {
      concurrency: parseInt(process.env.AGENT_SYNC_CONCURRENCY || "3", 10),
      lockDuration: 300_000,
      stalledInterval: 30_000,
      removeOnComplete: { count: 100 } as const,
    },
    enrichment: {
      concurrency: parseInt(process.env.ENRICHMENT_CONCURRENCY || "3", 10),
      lockDuration: 900_000,
      stalledInterval: 30_000,
      removeOnComplete: { count: 100 } as const,
    },
    'shared-sync': {
      concurrency: parseInt(process.env.SHARED_SYNC_CONCURRENCY || "1", 10),
      lockDuration: 900_000,
      stalledInterval: 60_000,
      removeOnComplete: { count: 100 } as const,
    },
  },
  browserPool: {
    maxBrowsers: parseInt(process.env.BROWSER_POOL_MAX_BROWSERS || "3", 10),
    maxContextsPerBrowser: parseInt(process.env.BROWSER_POOL_MAX_CONTEXTS || "8", 10),
    contextExpiryMs: parseInt(process.env.BROWSER_POOL_CONTEXT_EXPIRY_MS || "1800000", 10),
    serviceAccountContextExpiryMs: parseInt(process.env.BROWSER_POOL_SERVICE_ACCOUNT_CONTEXT_EXPIRY_MS || "900000", 10),
  },
  dropbox: {
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN || "",
    appKey: process.env.DROPBOX_APP_KEY || "",
    appSecret: process.env.DROPBOX_APP_SECRET || "",
    basePath: process.env.DROPBOX_BASE_PATH || "/Archibald/Preventivi",
  },
  database: {
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT || "5432", 10),
    database: process.env.PG_DATABASE || "archibald",
    user: process.env.PG_USER || "archibald",
    password: process.env.PG_PASSWORD || "",
    maxConnections: parseInt(process.env.PG_MAX_CONNECTIONS || "20", 10),
  },
} as const;
