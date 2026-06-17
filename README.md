# Gamdle

A daily deterministic probability casino with fictional points and passwordless accounts.

## Run locally

Requires Node.js 24 or newer.

```bash
npm start
```

Open `http://localhost:3000`. In development, the sign-in screen displays the magic link that would normally be emailed.

The browser source lives in `frontend/`. `npm start`, `npm run dev`, and `npm test`
bundle it into `public/app.js` with esbuild before running.

## Run with Docker

Build and start the app with Docker Compose:

```bash
docker compose up --build
```

Open `http://localhost:3000`. Compose starts Postgres 17 and stores its data in
the named `postgres-data` volume. The app defaults to development mode so local
magic links are visible over HTTP.

For a production deployment, set stable environment values before starting:

```bash
NODE_ENV=production \
BASE_URL=https://your-domain.example \
DAILY_SEED_SECRET='replace-with-a-long-random-secret' \
EMAIL_WEBHOOK_URL=https://your-email-webhook.example/send \
POSTGRES_PASSWORD='replace-with-a-long-random-password' \
docker compose up --build -d
```

## Configuration

- `PORT`: HTTP port, defaults to `3000`.
- `BASE_URL`: public origin used in emails, defaults to `http://localhost:<PORT>`.
- `DATABASE_URL`: Postgres connection string. When unset, the app falls back to SQLite.
- `DATABASE_PATH`: SQLite path, defaults to `data/gamdle.sqlite`.
- `DAILY_SEED_SECRET`: secret used to derive daily outcomes.
- `EMAIL_WEBHOOK_URL`: optional HTTPS endpoint that receives `{ to, subject, text, html }`.
- `NODE_ENV=production`: enables secure cookies and suppresses development login links.

For production, set stable random secrets, serve over HTTPS, and configure `EMAIL_WEBHOOK_URL`. The webhook is intentionally provider-neutral.

## Rules

Every player starts with 1,000 points and has 12 global moves. A table outcome is derived from `(UTC date, move, table)`, so wager type, stake, sound, and animation timing cannot alter it. Every wager has a 96% theoretical return before integer rounding. Reaching zero, using all moves, or leaving ends the run.

No money, purchases, prizes, or redeemable value are supported.
