import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTING_BANKROLL,
  MAX_MOVES,
  RTP,
  TABLES,
  achievementKeys,
  applyWager,
  eventFor,
  gameRules,
  resolveWager,
  utcDate,
} from '../src/game.js';

// --- utcDate ---

test('utcDate returns ISO date string for given Date', () => {
  assert.equal(utcDate(new Date('2026-03-15T12:00:00Z')), '2026-03-15');
  assert.equal(utcDate(new Date('2026-12-31T23:59:59Z')), '2026-12-31');
});

test('utcDate defaults to current UTC date', () => {
  const expected = new Date().toISOString().slice(0, 10);
  assert.equal(utcDate(), expected);
});

// --- eventFor edge cases ---

test('eventFor rejects invalid table', () => {
  assert.throws(() => eventFor('secret', '2026-01-01', 1, 'roulette'), /Invalid table or move/);
});

test('eventFor rejects move 0', () => {
  assert.throws(() => eventFor('secret', '2026-01-01', 0, 'wheel'), /Invalid table or move/);
});

test('eventFor rejects move > MAX_MOVES', () => {
  assert.throws(() => eventFor('secret', '2026-01-01', MAX_MOVES + 1, 'wheel'), /Invalid table or move/);
});

test('eventFor returns pocket for wheel', () => {
  const event = eventFor('secret', '2026-01-01', 1, 'wheel');
  assert.ok('pocket' in event);
  assert.ok(event.pocket >= 0 && event.pocket <= 36);
});

test('eventFor returns rank and suit for cards', () => {
  const event = eventFor('secret', '2026-01-01', 1, 'cards');
  assert.ok(event.rank >= 1 && event.rank <= 13);
  assert.ok(['hearts', 'diamonds', 'clubs', 'spades'].includes(event.suit));
});

test('eventFor returns two dice for dice', () => {
  const event = eventFor('secret', '2026-01-01', 1, 'dice');
  assert.ok(event.die1 >= 1 && event.die1 <= 6);
  assert.ok(event.die2 >= 1 && event.die2 <= 6);
});

test('eventFor returns roll for slots', () => {
  const event = eventFor('secret', '2026-01-01', 1, 'slots');
  assert.ok('roll' in event);
  assert.ok(event.roll >= 0 && event.roll < 2000);
});

test('different secrets produce different events', () => {
  const a = eventFor('secret-a', '2026-01-01', 1, 'wheel');
  const b = eventFor('secret-b', '2026-01-01', 1, 'wheel');
  assert.notDeepEqual(a, b);
});

// --- Card resolution ---

test('card over threshold resolves correctly', () => {
  const event = { rank: 10, suit: 'hearts' };
  const resolution = resolveWager('cards', event, { direction: 'over', threshold: 5 });
  assert.equal(resolution.won, true);
  assert.equal(resolution.probability, 8 / 13);
  assert.ok(resolution.label.includes('hearts'));
});

test('card under threshold resolves correctly', () => {
  const event = { rank: 3, suit: 'clubs' };
  const resolution = resolveWager('cards', event, { direction: 'under', threshold: 7 });
  assert.equal(resolution.won, true);
  assert.equal(resolution.probability, 6 / 13);
});

test('card over threshold loses when rank equals threshold', () => {
  const event = { rank: 5, suit: 'diamonds' };
  const resolution = resolveWager('cards', event, { direction: 'over', threshold: 5 });
  assert.equal(resolution.won, false);
});

test('card under threshold loses when rank equals threshold', () => {
  const event = { rank: 7, suit: 'spades' };
  const resolution = resolveWager('cards', event, { direction: 'under', threshold: 7 });
  assert.equal(resolution.won, false);
});

test('card resolution names face cards correctly', () => {
  const ace = resolveWager('cards', { rank: 1, suit: 'hearts' }, { direction: 'under', threshold: 5 });
  assert.match(ace.label, /Ace/);
  const jack = resolveWager('cards', { rank: 11, suit: 'hearts' }, { direction: 'over', threshold: 5 });
  assert.match(jack.label, /Jack/);
  const queen = resolveWager('cards', { rank: 12, suit: 'hearts' }, { direction: 'over', threshold: 5 });
  assert.match(queen.label, /Queen/);
  const king = resolveWager('cards', { rank: 13, suit: 'hearts' }, { direction: 'over', threshold: 5 });
  assert.match(king.label, /King/);
});

test('card resolution rejects invalid threshold', () => {
  assert.throws(() => resolveWager('cards', { rank: 5, suit: 'hearts' }, { direction: 'over', threshold: 'abc' }));
});

