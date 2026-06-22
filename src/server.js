import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createDatabase } from './db.js';
import {
  clearSessionCookie,
  consumeAuthToken,
  hashToken,
  normalizeEmail,
  parseCookies,
  randomToken,
  sessionCookie,
} from './auth.js';
import {
  ACHIEVEMENTS,
  GameError,
  MAX_MOVES,
  STARTING_BANKROLL,
  achievementKeys,
  applyWager,
  eventFor,
  gameRules,
  resolveWager,
  utcDate,
} from './game.js';

const db = await createDatabase(config);
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function securityHeaders() {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
  if (config.isProduction) headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  return headers;
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders(), ...headers });
  res.end(JSON.stringify(body));
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, ...securityHeaders(), ...headers });
  res.end();
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Request is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (origin && origin !== config.baseUrl) throw new Error('Invalid request origin.');
}

async function currentUser(req) {
  const bearer = !config.isProduction && String(req.headers.authorization || '').startsWith('Bearer ')
    ? String(req.headers.authorization).slice(7)
    : null;
  const token = parseCookies(req.headers.cookie).gamdle_session || bearer;
  if (!token) return null;
  return await db.get(`
    SELECT users.id, users.email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, hashToken(token), Date.now());
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) json(res, 401, { error: 'Sign in to play today’s casino.' });
  return user;
}

async function createAuthToken({ email, purpose, userId = null, metadata = null }) {
  const raw = randomToken();
  const now = Date.now();
  await db.run(`
    INSERT INTO auth_tokens (token_hash, email, purpose, user_id, metadata, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, hashToken(raw), email, purpose, userId, metadata ? JSON.stringify(metadata) : null, now + config.loginTtlMs, now);
  return raw;
}

async function deliverEmail(to, subject, text, html) {
  if (!config.emailWebhookUrl) {
    console.log(`[Gamdle email] ${to}\n${text}`);
    return;
  }
  let response;
  try {
    response = await fetch(config.emailWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, text, html }),
    });
  } catch (error) {
    console.error('Email webhook network error:', error);
    throw new Error('Email delivery failed.');
  }
  if (!response.ok) {
    console.error(`Email webhook returned ${response.status} for ${to}`);
    throw new Error('Email delivery failed.');
  }
}

async function sendLink(email, purpose, userId = null, metadata = null) {
  const raw = await createAuthToken({ email, purpose, userId, metadata });
  const link = `${config.baseUrl}/auth/verify?token=${encodeURIComponent(raw)}`;
  await deliverEmail(
    email,
    purpose === 'login' ? 'Your Gamdle sign-in link' : 'Confirm your Gamdle account change',
    `Open this one-time link within 15 minutes:\n\n${link}\n\nIf you did not request this, ignore this email.`,
    `<p>Open this one-time link within 15 minutes:</p><p><a href="${link}">Continue to Gamdle</a></p><p>If you did not request this, ignore this email.</p>`,
  );
  return config.isProduction ? undefined : link;
}

async function createSession(userId) {
  const raw = randomToken();
  const now = Date.now();
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    hashToken(raw), userId, now + config.sessionTtlMs, now);
  return raw;
}

async function getOrCreateRun(userId) {
  const date = utcDate();
  const existing = await db.get('SELECT * FROM daily_runs WHERE user_id = ? AND run_date = ?', userId, date);
  if (existing) return existing;
  const now = Date.now();
  const result = await db.run(`
    INSERT INTO daily_runs (user_id, run_date, bankroll, move_number, status, created_at)
    VALUES (?, ?, ?, 0, 'active', ?)
    RETURNING id
  `, userId, date, STARTING_BANKROLL, now);
  const run = await db.get('SELECT * FROM daily_runs WHERE id = ?', result.lastInsertRowid);
  if (!run) throw new Error('Failed to create daily run.');
  return run;
}

function serializeWager(row) {
  let bet, event;
  try {
    bet = JSON.parse(row.bet_json);
  } catch {
    console.error(`Corrupt bet_json in wager ${row.id}`);
    bet = { selection: null, resultLabel: 'Unknown' };
  }
  try {
    event = JSON.parse(row.event_json);
  } catch {
    console.error(`Corrupt event_json in wager ${row.id}`);
    event = {};
  }
  return {
    move: row.move_number,
    table: row.table_key,
    stake: row.stake,
    won: Boolean(row.won),
    probability: row.probability,
    multiplier: row.multiplier,
    bankrollAfter: row.bankroll_after,
    netChange: row.net_change,
    event,
    bet: bet.selection,
    resultLabel: bet.resultLabel,
  };
}

