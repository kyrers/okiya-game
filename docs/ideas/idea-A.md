# Idea A: Hanamichi, The Flower Road

## Name and one-line pitch
**Hanamichi** is a roguelike walk through four seasons of gardens. You beat eight rival gardeners at real Okiya, but a win only counts if it blooms the way your charms reward.

## Core loop
1. Pick 1 of 3 starting **charms** (scoring talismans).
2. Arrive at a **station**: a rival, a petal **target**, and 3 lanterns (= 3 games).
3. Play full Okiya games against the rival's AI. Each win scores **petals**, tallied as `base × mult` with every charm firing in turn.
4. Reach the target before the lanterns run out to move on: draft 1 of 3 charms (hold at most 4) and walk on. Miss it and the run ends with a pressed-flower summary card.

A run is 8 stations, about 20 games, about 30 minutes. Ten minutes covers roughly 3 stations.

## How Okiya stays intact
| Official rule | Where it lives |
|---|---|
| 16 tiles shuffled into a 4×4 grid; 8 tokens each | `newGame(seed)`, seed = hash(run, station, game) |
| First move on the border only | `legalMoves`; centre tiles dimmed on move 1 |
| Share vegetation or symbol with the last tile | `lastTile`, shown in the constraint tray |
| Instant win: row / column / diagonal / 2×2, or block | `findWin` and the block check in `applyMove` |
| First game random, then the loser starts | seeded coin toss for game 1 at a station; loser starts after that |
| Victory points = tiles left | **the base score of every win** |

Guarantee: charms are pure functions `(finalState, me, ctx) => {add, mult}`. They read the finished game and never touch `legalMoves` or `applyMove`.

## The new layer
**Petals for a won game** = `(tilesRemaining + Σadd) × (1 + Σmult)`. A loss scores 0. Mult is additive, so the ceiling is ×5.

**Stations.** The targets are starting values for tuning. ε is the chance the rival plays a random legal move.

| Station | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Season | Spring | Spring | Summer | Summer | Autumn | Autumn | Winter | Winter |
| Target | 6 | 9 | 13 | 17 | 22 | 27 | 33 | 40 |
| AI depth | 1 | 1 | 2 | 2 | 3 | 4 | 6 | 8 |
| ε | .30 | .15 | .15 | .05 | .05 | .03 | 0 | 0 |

**Charms** (pool of 12; offers never repeat one you hold):
- **Crane Scroll**: diagonal win, +1 mult.
- **Stone Lantern**: 2×2 win, +4.
- **Bamboo Fence**: row or column win, +3.
- **Thorn Hedge**: blocked win, +6. This rescues 0-tile endings.
- **Swift Blossom**: won with ≤5 tokens placed, +1 mult.
- **Morning Sun**: +1 for each Sun tile you took.
- **Rain Chain**: +1 for each of your moves that matched the constraint *by symbol*.
- **Full Suit**: +5 if you took all 4 tiles of one vegetation or one symbol.
- **Corner Shrine**: +2 for each corner you hold.
- **Heart Stone**: holding ≥2 centre cells, +1 mult.
- **Second Wind**: lost the previous game at this station, +1 mult.
- **Moss Path**: a loss scores floor(tilesRemaining/2).

**Progress.** Clear station 8 to win the run. localStorage keeps the best station, the runs won, and an **Album** of discovered charms. Winning once unlocks *Winter Road* (targets ×1.25).

## Solo play
Every game is against a rival AI: negamax with alpha-beta and a transposition table keyed by board + lastTile + side to move. The heuristic is my open formations minus theirs, plus the opponent's next-move count. Depth and ε set the difficulty. With at most 6 options after move 1, depth 8 runs in under 100 ms. A **Daily Road** seeded by the date gives everyone the same layouts and offers (cuttable).

## Visual identity
- **Palette:**

  | Role | Colour |
  |---|---|
  | Paper | washi #F3EAD8 |
  | Ink | sumi #1F1B18 |
  | Player | vermilion seal #C8402A |
  | Rival | indigo #2E3A6B |
  | Accent | gold #C9A45C |
  | Maple | #B5452F |
  | Cherry | #E8A3B5 |
  | Pine | #3E6B4F |
  | Iris | #6A5FA8 |

  Paper grain comes from an SVG `feTurbulence` filter.
- **Type:** a system serif stack (Iowan Old Style, Palatino, Georgia) with spaced capitals. Station names are set vertically (`writing-mode: vertical-rl`). No web fonts.
- **Tiles:** rounded squares tinted by vegetation, with SVG glyphs for vegetation (leaf, 5-petal blossom, stacked triangles, 3-petal iris) and symbol (sun disc, scroll lines, 3-stroke bird, rain cloud). Tokens are hanko stamps.
- **Phone:** header (station, target bar, 3 lanterns), then the board at `min(92vw,440px)`, the constraint tray, and a row of charm strips.
- **Desktop:** the road as a vertical emaki scroll on the left, the board in the centre, charms and the ledger on the right.
- **Animation moments:**
  - Legal tiles breathe gold; illegal ones desaturate.
  - A taken tile slides into the tray.
  - The stamp lands with a 1.25→1 scale and an ink-bleed blur.
  - The winning line is painted on with a brush stroke (`stroke-dashoffset`).
  - The score counts up charm by charm while petals drift.
  - The lantern walks the road to the next station.

## Scope estimate (about 90 minutes)
1. `ai.ts`: negamax, transposition table, levels (15 min)
2. Board view: SVG tiles, highlights, input, 400 ms AI delay (25 min)
3. `charms.ts`: 12 scorers plus a breakdown (10 min)
4. `run.ts`: run state machine with seeded RNG, saved to localStorage (12 min)
5. Screens: station intro, charm draft, result tally, run over (18 min)
6. Polish (10 min)

**Cuttable:** brush stroke, petals, the 3-column desktop layout (the centred phone layout works on desktop), Daily Road, Album, Winter Road.

## Risks / open questions
- **"Just win fast" might dominate,** making charms cosmetic.
- **Rare charms** (Crane Scroll, Full Suit) may be dead picks.
- **The depth-8 rival may be unbeatable** if perfect play forces wins for the first player.
- **Late wins** leave little base score, so the targets may be too steep.
- **Second Wind and Moss Path** might reward throwing games.

## Simulation plan
`tsx scripts/simulate.ts`, seeded, reusing the engine and the rival AI.

Player proxies:
- **Blind-2:** depth 2, plays to win only.
- **Charm-2:** depth 2, scores end positions by expected petals instead of win/loss.
- **Charm-4:** the same at depth 4.

Draft policies: random or greedy. Run 5,000 runs per combination and 20,000 games per rival level.

| Metric | Good | Bad |
|---|---|---|
| Run win rate, Charm-2 | 10–25% | >50% or <3% |
| Run win rate, Charm-4 | 40–60% | — |
| Clear rate per station | smooth decline, every station ≥40% | any <30% (a wall) |
| Charm-2 petals vs Blind-2 | ≥ +25% | < +10% |
| Moves where Charm-2's choice differs from Blind-2's | 10–30% | <5% or >50% |
| Run win rate holding a given charm | 0.67–1.5× the mean | outside the band; or the charm fires in <20% of wins while held |
| Win rate vs each rival level | falls at every level | — |
| First-player win rate | 45–65% | — |
| Exploit: throwing game 1 with Second Wind or Moss Path | no gain | beats normal play |
| Depth-8 move time | p95 < 150 ms | — |

Tune the targets and ε until every row passes, then freeze them in `stations.ts`.
