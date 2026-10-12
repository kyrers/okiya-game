import { type Cell, type GameState, type Player, type Tile, parseTile } from './okiya';

/**
 * Build a game state from a 4x4 picture. Each token is either "1" / "2"
 * (a player's character token) or a two-letter tile code like "Cb".
 */
export function stateFromPicture(picture: string, current: Player, lastTile: Tile | null): GameState {
  const codes = picture.trim().split(/\s+/);
  if (codes.length !== 16) throw new Error(`picture needs 16 cells, got ${codes.length}`);
  const board: Cell[] = codes.map((code) => {
    if (code === '1') return { kind: 'token', player: 1 };
    if (code === '2') return { kind: 'token', player: 2 };
    return { kind: 'tile', tile: parseTile(code) };
  });
  return { board, current, lastTile, history: [], result: null };
}
