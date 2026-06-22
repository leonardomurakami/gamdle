import crypto from 'node:crypto';
import { RED_NUMBERS } from './roulette-colors.js';

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

export const RULES_VERSION = 2;
export const STARTING_BANKROLL = 1000;
export const MAX_MOVES = 12;
export const RTP = 0.96;
export const HOUSE_EDGE = 0.04;
export const TABLES = ['wheel', 'cards', 'dice', 'slots'];

const RANK_NAMES = {
  1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King',
};

export const SLOT_PROFILES = {
  steady: {
    name: 'Steady',
    outcomes: [
      { key: 'miss', probability: 0.28, multiplier: 0, symbols: ['lemon', 'seven', 'gem'] },
      { key: 'pair', probability: 0.50, multiplier: 1.2, symbols: ['cherry', 'cherry', 'lemon'] },
      { key: 'triple', probability: 0.20, multiplier: 1.5, symbols: ['lemon', 'lemon', 'lemon'] },
      { key: 'bonus', probability: 0.02, multiplier: 3, symbols: ['gem', 'gem', 'gem'] },
    ],
  },
  swing: {
    name: 'Swing',
    outcomes: [
      { key: 'miss', probability: 0.66, multiplier: 0, symbols: ['cherry', 'gem', 'seven'] },
      { key: 'pair', probability: 0.25, multiplier: 2, symbols: ['lemon', 'lemon', 'cherry'] },
      { key: 'triple', probability: 0.08, multiplier: 4, symbols: ['cherry', 'cherry', 'cherry'] },
      { key: 'bonus', probability: 0.01, multiplier: 14, symbols: ['seven', 'seven', 'seven'] },
    ],
  },
  jackpot: {
    name: 'Jackpot',
    outcomes: [
      { key: 'miss', probability: 0.885, multiplier: 0, symbols: ['lemon', 'cherry', 'gem'] },
      { key: 'pair', probability: 0.07, multiplier: 2, symbols: ['cherry', 'cherry', 'seven'] },
      { key: 'triple', probability: 0.04, multiplier: 8, symbols: ['gem', 'gem', 'gem'] },
      { key: 'bonus', probability: 0.005, multiplier: 100, symbols: ['seven', 'seven', 'seven'] },
    ],
  },
};

export const ACHIEVEMENTS = {
  snake_eyes: { name: 'Snake Eyes', description: 'The dice landed on a total of 2.' },
  against_all_odds: { name: 'Against All Odds', description: 'Won a wager with odds of 5% or less.' },
  phoenix: { name: 'Phoenix', description: 'Recovered above 1,000 after falling below 50.' },
  exact_change: { name: 'Exact Change', description: 'Finished with exactly 1,000 points.' },
  golden_run: { name: 'Golden Run', description: 'Won five wagers in a row.' },
  last_minute_miracle: { name: 'Last-Minute Miracle', description: 'The largest win arrived on move 12.' },
};

function deterministicBytes(secret, date, move, table) {
  return crypto.createHmac('sha256', secret)
    .update(`${date}|${move}|${table}`)
    .digest();
}

export function eventFor(secret, date, move, table) {
  if (!TABLES.includes(table) || move < 1 || move > MAX_MOVES) {
    throw new GameError('Invalid table or move.');
  }
  const bytes = deterministicBytes(secret, date, move, table);
  const primary = bytes.readUInt32BE(0);
  if (table === 'wheel') return { pocket: primary % 37 };
  if (table === 'cards') {
    return {
      rank: (primary % 13) + 1,
      suit: ['hearts', 'diamonds', 'clubs', 'spades'][bytes[4] % 4],
    };
  }
  if (table === 'dice') {
    return { die1: (primary % 6) + 1, die2: (bytes.readUInt32BE(4) % 6) + 1 };
  }
  return { roll: primary % 2000 };
}

function riskLabel(probability) {
  if (probability >= 0.4) return 'Common';
  if (probability >= 0.12) return 'Risky';
  return 'Long Shot';
}

function binaryResolution(won, probability, label) {
  const multiplier = RTP / probability;
  return { won, probability, multiplier, label, risk: riskLabel(probability) };
}

