# Process

How the earlier attempt in this repository (a campaign game called *Hanamichi*) became **Paper
Garden**, a digital edition of a two-player abstract game designed by Bruno Cathala, played by its
official rules. The client's brief named the published game; at the end they ruled that the
product cannot carry that name, and it was renamed (see "The rename"). Work done on 2026-10-12 and
2026-10-13 on branch `fix/classic`.

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
| The rules engine (`src/engine/garden.ts`, then `okiya.ts`) and its tests, corrected for ties | The campaign: stations, charms, petals, Firefly, run state machine, their tests and sims |
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
| 13 | A read-only audit of the finished build by 170 agents: 15 finders (rules, game flow, AI, layout fitting, accessibility, offline and deploy, evidence, phones, tablets both ways, two players on one tablet, desktop), each finding checked by three adversarial verifiers, then a critic listing what nobody tested. | Rules engine and AI clean (an independent model agreed on 100,000 games and 20,000 matches). 46 findings confirmed (5 major, 28 minor, 13 trivial), 5 dropped, 17 untested areas named. Fixed in the fourth pass (below). |
| 14 | The rename: the client ruled that the product cannot carry the published game's name. | Renamed **Paper Garden** (see "The rename"). |
| 15 | A provenance check by four fresh agents: the tile art against the published tiles, the rules text against the PDF, every shipped file and the overall look, and the whole git history. | Nothing copied; three corrections (see "The rename"). |

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
  make moves animate and keep keyboard focus. The whole first load is 151 KB, fonts and textures
  included (Lighthouse).
- **Saved matches are facts, not state.** Only the setup, each garden, its opener and its moves
  are stored; scores, openers and results are re-derived by replaying the engine, so a tampered
  save is rejected rather than trusted.
