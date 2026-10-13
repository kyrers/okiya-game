---
name: Paper Garden
description: The two-player garden game on one shared screen, played on two dyed cloth halves with a paper garden on the seam.
colors:
  verm: "#b4381e"
  verm-dim: "#6b2416"
  verm-press: "#9e3019"
  indi: "#2c3b7a"
  indi-dim: "#1b2347"
  paper: "#f5eddc"
  paper-lit: "#fff8ea"
  paper-2: "#ebdfc6"
  paper-3: "#d9c6a0"
  tile-face: "#f8f1e2"
  token-well: "#e3d5b7"
  ink: "#1f1b18"
  ink-2: "#4e443a"
  ink-3: "#6a5d50"
  brush-ink: "#1d1612"
  cream: "#fbf3e4"
  cream-2: "#eadfcb"
  gold: "#eab84a"
  gold-2: "#8a6a1f"
  maple: "#b5452f"
  cherry: "#d98aa0"
  cherry-2: "#f2c2d0"
  pine: "#3e6b4f"
  iris: "#6a5fa8"
typography:
  display:
    fontFamily: "'Garden Ellipsis', 'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', Georgia, serif"
    fontSize: "clamp(3rem, 15vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.04em"
  headline:
    fontFamily: "'Garden Ellipsis', 'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "'Garden Ellipsis', 'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', Georgia, serif"
    fontSize: "1.375em"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "0.01em"
  body:
    fontFamily: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  body-strong:
    fontFamily: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
  label:
    fontFamily: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
  caption:
    fontFamily: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  control-inner: "9px"
  control: "12px"
  sheet: "20px"
  pill: "999px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  board-gap: "10px"
  gutter: "clamp(12px, 3.6vw, 32px)"
components:
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.paper-lit}"
  button-ghost:
    backgroundColor: "rgba(251, 243, 228, 0.08)"
    textColor: "{colors.cream}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-ghost-hover:
    backgroundColor: "rgba(251, 243, 228, 0.16)"
  button-primary-on-paper:
    backgroundColor: "{colors.verm}"
    textColor: "{colors.cream}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-primary-on-paper-hover:
    backgroundColor: "{colors.verm-press}"
  button-ghost-on-paper:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "48px"
  button-ghost-on-paper-hover:
    backgroundColor: "rgba(31, 27, 24, 0.06)"
  icon-button:
    backgroundColor: "rgba(251, 243, 228, 0.08)"
    textColor: "{colors.cream}"
    rounded: "{rounded.round}"
    size: "44px"
  icon-button-hover:
    backgroundColor: "rgba(251, 243, 228, 0.18)"
  link-button:
    backgroundColor: "transparent"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  order-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.45em 0.9em 0.45em 0.45em"
  garden-cell:
    backgroundColor: "{colors.tile-face}"
    textColor: "{colors.ink}"
  garden-cell-token:
    backgroundColor: "{colors.token-well}"
  segmented-control:
    backgroundColor: "{colors.paper-2}"
    rounded: "{rounded.control}"
    padding: "4px"
  segmented-option:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control-inner}"
    padding: "6px 12px"
    height: "44px"
  segmented-option-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.verm-dim}"
  choice-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  name-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 6px 6px 10px"
  switch:
    backgroundColor: "#cbbb9c"
    rounded: "{rounded.pill}"
    width: "50px"
    height: "30px"
  switch-on:
    backgroundColor: "{colors.verm}"
  menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0 8px"
    height: "52px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
---

# Design System: Paper Garden

## Overview

**Creative North Star: "The Shared Table"**

The game is a table shared by two people. Every screen is the same object seen from above: a vermilion cloth half and an indigo cloth half, meeting at a seam, with a warm paper garden board lying across that seam. The half whose turn it is lights up; the waiting half sinks to a darker, muted dye. Nothing floats on a neutral page. A thin top bar carries only the match label and its icon buttons (Menu, and Undo against the computer); everything about a player (their name, tokens in hand, the tile they must answer, the result) sits in their own half of the cloth.

