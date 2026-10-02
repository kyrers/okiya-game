import { symGlyph, vegGlyph } from './tileArt';

/** Static "How to play Okiya" content, shared by every mode. */
export function okiyaRulesHtml(): string {
  return `
  <h4 class="rule-sub">A turn</h4>
  <ol>
    <li>Take a tile and put one of your tokens in its place.</li>
    <li>The <strong>first</strong> tile of the game must come from the <strong>outer border</strong>; the four centre tiles are forbidden on move 1.</li>
    <li>Every later tile must share the <strong>vegetation or the symbol</strong> of the tile your opponent just took.</li>
  </ol>
  <h4 class="rule-sub">Winning</h4>
  <ul>
    <li>Four of your tokens in a <strong>row, column or diagonal</strong>.</li>
    <li>Four of your tokens in a <strong>2×2 square</strong>.</li>
    <li>Leaving your opponent with <strong>no legal tile</strong>: they are blocked and you win.</li>
  </ul>
  <h4 class="rule-sub">The garden</h4>
  <p>16 tiles, every pairing of a <strong>vegetation</strong>
    ${vegGlyph('maple')} maple, ${vegGlyph('cherry')} cherry, ${vegGlyph('pine')} pine, ${vegGlyph('iris')} iris
    with a <strong>symbol</strong>
    ${symGlyph('sun')} rising sun, ${symGlyph('poem')} poem, ${symGlyph('bird')} bird, ${symGlyph('rain')} rain,
    shuffled into a 4×4 square. Victory points: a win is worth the number of tiles still in the garden.</p>
  <p class="muted"><strong>Empty garden.</strong> The official sheet does not say what happens when the last tile is taken without a line or square. Here we apply the blocking rule literally: the other player cannot make a move, so whoever took the last tile wins. Some players treat it as a tie instead.</p>
  <p class="muted">Okiya is by Bruno Cathala and Cyril Bouquet (Blue Orange Games).</p>`;
}
