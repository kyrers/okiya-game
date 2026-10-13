# Paper Garden: the rules this game plays by

Paper Garden plays by the rules of an abstract game designed by Bruno Cathala, illustrated by
Cyril Bouquet and published by Blue Orange Games as *Okiya* (and as *Niya*). The published name
is not used in the product (client, 2026-10-13); it appears here only to cite the sources.

Sources:

1. **The official rules**: Blue Orange Games, *Okiya Print & Play*, design by Bruno Cathala,
   art by Cyril Bouquet, <https://blueorangegames.eu/wp-content/uploads/2020/04/Okiya-PnP-EN.pdf>
   (4 pages; read 2026-10-12). Summarised below in our own words.
2. **The designer's ruling for the one case the sheet leaves open** (a garden emptied without a
   winner): BoardGameGeek thread 984327, *All pieces played: is it a tie? or a loss for the first
   player?*, reply by Bruno Cathala (BGG user "Bruno des Montagnes", id 25583) on 2013-05-30:
   "in this case, it's a tie !". The thread can be read through the BGG API:
   `https://api.geekdo.com/api/articles?threadid=984327&pageid=1`.

Where the code implements each rule: `src/engine/garden.ts` (one game, match formats) and
`src/game/match.ts` (a match as the app plays it). The in-game "How to play" sheet
(`src/ui/rules.ts`) says the same things to players.

## Components

- 16 garden tiles: every pairing of 4 vegetations (maple, cherry, pine, iris) with 4 symbols
  (rising sun, poem, bird, rain/cloud).
- 8 tokens per player. In the printed game one player's tokens carry a pattern and the other's are
  plain; here vermilion tokens carry a crest and indigo tokens are plain.

## Setup

- The 16 tiles are shuffled and laid face up in a 4 × 4 square: the garden.
- First game of a match: the first player is chosen at random. Every later game: the player who
  lost the previous game opens.

## A turn

1. The opening move of a game must take a tile on the **outer border**; the 4 middle tiles may not
   be taken on that first move (whichever player opens).
2. The tile taken is replaced by one of the mover's tokens and placed between the players, where
   it sets the constraint.
3. Every later move must take a tile that shares **the vegetation or the symbol** of the tile just
   taken. The new tile covers the previous one and becomes the constraint.

## End of a game

A player wins at once by:

- four of their tokens in a row, a column or a diagonal;
- four of their tokens in a 2 × 2 square;
- leaving the opponent with no tile they may take (the opponent is **blocked**).

A move that completes a formation wins by that formation even if it also leaves the opponent
blocked.

**Full garden (designer ruling).** If the sixteenth tile is taken and nobody has made a line or a
square, the game is a **tie**. (Each player has then placed all eight tokens.) The earlier version
of this project ruled such a game a win for the last mover; that was wrong and has been replaced.

## Matches (End of the game, from the sheet)

- **Single game**: one game; its winner wins. A tied single game ends the match with no winner.
- **First to 3 wins** ("match in three sets"): play until a player has won three games. Ties count
  as games played and score nothing.
- **Victory points**: the winner of a game scores one point per tile still in the garden; the
  first player to 10 points wins (15 or 20 for a longer match). A tie scores nothing, and so does a
  win on the very last tile (no tile is left in the garden).

**Who opens after a tie (our interpretation).** The sheet says the loser of the previous game
opens the next one, and a tie has no loser. This edition lets the player who did *not* open the
tied game open the next one, so openings alternate. This is labelled as our choice in the in-game
rules.

## What is not from the rules

Nothing changes how a game is played. Conveniences that do not alter the rules: the takeable tiles
can be lifted on screen (a setting), a move can be taken back (in a game against the computer,
back to your previous turn), and matches are saved on the device.
