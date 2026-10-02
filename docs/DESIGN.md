# Design record

This file documents how the new game was chosen and tuned. Sections are appended as the
process advances (candidates → criteria → judging → simulation playtest → final tuning).

## 1. Requirements (from the brief)

- A **new game**, with the original Okiya played at its core (4x4 garden, border-only first
  move, shared vegetation/symbol constraint, row/column/diagonal/2x2 wins, blocked-opponent win).
- **Looks good.**
- **Playable by one person opening a link** (no second human needed).
- **Static site**: no backend, accounts, keys or analytics.

## 2. Selection criteria

Decided before any proposal was read; used by the judging agents. Gates are pass/fail,
the rest are scored 1–5.

| # | Criterion | Type | What it means |
|---|-----------|------|---------------|
| G1 | Core fidelity | gate | Every official Okiya rule is still played, unmodified, in every game. The new layer may only add around/on top of a game. |
| G2 | Static-site fit | gate | No server, account, key or analytics is needed for any feature. |
| C1 | Novelty | 1–5 | Does it feel like a new game with new decisions, rather than Okiya with a skin or a scoreboard? |
| C2 | Solo fun | 1–5 | Is a 10-minute session for one person compelling: clear goal, tension, a reason to play again? |
| C3 | Buildability | 1–5 | Can one engineer build it in ~90 minutes on top of the existing engine (`src/engine/okiya.ts`) and AI (`src/engine/ai.ts`)? Low technical risk? |
| C4 | Visual potential | 1–5 | Can it look great with HTML/CSS/SVG only, and stay readable on a phone? |
| C5 | Testability | 1–5 | Can balance/fun risks be measured by AI-vs-AI simulation before building, and tuned by numbers? |
| C6 | Depth & replayability | 1–5 | Do the added decisions interact with Okiya's tactics (constraint chains, blocking, formations) instead of sitting beside them? |

Weighting: C1, C2 and C3 count double (the brief insists on "new", "one person" and a finite build),
C4–C6 single. Maximum score 45.

## 3. Baseline facts about Okiya (from simulation)

Measured with `scripts/simulate.ts` before any idea was read (full output in
`docs/sim/baseline-okiya.txt`):

- Between equal depth-limited AIs (depth 2–6), **~64% of games end by blocking** and
  about **half run all 16 moves** (0 victory points left). Average length 14.5–15.2 moves.
- Between a strong and a weak player, formation wins dominate (row/column/diagonal/square
  ≈ 70%) and games average ~11.5 moves with ~4.5 tiles left.
- The full game tree is solvable in ~5 s of JavaScript; in the three seeds probed the
  first player had a forced win. At limited depth the second player wins ~65%.

These numbers matter for any layer that scores victory points or win types: against a
competent opponent, VP are scarce and blocks are the normal ending.

## 4. Candidates

Three proposals were written by three independent ideation agents (each given a different
angle, none allowed to read the others). Full texts: `docs/ideas/idea-A.md`, `idea-B.md`, `idea-C.md`.

| | A — Hanamichi, The Flower Road | B — Okiya Koi-Koi | C — Lantern Street |
|---|---|---|---|
| Angle given | campaign / progression between games | a twist layered on each move or game | asymmetric AI rivals with powers |
| One-liner | Roguelike walk through 8 stations; each win scores petals = `(tiles left + charm adds) × (1 + charm mults)`; draft scoring charms between stations | The tiles you remove form a Hanafuda-style hand; sets (yaku) score and let you call *Koi-Koi* to double the stake, the rival accepts or folds; race to 30 mon | A season of best-of-3 duels against four rival geisha with readable AI styles; beat one to take her *kanzashi* power (Parasol bans a tile, Whisper narrows the constraint, Lantern shows danger) |
| Where the new decisions live | Which charms to draft; *how* to win (diagonal, square, block, fast, hold corners…) | Which tile to take for hand value vs board value; when to double; whether to accept a double | Which rival to fight next; when to spend a once-per-game power |
| In-game rule changes | none (charms only read the finished game) | one: a fold ends a game early, only in answer to a Koi-Koi call | powers *remove* legal moves (Parasol, Whisper) for one turn |
| Solo structure | AI ladder depth 1→8 across 8 stations, 3 games each | 3 rivals with different calling temperaments | 4 rivals + 2 "Favors" (retries) |

## 5. Judging

Two fresh judging agents (neither had written a proposal) scored the candidates independently
against §2. Full verdicts: `docs/judging/judge-1.md`, `docs/judging/judge-2.md`.