The world is made of a few real materials. The dyes and the paper carry raster texture (a plain-weave cloth tile and a fibre paper tile, both 256px seamless tiles, soft-light blended onto flat colour). Tokens are lacquered discs with a radial sheen. The garden's sixteen tiles are the client's own SVG art, kept as drawn; the system frames them and never redraws them. Paper surfaces (the order card, the sheets) are the only places interface text sits on light; everything else is cream type on dye.

The interface recedes. The garden is the largest thing on every screen at every viewport, and every other element is sized from what is left over. Motion belongs to the play itself: the light crossing the seam, a taken tile flying to the mover's card, a token settling into its cell, a brush stroke through a winning formation.

**Key Characteristics:**
- Two dyed halves (vermilion, indigo), stacked in portrait and side by side in landscape, meeting at the garden's centre.
- One paper garden on the seam, as large as the viewport allows (up to 640px portrait, 760px landscape).
- Lit versus sunk dye is the turn indicator; players are also told apart by token pattern (crest versus plain).
- Cream type on cloth, ink type on paper; controls invert their colours when they land on paper.
- A serif display face for names, results and titles only; a humanist sans for everything else.
- Real texture, soft-light blended; authored SVG icons, tokens and diagrams.

## Colors

Two saturated dyes, each with a lit and a sunk state, over a warm paper-and-ink neutral family, with one gold for marks and focus.

### Primary
- **Vermilion Dye** (verm): Player 1's half when lit, player 1's lacquered tokens, and the one action colour on paper: primary sheet buttons, the checked switch, the selected choice ring, menu icons, the name field's focus ring.
- **Sunk Vermilion** (verm-dim): player 1's half while waiting; also the selected segmented-option label on paper.
- **Pressed Vermilion** (verm-press): hover state of the vermilion button on paper.

### Secondary
- **Indigo Dye** (indi): Player 2's half when lit, player 2's plain lacquered tokens. Indigo never acts as an action colour on paper; vermilion does that job alone.
- **Sunk Indigo** (indi-dim): player 2's half while waiting, and the page background behind every screen.

### Tertiary
- **Seal Gold** (gold): the marks the game makes: the ring on tiles that may be taken, the ring on the last token placed, won-game seals, earned points, the outer-ring cells in the opening diagram, and the keyboard focus ring on the dyes.
- **Deep Gold** (gold-2): gold's outline where gold sits on paper (ring diagram strokes, open cells in rules diagrams).
- **Tile pigments** (maple, cherry, cherry-2, pine, iris): belong to the garden tile art and its glyphs. They appear only inside tile art, inline tile glyphs and the rules key.

### Neutral
- **Garden Paper** (paper): sheets, the order card, primary buttons on the dyes, choice cards and name fields.
- **Lit Paper** (paper-lit): hover state of the paper button.
- **Paper Tray** (paper-2): the segmented control's tray and the opening-ring card well.
- **Board Paper** (paper-3): the garden board, sheet scrollbars, rules diagram boards.
- **Tile Face** (tile-face): the face of every garden tile cell, the flying tile, rules diagram cells.
- **Token Well** (token-well): a cell whose tile has been taken and now holds a token; drawn inset.
- **Ink** (ink), **Ink 2** (ink-2), **Ink 3** (ink-3): text on paper, from body to secondary (legends, figure captions) to tertiary (details, credits). Ink 3 is the lightest text allowed on paper (5.5:1).
- **Brush Ink** (brush-ink): the brush stroke drawn through a winning formation, at 0.72 opacity.
- **Cream** (cream), **Cream 2** (cream-2): text and icons on the dyes; Cream 2 for secondary lines (match label, waiting notes, reasons).
- Cream at low alpha makes every control surface on the dyes: rgba(251, 243, 228, 0.08) rest, 0.16 to 0.18 hover, 0.28 to 0.4 hairline borders. Warm brown at low alpha, rgba(80, 60, 30, 0.12 to 0.22), makes every hairline on paper.

