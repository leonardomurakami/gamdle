import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';

const { server } = await import('../src/server.js');

function listen() {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server.address()));
  });
}

let base;

function localizeLink(link) {
  const url = new URL(link);
  return `${base}${url.pathname}${url.search}`;
}

test('server setup', async () => {
  const addr = await listen();
  base = `http://127.0.0.1:${addr.port}`;
});

test('GET / serves index.html', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('GET /app.js serves JavaScript', async () => {
  const res = await fetch(`${base}/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/javascript/);
});

test('GET /styles.css serves CSS', async () => {
  const res = await fetch(`${base}/styles.css`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/css/);
});

test('GET /nonexistent returns 404 JSON', async () => {
  const res = await fetch(`${base}/nonexistent`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'Not found.');
});

test('GET /api/me returns null user when unauthenticated', async () => {
  const res = await fetch(`${base}/api/me`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user, null);
});

test('GET /api/game returns 401 when unauthenticated', async () => {
  const res = await fetch(`${base}/api/game`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.ok(body.error);
});

test('GET /api/game/anonymous returns anonymous run payload with seed and gameOrder', async () => {
  const res = await fetch(`${base}/api/game/anonymous`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user, null);
  assert.equal(body.run.bankroll, 1000);
  assert.equal(body.run.move, 0);
  assert.equal(body.run.movesRemaining, 12);
  assert.equal(body.run.status, 'active');
  assert.deepEqual(body.run.wagers, []);
  assert.ok(body.run.seed);
  assert.ok(Array.isArray(body.run.gameOrder));
  assert.equal(body.run.gameOrder.length, 4);
  assert.ok(body.run.currentGame);
  assert.ok(body.rules);
  assert.ok(body.rules.games.wheel);
  assert.ok(body.rules.games.cards);
  assert.ok(body.rules.games.dice);
  assert.ok(body.rules.games.slots);
});

test('POST /api/auth/request sends magic link', async () => {
  const res = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `magic-${Date.now()}@example.com` }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.message);
  assert.ok(body.developmentLink);
});

test('POST /api/auth/request rejects invalid email', async () => {
  const res = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(res.status, 500);
});

test('POST /api/auth/request rate-limits by email', async () => {
  const email = `ratelimit-${Date.now()}@example.com`;
  for (let i = 0; i < 5; i++) {
    await fetch(`${base}/api/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  }
  const res = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.match(body.error, /Too many/);
});

test('full auth flow: request → verify → authenticated session', async () => {
  const email = `flow-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  assert.ok(developmentLink);

  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  assert.equal(verifyRes.status, 303);
  const setCookie = verifyRes.headers.get('set-cookie');
  assert.ok(setCookie);
  assert.match(setCookie, /gamdle_session=/);

  const cookie = setCookie.split(';')[0];
  const meRes = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } });
  const meBody = await meRes.json();
  assert.equal(meBody.user.email, email);
});

test('POST /api/auth/logout clears session', async () => {
  const email = `logout-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];

  const logoutRes = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(logoutRes.status, 200);
  const logoutCookie = logoutRes.headers.get('set-cookie');
  assert.match(logoutCookie, /Max-Age=0/);

  const meRes = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } });
  const meBody = await meRes.json();
  assert.equal(meBody.user, null);
});

test('auth verify with invalid token redirects to /?auth=invalid', async () => {
  const res = await fetch(`${base}/auth/verify?token=bogus`, { redirect: 'manual' });
  assert.equal(res.status, 303);
  assert.ok(res.headers.get('location').includes('auth=invalid'));
});

test('GET /api/game returns run with gameOrder for authenticated user', async () => {
  const email = `game-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];

  const gameRes = await fetch(`${base}/api/game`, { headers: { Cookie: cookie } });
  assert.equal(gameRes.status, 200);
  const body = await gameRes.json();
  assert.equal(body.user.email, email);
  assert.equal(body.run.bankroll, 1000);
  assert.equal(body.run.status, 'active');
  assert.ok(Array.isArray(body.run.gameOrder));
  assert.equal(body.run.gameOrder.length, 4);
  assert.ok(body.run.currentGame);
  assert.ok(body.rules);
});

test('POST /api/game/play places a wager (table derived from game order)', async () => {
  const email = `play-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];

  const gameRes = await fetch(`${base}/api/game`, { headers: { Cookie: cookie } });
  const gameBody = await gameRes.json();
  const firstTable = gameBody.run.gameOrder[0];

  const playRes = await fetch(`${base}/api/game/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ stake: 10, bet: { type: 'color', value: 'red' } }),
  });
  assert.equal(playRes.status, 200);
  const body = await playRes.json();
  assert.ok(body.run);
  assert.equal(body.run.move, 1);
  assert.equal(body.run.wagers.length, 1);
  assert.equal(body.run.wagers[0].table, firstTable);
  assert.ok(body.resolution);
});

test('POST /api/game/play returns 401 when unauthenticated', async () => {
  const res = await fetch(`${base}/api/game/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stake: 10, bet: { type: 'color', value: 'red' } }),
  });
  assert.equal(res.status, 401);
});

