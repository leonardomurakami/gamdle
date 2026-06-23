import { animate } from 'motion';
import { createGameAnimations } from './animations.js';
import { RED_NUMBERS, SLOT_SYMBOL_GLYPHS } from './game-geometry.js';
import { createSound } from './sound.js';

const ANON_STATE_KEY = 'gamdle-anonymous-run';
const FIRST_PLAY_KEY = 'gamdle-first-play-seen';
const SLOT_TIERS = ['silver', 'gold', 'diamond'];
const PLAYS_PER_GAME = 3;
const GAMES_PER_RUN = 4;

const storage = {
  get(key) {
    try { return window.localStorage?.getItem(key) || null; } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage?.setItem(key, value); } catch { /* Memory state still works. */ }
  },
  remove(key) {
    try { window.localStorage?.removeItem(key); } catch { /* Memory state still works. */ }
  },
  getJson(key) {
    try { return JSON.parse(storage.get(key)); } catch { return null; }
  },
  setJson(key, value) {
    storage.set(key, JSON.stringify(value));
  },
};

const state = {
  user: null,
  mode: null,
  run: null,
  rules: null,
  table: 'wheel',
  selection: null,
  phase: 'idle',
  lastWager: null,
  soundEnabled: storage.get('gamdle-sound') !== 'off',
  developmentSession: storage.get('gamdle-dev-session'),
};

