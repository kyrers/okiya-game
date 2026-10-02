# Okiya rules review

Independent audit, 2026-10-02. Scope: does every game in this app play the official Okiya (Niya), and does
the Hanamichi layer (charms, Paper Lantern / Firefly, stations, run) leave move legality and game outcomes alone?

- **Baseline audited:** commit `bb2279e` (HEAD). Line numbers below refer to that commit.
- **Other edits during the audit:** while I worked, another session had uncommitted edits in progress
  (Paper Lantern renamed to Firefly in `hints.ts`/`run.ts`/tests, a `cellBadge` option in `board.ts`, art
  and CSS). I checked them: they change no logic. I re-ran the invariant script against them and it still passed.
- **Primary source:** the Blue Orange *Okiya Print & Play* PDF (4 pages). I read the extracted text and rendered
  pages 1, 3 and 4 so I could look at the rules page and the tile sheets myself.

## Summary verdict

**Yes, with caveats.** The engine applies every rule the PDF states, and none of my checks found a violation.
Every game is created by `newGame`, and every move, human or AI, passes through `legalMoves` and `applyMove`. The
new layer only reads finished games or computes information. It cannot change which tiles are legal or who wins.
Note that the illegal-click test drove a headless browser and did not cover every human turn.

**Main caveat.** The PDF does not say what happens when the last tile is taken without a formation. The engine
counts it as a "blocked" win for the player who took the 16th tile, so the second player always wins it. A
secondary source says the game is a tie. How common this ending is depends on the strength of play:

| Play strength | Games ending with a full garden |
|---|---|
| Random play | 13% |
| Depth-4 AI against depth-4 AI | 62% |

So this one interpretation decides most games between strong players. The project docs present it as an
official rule ("there are no draws") when it is an interpretation. See Finding 1.

## Tile set (checked against the PDF art)

The PDF text lists the symbols as "Rising sun, Poem, Bird, Rain or Cloud". The tile sheets settle the question:

- **Page 3** has 8 tiles. Four are bird tiles, one per vegetation. The other four each show **clouds and rain
  together**, again one per vegetation.
- **Page 4** has 8 tiles: four rising-sun tiles and four poem tiles, one per vegetation.

That makes 16 tiles: 4 vegetations × 4 symbols, with "rain or cloud" a single symbol. This is exactly what the
engine's `VEGETATIONS × SYMBOLS` produces (`maple/cherry/pine/iris` × `sun/poem/bird/rain`).

## Rule-by-rule table

