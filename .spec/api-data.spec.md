# API And Data Specification

## Runtime

- Node.js 24 or newer.
- Native Node HTTP server.
- Native `node:sqlite` synchronous SQLite driver.
- No external runtime dependencies.
- JSON is used for all API request and response bodies.

## API Endpoints

### `POST /api/auth/request`

Request:

```json
{ "email": "player@example.com" }
```

Success returns a generic confirmation. Development additionally returns `developmentLink`.

### `POST /api/auth/logout`

Ends the current cookie session and clears the session cookie.

### `GET /api/me`

Response:

```json
{
  "user": {
    "id": 1,
    "email": "player@example.com"
  }
}
```

`user` is `null` when unauthenticated.

### `GET /api/game`

Requires authentication. Creates today's run when absent.

Response:

```json
{
  "user": { "id": 1, "email": "player@example.com" },
  "rules": {
    "version": 2,
    "rtp": 0.96,
    "houseEdge": 0.04,
    "maxMoves": 12,
    "startingBankroll": 1000,
    "games": {}
  },
  "run": {}
}
```

`rules.games` contains every legal wager, probability, multiplier, risk label, and slot paytable. The client does not independently calculate odds.

Active run fields:

```json
{
  "date": "2026-06-15",
  "bankroll": 1000,
  "move": 0,
  "movesRemaining": 12,
  "status": "active",
  "wagers": [],
  "achievements": []
}
```

Finished runs additionally include `results` with leaderboard rows, percentile, total players, and broke percentage.

### `POST /api/game/play`

Request:

```json
{
  "table": "wheel",
  "stake": 100,
  "bet": { "type": "color", "value": "red" }
}
```

The server:

- Rejects a finished run.
- Derives the event for the next move.
- Validates and resolves the wager.
- Validates the integer stake against the current bankroll.
- Inserts the wager and advances the run in one immediate transaction.
- Ends the run when it reaches zero or move 12.
- Awards newly satisfied achievements.

Response:

```json
{
  "run": {},
  "resolution": {
    "won": false,
    "probability": 0.4864864865,
    "multiplier": 1.9733333333,
    "label": "Pocket 31, black",
    "risk": "Common",
    "bankroll": 900,
    "netChange": -100,
    "returned": 0,
    "event": { "pocket": 31 }
  }
}
```

For slots, `event` contains only the three resolved symbols.

### `POST /api/game/leave`

Finishes an active run with status `left`. Repeated calls return the existing finished run.

### `POST /api/account/change-email`

Request:

```json
{ "email": "new@example.com" }
```

Creates the dual-verification email-change flow.

### `POST /api/account/delete`

Creates and sends a fresh one-time deletion link.

### `GET /auth/verify?token=...`

Consumes login, email-change, or deletion tokens and redirects to an appropriate app status URL.

## Database

SQLite uses foreign keys and WAL mode.

### `users`

One row per normalized email account.

### `auth_tokens`

Hashed one-time tokens for login, deletion, and both sides of email changes. Includes purpose, email, optional user, JSON metadata, expiry, used timestamp, and creation timestamp.

### `sessions`

Hashed 30-day session tokens linked to users.

### `auth_attempts`

Email/IP request records used by login rate limiting.

### `email_changes`

Tracks current address, proposed address, both verification timestamps, expiry, and completion.

### `daily_runs`

Unique on `(user_id, run_date)`. Stores bankroll, move number, status, and timestamps.

Run statuses implemented:

- `active`
- `broke`
- `complete`
- `left`

### `wagers`

Unique on `(run_id, move_number)`. Stores table, selected bet JSON, stake, deterministic event JSON, result, probability, multiplier, bankroll after settlement, net change, and timestamp.

### `achievements`

Unique on `(user_id, achievement_key)`. Stores first unlock date and timestamp.

### `app_meta`

Stores application migration state.

## Gameplay Migration

On database initialization, if `app_meta.gameplay_version` is not `2`:

- All achievements are deleted.
- All wagers are deleted.
- All daily runs are deleted.
- Users, sessions, authentication tokens, and account data are preserved.
- `gameplay_version` is set to `2`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port. |
| `BASE_URL` | `http://localhost:<PORT>` | Public origin, email links, and Origin validation. |
| `DATABASE_PATH` | `data/gamdle.sqlite` | SQLite database location. |
| `DAILY_SEED_SECRET` | Development-only string | HMAC secret for deterministic events. |
| `EMAIL_WEBHOOK_URL` | Empty | Optional provider-neutral email endpoint. |
| `NODE_ENV` | Not production | Enables production cookies and suppresses development links when set to `production`. |
