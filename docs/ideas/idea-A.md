# Idea A: Hanamichi, The Flower Road

## Name and one-line pitch
**Hanamichi** is a roguelike journey along a flower road through four seasons. You beat eight rival gardeners at real Okiya, and winning alone is not enough: each victory has to bloom in the shapes your charms reward.

## Core loop
1. Pick 1 of 3 starting **charms** (scoring talismans).
2. Arrive at a **station** that shows a rival, a petal **target** and 3 lanterns (one lantern per game).
3. Play full Okiya games against the rival's AI. Every win scores **petals**. The tally is shown as `base × mult`, with each charm firing in sequence.
4. Hit the target before your 3 lanterns are spent and you move on: pick 1 of 3 new charms, hold at most 4, and walk to the next station. If you miss, the run ends and you get a pressed-flower summary card.
5. A run is 8 stations, about 20 games and 25–35 minutes. Ten minutes covers roughly 3 stations.

## How Okiya stays intact
| Official rule | Where it lives |
|---|---|
| 16 tiles (4 veg × 4 symbols) in a shuffled 4×4 grid | `newGame(seed)`; seed = hash(runSeed, station, gameIndex) |
| 8 tokens per player | engine, unchanged; shown as stamp counters |
| First move on the border only | `legalMoves`; the UI dims the 4 centre tiles on move 1 whoever starts |
| Must share vegetation or symbol with the last removed tile | `lastTile`, shown in the "constraint tray" beside the board |
| Immediate win: row, column, diagonal or 2×2 square | `findWin`; the game stops at once |
| Win when the opponent is blocked | `applyMove` block check |
| First game random, then the loser starts | game 1 of a station uses a seeded coin toss; after that, the loser starts |
| Victory-points variant (score = tiles left) | **this is the base score of every win** |

Architectural guarantee: charms are pure functions `(finalState, me, ctx) => {add, mult}`. They read the finished game and never touch `legalMoves` or `applyMove`. Every game is a rules-exact Okiya game.

## The new layer
**Petals for a won game** = `(tilesRemaining + Σadd) × (1 + Σmult)`. A lost game scores 0 unless a charm says otherwise.

**Stations** (initial values, to be tuned by simulation):

| # | Season | Target | Rival AI |
|---|---|---|---|
| 1 | Spring | 6 | depth 1, ε 0.30 |
| 2 | Spring | 9 | depth 1, ε 0.15 |
| 3 | Summer | 13 | depth 2, ε 0.15 |
| 4 | Summer | 17 | depth 2, ε 0.05 |
| 5 | Autumn | 22 | depth 3, ε 0.05 |
| 6 | Autumn | 27 | depth 4, ε 0.03 |
| 7 | Winter | 33 | depth 6 |
| 8 | Winter (Okiya Master) | 40 | depth 8 |

ε is the chance the rival plays a random legal move.

**Charms** (12 in the pool; offers never repeat a charm you hold):
- **Crane Scroll**: +1 mult on a diagonal win.
- **Stone Lantern**: +4 on a 2×2 square win.
- **Bamboo Fence**: +3 on a row or column win.
- **Thorn Hedge**: +6 on a blocked win. This rescues 0-tile endgames.
- **Swift Blossom**: +1 mult if you win having placed ≤5 tokens.
- **Morning Sun**: +1 for each Sun tile you took.
- **Rain Chain**: +1 for each of your moves that matched the constraint *by symbol*.
- **Full Suit**: +5 if your taken tiles include all 4 tiles of one vegetation or one symbol.
- **Corner Shrine**: +2 for each corner you hold at the end.
- **Heart Stone**: +1 mult if you hold ≥2 centre cells.
- **Second Wind**: +1 mult if you lost the previous game at this station.
- **Moss Path**: a lost game scores floor(tilesRemaining / 2).

Mult is additive, so four mult charms give at most ×5. This caps runaway combos.

**Progress:** clearing station 8 wins the run. localStorage keeps the best station reached, the runs won, and an **Album** of charms you have discovered. *Winter Road* (targets ×1.25) unlocks after your first win.

## Solo play
You always play against a rival AI: negamax with alpha-beta and a transposition table keyed by (board, lastTile, current). The heuristic is open formations minus the opponent's open formations, plus mobility (the size of the opponent's next legal set). Difficulty comes only from search depth and ε. Okiya's branching factor is at most 6 after move 1, so depth 8 runs well under 100 ms. A **Daily Road** uses a seed built from the date, so everyone gets the same layouts and offers (cuttable). Quick Play against any rival you have already beaten is also cuttable.

