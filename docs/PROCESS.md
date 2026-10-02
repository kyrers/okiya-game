# Process

How Hanamichi was made, in one autonomous session on 2026-10-02 (started 20:48 local time).
The brief: build a new web game on top of Okiya, keeping Okiya intact at the core, playable by
one person from a link, deployable as a static site, and prove each step.

## Timeline

| Step | What happened | Output |
|---|---|---|
| 1. Rules | Downloaded the official Blue Orange print-and-play PDF, extracted the text and viewed the four pages (the tile pages confirm the 16 tiles = 4 vegetations × 4 symbols; "rain or cloud" is one symbol). Wrote a summary in our own words. | `docs/RULES.md` |
| 2. Engine + tests | Implemented the rules as pure functions (`src/engine/okiya.ts`) and 33 unit tests with literal expected values (exact legal-move lists, a full 13-move game ending in a row with 3 tiles left, block wins, the no-draw last tile, match variants). Three test expectations were wrong on the first run (a layout literal, a tile that shared "poem", a tile count) and were corrected; the engine itself did not change. | `src/engine/okiya.test.ts` |
| 3. AI + baseline | Negamax with alpha-beta and a transposition table; a simulation harness. Baseline facts were measured before any idea was read (64% of games between equal AIs end by blocking, ~half leave 0 victory points; the full tree solves in ~5 s and the first player has a forced win in the probed seeds). | `src/engine/ai.ts`, `scripts/simulate.ts`, `docs/sim/baseline-okiya.txt` |
| 4. Criteria | Wrote the gates and weighted criteria before reading any proposal. | `docs/DESIGN.md` §2 |
| 5. Ideas | Three ideation agents, each with a different angle, none allowed to read the others. | `docs/ideas/idea-A.md` (Hanamichi), `idea-B.md` (Koi-Koi), `idea-C.md` (Lantern Street) |
| 6. Judging | Two judging agents that had written nothing, scoring against the criteria. Both chose A, both put B second, both failed C on core fidelity (its powers remove legal moves). Both listed the same five changes for A. | `docs/judging/judge-1.md`, `judge-2.md` |
| 7. Playtest | Simulated A and (amended) B as the judges asked. B's hand layer proved automatic (Four Seasons in ~170% of games) or impossible (Grove/Weather ≈ 0%), while its doubling call worked. A's first charm policy sacrificed wins; with a narrow tolerance it changed 14% of moves at no cost, and a player weighing petals properly gained +12.5% petals (+28.6% with doubled payouts). The charm pool was retuned (two charms cut, payouts raised, Heart Stone changed) and station targets calibrated from 3-game-set quantiles. | `scripts/sim-hanamichi.ts`, `scripts/sim-koikoi.ts`, `docs/sim/*.txt`, `docs/DESIGN.md` §6–7 |
| 8. Build | Charm module (tests), run state machine (tests), information-only hints (tests), framework-free UI with SVG tile art, Playwright screenshot script. | `src/`, `scripts/screenshots.ts` |
| 9. Reviews | A fresh visual judge reviewed 21 screenshots (phone/tablet/desktop); a fresh rules auditor checked the code against the PDF. Fixes applied, screenshots regenerated. | `docs/reviews/` |
| 10. Docs | README (play, run, deploy), this file, final screenshots. | `README.md`, `docs/screenshots/` |

## Agents used

| # | Role | Model | Input | Produced |
|---|---|---|---|---|
| 1 | Ideator A (campaign angle) | Opus | rules summary, engine | `docs/ideas/idea-A.md` |
| 2 | Ideator B (per-move twist angle) | Opus | same | `docs/ideas/idea-B.md` |
| 3 | Ideator C (rivals/powers angle) | Opus | same | `docs/ideas/idea-C.md` |
| 4 | Judge 1 | Opus | criteria, baseline, 3 ideas, engine | `docs/judging/judge-1.md` |
| 5 | Judge 2 (player's advocate) | Opus | same | `docs/judging/judge-2.md` |
| 6 | Visual judge | Opus | 21 screenshots | `docs/reviews/visual-review-1.md` |
| 7 | Rules auditor | Opus | PDF text, code, tests | `docs/reviews/rules-review.md` |

Everything else (engine, tests, AI, simulations, UI, docs) was written by the orchestrating
session directly. Budget: 15 agents allowed, 7 used (see the end of this file for any later ones).

## Key decisions

- **Engine first, pure and immutable.** Every later layer calls `newGame`, `legalMoves`,
  `applyMove` and reads `state.win`; nothing else decides legality or victory.
- **Gates over scores.** Idea C scored highest on raw criteria with both judges but was rejected
  because its powers change which moves are legal. The brief's "Okiya is still there and played at
  its core" was treated as non-negotiable.
- **Let the simulation change the design.** The playtest showed that charm chasing with a loose
  tolerance *loses* petals, so charms were made to matter mostly at near-ties, payouts were
  raised, two charms were cut, and the rival ladder was capped at depth 4 with a few random moves.
- **Information-only borrowing.** The Paper Lantern hint comes from idea C, kept because it never
  alters legality.
- **No framework, no external requests.** System fonts, inline SVG art, one CSS file; the build is
  ~63 KB and works from any sub-path.

## Rejected ideas and why

- **Lantern Street (C)**: Parasol/Whisper remove legal moves (core-rule change).
- **Okiya Koi-Koi (B)**: fold ends games early (fixable), but the hand sets are either automatic or
  unreachable, so the layer is bookkeeping (measured).
- **Charms Full Suit / Morning Sun / Second Wind / Moss Path** (from A): never fire, pure
  counters, or reward throwing games.
- **Depth 6–8 perfect rival**: unbeatable given the solver results; capped at depth 4.

## Verification

- `npm test`: unit tests across engine, AI, charms, run flow and hints (see the final count in the
  session summary below).
- `npm run build`: type-check plus Vite production build.
- Production bundle smoke test: `vite preview` + the screenshot script against the built `dist/`.
- Simulations: see `docs/sim/`.
- Reviews: see `docs/reviews/` and the "Fixes from reviews" section below.

## Fixes from reviews

(filled in after the reviews; see below)

## Unfinished / known limitations

(filled in at the end of the session)