function wheelResolution(event, bet) {
  const color = event.pocket === 0 ? 'green' : RED_NUMBERS.has(event.pocket) ? 'red' : 'black';
  if (bet.type === 'color' && ['red', 'black'].includes(bet.value)) {
    return binaryResolution(color === bet.value, 18 / 37, `Pocket ${event.pocket}, ${color}`);
  }
  if (bet.type === 'half' && ['low', 'high'].includes(bet.value)) {
    const won = bet.value === 'low'
      ? event.pocket >= 1 && event.pocket <= 18
      : event.pocket >= 19;
    return binaryResolution(won, 18 / 37, `Pocket ${event.pocket}, ${color}`);
  }
  const number = Number(bet.value);
  if (bet.type === 'exact' && Number.isInteger(number) && number >= 0 && number <= 36) {
    return binaryResolution(event.pocket === number, 1 / 37, `Pocket ${event.pocket}, ${color}`);
  }
  throw new GameError('Invalid roulette wager.');
}

function cardResolution(event, bet) {
  const threshold = Number(bet.threshold);
  const cardName = `${RANK_NAMES[event.rank] || event.rank} of ${event.suit}`;
  if (!Number.isInteger(threshold)) throw new GameError('Choose a card threshold.');
  if (bet.direction === 'over' && threshold >= 1 && threshold <= 12) {
    return binaryResolution(event.rank > threshold, (13 - threshold) / 13, cardName);
  }
  if (bet.direction === 'under' && threshold >= 2 && threshold <= 13) {
    return binaryResolution(event.rank < threshold, (threshold - 1) / 13, cardName);
  }
  throw new GameError('Invalid High Card wager.');
}

function diceResolution(event, bet) {
  const total = event.die1 + event.die2;
  const label = `${event.die1} + ${event.die2} = ${total}`;
  if (bet.type === 'range' && ['low', 'seven', 'high'].includes(bet.value)) {
    const probability = bet.value === 'seven' ? 6 / 36 : 15 / 36;
    const won = bet.value === 'low' ? total <= 6 : bet.value === 'high' ? total >= 8 : total === 7;
    return binaryResolution(won, probability, label);
  }
  const target = Number(bet.value);
  if (bet.type === 'exact' && Number.isInteger(target) && target >= 2 && target <= 12) {
    const ways = 6 - Math.abs(7 - target);
    return binaryResolution(total === target, ways / 36, label);
  }
  throw new GameError('Invalid Dice Pool wager.');
}

function slotOutcome(profile, roll) {
  let cursor = 0;
  const normalized = roll / 2000;
  for (const outcome of profile.outcomes) {
    cursor += outcome.probability;
    if (normalized < cursor) return outcome;
  }
  return profile.outcomes.at(-1);
}

function slotsResolution(event, bet) {
  const profile = SLOT_PROFILES[bet.profile];
  if (!profile) throw new GameError('Invalid slot volatility.');
  const outcome = slotOutcome(profile, event.roll);
  return {
    won: outcome.multiplier > 0,
    probability: outcome.probability,
    multiplier: outcome.multiplier,
    label: outcome.multiplier > 0 ? `${profile.name} paid ${outcome.multiplier}×` : `${profile.name} missed`,
    risk: riskLabel(outcome.probability),
    symbols: outcome.symbols,
    tier: outcome.key,
  };
}

export function resolveWager(table, event, bet) {
  if (table === 'wheel') return wheelResolution(event, bet);
  if (table === 'cards') return cardResolution(event, bet);
  if (table === 'dice') return diceResolution(event, bet);
  if (table === 'slots') return slotsResolution(event, bet);
  throw new GameError('Unknown table.');
}

export function applyWager(bankroll, stake, resolution) {
  if (!Number.isInteger(stake) || stake < 1 || stake > bankroll) {
    throw new GameError('Stake must be a whole number within your bankroll.');
  }
  const returned = resolution.won ? Math.floor(stake * resolution.multiplier) : 0;
  const nextBankroll = bankroll - stake + returned;
  return { bankroll: nextBankroll, netChange: nextBankroll - bankroll, returned };
}

function binaryBet(key, label, probability, bet) {
  return {
    key,
    label,
    probability,
    multiplier: RTP / probability,
    risk: riskLabel(probability),
    bet,
  };
}