- **Type.** Shippori Mincho B1 for display (a Japanese foundry's mincho with a fine Latin) and
  Source Sans 3 for everything else, both OFL and self-hosted. Zen Kaku Gothic New was tried first
  and replaced: its Latin "t" and "f" render mis-spaced at about 14 px under FreeType ("Wat anabe",
  "comput er"), found in screenshots and confirmed with a specimen; Shippori shows the same flaw
  below 18 px, so it is only used at 18 px and above: a player's name that the fit shrinks below
  that is set in Source Sans 3 bold (fourth pass).
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
| Gold focus ring on paper (sheets) at 1.6:1, placeholder text at 3.4:1 | The impeccable documenter, deriving DESIGN.md from the build | Focus is vermilion on paper and ink on the garden (both above 3:1); placeholder in ink-3 (5.5:1). |
| The UI face mis-spaced letters at about 14 px | Screenshots, then a font specimen | Source Sans 3 replaces Zen Kaku Gothic New (see Decisions). |
| The "g" of a player called **Diogo** was cut off | The client, on a real phone | Names end in an ellipsis, so their box clips; its line height (1.15) was shorter than Shippori's ascent plus descent. Clipping boxes now use a line height that holds the whole font box (1.5 for names, 1.45 for button details). A geometric e2e test checks every profile, and a control proves it catches the old value. |
| **How to play** text not centred in landscape | The client, on a real phone | On short, wide screens the bottom sheet spanned the screen with its text on the left. Sheets are at most 44rem wide and centred; the rules sheet is one reading column (38rem) so title and text share an edge. Checked on every profile by the layout test. |
| The **New game** sheet in landscape showed one option at a time between its title and its Start button | The client, on a real phone (second pass) | On short, wide screens the sheet takes nearly the full height, Start moves into the title row (close stays at the far right), and the form uses two columns with tighter cards. The layout rules now require a sheet to keep at least 45% of its height for its content. |
| The two-column form above **never applied**: its rules sat before the form's base rules in the stylesheet, which overrode them, and the size sweep still passed | Looking at a WebKit screenshot of the fix, before handing it back | The block now follows the rules it overrides. A new sweep check requires every section of the form (heading and first option) to be on screen without scrolling on a phone held sideways; run against the old stylesheet it reports "Match" off screen at every landscape size tried, so it would have caught this. |
| "Chosen at random to open the match" **cut off** in portrait | The client, on a real phone (second pass) | Taller name lines (the descender fix) made seats overflow on phones about 760 to 800 px tall, a band no named profile covered. Seats were made to fit themselves by measurement, but the first step they took was to drop the note: the wrong fix, corrected in the third pass (below). |
| A tap right after the **computer's** move was ignored for 260 ms | The size sweep | The double-tap guard now follows only a person's own move. |
| Text reflowed after the layout was fitted, when a font weight first used at the end of a game arrived late (WebKit) | The size sweep, then a timing probe | All font faces load at start-up; seats refit when their content changes size or a font finishes loading. |
| Cells under 44 px, buttons off-screen and overflowing text on 568 to 640 px wide landscape phones; home actions off-screen at 520 px tall | The size sweep | Narrower minimum side columns in landscape, home columns with guaranteed minimum widths and a garden sized to what is left, tighter home actions on short screens. |
| A refused tap added a line under the order card, which tight seats could not hold | The size sweep | The card's own line reads "Not that tile: take an iris or bird tile" for a moment instead; the tile shakes; screen readers still hear the reason. (Fourth pass: "Only an iris or bird tile", which is never longer than the order it replaces.) |
| The opener's note **did not show** on the client's phone: the second-pass fit hid it | The client, on a real phone (third pass) | The note is never something the seats shed. When seats do not fit, both step together: the row of tokens becomes a count; then they take room from the garden (at most a tenth of it, and never so much that a tile drops under 44 px); then the type steps down a size, and as a last resort they may take up to 15% of the garden. Hiding the note is left only as a last resort that the sweep proves no tested screen reaches. (The audit then found it hidden on screens under 500 px tall, below the sweep's sizes, and the garden still able to shrink mid-game: fixed in the fourth pass.) The steps reached are kept per screen size and per phase (playing, over), so the garden never changes size during a game. The sweep now asserts, at every size, that the note shows whole and that the garden neither moves nor resizes after the first move. |
| **Undo between two players** made no sense | The client (third pass) | Undo exists only against the computer (it takes back your move and its reply). Two players on one device have no Undo button and no Undo in the menu, as at the table. |
| The menu's **"Home (the match is saved)"** | The client (third pass) | "Home". |
| A **16-letter name ran out of the instruction card** and over the garden; a name cut short ended in raised dots ("Diogom···"); names were cut short even on a 1440 px desktop | The client, screenshots of a desktop browser window at small and large sizes (third pass) | The card no longer repeats the name (the name is just above it, and later turns never named the player); screen readers still hear it. Names shrink to fit on one line (down to 58%), then wrap onto two or three lines, breaking inside a word if there is no space, and both names share one size; an ellipsis is a last resort the sweep shows is never reached. The raised dots were Shippori's Japanese ellipsis (measured: drawn 10 to 15 px above the baseline at 32 px, where Source Sans 3's sits on it); a one-character face now lends the Latin ellipsis to the display font, from the file already shipped. Long words in sentences break where they must; names are isolated (`<bdi>`) so a right-to-left name keeps the sentence's order. Why no test caught it: every test name had a space. The sweep now uses the longest names the form accepts in wide letters, a new layout rule fails any text that runs outside its box, and another fails any name or summary cut short. |
| The loser's name in "… has no tile to take" went into the page **unescaped** | Reading the code while fixing long names | Escaped (a name like `<b>Ren</b>` shows as typed); covered by `e2e/names.spec.ts`. |
| With **Reduce Motion** on, every element animated every property change for 0.001 ms, and WebKit reported values from before a change until the next frame | Tracing the seats' fit in WebKit, which kept stepping up while nothing it measured moved | The reduced-motion rules set every transition to 0.001 ms; as `transition-property` defaults to `all`, that turned on a transition of every property everywhere. They now set 0 s (nothing waits for a transition to end). This affected any player with Reduce Motion, and every test (they run with it), and explains some of the WebKit-only timing failures of the second pass. A regression test checks that a style change applies at once and starts no animation. |
| Tall fallback fonts (Arabic in Firefox) read as an overflowing name, so both names shrank to their smallest | `e2e/names.spec.ts` (Arabic, Japanese, accents, apostrophes, markup characters) | The name box keeps 0.3em of room for ink above and below (taken back by negative margins), and only a hidden line, not ink past the line box, counts as overflow. |
| The full Continue summary with two long names pushed the home buttons off 300 to 320 px tall landscape screens | The size sweep, after summaries stopped being cut short | On short landscape screens the New game button's hint (which repeats what its sheet shows) is left out when Continue is there, and the summary is a step smaller. |
| Two test runs at once failed each other | A sweep failing with missing trace files | Playwright empties the results folder when a run starts; runs are now sequential. Not a product defect, recorded because it briefly looked like one. |
| The cherry glyph in "Take a cherry … tile" **touched the word before it**; the poem glyph left a wide gap | The impeccable finish reviewer, hunting defects in 60 screenshots (10 states × 6 sizes, WebKit and Chromium, longest names) | Each inline glyph reused its tile drawing in a fixed 100-unit box, and the cherry branch runs past it (measured −2 to 104). Each glyph's box is now cropped across to its own drawing, keeping the shared height, so every glyph is as wide as what it draws and sits the same distance from its word. |
| The longest names did not fit their **New game name fields** on phones and small windows (the field scrolled) | The same review | The colour ("Vermilion", "Indigo") sits above the name, so the input has the field's whole width; on the narrowest phones held sideways (568 px) the form's names column takes the larger share. The sweep now checks that every name field shows its whole value. The input stays at 16 px, below which iOS zooms in on focus. |
| A long name's seat header could take two shapes on the same screen (the count and score beside the name, or under it) | The same review, and its second verdict pass (a first fix still let the shape depend on how tight the seats were, which differs between a game and its end) | One rule in every phase and on every screen: the name shrinks beside the count and score down to 80%, then they go to a line of their own and the name returns to full size; then it shrinks, then wraps. The rule is measured with the name's line as full as any phase makes it (the token count shown, the score two digits wide), and only what is there is drawn. Two verdict passes found the steps on the way: the token count joined the name's line only once the row of tokens gave way to it (a different decision mid-game and at a game's end, at 320 px); reserving its place on screen instead shrank "You" and "Computer" in side columns and indented a lone one-digit score. On the smallest phones (520 px tall) the extra line for the count and score left the opener's note no room (the sweep); there, and only there, the name shrinks beside them to 58% instead. Whether a screen is that tight is decided from its geometry alone (portrait, and a garden that cannot give 30 px before tiles drop under 44 px), never from what a game happens to show, so every match on a screen has the same header. |
| "+4 / points" and "opens / next" split across lines | The same review | No-break spaces in those phrases. |
| End-of-match buttons and the opener's note ran to 5 px from the screen's bottom edge | The same review | Seats keep 10 px at their edges, and the fit counts that as off-limits, so content takes room from the garden instead of the margin. At 320 × 568 that left the note no room with the longest names, so tight seats also tighten their spacing and the card's tile; the sweep proves the note shows there. |
| **Short names cut short** with an ellipsis in Chrome on a high-density desktop screen ("Comput…" at 1440 × 900, "Dio…" at 667 × 375), a regression of the new name fitting | The finish reviewer's verdict pass on the fixes | The names were a fraction of a pixel too wide (137.3 px of text in 137 px), and a clamped box in Chromium ellipsises any overflow while reporting none: not in its scroll size, and not in its text's line boxes, which it clips to the edge. The fit now measures each name with the clamp lifted and keeps a pixel to spare; the test rule measures the same way with no tolerance. The rule run against the old build reports "Computer … too wide" at scale 2 and nothing at scale 1, so the desktop Chrome project now runs at scale 2 (a high-density laptop) and Firefox, at scale 1, joins the size sweep. |
| A long name's token stood alone on a line above the name at 667 × 375 | The same verdict pass | The stacked header used a width in the name's own (scaled) em; the count and score now go below after an empty full-width break, and the name takes the rest of its line beside the token. |
| The header changed shape when a score reached two digits ("0/20" to "11/10") | The same verdict pass | The layout is measured with the score two digits wide from the first game (drawn at its true width). |
| "rising sun" and its glyph ran past a narrow instruction card (640 × 300, 700 × 360, 1133 × 744) | The size sweep, once glyphs took their true widths | Only the glyph and the first word are kept together; "sun" may go to the next line. |
| With the two-digit score width, the opener's note had no room at 320 × 640 with the longest names | The size sweep | As a last step before a note could be left out, the seats may take up to 15% of the garden (tiles there stay at 58 px). |