test('card resolution rejects invalid direction', () => {
  assert.throws(() => resolveWager('cards', { rank: 5, suit: 'hearts' }, { direction: 'exact', threshold: 5 }));
});

test('card over threshold rejects threshold > 12', () => {
  assert.throws(() => resolveWager('cards', { rank: 5, suit: 'hearts' }, { direction: 'over', threshold: 13 }));
});

test('card under threshold rejects threshold < 2', () => {
  assert.throws(() => resolveWager('cards', { rank: 5, suit: 'hearts' }, { direction: 'under', threshold: 1 }));
});

// --- Dice resolution ---

test('dice range low wins when total <= 6', () => {
  const event = { die1: 2, die2: 3 };
  const resolution = resolveWager('dice', event, { type: 'range', value: 'low' });
  assert.equal(resolution.won, true);
  assert.equal(resolution.probability, 15 / 36);
  assert.match(resolution.label, /2 \+ 3 = 5/);
});

test('dice range high wins when total >= 8', () => {
  const event = { die1: 5, die2: 4 };
  const resolution = resolveWager('dice', event, { type: 'range', value: 'high' });
  assert.equal(resolution.won, true);
});

test('dice range seven wins only on total 7', () => {
  const win = resolveWager('dice', { die1: 3, die2: 4 }, { type: 'range', value: 'seven' });
  assert.equal(win.won, true);
  const lose = resolveWager('dice', { die1: 3, die2: 3 }, { type: 'range', value: 'seven' });
  assert.equal(lose.won, false);
});

test('dice range low loses on total 7', () => {
  const resolution = resolveWager('dice', { die1: 3, die2: 4 }, { type: 'range', value: 'low' });
  assert.equal(resolution.won, false);
});

test('dice exact bet wins on matching total', () => {
  const resolution = resolveWager('dice', { die1: 5, die2: 6 }, { type: 'exact', value: 11 });
  assert.equal(resolution.won, true);
  assert.equal(resolution.probability, 2 / 36);
});

test('dice exact bet loses on non-matching total', () => {
  const resolution = resolveWager('dice', { die1: 1, die2: 1 }, { type: 'exact', value: 7 });
  assert.equal(resolution.won, false);
});

test('dice exact bet rejects out-of-range totals', () => {
  assert.throws(() => resolveWager('dice', { die1: 1, die2: 1 }, { type: 'exact', value: 1 }));
  assert.throws(() => resolveWager('dice', { die1: 1, die2: 1 }, { type: 'exact', value: 13 }));
});

test('dice resolution rejects invalid bet type', () => {
  assert.throws(() => resolveWager('dice', { die1: 1, die2: 1 }, { type: 'color', value: 'red' }));
});

// --- Wheel resolution edge cases ---

test('wheel color black wins on black pocket', () => {
  const resolution = resolveWager('wheel', { pocket: 2 }, { type: 'color', value: 'black' });
  assert.equal(resolution.won, true);
});

test('wheel color loses on green (0)', () => {
  const red = resolveWager('wheel', { pocket: 0 }, { type: 'color', value: 'red' });
  const black = resolveWager('wheel', { pocket: 0 }, { type: 'color', value: 'black' });
  assert.equal(red.won, false);
  assert.equal(black.won, false);
});

test('wheel half low wins on pocket 1-18', () => {
  const resolution = resolveWager('wheel', { pocket: 18 }, { type: 'half', value: 'low' });
  assert.equal(resolution.won, true);
});

test('wheel half high wins on pocket 19-36', () => {
  const resolution = resolveWager('wheel', { pocket: 19 }, { type: 'half', value: 'high' });
  assert.equal(resolution.won, true);
});

test('wheel half low loses on 0', () => {
  const resolution = resolveWager('wheel', { pocket: 0 }, { type: 'half', value: 'low' });
  assert.equal(resolution.won, false);
});

test('wheel exact number loses on wrong pocket', () => {
  const resolution = resolveWager('wheel', { pocket: 10 }, { type: 'exact', value: 5 });
  assert.equal(resolution.won, false);
});

test('wheel rejects invalid bet type', () => {
  assert.throws(() => resolveWager('wheel', { pocket: 5 }, { type: 'parity', value: 'odd' }));
});

test('wheel rejects invalid color value', () => {
  assert.throws(() => resolveWager('wheel', { pocket: 5 }, { type: 'color', value: 'green' }));
});

test('wheel rejects invalid half value', () => {
  assert.throws(() => resolveWager('wheel', { pocket: 5 }, { type: 'half', value: 'mid' }));
});

