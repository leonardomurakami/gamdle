# Product Specification

## Purpose

Gamdle is a short daily competition for people who enjoy probability, risk decisions, and comparing outcomes. Every player encounters the same hidden daily event landscape while independently choosing a game, wager, stake, and stopping point.

The casino presentation is an electronic arcade betting floor. It borrows the tension and visual language of betting products without involving money or anything redeemable.

## Daily Run

- Accounts are required before play.
- The daily date is the current UTC date.
- Each account has at most one run for a date.
- A new run starts at `1,000` fictional points and move `0`.
- All four games use the same bankroll.
- Each committed wager consumes the next global move.
- The player may change games freely before committing a wager.
- The player may wager any whole number from `1` through the current bankroll.
- Presets provide `10%`, `25%`, `50%`, and all-in stakes.
- The run ends when:
  - The bankroll reaches `0`, with status `broke`.
  - Move `12` resolves, with status `complete`.
  - The player confirms leaving, with status `left`.
- A finished run is immutable and cannot be resumed.

## Competition

- Rank is based on final bankroll.
- Leaderboard data is returned only after the current run is finished.
- Equal bankroll values are grouped with their player count.
- The results view shows:
  - Final bankroll.
  - Difference from the starting bankroll.
  - Percentile among finished players.
  - Number of finished players.
  - Percentage of finished players who reached zero.
  - Achievement collection.
  - Top bankroll groups for the day.
- The share text contains the date, final bankroll, and number of moves.
- Sharing never includes hidden future events or an optimal route.
- The system never calculates or exposes an optimal route to players.

## Achievements

Achievements persist permanently per account and award no gameplay advantage.

| Key | Name | Condition |
| --- | --- | --- |
| `snake_eyes` | Snake Eyes | A played Dice Pool event totals 2. |
| `against_all_odds` | Against All Odds | Win a wager whose selected outcome probability is at most 5%. |
| `phoenix` | Phoenix | Fall below 50 points, then later rise above 1,000. |
| `exact_change` | Exact Change | Finish with exactly 1,000 points. |
| `golden_run` | Golden Run | Win five resolved wagers consecutively. |
| `last_minute_miracle` | Last-Minute Miracle | On a 12-move run, move 12 is a positive win tied for the run's largest net gain. |

Achievements are inserted idempotently. The first unlock date and timestamp are retained.

## Product Boundaries

- Points cannot be purchased, transferred, redeemed, or exchanged.
- No cash prizes or material rewards exist.
- Progression is limited to history, standings, and achievements.
- Odds and possible gross returns are displayed before commitment.
- The interface must not show hot/cold tables, “due” outcomes, or misleading predictive signals.
- Stopping early is treated as a valid result.
