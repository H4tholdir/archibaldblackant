import dotenv from 'dotenv';

dotenv.config();

export const config = {
  archibald: {
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
    timeout: 30000,
  },
} as const;
