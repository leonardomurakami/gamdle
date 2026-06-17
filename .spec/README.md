# Gamdle Specifications

This folder describes the implemented Gamdle v0.1 system. The code remains the executable source of truth; these documents capture its intended behavior and current contracts.

## Documents

- [product.spec.md](product.spec.md): product purpose, daily flow, boundaries, results, and achievements.
- [gameplay.spec.md](gameplay.spec.md): deterministic outcomes, wager rules, RTP, payouts, and all four games.
- [authentication.spec.md](authentication.spec.md): passwordless login, sessions, account changes, deletion, and security controls.
- [api-data.spec.md](api-data.spec.md): HTTP endpoints, response contracts, persistence model, migrations, and configuration.
- [frontend.spec.md](frontend.spec.md): interface structure, interaction state machine, animations, sound, responsive behavior, and accessibility.
- [verification.spec.md](verification.spec.md): automated and browser verification completed for the current implementation.

## System Summary

Gamdle is a passwordless daily probability game using fictional points only. Each account receives one UTC-dated run with:

- A starting bankroll of `1,000` points.
- A maximum of `12` global moves.
- Four games sharing the same bankroll.
- A deterministic event for each `(UTC date, move, game)`.
- A theoretical `96%` return to player and `4%` house edge.
- Termination at zero, after move 12, or when the player leaves.

There is no money, purchase, prize, transfer, redemption, or optimal-route reveal.
