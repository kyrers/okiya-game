# Idea C: Lantern Street

## Name and one-line pitch
**Lantern Street**: a four-season gauntlet against rival geisha houses. Each rival has a playstyle you can read and one *kanzashi* (hairpin power). She uses it on you first; beat her and it's yours.

## Core loop
You open the link to a street at night with four unlit lanterns. Tap Spring and Haru of House Sakura bows in. You play a best-of-3 duel of real Okiya, about 90 seconds per game. You watch her spend her Parasol to guard the tile she needs, then bait it next game. When you win, her lantern lights and the Parasol flies into your tray. Ten minutes covers about two duels: read a rival, exploit her, gain a power, face a stronger rival.

## How Okiya stays intact
- **Shuffled 4x4 garden of 16 tiles:** `newGame(seed)`.
- **Border-only first move:** `legalMoves` when `lastTile === null`.
- **Shares vegetation or symbol:** every move comes from `legalMoves(state)`. A kanzashi can only *remove* options from that set, never add one.
- **Row, column, diagonal or 2x2 win:** `applyMove` → `findWin`.
- **Blocked win:** decided by `applyMove` under the official constraint. A kanzashi that would leave the opponent with zero moves cannot be played, so it can never create a block.
- **First game random, then loser starts:** a seeded coin flip, then `recordGame().nextFirst`.
- **Victory points (tiles left):** these become the season score.

**Invariant (unit-tested):** every game record replays move for move through the unmodified engine with the same result. `okiya.ts` is never edited.

## The new layer
**Kanzashi** can each be used once per game, at most one per turn:
- **Parasol:** after your move, shade one tile the opponent could legally take. They can't take it next turn.
- **Whisper:** after your move, declare *vegetation* or *symbol*. The opponent's next tile must match yours on that attribute only.
- **Lantern:** before your move. For the player, each legal tile is marked gold if it wins, red if it gives the rival an instant win, or with the number of replies it leaves. For an AI, it searches to the end of the game for this move.

Parasol and Whisper are greyed out whenever they would leave the opponent with zero moves.

**Rivals** share one negamax search with alpha-beta pruning. A personality is a search depth, eval weights, some noise, and a threshold for when she uses her kanzashi.

| Season | Rival | Style you can read | Search | Kanzashi |
|---|---|---|---|---|
| Spring | Haru, *the Eager* | Extends her longest line and uses the Parasol at her first chance | depth 2, 20% picks her second-best move | Parasol |
| Summer | Natsu, *the Mirror* | Takes the cell opposite your last move through the centre (15−i) whenever that is legal and doesn't lose in 1 | else depth 3 | Lantern |
| Autumn | Aki, *the Wall* | Cuts down your legal moves and hunts blocks; saves the Whisper until it forces a win | depth 4, values legal-move count | Whisper |
| Winter | Okasan, *the Matron* | Balanced and patient | depth 6 | Parasol + Whisper |

**Eval:** each of the 19 formations with no enemy token in it scores `[0,1,4,16][own tokens]`, minus the same for the opponent. Aki adds 3 × (her legal-move count − yours). A won game scores ±(1000 + tiles left), so rivals prefer fast wins.

**Season**
- A duel is first to 2 game wins. Winning a duel gives you that rival's kanzashi for the rest of the season, and every kanzashi you've earned is available in every game. You reach Okasan holding three; she holds two.
- You start with **2 Favors**. Losing a duel spends one and replays the duel from 0-0. If you lose with no Favors left, the season ends.
- **Score** = tiles left at each game you won, summed, plus 5 for each unspent Favor if you clear the season. localStorage keeps your best score, furthest season and number of clears (cleared lanterns stay lit on the title screen).

## Solo play
It's fully single-player, and the season is the difficulty curve. Each rival has an exploit you can learn:
- Haru's eager Parasol can be baited.
- Natsu's mirror can be steered.
- Aki undervalues 2x2 squares.

**Practice** replays any lit lantern without Favors or score. Seasons are seeded, so a link with `#season=4821` gives everyone the same gardens.