## Fourth pass: the audit's findings

The audit (step 13) was read-only; its findings were fixed in the main session, in sequence, as
most touch the same two files (`game.ts`, `styles.css`). Every fix was probed with the auditors'
own reproduction scripts; the main ones now have e2e tests that fail on the old code (each was
checked by putting the old behaviour back for one run).

| Finding | Severity | Fix |
|---|---|---|
| The opener's note hidden at the opening move on portrait screens under 500 px tall, and on small phones at 20 px text; the garden able to shrink in the middle of a game with no resize; the seat header changing shape between play and a game's end; a refused tap growing the card and pushing the note down | 2 major, 3 minor | One cause: the seats' fit reacted to what had appeared so far. It is now planned once per screen size from the tallest content a game can show (the opening card with its note, the longest order), put in the seats for a moment between two frames, in both arrangements. Steps: the pips become a count, and the seats take up to a tenth of the garden; the type steps down (90%) and they may take 15%; the opener's note moves to the waiting player's seat, which has room at an opening move; the type steps down again (80%); only then is the note left out. The seats keep their width through a game's end. The refusal reads "Only a cherry or rising sun tile", never longer than the order, and the card keeps its height. The sweep now covers seven portrait sizes from 454 to 500 px tall and accepts the note in either seat. |
| A font licence opened from Settings › About replaced the cached game: offline, the app opened as a licence text; a first launch after a deploy could leave a blank page offline; offline, pages below the site's root were blank | 1 major, 2 minor | The service worker no longer writes pages into its cache: each version caches its page with its files at install. Offline, a cached file (a licence) opens as itself, a path below the root goes to the game, anything else gets the game's page. On activation every older cache is deleted, whatever its name. e2e: a licence opened from Settings, then the game offline. |
| Back left the "Restart the match?" confirmation open over Home, where confirming reset the match | minor | Leaving the game closes every open sheet. e2e test. |
| A double tap on Undo took back two rounds; the menu's Undo froze at the moment the menu opened; Undo enabled during the player's own flight | 2 minor, 1 trivial | A 400 ms guard after an undo (e2e test); the menu follows the game live; flights are counted, so a reply during the computer's flight keeps Undo off until both land. |
| The match open in two tabs: a move in the stale tab overwrote the other's progress | minor | A tab takes up what another tab saved, rather than overwriting it. |
| Keyboard focus lost to the page after Start, Continue, Next game, Play again, the last Undo and Home; a finished game continued with a turn instruction; moves made while a sheet was open never announced; the compact token count missing from the accessibility tree; "You's token"; labels on elements without a role; the spoken result lowercasing a name and leaving out the points | 3 minor, 5 trivial | Focus goes to the next useful control (the garden, the result's button, Home's first action); the result is announced on Continue and again when a sheet closes; labelled counts, scores and the garden key have an image role; "Your token"; the result sentence keeps the name as typed and says the points. |
| Gold "+4 points" on lit vermilion at 3.3:1; "/8" at 70% opacity, 3.1:1; the New game hint on vermilion, 3.7:1 | 3 minor | Points are cream on vermilion (gold stays on indigo); "/8" at full opacity; the hint at 92%. |
| Windows High Contrast removed the gold ring and shade that tell which tiles may be taken | critic's gap | The garden, the order card's tile, the chips and pips keep their own colours under forced colours. |
| The Menu and Undo buttons 1 px from the top edge on short screens, their focus ring cut off | minor | A slightly taller top bar there; the ring is drawn inside those buttons. |
| With "Lift the tiles you may take" off, a mouse hover still lifted only the legal tiles | minor | While a person may move, every tile answers the pointer alike. |
| Phrases split across lines ("Game / 1", "First to 20 / points", "open the / match.", "this / device", "a / friend"), end buttons on two lines at 700 × 500, the wordmark touching the edge on short landscape screens | 2 minor, 4 trivial | No-break spaces in short phrases, end buttons kept on one line, the wordmark sized from its column. |
| A press on the backdrop released inside a sheet closed it; a damaged save with names that are not text restored "null" | 2 trivial | Only a press that starts and ends on the backdrop closes a sheet; such names fall back to the defaults. |
| Documentation and evidence: the share image without its provenance; the Vercel and clean-clone builds run on an earlier commit; verification rows with no evidence file; screenshots from an earlier build; commit hashes that changed when the commits were re-signed; stale sizes, sheet widths, the "Eighteen Pixel Rule", Node 20, the 404 page and sub-paths | 2 major, 9 minor, 2 trivial | `scripts/capture.ts` writes the share image's provenance into it; both builds rerun on the final commit; new evidence files (`rules-oracle.txt` from `scripts/rules-oracle.ts`, the auditor's independent model; `vercel-schema.txt`); screenshots recaptured; commits are cited by subject; README, DESIGN.md and this file corrected. |