| | A — Hanamichi | B — Koi-Koi | C — Lantern Street |
|---|---|---|---|
| G1 core fidelity | pass | **fail (minor)**: a fold ends a game Okiya has not ended. Amendable: declining pays the caller and the game plays on | **fail (serious)**: Parasol and Whisper remove legal moves, which changes who wins; not amendable without losing the idea |
| G2 static site | pass | pass (self-host or drop the web font) | pass |
| Judge 1 total | **38** | 37 (amended) | 40 but ineligible |
| Judge 2 total | **36** | 32 (amended) | 38 but ineligible |

Both judges chose **A** as the winner and **B** as runner-up, and both asked for the same changes to A:

1. Every win must score something: base petals = 3 + tiles left (half of competent games leave 0 tiles).
2. Cap the rival at depth ≤ 4–5 with some random moves; a perfect searcher is unbeatable and the
   "loser starts" rule sends a losing human first, the side that loses ~65% at equal depth.
3. Repair the charm pool: cut pure counters (Morning Sun, Full Suit), cut the throw-a-game charms
   (Second Wind, Moss Path), replace Moss Path with a per-token bonus, add charms that trigger on
   chain and blocking events (Narrow Gate), and add C's information-only Lantern hint.
4. Put the layer on the board (live charm hints, live "worth now" petals) instead of text strips.
5. Fit a 10–15 minute session: 5–6 stations, autosave after every game.

Both judges asked for simulation of A and (amended) B before the final choice, with one key
number each: for A the **decision-change rate** (share of the charm-aware player's moves that
differ from a win-only player; target 10–30%, under 5% means "just a scoreboard"); for B the
**match-win gain from selective Koi-Koi calling** (target ≥ +4 percentage points).

## 6. Playtest by simulation

Scripts: `scripts/sim-hanamichi.ts`, `scripts/sim-koikoi.ts`. Raw outputs in `docs/sim/`.

### B — Koi-Koi (amended, 200 matches per pairing, depth-2 players)

| Metric | Target (from the proposal) | Measured | Verdict |
|---|---|---|---|
| Winner holds ≥1 yaku | 45–70% | **90.5%** | fail: yaku are automatic |
| Four Seasons per game | — | **~170%** (both players, most games) | automatic |
| Grove or Weather per game | 10–25% | **0.0–0.3%** | fail: unreachable under the chain rule |
| Threshold calling vs never calling (match wins) | +4–10 pp | **+14 pp** (58.0% vs 44.0%) | pass: the doubling call is a real decision |
| Always calling vs never | — | −6.5 pp (37.5%) | calling blindly loses |
| Collector (hand-aware tie-breaks) vs Board | wins fewer games, ≥52% matches | 45.3% games, 43.5% matches | fail: the hand does not reward play |

Conclusion: B's doubling cube works, but its hand layer, which is most of the proposal, is
bookkeeping: the sets either always happen or never happen. It would need a different set design
and a new playtest. Not chosen.

### A — Hanamichi (300 games per experiment, player depth 2, rival depth 2 with 10% random moves)

Player models: **Blind** plays the best negamax move. **Charm** picks, among moves within a
small tolerance of the best score, the one that advances its charms (a cheap heuristic).
**EV** picks, among near-best moves, the one with the highest average petals over 12 random
playouts (a better model of a player weighing "how" to win). Each game both players hold the
same 3 random charms and are scored identically, so differences come from play alone.

| Metric | Target | First charm pool, tolerance 8 | Retuned pool, tolerance 2 | Retuned pool, EV player |
|---|---|---|---|---|
| Decision-change rate | 10–30% | 35.6% | **14.1%** | 29.0% |
| Moves giving up search score | low | 31.7% | 10.7% | — |
| Win rate (blind → charm) | no loss | 47.3% → 33.0% | 57.7% → 57.7% | 58.0% → 63.7% |
| Petals per game (blind → charm) | ≥ +25% | 6.37 → 5.14 (−19%) | 6.81 → 7.37 (+8%) | 7.12 → 8.01 (+12.5%) |

Findings and tuning decisions:

- **A crude charm chaser loses.** With a wide tolerance the charm player sacrifices wins and ends
  with fewer petals. A win is a prerequisite for any petals, so the layer must never tempt the
  player into bad Okiya. This argues for charms that are mostly decided by *which of several
  equally good tiles* to take, which is exactly where Okiya's own tension (the constraint chain)
  lives. Tolerance 2 keeps the win rate intact while still changing 14% of moves.