test('wheel exact rejects out-of-range number', () => {
  assert.throws(() => resolveWager('wheel', { pocket: 5 }, { type: 'exact', value: 37 }));
  assert.throws(() => resolveWager('wheel', { pocket: 5 }, { type: 'exact', value: -1 }));
});

// --- Slots resolution ---

test('slots resolution rejects invalid profile', () => {
  assert.throws(() => resolveWager('slots', { roll: 100 }, { profile: 'mega' }));
});

test('slots steady profile always returns symbols array', () => {
  const resolution = resolveWager('slots', { roll: 0 }, { profile: 'steady' });
  assert.ok(Array.isArray(resolution.symbols));
  assert.equal(resolution.symbols.length, 3);
});

test('slots resolution includes tier field', () => {
  const resolution = resolveWager('slots', { roll: 0 }, { profile: 'steady' });
  assert.ok(['miss', 'pair', 'triple', 'bonus'].includes(resolution.tier));
});

// --- resolveWager unknown table ---

test('resolveWager rejects unknown table', () => {
  assert.throws(() => resolveWager('poker', { pocket: 5 }, {}), /Unknown table/);
});

// --- applyWager edge cases ---

test('applyWager rejects zero stake', () => {
  assert.throws(() => applyWager(1000, 0, { won: true, multiplier: 2 }), /whole number/);
});

test('applyWager rejects negative stake', () => {
  assert.throws(() => applyWager(1000, -10, { won: true, multiplier: 2 }), /whole number/);
});

test('applyWager rejects non-integer stake', () => {
  assert.throws(() => applyWager(1000, 10.5, { won: true, multiplier: 2 }), /whole number/);
});

test('applyWager returns zero bankroll on loss of entire bankroll', () => {
  const result = applyWager(100, 100, { won: false, multiplier: 2 });
  assert.equal(result.bankroll, 0);
  assert.equal(result.netChange, -100);
  assert.equal(result.returned, 0);
});

test('applyWager floors returned amount', () => {
  const result = applyWager(1000, 100, { won: true, multiplier: 1.5 });
  assert.equal(result.returned, 150);
  assert.equal(result.bankroll, 1050);
});

test('applyWager accepts stake equal to bankroll', () => {
  const result = applyWager(500, 500, { won: true, multiplier: 2 });
  assert.equal(result.bankroll, 1000);
  assert.equal(result.returned, 1000);
});

// --- Risk labels ---

test('high probability bets are labeled Common', () => {
  const resolution = resolveWager('wheel', { pocket: 1 }, { type: 'color', value: 'red' });
  assert.equal(resolution.risk, 'Common');
});

test('medium probability bets are labeled Risky', () => {
  const resolution = resolveWager('dice', { die1: 3, die2: 4 }, { type: 'range', value: 'seven' });
  assert.equal(resolution.risk, 'Risky');
});

test('low probability bets are labeled Long Shot', () => {
  const resolution = resolveWager('wheel', { pocket: 7 }, { type: 'exact', value: 7 });
  assert.equal(resolution.risk, 'Long Shot');
});

// --- Achievement scenarios ---

test('golden_run requires 5 consecutive wins', () => {
  const wagers = Array.from({ length: 5 }, (_, i) => ({
    table_key: 'wheel',
    event_json: JSON.stringify({ pocket: 1 }),
    won: 1,
    probability: 0.5,
    bankroll_after: 1000 + (i + 1) * 50,
    net_change: 50,
  }));
  const keys = achievementKeys(wagers, 1250, false);
  assert.ok(keys.includes('golden_run'));
});

test('golden_run not awarded with only 4 consecutive wins', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: 1050, net_change: 50 },
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: 1100, net_change: 50 },
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: 1150, net_change: 50 },
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: 1200, net_change: 50 },
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 0, probability: 0.5, bankroll_after: 1100, net_change: -100 },
  ];
  const keys = achievementKeys(wagers, 1100, false);
  assert.ok(!keys.includes('golden_run'));
});

test('phoenix: recovered above 1000 after falling below 50', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 0, probability: 0.5, bankroll_after: 30, net_change: -970 },
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: 1100, net_change: 1070 },
  ];
  const keys = achievementKeys(wagers, 1100, false);
  assert.ok(keys.includes('phoenix'));
});

test('phoenix not awarded if never fell below 50', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 0, probability: 0.5, bankroll_after: 100, net_change: -900 },
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: 1200, net_change: 1100 },
  ];
  const keys = achievementKeys(wagers, 1200, false);
  assert.ok(!keys.includes('phoenix'));
});