Two more, found by the final size sweep after the rename: a refused tap's held card height
carried over a resize (a desktop window made small within 2.6 s of a refusal kept the card at its
1440 px height, so it left the screen at 520 px tall, in Chrome and Firefox windows alike), and the
corrected credit line, now shorter, stayed on one line 2 px wider than its column in WebKit at
812 × 414 instead of wrapping. The held height is now measured fresh and dropped when the screen
size changes, and the fit also plans for the refused order; in landscape the credit is two lines
by design, like the wordmark above it.

A code review of this pass's changes (a fresh agent, reading the diff) then found eight more,
all fixed:

- The focus fix moved only the garden's tab stop, so after Start, Continue, Next game and the last
  Undo, focus still fell to the page. It now goes into the garden, for a player using the
  keyboard only: after a touch, WebKit draws a focus ring on a tile focused by script (a new e2e
  test on the six WebKit touch profiles caught it on the first try). e2e tests for both.
- Replanning the fit on a resize rebuilt the seats from their HTML: a rotation or zoom at a game's
  end dropped focus from Next game, and one during a tile's flight could leave the order card's
  tile hidden. The seats' own nodes are now set aside and put back, and focus restored. e2e test.
- A press that began on the backdrop and was released inside a sheet still closed it (the click
  goes to the dialog, which holds both ends). Release is now checked too. e2e test.
- The service worker deleted every cache on its origin, which on a shared host (a project page)
  would include other sites'. It now deletes only this game's, and looks files up in its own
  version's cache only.
- At a game's end the seats' type grew back from 80% to 90% on the smallest screens, changing the
  header; it now keeps its size. Names were fitted at full type size and never revisited when the
  type stepped down, so a long name could stay stacked when it would fit beside its count; while
  planning they are now fitted afresh at each step. And the plan's longest note from the other
  seat said "Computer was chosen…" where the game says "The computer was chosen…".

The client's last phone check found one more: the New game sheet forgot the choices made in it
(opponent, level, format, typed names) unless a game was started, so closing it to read the
rules meant typing two names again. Its choices are now remembered as they are made; they only
set what the sheet shows next time, never a match in progress. Two reviewers (code, and a player
on two phones) then found the victory points target still lost when another kind of match was
looked at before closing; the last target picked is now remembered on its own. e2e test for both
(each fails without its fix).

Accepted, not fixed: on portrait screens under 500 px tall (and on the smallest phones at 20 px
text) tiles are 37 to 43 px, under the 44 px target. The seats need that room for what a player
must read, and no smaller layout keeps both; such screens are rare (a phone with its keyboard or a
split screen). Dropped by the verifiers: five (a WebKit landmark detail; the relative `og:image`
URL, already listed under "Outside this build"; the tile art's own overlaps, which are the
client's approved art; a letter gap in one Chromium capture; the longest names drawn smaller on a
larger iPad than on a smaller one).

## The rename

The client ruled (2026-10-13) that the product cannot be called by the published game's name.

- **Choosing the name.** Agents drafted names from four angles (Japanese words, English, coined
  words, the mechanics). The four strongest (Paper Garden, Pinewind, Petal & Pine, Bird & Bough)
  were searched for existing games and apps, with no exact match; the client chose **Paper
  Garden**, which names the board itself.
- **Credit.** The client chose to credit the game's designer only, with no published title,
  publisher or brand. The provenance check then found that the credit line named Cyril Bouquet as
  co-designer: the official rules sheet credits Bruno Cathala under its design icon and Cyril
  Bouquet under its art icon, and this edition uses none of the original art. The product now
  reads "Game design by Bruno Cathala".
- **Scope.** Everything a player sees (wordmark, page and app titles, manifest, share image, 404
  page, rules sheet, About), the code (`src/engine/garden.ts`, storage keys, the service worker's
  cache), tests, scripts and docs. The published name remains only where the sources are cited
  (`docs/RULES.md`), in the client's brief quoted above, and in the git history. The built site
  contains neither the old name nor the publisher's (checked by search over `dist/`). Saved
  matches from the preview builds are not carried over, so nothing in the shipped code names the
  old keys.
- **Provenance** (four fresh agents, each trying to refute any suspected copy before reporting it):
  - *Tile art*: original. Compared motif by motif with the official print-and-play tiles and two
    retail editions: the product's flat icons (a small sun disc, one swallow silhouette, a weather
    cloud, an umbrella pine) share only the traditional hanafuda subjects, not composition, line
    or layout. The art was drawn in code in this repository's first session, after the official
    PDF had been viewed; its first poem slip shared a hung tanzaku's generic traits, and the slip
    that ships was redrawn since.
  - *Rules text*: no sentence of the PDF ships. Fixed: the engine's header comment (not shipped,
    but public in the repository) used a few of the PDF's phrases, and a test name its word
    "round"; both reworded. The rules sheet's worked example (cherry with bird) was the PDF's own
    example, though written and drawn anew; it is now maple with rain. The PDF has no rules
    diagrams, so the sheet's diagrams have no source to copy.
  - *Shipped files and look*: every file original or OFL-licensed (fonts byte-identical to the
    Fontsource packages; textures and icons re-rendered identical from their scripts). No title,
    publisher name or logo on any screen. The overall look (vermilion and indigo halves, lacquer
    tokens without figures, a serif wordmark) is not close to the published game's (portrait
    tokens, full-bleed painted tiles, a hand-lettered logo).
  - *Git history*: no scan, photo, PDF page, logo, box art or font file was ever committed, and
    no ignored folder leaked. The old name is in every earlier commit and in three commit
    subjects.