test('POST /api/game/anonymous/play resolves a wager with seed and gameOrder', async () => {
  const anonRes = await fetch(`${base}/api/game/anonymous`);
  const anonBody = await anonRes.json();
  const { seed, gameOrder, date } = anonBody.run;
  const firstTable = gameOrder[0];

  const res = await fetch(`${base}/api/game/anonymous/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      move: 0,
      bankroll: 1000,
      seed,
      gameOrder,
      stake: 50,
      bet: { type: 'color', value: 'red' },
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.wager.move, 1);
  assert.equal(body.wager.table, firstTable);
  assert.equal(body.wager.stake, 50);
  assert.ok(typeof body.wager.won === 'boolean');
  assert.ok(body.resolution);
  assert.ok(body.currentGame);
});

test('POST /api/game/anonymous/play rejects wrong date', async () => {
  const res = await fetch(`${base}/api/game/anonymous/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '1999-01-01',
      move: 0,
      bankroll: 1000,
      seed: 'abc',
      gameOrder: ['wheel', 'cards', 'dice', 'slots'],
      stake: 50,
      bet: { type: 'color', value: 'red' },
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /expire/);
});

test('POST /api/game/anonymous/play rejects invalid move number', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${base}/api/game/anonymous/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: today,
      move: 12,
      bankroll: 1000,
      seed: 'abc',
      gameOrder: ['wheel', 'cards', 'dice', 'slots'],
      stake: 50,
      bet: { type: 'color', value: 'red' },
    }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/game/anonymous/leave returns leaderboard', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${base}/api/game/anonymous/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: today, bankroll: 500 }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'left');
  assert.ok(body.results);
  assert.ok(Array.isArray(body.results.leaderboard));
});

test('POST /api/game/anonymous/leave rejects wrong date', async () => {
  const res = await fetch(`${base}/api/game/anonymous/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '1999-01-01', bankroll: 500 }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/game/anonymous/leave rejects invalid bankroll', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${base}/api/game/anonymous/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: today, bankroll: -10 }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/game/leave ends run for authenticated user', async () => {
  const email = `leave-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];

  const leaveRes = await fetch(`${base}/api/game/leave`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(leaveRes.status, 200);
  const body = await leaveRes.json();
  assert.equal(body.run.status, 'left');
});

test('POST /api/game/play rejects play on a finished run', async () => {
  const email = `finished-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];

  await fetch(`${base}/api/game/leave`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });

  const playRes = await fetch(`${base}/api/game/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ stake: 10, bet: { type: 'color', value: 'red' } }),
  });
  assert.equal(playRes.status, 409);
  const body = await playRes.json();
  assert.match(body.error, /ended/);
});

test('GET /api/nonexistent returns 404', async () => {
  const res = await fetch(`${base}/api/nonexistent`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'Not found.');
});

test('POST with invalid JSON returns 400', async () => {
  const res = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid json',
  });
  assert.equal(res.status, 400);
});

test('Bearer auth works in non-production mode', async () => {
  const email = `bearer-${Date.now()}@example.com`;
  const reqRes = await fetch(`${base}/api/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { developmentLink } = await reqRes.json();
  const verifyRes = await fetch(localizeLink(developmentLink), { redirect: 'manual' });
  const setCookie = verifyRes.headers.get('set-cookie');
  const sessionMatch = setCookie.match(/gamdle_session=([^;]+)/);
  const token = decodeURIComponent(sessionMatch[1]);

  const meRes = await fetch(`${base}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await meRes.json();
  assert.equal(body.user.email, email);
});

test('server teardown', () => {
  server.close();
});
