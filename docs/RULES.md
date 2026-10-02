# Okiya — official rules (summary)

Source: Blue Orange Games, *Okiya Print & Play* rules by Bruno Cathala and Cyril Bouquet,
<https://blueorangegames.eu/wp-content/uploads/2020/04/Okiya-PnP-EN.pdf> (4 pages, read on 2026-10-02).
The summary below is in our own words; the engine in `src/engine/okiya.ts` implements it (one
interpretation is flagged below where the PDF is silent).

## Components
- 16 garden tiles: every combination of 4 vegetations (maple, cherry, pine, iris)
  and 4 symbols (rising sun, poem, bird, rain/cloud). The PDF's tile pages show
  exactly these 16 combinations.
- 8 character tokens per player, each player with their own pattern.

## Setup
- Shuffle the 16 tiles and lay them face up in a 4x4 square (the garden).
- First game: first player chosen at random. Later games: the loser of the previous game starts.

## Turn
1. The **first player's first move** must take a tile on the **outside border** of the
   garden. The 4 centre tiles are forbidden on the first turn.
2. The chosen tile is removed and replaced by one of the mover's tokens. The removed
   tile is placed face up between the players; it is the **constraint** for the next move.
3. Every following move must take a tile that shares **the same vegetation or the same
   symbol** with the tile just removed, and replace it with a token. The new tile is put on
   top of the old one and becomes the new constraint.

## Winning (immediate)
- A row of 4 of your tokens: horizontal, vertical or diagonal.
- A 2x2 square of 4 of your tokens.
- Your opponent has no legal move (they are **blocked**).

> **Interpretation (not stated in the PDF).** The sheet does not say what happens when the
> 16th tile is taken without a formation. This project applies the blocking rule literally:
> the other player cannot make a move, so the player who took the last tile wins (the engine
> flags such a game with `fullGarden: true`, constant `FULL_GARDEN_RULE`). At least one
> secondary source (boardgamesbot.com) calls this ending a tie instead. Under our ruling the
> game can never end in a draw; the rules auditor measured that this ending decides about
> 13% of random games and most games between strong, equal AIs.

## End of the game (match variants)
- **Single game**: one round, winner takes the match.
- **Match in three sets**: first player to win 3 games.
- **Match of victory points**: the winner of a game scores as many points as there are
  garden tiles left in the garden; first to 10 (or 15/20 for longer matches) wins. The engine
  implements all three targets (`points10`, `points15`, `points20`); Hanamichi itself uses its
  own station structure instead of these match formats.