| # | Rule (from the PDF) | Where implemented | How I verified it | Status |
|---|---|---|---|---|
| 1 | 16 tiles: 4 vegetations × 4 symbols ("Rain or Cloud" is one symbol) | `src/engine/okiya.ts:26-27, 78-82` | Counted the tiles on the rendered PDF pages 3–4 (above). Tested that `allTiles()` gives 16 distinct tiles. | OK |
| 2 | Shuffle the tiles and lay them face up in a 4×4 square | `okiya.ts:143-150` (Fisher–Yates), `171-173` | Over 2,000 seeds, every garden was a permutation of the 16 tiles. Over 160,000 seeds, each tile appeared in cell 0 between 9,820 and 10,169 times (10,000 expected). | OK (but see Finding 7) |
| 3 | 8 tokens per player | `okiya.ts:70, 244-246` (follows from alternating turns) | In more than 100,000 games, no player ever had more than 8 tokens on the board, and `tokensInHand` always matched the board. | OK |
| 4 | First game: the first player is chosen at random | `src/game/run.ts:64` | In 400 runs, the human opened the first game 203 times. | OK (`newMatch` defaults to P1, Finding 6) |
| 5 | Later games: the loser of the previous game starts | `run.ts:131` (`finishGame`), `okiya.ts:287` (`recordGame`) | 802 game-to-game transitions in full runs: each new game's `current` was the previous loser. Also covered by unit tests. | OK |
| 6 | First move: outside border only; the 4 middle tiles are forbidden on the first turn | `okiya.ts:73-75, 186-187` | The unit tests check the exact move lists. My script compared every state against an independent reference. In 20,000 games, `applyMove` threw on every illegal index at every state. | OK |
| 7 | The removed tile is replaced by a token and becomes the new constraint | `okiya.ts:216-231` | Script: `lastTile` is always the tile just removed, and history alternates players starting with `first`. | OK |
| 8 | Each later move must share the vegetation OR the symbol of the tile just removed | `okiya.ts:88-91, 188-189` | `legalMoves` equalled my reference at every state of 100,000 random games and 300 AI games. | OK |
| 9 | Win with a row, column or diagonal of 4 | `okiya.ts:116-121, 199-205` | Exhaustive: `findWin` matched my reference on all 65,536 token subsets of the board. There are exactly 4 rows, 4 columns and 2 diagonals. | OK |
| 10 | Win with a 2×2 square | `okiya.ts:122-127` | Same exhaustive check. There are exactly 9 squares, 19 formations in total. | OK |
| 11 | Win by blocking: the opponent cannot move | `okiya.ts:237-239` | Script: a `blocked` win is declared exactly when no formation was made and the reference legal set for the opponent is empty. A live game never has an empty legal set. | OK |
| 12 | The game stops when a winning condition is reached | `okiya.ts:181, 217` | Script: after a win, `legalMoves` is empty and `applyMove` throws. The opponent never already had a formation when the mover won. Every game had exactly one winner. | OK |
| 13 | Last tile taken without a formation | `okiya.ts:237-239` (treated as "blocked") | The PDF says nothing. A secondary source says tie. The engine always gives the win to the second player. | **Doubtful** (Finding 1) |
| 14 | Victory points = garden tiles left in the garden | `okiya.ts:232-238`, `276` | Script: `tilesRemaining` equalled the tile count after the winning move in every game. | OK |
| 15 | Single game | `okiya.ts:278` | Unit test | OK (engine only; the app never uses it) |
| 16 | Match in three sets: first to 3 won games | `okiya.ts:279` | Unit test | OK (engine only) |
| 17 | Victory-points match: first to 10 points (15 or 20 for longer matches) | `okiya.ts:250, 280` | Unit test for 10. Targets of 15 and 20 are not implemented. | Partial (Finding 4) |
| 18 | The AI only plays legal moves | `src/engine/ai.ts:189, 192-195, 214-215` | 300 AI games at every station and difficulty setting. Each choice was checked against the reference legal set. All moves are picked from `legalMoves`. | OK |
| 19 | The UI cannot play an illegal tile | `src/ui/board.ts:19, 32, 43-53`; `src/ui/app.ts:142-152` (`humanMove`) | There are three guards: only engine-legal cells get `.legal`; the click handler needs `.cell.legal`; `humanMove` re-checks `legalMoves`. In headless Chrome (isolated profile), 53 forced clicks on non-legal cells were all ignored. On every human turn, the highlighted cells equalled the reference legal set. | OK |
| 20 | Charms only read finished games | `src/engine/charms.ts:57-74, 203-214` | Run on frozen states with a JSON snapshot compared before and after. Petals were always `(3 + win.tilesRemaining + add) × (1 + mult)` for the winner and 0 for the loser. | OK |
| 21 | Paper Lantern and other hints are information only | `src/game/hints.ts` | Checked on 3,850 states. Hints only ever mark legal cells, and win/danger/safe matched my reference. Nothing was mutated, and no hint class adds `legal`. | OK (accuracy issue, Finding 2) |
| 22 | Nothing resets or edits a game in progress | `run.ts:96-103, 106-136`; `app.ts` | `startGame` only runs in the intro or result phase, and `finishGame` needs `game.win`. Script: `finishGame` keeps the same game object. The only writes are `applyMove` results. | OK |

### docs/RULES.md compared with the PDF

The summary is faithful on components, setup, turn order, the constraint, the three ways to win and the match
variants. I found two discrepancies:

1. **The "no draws" claim is not in the PDF.** `docs/RULES.md:29-31` says "this also means the game can never end
   in a draw: whoever takes the last tile wins if no formation was made". The PDF never addresses a full garden.
   This is the implementers' inference, stated as if it were a rule (Finding 1).
2. **"Implements exactly this" overstates.** `docs/RULES.md:5` says the engine "implements exactly this".
   `docs/RULES.md:37` lists 15- and 20-point matches, but the engine only has `points10` (Finding 4).

## Findings

### 1. HIGH: a full garden is ruled a win for the player who took the last tile; the PDF does not say so

