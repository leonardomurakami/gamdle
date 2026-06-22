import { createGameAnimations } from './animations.js';
import { RED_NUMBERS, SLOT_SYMBOL_GLYPHS } from './game-geometry.js';
import { createSound } from './sound.js';

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

const FIRST_PLAY_KEY = 'gamdle-first-play-seen';

const tableNames = {
  wheel: 'Roulette',
  cards: 'High Card',
  dice: 'Dice Pool',
  slots: 'Lucky Slots',
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
const multiplier = (value) => `${value.toFixed(value < 10 ? 2 : 1)}×`;
const ordinal = (number) => {
  const suffix = number % 10 === 1 && number % 100 !== 11 ? 'st'
    : number % 10 === 2 && number % 100 !== 12 ? 'nd'
      : number % 10 === 3 && number % 100 !== 13 ? 'rd' : 'th';
  return `${number}${suffix}`;
};

const sound = createSound(() => state.soundEnabled);
let gameAnimations = null;

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
    'email-changed': 'Your account email has been changed.',
    'email-half-confirmed': 'One address is confirmed. Open the link sent to the other address.',
  };
  const key = params.get('auth') || params.get('account');
  if (messages[key]) showToast(messages[key]);
  if (key) history.replaceState({}, '', '/');
}

function setPhase(phase) {
  state.phase = phase;
  const locked = phase === 'committing' || phase === 'animating';
  $('#play-button').disabled = locked || state.run?.status !== 'active';
  $('#play-button').textContent = phase === 'committing' ? 'Locking wager…'
    : phase === 'animating' ? 'Revealing…' : 'Place wager';
  $('#stake').disabled = locked;
  $$('.choice-button, .game-tab, [data-percent]').forEach((button) => { button.disabled = locked; });
  $('#repeat-button').disabled = locked || state.run?.status !== 'active';
}

function defaultSelection(table) {
  const rules = state.rules.games[table];
  if (table === 'wheel') return rules.outsideBets[0];
  if (table === 'cards') return rules.bets.find((bet) => bet.key === 'cards-over-7');
  if (table === 'dice') return rules.rangeBets[0];
  const profile = rules.profiles[0];
  return {
    key: `slots-${profile.key}`,
    label: profile.name,
    probability: profile.winProbability,
    multiplier: profile.maxMultiplier,
    risk: profile.risk,
    bet: { profile: profile.key },
    profile,
    variableReturn: true,
  };
}

