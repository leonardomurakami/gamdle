# Gameplay Specification

## Deterministic Event Model

Rules version is `2`.

The server derives an event by computing:

```text
HMAC-SHA256(DAILY_SEED_SECRET, "<UTC date>|<move>|<table>")
```

Supported table keys are:

- `wheel`
- `cards`
- `dice`
- `slots`

Moves range from `1` through `12`.

The selected wager, stake, animation, timing, sound preference, and prior wagers do not alter the event for a table and move.

Derived events:

| Game | Event |
| --- | --- |
| Roulette | One pocket from `0` through `36`. |
| High Card | Rank `1` through `13` and one of hearts, diamonds, clubs, or spades. |
| Dice Pool | Two independent-looking deterministic faces from `1` through `6`. |
| Lucky Slots | Integer roll from `0` through `1999`, mapped through the selected profile's outcome distribution. |

The server stores the underlying event in wager history. The client receives the resolved event only after the wager transaction commits. Slot responses expose resolved symbols instead of the internal roll.

## House Edge And Settlement

- Theoretical RTP is `0.96`.
- House edge is `0.04`.
- Binary wager gross multiplier is:

```text
multiplier = 0.96 / probability
```

- A losing wager returns `0`.
- A winning wager returns:

```text
floor(stake * multiplier)
```

- Bankroll settlement is:

```text
next bankroll = current bankroll - stake + returned amount
```

- Integer flooring creates a small stake-dependent reduction beyond the theoretical 4% edge.
- Risk labels are:
  - `Common` when probability is at least `40%`.
  - `Risky` when probability is at least `12%` and below `40%`.
  - `Long Shot` below `12%`.

## Roulette

Uses a single-zero European wheel with 37 pockets.

Red pockets:

```text
1, 3, 5, 7, 9, 12, 14, 16, 18,
19, 21, 23, 25, 27, 30, 32, 34, 36
```

Available wagers:

| Wager | Probability | Gross multiplier |
| --- | ---: | ---: |
| Red | `18/37` | `0.96 / (18/37)` |
| Black | `18/37` | `0.96 / (18/37)` |
| Low, 1–18 | `18/37` | `0.96 / (18/37)` |
| High, 19–36 | `18/37` | `0.96 / (18/37)` |
| Exact pocket | `1/37` | `0.96 / (1/37)` |

Pocket `0` is green and loses all listed outside wagers.

## High Card

- Ace is rank `1`.
- Number cards use their numeric rank.
- Jack, Queen, and King are ranks `11`, `12`, and `13`.
- Suits are presentation-only; wager resolution uses rank.

Available wagers:

- `Over T`, where `T` is `1` through `12`.
  - Wins when rank is greater than `T`.
  - Probability is `(13 - T) / 13`.
- `Under T`, where `T` is `2` through `13`.
  - Wins when rank is less than `T`.
  - Probability is `(T - 1) / 13`.

The interface defaults to `Over 7`.

## Dice Pool

Range wagers:

| Wager | Winning totals | Probability |
| --- | --- | ---: |
| Low | 2–6 | `15/36` |
| Exactly 7 | 7 | `6/36` |
| High | 8–12 | `15/36` |

Exact total wagers cover `2` through `12`. Probability is the standard two-dice combination count divided by 36:

```text
ways = 6 - abs(7 - total)
probability = ways / 36
```

## Lucky Slots

The selected profile maps the deterministic slot roll to one outcome. Each profile's probabilities total 100% and expected gross return equals 96%.

Symbol identifiers:

- `cherry` renders as `●`.
- `lemon` renders as `◆`.
- `gem` renders as `✦`.
- `seven` renders as `7`.

### Steady

| Tier | Probability | Multiplier | Symbols |
| --- | ---: | ---: | --- |
| Miss | 28% | `0×` | lemon, seven, gem |
| Pair | 50% | `1.2×` | cherry, cherry, lemon |
| Triple | 20% | `1.5×` | lemon, lemon, lemon |
| Bonus | 2% | `3×` | gem, gem, gem |

### Swing

| Tier | Probability | Multiplier | Symbols |
| --- | ---: | ---: | --- |
| Miss | 66% | `0×` | cherry, gem, seven |
| Pair | 25% | `2×` | lemon, lemon, cherry |
| Triple | 8% | `4×` | cherry, cherry, cherry |
| Bonus | 1% | `14×` | seven, seven, seven |

### Jackpot

| Tier | Probability | Multiplier | Symbols |
| --- | ---: | ---: | --- |
| Miss | 88.5% | `0×` | lemon, cherry, gem |
| Pair | 7% | `2×` | cherry, cherry, seven |
| Triple | 4% | `8×` | gem, gem, gem |
| Bonus | 0.5% | `100×` | seven, seven, seven |
