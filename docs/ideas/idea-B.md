# Idea B — Okiya Koi-Koi

## Name and one-line pitch

**Okiya Koi-Koi**: win the garden with your seals and the evening with the tiles you took. When your hand blooms, call *Koi-Koi* to double the stakes.

## Core loop

An "Evening" is a race to **30 mon** (points) against one AI rival, usually 4–6 Okiya games of about 2 minutes each. Every tile you remove goes face up into your **hand**, where Hanafuda-style sets (*yaku*) light up. You read the board and your hand at once. Completing a yaku lets you call **Koi-Koi**: the rival must accept double stakes or fold. The winner of each game scores, and the loser starts the next.

## How Okiya stays intact

| Official rule | Where it lives |
|---|---|
| 16 tiles shuffled into a 4x4 grid | `newGame(seed)`, unchanged |
| First move on the border only | `legalMoves`, unchanged; centre cells shown as locked |
| Share vegetation or symbol with the last tile taken | `legalMoves`, unchanged; the last tile is the large "constraint" card |
| Tile replaced by the mover's token | `applyMove`, unchanged |
| Row/column/diagonal, 2x2 square, or blocking | `applyMove`, unchanged; the **only** board wins |
| Victory points = tiles left in the garden | Part of the game score |
| Loser starts the next game | Kept |

The layer adds one thing only: a concession (fold), allowed only in answer to a Koi-Koi call.

## The new layer

**Hand.** Each player keeps their own removed tiles. The constraint is still the last tile played.

**Yaku** are checked after each of your moves; each counts once per game.

| Yaku | Condition | Mon |
|---|---|---|
| Four Seasons (*Shiki*) | 4 tiles in your hand, all with different vegetations **and** different symbols | 3 |
| Grove (*Mori*) | All 4 tiles of one vegetation | 5 each |
| Weather (*Tenki*) | All 4 tiles of one symbol | 5 each |

The chain rule makes Grove and Weather hard. If two of your consecutive picks share a vegetation, the rival's pick in between must have it too. To collect all four, you have to space your picks out and read the chain ahead.

**Game score (winner only):** `(3 + tiles left in garden + winner's yaku) x stake`. The loser scores 0. A quick win leaves more garden tiles; a long game builds a bigger hand. A "Worth now" ticker shows what a win would pay right now.

**Koi-Koi.** You may call it right after a move that completes a new yaku, as long as that move did not end the game. Each player can call at most once per game. The opponent must choose:

- **Accept:** the stake doubles (x1 → x2 → x4) and play continues.
- **Fold:** the caller scores `(3 + caller's yaku) x current stake`. Garden tiles are **not** paid on a fold; they only reward real board wins. The folder starts the next game.

As with a backgammon cube, accepting is right whenever your chance to win is above about 25%. That makes AI calls real decisions for you.

## Solo play

There are three rivals, unlocked in order. Each one pairs an existing `DIFFICULTY` preset with a Koi temperament:

- **Apprentice** (`novice`): always calls and never folds.
- **Gardener** (`apprentice`): calls at a win chance of 0.60 or more, and accepts at 0.25 or more.
- **Okami** (`master`): calls at 0.55, accepts at 0.22, and bluffs 10% of the time so its calls don't reveal forced wins.

**Win chance:** if `chooseMove` proves a forced result, the AI uses 1 or 0. Otherwise it runs 40 playouts at depth 2.

**Moves:** the AI re-ranks the root scores from `chooseMove`, so ties go to the move with the most yaku progress.

localStorage keeps unlocks and your best margins.

## Visual identity

The look is Hanafuda cards on washi paper.

- **Colours:** paper `#F4ECDD` with `feTurbulence` grain, ink `#1E1B18`, red `#C8312B`, gold `#C9A23F`. Maple `#D2552E`, cherry `#E9A6B8`, pine `#2F5E4A`, iris `#4B4E9C`.
- **Tiles:** black-bordered SVG cards. A coloured field with a flat motif shows the vegetation. An emblem shows the symbol: sun disc, *tanzaku* poem strip, swallow, or rain cloud.
- **Tokens:** hanko seals, vermilion for you and ink black for the rival.
- **Type:** *Shippori Mincho* (with a serif fallback) for scores and banners; system sans-serif for UI text.
- **Phone layout:** one column. Top to bottom: scores and the sake-cup stake, the rival's hand as a thin fan, the constraint card with a "maple or rain" pill, the board at `min(92vw, 440px)`, then your fanned hand with chips such as "Mori: Pine 3/4". Decisions appear in a bottom sheet.
- **Desktop layout:** three columns (rival, board, you), with a 30-coin race track underneath.
- **Animations:**
  - Legal tiles pulse gold; illegal ones desaturate.
  - A taken tile flies to its owner's hand while the seal stamps down (scale 1.4→1, slight tilt).
  - A completed yaku draws a gold brush underline (`stroke-dashoffset`).
  - Koi-Koi dims the screen, stamps a red seal and flips the cup to show the new stake.
  - A formation win draws a gold brush stroke through the four seals.

## Scope estimate (about 95 minutes, cut down to 90)

1. `engine/koikoi.ts`, pure with tests: yaku detection (Four Seasons by brute force over the 24 permutations), Koi and fold state, scoring, match. **15 min**
2. `engine/koiAi.ts`: yaku tie-break, win-chance estimate, thresholds. **15 min**
3. SVG tile renderer (4 motifs and 4 emblems). **15 min**
4. Game screen: board, hands, constraint, ticker, score track, Koi sheet, tallies. **30 min**
5. CSS theme and animations. **10 min**
6. Rival selection and localStorage. **5 min** *(cuttable: use a difficulty dropdown)*
7. Koi-Koi mode in `scripts/simulate.ts`. **10 min**

**Cut first:** the tile-flight animation (use a fade), Okami's bluffing, unlocks.

## Risks / open questions

- **Yaku frequency.** Existing simulations average 12–15 moves per game, so hands hold 6–8 tiles. Four Seasons may be nearly automatic.
- **Fake decision.** If "always call Koi" is as good as calling selectively, the layer adds nothing.
- **Folds.** Too many concessions would crowd out Okiya's own endings.
- **Snowballing.** Simulations show the first mover wins only 37–45%, so "loser starts" hurts the loser twice. A x4 game could also decide a whole match.
- **Mental load.** Players read the board and their hand together; the yaku chips must carry this.

## Simulation plan

Extend `scripts/simulate.ts` and run 5,000 Evenings per pairing at depth 2 and 4 (blunder 0.1), plus 300 at master level.

**Policies:**

- **Move choice:** Board (ignores yaku) vs Collector (adds λ × yaku progress to moves within δ of the best).
- **Calling:** never / always / threshold.
- **Answering a call:** always accept / accept at 0.25 or more / always fold.

| Metric | Good | Bad → fix |
|---|---|---|
| Winner holds ≥1 yaku | 45–70% | >85% → Four Seasons must include the last tile taken |
| Grove or Weather made | 10–25% of games | <5% → "3 of a kind, 3 mon" |
| Games ending in a fold | 5–15% | >20% → fold pays +2 |
| Threshold calling vs never calling (match wins) | +4–10 pp | ≤1 pp, or always calling does as well → stake step x1.5 |
| Collector vs Board | 2–6 pp fewer games won, but ≥52% of matches | also wins more games → yaku come free |
| Match length | median 4–6 games | retune the 30-mon target |
| Match decided by one game | <5% | cap stake at x2 |
| Comeback (≥10 mon behind after game 2, still wins) | ≥20% | lower the base of 3 |