function setSelection(selection) {
  if (!selection) return;
  state.selection = selection;
  $$('.choice-button').forEach((button) => {
    const selected = Boolean(button.dataset.key === selection.key
      || (button.dataset.cardDirection && button.dataset.cardDirection === selection.bet?.direction)
      || (button.dataset.threshold && Number(button.dataset.threshold) === selection.bet?.threshold)
      || (button.dataset.profile && button.dataset.profile === selection.profile?.key));
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderBetSlip();
}

function renderBetSlip() {
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
  const profiles = state.rules.games.slots.profiles;
  const selectedKey = state.selection?.profile?.key || 'steady';
  const selected = profiles.find((profile) => profile.key === selectedKey) || profiles[0];
  $('#bet-surface-title').textContent = 'Volatility and paytable';
  $('#surface-help').textContent = 'Every profile returns 96% over many spins.';
  $('#bet-controls').innerHTML = `
    <div class="choice-grid slot-profiles">
      ${profiles.map((profile) => `
        <button class="choice-button profile-button" data-profile="${profile.key}" type="button">
          <strong>${profile.name}</strong>
          <small>${percent(profile.winProbability)} pays anything</small>
        </button>`).join('')}
    </div>
    <div class="paytable">
      ${selected.outcomes.map((outcome) => `
        <div class="pay-row">
          <span>${outcome.symbols.map((symbol) => SLOT_SYMBOL_GLYPHS[symbol]).join(' ')}</span>
          <b>${percent(outcome.probability)}</b>
          <b>${outcome.multiplier ? multiplier(outcome.multiplier) : 'No return'}</b>
        </div>`).join('')}
    </div>`;
}

function renderControls() {
  if (state.table === 'wheel') renderWheelControls();
  if (state.table === 'cards') renderCardControls();
  if (state.table === 'dice') renderDiceControls();
  if (state.table === 'slots') renderSlotControls();
  setSelection(state.selection || defaultSelection(state.table));
}

function renderStage() {
  $$('.stage-scene').forEach((scene) => { scene.hidden = true; });
  $(`#${state.table}-stage`).hidden = false;
  $('#arena-title').textContent = tableNames[state.table];
  $$('.game-tab').forEach((tab) => tab.classList.toggle('selected', tab.dataset.table === state.table));
  if (state.table === 'slots') {
    $('#slot-profile-label').textContent = (state.selection?.profile?.name || 'Steady').toUpperCase();
    const profile = state.selection?.profile?.key || 'steady';
    $('.slot-machine').className = `slot-machine slot-${profile}`;
  }
}

function renderMoveTrack() {
  $('#move-track').innerHTML = Array.from({ length: state.rules.maxMoves }, (_, index) => {
    const move = index + 1;
    const className = move <= state.run.move ? 'complete' : move === state.run.move + 1 ? 'current' : '';
    return `<i class="move-dot ${className}" aria-label="Move ${move}${move <= state.run.move ? ' complete' : ''}"></i>`;
  }).join('');
}

function renderHistory() {
  const history = $('#history');
  const wagers = state.run.wagers;
  $('#history-count').textContent = wagers.length ? `${wagers.length} move${wagers.length === 1 ? '' : 's'} played` : 'No moves yet';
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
      <span class="history-change ${wager.netChange >= 0 ? 'positive' : 'negative'}">${wager.netChange >= 0 ? '+' : ''}${format(wager.netChange)}</span>
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
    ? `${state.run.wagers.length} move${state.run.wagers.length === 1 ? '' : 's'} · wager details hidden`
    : 'Stopped before placing a wager';
  $('#share-route').innerHTML = state.run.wagers.map((wager) => `
    <div class="share-route-row">
      <span>${String(wager.move).padStart(2, '0')}</span>
      <strong>${tableNames[wager.table]}</strong>
      <b class="${wager.netChange >= 0 ? 'positive' : 'negative'}">${wager.netChange >= 0 ? '+' : ''}${format(wager.netChange)}</b>
    </div>
  `).join('');
  $('#achievements').innerHTML = state.run.achievements.length
    ? state.run.achievements.map((item) => `<div class="achievement"><strong>${item.name}</strong><small>${item.description}</small></div>`).join('')
    : '<p class="empty-state">No achievement stamps today. The cabinet keeps waiting.</p>';
  $('#leaderboard').innerHTML = results.leaderboard.map((row, index) => `
    <div class="leader-row">
      <span>${index + 1}</span>
      <strong>${format(row.bankroll)} points</strong>
      <small>${row.players} player${row.players === 1 ? '' : 's'}</small>
    </div>`).join('');
}

function renderRun() {
  $('#bankroll').textContent = format(state.run.bankroll);
  $('#move').textContent = state.run.move;
  const profitLoss = state.run.bankroll - state.rules.startingBankroll;
  $('#profit-loss').textContent = `${profitLoss >= 0 ? '+' : ''}${format(profitLoss)}`;
  $('#profit-loss').className = profitLoss >= 0 ? 'positive' : 'negative';
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
  $('#result-kicker').textContent = `Move ${state.run.move} resolved`;
  $('#result-title').textContent = resolution.won ? 'Wager won' : 'Wager lost';
  $('#result-detail').textContent = `${resolution.label}. Bankroll: ${format(resolution.bankroll)} points.`;
  $('#result-change').textContent = `${resolution.netChange >= 0 ? '+' : ''}${format(resolution.netChange)}`;
  $('#result-change').className = resolution.netChange >= 0 ? 'positive' : 'negative';
  $('#repeat-button').hidden = state.run.status !== 'active';
  sound.play('result', resolution.won);
}

async function placeWager() {
  if (state.phase === 'committing' || state.phase === 'animating') return;
  sound.initialize();
  const stake = Number($('#stake').value);
  const wager = {
    table: state.table,
    stake,
    bet: structuredClone(state.selection.bet),
    selection: structuredClone(state.selection),
  };
  setPhase('committing');
  $('#result-ribbon').hidden = true;
  try {
    const path = state.mode === 'guest' ? '/api/game/anonymous/play' : '/api/game/play';
    const body = await api(path, {
      method: 'POST',
      body: JSON.stringify({
        table: wager.table,
        stake,
        bet: wager.bet,
        ...(state.mode === 'guest' ? {
          date: state.run.date,
          move: state.run.move,
          bankroll: state.run.bankroll,
        } : {}),
      }),
    });
    state.lastWager = wager;
    setPhase('animating');
    try {
      await gameAnimations.play(wager.table, body.resolution);
    } catch {
      // Animation failure should not block state update.
    }
    if (state.mode === 'guest') {
      state.run = {
        ...state.run,
        bankroll: body.resolution.bankroll,
        move: body.wager.move,
        movesRemaining: state.rules.maxMoves - body.wager.move,
        status: body.status,
        wagers: [...state.run.wagers, body.wager],
        ...(body.results ? { results: body.results } : {}),
      };
    } else {
      state.run = body.run;
    }
    renderRun();
    showResolution(body.resolution);
    setPhase('settled');
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
  const body = await api(mode === 'guest' ? '/api/game/anonymous' : '/api/game');
  state.mode = mode;
  state.user = body.user;
  state.rules = body.rules;
  state.run = body.run;
  state.selection = defaultSelection(state.table);
  $('#game-view').hidden = false;
  $('#account-email').textContent = mode === 'guest' ? 'Guest player' : state.user.email;
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
  button.textContent = 'Sending…';
  try {
    const body = await api('/api/auth/request', {
      method: 'POST',
      body: JSON.stringify({ email: $('#email').value }),
    });
    const message = $('#login-message');
    message.hidden = false;
    message.innerHTML = body.developmentLink
      ? `${body.message}<br><a href="${body.developmentLink}">Open development login link</a>`
      : body.message;
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Email login link';
  }
});

$('#game-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-table]');
  if (!tab || state.phase === 'committing' || state.phase === 'animating') return;
  state.table = tab.dataset.table;
  state.selection = defaultSelection(state.table);
  $('#result-ribbon').hidden = true;
  renderStage();
  renderControls();
  gameAnimations.reset(state.table);
});

