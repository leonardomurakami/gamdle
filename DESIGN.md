# Gamdle Design System

## Direction

An electronic arcade betting floor after dark: saturated green game stages, orange payout signals, physical table objects, compact odds, and a persistent bet slip. The active game is always the visual center.

## Color

- Background: `oklch(0.12 0 0)`
- Surface: `oklch(0.18 0.018 150)`
- Raised surface: `oklch(0.23 0.025 150)`
- Primary: `oklch(0.66 0.17 150)`
- Primary strong: `oklch(0.53 0.15 150)`
- Accent: `oklch(0.78 0.17 65)`
- Ink: `oklch(0.97 0.005 150)`
- Muted: `oklch(0.76 0.025 150)`
- Danger: `oklch(0.65 0.2 28)`

## Typography

Use the system sans stack. Numbers use tabular figures. Headings are compact and heavy; labels remain sentence case. Interface text never uses decorative display faces.

## Components

Controls use 10px radii, visible 3px focus rings, and 180ms state transitions. Selected table panels use a primary outline without a wide shadow. Buttons use filled primary color for commitment and neutral surfaces for secondary actions.

## Layout

Desktop uses a compact scoreboard, game tabs, a large animated stage, and a sticky bet slip. Mobile keeps the stage first and turns the slip into a sticky bottom tray. Content remains usable at 320px.

## Motion

Each committed wager receives an approximately two-second physical reveal. Roulette spins, cards flip, dice roll, and slot reels stop sequentially. Results can be skipped after 500ms. Reduced motion uses immediate settled states.