### Named Rules
**The Lit Half Rule.** Exactly one half is lit: the half of the player to move. The other sits in its sunk dye. A tie lights both at half strength. No other element may claim the lit dye.

**The One Action Colour Rule.** On paper, vermilion is the only action colour. On the dyes, the primary action is a paper button. Indigo is a player, never a button.

**The Gold Marks Rule.** Gold is for what the game marks (may be taken, last placed, won, scored) and for focus on the dyes. It is never a fill for interface chrome.

## Typography

**Display Font:** Shippori Mincho B1, weight 800 only (with Hiragino Mincho ProN, Yu Mincho, Georgia, serif), led by **Garden Ellipsis**, an alias of Source Sans 3 Bold for the ellipsis character only (U+2026), so a name cut short ends in Latin dots on the baseline rather than Shippori's centred Japanese ones
**Body Font:** Source Sans 3, weights 400, 600 and 700 (with system-ui, Segoe UI, Roboto, sans-serif)

**Character:** A heavy brush-cut Mincho gives names, results and the wordmark the voice of the printed game; a clean humanist sans carries every instruction and control, legible at 13 to 16px on every engine. Both are self-hosted.

### Hierarchy
- **Display** (800, 0.95, 0.04em tracking): the Paper Garden wordmark on home only, with a soft 0 4px 24px shadow. It is sized from the width of its column (container query units), so it always fits: on one line in portrait (min(6rem, 100cqi / 7.6)), "Paper" over "Garden" in landscape (min(5.5rem, 100cqi / 4.1)).
- **Headline** (800, 1.5rem, 1.2): sheet titles. Rules section heads use the same face at 1.3rem; the about heading at 1.2rem.
- **Title** (800, 1.375em of the seat size, 1.5): player names in the seats, the line tall enough for Shippori's descenders. A long name shrinks a little to fit beside its token count and score (down to 80%; to 58% on the tightest portrait screens, where a line cannot be spared); then the count and score move to a line of their own and the name may shrink further (to 58%); then it wraps onto two or three lines; a name taken under 18px is set in Source Sans 3 bold (see the Eighteen Pixel Rule); both names are always at one size, decided once for the whole match; an ellipsis (the Latin one, on the baseline) is a last resort no tested screen reaches. Game results use the display face at 1.6em (1.3em for a quiet result such as a tie). Points totals use it at 1.45em.
- **Body** (400, 1rem, 1.45): default text. Rules prose runs at 1.55 line height, its measure set by the 38rem rules sheet; the order card's instruction at 1.0625em, 1.3, balanced.
- **Strong** (700): button labels, tile names inside instructions, choice and toggle titles, legends.
- **Label** (600, 0.9375rem, 1.2, 0.01em): the match label in the top bar, link buttons, menu items (1.0625rem).
- **Caption** (400, 0.875rem, 1.3): details under choices and toggles, figure captions, credits, button sub-lines.

### Named Rules
**The Eighteen Pixel Rule.** The display face is set at 18px or above only; below that everything is Source Sans 3. Seat names are the one display use that can shrink under 18px (a long name on a small screen); when the fit takes them there, both names switch to Source Sans 3 bold together.

**The Seat Scale Rule.** Everything in a seat is sized in em from one seat font size (1rem default; 0.9375rem and 0.875rem on short screens; clamp(0.875rem, 0.25rem + 1.2vw, 1.5rem) in landscape), so a seat scales as a whole.

**The Tabular Count Rule.** Token counts and points use tabular figures.

## Layout

The screen is fixed to the visual viewport (100dvh where supported) and never scrolls; only sheet bodies scroll. Safe-area insets are added to every edge.

