# Process

How the earlier attempt in this repository (a campaign game called *Hanamichi* built around
Okiya) became a digital edition of Okiya itself. Work done on 2026-10-12 on branch `fix/classic`.

## The brief

> Feedback on the earlier attempt: the campaign layer is not wanted, it had UI bugs on phones, and
> the tile designs were liked. Turn it into a digital version of the board game Okiya, faithful to
> the official rules, good enough to be sold as a real game. Two players on one device, and one
> player against the computer. It must work flawlessly on phones, tablets and desktops. Static
> site deployable to Vercel; all assets original or licensed for commercial use. Use the
> impeccable skill. Done when you would confidently ship it, with evidence.

Answers the client gave during the session (structured questions):

- End-of-game formats: **all three from the rules** (single game; first to 3 wins; victory points
  to 10, 15 or 20).
- Two players: **one shared screen**, no face-to-face table mode.
- Computer: **three levels** (Easy, Medium, Hard), Hard strong but beatable.
- Game-screen layout, chosen on the impeccable decision page after one re-roll: **Two halves**.

## What was kept, what was removed

| Kept | Removed |
|---|---|
| The rules engine (`src/engine/okiya.ts`) and its tests, corrected for ties | The campaign: stations, charms, petals, Firefly, run state machine, their tests and sims |
| The negamax AI (`src/engine/ai.ts`), re-tuned | The campaign UI (`app.ts`, charm art, rules panel) and its stylesheet |
| The 16 liked SVG tiles (`src/ui/tileArt.ts`), unchanged in drawing and colour | `docs/ideas`, `docs/judging`, `docs/reviews`, `docs/sim`, the old screenshots, the old DESIGN.md |

## Steps

| # | Step | Outcome |
|---|---|---|
| 1 | Read the official PDF again and the old engine. | The engine matched the sheet except for one case the sheet does not cover. |
| 2 | Researched that case: the garden emptied without a winner. | Bruno Cathala ruled it a **tie** on BoardGameGeek (thread 984327, 2013-05-30, verified through the BGG API). The old engine ruled it a win for the last mover; corrected. |
| 3 | Product context (impeccable `init`): asked the client three questions; wrote `PRODUCT.md`. | Formats, hot-seat model and difficulty count settled. |
| 4 | Layout (impeccable surface round): three structures dealt by the skill's roll, shown on its decision page with wireframes; the client re-rolled once, then chose **Two halves**. | Direction contract in `.impeccable/surfaces/src-ui-game-ts.md`. |
| 5 | Engine and match layer: nullable winner, ties in all match formats, opener after a tie, a match saved as facts and re-derived by replaying the engine, undo. | The engine's 56 tests (after removing the campaign's) updated for ties; 69 unit tests in the end. |
| 6 | AI: calibrated three levels by simulation against three player models; solved random gardens exactly; moved the search to a Web Worker. | `docs/evidence/difficulty.txt`, `perfect-play.txt`, `think-time.txt`. |
| 7 | UI built framework-free: home, setup, game, results, rules with diagrams, settings, menu; synthesised sounds; PWA (manifest, icons, generated service worker); `vercel.json`. | First build. |
| 8 | End-to-end suite on 11 device profiles in WebKit, Chromium and Firefox; layout invariants checked by script on every screen state. | Found and fixed the defects listed below. |
| 9 | Ship checks: offline play, axe-core, Lighthouse, `vercel.json` against Vercel's schema, the page served under the exact Vercel headers and CSP. | All green after two fixes (below). |
| 10 | Independent rules audit by a fresh agent. | "Faithful to the official rules: yes, with caveats" (labelling only); caveats fixed. |
| 11 | Impeccable finish review by a fresh agent; fix batch; verdict pass. | See "Finish review". |
| 12 | Documentation: README, RULES, this file, DESIGN.md (impeccable documenter). | |

## Decisions and why

- **The tie ruling over the literal reading.** The PDF's three win conditions do not cover a full
  garden. The designer's own answer is the closest thing to an official rule, so the engine ends
  such a game with `winner: null`. The one remaining gap, who opens after a tie (the sheet says
  "the loser"), is filled by alternating the opener; this is labelled as the edition's choice in
  the rules sheet, the setup notes and About.
- **Keep the world, change the structure.** The client liked the tiles and did not criticise the
  look, so the warm-paper tiles, vermilion and indigo stayed; the screen structure was chosen with
  the client (Two halves): the half of the player to move is lit, the garden sits on the seam.
- **Hard is not perfect.** With perfect play the opener wins 29 of 40 random gardens and the rest
  are ties; the second player never wins (`docs/evidence/perfect-play.txt`). A perfect computer
  would be unbeatable whenever it opens, so Hard searches five moves ahead.
