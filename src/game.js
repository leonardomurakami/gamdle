const PLAYS_PER_GAME = 3;
const GAMES_PER_SESSION = 4;

const GAME_POOL = [
  { id: 'guess-score', name: 'Guess Score', description: 'Predict a target score. Closer guesses win more points.', maxPoints: 100 },
  { id: 'combo-chain', name: 'Combo Chain', description: 'Build the longest combo from a randomized prompt.', maxPoints: 120 },
  { id: 'speed-pick', name: 'Speed Pick', description: 'Choose quickly and earn a seed-based speed bonus.', maxPoints: 90 },
  { id: 'memory-lane', name: 'Memory Lane', description: 'Recall the hidden sequence from your personal round.', maxPoints: 110 },
  { id: 'risk-roll', name: 'Risk Roll', description: 'Push your luck with a volatile score roll.', maxPoints: 130 },
  { id: 'perfect-fit', name: 'Perfect Fit', description: 'Match the best item to the generated category.', maxPoints: 95 },
  { id: 'mystery-card', name: 'Mystery Card', description: 'Reveal a card and bank its secret value.', maxPoints: 105 },
  { id: 'final-boss', name: 'Final Boss', description: 'Face a high-value finale with a difficult scoring curve.', maxPoints: 150 },
];

const state = {
  seed: '',
  games: [],
  plays: new Map(),
  scores: new Map(),
};

const playerInput = document.querySelector('#player-name');
const startButton = document.querySelector('#start-game');
const seedOutput = document.querySelector('#seed-output');
const totalScoreOutput = document.querySelector('#total-score');
const gamesLeftOutput = document.querySelector('#games-left');
const gamesContainer = document.querySelector('#games');
const template = document.querySelector('#game-card-template');

startButton.addEventListener('click', startSession);
playerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') startSession();
});

function startSession() {
  const player = playerInput.value.trim() || crypto.randomUUID();
  state.seed = createUserSeed(player, new Date());
  const random = mulberry32(hashString(state.seed));
  state.games = shuffle(GAME_POOL, random).slice(0, GAMES_PER_SESSION);
  state.plays = new Map(state.games.map((game) => [game.id, PLAYS_PER_GAME]));
  state.scores = new Map(state.games.map((game) => [game.id, 0]));

  seedOutput.textContent = state.seed;
  renderGames();
  updateSummary();
}

function createUserSeed(player, date) {
  const day = date.toISOString().slice(0, 10);
  return `${normalizeSeedPart(player)}-${day}`;
}

function normalizeSeedPart(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
}

function renderGames() {
  gamesContainer.replaceChildren();

  state.games.forEach((game, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector('.game-number').textContent = index + 1;
    card.querySelector('h2').textContent = game.name;
    card.querySelector('.description').textContent = game.description;
    card.querySelector('.play-button').addEventListener('click', () => playGame(game.id));
    gamesContainer.append(card);
  });

  refreshCards();
}

function playGame(gameId) {
  const remaining = state.plays.get(gameId) ?? 0;
  if (remaining <= 0) return;

  const game = state.games.find((candidate) => candidate.id === gameId);
  const attempt = PLAYS_PER_GAME - remaining + 1;
  const random = mulberry32(hashString(`${state.seed}:${gameId}:${attempt}`));
  const score = Math.ceil(random() * game.maxPoints);
  const bestScore = Math.max(state.scores.get(gameId) ?? 0, score);

  state.plays.set(gameId, remaining - 1);
  state.scores.set(gameId, bestScore);
  refreshCards();
  updateSummary();
}

function refreshCards() {
  [...gamesContainer.children].forEach((card, index) => {
    const game = state.games[index];
    const remaining = state.plays.get(game.id) ?? 0;
    card.querySelector('.plays-left').textContent = `${remaining} play${remaining === 1 ? '' : 's'} left`;
    card.querySelector('.best-score').textContent = `Best: ${state.scores.get(game.id) ?? 0}`;
    card.querySelector('.play-button').disabled = remaining === 0;
  });
}

function updateSummary() {
  const totalScore = [...state.scores.values()].reduce((total, score) => total + score, 0);
  const gamesWithPlays = [...state.plays.values()].filter((remaining) => remaining > 0).length;
  totalScoreOutput.textContent = totalScore;
  gamesLeftOutput.textContent = gamesWithPlays;
}

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return () => {
    seed += 0x6d2b79f5;
    let result = seed;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
