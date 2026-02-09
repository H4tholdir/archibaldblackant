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
    headless: process.env.NODE_ENV === "production" ? true : false, // Headless in production, visible in dev
    slowMo: process.env.NODE_ENV === "production" ? 50 : 200, // 50ms in production (fast but stable), 200ms in dev
    timeout: 60000, // Increased to 60s for slow Archibald responses
    protocolTimeout: 300000, // 5 minutes - increased for large orders (12+ items)
  },
  features: {
    // Feature flag for Send to Milano - disabled by default until safe test order available
    sendToMilanoEnabled: process.env.SEND_TO_MILANO_ENABLED === "true",
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
  dropbox: {
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN || "",
    appKey: process.env.DROPBOX_APP_KEY || "",
    appSecret: process.env.DROPBOX_APP_SECRET || "",
    basePath: process.env.DROPBOX_BASE_PATH || "/Archibald/Preventivi",
  },
} as const;
