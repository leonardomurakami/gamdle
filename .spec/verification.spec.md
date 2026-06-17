# Verification Specification

## Automated Tests

The project uses Node's built-in test runner through:

```bash
npm test
```

The implemented suite contains 12 passing tests covering:

- Email trimming, lowercasing, and validation.
- Stable token hashing.
- Secure production cookie attributes.
- Atomic one-time magic-link consumption.
- Rejection of reused and expired magic links.
- Deterministic daily events.
- Event independence from wager selection.
- Stake bounds.
- Winning settlement including the original stake.
- Achievement derivation from immutable wager history.
- 96% theoretical RTP for every binary wager exposed in the rules payload.
- Slot distributions totaling 100% probability and 96% RTP.
- Stable underlying slot event across volatility selections.

## Browser Verification

The implemented application was verified in the in-app browser at `http://localhost:3100/`.

Verified flows:

- Passwordless development login.
- Gameplay-version reset preserving the existing account.
- Fresh daily run at 1,000 points.
- Roulette animation and settled pocket.
- High Card flip and matching rank/suit.
- Dice animation, matching faces, and total.
- Lucky Slots paytable, reel animation, and matching symbols.
- Wager settlement and bankroll changes.
- Inline result ribbon.
- Repeat wager consuming the next global move.
- Sound toggle and persisted preference.
- Exact decimal odds display, including roulette `48.6%`.
- Correct selected wager accessibility state.
- Desktop two-column arena and bet slip.
- Mobile 390×844 layout with compact sticky bet tray.
- No browser console warnings or errors after final verification.

## Runtime Checks

The final implementation passed:

```bash
node --check public/app.js
node --check src/server.js
node --check src/game.js
```

Database inspection confirmed:

- `app_meta.gameplay_version` is `2`.
- Prototype gameplay was reset during migration.
- The preserved account remained intact.

## Acceptance Criteria

The implementation is considered conformant when:

- All automated tests pass.
- Every legal wager's displayed odds come from the server rules payload.
- Every committed result matches its deterministic server event.
- Animation, sound, skip timing, and stake cannot change the event.
- Controls remain locked during commitment and animation.
- A run cannot exceed 12 wagers or continue after finishing.
- Leaderboard data remains unavailable until the current run ends.
- Desktop and mobile layouts keep the game stage and wager action usable.
- Production authentication remains cookie-only and development bearer sessions remain disabled in production.