const tableNames = {
  wheel: 'Roulette',
  cards: 'High Card',
  dice: 'Dice Pool',
  slots: 'Lucky Slots',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

const tableIcons = {
  wheel: '\u25c9',
  cards: 'A\u2660',
  dice: '\u2684',
  slots: '7',
};

const ROULETTE_TABLE_POSITIONS = new Map([
  [0, { rowClass: 'roulette-zero-cell', columnClass: 'roulette-col-1' }],
  ...Array.from({ length: 36 }, (_, index) => {
    const value = index + 1;
    return [value, {
      rowClass: `roulette-row-${3 - ((value - 1) % 3)}`,
      columnClass: `roulette-col-${Math.ceil(value / 3) + 1}`,
    }];
  }),
]);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const format = (number) => new Intl.NumberFormat('en-US').format(number);
const percent = (value) => {
  const scaled = value * 100;
  return `${scaled.toFixed(Number.isInteger(scaled) ? 0 : 1)}%`;
};
const multiplier = (value) => `${value.toFixed(value < 10 ? 2 : 1)}\u00d7`;
const signedFormat = (value) => `${value >= 0 ? '+' : ''}${format(value)}`;
const changeClass = (value) => value >= 0 ? 'positive' : 'negative';
const pluralize = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const ordinal = (number) => {
  const suffix = number % 10 === 1 && number % 100 !== 11 ? 'st'
    : number % 10 === 2 && number % 100 !== 12 ? 'nd'
      : number % 10 === 3 && number % 100 !== 13 ? 'rd' : 'th';
  return `${number}${suffix}`;
};

const sound = createSound(() => state.soundEnabled);
let gameAnimations = null;

function currentGameIndex() {
  return Math.min(Math.floor(state.run.move / PLAYS_PER_GAME), GAMES_PER_RUN - 1);
}

function currentPlayIndex() {
  return state.run.move % PLAYS_PER_GAME;
}

function activeTable() {
  const gameOrder = state.run.gameOrder || [];
  return gameOrder[currentGameIndex()] || 'wheel';
}

function slotTierForPlay(playIndex) {
  return SLOT_TIERS[Math.min(playIndex, SLOT_TIERS.length - 1)];
}

async function api(path, options = {}) {
  const developmentSession = state.developmentSession;
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(developmentSession ? { Authorization: `Bearer ${developmentSession}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function queryMessages() {
  if (location.hash.startsWith('#dev_session=')) {
    state.developmentSession = decodeURIComponent(location.hash.slice('#dev_session='.length));
    storage.set('gamdle-dev-session', state.developmentSession);
    history.replaceState({}, '', '/');
  }
  const params = new URLSearchParams(location.search);
  const messages = {
    invalid: 'That link is invalid, expired, or has already been used.',
    deleted: 'Your account and game history have been deleted.',
  };
  const key = params.get('auth') || params.get('account');
  if (messages[key]) showToast(messages[key]);
  if (key) history.replaceState({}, '', '/');
}

function setPhase(phase) {
  state.phase = phase;
  const locked = phase === 'committing' || phase === 'animating';
  $('#play-button').disabled = locked || state.run?.status !== 'active';
  $('#play-button').textContent = phase === 'committing' ? 'Locking wager\u2026'
    : phase === 'animating' ? 'Revealing\u2026' : 'Place wager';
  $('#stake').disabled = locked;
  $$('.choice-button, [data-percent]').forEach((button) => { button.disabled = locked; });
  $('#repeat-button').disabled = locked || state.run?.status !== 'active';
}

function defaultSelection(table) {
  const rules = state.rules.games[table];
  if (table === 'wheel') return rules.outsideBets[0];
  if (table === 'cards') return rules.bets.find((bet) => bet.key === 'cards-over-7');
  if (table === 'dice') return rules.rangeBets[0];
  return null;
}

function setSelection(selection) {
  if (!selection) return;
  state.selection = selection;
  $$('.choice-button').forEach((button) => {
    const selected = Boolean(button.dataset.key === selection.key
      || (button.dataset.cardDirection && button.dataset.cardDirection === selection.bet?.direction)
      || (button.dataset.threshold && Number(button.dataset.threshold) === selection.bet?.threshold));
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderBetSlip();
}

function renderBetSlip() {
  const table = activeTable();
  if (table === 'slots') {
    const tier = slotTierForPlay(currentPlayIndex());
    const tierData = state.rules.games.slots.tiers.find((t) => t.key === tier);
    if (!tierData) return;
    $('#bet-slip-title').textContent = `${tierData.name} Machine`;
    $('#risk-label').textContent = tierData.risk;
    $('#chance').textContent = percent(tierData.winProbability);
    $('#returns').textContent = `Up to ${multiplier(tierData.maxMultiplier)}`;
    const stake = Math.max(0, Number($('#stake').value || 0));
    const gross = Math.floor(stake * tierData.maxMultiplier);
    $('#potential-return').textContent = `Up to ${format(gross)} points`;
    return;
  }
  if (!state.selection) return;
  const selection = state.selection;
  $('#bet-slip-title').textContent = selection.label;
  $('#risk-label').textContent = selection.risk;
  $('#chance').textContent = percent(selection.probability);
  $('#returns').textContent = selection.variableReturn ? `Up to ${multiplier(selection.multiplier)}` : multiplier(selection.multiplier);
  const stake = Math.max(0, Number($('#stake').value || 0));
  const gross = Math.floor(stake * selection.multiplier);
  $('#potential-return').textContent = selection.variableReturn ? `Up to ${format(gross)} points` : `${format(gross)} points`;
}

function wheelButton(bet) {
  const value = Number(bet.bet.value);
  const position = ROULETTE_TABLE_POSITIONS.get(value);
  const colorClass = value === 0 ? 'zero-choice' : RED_NUMBERS.has(value) ? 'red-choice' : 'black-choice';
  return `<button class="choice-button roulette-number ${colorClass} ${position.rowClass} ${position.columnClass}" data-key="${bet.key}" type="button" aria-pressed="false"><span>${bet.label}</span></button>`;
}

function renderWheelControls() {
  const rules = state.rules.games.wheel;
  $('#bet-surface-title').textContent = 'Roulette board';
  $('#surface-help').textContent = 'Select one outside bet or exact pocket.';
  $('#bet-controls').innerHTML = `
    <div class="roulette-board" aria-label="European roulette betting table">
      <div class="roulette-number-grid">
        ${rules.exactBets.map(wheelButton).join('')}
      </div>
      <div class="roulette-outside-grid">
        ${rules.outsideBets.map((bet) => `<button class="choice-button roulette-outside" data-key="${bet.key}" type="button" aria-pressed="false"><span>${bet.label}</span></button>`).join('')}
      </div>
    </div>
    <span class="bet-group-label roulette-odds">Exact pocket pays ${multiplier(rules.exactBets[0].multiplier)} gross.</span>`;
}

function renderCardControls() {
  const rules = state.rules.games.cards;
  const current = state.selection?.bet?.threshold || 7;
  $('#bet-surface-title').textContent = 'Card threshold';
  $('#surface-help').textContent = 'Ace is 1. King is 13.';
  $('#bet-controls').innerHTML = `
    <div class="bet-group">
      <span class="bet-group-label">Threshold</span>
      <div class="choice-grid thresholds">
        ${rules.thresholds.map((value) => `<button class="choice-button ${value === current ? 'selected' : ''}" data-threshold="${value}" type="button">${value}</button>`).join('')}
      </div>
    </div>
    <div class="bet-group card-direction">
      <button class="choice-button ${state.selection?.bet?.direction === 'under' ? 'selected' : ''}" data-card-direction="under" type="button">Under <span class="threshold-word">${current}</span></button>
      <strong class="threshold-display">${current}</strong>
      <button class="choice-button ${state.selection?.bet?.direction === 'over' ? 'selected' : ''}" data-card-direction="over" type="button">Over <span class="threshold-word">${current}</span></button>
    </div>`;
}

function renderDiceControls() {
  const rules = state.rules.games.dice;
  $('#bet-surface-title').textContent = 'Dice total board';
  $('#surface-help').textContent = 'Choose a range or call the exact total.';
  $('#bet-controls').innerHTML = `
    <div class="bet-group">
      <span class="bet-group-label">Ranges</span>
      <div class="choice-grid outside">
        ${rules.rangeBets.map((bet) => `<button class="choice-button" data-key="${bet.key}" type="button">${bet.label}</button>`).join('')}
      </div>
    </div>
    <div class="bet-group">
      <span class="bet-group-label">Exact total</span>
      <div class="choice-grid dice-numbers">
        ${rules.exactBets.map((bet) => `<button class="choice-button" data-key="${bet.key}" type="button">${bet.label}</button>`).join('')}
      </div>
    </div>`;
}

function renderSlotControls() {
  const tier = slotTierForPlay(currentPlayIndex());
  const tierData = state.rules.games.slots.tiers.find((t) => t.key === tier);
  if (!tierData) return;
  $('#bet-surface-title').textContent = `${tierData.name} Machine Paytable`;
  $('#surface-help').textContent = 'Every tier returns 96% over many spins.';
  $('#bet-controls').innerHTML = `
    <div class="paytable">
      ${tierData.outcomes.map((outcome) => `
        <div class="pay-row">
          <span>${outcome.symbols.map((symbol) => SLOT_SYMBOL_GLYPHS[symbol]).join(' ')}</span>
          <b>${percent(outcome.probability)}</b>
          <b>${outcome.multiplier ? multiplier(outcome.multiplier) : 'No return'}</b>
        </div>`).join('')}
    </div>`;
}

function renderControls() {
  const table = activeTable();
  if (table === 'wheel') renderWheelControls();
  if (table === 'cards') renderCardControls();
  if (table === 'dice') renderDiceControls();
  if (table === 'slots') renderSlotControls();
  if (table !== 'slots') {
    setSelection(state.selection || defaultSelection(table));
  } else {
    renderBetSlip();
  }
}

function renderStage() {
  const table = activeTable();
  $$('.stage-scene').forEach((scene) => { scene.hidden = true; });
  $(`#${table}-stage`).hidden = false;
  $('#arena-title').textContent = tableNames[table];
  if (table === 'slots') {
    const tier = slotTierForPlay(currentPlayIndex());
    $('#slot-tier-label').textContent = tier.toUpperCase();
    $('.slot-machine').className = `slot-machine slot-${tier}`;
  }
}

function renderMoveTrack() {
  const gameOrder = state.run.gameOrder || [];
  const html = gameOrder.map((table, gIdx) => {
    const dots = Array.from({ length: PLAYS_PER_GAME }, (_, pIdx) => {
      const moveNum = gIdx * PLAYS_PER_GAME + pIdx;
      const className = moveNum < state.run.move ? 'complete'
        : moveNum === state.run.move ? 'current' : '';
      return `<i class="move-dot ${className}" aria-label="Game ${gIdx + 1} play ${pIdx + 1}${moveNum < state.run.move ? ' complete' : ''}"></i>`;
    }).join('');
    return `<div class="move-group" title="${tableNames[table]}">${dots}</div>`;
  }).join('');
  $('#move-track').innerHTML = html;
}

function renderHistory() {
  const history = $('#history');
  const wagers = state.run.wagers;
  $('#history-count').textContent = wagers.length ? `${pluralize(wagers.length, 'move')} played` : 'No moves yet';
  if (!wagers.length) {
    history.innerHTML = '<p class="empty-state">Your first result will appear here. Every table is waiting.</p>';
    return;
  }
  history.innerHTML = wagers.slice().reverse().map((wager) => `
    <div class="history-row">
      <span class="history-move">${String(wager.move).padStart(2, '0')}</span>
      <span class="history-copy">
        <strong>${tableNames[wager.table]}</strong>
        <small>${wager.resultLabel}</small>
      </span>
      <span class="history-stake">${format(wager.stake)} staked</span>
      <span class="history-change ${changeClass(wager.netChange)}">${signedFormat(wager.netChange)}</span>
    </div>
  `).join('');
}

function renderResults() {
  const results = state.run.results;
  $('#active-run').hidden = true;
  $('#results-view').hidden = false;
  $('#final-bankroll').textContent = format(state.run.bankroll);
  const difference = state.run.bankroll - state.rules.startingBankroll;
  const privacyNote = state.mode === 'guest'
    ? ' This guest result was not saved or added to the standings.'
    : '';
  $('#result-summary').textContent = (difference >= 0
    ? `You finished ${format(difference)} points ahead after ${state.run.move} moves.`
    : `You finished ${format(Math.abs(difference))} points below the opening bankroll after ${state.run.move} moves.`) + privacyNote;
  $('#percentile').textContent = ordinal(results.percentile);
  $('#player-count').textContent = format(results.totalPlayers);
  $('#broke-percent').textContent = `${results.brokePercent}%`;
  $('#share-score').textContent = `${format(state.run.bankroll)} points`;
  $('#share-usage').textContent = state.run.wagers.length
    ? `${pluralize(state.run.wagers.length, 'move')} \u00b7 wager details hidden`
    : 'Stopped before placing a wager';
  $('#share-route').innerHTML = state.run.wagers.map((wager) => `
    <div class="share-route-row">
      <span>${String(wager.move).padStart(2, '0')}</span>
      <strong>${tableNames[wager.table]}</strong>
      <b class="${changeClass(wager.netChange)}">${signedFormat(wager.netChange)}</b>
    </div>
  `).join('');
  $('#achievements').innerHTML = state.run.achievements.length
    ? state.run.achievements.map((item) => `<div class="achievement"><strong>${item.name}</strong><small>${item.description}</small></div>`).join('')
    : '<p class="empty-state">No achievement stamps today. The cabinet keeps waiting.</p>';
  const topHtml = results.topPlayers?.length
    ? '<h3 class="leaderboard-subtitle">Top players</h3>' + results.topPlayers.map((row, index) => `
      <div class="leader-row named">
        <span>${index + 1}</span>
        <strong>${escapeHtml(row.username)}</strong>
        <small>${format(row.bankroll)} points</small>
      </div>`).join('')
    : '';
  const tierHtml = results.leaderboard.map((row, index) => `
    <div class="leader-row">
      <span>${index + 1}</span>
      <strong>${format(row.bankroll)} points</strong>
      <small>${pluralize(row.players, 'player')}</small>
    </div>`).join('');
  $('#leaderboard').innerHTML = topHtml + tierHtml;
}

function renderRun() {
  $('#bankroll').textContent = format(state.run.bankroll);
  const gameIdx = currentGameIndex();
  const playIdx = currentPlayIndex();
  $('#game-label').textContent = `${gameIdx + 1} / ${GAMES_PER_RUN}`;
  $('#play-label').textContent = `${playIdx + 1} / ${PLAYS_PER_GAME}`;
  const profitLoss = state.run.bankroll - state.rules.startingBankroll;
  $('#profit-loss').textContent = signedFormat(profitLoss);
  $('#profit-loss').className = changeClass(profitLoss);
  $('#stake').max = state.run.bankroll;
  if (Number($('#stake').value) > state.run.bankroll) $('#stake').value = state.run.bankroll;
  $('#date-label').textContent = new Date(`${state.run.date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  renderMoveTrack();
  renderHistory();
  renderBetSlip();
  if (state.run.status !== 'active') renderResults();
}

function showResolution(resolution) {
  const ribbon = $('#result-ribbon');
  ribbon.hidden = false;
  ribbon.classList.toggle('loss', !resolution.won);
  const gameIdx = currentGameIndex();
  const playIdx = currentPlayIndex();
  $('#result-kicker').textContent = `Game ${gameIdx + 1}, Play ${playIdx} resolved`;
  $('#result-title').textContent = resolution.won ? 'Wager won' : 'Wager lost';
  $('#result-detail').textContent = `${resolution.label}. Bankroll: ${format(resolution.bankroll)} points.`;
  $('#result-change').textContent = signedFormat(resolution.netChange);
  $('#result-change').className = changeClass(resolution.netChange);
  $('#repeat-button').hidden = state.run.status !== 'active';
  sound.play('result', resolution.won);
}

async function showGameTransition(nextTable) {
  const overlay = $('#game-transition');
  const icon = overlay.querySelector('.transition-icon');
  const title = overlay.querySelector('.transition-title');
  const subtitle = overlay.querySelector('.transition-subtitle');

  icon.textContent = tableIcons[nextTable] || '';
  title.textContent = tableNames[nextTable] || nextTable;
  subtitle.textContent = `Game ${currentGameIndex() + 1} of ${GAMES_PER_RUN}`;

  overlay.hidden = false;
  overlay.style.opacity = '0';
  const fadeIn = animate(overlay, { opacity: [0, 1] }, { duration: 0.4, ease: 'easeOut' });
  await fadeIn.finished;
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const fadeOut = animate(overlay, { opacity: [1, 0] }, { duration: 0.4, ease: 'easeIn' });
  await fadeOut.finished;
  overlay.hidden = true;
}

function saveAnonymousState() {
  if (state.mode !== 'guest') return;
  storage.setJson(ANON_STATE_KEY, {
    date: state.run.date,
    seed: state.run.seed,
    gameOrder: state.run.gameOrder,
    bankroll: state.run.bankroll,
    move: state.run.move,
    movesRemaining: state.run.movesRemaining,
    status: state.run.status,
    wagers: state.run.wagers,
    achievements: state.run.achievements,
    results: state.run.results || null,
  });
}

function loadAnonymousState() {
  const saved = storage.getJson(ANON_STATE_KEY);
  if (!saved) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (saved.date !== today) {
    storage.remove(ANON_STATE_KEY);
    return null;
  }
  return saved;
}

async function placeWager() {
  if (state.phase === 'committing' || state.phase === 'animating') return;
  sound.initialize();
  const table = activeTable();
  const stake = Number($('#stake').value);
  const bet = table === 'slots' ? {} : structuredClone(state.selection?.bet || {});
  const prevGameIndex = currentGameIndex();

  const wager = {
    table,
    stake,
    bet,
    selection: table === 'slots' ? null : structuredClone(state.selection),
  };
  setPhase('committing');
  $('#result-ribbon').hidden = true;
  try {
    const path = state.mode === 'guest' ? '/api/game/anonymous/play' : '/api/game/play';
    const body = await api(path, {
      method: 'POST',
      body: JSON.stringify({
        stake,
        bet: table === 'slots' ? {} : bet,
        ...(state.mode === 'guest' ? {
          date: state.run.date,
          move: state.run.move,
          bankroll: state.run.bankroll,
          seed: state.run.seed,
          gameOrder: state.run.gameOrder,
        } : {}),
      }),
    });
    state.lastWager = wager;
    setPhase('animating');
    try {
      await gameAnimations.play(table, body.resolution);
    } catch {
      // Animation failure should not block state update.
    }
    if (state.mode === 'guest') {
      state.run = {
        ...state.run,
        bankroll: body.resolution.bankroll,
        move: body.wager.move,
        movesRemaining: state.rules.gamesPerRun * state.rules.playsPerGame - body.wager.move,
        status: body.status,
        wagers: [...state.run.wagers, body.wager],
        currentGame: body.currentGame,
        ...(body.results ? { results: body.results } : {}),
      };
    } else {
      state.run = body.run;
    }
    saveAnonymousState();

    const newGameIndex = currentGameIndex();
    const crossedGameBoundary = newGameIndex > prevGameIndex && state.run.status === 'active';

    renderRun();
    showResolution(body.resolution);
    setPhase('settled');

    if (crossedGameBoundary) {
      const nextTable = activeTable();
      await showGameTransition(nextTable);
      state.table = nextTable;
      state.selection = defaultSelection(nextTable);
      renderStage();
      renderControls();
      gameAnimations.reset(nextTable);
      $('#result-ribbon').hidden = true;
    } else if (state.run.status === 'active') {
      renderStage();
      renderControls();
    }
  } catch (error) {
    showToast(error.message);
    setPhase('idle');
  }
}

function showFirstPlayGuide() {
  if (storage.get(FIRST_PLAY_KEY)) return;
  if (state.run.move > 0) {
    storage.set(FIRST_PLAY_KEY, '1');
    return;
  }
  storage.set(FIRST_PLAY_KEY, '1');
  $('#how-to-dialog').showModal();
}

async function loadGame(mode = 'account') {
  if (mode === 'guest') {
    const saved = loadAnonymousState();
    if (saved) {
      state.mode = 'guest';
      state.user = null;
      const rulesBody = await api('/api/game/anonymous');
      state.rules = rulesBody.rules;
      state.run = saved;
      state.table = activeTable();
      state.selection = defaultSelection(state.table);
      $('#game-view').hidden = false;
      $('#account-email').textContent = 'Guest player';
      $('#account-button').textContent = 'Sign in';
      $('#authenticated-settings').hidden = true;
      $('#anonymous-settings').hidden = false;
      gameAnimations = createGameAnimations(sound);
      renderStage();
      renderControls();
      renderRun();
      updateSoundButton();
      return;
    }
  }

  const body = await api(mode === 'guest' ? '/api/game/anonymous' : '/api/game');
  state.mode = mode;
  state.user = body.user;
  state.rules = body.rules;
  state.run = body.run;
  state.table = activeTable();
  state.selection = defaultSelection(state.table);
  saveAnonymousState();
  $('#game-view').hidden = false;
  const displayName = mode === 'guest' ? 'Guest player' : (state.user.username || state.user.email);
  $('#account-email').textContent = displayName;
  if (mode !== 'guest' && !state.user.username) {
    $('#username-setup-prompt').hidden = false;
    const setupInput = $('#username-setup-input');
    if (setupInput) setupInput.value = '';
    $('#username-setup-dialog').showModal();
  } else {
    $('#username-setup-prompt').hidden = true;
    if ($('#username-setup-dialog').open) $('#username-setup-dialog').close();
  }
  const usernameInput = $('#username-input');
  if (usernameInput) usernameInput.value = state.user?.username || '';
  $('#account-button').textContent = mode === 'guest' ? 'Sign in' : 'Account';
  $('#authenticated-settings').hidden = mode === 'guest';
  $('#anonymous-settings').hidden = mode !== 'guest';
  gameAnimations = createGameAnimations(sound);
  renderStage();
  renderControls();
  renderRun();
  updateSoundButton();
  showFirstPlayGuide();
}

function updateSoundButton() {
  $('#sound-button').setAttribute('aria-pressed', String(state.soundEnabled));
  $('#sound-button b').textContent = state.soundEnabled ? 'Sound on' : 'Sound off';
}

async function initialize() {
  queryMessages();
  try {
    const { user } = await api('/api/me');
    await loadGame(user ? 'account' : 'guest');
  } catch {
    try {
      await loadGame('guest');
    } catch (fallbackError) {
      showToast(fallbackError.message);
    }
  }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  button.textContent = 'Sending\u2026';
  try {
    const body = await api('/api/auth/request', {
      method: 'POST',
      body: JSON.stringify({ email: $('#email').value }),
    });
    const message = $('#login-message');
    message.hidden = false;
    message.textContent = '';
    message.append(body.message);
    if (body.developmentLink) {
      message.append(document.createElement('br'));
      const link = document.createElement('a');
      link.href = body.developmentLink;
      link.textContent = 'Open development login link';
      message.append(link);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Email login link';
  }
});

$('#bet-controls').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || state.phase === 'committing' || state.phase === 'animating') return;
  const table = activeTable();
  if (button.dataset.key) {
    const rules = state.rules.games[table];
    const candidates = [
      ...(rules.outsideBets || []),
      ...(rules.rangeBets || []),
      ...(rules.exactBets || []),
    ];
    setSelection(candidates.find((bet) => bet.key === button.dataset.key));
  }
  if (button.dataset.threshold) {
    const threshold = Number(button.dataset.threshold);
    const preferredDirection = state.selection?.bet?.direction || 'over';
    const validDirection = threshold === 1 ? 'over' : threshold === 13 ? 'under' : preferredDirection;
    const selection = state.rules.games.cards.bets.find((bet) => (
      bet.bet.threshold === threshold && bet.bet.direction === validDirection
    ));
    state.selection = selection;
    renderControls();
  }
  if (button.dataset.cardDirection) {
    const threshold = state.selection.bet.threshold;
    const selection = state.rules.games.cards.bets.find((bet) => (
      bet.bet.threshold === threshold && bet.bet.direction === button.dataset.cardDirection
    ));
    if (selection) setSelection(selection);
  }
});

$('#stake').addEventListener('input', renderBetSlip);
$('#slip-toggle').addEventListener('click', () => {
  const slip = $('.bet-slip');
  const collapsed = slip.classList.toggle('mobile-collapsed');
  $('#slip-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#slip-toggle').textContent = collapsed ? 'Details' : 'Collapse';
});
$$('[data-percent]').forEach((button) => {
  button.addEventListener('click', () => {
    $('#stake').value = Math.max(1, Math.floor(state.run.bankroll * Number(button.dataset.percent)));
    renderBetSlip();
  });
});

$('#play-button').addEventListener('click', placeWager);
$('#repeat-button').addEventListener('click', async () => {
  if (!state.lastWager || state.run.status !== 'active') return;
  const table = activeTable();
  if (state.lastWager.table === table && state.lastWager.selection) {
    state.selection = state.lastWager.selection;
  }
  $('#stake').value = Math.min(state.lastWager.stake, state.run.bankroll);
  renderControls();
  renderBetSlip();
  await placeWager();
});

$('#sound-button').addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  storage.set('gamdle-sound', state.soundEnabled ? 'on' : 'off');
  if (state.soundEnabled) {
    sound.initialize();
    sound.tone(620, 0.07);
  }
  updateSoundButton();
});

$('#leave-button').addEventListener('click', async () => {
  if (!confirm(`Leave today\u2019s casino with ${format(state.run.bankroll)} points? This cannot be undone.`)) return;
  try {
    const anonymous = state.mode === 'guest';
    const body = await api(anonymous ? '/api/game/anonymous/leave' : '/api/game/leave', {
      method: 'POST',
      body: JSON.stringify(anonymous ? { date: state.run.date, bankroll: state.run.bankroll } : {}),
    });
    state.run = anonymous
      ? { ...state.run, status: body.status, results: body.results }
      : body.run;
    saveAnonymousState();
    renderRun();
  } catch (error) {
    showToast(error.message);
  }
});

$('#share-button').addEventListener('click', async () => {
  const route = state.run.wagers.map((wager) => (
    `${String(wager.move).padStart(2, '0')}  ${tableNames[wager.table]}  ${signedFormat(wager.netChange)}`
  )).join('\n');
  const text = [
    `Gamdle ${state.run.date}`,
    `${format(state.run.bankroll)} points in ${state.run.move} moves`,
    '',
    route || 'No wagers placed',
    '',
    'Tables and score changes only. Wager choices hidden.',
  ].join('\n');
  try {
    if (navigator.share) await navigator.share({ title: 'My Gamdle result', text });
    else {
      await navigator.clipboard.writeText(text);
      showToast('Result copied to clipboard.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Could not share this result.');
  }
});

$('#account-button').addEventListener('click', () => $('#account-dialog').showModal());
$('#account-close').addEventListener('click', () => $('#account-dialog').close());
$('#how-to-close').addEventListener('click', () => $('#how-to-dialog').close());
$('#how-to-start').addEventListener('click', () => $('#how-to-dialog').close());
$('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    // Clear local session even if the server request fails.
  }
  state.developmentSession = null;
  storage.remove('gamdle-dev-session');
  location.reload();
});

async function submitUsername(inputSelector, messageSelector, button) {
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const body = await api('/api/account/username', {
      method: 'POST',
      body: JSON.stringify({ username: $(inputSelector).value }),
    });
    state.user.username = body.username;
    $('#account-email').textContent = body.username;
    $('#username-setup-prompt').hidden = true;
    if ($('#username-setup-dialog').open) $('#username-setup-dialog').close();
    const message = $(messageSelector);
    message.hidden = false;
    message.textContent = 'Username saved.';
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = button.dataset.label || 'Save username';
  }
}

$('#username-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await submitUsername('#username-input', '#account-message', event.currentTarget.querySelector('button'));
});

$('#username-setup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await submitUsername('#username-setup-input', '#username-setup-message', event.currentTarget.querySelector('button'));
});

$('#username-setup-dialog').addEventListener('cancel', (event) => {
  if (!state.user?.username) event.preventDefault();
});

$('#delete-button').addEventListener('click', async () => {
  if (!confirm('Email a one-time account deletion link? Opening it permanently removes your scores and achievements.')) return;
  try {
    const body = await api('/api/account/delete', { method: 'POST', body: '{}' });
    const message = $('#account-message');
    message.hidden = false;
    message.textContent = '';
    message.append(body.message);
    if (body.developmentLink) {
      message.append(document.createElement('br'));
      const link = document.createElement('a');
      link.href = body.developmentLink;
      link.textContent = 'Open development deletion link';
      message.append(link);
    }
  } catch (error) {
    showToast(error.message);
  }
});

initialize();