test('exact_change awarded when finished with starting bankroll', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: STARTING_BANKROLL, net_change: 0 },
  ];
  const keys = achievementKeys(wagers, STARTING_BANKROLL, true);
  assert.ok(keys.includes('exact_change'));
});

test('exact_change not awarded when not finished', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.5, bankroll_after: STARTING_BANKROLL, net_change: 0 },
  ];
  const keys = achievementKeys(wagers, STARTING_BANKROLL, false);
  assert.ok(!keys.includes('exact_change'));
});

test('last_minute_miracle awarded on move 12 best win', () => {
  const wagers = Array.from({ length: MAX_MOVES }, (_, i) => ({
    table_key: 'wheel',
    event_json: JSON.stringify({ pocket: 1 }),
    won: i === MAX_MOVES - 1 ? 1 : 0,
    probability: 0.5,
    bankroll_after: i === MAX_MOVES - 1 ? 1500 : 1000 - (i + 1) * 50,
    net_change: i === MAX_MOVES - 1 ? 500 : -50,
  }));
  const keys = achievementKeys(wagers, 1500, true);
  assert.ok(keys.includes('last_minute_miracle'));
});

test('last_minute_miracle not awarded when an earlier win is larger', () => {
  const wagers = Array.from({ length: MAX_MOVES }, (_, i) => ({
    table_key: 'wheel',
    event_json: JSON.stringify({ pocket: 1 }),
    won: 1,
    probability: 0.5,
    bankroll_after: 1000 + (i + 1) * 50,
    net_change: i === 0 ? 600 : 50,
  }));
  const keys = achievementKeys(wagers, 1600, true);
  assert.ok(!keys.includes('last_minute_miracle'));
});

test('against_all_odds not awarded with probability > 0.05', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.06, bankroll_after: 1050, net_change: 50 },
  ];
  const keys = achievementKeys(wagers, 1050, false);
  assert.ok(!keys.includes('against_all_odds'));
});

test('against_all_odds awarded with probability exactly 0.05', () => {
  const wagers = [
    { table_key: 'wheel', event_json: JSON.stringify({ pocket: 1 }), won: 1, probability: 0.05, bankroll_after: 1050, net_change: 50 },
  ];
  const keys = achievementKeys(wagers, 1050, false);
  assert.ok(keys.includes('against_all_odds'));
});

test('snake_eyes requires dice total of 2', () => {
  const noSnake = [
    { table_key: 'dice', event_json: JSON.stringify({ die1: 1, die2: 2 }), won: 1, probability: 0.1, bankroll_after: 1050, net_change: 50 },
  ];
  assert.ok(!achievementKeys(noSnake, 1050, false).includes('snake_eyes'));

  const snake = [
    { table_key: 'dice', event_json: JSON.stringify({ die1: 1, die2: 1 }), won: 0, probability: 0.1, bankroll_after: 950, net_change: -50 },
  ];
  assert.ok(achievementKeys(snake, 950, false).includes('snake_eyes'));
});

test('no achievements on empty wager list', () => {
  const keys = achievementKeys([], 1000, false);
  assert.equal(keys.length, 0);
});

// --- gameRules structure ---

test('gameRules returns expected structure', () => {
  const rules = gameRules();
  assert.equal(rules.version, 2);
  assert.equal(rules.rtp, RTP);
  assert.equal(rules.maxMoves, MAX_MOVES);
  assert.equal(rules.startingBankroll, STARTING_BANKROLL);
  assert.ok(rules.games.wheel.outsideBets.length === 4);
  assert.ok(rules.games.wheel.exactBets.length === 37);
  assert.ok(rules.games.cards.bets.length > 0);
  assert.ok(rules.games.dice.rangeBets.length === 3);
  assert.ok(rules.games.dice.exactBets.length === 11);
  assert.ok(rules.games.slots.profiles.length === 3);
});

test('gameRules card bets include both over and under', () => {
  const rules = gameRules();
  const overBets = rules.games.cards.bets.filter((b) => b.bet.direction === 'over');
  const underBets = rules.games.cards.bets.filter((b) => b.bet.direction === 'under');
  assert.ok(overBets.length > 0);
  assert.ok(underBets.length > 0);
});

test('gameRules slots profiles include win probability and max multiplier', () => {
  const rules = gameRules();
  for (const profile of rules.games.slots.profiles) {
    assert.ok(profile.winProbability > 0 && profile.winProbability < 1);
    assert.ok(profile.maxMultiplier > 0);
    assert.ok(profile.risk);
  }
});

// --- TABLES constant ---

test('TABLES contains all four game types', () => {
  assert.deepEqual(TABLES, ['wheel', 'cards', 'dice', 'slots']);
});
