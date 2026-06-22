import crypto from 'node:crypto';
import path from 'node:path';

const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.DAILY_SEED_SECRET) {
  throw new Error('DAILY_SEED_SECRET must be set in production. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"');
}

const dailySeedSecret = process.env.DAILY_SEED_SECRET
  || (isProduction ? undefined : 'development-only-daily-seed');

if (!isProduction && !process.env.DAILY_SEED_SECRET) {
  console.warn('[security] Using default DAILY_SEED_SECRET — set the env var before deploying.');
}

export const config = {
  port,
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`,
  databaseUrl: process.env.DATABASE_URL || '',
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'gamdle.sqlite'),
  dailySeedSecret,
  emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL || '',
  isProduction,
  loginTtlMs: 15 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
};
