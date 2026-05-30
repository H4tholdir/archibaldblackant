function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  db: {
    host: required('DB_HOST'),
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'noreply@formicanera.com',
  },
  tick: {
    intervalMs: parseInt(process.env.NOTIFICATION_TICK_MS ?? '3600000', 10),
    syncFreshnessMaxAgeMs: 6 * 60 * 60 * 1000,
  },
};
