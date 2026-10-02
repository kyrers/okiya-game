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
| 6 | Visual judge, round 1 | Opus | 21 screenshots | `docs/reviews/visual-review-1.md` (15 findings, scores 6/10 and 5/10) |
| 7 | Rules auditor | Opus | PDF text, code, tests | `docs/reviews/rules-review.md` (7 findings, verdict "yes, with caveats") and `scripts/audit-invariants.ts` |
| 8 | Visual judge, round 2 | Opus | review 1 + 21 new screenshots | `docs/reviews/visual-review-2.md` |

Everything else (engine, tests, AI, simulations, UI, docs) was written by the orchestrating
session directly. Budget: 15 agents allowed, 8 used.

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

| Check | Command | Result at the end of the session |
|---|---|---|
| Unit tests (engine, AI, charms, run flow, hints; includes a 500-game property test against an independent rules reference) | `npm test` | 5 files, 81 tests, all passing |
| Type-check + production build | `npm run build` | passes; `dist/` = 0.7 kB HTML + 21 kB CSS + 42 kB JS, relative asset paths, no external requests |
| Production bundle smoke | `npm run preview` then `BASE_URL=http://localhost:4173/ npm run screenshots -- <dir>` | all 21 screens rendered from `dist/`, no page errors |
| End-to-end flow (Playwright, system Chrome) | `npm run e2e` | 11 checks: finished game tallied on resume, cleared station → draft → next station, full-hand release, lost run → walk again, rival opens automatically, legal-move count under the constraint, illegal tile click ignored, rules sheet open/close |
| Independent rules audit | `npm run audit` | "ALL INVARIANTS HELD": exhaustive formation check over 2¹⁶ boards, 100,000 random games with legal sets compared to a PDF-based reference, 300 AI games with hint checks on 3,850 states, 400 full runs (802 loser-starts transitions) |
| Simulations | `npm run sim`, `npx tsx scripts/sim-hanamichi.ts`, `npx tsx scripts/sim-koikoi.ts` | outputs in `docs/sim/` |
| Screenshots | `npm run screenshots` | 21 PNGs in `docs/screenshots/` (phone 390, tablet 820, desktop 1440; 7 screens each) |
| Visual review | two fresh agents from screenshots | `docs/reviews/visual-review-1.md`, `visual-review-2.md` |
| Rules review | one fresh agent from the PDF and the code | `docs/reviews/rules-review.md` |

## Fixes from reviews

### Visual review, round 1 (`docs/reviews/visual-review-1.md`)

| # | Finding | What was done |
|---|---|---|
| 1 | Blocker: phone game screens overflowed the viewport by ~16px | Diagnosed with a Playwright script: the single-column grid track was `1fr` (= `minmax(auto, 1fr)`) and grew to a child's min-content width. Changed to `minmax(0, 1fr)` with `min-width: 0` on the areas; scroll width now equals the viewport. |
| 2 | Playable tiles barely marked; other tiles desaturated to illegibility | No more desaturation (only `saturate(.85)`); playable tiles lift 3px with a darker gold ring and shadow; sun, cloud and rain strokes got outlines/darker colours. |
| 3 | Paper Lantern reused gold, gave no feedback | Renamed **Firefly** with its own glowing icon; results shown as corner badges with text ("wins", "! Haru wins next"); an explicit message when no tile is marked. Playable treatment unchanged under the hint. |
| 4 | Desktop station screen looked broken | Intro uses the same three-column grid as play, with the road in the left rail. |
| 5 | Play screen never said how to win; instruction far from the board | Status line is now the instruction with icons ("Your move: take a cherry or bird tile"); a permanent "Win: 4 in a line · a 2×2 square · leave Haru no tile" line sits under the board. |
| 6 | "Lantern" meant three things | Lanterns are games only ("Game 1 of 3" label); the hint is the Firefly. |
| 7 | Result sheet hid the board | Desktop: tally docked in the right rail, board fully visible; phone/tablet: bottom sheet capped at 70dvh, warm blurred scrim; stale "worth now"/constraint cards hidden once the game is over; loss math added ("2 lanterns left · about 15 petals per win needed"). |
| 8 | Grey labels failed contrast | `--ink-3` darkened to #6b5f53 (≥5:1); caps labels 13px; season kickers darkened. |
| 9 | Phone header truncation, small targets | Subtitle hidden below 480px; help/close buttons 44px; chips ≥40px. |
| 10 | Station card misalignment | Charms are a fourth fact column; CTA left-aligned (full width on phone). |
| 11 | Rail panels wrapping / misaligned on tablet | Firefly button is a column layout; tablet panels constrained to the board width. |
| 12 | Tile art: maple as stars, pine as grass, generic cloud | Maple redrawn as a five-lobed leaf, pine as a layered umbrella pine with a trunk, cloud with a brush-edged outline; a 4×4 garden key added to the rules sheet. |
| 13 | Draft cards did not look like choices | "Take this charm ›" affordance, focus ring, vertically centred panel, icons on a faint 4×4 grid. |
| 14 | Title stats were noise; wordmark looked like a link | Stats hidden until a road has been started; wordmark not underlined; leaving a game asks for confirmation. |
| 15 | Unclear copy | "5 tokens", a real blossom icon instead of ✿, scoring line reworded. |

