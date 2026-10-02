# Visual and usability review 2: Hanamichi, The Flower Road

Reviewer: senior product designer, second round, judging only the current 21 captures in `docs/screenshots/` (screens 1-title, 2-draft, 3-station, 4-play, 5-firefly, 6-result, 7-rules at phone 390, tablet 820 and desktop 1440 CSS px). Colours and contrast ratios were sampled from the PNGs. Sizes are in CSS px, converted from the 2x captures.

## Verdict

This is a big step up. The phone overflow is gone. The board keeps its full colour, and playable tiles are marked positively. The play screen now says what to do and how to win. The hint has its own name, and the desktop station and result layouts look designed rather than leftover. What remains is concentrated in two places. First, the end of a game on phone and tablet still covers the board, and now also blurs it. Second, the Firefly is hard to find on phone, and once lit it looks disabled. **Looks good: 7.5/10. Usable without explanation: 7/10.** Nothing is a blocker.

## 1. Review 1 findings, rechecked

| # | Finding (review 1) | Status | Evidence in the current screenshots |
|---|---|---|---|
| 1 | Phone game screens overflow | Fixed | All seven phone captures have symmetric 16px gutters. The `?` button, the cards and the result CTA sit fully inside 390px, and the sheets run edge to edge with rounded top corners. |
| 2 | Playable tiles barely visible, board desaturated | Fixed | Unplayable tiles keep full colour (gold sun, red maple, green pine). Playable tiles get a 3px `#8a6a1f` ring (sampled) on a lighter `#f3ead8` fill, against `#e9dcc3` for the others. No lift or shadow is visible, but the cue reads at every width. |
| 3 | Paper Lantern reuses gold, no feedback when empty | Partly fixed | It is renamed Firefly. While it is lit, the two playable tiles keep their ring, and the bar says "No tile wins now, and none hands Haru a win." That sentence measures 2.4 to 2.6:1, though (issue 2). The captured position has no marked tile, so the win/danger badges cannot be judged. |
| 4 | Desktop station screen looks broken | Fixed | The road list is in the left rail and the card is centred on the viewport (about x 400 to 1040), matching the play layout. |
| 5 | Play screen never says how to win | Fixed | The status reads "Your move: take a [cherry] cherry or [bird] bird tile". A persistent "Win: 4 in a line · a 2×2 square · leave Haru no tile" sits under the constraint card at every width. A first-game coach mark can't be captured in a still. |
| 6 | "Lantern" means three things | Fixed | The hint is now "Wake the Firefly", with a glowing-dot icon unlike the capsule pips, and the pips are labelled "Game 1 of 3". One leftover: the result kicker says "Lantern 1 of 3" (issue 5). |
| 7 | Result sheet hides the result | Partly fixed | Desktop docks the tally in the right rail, with the board undimmed and the winning row in gold. Stale cards are hidden at all widths, and a loss adds "0 / 30 · 2 lanterns left · about 15 petals per win needed". On phone and tablet the sheet still covers the winning row, and the board behind it is now blurred (issue 1). |
| 8 | Small grey labels fail contrast | Fixed | Muted labels sample `#6b5f53` at 4.8 to 5.7:1, and the season kicker `#9e3f63` at 4.8 to 5.4:1. The only new failures are in the Firefly bar (issue 2). |
| 9 | Phone header truncates, small targets | Fixed | The phone header shows only the wordmark, the petal count and a 44px `?`. The rules close button is 44px, and the charm chip on the play screen is 40px tall. |
| 10 | Station CTA and charm chip misaligned | Fixed | CHARMS is a labelled fourth stat column on tablet and desktop and a labelled row on phone. The CTA is full width on phone and left-aligned on wider screens. |
| 11 | Side panels misaligned, lantern label wraps | Fixed | The desktop rail shows "Wake the Firefly" on one line with the description below it. On tablet the panels share the board's left and right edges. New wraps in the rail are covered in issue 8. |
| 12 | Tile art hard to recognise, legend mismatched | Partly fixed | Maple is now serrated leaves on stems and pine is a layered umbrella pine, and the legend uses the same art and colours as the board. The rain cloud is still a generic weather cloud, the poem slip now reads as "!" (issue 4), and no capture shows a garden key. |
| 13 | Draft doesn't look like a choice | Fixed | Each card ends in a vermilion "Take this charm ›", and no card is pre-outlined. The icons sit on a faint 4×4 grid, and the panel is centred vertically on tablet and desktop. |
| 14 | Title stats noise, wordmark looks like a link | Partly fixed | The first-run stats are gone from the title screen. The header "Hanamichi" is still indigo and underlined on every in-game screen (issue 7). |
| 15 | Unclear copy and icons | Partly fixed | "5 tokens" replaces "5 left", and an SVG blossom replaces `✿`. The scoring line now reads "more if Crane Scroll blooms", which still hides that this means a diagonal worth +8 (issue 5). |