## Visual identity
- **Palette:**

  | Colour | Hex |
  |---|---|
  | Washi paper | #F3EAD8 |
  | Sumi ink | #1F1B18 |
  | Vermilion seal (player) | #C8402A |
  | Indigo (rival) | #2E3A6B |
  | Gold leaf | #C9A45C |
  | Maple | #B5452F |
  | Cherry | #E8A3B5 |
  | Pine | #3E6B4F |
  | Iris | #6A5FA8 |

  The paper grain is an SVG `feTurbulence` filter laid over the background.
- **Type:** a system serif stack (Iowan Old Style, Palatino, Georgia) with wide letter-spacing for headings. Station names are set vertically with `writing-mode: vertical-rl`. No web fonts.
- **Tiles:** a rounded square tinted by vegetation, with a simple SVG vegetation glyph (a 5-point maple leaf, a 5-petal cherry blossom, stacked triangles for pine, 3 petals for iris) and a symbol glyph in the corner (sun disc, scroll lines, a three-stroke bird, a cloud with rain dashes). **Tokens** are hanko stamps.
- **Phone:** a header with the station, the target progress bar and 3 lantern icons. Below it the board at `min(92vw, 440px)`, then the constraint tray and a row of charm strips.
- **Desktop:** three columns. Left, the road as a vertical emaki scroll with 8 stations on season bands. Centre, the board. Right, the charms and score ledger.
- **Animation moments:**
  - Legal tiles breathe gold and illegal ones desaturate.
  - A taken tile lifts and slides into the tray.
  - The stamp lands with a 1.25→1 scale and a quick ink-bleed blur.
  - The winning line is painted with a brush-stroke SVG path (`stroke-dashoffset`).
  - The score tally counts up charm by charm while petals drift down.
  - The road lantern walks to the next station.

## Scope estimate (about 90 minutes)
1. `ai.ts`: negamax, transposition table, levels (15 min)
2. Board view: SVG tiles, highlights, click handling, 400 ms AI delay (25 min)
3. `charms.ts`: 12 pure scorers plus a breakdown (10 min)
4. `run.ts`: run state machine (station, lanterns, petals, charms, seeded RNG) saved to localStorage (12 min)
5. Screens: road and station intro, charm draft, game result tally, run over (18 min)
6. Polish (10 min). These parts can be cut: brush stroke, falling petals, the desktop 3-column layout (the centred phone layout works fine on desktop), Daily Road, Album, Winter Road.

## Risks / open questions
- **Charms might not change play.** If "just win fast" is always optimal, this is Okiya with a scoreboard.
- **Some charms may trigger too rarely to be worth picking.** Crane Scroll and Full Suit are the likely ones.
- **The top rivals may be unbeatable.** Perfect play may give a forced win for the first player on many layouts.
- **Wins late in the garden give a low base,** so targets could be too punishing.
- **Second Wind and Moss Path could reward deliberate losing** (an exploit).

## Simulation plan
Run headless Node simulations with `tsx scripts/simulate.ts` and seeded RNG. Reuse the engine and the rival AI.

**Player proxies:**
- **Blind-2:** depth 2, maximises wins only.
- **Charm-2:** depth 2; terminal nodes are valued at expected petals instead of ±1.
- **Charm-4:** the same at depth 4.

**Draft policies:** random, or greedy by measured average value.

Run 5,000 full runs per proxy × policy, plus 20,000 single games per rival level.

| Metric | Good | Bad |
|---|---|---|
| Run completion, Charm-2 | 10–25% | >50% or <3% |
| Run completion, Charm-4 | 40–60% | — |
| Conditional clear rate per station | declines smoothly; every station ≥40% | any station <30% (a wall) |
| Charm-2 petals vs Blind-2 | ≥ +25% | < +10% |
| Moves where Charm-2's best move differs from Blind-2's | 10–30% | <5% (charms are cosmetic) or >50% |
| Run win rate when holding a given charm | 0.67–1.5× the mean | outside that band; also flag any charm that fires in <20% of won games while held |
| Rival ladder | proxy win rate drops at every level | not monotonic |
| First-player win rate per level | 45–65% | outside that band |
| Exploit: always throw game 1 when holding Second Wind or Moss Path | gives no gain | beats normal play |
| Speed: depth-8 move time in Node | p95 < 150 ms | — |

Tune the targets and ε until every row is green, then freeze the numbers into `stations.ts`.