$('#bet-controls').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || state.phase === 'committing' || state.phase === 'animating') return;
  if (button.dataset.key) {
    const rules = state.rules.games[state.table];
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
  if (button.dataset.profile) {
    const profile = state.rules.games.slots.profiles.find((item) => item.key === button.dataset.profile);
    state.selection = {
      key: `slots-${profile.key}`,
      label: profile.name,
      probability: profile.winProbability,
      multiplier: profile.maxMultiplier,
      risk: profile.risk,
      bet: { profile: profile.key },
      profile,
      variableReturn: true,
    };
    $('#slot-profile-label').textContent = profile.name.toUpperCase();
    $('.slot-machine').className = `slot-machine slot-${profile.key}`;
    renderControls();
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
  state.table = state.lastWager.table;
  state.selection = state.lastWager.selection;
  $('#stake').value = Math.min(state.lastWager.stake, state.run.bankroll);
  renderStage();
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
  if (!confirm(`Leave today’s casino with ${format(state.run.bankroll)} points? This cannot be undone.`)) return;
  try {
    const anonymous = state.mode === 'guest';
    const body = await api(anonymous ? '/api/game/anonymous/leave' : '/api/game/leave', {
      method: 'POST',
      body: JSON.stringify(anonymous ? { date: state.run.date, bankroll: state.run.bankroll } : {}),
    });
    state.run = anonymous
      ? { ...state.run, status: body.status, results: body.results }
      : body.run;
    renderRun();
  } catch (error) {
    showToast(error.message);
  }
});

$('#share-button').addEventListener('click', async () => {
  const route = state.run.wagers.map((wager) => (
    `${String(wager.move).padStart(2, '0')}  ${tableNames[wager.table]}  ${wager.netChange >= 0 ? '+' : ''}${format(wager.netChange)}`
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

$('#change-email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const body = await api('/api/account/change-email', {
      method: 'POST',
      body: JSON.stringify({ email: $('#new-email').value }),
    });
    const message = $('#account-message');
    message.hidden = false;
    message.innerHTML = body.developmentLinks
      ? `${body.message}<br>${body.developmentLinks.map((link, index) => `<a href="${link}">Open ${index ? 'new' : 'current'} email link</a>`).join('<br>')}`
      : body.message;
  } catch (error) {
    showToast(error.message);
  }
});

$('#delete-button').addEventListener('click', async () => {
  if (!confirm('Email a one-time account deletion link? Opening it permanently removes your scores and achievements.')) return;
  try {
    const body = await api('/api/account/delete', { method: 'POST', body: '{}' });
    const message = $('#account-message');
    message.hidden = false;
    message.innerHTML = body.developmentLink
      ? `${body.message}<br><a href="${body.developmentLink}">Open development deletion link</a>`
      : body.message;
  } catch (error) {
    showToast(error.message);
  }
});

initialize();
