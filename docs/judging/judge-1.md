# Judge 1: verdict

Judged against DESIGN.md §2 and the §3 baseline. No proposal was charged for the engine, AI, tile art or board renderer, which already exist. B was judged as revised during judging.

## Gate check

| | G1 Core fidelity | G2 Static-site fit |
|---|---|---|
| **A** | **Pass.** Charms only read the finished game; `legalMoves`/`applyMove` are untouched. | Pass |
| **B** | **Fail, minor.** A *fold* ends a game without a board result. Yaku and stakes are scoring only, so they are fine. **Amendment:** drop the fold. A call is answered *Accept* (the stake doubles) or *Decline* (the caller banks yaku × stake now). Either way the game plays on to its official ending. | Pass, if Shippori Mincho is self-hosted |
| **C** | **Fail, serious.** Parasol and Whisper remove legal moves. The replay invariant only proves the record is *some* legal Okiya game, not that players had Okiya's choices. Lantern (a hint) is fine. **Amendment** is not easy: the powers must become information-only, which removes most of C's depth. | Pass |

## Scores

| Criterion (weight) | A | B | C |
|---|---|---|---|
| C1 Novelty (×2) | 4 | 4 | 5 |
| C2 Solo fun (×2) | 4 | 4 | 5 |
| C3 Buildability (×2) | 5 | 4 | 3 |
| C4 Visual potential | 4 | 4 | 5 |
| C5 Testability | 5 | 5 | 4 |
| C6 Depth & replayability | 3 | 4 | 5 |
| **Total / 45** | **38** | **37** | **40 (fails G1)** |

## Reasoning per proposal

**A: Hanamichi**
- **C1 (4):** The drafting run makes a new game, but turn-to-turn play changes only when a charm pulls you somewhere.
- **C2 (4):** The target bar, lanterns and album give tension and replay. But a run takes about 30 minutes, and the late targets (22–40 against depth 3–8 at ε≈0) are walls when competent games average 0.8–1.5 VP.
- **C3 (5):** The scorers are pure functions. About 40 of its 90 minutes (AI and board) are already built.
- **C4 (4):** The emaki road, hanko stamps and charm-by-charm tally make a simple phone stack.
- **C5 (5):** The rival is unchanged, so one pool of simulated games can be re-scored offline under any set of charms.
- **C6 (3):** Rain Chain, Corner Shrine and Heart Stone change which tile you take. Swift Blossom (≤5 tokens, in games of about 15 moves) is nearly dead. Moss Path (floor(tiles/2) on a loss) rewards losing *fast*.

**B: Okiya Koi-Koi**
- **C1 (4):** Every pick serves both the board and the hand, and calling Koi is a real new decision.
- **C2 (4):** An Evening is a complete 10-minute arc. Replay is limited by three rivals and a steep jump from novice to depth 4 to master.
- **C3 (4):** Yaku checks are trivial, and `chooseMove` already returns root scores for the tie-break. The two-hand UI and the playout-based win estimate carry the risk.
- **C4 (4):** The Hanafuda look is strong, but two hand fans, the board and a decision sheet crowd a phone.
- **C5 (5):** It has the best "bad → fix" table, and its calling policies isolate the key risk.
- **C6 (4):** The chain rule is a real interaction: taking the same vegetation twice in a row forces the rival to take one in between. A base of 3 plus yaku answers the §3 endings with 0 VP. Four Seasons may come automatically.

**C: Lantern Street**
- It has the best fantasy (readable rivals whose powers you earn) and the most interaction with tile chains and blocking.
- But its core is a rule change. It also needs search that understands the powers, per-rival scoring that `evaluate` cannot express, and two targeting UIs (C3: 3).

## Verdict

**Winner: A, Hanamichi (38).** It is the only proposal that passes both gates as written. It is also the safest to build and fully tunable by numbers.

**Runner-up: B, Okiya Koi-Koi (37, with the no-fold amendment).**

C scores highest but fails G1, and the amendment that would save it removes what earned those scores.

## Changes before building A

1. **Flat win bonus:** petals = `(3 + tilesRemaining + Σadd) × (1 + Σmult)`, so blocked wins with 0 tiles left (half of competent games) still score. Retune the targets by simulation.
2. **Cap the rival.** Drop depth 6/8 at ε=0. The solver found forced first-player wins, and "loser starts" sends a losing human first: the side that wins about 34% at equal depth. Use depth ≤4 with ε ≥0.03, and scale late stations through targets and lanterns instead.
3. **Repair the charms.** Moss Path becomes +1 per two tokens placed. Drop Second Wind. Replace Swift Blossom and Crane Scroll with charms that score what happens during play. Show live charm progress through the `cellClass` hook in `board.ts`.
4. **Add one in-game choice that passes G1:** a single-use "Paper Lantern" charm, taken from C. For one move it marks which tiles win or lose in one move. It gives information only.
5. **Fit the session length:** default to 5–6 stations (about 15 minutes) with an autosave after every game. The 8-station road becomes the Winter Road unlock.

## Playtest recommendation

Simulate **A** and **B**. C fails G1.

- **A:** the share of moves where Charm-2 picks differently from Blind-2. Target 10–30%; below 5%, the charms are cosmetic.
- **B (no fold):** the Collector policy's match-win rate against Board. It should be ≥52% while Collector wins 2–6 points fewer single games; otherwise the hand is free or irrelevant.