### Rules audit (`docs/reviews/rules-review.md`)

| # | Finding | What was done |
|---|---|---|
| 1 | High: the full-garden ending is an interpretation the PDF does not state | Kept the literal blocking reading but made it explicit: `FULL_GARDEN_RULE` constant, `fullGarden: true` on the result, dedicated wording in the status line, result sheet, rules sheet, `docs/RULES.md` and README, all labelled as an interpretation with the dissenting source noted. A draw ruling was not implemented (would make `winner` nullable across engine, AI and run). |
| 2 | Medium: "A win now is worth" was one petal too high | Now "a win on your next move": subtracts the tiles that must leave first, and shows the exact payout when a winning tile is open. Tests updated, including one that matches the real payout of the 13-move test game. |
| 3 | Low: double formation / formation+block precedence picks the charm | Documented in the Thorn Hedge rule text and the rules sheet; a test pins the fixed order rows → columns → diagonals → squares. |
| 4 | Low: 15/20-point matches missing; "+3" called official | `points15`/`points20` implemented and tested; wording changed to "3 petals for the win, plus the official victory points". The match formats remain engine-only (Hanamichi uses stations). |
| 5 | Low: saved runs trusted; stored `null` could crash | `loadJson` returns the fallback for non-objects; `validateRun` replays the saved game through the engine and discards any save that disagrees (tested). |
| 6 | Info: `newMatch` defaulted to player 1 | `first` is now a required argument. |
| 7 | Info: 32-bit seed cannot reach every layout | Noted; no change. |
| Test gaps | No property test, column/diagonal only via `findWin`, danger hint untested, no mutation checks | Added: a random-game property test against an independent reference (legal sets, illegal indices throw, one winner, no draws), column and diagonal wins through `applyMove`, two-formation precedence, `newGame(seed, 2)`, a danger-hint test, a hint immutability test, `validateRun` tests, and "next game starts with the recorded loser". The auditor's own invariant suite is kept as `npm run audit`. |

## Unfinished / known limitations

- **Full-garden ruling.** The engine rules an emptied garden as a block win for the last mover
  (literal reading of the PDF). A "draw" alternative is documented (`FULL_GARDEN_RULE`) but not
  implemented; doing so would make `WinInfo.winner` nullable across the engine, AI and run.
- **Rival personalities are flavour.** Haru, Natsu, Aki and the others differ only by search depth
  and random-move rate (as calibrated by simulation). The readable styles sketched in idea C
  (mirroring, mobility-hunting) were not implemented.
- **Classic match formats** (single game, first to 3 sets, 10/15/20 victory points) exist in the
  engine with tests but are not playable in the app; Hanamichi uses its station structure.
- **Balance is simulated, not human-tested.** Station targets come from an "EV-2" player model;
  real players may find station 6 (depth 4 rival) too hard or stations 1–2 too easy.
- **Not built:** idea A's Daily Road album, Winter Road unlock, charm album; sound; a coach mark on
  the first game.
- **Screenshots show a lost game.** The screenshot script takes the first legal tile, so the result
  screens in `docs/screenshots/` are losses; the win tally is exercised by unit tests and `npm run e2e`.
- **Commits are unsigned** (see `NOTES.md`): the repository asks for GPG signatures but the key's
  pinentry needs a person at the keyboard.
- The hint "danger" marker only looks one rival move ahead; deeper traps are not shown (by design,
  the Firefly is a small hint, not an engine).
