export const EUROPEAN_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const SLOT_SYMBOL_ORDER = ['cherry', 'lemon', 'gem', 'seven'];
export const SLOT_SYMBOL_GLYPHS = {
  cherry: '●',
  lemon: '◆',
  gem: '✦',
  seven: '7',
};

const WHEEL_STEP = 360 / EUROPEAN_WHEEL_ORDER.length;

export function roulettePocketIndex(pocket) {
  return EUROPEAN_WHEEL_ORDER.indexOf(Number(pocket));
}

export function roulettePocketCenter(pocket) {
  const index = roulettePocketIndex(pocket);
  if (index < 0) throw new Error(`Unknown roulette pocket: ${pocket}`);
  return -90 + (index + 0.5) * WHEEL_STEP;
}

export function rouletteLanding(pocket, wheelTurns = 4, ballTurns = 5) {
  const center = roulettePocketCenter(pocket);
  const wheelRotation = wheelTurns * 360 - 90 - center;
  const ballRotation = -ballTurns * 360;
  return {
    pocket: Number(pocket),
    pocketIndex: roulettePocketIndex(pocket),
    pocketCenter: center,
    wheelRotation,
    ballRotation,
    relativePocketAngle: normalizeAngle(center + wheelRotation),
    relativeBallAngle: normalizeAngle(-90 + ballRotation),
  };
}

export function rouletteBallTrajectory(pocket) {
  const landing = rouletteLanding(pocket, 4, 7);

  return {
    landing,
    duration: 2.35,
    times: [0, 0.12, 0.24, 0.36, 0.48, 0.58, 0.66, 0.72, 0.78, 0.83, 0.88, 0.93, 0.97, 0.99, 1],
    radius: [0, 0.8, 2.2, 4.5, 7.5, 11, 14, 17, 20, 23, 26, 28.5, 30, 31.5, 31],
    orbit: [
      0,
      landing.ballRotation * 0.17,
      landing.ballRotation * 0.34,
      landing.ballRotation * 0.5,
      landing.ballRotation * 0.64,
      landing.ballRotation * 0.74,
      landing.ballRotation * 0.82,
      landing.ballRotation * 0.87,
      landing.ballRotation * 0.91,
      landing.ballRotation * 0.94,
      landing.ballRotation * 0.965,
      landing.ballRotation * 0.983,
      landing.ballRotation * 0.995,
      landing.ballRotation * 0.999,
      landing.ballRotation,
    ],
    deflection: [0, 0, 0, 0, 0, 0.5, -0.8, 1.4, -1.8, 2.3, -1.7, 1.1, -0.5, -0.2, 0],
    lift: [1, 1, 1, 1, 1, 1.01, 1, 1.025, 0.99, 1.045, 0.985, 1.025, 0.995, 0.998, 1],
  };
}

export function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

export function slotLanding(symbol, cycles = 4) {
  const symbolIndex = SLOT_SYMBOL_ORDER.indexOf(symbol);
  if (symbolIndex < 0) throw new Error(`Unknown slot symbol: ${symbol}`);
  return {
    symbol,
    symbolIndex,
    itemIndex: cycles * SLOT_SYMBOL_ORDER.length + symbolIndex,
  };
}