**Tally:** 10 fixed, 5 partly fixed, 0 not fixed.

**About the capture set:** 5-firefly captures a position where the Firefly finds nothing, so the most important Firefly visuals (the "wins now" and "hands Haru a win" markers) have still not been reviewed. Add a capture where at least one tile of each kind is marked. The folder also still contains the round-1 `*-5-lantern.png` files. Delete them so the next reviewer doesn't judge stale screens.

## 2. New and remaining issues

1. **Major: on phone and tablet, the result still hides how the game ended, and the blur makes it worse.** Screens: 6-result at phone and tablet.
   - **What is wrong:**
     - On phone the bottom sheet starts at about y 507 and covers the lower half of the winning (bottom) row.
     - On tablet the centred modal (about y 433 to 746) sits across rows 2 to 4 and covers half of the gold winning row.
     - Everything behind both is blurred, so even the visible part of the gold row and the status "Haru wins by a row." can't be read.
     - The player cannot see how they lost. Desktop already shows the right pattern.
   - **Fix:** Treat game over as a state of the play screen, not a modal.
     - **Tablet:** render the result card in the flow directly under the board, in the same 640px column where the constraint and win-now cards were. Use no scrim and no blur, and call `scrollIntoView({ block: "end" })` on the card. The board (about 640px) and the card (about 300px) fit together in 1180px.
     - **Phone:** use a compact bottom sheet (kicker, title, one tally row, total, CTA) of at most 300px or `45dvh`, with no blur and no scrim over the board. Scroll the page so the board's bottom edge sits just above the sheet.
     - **All widths:** draw the winning line as a 4px sumi brush stroke through the four tiles, in addition to the gold fill, so it still reads when partly covered.
     - Keep the blur only for the rules sheet.

2. **Major: once lit, the Firefly looks disabled, and its answer is the faintest text on the screen.** Screens: 5-firefly at all widths. The same faded style appears as "Firefly spent at this station" on 6 and 7.
   - **What is wrong:**
     - When idle, the "Wake the Firefly" title is sumi `#1f1b18` (15.7:1).
     - Once lit, the whole bar fades. The title drops to about `#726d64` (about 5:1). The answer, "No tile wins now, and none hands Haru a win.", is `#a39b91` to `#a9a095` on `#faf7ef`, which is **2.4 to 2.6:1**.
     - The lit state looks the same as the spent state, so the player reads "used up" rather than "here is your answer".
     - The idle description is also just under AA, at `#797067`, 4.46:1.
   - **Fix:** Design three distinct states.
     - **Idle:** keep the current look, with the description at `#6b5f53`.
     - **Shining:** full opacity, title `#2b2522`, and the answer at 15px in `#3d342c`. Give the bar a 2px `#d9a441` border with `box-shadow: 0 0 0 4px rgba(217,164,65,.18)` and a slow glow on the icon that respects `prefers-reduced-motion`. When tiles are marked, give counts: "2 tiles win now · 1 hands Haru a win".
     - **Spent:** de-emphasise with a desaturated icon and a lighter border, not with text contrast. Keep "Used at this station" at `#6b5f53`.

3. **Major: on phone the Firefly is below the fold, and on tablet it is cut off at the fold.** Screens: 4-play at phone and tablet.
   - **What is wrong:**
     - On phone the 844px viewport ends at the Charms chip, and the Firefly bar starts about 40px below it.
     - On tablet only the top 25px of "Wake the Firefly" shows at the bottom edge.
     - The once-per-station hint is half of the new layer, and on these widths it is invisible unless the player scrolls past the scoring card.
   - **Fix:** On phone and tablet, reorder the column to: board, constraint card, Firefly bar, win line, win-now card, charms. On phone the Firefly then sits at about y 640 to 700, inside the first viewport.

4. **Minor: the poem symbol reads as a "!" warning sign, and paired symbols fight the vegetation.** Screens: 4-play, 5-firefly and the 7-rules legend, at all widths.
   - **What is wrong:**
     - The poem is a white upright slip with a dot on top and three dashes below. At every size it reads as an exclamation mark in a box. Review 1 proposed a red "!" for "hands Haru a win", so if that ships it will sit next to four lookalike "!" slips on the captured board.
     - The slip sits on top of the maple and pine it is paired with (bottom-left tiles).
     - The rain strokes run through the pine and iris, and at the 82px phone tile size "rain + pine" and "rain + iris" merge.
     - The cloud is still the generic weather icon.
   - **Fix:**
     - Redraw the poem as a hanafuda tanzaku: a slip tilted about 12°, an ochre wash (`#e9d3a6`) with a `#3a2a22` outline, a small tie cord at the top, and two or three offset brush strokes of different lengths in place of the centred dot-and-dash column. Avoid vermilion and indigo, which belong to the players.
     - Place the symbol in the upper-left 60% of the tile and the vegetation in the lower right. Give the front element a paper halo (`stroke: #f3ead8; stroke-width: 3; paint-order: stroke`).
     - Give the cloud a brush-edged hanafuda outline, as review 1 asked.

