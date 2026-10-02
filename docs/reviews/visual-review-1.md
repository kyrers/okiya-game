# Visual and usability review 1: Hanamichi, The Flower Road

Reviewer: senior product designer, judging only the 21 screenshots in `docs/screenshots/` (7 screens at phone 390, tablet 820 and desktop 1440 CSS px). Colour values and contrast ratios were sampled from the PNGs. Sizes are in CSS px, converted from the 2x captures.

## Verdict

The art direction is coherent and in places lovely. The washi gradient, sumi serif headings, vermilion rule and pill CTA make a confident title screen, and the two token designs are the strongest pieces of UI in the game. The play screen falls short of that standard. On phone, every in-game screen is about 16 to 32px wider than the viewport, so the help button, the cards and the result CTA are clipped and the page side-scrolls. The board also signals "you can take this tile" with a 2px gold ring that has 1.5:1 contrast. To make playable tiles stand out, the game desaturates every other tile until the sun, cloud, pine and iris are hard to tell apart (the sun disc measures 1.3:1). The Paper Lantern hint also removes that gold ring and replaces it with grey. In the captured position no tile turns gold or red, and nothing says so, so the hint looks like it did nothing. A new player can make a legal move thanks to the excellent "Haru took / Play cherry or bird" card, but nothing on the play screen says how a game is won. The word "lantern" means three different things. The desktop station screen also looks broken. **Looks good: 6/10. Usable without explanation: 5/10.**

## Findings

1. **Blocker: phone game screens overflow horizontally.** Screens: 4-play, 5-lantern, 6-result, 7-rules at phone width.
   - **What is wrong:** On 4-play the `?` button is cut in half at the right edge, the progress bar runs into the edge, and the right side of the "Play cherry or bird" and "A win now is worth" cards is clipped. In 5, 6 and 7 the capture is scrolled about 16px sideways. As a result, "A win now is worth", "Charms" and the lantern bar touch the left edge, the result and rules sheets show a square left corner with text about 4px from the edge, and the result sheet's title and CTA are cut off on the right. Screens 1 to 3 do not do this, so something only in the game view sets a minimum width of about 420px.
   - **Fix:** Find that element. The likely causes are a fixed-width tile grid or a `nowrap` row such as the lantern bar or the win-now line. Use `grid-template-columns: repeat(4, minmax(0, 1fr))` and `width: min(100%, 560px)` on the board. Add `min-width: 0` to every flex or grid child in the game column. Give sheets `inset-inline: 0; width: auto; box-sizing: border-box`. Add a Playwright assertion `document.documentElement.scrollWidth <= window.innerWidth` for every screen at 390px. Do not just add `overflow-x: hidden`, because that hides the clipped `?` button instead of fixing it.

2. **Major: you can barely tell which tiles are playable, and the rest of the board becomes unreadable.** Screens: 4-play at all widths.
   - **What is wrong:** The only cues are a 2px `#c9a45c` ring (1.5:1 against the board `#deceae`, 2.0:1 against the tile) and full colour on playable tiles. Every other tile is desaturated, which destroys the information a player needs for planning (which tiles the rival can take next):
     - sun disc `#dcceb4`: 1.30:1 against the tile
     - rain cloud `#ccc9c3`: 1.38:1
     - maple, pine and iris: about 2.2:1, all grey-mauve
   - Compare the full-colour art visible behind the rules sheet (red maple, gold sun, dark-green pine, purple iris): it is far more legible. At phone size, "pine + sun" reads as plain pine.
   - **Fix:**
     - Never desaturate tiles. At most, give unplayable tiles `filter: saturate(.85) brightness(.97)`.
     - Mark playable tiles positively: `transform: translateY(-3px)`, a 3px ring in a darker gold `#8a6a1f` (4.2:1 against the tile), and `box-shadow: 0 6px 14px rgba(138,106,31,.35)`.
     - Raise the symbols' own contrast in every state: sun `#d9a441` with a `#b07f22` outline, cloud `#8f9bb0`, rain strokes `#5b6b8c`.

3. **Major: the Paper Lantern reuses the gold ring and gives no feedback when nothing is found.** Screens: 5-lantern at all widths.
   - **What is wrong:** When the lantern is lit, the two legal tiles lose their gold "playable" ring and get a grey one, so they look less available than before. Gold means "playable" in normal play and "wins now" under the lantern. In this capture no tile is gold or red, and no text explains that, so the player paid their once-per-station hint and saw only a ring go grey. The meaning also rests on colour alone (gold versus red), which colour-blind players can confuse, and the key ("gold wins now · red hands the rival a win") is 13px grey text measuring 3.3:1.
   - **Fix:**
     - Keep the playable treatment from finding 2 unchanged under the lantern.
     - Show lantern results as corner badges with an icon and text: a gold blossom with "+13" for "wins now", a red "!" for "rival wins next".
     - When no tile is marked, write it in the lantern bar: "No tile wins now, and none hands Haru a win."
     - Reserve gold for "wins now" only, and use ink or vermilion for the playable ring.

