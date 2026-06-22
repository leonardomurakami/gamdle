import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSessionCookie,
  hashToken,
  normalizeEmail,
  parseCookies,
  randomToken,
  sessionCookie,
} from '../src/auth.js';

// --- randomToken ---

test('randomToken returns a base64url string', () => {
  const token = randomToken();
  assert.ok(typeof token === 'string');
  assert.ok(token.length > 0);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test('randomToken generates unique values', () => {
  const tokens = new Set(Array.from({ length: 50 }, () => randomToken()));
  assert.equal(tokens.size, 50);
});

// --- clearSessionCookie ---

test('clearSessionCookie sets Max-Age to 0', () => {
  const cookie = clearSessionCookie(false);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /gamdle_session=/);
  assert.ok(!cookie.includes('Secure'));
});

test('clearSessionCookie includes Secure in production', () => {
  const cookie = clearSessionCookie(true);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=0/);
});

// --- normalizeEmail edge cases ---

test('normalizeEmail rejects empty string', () => {
  assert.throws(() => normalizeEmail(''), /valid email/);
});

test('normalizeEmail rejects null', () => {
  assert.throws(() => normalizeEmail(null), /valid email/);
});

test('normalizeEmail rejects undefined', () => {
  assert.throws(() => normalizeEmail(undefined), /valid email/);
});

test('normalizeEmail rejects email with spaces in local part', () => {
  assert.throws(() => normalizeEmail('user name@example.com'), /valid email/);
});

test('normalizeEmail rejects email without @', () => {
  assert.throws(() => normalizeEmail('userexample.com'), /valid email/);
});

test('normalizeEmail rejects email without domain', () => {
  assert.throws(() => normalizeEmail('user@'), /valid email/);
});

test('normalizeEmail rejects overly long email (>254 chars)', () => {
  const long = 'a'.repeat(250) + '@b.com';
  assert.throws(() => normalizeEmail(long), /valid email/);
});

test('normalizeEmail accepts valid email at 254 chars', () => {
  const local = 'a'.repeat(244);
  const email = `${local}@b.com.xx`;
  assert.equal(normalizeEmail(email), email);
});

test('normalizeEmail preserves plus addressing', () => {
  assert.equal(normalizeEmail('user+tag@example.com'), 'user+tag@example.com');
});

test('normalizeEmail preserves dots in local part', () => {
  assert.equal(normalizeEmail('first.last@example.com'), 'first.last@example.com');
});

// --- hashToken ---

test('hashToken returns hex string', () => {
  const hash = hashToken('test');
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('hashToken coerces non-string input', () => {
  const hash = hashToken(12345);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashToken('12345'));
});

// --- parseCookies edge cases ---

test('parseCookies returns empty object for empty string', () => {
  assert.deepEqual(parseCookies(''), {});
});

test('parseCookies returns empty object for undefined', () => {
  assert.deepEqual(parseCookies(), {});
});

test('parseCookies handles URL-encoded values', () => {
  const result = parseCookies('name=hello%20world');
  assert.equal(result.name, 'hello world');
});

test('parseCookies handles single cookie', () => {
  const result = parseCookies('key=value');
  assert.deepEqual(result, { key: 'value' });
});

test('parseCookies handles cookies with = in value', () => {
  const result = parseCookies('token=abc=def');
  assert.equal(result.token, 'abc=def');
});

// --- sessionCookie ---

test('sessionCookie without secure flag omits Secure', () => {
  const cookie = sessionCookie('tok', 3600, false);
  assert.ok(!cookie.includes('Secure'));
  assert.match(cookie, /gamdle_session=tok/);
  assert.match(cookie, /Max-Age=3600/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
});

test('sessionCookie encodes token value', () => {
  const cookie = sessionCookie('a b+c', 60, false);
  assert.match(cookie, /gamdle_session=a%20b%2Bc/);
});