async function runPayload(run, userId) {
  const wagers = await db.all('SELECT * FROM wagers WHERE run_id = ? ORDER BY move_number', run.id);
  const unlocked = await db.all('SELECT achievement_key, first_date FROM achievements WHERE user_id = ? ORDER BY unlocked_at', userId);
  const finished = run.status !== 'active';
  const payload = {
    date: run.run_date,
    bankroll: run.bankroll,
    move: run.move_number,
    movesRemaining: MAX_MOVES - run.move_number,
    status: run.status,
    wagers: wagers.map(serializeWager),
    achievements: unlocked.map((row) => ({ key: row.achievement_key, ...ACHIEVEMENTS[row.achievement_key], firstDate: row.first_date })),
  };
  if (finished) payload.results = await leaderboardPayload(run);
  return payload;
}

async function leaderboardPayload(run) {
  const rows = await db.all(`
    SELECT bankroll, COUNT(*) AS players
    FROM daily_runs WHERE run_date = ? AND status != 'active'
    GROUP BY bankroll ORDER BY bankroll DESC LIMIT 20
  `, run.run_date);
  const totals = await db.get(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN bankroll <= ? THEN 1 ELSE 0 END) AS at_or_below,
      SUM(CASE WHEN bankroll = 0 THEN 1 ELSE 0 END) AS broke
    FROM daily_runs WHERE run_date = ? AND status != 'active'
  `, run.bankroll, run.run_date);
  const total = Number(totals.total || 0);
  const atOrBelow = Number(totals.at_or_below || 0);
  const broke = Number(totals.broke || 0);
  return {
    leaderboard: rows.map((row) => ({ ...row, players: Number(row.players) })),
    percentile: total ? Math.round((atOrBelow / total) * 100) : 100,
    totalPlayers: total,
    brokePercent: total ? Math.round((broke / total) * 100) : 0,
  };
}

function anonymousRun(date = utcDate()) {
  return {
    date,
    bankroll: STARTING_BANKROLL,
    move: 0,
    movesRemaining: MAX_MOVES,
    status: 'active',
    wagers: [],
    achievements: [],
  };
}

async function anonymousResults(date, bankroll) {
  return await leaderboardPayload({ run_date: date, bankroll });
}

async function awardAchievements(run, database = db) {
  const wagers = await database.all('SELECT * FROM wagers WHERE run_id = ? ORDER BY move_number', run.id);
  const keys = achievementKeys(wagers, run.bankroll, run.status !== 'active');
  for (const key of keys) await database.run(`
    INSERT INTO achievements (user_id, achievement_key, first_date, unlocked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, achievement_key) DO NOTHING
  `, run.user_id, key, run.run_date, Date.now());
  return keys;
}

async function finishRun(run, status) {
  await db.run('UPDATE daily_runs SET status = ?, finished_at = ? WHERE id = ? AND status = ?',
    status, Date.now(), run.id, 'active');
  const updated = await db.get('SELECT * FROM daily_runs WHERE id = ?', run.id);
  await awardAchievements(updated);
  return updated;
}

async function handleApi(req, res, url) {
  if (req.method === 'POST') assertSameOrigin(req);

  if (req.method === 'POST' && url.pathname === '/api/auth/request') {
    const { email: rawEmail } = await readJson(req);
    const email = normalizeEmail(rawEmail);
    const ip = requestIp(req);
    const cutoff = Date.now() - config.loginTtlMs;
    const recent = await db.get(`
      SELECT
        SUM(CASE WHEN email = ? THEN 1 ELSE 0 END) AS by_email,
        SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS by_ip
      FROM auth_attempts WHERE created_at > ?
    `, email, ip, cutoff);
    if ((recent.by_email || 0) >= 5 || (recent.by_ip || 0) >= 20) {
      return json(res, 429, { error: 'Too many sign-in requests. Try again in 15 minutes.' });
    }
    await db.run('INSERT INTO auth_attempts (email, ip, created_at) VALUES (?, ?, ?)', email, ip, Date.now());
    await db.run("UPDATE auth_tokens SET used_at = ? WHERE email = ? AND purpose = 'login' AND used_at IS NULL",
      Date.now(), email);
    const developmentLink = await sendLink(email, 'login');
    return json(res, 200, {
      message: 'Check your email for a one-time sign-in link.',
      ...(developmentLink ? { developmentLink } : {}),
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req.headers.cookie).gamdle_session;
    if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(config.isProduction) });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = await currentUser(req);
    return json(res, 200, { user });
  }

  if (req.method === 'GET' && url.pathname === '/api/game') {
    const user = await requireUser(req, res);
    if (!user) return;
    return json(res, 200, {
      user,
      rules: gameRules(),
      run: await runPayload(await getOrCreateRun(user.id), user.id),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/game/anonymous') {
    return json(res, 200, {
      user: null,
      rules: gameRules(),
      run: anonymousRun(),
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/game/anonymous/play') {
    const { date, move, bankroll, table, stake, bet } = await readJson(req);
    if (date !== utcDate()) return json(res, 400, { error: 'Anonymous runs expire when the daily casino changes.' });
    const nextMove = Number(move) + 1;
    if (!Number.isInteger(nextMove) || nextMove < 1 || nextMove > MAX_MOVES) {
      return json(res, 400, { error: 'Invalid move number.' });
    }
    try {
      const event = eventFor(config.dailySeedSecret, date, nextMove, table);
      const resolution = resolveWager(table, event, bet || {});
      const applied = applyWager(Number(bankroll), Number(stake), resolution);
      const status = applied.bankroll === 0 ? 'broke' : nextMove === MAX_MOVES ? 'complete' : 'active';
      return json(res, 200, {
        wager: {
          move: nextMove,
          table,
          stake: Number(stake),
          won: resolution.won,
          probability: resolution.probability,
          multiplier: resolution.multiplier,
          bankrollAfter: applied.bankroll,
          netChange: applied.netChange,
          resultLabel: resolution.label,
        },
        status,
        ...(status !== 'active' ? { results: await anonymousResults(date, applied.bankroll) } : {}),
        resolution: {
          ...resolution,
          ...applied,
          event: table === 'slots' ? { symbols: resolution.symbols } : event,
        },
      });
    } catch (error) {
      if (error instanceof GameError) return json(res, 400, { error: error.message });
      throw error;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/game/anonymous/leave') {
    const { date, bankroll } = await readJson(req);
    if (date !== utcDate()) return json(res, 400, { error: 'Anonymous runs expire when the daily casino changes.' });
    const finalBankroll = Number(bankroll);
    const maxAnonymousBankroll = STARTING_BANKROLL * MAX_MOVES;
    if (!Number.isInteger(finalBankroll) || finalBankroll < 0 || finalBankroll > maxAnonymousBankroll) {
      return json(res, 400, { error: 'Invalid bankroll.' });
    }
    return json(res, 200, { status: 'left', results: await anonymousResults(date, finalBankroll) });
  }

  if (req.method === 'POST' && url.pathname === '/api/game/play') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { table, stake, bet } = await readJson(req);
    const run = await getOrCreateRun(user.id);
    if (run.status !== 'active') return json(res, 409, { error: 'Today’s run has already ended.' });

    try {
      const nextMove = run.move_number + 1;
      const event = eventFor(config.dailySeedSecret, run.run_date, nextMove, table);
      const resolution = resolveWager(table, event, bet || {});
      const applied = applyWager(run.bankroll, Number(stake), resolution);
      const status = applied.bankroll === 0 ? 'broke' : nextMove === MAX_MOVES ? 'complete' : 'active';
      const now = Date.now();
      const updated = await db.transaction(async (tx) => {
        await tx.run(`
          INSERT INTO wagers (
            run_id, move_number, table_key, bet_json, stake, event_json,
            won, probability, multiplier, bankroll_after, net_change, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          run.id, nextMove, table, JSON.stringify({ selection: bet, resultLabel: resolution.label }),
          Number(stake), JSON.stringify(event), resolution.won ? 1 : 0,
          resolution.probability, resolution.multiplier, applied.bankroll, applied.netChange, now,
        );
        await tx.run(`
          UPDATE daily_runs SET bankroll = ?, move_number = ?, status = ?, finished_at = ?
          WHERE id = ? AND move_number = ? AND status = 'active'
        `, applied.bankroll, nextMove, status, status === 'active' ? null : now, run.id, run.move_number);
        const selected = await tx.get('SELECT * FROM daily_runs WHERE id = ?', run.id);
        await awardAchievements(selected, tx);
        return selected;
      });
      return json(res, 200, {
        run: await runPayload(updated, user.id),
        resolution: {
          ...resolution,
          ...applied,
          event: table === 'slots' ? { symbols: resolution.symbols } : event,
        },
      });
    } catch (error) {
      if (error instanceof GameError) return json(res, 400, { error: error.message });
      throw error;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/game/leave') {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await getOrCreateRun(user.id);
    const updated = run.status === 'active' ? await finishRun(run, 'left') : run;
    return json(res, 200, { run: await runPayload(updated, user.id) });
  }

  if (req.method === 'POST' && url.pathname === '/api/account/change-email') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { email: rawEmail } = await readJson(req);
    const newEmail = normalizeEmail(rawEmail);
    if (newEmail === user.email) return json(res, 400, { error: 'That is already your account email.' });
    if (await db.get('SELECT 1 FROM users WHERE email = ?', newEmail)) {
      return json(res, 200, { message: 'Verification links have been sent if that address is available.' });
    }
    const now = Date.now();
    const result = await db.run(`
      INSERT INTO email_changes (user_id, old_email, new_email, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `, user.id, user.email, newEmail, now + config.loginTtlMs, now);
    const requestId = Number(result.lastInsertRowid);
    const oldLink = await sendLink(user.email, 'email_change_old', user.id, { requestId });
    const newLink = await sendLink(newEmail, 'email_change_new', user.id, { requestId });
    return json(res, 200, {
      message: 'Open both verification emails within 15 minutes to complete the change.',
      ...(!config.isProduction ? { developmentLinks: [oldLink, newLink] } : {}),
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/account/delete') {
    const user = await requireUser(req, res);
    if (!user) return;
    await db.run("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'delete' AND used_at IS NULL",
      Date.now(), user.id);
    const developmentLink = await sendLink(user.email, 'delete', user.id);
    return json(res, 200, {
      message: 'Check your email for a fresh account deletion link.',
      ...(developmentLink ? { developmentLink } : {}),
    });
  }

  json(res, 404, { error: 'Not found.' });
}

