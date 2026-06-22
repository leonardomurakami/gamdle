import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';

test('createDatabase with string path creates SQLite database', async () => {
  const db = await createDatabase(':memory:');
  assert.ok(db);
  const result = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tables = result.map((r) => r.name);
  assert.ok(tables.includes('users'));
  assert.ok(tables.includes('auth_tokens'));
  assert.ok(tables.includes('sessions'));
  assert.ok(tables.includes('daily_runs'));
  assert.ok(tables.includes('wagers'));
  assert.ok(tables.includes('achievements'));
  assert.ok(tables.includes('app_meta'));
  assert.ok(tables.includes('auth_attempts'));
  assert.ok(tables.includes('email_changes'));
});

test('createDatabase with options object and no databaseUrl falls back to SQLite', async () => {
  const db = await createDatabase({ databasePath: ':memory:', databaseUrl: '' });
  const result = await db.get("SELECT value FROM app_meta WHERE key = 'gameplay_version'");
  assert.equal(result.value, '2');
});

test('db.get returns null when no row matches', async () => {
  const db = await createDatabase(':memory:');
  const result = await db.get('SELECT * FROM users WHERE id = ?', 999);
  assert.equal(result, null);
});

test('db.run inserts and returns changes', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  const result = await db.run(
    'INSERT INTO users (email, created_at) VALUES (?, ?)',
    'test@example.com', now,
  );
  assert.equal(result.changes, 1);
  assert.ok(result.lastInsertRowid !== undefined);
});

test('db.all returns all matching rows', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'a@example.com', now);
  await db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'b@example.com', now);
  const rows = await db.all('SELECT * FROM users ORDER BY email');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].email, 'a@example.com');
  assert.equal(rows[1].email, 'b@example.com');
});

test('db.get accepts params as an array', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'array@example.com', now);
  const user = await db.get('SELECT * FROM users WHERE email = ?', ['array@example.com']);
  assert.equal(user.email, 'array@example.com');
});

test('transaction commits on success', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'tx@example.com', now);
  });
  const user = await db.get('SELECT * FROM users WHERE email = ?', 'tx@example.com');
  assert.equal(user.email, 'tx@example.com');
});

test('transaction rolls back on error', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await assert.rejects(async () => {
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'rollback@example.com', now);
      throw new Error('force rollback');
    });
  }, /force rollback/);
  const user = await db.get('SELECT * FROM users WHERE email = ?', 'rollback@example.com');
  assert.equal(user, null);
});

test('migration sets gameplay_version to 2', async () => {
  const db = await createDatabase(':memory:');
  const meta = await db.get("SELECT value FROM app_meta WHERE key = 'gameplay_version'");
  assert.equal(meta.value, '2');
});

test('migration clears stale gameplay data when version differs', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'u@example.com', now);
  const user = await db.get('SELECT id FROM users WHERE email = ?', 'u@example.com');
  await db.run(
    "INSERT INTO daily_runs (user_id, run_date, bankroll, move_number, status, created_at) VALUES (?, '2026-01-01', 1000, 0, 'active', ?)",
    user.id, now,
  );
  await db.run("UPDATE app_meta SET value = '1' WHERE key = 'gameplay_version'");

  const db2 = await createDatabase(':memory:');
  const runs = await db2.all('SELECT * FROM daily_runs');
  assert.equal(runs.length, 0);
  const meta = await db2.get("SELECT value FROM app_meta WHERE key = 'gameplay_version'");
  assert.equal(meta.value, '2');
});

test('foreign keys are enforced in SQLite', async () => {
  const db = await createDatabase(':memory:');
  await assert.rejects(async () => {
    await db.run(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ('hash', 9999, ?, ?)",
      Date.now() + 60000, Date.now(),
    );
  });
});

test('unique constraint on users.email is enforced', async () => {
  const db = await createDatabase(':memory:');
  const now = Date.now();
  await db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'dup@example.com', now);
  await assert.rejects(async () => {
    await db.run('INSERT INTO users (email, created_at) VALUES (?, ?)', 'dup@example.com', now);
  });
});
