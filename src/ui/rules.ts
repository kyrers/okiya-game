/**
 * How to play: the official rules (in our own words, with our own examples and diagrams), the
 * designer's ruling for a full garden, the match formats and a key of the sixteen tiles.
 */
import { parseTile, sharesElement } from '../engine/garden';
import { icon, miniGarden, tokenSvg } from './art';
import { gardenKeyHtml, symGlyph, tileLabel, tileSvg, vegGlyph } from './tileArt';

/** The constraint example: a real position, reached by taking Ps, Pb, Mb, then Mr (rules.test.ts). */
export const EXAMPLE_POSITION = 'Cs 1 Mp Pr  2 Ib Ir Ms  Pp Cr 1 Is  Cb Cp Ip 2';
export const EXAMPLE_TAKEN = 'Mr';

/** The win diagrams, as drawn: [cells, formation]. '1'/'2' tokens, 'x' a tile that may not be taken. */
export const WIN_DIAGRAMS: [string, number[] | null][] = [
  ['. . . . 1 1 1 1 . 2 . . 2 . 2 .', [4, 5, 6, 7]],
  ['1 2 . . . 1 . 2 . . 1 . 2 . . 1', [0, 5, 10, 15]],
  ['. . . . 1 1 2 . 1 1 . . 2 . 2 .', [4, 5, 8, 9]],
  ['1 2 x 2 2 1 2 1 x 1 2 1 2 x 1 x', null],
];

/** A real position: maple-rain was just taken; the maple and rain tiles are the ones allowed. */
function exampleBoard(): string {
  const taken = parseTile(EXAMPLE_TAKEN);
  const cells = EXAMPLE_POSITION.split(/\s+/);
  const html = cells
    .map((c) => {
      if (c === '1' || c === '2') return `<span class="eg-cell eg-token">${tokenSvg(Number(c) as 1 | 2)}</span>`;
      const t = parseTile(c);
      const ok = sharesElement(t, taken);
      return `<span class="eg-cell ${ok ? 'eg-open' : 'eg-closed'}" title="${tileLabel(t)}">${tileSvg(t)}</span>`;
    })
    .join('');
  return `<div class="eg" role="img" aria-label="Example: after maple with rain was taken, the five maple or rain tiles may be taken">
    <div class="eg-taken"><span class="eg-cell">${tileSvg(taken)}</span><span>Just taken</span></div>
    <div class="eg-board">${html}</div>
  </div>`;
}

export function rulesHtml(): string {
  return `
  <div class="rules">
    <div class="rules-watch"><button type="button" class="btn ghost" data-go="demo">${icon('watch')} Watch a game</button><span>A whole game, played move by move, with what each player may take.</span></div>
    <p class="rules-lede">Two players take turns taking tiles from a garden of sixteen and putting their own tokens in their place. The tile you take decides what your opponent may take next.</p>

    <h3>How to win</h3>
    <p>Be the first to do one of these:</p>
    <div class="rules-figs">
      <figure>${miniGarden(WIN_DIAGRAMS[0][0], 'Four tokens in a row', WIN_DIAGRAMS[0][1]!)}<figcaption>Four in a row or a column</figcaption></figure>
      <figure>${miniGarden(WIN_DIAGRAMS[1][0], 'Four tokens on a diagonal', WIN_DIAGRAMS[1][1]!)}<figcaption>Four on a diagonal</figcaption></figure>
      <figure>${miniGarden(WIN_DIAGRAMS[2][0], 'A square of four tokens', WIN_DIAGRAMS[2][1]!)}<figcaption>A square of four</figcaption></figure>
      <figure>${miniGarden(WIN_DIAGRAMS[3][0], 'A blocked opponent: no tile left that may be taken')}<figcaption>Leave your opponent no tile to take</figcaption></figure>
    </div>

    <h3>Setting up</h3>
    <p>The sixteen tiles are shuffled and laid face up in a 4 × 4 square: the garden. Each player has eight tokens. <span class="inline-chip">${tokenSvg(1)}</span> Vermilion tokens carry a crest; <span class="inline-chip">${tokenSvg(2)}</span> indigo tokens are plain.</p>
    <p>The first player of a match is chosen at random. After that, <b>whoever lost the previous game opens the next one</b>.</p>

    <h3>Your turn</h3>
    <p>Take one tile from the garden and put one of your tokens in its place.</p>
    <div class="rules-row">
      ${miniGarden('o o o o o x x o o x x o o o o o', 'The first move: any tile on the outer ring, not the four in the middle')}
      <p><b>The first tile of a game</b> must come from the outer ring. The four tiles in the middle are closed on that first move only.</p>
    </div>
    <div class="rules-row">
      ${exampleBoard()}
      <p><b>Every tile after that</b> must share the plant <i>or</i> the symbol of the tile your opponent just took. Here they took ${vegGlyph('maple')} maple with ${symGlyph('rain')} rain, so you may take any maple tile or any rain tile: the five lifted ones.</p>
    </div>
    ${gardenKeyHtml('names')}
    <p>The tile just taken is shown in the next player's half of the screen, with what it allows.</p>

    <h3>Blocked</h3>
    <p>If no tile left in the garden shares the plant or the symbol of the tile just taken, the player to move cannot play: they are blocked, and they lose.</p>

    <h3>A full garden</h3>
    <p>If the last of the sixteen tiles is taken and nobody has made a line or a square, the game is a <b>tie</b>.</p>
    <details class="rules-note">
      <summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg><span>Whose rule this is, and who opens next</span></summary>
      <div class="rules-note-body">
        <p>The printed rules do not cover this case; this is the ruling of the designer.</p>
        <p>Who opens after a tie is this edition's choice: the printed rules have the loser of a game open the next one, and a tie has no loser, so the player who did not open the tied game opens the next.</p>
      </div>
    </details>

    <h3>Matches</h3>
    <dl class="rules-modes">
      <dt>Single game</dt><dd>One game decides it.</dd>
      <dt>First to 3 wins</dt><dd>Play on until someone has won three games.</dd>
      <dt>Victory points</dt><dd>The winner of each game scores one point for every tile still in the garden. First to 10 points wins; choose 15 or 20 for a longer match. A tie scores nothing.</dd>
    </dl>

    <h3>The sixteen tiles</h3>
    <p>Each tile pairs one of four plants with one of four symbols. The printed rules call the fourth symbol "rain or cloud": here, a cloud with rain falling.</p>
    ${gardenKeyHtml()}
  </div>`;
}
