# Frontend Specification

## Visual Direction

The authenticated interface is an electronic arcade betting floor:

- Near-black background with saturated green game surfaces.
- Orange accents for payouts and machine details.
- Compact odds presentation inspired by betting products.
- One active game stage rather than four equally weighted cards.
- Standard system sans typography and tabular numeric values.

The interface uses native HTML, CSS, SVG, Web Animations, and Web Audio. There is no frontend framework.

## Page Structure

### Authentication View

- Brand and game summary.
- Email-only login form.
- Explicit no-password and fictional-points messaging.
- Development login link appears after requesting a magic link outside production.

### Game Header

- Brand.
- Bankroll.
- Profit/loss against 1,000.
- Current move out of 12.
- Sound toggle.
- Account dialog button.

### Session Controls

- UTC date.
- Twelve-position move track:
  - Completed moves use the primary color.
  - The next move uses the accent color.
- Permanent leave button with destructive confirmation.

### Game Navigation

Compact tabs switch among:

- Roulette.
- High Card.
- Dice Pool.
- Lucky Slots.

Switching games does not consume a move.

### Play Layout

Desktop:

- Animated game arena on the left.
- Sticky bet slip on the right.

Mobile:

- Game stage first.
- Sticky compact bet tray at the bottom.
- `Details` expands full odds and stake controls.

## Bet Selection

- The server rules payload is the source of legal bets, probability, multiplier, and risk.
- Selected choices use `aria-pressed="true"` and visible selected styling.
- Roulette shows outside bets and pockets 0–36.
- High Card shows thresholds and under/over controls.
- Dice Pool shows range and exact-total buttons.
- Lucky Slots shows volatility profiles and the selected profile's complete paytable.
- The bet slip shows:
  - Selected label.
  - Risk label.
  - Exact probability.
  - Gross multiplier or maximum slot multiplier.
  - 96% RTP.
  - 4% house edge.
  - Stake.
  - Integer-rounded possible gross return.

## Interaction State Machine

Client wager phases:

| Phase | Behavior |
| --- | --- |
| `idle` | Game, wager, stake, and navigation controls are available. |
| `committing` | Wager is being posted; all relevant controls lock. |
| `animating` | Server result is committed; controls remain locked during the physical reveal. |
| `settled` | Result ribbon and repeat action are available. |

A second wager cannot be submitted during `committing` or `animating`.

`Repeat wager` restores the previous table, selected bet, and stake capped at the current bankroll, then commits it as the next global move.

## Physical Reveals

Results are already committed by the server before animation begins.

### Roulette

- SVG European wheel generated from 37 pocket paths and labels.
- Wheel and ball rotate separately in opposing directions.
- Duration is approximately two seconds.
- The settled pocket is displayed after animation.

### High Card

- Face-down card deals into position and flips around the Y axis.
- The face displays rank, suit symbol, and full card name.
- Hearts and diamonds use red styling.

### Dice Pool

- Two pip-based dice rise, rotate, and settle.
- Final pips and total exactly match the server event.

### Lucky Slots

- Three reels animate sequentially.
- Each reel settles on the symbols provided by the server.
- The selected volatility profile is displayed on the machine.

### Skipping And Reduced Motion

- `Skip reveal` becomes available after 500ms.
- Skipping finishes all active Web Animations and settles the visual result.
- Under `prefers-reduced-motion: reduce`, physical animations are bypassed or made effectively immediate.

## Result Presentation

Results appear in an inline ribbon instead of a modal:

- Move number.
- Win/loss state.
- Result label.
- New bankroll.
- Net point change.
- Repeat action while the run remains active.

The personal ledger lists moves newest first with game, result, stake, and net change.

## Sound

- Sound defaults on.
- Playback starts only after browser user interaction permits an AudioContext.
- Sounds are synthesized with Web Audio oscillators; no sound assets are downloaded.
- Separate patterns exist for wheel, card, dice, slots, win, and loss.
- The visible toggle uses `aria-pressed`.
- Preference is stored locally when storage is available.
- Storage access failures degrade without breaking gameplay.

## Results And Sharing

After a run finishes:

- Active gameplay is hidden.
- Final statistics, achievements, and leaderboard appear.
- A spoiler-free share card summarizes score and game usage.
- The Web Share API is used when available.
- Clipboard copy is the fallback.

## Accessibility And Responsive Behavior

- Target WCAG 2.2 AA.
- Strong visible keyboard focus rings.
- Semantic headings, regions, navigation, complementary bet slip, status ribbon, and labeled controls.
- Selected wager state is communicated through `aria-pressed`, not color alone.
- Exact text accompanies visual results.
- Reduced motion is respected.
- Layout is usable from 320px upward.
- At `820px` and below, the interface becomes single-column with a sticky bet tray.
- At `620px` and below, controls, stages, and betting grids compact further.