- **Playing petals inside the search barely matters** (experiment 4: 0.3% of moves change at
  depth 2, 0.6% at depth 4), because a visible forced win is rare; most moves are heuristic.
  The charm influence therefore has to come from the player's own judgement, which the EV model
  approximates: +12.5% petals, of which +8.0% is explained by the control run where the EV player
  ignores charms (playouts simply make it stronger). The net effect of charm pursuit at these
  payouts is about +4.5 points; **doubling every payout raises the gain to +28.6%** at the same
  decision-change rate. Payouts were therefore raised from the proposal (square +4→+6,
  row/column +3→+4, diagonal +1 mult→+8, block +6→+4 after the base fix, gate +2→+3) and
  the `SCALE` knob is left in the script for further tuning.
- **Per-charm fire rates** (held alone, retuned pool): Rain Chain 100%, Steady Hand 100%, Heart
  Stone 99%, Corner Shrine 95%, Narrow Gate 66%, Thorn Hedge 53%, Bamboo Fence 21%, Stone
  Lantern 20%, Swift Blossom 18%, Crane Scroll 10%. Full Suit fired in **0%** of wins and was cut;
  Morning Sun (100%, a pure counter) was cut. Heart Stone's ×2 multiplier fired in 90% of wins and
  was changed to +2 per centre cell. The pool mixes reliable "small" charms with rarer "big" ones
  so that drafting is a real choice.
- **Ladder calibration** (EV-2 player, 3 random charms, 3-game sets, 100 sets per level):

  | Rival (depth / random-move rate) | Player win rate | Petals per game | Set petals p25 / p40 / p50 / p60 |
  |---|---|---|---|
  | 1 / 0.35 | 93% | 15.3 | 36 / 40 / 42 / 46 |
  | 1 / 0.15 | 91% | 15.2 | 34 / 39 / 42 / 45 |
  | 2 / 0.15 | 68% | 8.3 | 16 / 21 / 25 / 29 |
  | 2 / 0.05 | 57% | 6.7 | 10 / 15 / 19 / 24 |
  | 3 / 0.05 | 45% | 6.1 | 10 / 14 / 16 / 24 |
  | 4 / 0.03 | 35% | 4.1 | 0 / 9 / 11 / 13 |

  Station targets are set near the 25th–40th percentile of a 3-game set so that each station is
  cleared roughly 60–80% of the time by this model, giving a full-run completion rate of about
  13% (inside the 10–25% band the proposal asked for), rising with charm drafting skill.

## 7. Final design: Hanamichi — The Flower Road

A run is a walk along six stations. At each station you face a named rival and have three
lanterns (three full Okiya games) to gather the station's petal target. Clear it and you draft
one of three charms (hold up to four); fail and the run ends with a summary.

| Station | Season | Rival | Depth / random-move rate | Tactics | Target petals (3 games) |
|---|---|---|---|---|---|
| 1 | Spring | Haru, the Eager | 1 / 0.35 | careless | 30 |
| 2 | Spring | Ume, the Gentle | 1 / 0.15 | careful | 30 |
| 3 | Summer | Natsu, the Mirror | 2 / 0.02 | careful | 14 |
| 4 | Summer | Kaede, the Patient | 3 / 0.02 | careful | 12 |
| 5 | Autumn | Aki, the Wall | 5 / 0.02 | careful | 8 |
| 6 | Winter | Okasan, the Matron | 8 / 0 (900 ms cap) | careful | 3 (one win) |

"Careful" rivals always take an immediate win and never play a move that hands the player an
immediate line, square or block when a safer move exists; their random moves are drawn from the
safe moves only. Only Haru is careless. See §8 for how this ladder was measured.

- **Petals for a won game** = `(3 + tiles left in the garden + Σ charm adds) × (1 + Σ charm mults)`.
  A lost game scores 0. The "tiles left" term is the official victory-points rule; the +3 is ours.
- **Charms** (10): Stone Lantern (square win +6), Bamboo Fence (row/column win +4), Crane Scroll
  (diagonal win +8), Thorn Hedge (blocked win +4), Corner Shrine (+2 per corner held), Heart Stone
  (+2 per centre cell held), Rain Chain (+1 per move that followed the constraint by symbol),
  Narrow Gate (+3 each time you leave the rival exactly one legal tile), Steady Hand (+1 per two
  tokens placed), Swift Blossom (win with ≤ 6 tokens: ×2). All are pure functions of a finished
  game (`src/engine/charms.ts`, unit-tested).