## Verification (final run)

| Check | Command | Result |
|---|---|---|
| Unit tests (engine, AI, match flow, rules-page diagrams) | `npm test` | 4 files, 69 tests, all passing |
| Type-check and production build | `npm run build` | passes; service worker generated |
| End-to-end, 11 device profiles: iPhone SE 320 × 568, iPhone SE (3rd gen) 375 × 553, iPhone 15 393 × 659 and landscape 734 × 343 (WebKit, Safari's visible area); Pixel 7 412 × 839 and Android 360 × 640 (Chromium); iPad 810 × 1080 and 1080 × 810 (WebKit); desktop Chrome 1440 × 900 at scale 2 (a high-density laptop), Firefox 1280 × 800 at scale 1, Safari 1920 × 1080 | `npm run e2e` | **373 passed, 0 failed**, 89 skipped by design (checks that belong to one or two engines, or to touch or mouse); sweep pass 94 of 94; perf pass 11 of 11 (those two on the commit before the last, which changed no layout or timing). Per profile: `docs/evidence/e2e.txt`, written by `scripts/e2e-evidence.ts` from the three passes' JSON reports |
| Layout invariants on every screen state and profile: no page scroll, nothing off-screen, seats never on the garden or the top bar, targets ≥ 44 px, no text outside its box, no name or summary cut short | `e2e/layout.spec.ts` (rules in `e2e/helpers.ts`) | included above |
| Large default text (20 px root) on every profile | `e2e/bigtext.spec.ts` | included above |
| Text in clipping boxes keeps its descenders and accents ("Diogo", "Ágqy Jóy"): every line's font box inside the clip box, with a control that fails on the old line height | `e2e/glyphs.spec.ts` | included above |
| Every sheet centred, title and text on one edge, on every profile | `e2e/layout.spec.ts` | included above |
| **Size sweep**: the same layout rules at 176 sizes per state (six phone widths from 320 to 430 against fourteen heights from 520 to 932 in portrait, eight landscape heights from 300 to 430 against ten widths from 568 to 932, six tablets both ways), 183 with seven desktops, on 14 states in 12 tests, the two-player ones with the longest names the form accepts ("You" and "Computer" against the computer): home, the opening (note), game 2's opening, a win by blocking with Next game, a tie, a victory-points match won, a refused tile, a match won against the computer, the new-game sheet both ways (at-a-glance on phones held sideways; whole names in the fields), the rules sheet, and the menu, settings and a confirmation; plus, at every size and at seven shorter portrait sizes (454 to 500 px tall), a fresh opening checked for the opener's note shown once and whole, in either seat, and the garden unmoved after the first move. In WebKit, in Chromium as a phone, and in desktop Chrome (scale 2) and Firefox (scale 1) windows made as small as a phone | `e2e/sweep.spec.ts` (`npm run e2e` runs it as its own pass) | 52 of 52 passed |
| **Real taps everywhere**: per size, a two-player victory-points match set up by taps (one whole game, the next game, the menu, How to play, home and continue, restart through its confirmation), then a whole single-game match against the computer and home, every step a real tap or click with no `force`, so each control must be visible, steady, enabled and the topmost thing under the finger; 11 phone and tablet sizes (320 × 568 to 1024 × 768, both orientations) in WebKit and Chromium, 3 desktop sizes in Chrome, Firefox and Safari, and the 11 phone and tablet sizes again in a desktop Chrome window (mouse); one player named with 16 wide letters; no Undo between two players | `e2e/reach.spec.ts` (in the sweep pass) | 42 of 42 passed |
| Names in any script, as typed: Arabic and Japanese, accents and apostrophes, characters that mean something in markup; at phone, phone-sideways and desktop sizes, in game, in the result line and on home | `e2e/names.spec.ts` | included above (WebKit, Chromium phone, desktop Chrome, Firefox) |
| With Reduce Motion, a style change applies at once and starts no transition | `e2e/names.spec.ts` | included above, every profile |
| Two players have no Undo, on screen or in the menu; the menu says Home; a double tap on Undo takes back one round; Back from a game closes a confirmation left open and keeps the match; keyboard focus goes into the garden after Start, Continue and Next game and stays on the result's button through a resize, and no focus ring appears after a touch; a press dragged from the backdrop into a sheet does not close it | `e2e/game.spec.ts` | included above |
| Real phone | the client, on their own phone and a desktop browser over the local network | three passes: "looks ok mostly" (two findings), "found problems" (two), "looks better in general" (the note, undo, the Home label, long names); every finding fixed and covered by a test (Defects, above) |
| Real phone, final build | the client, on their Android phone, on Vercel's preview of pull request #1 (the same files as the tested build); a shared coworking network blocked the local test host, so the preview replaced it | 1, the opener's note with a 16-letter name in portrait and the header through a game's end: works; 2, rotating mid-game: works (no iPhone to hand, so Safari's toolbars rest on the WebKit tests); 3, the New game sheet held sideways: works; 4, undo against the computer, none between two players, "Home" in the menu: works; 5, reduced motion: works; 6, installed to the home screen (in Brave, Chromium's engine): opens as its own app and stays clear of the status and navigation bars, which Android fills with the game's indigo theme colour; 7, offline after one visit: "seems ok"; 8, the screen kept awake during a game: "seems ok" |
| Real phone, after the rename | the client, on their Android phone, on Vercel's preview of pull request #1 at the commit "Paper Garden: the rename, the audit's findings, a provenance check" | the new name and credit: works; rotating mid-game, also during the computer's flight: works; a refused tile ("Only a … tile", the shake): works; a swipe down from the top, a long press on a tile and on a name, a double tap on the cloth: nothing harmful; switching to another app during the computer's think and coming back: works. Found one defect, fixed: the New game sheet forgot choices unless a game was started (Fourth pass, above). The largest text and the offline home-screen app were left out by the client. |
| Offline: after one visit a game against the computer plays with the network off; a font licence opened from Settings never takes the game's place, and offline a licence opens as itself and a path below the site leads to the game | `e2e/ship.spec.ts` | passes (desktop Chrome, Pixel 7, Android 360) |
| Installable to the home screen: Chrome's own installability check | `e2e/ship.spec.ts` (`Page.getInstallabilityErrors`, `Page.getAppManifest`) | no installability errors, no manifest errors (desktop and both Android profiles) |
| Screen kept awake during a game, released on leaving it | `e2e/ship.spec.ts` | lock acquired at game start and released on Home (desktop and both Android profiles) |
| Accessibility, axe-core WCAG 2.2 AA rules on home, setup, rules, settings, game, menu | `e2e/ship.spec.ts` | 0 violations |
| Lighthouse 12.6, mobile and desktop, production build | see `docs/evidence/lighthouse.txt` | mobile 99 / 100 / 100 / 100 (performance, accessibility, best practices, SEO; first paint 1.7 s on simulated slow 4G, 151 KB transferred); desktop 100 / 100 / 100 / 100 |
| Vercel's own build pipeline on the final commit, in a clean clone | `npx vercel@44.7.3 build --yes` (local, no account) | Build Completed; Build Output v3 static files identical to the `dist/` every test ran against; routes carry the immutable asset cache, `no-cache` service worker, security headers and CSP (`docs/evidence/vercel-build.txt`) |
| Clean clone of the final commit, as a CI or Vercel would build it | `git clone`, `npm ci`, `npm run build` | passes; `dist/` identical to the tested one |
| `vercel.json` against Vercel's published schema (with a negative control) | ajv 8, draft-07, schema fetched on the day | valid; the broken copy is rejected (`docs/evidence/vercel-schema.txt`) |
| Every shipped file accounted for: origin and licence | `docs/ASSETS.md` | all original, or OFL-1.1 (two typefaces, licence texts shipped), or MIT (Vite's preload helper); no file loaded from another domain |
| The page under the exact `vercel.json` headers and CSP | `e2e/vercel.spec.ts` + `scripts/serve-vercel.ts` | no CSP violation in Chromium or WebKit; hashed assets `immutable` |
| Independent rules model (the fourth-pass auditor's, own random numbers and formations) | `npx tsx scripts/rules-oracle.ts` | 100,000 random games: every legal set, turn, ending, formation and score agrees with the engine, and the engine refuses every illegal move; 20,000 matches in all five formats: wins, points, ties, openers and the champion agree; tampered saves refused; undo against the computer always returns to the person's turn (2,509 checks): 0 disagreements (`docs/evidence/rules-oracle.txt`). An earlier audit (second pass) reported the same over 200,000 games and 4 full game trees; its scripts were not kept. |
| Impeccable detector | `impeccable detect --json src/ui index.html` | 0 errors, 0 warnings (earlier: a layout-transition and an inline-font warning; this pass: the renamed ellipsis face, undeclared); 62 advisories that only note values not yet named in DESIGN.md: the tile-art pigments, glow, shade and shadow tints, a few one-off radii and type sizes (`docs/evidence/detector.txt`) |
| Raster provenance | `impeccable embed-prompt --scan public src/ui/textures` | 8 rasters, 0 missing (the share image's provenance is now written by `scripts/capture.ts` itself) |

## Finish review

A fresh `impeccable-finish-reviewer` judged the build against the direction contract (code-led,
so no comp) from 15 screenshots plus the per-profile captures.

- **First review: fix.** Eight material fixes: the UI typeface had silently become each system's
  own font; the cloth and paper materials were invisible; "Take a iris"; a "Your turn" eyebrow
  label; token pips and match wins drawn as look-alike dots; seats at different heights on
  desktop and not aligned with the garden on tablet; orphaned words and a truncated label; raster
  provenance and the credit line. It kept, explicitly: the vermilion/indigo split with the garden
  on the seam, the lit-versus-sunk turn signal, the tile art, the brushed formations.
- **Fix batch** (commit "Finish-review fixes: material, type, copy, seat marks, composition; rules
  labelling"): Source Sans 3; procedural cloth and paper textures; articles;
  the order sentence leads; token-shaped pips, gold seals, a compact count; seats pinned to the
  garden's top edge; balanced wrapping; vermilion in the sheets; "Game design by"; provenance in
  every raster.
- **Verdict pass: all 8 resolved**, two regressions found (the new font's licence notice was not
  shipped; a separator could start a line). Both fixed (commits "Ship the Source Sans 3 licence;
  keep the Continue summary's items whole" and "Continue summary: names may wrap, short items stay
  whole"). Commits are cited by subject: their hashes change when they are re-signed.
- **Second verdict pass: ship** (scoped by the reviewer to the listed fixes and regressions).

## Agents used

| Role | Input | Output |
|---|---|---|
| Rules auditor (fresh, general-purpose) | the PDF text, the BGG ruling, the code | Verdict "yes, with caveats"; findings: stale docs, unlabelled tie-opener choice, the "rain or cloud" name; all fixed |
| Impeccable finish reviewer (fresh) | the request, answers, contract, screenshots | Disposition and material fixes, then a verdict pass (above) |
| Impeccable documenter (fresh) | the finished build, the contract, PRODUCT.md | `DESIGN.md` and `.impeccable/design.json`; flagged two contrast defects and token drift, fixed afterwards |
| Impeccable finish reviewer (fresh), third pass | 60 screenshots of every state at six sizes with the longest names, PRODUCT.md, DESIGN.md | A defect hunt (not a direction review): five findings, all fixed; a verdict pass found three regressions of those fixes (short names ellipsised in Chrome at scale 2, a token stranded above its name, the header changing shape with a two-digit score); a second verdict pass confirmed the first two fixed, no name cut short in any of the 60 captures and no new defect, and found the header still changing shape between a game and its end, fixed by one name rule for every phase; a third found the same at 320 px from the token count; a fourth found that reserving the count's place on screen shrank short names in side columns and indented a lone score, fixed by reserving it only while measuring; the fifth and sixth passes, the last on the final build with the two-player games played by taps from their opening, found no defect in the 60 captures: "ship" (Defects, above) |
| Audit of the final build: 15 finders, 3 verifiers per finding, a completeness critic (170 agents, one workflow, read-only) | the repository, the production build, the official PDF | 46 confirmed findings, 5 dropped, 17 untested areas (fourth pass, above) |
| Name drafters (4, stopped once the client asked for a plain name) | the product's look and mechanics | 10 candidate names; the shortlist was checked for existing games in the main session |
| Provenance checkers (4, fresh): tile art, rules text, shipped files and look, git history | the PDF, published photos of the game, the repository and its history, the build | Nothing copied; three corrections (The rename, above) |
| Code reviewer (fresh, read-only) | the fourth pass's diff | Eight bugs, all fixed (fourth pass, above); smaller risks noted but left (two tabs both computing the computer's reply, then agreeing; a turn announced twice in some menu flows) |
| Reviewers of the New game sheet fix (2, fresh: code, and a player on two phones) | the fix and the served build | One gap found by both (the points target), fixed; every way of closing, typing mid-word, a match in progress and storage that throws checked |

Everything else (engine, AI, UI, tests, scripts, docs) was written in the main session.

## Evidence on disk

- `docs/evidence/`: Lighthouse, difficulty ladder, perfect-play solve, think times, e2e summary,
  Vercel build output summary, `vercel.json` schema check, the independent rules model's run
  (`rules-oracle.txt`).
- `docs/ASSETS.md`: every shipped file, its origin and its licence.
- `docs/screenshots/`: phone, phone landscape, tablet and desktop: home, your turn, a won game,
  the setup sheet, the rules sheet (captured by `scripts/capture.ts` from the production build).
- `test-screens/` (not committed): every layout state on every profile, written by each e2e run.

## After the merge: the client's changes

Asked on 2026-10-13 and 14, after pull request #1 was merged, in rounds: each change built,
checked, shown to the client (stills, then live builds served on their own machine), and kept or
redone. Where a design had several good answers, three were designed with the impeccable skill and
the client chose.

- **The home.** "The new game button does not call enough attention." New game (and Continue,
  above it, when a match can be resumed) now comes first, as wide as the garden, on every screen.
  The garden on the home looked playable and the home empty: of three treatments (the garden
  playing itself, dealt from the button, a picture of a game) the client chose **a game on the
  table**: the board seen at an angle, a game begun in its wells, each player's taken tiles and
  spare tokens beside it. "The background is very bland": of three (lit cloth, stencilled motifs,
  brush and crests) the client first chose the lit cloth, then, once the board lay on a table, of
  three tables (wooden runners, tatami, cloth on a table) **tatami**: two mats meeting under the
  garden, their borders in the two dyes, one lamp, seen through the board's own camera.
- **Watch a game.** A demonstration in a sheet, opened from a third pill on the home and from How
  to play: the engine plays both sides, the tiles the player to move may take lifted as in play,
  one line saying what happened and what the other may now take; Pause, Next move, Play again.
- **A game's end in the middle.** "When a game is over, the Play Again and Home should show on top
  of the board, in the middle [...] like a small modal." Of three designed options the client chose
  the **paper slip**: sealed with the winner's token, saying who won and how, the buttons stacked.
  "The reason a player won should always be there": the slip keeps it at every size, and the
  losing half says it too. "Any button [...] shouldn't change based on the winner": the buttons are
  neutral ink. It comes in once the win is drawn and cannot be pressed before it is seen.
- **Sheets that belong to the game.** "The how to play and settings are also very 'Claude'
  looking": every sheet now has a cloth head, garden-tile rows and token switches.
- **No credit line.** The client removed "Game design by Bruno Cathala" from the product, since
  none of the published game's assets are used; the sources of the rules still cite where each
  rule comes from.
- **A playtest by another model (Codex),** asked by the client to play and give design input, not
  to review code; all of its suggestions were taken: "See the board" folds the end slip away to
  show the whole garden, and the win is a thin loop around the tokens rather than a stroke through
  them; the New game sheet keeps the match format behind one row, with who opens by Start; How to
  play names the eight motifs right where the matching rule needs them.
- **Sounds**, still synthesised: a soft knock for a refused tile and a small struck bell at a game's
  end. Each move went from a go stone on a goban to a hanafuda card snapped down onto tatami, since
  the tiles' motifs are hanafuda's. The client picked it by ear on their phone and laptop from a
  page of variations at matched loudness. The tick for a tile being taken was dropped: it could not
  be heard under the snap.
- **Play by play**, asked for "only if fast": the order of a game's moves. Of three ways to show it
  (numbers on the tokens, a written list, a replay on the garden) the client chose the written
  list, after a game, and named it. It opens from the end slip, as a second quiet link beside See
  the board, and from the Menu once a game is over. The saved match already kept every move, so
  nothing new is stored. It reuses the sheet, its rows, the tile thumbnails and the reason a game
  ended. The end-slip size walk now checks the new link stays inside the garden too.
- **Bugs found on the way,** each reproduced and fixed at its cause: words broken inside in narrow
  seats; desktop seats too narrow for long names, and a garden stuck at 760px on large screens;
  "Start a new game?" stacked on the New game sheet; the home running off short screens with long
  names, and with three links on short sideways phones; the slip pushing the garden or See the
  board off sideways phones; in WebKit, sheets and a just-placed token drawn invisible when a frame
  came late, the game screen drawn once before its seats were fitted, and the Match row needing two
  presses after typing a name. Several of these passed the existing tests (toBeVisible passes at
  opacity 0): the tests now check what is painted.

The first version of the home and end card reached production before its checks had finished
(the branch had been created tracking master); since then every change has gone through pull
request #2.

**Checks** on the final build (2026-10-14): unit tests (69 passed); the whole end-to-end suite on
all 11 device profiles (564 passed, 0 failed) with the full size sweep (94 passed, 0 failed) and
the performance tests (11 passed); after the last fix, the game, layout and demo specs again on all
11 profiles (450 passed, 0 failed), and the end slip's walk through every sideways height, now
run with the size sweep (11 passed). 324 captures (18 states at 9 sizes, in Chromium and WebKit) went to a
finish reviewer three times: its findings (sheets slicing the home's wordmark, the Match row under
the sheet's foot at 320x568, the folded tab over the garden's top row, the win loop round the slip
and then missing after a fold) were fixed, and the three WebKit captures it doubted were retaken
once their motion had settled and are right. The playtest (Codex) found four WebKit bugs; all four
are fixed, and its last playtest of the final build, on phones, a tablet and desktops in WebKit,
Chromium and Firefox, found no problem ("I would ship this build"). Not checked: a real iPhone or
iPad; the client's phone check on the preview is next.

## Outside this build

Nothing known is open in the build itself. These are steps only the client can take; none of them
changes the code:

- **Not for sale.** Asked about the name licence, the client answered that the game will not be
  sold; "sold as a real game" is the quality bar. The edition is called Paper Garden, credits the
  game's designer by name only, uses none of the published game's name, art or marks and claims no
  endorsement.
- **Names outside the code.** The GitHub repository (`okiya-game`), the Vercel project and its
  domain, pull request #1 and the git history still carry the old name; renaming them, and whether
  to rewrite history, is the client's call. An install made from the preview keeps its old name on
  the home screen until the browser refreshes it from the new manifest, or it is reinstalled; a
  match saved there is not carried over.
- **Deployment.** Production serves `master` from the Vercel project; pull request #1 (this
  build) was merged on 2026-10-13, and later changes come through pull requests, each with a
  preview. Deployability is
  demonstrated on the final commit: Vercel's own build (`vercel build`, CLI 44.7.3, run locally with no account)
  completes and emits Build Output v3 whose static files are identical to the tested `dist/` and
  whose routes carry the cache rules, security headers and CSP of `vercel.json`. `vercel.json`
  validates against Vercel's schema, the build was tested under its exact headers, and a clean
  clone builds with `npm ci && npm run build` (the build type-checks the tests too, so it needs the
  devDependencies, which Vercel installs by default; no package downloads browsers on install).
- **Share image URL.** `index.html` points `og:image` at `./og-image.jpg`; social scrapers want an
  absolute URL, so set it to the production domain once it exists.
- **Physical devices.** No phones are attached to this environment, so the systematic device
  checks ran in emulation (11 profiles in WebKit, Chromium and Firefox, then the size sweep at 176
  sizes per state, 183 in desktop windows, as a phone and as a small desktop window). The client played the production
  build on their own phone and in a desktop browser, served on the local network only while they
  tested, three times: the first pass found the clipped "g" and the landscape rules sheet; the
  second, the cramped landscape New game sheet and the cut-off opener note; the third, the note
  now hidden, undo between two players, the Home label and long names. All are fixed and each is
  covered by a test that fails on the old code or the old sizes. The final build was then checked
  on the client's Android phone through Vercel's preview of the pull request (eight checks, in
  the verification table), before the fourth pass and the rename; a tablet check by the person who will play it is still to come. Offline play, the home-screen
  install and the wake lock need a secure context, which a plain-http LAN address is not; they
  are verified in Chrome on localhost (a secure context) and behave the same on the https site.
- **Sound on iOS** follows the ringer switch, as Web Audio does in Safari.
- **Font licences.** Both typefaces are OFL and their licence texts ship with the site. Source Sans
  3 carries the Reserved Font Name "Source"; the files are the unmodified Google Fonts web subsets
  distributed by Fontsource under that name.
- **Advisory design-system notes.** The detector lists 62 values not yet named in DESIGN.md (tile
  pigments, shadow tints, a few radii and sizes). They are intentional; naming them is
  housekeeping, not a defect.
- **Not tested** (the audit's critic, 17 areas; the ones that matter): a real iPhone or iPad
  (Safari's toolbars, the home-screen app and offline launch on iOS rest on Playwright's WebKit);
  real screen readers (VoiceOver, TalkBack, NVDA); Firefox for Android and Samsung Internet; text
  larger than a 20 px root (Android and iOS text scaling); the app frozen in the background or
  restored from the back-forward cache mid-move; long sessions (leaks over many games); emoji
  names; a low-end phone's frame rate during play; two people touching the screen at once; storage
  blocked (the code never throws on it, but no run checked the screens).