4. **Major: the desktop station screen looks broken.** Screens: 3-station at desktop (tablet and phone are fine).
   - **What is wrong:** The intro card sits right of centre (about x 592 to 1156 in a 1440 viewport). Roughly 450px of empty column sits to its left, and the road list is pushed against the right edge. It looks like the play screen's three-column grid with an empty left cell.
   - **Fix:** Match the play screen. Put the road list in the left rail (as on 4-play desktop), put the card in the centre column at `max-width: 640px`, and leave the right rail empty or show the drafted charms there. Alternatively, use `grid-template-columns: minmax(0, 640px) 220px; justify-content: center`.

5. **Major: the play screen never says how to win, and the instruction is split around the board.** Screens: 4-play at all widths.
   - **What is wrong:** The status reads only "Your move" (about 17px, serif, vermilion). The rule that tells you what to do is in a card under the board. On phone they are about 330px apart. The win conditions (four in a line, 2x2 square, rival has no legal tile) appear only in the rules sheet. The station card's goal ("Gather 30 petals") is about scoring, not about winning a game.
   - **Fix:**
     - Make the status line the instruction: "Your move: take a [cherry icon] cherry or [bird icon] bird tile", at 18px with sumi `#2b2522` text. Keep the "Haru took" thumbnail card below the board as the explanation.
     - Add a persistent one-line goal, "Win: 4 in a line · a 2×2 square · leave Haru no tile". Put it at 14px `#6b5f53` under the board on phone and tablet and at the top of the right rail on desktop.
     - In the first game of a run, add a one-time coach mark on the first playable tile.

6. **Major: "lantern" means three things.** Screens: 3-station, 4-play, 5-lantern and 6-result at all widths.
   - **What is wrong:**
     - The three capsule icons above the board are games.
     - "Light the first lantern" and "Light the next lantern" start a game.
     - "Light the Paper Lantern" is the hint, and "Lantern lit for this move" is its state.
   - The unlit game lanterns and the Paper Lantern button use the same tan capsule icon. A new player will reasonably think the three capsules are three hints, or that the hint button costs a game.
   - **Fix:** Keep lanterns as games (it is the theme) and give the hint its own name and icon, for example "Moonlight" with a crescent or "Firefly" with a dot of light. Label the game pips "Game 1 of 3" (13px, next to the pips). Change "Lantern lit for this move" to "[Hint name] shining for this move".

7. **Major: the result sheet hides the result.** Screens: 6-result at all widths.
   - **What is wrong:**
     - On tablet and desktop the modal sits centred over the board and hides two or three of the four rows. The player cannot see how they lost, only fragments of the gold winning row.
     - On phone the bottom sheet runs off the viewport and the "Light the next lantern" CTA is cut at the bottom (see also finding 1).
     - The scrim is a flat muddy grey (`~#8e8676`) that makes the washi look dirty.
     - Behind the sheet, stale information is still visible: "A win now is worth 5" and "Play cherry or rain".
   - **Fix:**
     - On desktop, dock the tally in the right rail in place of the win-now card and leave the board undimmed, with the winning line highlighted.
     - On tablet and phone, use a bottom sheet with `max-height: 55dvh`, `overflow: auto` and `padding-bottom: calc(16px + env(safe-area-inset-bottom))`, and scroll the board so the winning line stays visible above it.
     - Use a warm scrim such as `rgba(43,30,20,.28)` with `backdrop-filter: blur(2px)`.
     - Hide the win-now and constraint cards once the game is over.
     - On a loss, add the math the player needs: "0 / 30 · 2 lanterns left · about 15 petals per win needed".

8. **Major: the small grey labels fail contrast.** Screens: all, at all widths.
   - **What is wrong:** The muted ink `#8c8075` on the paper backgrounds (`#f3ead7` to `#f9f4eb`) measures 3.1 to 3.5:1, below the 4.5:1 that WCAG AA needs for small text. It is used for "5 left", "Haru took", "A WIN NOW IS WORTH", TARGET / LANTERNS / FIRST MOVE, inactive road stations, the title stat labels, the footer credit and the "A JOURNEY OF OKIYA" kicker. Most of these are 12 to 13px letter-spaced capitals, which makes it worse. The pink season kicker `#b85a7a` measures 3.4 to 3.9:1.
   - **Fix:** Set `--ink-muted: #6b5f53` (5.2 to 5.7:1), raise the caps labels from about 12px to 13px, and change the kicker to `#9e3f63` (4.8:1). You could also drop pink entirely, since it is a fifth accent outside the washi, sumi, vermilion, indigo and gold palette.

9. **Minor: the phone header truncates and its targets are too small.** Screens: 2 to 7 at phone.
   - **What is wrong:** The subtitle is cut off ("Spring · station 1 o…", "Plum Gate · Haru the E…"). The `?` button and the sheet close `×` are about 35×35px, and charm chips are about 31px tall.
   - **Fix:** Below 480px, hide the header subtitle (the same information is on the station card and in the play status) or move it to a second line at 13px. Make the help and close buttons 44×44px and the chips at least 40px tall.

