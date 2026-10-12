# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who want to play Okiya, the two-player abstract board game by Bruno Cathala and Cyril
Bouquet, on a screen instead of a table:

- **Two people sharing one device** (a phone or tablet passed back and forth or laid between them,
  or a laptop), playing a quick game or a short match.
- **One person against the computer**, at one of three difficulty levels, on whatever device is
  at hand: a phone on a commute, a tablet on the sofa, a desktop browser.

New players must be able to learn the game inside the product; returning players want to start a
game in one or two taps.

## Product Purpose

A digital edition of Okiya that plays exactly by the official rules, good enough to be sold as a
real game. Success: a game feels as clear and pleasant as the physical one, on any screen, with no
rule ever applied wrongly and no layout ever breaking.

## Positioning

The rules are the official ones and nothing else: the Blue Orange print-and-play rules sheet
(https://blueorangegames.eu/wp-content/uploads/2020/04/Okiya-PnP-EN.pdf), plus the designer's own
ruling for the one case the sheet leaves open (a full garden with no formation is a tie). No
campaign, progression, charms or other layer on top.

## Operating Context

- Played in short sessions (a game is 16 moves at most, a few minutes).
- Hot-seat play: both players read the same screen in one orientation, so whose turn it is must be
  unmistakable at a glance.
- Touch first on phones and tablets (portrait and landscape), mouse and keyboard on desktop.
- Offline or flaky connections are common on phones; nothing in a game should need the network.

## Capabilities and Constraints

- Modes: two players on one device; one player against the computer with three levels (Easy,
  Medium, Hard), Hard strong but beatable.
- End-of-game formats from the rules sheet: single game; match to three won games; victory-point
  match to 10, 15 or 20 points (a win scores the tiles still in the garden).
- First game of a match: first player chosen at random. Later games: the loser of the previous
  game starts.
- Static site deployable to Vercel. No backend, accounts, keys or analytics. Matches are saved in
  the browser so a closed tab can be resumed.
- Every asset (art, icons, fonts, sounds) must be original or licensed for commercial use.
- Must work flawlessly on phones, tablets and desktops (the previous attempt had UI bugs on phones).
- Stack: the existing codebase (TypeScript + Vite, no UI framework, pure rules engine with tests).

## Brand Commitments

- **The garden tile designs are kept.** The previous attempt's original SVG tiles (maple, cherry,
  pine, iris × rising sun, poem, bird, rain) were liked by the client; they are the product's
  visual anchor. The rising sun stays a plain disc (no rays).
- The campaign layer of the previous attempt ("Hanamichi": stations, charms, petals, Firefly) is
  not wanted and is removed.
- Credit Okiya to its designers, Bruno Cathala and Cyril Bouquet. No Blue Orange artwork, logos or
  trade dress are used.

## Evidence on Hand

- Official rules: the PnP PDF above (read 2026-10-12).
- Designer ruling on a full garden: BoardGameGeek thread 984327, reply by Bruno Cathala
  ("Bruno des Montagnes", BGG user 25583), 2013-05-30: "in this case, it's a tie !"
- Tile art: `src/ui/tileArt.ts` (original SVG).
- Open, not decided here: whether the name "Okiya" may be used commercially needs a licence from
  the rights holders; no licence or endorsement may be claimed in the product.

## Product Principles

1. The rules are sacred: the engine decides legality and victory, and the interface only shows it.
2. The board is the screen: everything else gets out of its way, on every device.
3. Never make a player guess: whose turn, what may be taken, and why a game ended are always shown.
4. Start fast, resume always: one or two taps to a game, and no lost match when a tab closes.

## Accessibility & Inclusion

- Players are told apart by colour **and** by token pattern (as in the physical game, where one
  set is patterned and the other plain).
- Full keyboard play, screen-reader labels for tiles and moves, visible focus.
- Respect reduced-motion preferences; touch targets at least 44 px.
