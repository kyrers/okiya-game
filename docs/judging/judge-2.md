# Judge 2: the player's advocate

Criteria and weights are from DESIGN.md §2, the baseline from §3. Existing engine, AI and art are not charged.

## Gate check

| | G1 Core fidelity | G2 Static site |
|---|---|---|
| A | Pass | Pass |
| B | Fails as written; easy fix | Pass |
| C | Fails; no easy fix | Pass |

**A.** Charms only read finished games; legal moves, wins and setup are untouched. Second Wind and Moss Path invite throwing games, a design flaw rather than a G1 issue.

**B.** A **fold ends a game Okiya has not ended** and awards it to the caller: a third way to win. **Fix:** declining does not end the game. The decliner pays the caller `(3 + caller's yaku) × stake` at once, the stake stays, and the game is played to its official finish. The decision survives, and every game ends by a formation or a block.

**C.** Parasol and Whisper remove officially legal moves, which changes who wins. A Parasol can shade the only tile that completes a formation. The replay test cannot catch this, because any subset of legal moves replays cleanly. This is C's core, and passing G1 leaves only info-only powers and AI personalities.

**G2.** All three run locally. B should self-host or drop *Shippori Mincho*.

## Scores

| Criterion (weight) | A | B\* | C† |
|---|---|---|---|
| C1 Novelty (×2) | 3 | 4 | 4 |
| C2 Solo fun (×2) | 4 | 3 | 5 |
| C3 Buildability (×2) | 5 | 4 | 3 |
| C4 Visual potential | 4 | 3 | 5 |
| C5 Testability | 5 | 4 | 4 |
| C6 Depth & replayability | 3 | 3 | 5 |
| **Total / 45** | **36** | **32** | **38, ineligible** |

\*B scored with the "decline = pay and play on" fix. †C as written; with info-only powers I estimate about 31.

## Reasoning per proposal

**A: Hanamichi.**
- **C1 3:** The run and draft feel new, but inside a game you play plain Okiya and charms only tilt your choices.
- **C2 4:** It has the clearest 10-second goal: fill the bar before the lanterns run out. Stations 1–2 (depth 1, ε .30) lack tension, and a depth-8, ε 0 rival is a wall in a game solvable in about 5 s.
- **C3 5:** No engine changes; `blunder` already is ε.
- **C4 4:** The tally and lantern road pay off visually; the charms are text strips.
- **C5 5:** Charms score finished games, so logged games can be re-scored under any charm set.
- **C6 3:** Win-type, corner/centre and Thorn Hedge charms touch formations and blocking; Morning Sun and Full Suit are counters beside the game. **Biggest flaw:** base score is tiles left, so about half of wins against a competent rival pay **0 petals**, which makes Thorn Hedge a forced pick.

**B: Okiya Koi-Koi.**
- **C1 4:** The doubling call is a new mid-game decision that depends on reading the board.
- **C2 3:** An Evening fits 10 minutes, and Koi-Koi is a real moment. But a phone player cannot read "accept above about 25%" off an Okiya position.
- **C3 4:** A scoring module, a mid-game decision state and a playout estimator; moderate risk.
- **C4 3:** The Hanafuda look is lovely, but two fanned hands, text chips, a ticker and a score track crowd one phone column.
- **C5 4:** Sound metrics, but results depend on modelled call/accept policies.
- **C6 3:** By B's own chain rule, Grove or Weather needs at least 7 of your picks and a rival who never takes that suit, so they are near-impossible. Four Seasons is near-automatic. Hand play is bookkeeping, and the doubling call carries all the depth.

**C: Lantern Street.** Best player experience: a named rival, her power used against you, then inherited, with icons that read without text. It scores so well precisely because it rewrites legal moves. **C3 3:** it needs restricted-move AI, power-use decisions and four personality evals.

## Verdict

**Winner: A (36). Runner-up: B (32, amended).** C would be the most fun but fails G1 at its core; graft its rule-safe parts into A.

## Changes before building A

1. **No win scores zero.** Set the base to `2 + tiles left`, cut Thorn Hedge to +3 and retune the targets. About 64% of games end in a block, so blocks must pay.
2. **Cap the rival.** Use depth ≤5 with ε ≥ 0.03 at the top; keep `master` for Winter Road. Give each season a named rival with C-style readable habits, done with eval weights.
3. **Put the layer on the board.** Show glyphs on tiles that would trigger a held charm, plus B's live "worth now" petals. Show charm text only on tap.
4. **Rework the pool.** Cut Morning Sun, Full Suit, Second Wind and Moss Path. Add chain and blocking triggers (e.g. *Narrow Gate*: +2 each time the rival is left exactly one legal move), plus C's Lantern hint once per station. It only shows information, so it is G1-safe.
5. **Fit 10 minutes.** Autosave after every game, and end a season every two stations with a summary card.

## Playtest recommendation

- **A:** the **decision-change rate**, i.e. the share of moves where Charm-2 picks differently from Blind-2. Measure it after change 1; the target is 10–30%. Below 5%, the charms are just a scoreboard.
- **B (amended):** the **match-win gain from threshold calling** over both always calling and never calling. The target is at least +4 pp; about 0 means Koi-Koi is decoration.