## Visual identity
- **Palette:** night indigo `#1b1f3a`, washi paper `#f3ead8` tiles, vermilion `#d2452c` for lanterns and your tokens, gold `#c9a54c` accents. Vegetations: maple `#b5332e`, cherry `#e8a0b4`, pine `#3f6b4a`, iris `#6a5acd`.
- **Tiles:** the vegetation is a tinted band with an SVG leaf in the corner. The symbol is a bold ink glyph in the centre (sun disc, scroll, bird chevron, rain cloud). Keeping the two apart makes Whisper readable: the unchosen half of the last-taken tile desaturates.
- **Tokens:** lacquer discs with SVG *mon* crests. Yours is a ring; each rival has her house crest (sakura, iris, maple leaf, wisteria).
- **Type:** system Mincho fonts (`"Hiragino Mincho ProN","Yu Mincho",Georgia,serif`) for names and system sans for the UI. No external requests.
- **Phone layout:** rival banner (crest, name, kanzashi, one speech line), then a square board at `min(92vw,440px)`, then a tray with the last-taken tile and your kanzashi.
- **Desktop layout:** three columns: rival panel, board, season lanterns.
- **Animation:**
  - A taken tile slides onto the pile of taken tiles, and tokens stamp down with an ink ring.
  - Legal tiles glow softly.
  - Parasol drops an SVG umbrella; Lantern sweeps a warm glow across the board.
  - A brush stroke (`stroke-dashoffset`) draws through a winning formation.
  - Winning a duel lights the rival's lantern, and her hairpin flies to your tray.

## Scope estimate
1. `kanzashi.ts`: restriction type, `restrictedMoves`, the zero-moves check, once-per-game flags. **10 min**
2. `ai.ts`: negamax with alpha-beta, eval, four personalities, kanzashi choices considered only for the immediate move, a 150k-node cap. **25 min**
3. `season.ts`: duel and season state, Favors, score, localStorage. **10 min**
4. UI: board, SVG glyphs, tokens, rival banner, tray, title street. **35 min**
5. Animations plus the replay test. **10 min**

**Cuttable, in order:** Lantern (Natsu keeps only her mirror), speech lines, Practice, brush stroke, seed hash. The UI is the real risk; a plain playable season should be ready by about minute 60.

## Risks / open questions
- Late in a game, Whisper can leave the opponent one reply and make the win automatic. The fix would be to allow it only while 6 or more tiles remain.
- First-player advantage could matter more than personality.
- Okasan could be unbeatable, or too slow on phones.
- Kanzashi could be irrelevant, or could decide nearly every game.
- Natsu's mirror may be a free win.

## Simulation plan
A headless Node script runs seeded gardens.
- **Player stand-ins:** P1 (depth 1, 30% noise), P3 (depth 3) and P6 (depth 6). Each holds the kanzashi a player would have at that point in the season.
- **Volume:** 2,000 duels per stand-in/rival pair, plus paired runs on the same seeds with each kanzashi disabled.

| Metric | Good | Bad / action |
|---|---|---|
| Rival duel win rate vs P3 | Haru 25–35%, Natsu 40–50%, Aki 50–60%, Okasan 65–75% | Outside the band: retune depth or noise |
| Okasan vs P6 | ≤ 55% | > 65%: lower her depth |
| P3 season clear rate | 20–40% | < 10% or > 60% |
| Win-rate gain from each kanzashi (paired) | +5 to +15 points | > 25: nerf; < 2: redesign |
| Games where a kanzashi is used | ≥ 70% | < 40%: dead weight |
| Paired games whose winner changes | 10–25% | > 40%: too decisive |
| First player's single-game win rate | 45–60% | > 65%: the player opens game 1 |
| Moves per game / share of blocked wins | 9–13 / 15–35% | Blocked > 50%: Aki too strong |
| AI nodes per move (95th percentile) | ≤ 150k | Above that: lower depth |
| Replay invariant | 100% | Anything less is a bug |