- **Difficulty from numbers** (400 games per pairing, openings alternating; full table in
  `docs/evidence/difficulty.txt`):

  | Level | Settings | vs casual player | vs thoughtful | vs strong |
  |---|---|---|---|---|
  | Easy | depth 1, 35% random moves, may hand over a win | AI wins 19.5%, loses 72.3% | 9.3% / 77.3% | 5.0% / 82.8% |
  | Medium | depth 3, 10% random safe moves | 61.3% / 31.0% | 47.5% / 32.3% | 23.5% / 50.3% |
  | Hard | depth 5, never hands over a win | 83.0% / 11.5% | 73.5% / 12.5% | 53.0% / 22.8% |

  Think time: 12 ms at most for Hard (`docs/evidence/think-time.txt`); the computer still waits
  700 ms so its move can be followed, and its search runs in a Web Worker.
- **No framework.** A 4 × 4 board and a handful of sheets do not need one; persistent DOM nodes
  make moves animate and keep keyboard focus. The whole first load is 147 KB, fonts and textures
  included (Lighthouse).
- **Saved matches are facts, not state.** Only the setup, each garden, its opener and its moves
  are stored; scores, openers and results are re-derived by replaying the engine, so a tampered
  save is rejected rather than trusted.
- **Type.** Shippori Mincho B1 for display (a Japanese foundry's mincho with a fine Latin) and
  Source Sans 3 for everything else, both OFL and self-hosted. Zen Kaku Gothic New was tried first
  and replaced: its Latin "t" and "f" render mis-spaced at about 14 px under FreeType ("Wat anabe",
  "comput er"), found in screenshots and confirmed with a specimen; Shippori shows the same flaw
  below 18 px, so it is only used at 18 px and above.
- **Material.** The dyed cloth and the paper are real raster tiles drawn procedurally for this
  project (`scripts/render-textures.ts`), WebP, 22 KB and 15 KB, blended onto the colours.

## Defects found by testing, and their fixes

| Defect | How it was found | Fix |
|---|---|---|
| WebKit's web process **crashed** during play (6 of 6 stress runs) | A long e2e test crashed only in WebKit; bisected with patched APIs, then CSS overrides | The CSS `filter` dimming untakeable tiles was the trigger (0 of 8 crashes without it). Tiles now dim under a shade layer; no CSS filters on the board. |
| A tap made while the previous tile was flying (0.5 s) was **ignored** | e2e: the second hot-seat move did not register | The flight no longer locks input; a 260 ms guard swallows only an accidental double tap. |
| Seats **overflowed** short phones (iPhone with Safari toolbars, 393 × 659) | Layout invariants script | Compact seats, end-of-game reserve, rem-based reserves, container queries for narrow landscape seats. |
| Seat text **squeezed** when the garden shrank at the end of a game | Layout screenshots | Seat width follows the screen (and the garden only when wider). |
| The brush through a winning **row or column was invisible** | Visual review of captures | The SVG filter region was the stroke's zero-height bounding box; it is now built per stroke in user space (an oversized region is dropped by WebKit, which was the next failure). e2e now proves the stroke paints. |
| **Offline** reload failed for scripts and fonts | e2e offline test | The service worker matched cached assets with `Vary: Origin`; it now matches on the URL. |
| Registered custom-property (`@property`) transitions applied late in WebKit | Layout check timing | Removed; the lit half is an opacity cross-fade. |
| The rules sheet's scroll area was not **keyboard-reachable** | axe-core | Sheet bodies are focusable labelled regions. |
| Larger default text could push seats over the garden | 20 px root-size e2e on every profile | Layout reserves in rem; garden shrinks instead. |
| Gold focus ring on paper (sheets) at 1.6:1, placeholder text at 3.4:1 | The impeccable documenter, deriving DESIGN.md from the build | Focus is vermilion on paper and ink on the garden (both above 3:1); placeholder in ink-3 (5.3:1). |
| The UI face mis-spaced letters at about 14 px | Screenshots, then a font specimen | Source Sans 3 replaces Zen Kaku Gothic New (see Decisions). |
| The "g" of a player called **Diogo** was cut off | The client, on a real phone | Names end in an ellipsis, so their box clips; its line height (1.15) was shorter than Shippori's ascent plus descent. Clipping boxes now use a line height that holds the whole font box (1.5 for names, 1.45 for button details). A geometric e2e test checks every profile, and a control proves it catches the old value. |
| **How to play** text not centred in landscape | The client, on a real phone | On short, wide screens the bottom sheet spanned the screen with its text on the left. Sheets are at most 44rem wide and centred; the rules sheet is one reading column (38rem) so title and text share an edge. Checked on every profile by the layout test. |

## Verification (final run)

| Check | Command | Result |
|---|---|---|
| Unit tests (engine, AI, match flow, rules-page diagrams) | `npm test` | 4 files, 69 tests, all passing |
| Type-check and production build | `npm run build` | passes; service worker generated |
| End-to-end, 11 device profiles: iPhone SE 320 × 568, iPhone SE (3rd gen) 375 × 553, iPhone 15 393 × 659 and landscape 734 × 343 (WebKit, Safari's visible area); Pixel 7 412 × 839 and Android 360 × 640 (Chromium); iPad 810 × 1080 and 1080 × 810 (WebKit); desktop Chrome 1440 × 900, Firefox 1280 × 800, Safari 1920 × 1080 | `npm run e2e` | **289 passed, 0 failed**, 41 skipped by design (checks that belong to one or two engines); perf pass 11 of 11. Per profile: `docs/evidence/e2e.txt` |
| Layout invariants on every screen state and profile: no page scroll, nothing off-screen, seats never on the garden or the top bar, targets ≥ 44 px, no overflowing text | `e2e/layout.spec.ts` | included above |
| Large default text (20 px root) on every profile | `e2e/bigtext.spec.ts` | included above |
| Text in clipping boxes keeps its descenders and accents ("Diogo", "Ágqy Jóy"): every line's font box inside the clip box, with a control that fails on the old line height | `e2e/glyphs.spec.ts` | included above |
| Every sheet centred, title and text on one edge, on every profile | `e2e/layout.spec.ts` | included above |
| Real phone | the client, on their own phone over the local network | "Looks ok mostly"; two findings, both fixed (below) |
| Offline: after one visit a game against the computer plays with the network off | `e2e/ship.spec.ts` | passes (desktop Chrome, Pixel 7, Android 360) |
| Installable to the home screen: Chrome's own installability check | `e2e/ship.spec.ts` (`Page.getInstallabilityErrors`, `Page.getAppManifest`) | no installability errors, no manifest errors (desktop and both Android profiles) |
| Screen kept awake during a game, released on leaving it | `e2e/ship.spec.ts` | lock acquired at game start and released on Home (desktop and both Android profiles) |
| Accessibility, axe-core WCAG 2.2 AA rules on home, setup, rules, settings, game, menu | `e2e/ship.spec.ts` | 0 violations |
| Lighthouse 12.6, mobile and desktop, production build | see `docs/evidence/lighthouse.txt` | mobile 99 / 100 / 100 / 100 (performance, accessibility, best practices, SEO; first paint 1.7 s on simulated slow 4G, 147 KB transferred); desktop 100 / 100 / 100 / 100 |
| Vercel's own build pipeline on the final commit | `npx vercel@44.7.3 build --yes` (local, no account) | Build Completed; Build Output v3 static files identical to the tested `dist/`; routes carry the immutable asset cache, `no-cache` service worker, security headers and CSP (`docs/evidence/vercel-build.txt`) |
| Clean clone, as a CI or Vercel would build it | `git clone`, `npm ci`, `npm run build` | passes |
| `vercel.json` against Vercel's published schema (with a negative control) | ajv, draft-07 | valid; the broken copy is rejected |
| Every shipped file accounted for: origin and licence | `docs/ASSETS.md` | all original, or OFL-1.1 (two typefaces, licence texts shipped), or MIT (Vite's preload helper); no file loaded from another domain |
| The page under the exact `vercel.json` headers and CSP | `e2e/vercel.spec.ts` + `scripts/serve-vercel.ts` | no CSP violation in Chromium or WebKit; hashed assets `immutable` |
| Independent rules audit (fresh agent) | its own scripts | 2,948,961 states of 200,000 random games and 250,037,632 nodes of 4 full game trees compared with an independent model: 0 mismatches; 48,862 of 48,862 forged saves rejected; Hard optimal in all 617 endgames of ≤ 5 tiles; UI: 204 turns, 191 illegal taps, 19 endings all correct |
| Impeccable detector | `impeccable detect --json` on the UI files | 0 errors, 0 warnings (one layout-transition warning and one inline-font warning fixed); 62 advisories that only note values not yet named in DESIGN.md: the tile-art pigments, shadow and highlight tints, a few one-off radii and type sizes |
| Raster provenance | `impeccable embed-prompt --scan public src/ui/textures` | 8 rasters, 0 missing |

## Finish review

A fresh `impeccable-finish-reviewer` judged the build against the direction contract (code-led,
so no comp) from 15 screenshots plus the per-profile captures.

- **First review: fix.** Eight material fixes: the UI typeface had silently become each system's
  own font; the cloth and paper materials were invisible; "Take a iris"; a "Your turn" eyebrow
  label; token pips and match wins drawn as look-alike dots; seats at different heights on
  desktop and not aligned with the garden on tablet; orphaned words and a truncated label; raster
  provenance and the credit line. It kept, explicitly: the vermilion/indigo split with the garden
  on the seam, the lit-versus-sunk turn signal, the tile art, the brushed formations.
- **Fix batch** (commit `5ffd660`): Source Sans 3; procedural cloth and paper textures; articles;
  the order sentence leads; token-shaped pips, gold seals, a compact count; seats pinned to the
  garden's top edge; balanced wrapping; vermilion in the sheets; "Game design by"; provenance in
  every raster.
- **Verdict pass: all 8 resolved**, two regressions found (the new font's licence notice was not
  shipped; a separator could start a line). Both fixed (commits `ce957e8`, `329fa79`).
- **Second verdict pass: ship** (scoped by the reviewer to the listed fixes and regressions).

## Agents used

| Role | Input | Output |
|---|---|---|
| Rules auditor (fresh, general-purpose) | the PDF text, the BGG ruling, the code | Verdict "yes, with caveats"; findings: stale docs, unlabelled tie-opener choice, the "rain or cloud" name; all fixed |
| Impeccable finish reviewer (fresh) | the request, answers, contract, screenshots | Disposition and material fixes, then a verdict pass (above) |
| Impeccable documenter (fresh) | the finished build, the contract, PRODUCT.md | `DESIGN.md` and `.impeccable/design.json`; flagged two contrast defects and token drift, fixed afterwards |

Everything else (engine, AI, UI, tests, scripts, docs) was written in the main session.

## Evidence on disk

- `docs/evidence/`: Lighthouse, difficulty ladder, perfect-play solve, think times, e2e summary,
  Vercel build output summary.
- `docs/ASSETS.md`: every shipped file, its origin and its licence.
- `docs/screenshots/`: phone, phone landscape, tablet and desktop: home, your turn, a won game,
  the setup sheet, the rules sheet (captured by `scripts/capture.ts` from the production build).
- `test-screens/` (not committed): every layout state on every profile, written by each e2e run.

## Outside this build

Nothing known is open in the build itself. These are steps only the client can take; none of them
changes the code:

- **Not for sale.** Asked about the name licence, the client answered that the game will not be
  sold; "sold as a real game" is the quality bar. The edition credits the designers and the
  publisher, uses none of their art or marks and claims no endorsement.
- **Deployment.** Not published, by the client's choice (asked: "Don't deploy"). Deployability is
  demonstrated: Vercel's own build (`vercel build`, CLI 44.7.3, run locally with no account)
  completes and emits Build Output v3 whose static files are identical to the tested `dist/` and
  whose routes carry the cache rules, security headers and CSP of `vercel.json`. `vercel.json`
  validates against Vercel's schema, the build was tested under its exact headers, and a clean
  clone builds with `npm ci && npm run build` (the build type-checks the tests too, so it needs the
  devDependencies, which Vercel installs by default; no package downloads browsers on install).
  Importing the repository in Vercel (or `vercel --prod`) is the remaining step.
- **Share image URL.** `index.html` points `og:image` at `./og-image.jpg`; social scrapers want an
  absolute URL, so set it to the production domain once it exists.
- **Physical devices.** No phones are attached to this environment, so the systematic device
  checks ran in emulation (11 profiles in WebKit, Chromium and Firefox). The client then played
  the production build on their own phone, served on the local network for the test: "looks ok
  mostly", with two findings (the clipped "g", the landscape rules sheet), both fixed and now
  covered by tests. The test host was closed afterwards, as asked. Offline play, the home-screen
  install and the wake lock need a secure context, which a plain-http LAN address is not; they
  are verified in Chrome on localhost (a secure context) and behave the same on the https site.
- **Sound on iOS** follows the ringer switch, as Web Audio does in Safari.
- **Font licences.** Both typefaces are OFL and their licence texts ship with the site. Source Sans
  3 carries the Reserved Font Name "Source"; the files are the unmodified Google Fonts web subsets
  distributed by Fontsource under that name.
- **Advisory design-system notes.** The detector lists 62 values not yet named in DESIGN.md (tile
  pigments, shadow tints, a few radii and sizes). They are intentional; naming them is
  housekeeping, not a defect.