10. **Minor: the station card's CTA and charm chip are misaligned.** Screens: 3-station at all widths.
    - **What is wrong:** Everything on the card is left-aligned except "Light the first lantern", which is centred. Under it sits an unlabelled "Crane Scroll" chip, left-aligned and almost touching the button on phone (gap of about 0 to 4px), so it reads as a stray element.
    - **Fix:** Add a fourth stat column, "CHARMS", holding the chip(s) in the TARGET / LANTERNS / FIRST MOVE row. Make the CTA full width on phone (as on the title screen) and left-aligned at 24px top margin on wider screens.

11. **Minor: the side panels don't line up with the board, and the lantern button label wraps.** Screens: 4-play and 6-result at desktop; 4-play and 5-lantern at tablet.
    - **What is wrong:** On desktop the right rail's Paper Lantern bar places the label and the description side by side in a narrow card. The label wraps to three or four lines ("Light the / Paper / Lantern", "Paper / Lantern / spent / here") next to a three-line grey description. On tablet the board column is about 640px wide while the win-now, charms and lantern panels span about 788px, so their left edges don't line up.
    - **Fix:** In the rail, use `flex-direction: column; align-items: flex-start` with the label set to `white-space: nowrap`. On tablet, constrain all play panels to the board column (`max-width: 640px; margin-inline: auto`).

12. **Minor: some tile art is hard to recognise, and the rules legend uses a different style.** Screens: 4-play, 5-lantern and 7-rules at all widths.
    - **What is wrong:**
      - Maple is drawn as five-point stars. It reads as "stars" and echoes the star on the player's token.
      - Pine is a grey-green fan that reads as grass.
      - The rain cloud is a generic weather icon that clashes with the brush-like cherry branch.
      - The rules legend icons are saturated (red maple, gold sun, dark-green pine), while the board shows desaturated versions, so the legend doesn't match what the player sees.
    - **Fix:**
      - Redraw maple as a lobed, serrated leaf with a stem, and pine as a layered umbrella-pine silhouette.
      - Give the cloud a brush-edged hanafuda outline.
      - Generate the legend icons from the same SVG symbols as the tiles.
      - Add a small 4×4 "garden key" (vegetation rows × symbol columns) to the rules.
      - Use one palette everywhere: maple `#c4462f`, pine `#3f6b4a`, iris `#6a4c9c`, cherry `#e8a3b8` with a `#3a2a22` branch, sun `#d9a441`.

13. **Minor: the charm draft doesn't look like a choice, and it wastes the page.** Screens: 2-draft at all widths.
    - **What is wrong:** The cards look like information panels. There is no button, radio or chevron. On phone, Narrow Gate has a gold outline that looks like a pre-selection (probably a hover or focus artifact). On tablet and desktop the panel hugs the top and about 60% of the viewport is empty. The Crane Scroll and Bamboo Fence icons (dot patterns) read as "loading" dots.
    - **Fix:**
      - Add a "Take this charm" text button or a right chevron to each card, plus a vermilion 2px focus and hover ring. Don't show any outline before interaction.
      - Centre the panel vertically: `min-height: calc(100dvh - var(--header)); display: grid; place-content: center`.
      - Draw the icons on a faint 4×4 grid so the dots read as board patterns.

14. **Nit: first-run title stats are noise.** Screens: 1-title at all widths.
    - **What is wrong:** "0 / 0/6 / 0" means nothing to a new player. On phone the third stat wraps onto its own row and looks orphaned. The header's "Hanamichi" link is underlined in indigo, the rival's colour, and looks like a hyperlink that could end a run by accident.
    - **Fix:** Hide the stats until one road has been played, or keep them on one row with `grid-template-columns: repeat(3, 1fr)` and 11px labels on phone. Set the header wordmark in sumi with no underline, and ask for confirmation before leaving a run.

15. **Nit: some copy and icons are unclear.** Screens: 4-play and 5-lantern at all widths.
    - **What is wrong:** "5 left" doesn't say what is left. "Plus Crane Scroll if they fire" is jargon with an unclear "they". The petal mark `✿` is a text dingbat that doesn't match the drawn cherry blossoms.
    - **Fix:** Change "5 left" to "5 tokens", or show five small token pips. Change the scoring line to "3 base + 10 tiles left · +8 more if it's a diagonal (Crane Scroll)". Replace `✿` with an inline SVG of the tile's five-petal blossom.

## What already works (keep it)

- **Title screen typography and palette:** the big sumi serif wordmark, the vermilion rule, the letter-spaced vermilion subtitle, and the clear primary vs secondary vs link button order.
- **The two tokens:** vermilion with a star and indigo with a ring and dot differ in hue, lightness and glyph. They clearly read as two players and stay consistent with the "You" and "Haru" dots in the player pills. Don't make them more alike.
- **The constraint card:** "Haru took [tile thumbnail] → Play [icon] cherry or [icon] bird" is the best teaching device in the game. Keep it next to the board.
- **The desktop play layout:** road rail, board and info rail fit in 900px of height with the board (about 560px) and the constraint card both visible. On phone the board and constraint card also fit in one viewport. Tile cells are about 82px, which makes good touch targets.
- **Live scoring:** "A win now is worth 13 ✿" with its breakdown explains the petal economy while you play, and the gold highlight on the winning row on the result screen is clear.
