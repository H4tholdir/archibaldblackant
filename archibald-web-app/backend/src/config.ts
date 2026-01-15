import dotenv from 'dotenv';

dotenv.config();

export const config = {
  archibald: {
    // Centralized Archibald server URL - all services use this
    // Change ARCHIBALD_URL environment variable to point to different environments
    // Format: https://host:port/Archibald (with trailing path, no trailing slash after path)
    // Used by: customer-sync, product-sync, price-sync, browser-pool, queue-manager
    url: process.env.ARCHIBALD_URL || 'https://4.231.124.90/Archibald',
    username: process.env.ARCHIBALD_USERNAME || '',
    password: process.env.ARCHIBALD_PASSWORD || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  puppeteer: {
    headless: false, // Sempre visibile per debug
    slowMo: 200, // Rallenta per vedere meglio
    timeout: 60000, // Increased to 60s for slow Archibald responses
  },
  features: {
    // Feature flag for Send to Milano - disabled by default until safe test order available
    sendToMilanoEnabled: process.env.SEND_TO_MILANO_ENABLED === 'true',
  },
} as const;
