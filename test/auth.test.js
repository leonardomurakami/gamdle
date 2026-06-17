import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeAuthToken,
  hashToken,
  normalizeEmail,
  parseCookies,
  sessionCookie,
} from '../src/auth.js';
import { createDatabase } from '../src/db.js';

test('email normalization trims and lowercases without rewriting the address', () => {
  assert.equal(normalizeEmail(' Player+Daily@Example.COM '), 'player+daily@example.com');
  assert.throws(() => normalizeEmail('not-an-email'));
});

test('tokens are stored as stable hashes', () => {
  assert.equal(hashToken('one-time'), hashToken('one-time'));
  assert.notEqual(hashToken('one-time'), hashToken('another'));
});

test('production session cookies carry required protections', () => {
  const cookie = sessionCookie('secret', 60, true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.deepEqual(parseCookies('theme=dark; gamdle_session=secret'), {
    theme: 'dark',
    gamdle_session: 'secret',
  });
});

test('magic links can be consumed once and expired links are rejected', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await db.run(`
    INSERT INTO auth_tokens (token_hash, email, purpose, expires_at, created_at)
    VALUES (?, ?, 'login', ?, ?)
  `, hashToken('valid-token'), 'player@example.com', now + 1000, now);
  await db.run(`
    INSERT INTO auth_tokens (token_hash, email, purpose, expires_at, created_at)
    VALUES (?, ?, 'login', ?, ?)
  `, hashToken('expired-token'), 'player@example.com', now - 1, now - 1000);

  assert.equal((await consumeAuthToken(db, 'valid-token', now)).email, 'player@example.com');
  assert.equal(await consumeAuthToken(db, 'valid-token', now), null);
  assert.equal(await consumeAuthToken(db, 'expired-token', now), null);
});