export function gameRules() {
  const exactWheel = Array.from({ length: 37 }, (_, value) => binaryBet(
    `wheel-exact-${value}`, String(value), 1 / 37, { type: 'exact', value },
  ));
  const exactDice = Array.from({ length: 11 }, (_, index) => {
    const value = index + 2;
    const probability = (6 - Math.abs(7 - value)) / 36;
    return binaryBet(`dice-${value}`, String(value), probability, { type: 'exact', value });
  });
  const cardThresholds = Array.from({ length: 12 }, (_, index) => index + 1);

  return {
    version: RULES_VERSION,
    rtp: RTP,
    houseEdge: HOUSE_EDGE,
    maxMoves: MAX_MOVES,
    startingBankroll: STARTING_BANKROLL,
    games: {
      wheel: {
        name: 'Roulette',
        outsideBets: [
          binaryBet('wheel-red', 'Red', 18 / 37, { type: 'color', value: 'red' }),
          binaryBet('wheel-black', 'Black', 18 / 37, { type: 'color', value: 'black' }),
          binaryBet('wheel-low', '1–18', 18 / 37, { type: 'half', value: 'low' }),
          binaryBet('wheel-high', '19–36', 18 / 37, { type: 'half', value: 'high' }),
        ],
        exactBets: exactWheel,
      },
      cards: {
        name: 'High Card',
        thresholds: cardThresholds,
        bets: cardThresholds.flatMap((threshold) => {
          const bets = [];
          if (threshold <= 12) {
            bets.push(binaryBet(
              `cards-over-${threshold}`,
              `Over ${threshold}`,
              (13 - threshold) / 13,
              { direction: 'over', threshold },
            ));
          }
          if (threshold >= 2) {
            bets.push(binaryBet(
              `cards-under-${threshold}`,
              `Under ${threshold}`,
              (threshold - 1) / 13,
              { direction: 'under', threshold },
            ));
          }
          return bets;
        }),
      },
      dice: {
        name: 'Dice Pool',
        rangeBets: [
          binaryBet('dice-low', 'Low 2–6', 15 / 36, { type: 'range', value: 'low' }),
          binaryBet('dice-seven', 'Exactly 7', 6 / 36, { type: 'range', value: 'seven' }),
          binaryBet('dice-high', 'High 8–12', 15 / 36, { type: 'range', value: 'high' }),
        ],
        exactBets: exactDice,
      },
      slots: {
        name: 'Lucky Slots',
        profiles: Object.entries(SLOT_PROFILES).map(([key, profile]) => ({
          key,
          name: profile.name,
          outcomes: profile.outcomes,
          winProbability: profile.outcomes.filter((outcome) => outcome.multiplier > 0)
            .reduce((sum, outcome) => sum + outcome.probability, 0),
          maxMultiplier: Math.max(...profile.outcomes.map((outcome) => outcome.multiplier)),
          risk: riskLabel(profile.outcomes.filter((outcome) => outcome.multiplier > 0)
            .reduce((sum, outcome) => sum + outcome.probability, 0)),
        })),
      },
    },
  };
}

export function achievementKeys(wagers, bankroll, finished) {
  const keys = new Set();
  if (wagers.some((w) => w.table_key === 'dice' && JSON.parse(w.event_json).die1 + JSON.parse(w.event_json).die2 === 2)) {
    keys.add('snake_eyes');
  }
  if (wagers.some((w) => w.won && w.probability <= 0.05)) keys.add('against_all_odds');

  let streak = 0;
  let fellLow = false;
  for (const wager of wagers) {
    streak = wager.won ? streak + 1 : 0;
    if (streak >= 5) keys.add('golden_run');
    if (wager.bankroll_after < 50) fellLow = true;
    if (fellLow && wager.bankroll_after > STARTING_BANKROLL) keys.add('phoenix');
  }

  if (finished && bankroll === STARTING_BANKROLL) keys.add('exact_change');
  if (finished && wagers.length === MAX_MOVES) {
    const best = Math.max(...wagers.map((w) => w.net_change));
    const last = wagers.at(-1);
    if (last.won && last.net_change > 0 && last.net_change === best) keys.add('last_minute_miracle');
  }
  return [...keys];
}

export function utcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
