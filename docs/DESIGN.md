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