**Portrait (aspect below 5/4):** a single column grid of top bar, indigo seat, garden, vermilion seat, bottom inset. The garden takes the smaller of the full width minus gutters, the height left after the top bar and two minimum seat heights, and 640px. The two dyes meet at the garden's centre line, computed from the top bar and insets (home measures it live). The indigo seat aligns its contents to the garden's top edge, the vermilion seat to its bottom edge, so each player's information sits against the garden on their side.

**Landscape (aspect 5/4 and wider):** vermilion seat left, garden centre, indigo seat right, the top bar spanning above. Seats are clamp(9.5rem, 22vw, 23.75rem) wide; the garden takes what remains up to 760px. Both seats start level with the garden's top edge so the two names share a line.

**Home** repeats the same composition: wordmark in the indigo half, a freshly dealt garden on the seam, the actions in the vermilion half (side by side in landscape, up to 600px garden).

**Rhythm:** gutters are clamp(12px, 3.6vw, 32px) in portrait and clamp(12px, 1.6vw, 28px) in landscape. The garden keeps a 10px gap to the halves (6px on very short landscape screens). Component spacing uses 4, 8, 10, 12, 16 and 20px; inside seats spacing is in em.

**Short screens** step the layout down rather than scrolling: at 760px tall and 620px tall (portrait) the top bar and minimum seat height shrink and the seat font steps down. Beyond that the seats fit themselves by measurement, both together, planned once per screen size from the tallest content a game can show (the opening card with its note, the longest order), so the garden holds its size through a game: (1) the row of token pips gives way to a numeric count, then the seats take room from the garden, at most a tenth of it; (2) the seat type steps down a size (90%), and the seats may take up to 15% of the garden; (3) the opener's note moves to the waiting player's seat, which has room to spare at an opening move; (4) the type steps down again (80%); (5) only as a last resort, the note is left out (reached only on the smallest phones with the largest text and the longest names). The garden never gives so much that a tile drops under 44px. The instruction and the result are never dropped. A finished game raises the minimum seat height so the result and its buttons fit; the garden steps back a little to make room, and the seats keep their width so the header keeps its shape.

**Layout reserves are in rem**, so a larger default text size shrinks the garden, never the seats.

### Named Rules
**The Garden First Rule.** The garden is sized first and is the largest element at every viewport; seats, bars and cards fit around it. Short screens drop decoration (the pips) before the garden gives way, and the garden gives a tenth of itself (15% as a last resort), never below 44px tiles, so that no instruction is lost. It never changes size during a game.

## Elevation & Depth

Depth is physical, as on a table: cloth is the ground, the paper board lies on it with a real cast shadow, tiles are raised slightly in their board, taken cells are pressed in, tokens carry their own drop shadow inside the SVG, and sheets lift off the whole table. Shadows scale with the board where they belong to it. Light comes from above.

### Shadow Vocabulary
- **Board on cloth** (`0 calc(var(--board)*.05) calc(var(--board)*.09) calc(var(--board)*-.03) rgba(8,6,14,.65), 0 2px 4px rgba(8,6,14,.25), inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 0 rgba(90,64,30,.25)`): the garden board only.
- **Raised tile** (`0 1px 0 rgba(255,255,255,.7) inset, 0 0 0 1px rgba(80,60,30,.14) inset, 0 2px 3px rgba(60,40,15,.22)`): every tile cell at rest.
- **Pressed well** (`inset 0 2px 5px rgba(70,50,20,.35), inset 0 0 0 1px rgba(80,60,30,.16)`): a cell holding a token.
- **Lifted tile** (gold ring plus `0 calc(var(--board)*.02) calc(var(--board)*.035) rgba(40,25,5,.42)`, translateY -4%, -6% on hover): a tile that may be taken.
- **Card on cloth** (`0 6px 16px -8px rgba(0,0,0,.55)`): the order card. Paper buttons on dye use `0 1px 0 rgba(255,255,255,.7) inset, 0 8px 18px -8px rgba(0,0,0,.6)`.
- **Sheet** (`0 -12px 40px rgba(0,0,0,.35)` as a bottom sheet; `0 30px 80px rgba(0,0,0,.45)` centred on wide screens), over a rgba(12,10,22,.6) backdrop.