5. **Minor: the copy still has jargon and mixed names.** Screens: 4-play, 5-firefly and 6-result, at all widths.
   - **What is wrong and how to fix it:**
     - "3 base + 9 tiles left · more if Crane Scroll blooms" never defines "blooms", and doesn't say the charm means a diagonal or that it adds +8. Change it to "3 base + 9 tiles left · +8 on a diagonal (Crane Scroll)".
     - Both player pills on 6-result say "1 tokens". Pluralise it: "1 token".
     - The result kicker says "LANTERN 1 OF 3" while the play screen says "Game 1 of 3". Use one label in both places, and keep "Light the next lantern" as the themed verb.
     - On phone, "…about 15 petals per win needed" leaves "needed" alone on a line. Shorten it to "0 / 30 · 2 games left · need about 15 a win".

6. **Minor: "How to play" buries the game rules under the road rules, and its headings are flat.** Screens: 7-rules at all widths.
   - **What is wrong:**
     - The first screenful is "The road": stations, petals, the charm tie-break and the Firefly. "A turn" starts below the first viewport on phone, and "Winning" sits at the bottom edge on desktop. Yet a player who taps `?` mid-game usually wants to check the tile rule.
     - "Okiya, the game at the core" and "The garden" are stacked headings in the same bold serif with nothing between them, so you can't tell the part heading from the section heading.
     - The inline legend icons are about 16px. At that size the iris reads as a green tripod and the pine as a blob.
   - **Fix:**
     - Order the sheet: A turn, Winning, The garden (with the 4×4 key and icons of at least 28px), The road and petals, the Firefly, then the empty-garden edge case.
     - Use two heading levels: part headings at 20px serif with a thin vermilion rule above, and section headings in 13px `#6b5f53` capitals.
     - When the sheet is opened from the play screen, scroll it to "A turn".

7. **Minor: the header wordmark still looks like an indigo hyperlink.** Screens: 2 to 7 at all widths.
   - **What is wrong:** "Hanamichi" is set in the rival's indigo with an underline. It is the only underlined text on the game screens, and it is a way out of the run.
   - **Fix:** Set it in sumi `#2b2522` with no underline, showing the underline only on hover and focus. If it leaves a run in progress, confirm first: "Leave the road? Your run is saved." with Stay / Leave. Whether a confirmation already exists can't be seen in the captures.

8. **Nit: the desktop right rail is too narrow for its copy.** Screens: 4-play, 5-firefly and 6-result at desktop.
   - **What is wrong:**
     - At about 270px wide, the rail leaves "WORTH" alone on the second line of "A WIN ON YOUR NEXT MOVE IS WORTH".
     - It splits the charm name across lines ("more if Crane / Scroll blooms").
     - The Firefly description ends on a lone "win.".
     - The result row wraps to "Haru wins by a row · 14 / moves", with the 0 floating top right.
     - Meanwhile the left rail uses about 195px of a 300px column.
   - **Fix:** Rebalance the grid to `grid-template-columns: 220px minmax(0, 560px) 320px`. Add `text-wrap: balance` to card labels and descriptions, and use `align-items: center` on tally rows.

9. **Nit: the pre-game screens are top-heavy and don't share a layout.** Screens: 1-title at tablet and desktop, 3-station at tablet.
   - **What is wrong:**
     - On tablet the title content ends halfway down, leaving about 590px of empty paper.
     - The tablet station card is 790px wide and pinned to the top, while the draft screen before it is centred. The three screens before the first game feel like three different layouts.
   - **Fix:** Give the title, draft and station screens `min-height: calc(100dvh - var(--header)); display: grid; place-content: center; padding-bottom: 8vh`. Cap the tablet station card at 640px to match the play column.

## 3. Updated scores

- **Looks good: 7.5/10** (was 6). The biggest gain would come from finishing the symbol set (a real tanzaku for the poem and a brush-edged cloud, with symbol and plant kept apart). Dropping the blur on game over would also help, so the full-colour board stays visible when a game ends.
- **Usable without explanation: 7/10** (was 5). The biggest gain would come from moving the Firefly into the first phone viewport and giving it a clearly active lit state. Keeping the winning line visible at the end of a game on phone and tablet would help almost as much.