- **Where.**
  - Code: `src/engine/okiya.ts:237-239`.
  - Docs that state it as a rule: `docs/RULES.md:29-31`, `src/ui/rulesPanel.ts:22`, `README.md:25-26`.
  - Test that locks it in: `src/engine/okiya.test.ts:311-322`.
- **What the PDF says.** It defines the third win as "Block your opponent, so that they can't make a move". Its
  example says the opponent loses if "none of the remaining tiles" matches.
- **What the engine does.** When the 16th tile is taken without a formation, the engine treats this as a block,
  since the opponent technically cannot move. That reading is literal and defensible, but the PDF never says it.
- **What other sources say.** The Okiya page on boardgamesbot.com
  (<https://www.boardgamesbot.com/okiya>) says: "If the last tile is removed without a win, the game ends in a
  tie." I could not reach BoardGameGeek (HTTP 403) to confirm whether that wording comes from the publisher.
  Two reviews I checked (GeekDad, Major Fun) list only the three wins and do not mention a full garden.
- **How often it happens, and who it favours.** Only the second player can take the 16th tile, so this rule gives
  every such game to the player who did not open.

  | Play | Games | Ending with a full garden | First-player win rate |
  |---|---|---|---|
  | Random against random | 50,000 | 13.0% | 51.6% |
  | AI depth 1 against depth 1 | 400 | 2.8% | 51.3% |
  | AI depth 2 against depth 2 | 400 | 39.3% | 33.5% |
  | AI depth 3 against depth 3 | 400 | 8.3% | 52.5% |
  | AI depth 4 against depth 4 | 150 | 62.0% | 29.3% |

  At depth 4, the AI searches with this rule built in, and the opener's results collapse. These wins are worth
  0 victory points. The Hanamichi design already relies on them: `docs/DESIGN.md:75` says "half of competent
  games leave 0 tiles".
- **Fix.**
  1. Get an authoritative ruling from the boxed Niya/Okiya rulebook, the publisher FAQ or the designer.
  2. In the engine, make the full-garden case explicit and separate from blocking. For example, in `applyMove`:
     `if (!formation && remaining === 0) → { winner: null, reason: 'full', … }` (a draw), or keep the current
     result under its own `reason: 'full'`. Put the choice behind one named constant so it can be switched.
  3. If draws are adopted, make `WinInfo.winner` `Player | null`, and update the code that assumes a winner:
     - `recordGame` should credit no one. Also decide who opens after a draw; the PDF's "loser starts" rule does
       not cover it.
     - `run.finishGame` should give 0 petals and use up the lantern.
     - The AI's terminal score should be 0.
  4. Whatever the ruling, reword RULES.md, the README and the in-app rules from fact ("there are no draws") to a
     labelled interpretation ("the PDF does not say; we rule …").

### 2. MEDIUM (displayed information is wrong; legality is unaffected): "A win now is worth" is always 1 petal too high

- **Where.** `src/game/hints.ts:38-55` (`worthNow`), displayed at `src/ui/app.ts:506`.
- **What is wrong.** `worthNow` counts the tiles in the garden *now*. Any win needs at least one more tile taken:
  exactly one on the human's turn, two on the rival's turn. So the number shown is too high by at least 1.
- **Evidence.**
  - In the 13-move test game, the screen shows 7 just before the winning move, but the win pays 6.
  - In 10,425 random games where P1 won, the value shown before the winning move never matched the actual
    petals (no charms).
  - `src/game/hints.test.ts` expects `tiles: 14` for a 14-tile garden, so the test locks the error in.
- **Fix.** On the human's turn, use `tilesRemaining − 1`. Better: for each legal move that wins, compute
  `scoreGame(applyMove(state, m), me, held)`, so the position charms also count the winning token. Or relabel
  the panel as "if the game ended now".

### 3. LOW: when a move both wins two ways, the engine reports only one reason, and charms depend on that reason

- **Where.** `src/engine/okiya.ts:199-205` (the first formation found wins) and `233-239` (a formation is checked
  before a block). Charms keyed on the reason: `src/engine/charms.ts:96-125`.
- **What is going on.** The PDF sets no precedence between a formation and a block. The winner does not change,
  but the single reported `reason` decides which charm fires.
- **Evidence from 100,000 random games:**
  - 10,970 of the 58,802 formation wins (18.7%) also left the rival blocked. Thorn Hedge cannot fire on those.
  - 3,096 formation wins (5.3%) completed two formations at once. Only the first one counts, in the order rows,
    columns, diagonals, squares.
- **Fix.** Not a rules violation. Either say so in the charm rule texts ("a row or square takes precedence over a
  block"), or add `reasons: WinReason[]` to `WinInfo` and let charms match any of them.

### 4. LOW: the official match formats are not playable in the app, 15/20-point matches are missing, and "3 + tiles" is called official

- **Where.**
  - Engine: `src/engine/okiya.ts:250-289`. `MatchMode` only has `'points10'`, and `pointsTarget` is never used.
  - The app never imports `newMatch` or `recordGame`.
  - `README.md:34` and `src/ui/app.ts:590` describe "3 + the tiles left in the garden" as "the official
    victory-point rule".
- **What is wrong.** Each game is still official Okiya. But the match structure (lanterns and petal targets)
  replaces the PDF's three "End of the game" options, and the text credits the +3 base to the official rules,
  which only award the tiles left.
- **Fix.**
  - Turn the points mode into a `points` mode whose target is 10, 15 or 20, or remove 15/20 from RULES.md.
  - Reword the text to: "3 petals for the win, plus the official victory points (the tiles left)."
  - Optionally add a "Classic Okiya" mode that uses `newMatch`/`recordGame`.

### 5. LOW: saved games are trusted when loaded; a stored `null` would crash the title screen

- **Where.** `src/ui/app.ts:65-68`, `src/ui/storage.ts:31`.
- **First problem: no validation.** A `RunState.game` read from localStorage is used as it is. Nothing checks
  that board, history and `lastTile` agree, so a corrupted or hand-edited save could resume from a position no
  legal game can reach.
- **Second problem: a latent crash.** `loadJson(RUN_KEY, null)` turns a stored `"null"` into `{}`, because
  `{...null, ...null}` is `{}`. The constructor treats that as a run that can be resumed, and `renderTitle` then
  crashes on `currentStation(run).place` (`app.ts:324`). Today only the `'abandon'` action (`app.ts:213`) writes
  `null`, and no button triggers it, so this cannot happen yet.
- **Fix.**
  - In `loadJson`, return the fallback when the parsed value is not an object.
  - On load, rebuild the game by replaying `history` through `applyMove`, starting from
    `newGameFromTiles(reconstructLayout(game), first)`. Discard the run if the replay disagrees with the saved
    state.

### 6. INFO: `newMatch` makes player 1 open by default instead of choosing at random

- **Where.** `src/engine/okiya.ts:263`.
- **What is wrong.** The PDF says the first game's opener is chosen at random. The app is not affected: it never
  uses `newMatch`, and `run.ts:64` does randomise.
- **Fix.** Make the `first` argument required, or pass a random generator in.

### 7. INFO: the shuffle cannot produce every possible garden

- **Where.** `src/engine/okiya.ts:131-150, 171-173`.
- **What is going on.** The shuffle is driven by a 32-bit seed, so at most 2³² gardens can be dealt out of the
  16! ≈ 2.1×10¹³ possible orderings.
- **Impact.** Gameplay is unaffected: each tile lands in each cell with near-uniform frequency.
- **Fix.** None needed. Document it if a "truly random shuffle" claim is ever made.

### Resolved during the audit

- **Stuck run after closing the tab at the end of a game.** If the tab was closed in the 1.1 s between the
  winning move and the tally, the run was saved with phase `playing` and a finished game, and nothing ever tallied
  it. Commit `bb2279e` fixed this: `resumeRun` now calls `finishGame` (`src/ui/app.ts:115-123`). I verified the
  fix by reading the diff.

## Test gaps

**Engine (`okiya.test.ts`)**
- The suite has no property or fuzz test. Nothing checks `legalMoves` against an independent reference over many
  states, that `applyMove` rejects every illegal index, or that games never end too early or too late. My
  script `invariants.ts` does all of this and could be turned into a test.
- Column and diagonal wins are only checked with `findWin` on hand-drawn pictures. No test reaches them through
  `applyMove`, so the mapping from formation to `reason` for those two cases is untested. Rows and squares are
  covered (`okiya.test.ts:260-279`, `charms.test.ts`).
- No test covers two formations completed at once (reason order). Formation plus block is covered once, at
  `okiya.test.ts:324-337`.
- The full-garden test (`okiya.test.ts:311-322`) asserts the inferred rule as if it were official (Finding 1).
- Positions built with `stateFromPicture` are never checked for reachability. They have empty histories but
  tokens on the board, so `tokensInHand` reports 8 in those tests.
- Untested: the `first` argument of `newGame(seed, 2)` (only `newGameFromTiles` is tested), the opener in
  `newMatch`, and 15/20-point targets.

**AI (`ai.test.ts`)**
- Legality is checked on a single opening position (`ai.test.ts:121-127`), not across depths and blunder rates.

**Hints (`hints.test.ts`)**
- The `danger` hint is never tested.
- No test checks that the hint functions leave the game state unchanged.
- The `worthNow` test enshrines the off-by-one (Finding 2).

**Charms (`charms.test.ts`)**
- The Narrow Gate expectation is computed with `buildContext`, the code under test, so it cannot fail.
- The "charm layer is pure" block contains no mutation check.

**Run (`run.test.ts`)**
- Tests check `nextFirst`, but never that the next game's `current` equals it.
- No test checks that the first opener is random.

**UI**
- Refusal of an illegal click is checked only by `scripts/e2e-flow.ts` (step D3: one click on one cell). That
  script is not part of `npm test`.

## What I ran

All scripts are in the session scratchpad
`/tmp/claude-1000/-home-kyrers-Documents-kleros-okiya-game/e693d28c-c708-4a5e-bebb-b5e176a010fd/scratchpad/audit/`.

- **PDF.** Rendered the pages with `pdftoppm` and inspected pages 1, 3 and 4. Read the extracted text
  `okiya-rules.txt`.
- **Unit tests.** `npm test`: 5 files, **67 tests passed**. I ran it at HEAD and again on the working tree with the
  Firefly rename.
- **Type check.** `npx tsc --noEmit` was clean at HEAD. On the working tree it currently fails: `app.ts` still
  imports `lanternHints` and `useLantern` and reads `lanternUsed`, while `hints.ts` and `run.ts` have already been
  renamed. This looks like a temporary state of the other session's uncommitted edit; re-check before it is
  committed.
- **`invariants.ts`** (`npx tsx`). Result: **all invariants held**. It covered:
  - Formations: an exhaustive check of all 2¹⁶ token subsets against a reference built from the PDF.
  - Shuffle: whether gardens are permutations and how evenly tiles are spread.
  - 100,000 random games: legal sets matched the reference at every state, and in the first 20,000 games every
    illegal index was rejected. Inputs were deep-frozen, and the script checked for mutation. Each move's
    result (formation, block or game continues) matched the reference. Also checked: `tilesRemaining`, tokens
    ≤ 8, players alternate, exactly one winner, history obeys the constraint.
  - How the games ended: blocked 41,178; row 13,214; column 13,204; diagonal 7,906; square 24,498. 13,016 of
    them ended with a full garden.
  - 300 AI games at all difficulty and station settings, with hint correctness and immutability checked on 3,850
    states, plus checks on charm scoring.
  - 400 complete runs through `run.ts`: 802 loser-starts transitions checked, and the human opened the first game
    in 203 of 400 runs.
- **`fullboard.ts`.** How often the garden fills, and first-player win rates by AI depth (table in Finding 1).
- **`coincide.ts`.** How often a formation coincides with a block, or two formations complete at once (Finding 3).
- **`worth.ts`.** Compared the "A win now is worth" value with the actual petals (Finding 2).
- **`uiclick.ts`.** Playwright with system Chrome in a fresh, isolated profile, against the dev server on
  `localhost:5173`. It forced clicks on every non-legal cell on each human turn: 53 tried, 0 accepted, and the
  highlighted cells always matched the reference legal set. No page errors.
- **Web searches** for an official ruling on a full garden:
  - <https://www.boardgamesbot.com/okiya> says it is a tie.
  - <https://geekdad.com/2015/02/niya/> and <https://www.majorfun.com/niya/> do not mention it.
  - BoardGameGeek returned HTTP 403.