### Named Rules
**The Shade Layer Rule.** Tiles that may not be taken sink under a warm shade layer (rgba(70,54,36,.3), .38 once the game is over) drawn as a pseudo-element, never a CSS filter: filters on these SVG-filled buttons crashed WebKit during play.

**The Texture Rule.** Cloth and paper texture is a 256px seamless tile in grey light and shade, soft-light blended over flat colour. A new surface of cloth or paper uses the same tiles the same way; texture is never a photograph or a gradient imitation.

## Shapes

Soft rectangles throughout, with circles for things you hold. Controls and cards share one 12px radius; the segmented control's inner options use 9px so they nest; sheets use 20px (top corners only when docked to the bottom). The garden board and its cells take radii proportional to the board (4.5% and 2.4% of its size) so they look the same at every scale. Icon buttons, tokens, pips, switch knobs and the last-move ring are circles; link buttons and switches are pills. Won-game seals are small squares rotated 45 degrees, pressed in gold like a stamp; an unwon seal is an empty cream frame.

Icons are authored SVG on a 24px grid, 1.8 stroke, round caps and joins, drawn in currentColor.

## Components

### Buttons
Paper on cloth, cloth on paper: a button takes the material opposite to the ground it sits on.
- **Shape:** gently rounded (12px), minimum 48px tall (seat buttons max(44px, 3em)), 20px side padding, 10px icon gap, bold label.
- **Primary on the dyes:** paper with ink text and a soft cast shadow; hover brightens to lit paper.
- **Ghost on the dyes:** translucent cream with a cream hairline border and cream text.
- **Primary on paper:** vermilion with cream text; hover deepens to pressed vermilion.
- **Ghost on paper:** transparent with an ink hairline and ink text.
- **Big variant (home):** full width, at least 4em tall, left-aligned, a title line (1.0625em) and an optional sub-line (0.875em, 400, 92% opacity).
- **Press:** translate down 1px. Transitions 0.15s.

### Icon and link buttons
- **Icon button:** 44px circle, translucent cream with a cream hairline on the dyes (ink equivalents on sheets), 24px icon; press scales to 0.94; disabled at 35% opacity.
- **Link button:** pill, 44px tall, transparent, 600 weight, 20px icon; hover fills translucent cream.

### Order card (signature)
The paper card in the mover's half that says what to take. Paper with paper texture, 12px radius, a small cast shadow; the opponent's last tile at the left (3.4em square tile face), the instruction to its right, with inline tile glyphs and bold tile names. On the opening move the tile becomes a 4x4 ring diagram with gold outer cells. In narrow seats (container under 250px) the tile shrinks to 2.6em and the card stays one row. The computer's thinking state shows a breathing ellipsis (opacity 0.25 to 1, 1.2s).

### Seat (signature)
A player's half: their token chip, name in the display face, match score (three gold seals, or points in the display face), a row of eight token pips (spent pips become empty cream rings), then the order card, a waiting line, or the result. Results use the display face in cream with a cream-2 reason line; points scored are gold on indigo and cream on vermilion, where gold text would be too faint (3.3:1).

### Garden (signature)
The paper board with sixteen cells in a 4x4 grid, gap 1.8% and padding 3% of the board. Cells are tile faces holding the kept tile art; taken cells become pressed wells holding a lacquered token. States: may be taken (gold ring, lifted, shadow), may not be taken (warm shade), last placed (gold ring inside the cell), refused tap (a short horizontal shake, 0.32s), game over (a brush-ink stroke drawn through the winning formation; dead tiles shaded).