async function handleVerification(res, url) {
  const raw = url.searchParams.get('token') || '';
  const now = Date.now();
  const token = await consumeAuthToken(db, raw, now);
  if (!token) return redirect(res, '/?auth=invalid');

  if (token.purpose === 'login') {
    let user = await db.get('SELECT * FROM users WHERE email = ?', token.email);
    if (!user) {
      const result = await db.run('INSERT INTO users (email, created_at) VALUES (?, ?) RETURNING id', token.email, now);
      user = await db.get('SELECT * FROM users WHERE id = ?', result.lastInsertRowid);
    }
    const session = await createSession(user.id);
    return redirect(res, config.isProduction ? '/' : `/#dev_session=${encodeURIComponent(session)}`, {
      'Set-Cookie': sessionCookie(session, Math.floor(config.sessionTtlMs / 1000), config.isProduction),
    });
  }

  if (token.purpose === 'delete') {
    await db.run('DELETE FROM users WHERE id = ?', token.user_id);
    return redirect(res, '/?account=deleted', { 'Set-Cookie': clearSessionCookie(config.isProduction) });
  }

  if (token.purpose.startsWith('email_change_')) {
    let requestId;
    try {
      ({ requestId } = JSON.parse(token.metadata || '{}'));
    } catch {
      return redirect(res, '/?auth=invalid');
    }
    if (!requestId) return redirect(res, '/?auth=invalid');
    const column = token.purpose === 'email_change_old' ? 'old_verified_at' : 'new_verified_at';
    await db.run(`UPDATE email_changes SET ${column} = ? WHERE id = ? AND expires_at > ? AND completed_at IS NULL`,
      now, requestId, now);
    const request = await db.get('SELECT * FROM email_changes WHERE id = ?', requestId);
    if (request?.old_verified_at && request?.new_verified_at && !request.completed_at) {
      await db.run('UPDATE users SET email = ? WHERE id = ?', request.new_email, request.user_id);
      await db.run('UPDATE email_changes SET completed_at = ? WHERE id = ?', now, requestId);
      return redirect(res, '/?account=email-changed');
    }
    return redirect(res, '/?account=email-half-confirmed');
  }

  return redirect(res, '/?auth=invalid');
}

function serveStatic(res, pathname) {
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/dice-box.js': ['dice-box.js', 'text/javascript; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  };
  const entry = files[pathname];
  if (!entry) return false;
  const content = fs.readFileSync(path.join(publicDir, entry[0]));
  res.writeHead(200, {
    'Content-Type': entry[1],
    'Cache-Control': config.isProduction && pathname !== '/' ? 'public, max-age=3600' : 'no-cache',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    ...securityHeaders(),
  });
  res.end(content);
  return true;
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, config.baseUrl);
  try {
    if (url.pathname === '/auth/verify') return await handleVerification(res, url);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (serveStatic(res, url.pathname)) return;
    json(res, 404, { error: 'Not found.' });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    if (status === 500) console.error(error);
    json(res, status, { error: status === 500 ? 'Something went wrong.' : 'Invalid request.' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, () => {
    console.log(`Gamdle is running at ${config.baseUrl}`);
  });
}
