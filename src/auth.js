import crypto from 'node:crypto';

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export async function consumeAuthToken(db, token, now = Date.now()) {
  return await db.get(`
    UPDATE auth_tokens
    SET used_at = ?
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
    RETURNING *
  `, now, hashToken(token), now);
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

export function sessionCookie(token, maxAgeSeconds, secure) {
  const parts = [
    `gamdle_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure) {
  return sessionCookie('', 0, secure);
}