### Sheets
Dialogs are paper sheets: docked to the bottom with 20px top corners on phones, centred (560px; 38rem, 608px, for rules) from 640px wide and 560px tall. Head with a display-face title and a close icon button, a hairline below; a scrolling body; an optional footer with a hairline above. Opening rises 24px and fades in over 0.32s.

### Inputs / Fields
- **Segmented control:** paper-tray with 4px padding and 12px radius; options 44px tall, bold, ink-2; the selected option becomes paper with a sunk-vermilion label, a small shadow and a 2px vermilion underline inset.
- **Choice card:** paper, 12px radius, warm hairline inset; a 26px circular mark on the right fills vermilion with a cream check when selected, and the card gains a 2px vermilion inset ring.
- **Name field:** paper, 12px radius, warm hairline inset; the player's token chip at the left, the ink-3 colour label above the input, so the input has the field's whole width (16px text, which iOS does not zoom); focus thickens the inset ring to 2px vermilion.
- **Switch:** 50 x 30px pill, warm tan off, vermilion on, white 24px knob sliding 20px.
- **Menu item:** 52px row, 600 weight, ink text, vermilion icon, warm hairline between rows; disabled at 40% ink.

### Focus
Keyboard focus on the dyes is a 3px gold outline, offset 2px (drawn tight, offset -1px, on the top bar's buttons so the screen edge never cuts it); on the garden it is a 3px ink outline, offset 3px; on paper (sheets and their controls) it is a 3px vermilion outline. Every focus mark reaches 3:1 against what it sits on; gold on paper would not (1.6:1), so it is never used there. When a game starts, continues or moves on, focus goes into the garden for a player using the keyboard; after a touch it is left alone, as WebKit would draw a ring on the tile.

### Forced colours
Under Windows High Contrast the interface takes the system's colours, but the garden, the order card's tile, the token chips and pips keep their own: they are a picture, and the gold ring and shade that tell which tiles may be taken would otherwise vanish.

### Motion
One exponential ease-out (cubic-bezier(0.16, 1, 0.3, 1)) for the turn light (opacity only, 0.45s), tile lift (0.22s), token set-down (0.42s, drops from above with a small settle) and sheets (0.32s). The taken tile flies to the mover's card over 520ms (360ms when there is no target slot); the winning brush stroke draws over 650ms after a 180ms pause. Under reduced motion (system setting or the in-app setting) every animation and transition collapses to instant; every state change still happens.

## Do's and Don'ts

### Do:
- **Do** split every screen into the vermilion and indigo halves with the paper garden on the seam, stacked in portrait, side by side from aspect 5/4.
- **Do** light only the half of the player to move, with the lit dye and a radial light brightest at the seam, animating opacity alone.
- **Do** put cream type on the dyes and ink type on paper, and swap a control's material when it moves from cloth to paper.
- **Do** size the garden first; let short screens turn the pips into a count before the garden gives room, and move a note to the waiting seat before leaving it out.
- **Do** keep every touch target at least 44px.
- **Do** blend the cloth and paper texture tiles (256px, soft-light) under any new cloth or paper surface.
- **Do** draw new icons as SVG on the 24px grid with a 1.8 stroke, round caps and joins, in currentColor.
- **Do** keep the display face to 18px and above and set everything smaller in Source Sans 3.

### Don't:
- **Don't** redraw, restyle or recolour the garden tile art; frame it only. The rising sun stays a plain disc.
- **Don't** tell players apart by colour alone: player 1's tokens carry the five-petal crest, player 2's stay plain.
- **Don't** put the board on a neutral page or move player information into a status bar or side panel; it lives in that player's half.
- **Don't** use indigo as an action colour or gold as a fill for interface chrome.
- **Don't** apply CSS filters to garden cells; shade them with a layer.
- **Don't** add a motion that has no reduced-motion fallback to an instant state change.