- **Firefly** (borrowed from idea C's "Lantern", information only; renamed after the visual review
  because "lantern" already meant a game): once per station the player may wake it to see, for one
  move, which legal tiles win at once and which hand the rival an immediate win. It never changes
  what is legal.
- **Okiya rules untouched**: every game is created with `newGame`, played with `applyMove` and
  `legalMoves`, and decided by the engine's own win check. The first game at a station starts with
  a seeded coin toss; afterwards the loser of the previous game starts, as in the official rules.
- **Solo**: the rival is the negamax AI with the depth and random-move rate above. Everything is
  client-side; the run autosaves to localStorage after every game; a run can be seeded so the same
  road can be replayed.


## 8. Rival strength retune (2026-10-03)

Playing by hand, the author won with four in a line far too easily. Measured against a simple
**greedy player** written from the rules (win now; else never hand the rival an immediate win;
else maximise own open formations; `scripts/sim-stations.ts`), the original rivals were weaker than
intended and, because their random "blunder" moves ignored threats, they handed the player an
immediate win hundreds of times:

| Station | Rival | Before: rival win % (400 games) | Before: handed the player an immediate win | After: rival win % (1,000 games) | After, when the player opens / when the rival opens | After: handed wins | After vs a 2nd opponent (depth-2 careless searcher) |
|---|---|---|---|---|---|---|---|
| 1 | Haru (careless, unchanged) | 17.8% | 193 | 20.0% | 22% / 18% | 495 (kept easy on purpose) | 22.9% |
| 2 | Ume | 28.8% | 195 | **46.5%** | 56% / 37% | **0** | 45.0% |
| 3 | Natsu | 42.0% | 37 | **56.8%** | 67% / 47% | **0** | 53.8% |
| 4 | Kaede | 49.8% | 13 | **68.0%** | 72% / 64% | **0** | 71.4% |
| 5 | Aki | 62.8% | 14 | **81.5%** | 83% / 80% | **0** | 80.3% |
| 6 | Okasan | 72.8% | 6 | **90.4%** | 97% / 83% | **0** | 87.1% |

Raw outputs: `docs/sim/stations-before.txt`, `docs/sim/stations-after.txt`. The second player has a
large advantage in Okiya at these strengths, and the official loser-opens rule means a player who
is losing at a station opens more often; the per-opener split shows what that feels like.

Changes:
- **Tactical guard in the AI** (`careless` option, default off): an immediate win is always taken;
  a move after which the opponent can win at once (formation or block) is never played when a safe
  alternative exists; blunders are drawn from safe moves only. Unit tests cover this on 1,000
  random positions with the blunder rate forced to 100%. Station 1 keeps `careless: true`.
- **Ladder** chosen from a depth × blunder sweep of careful rivals against the greedy player
  (table in `docs/sim/stations-before.txt`), then widened at the top after an independent check
  found the depth 3 → depth 4 step small and inverted against a different opponent: depth 1/0.15,
  2/0.02, 3/0.02, 5/0.02, 8/0 (the last under a 900 ms cap; 23 ms per move on average on the test
  machine). Steps of 10–13 points against the greedy player; monotone against the second opponent too.
- **Targets recalibrated** with the same EV-2 player model as §6 against the new rivals
  (`LADDER=1 npx tsx scripts/sim-hanamichi.ts 300`): clear rates per station 88 / 67 / 71 / 66 /
  62% with targets 30 / 30 / 14 / 12 / 8; at the last station the model wins a game only 16% of the
  time, so its target is 3 petals, i.e. **win one game against Okasan** (about 41% of model runs).
  The modelled full-run completion is about 7%, under the 10–25% band of §6; the author preferred
  clearly harder rivals, and a real player who drafts charms deliberately scores above this model.
- **Verification**: a workflow of independent agents re-derived the guarantee from the rules
  (about 210,000 careful rival moves across stations 2–6 against random, searching and greedy
  opponents, with the blunder rate forced to 0 and to 1: zero missed wins, zero handed wins, every
  forced position still answered with a legal move; the detector fires 79/173 times on careless
  Haru), confirmed `careless: true` reproduces the previous AI exactly on 4,000 comparisons, found
  no measurable performance cost, and flagged the station 4 → 5 plateau that the final ladder fixes.
