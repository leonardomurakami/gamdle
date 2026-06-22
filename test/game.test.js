import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMES_PER_RUN,
  PLAYS_PER_GAME,
  RTP,
  SLOT_PROFILES,
  achievementKeys,
  applyWager,
  eventFor,
  gameRules,
  generateAnonymousSeed,
  generateUserSeed,
  resolveWager,
  shuffleGameOrder,
  slotTierForPlay,
} from '../src/game.js';

test('daily events are deterministic and independent of wager choices', () => {
  const first = eventFor('secret', '2026-06-15', 4, 'wheel');
  const second = eventFor('secret', '2026-06-15', 4, 'wheel');
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, eventFor('secret', '2026-06-15', 5, 'wheel'));
});

test('different wheel wagers resolve against the same event', () => {
  const event = { pocket: 7 };
  const red = resolveWager('wheel', event, { type: 'color', value: 'red' });
  const exact = resolveWager('wheel', event, { type: 'exact', value: 7 });
  assert.equal(red.won, true);
  assert.equal(exact.won, true);
  assert.equal(exact.probability, 1 / 37);
});

test('stake cannot exceed the current bankroll', () => {
  assert.throws(() => applyWager(100, 101, { won: false, multiplier: 2 }), /within your bankroll/);
});

test('winning return includes the original stake', () => {
  assert.deepEqual(
    applyWager(1000, 100, { won: true, multiplier: 2 }),
    { bankroll: 1100, netChange: 100, returned: 200 },
  );
});

test('luck achievements are derived from immutable wager history', () => {
  const wagers = [
    {
      table_key: 'dice',
      event_json: JSON.stringify({ die1: 1, die2: 1 }),
      won: 1,
      probability: 0.05,
      bankroll_after: 1040,
      net_change: 40,
    },
  ];
  const keys = achievementKeys(wagers, 1040, false);
  assert.ok(keys.includes('snake_eyes'));
  assert.ok(keys.includes('against_all_odds'));
});

test('every binary wager has a 96% theoretical return', () => {
  const rules = gameRules();
  const wagers = [
    ...rules.games.wheel.outsideBets,
    ...rules.games.wheel.exactBets,
    ...rules.games.cards.bets,
    ...rules.games.dice.rangeBets,
    ...rules.games.dice.exactBets,
  ];
  for (const wager of wagers) {
    assert.ok(Math.abs(wager.probability * wager.multiplier - RTP) < 1e-12, wager.key);
  }
});

test('slot profiles total 100% probability and 96% RTP', () => {
  for (const [key, profile] of Object.entries(SLOT_PROFILES)) {
    const probability = profile.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
    const rtp = profile.outcomes.reduce((sum, outcome) => sum + outcome.probability * outcome.multiplier, 0);
    assert.ok(Math.abs(probability - 1) < 1e-12, `${key} probability`);
    assert.ok(Math.abs(rtp - RTP) < 1e-12, `${key} RTP`);
  }
});

test('physical event remains unchanged when the wager changes', () => {
  const event = eventFor('secret', '2026-06-15', 9, 'slots');
  const silver = resolveWager('slots', event, { tier: 'silver' });
  const diamond = resolveWager('slots', event, { tier: 'diamond' });
  assert.equal(event.roll, eventFor('secret', '2026-06-15', 9, 'slots').roll);
  assert.ok(Array.isArray(silver.symbols));
  assert.ok(Array.isArray(diamond.symbols));
  assert.equal(silver.symbols.length, 5);
  assert.equal(diamond.symbols.length, 5);
});

test('generateUserSeed is deterministic for same inputs', () => {
  const a = generateUserSeed('secret', 42, '2026-06-15');
  const b = generateUserSeed('secret', 42, '2026-06-15');
  assert.equal(a, b);
  const c = generateUserSeed('secret', 43, '2026-06-15');
  assert.notEqual(a, c);
});

test('generateAnonymousSeed is random each call', () => {
  const a = generateAnonymousSeed();
  const b = generateAnonymousSeed();
  assert.notEqual(a, b);
});

test('shuffleGameOrder is deterministic and returns 4 tables', () => {
  const order1 = shuffleGameOrder('seed1', '2026-06-15');
  const order2 = shuffleGameOrder('seed1', '2026-06-15');
  assert.deepEqual(order1, order2);
  assert.equal(order1.length, GAMES_PER_RUN);
  const sorted = [...order1].sort();
  assert.deepEqual(sorted, ['cards', 'dice', 'slots', 'wheel']);
});

test('slotTierForPlay returns correct tiers', () => {
  assert.equal(slotTierForPlay(0), 'silver');
  assert.equal(slotTierForPlay(1), 'gold');
  assert.equal(slotTierForPlay(2), 'diamond');
  assert.equal(slotTierForPlay(5), 'diamond');
});
