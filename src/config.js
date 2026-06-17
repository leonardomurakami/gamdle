import path from 'node:path';

const port = Number(process.env.PORT || 3000);

export const config = {
  port,
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`,
  databaseUrl: process.env.DATABASE_URL || '',
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'gamdle.sqlite'),
  dailySeedSecret: process.env.DAILY_SEED_SECRET || 'development-only-daily-seed',
  emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL || '',
  isProduction: process.env.NODE_ENV === 'production',
  loginTtlMs: 15 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
};
