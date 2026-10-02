import { applyMove, newGame, type GameState } from './engine/okiya';
import { chooseMove, DIFFICULTY } from './engine/ai';
import { renderBoard } from './ui/board';

// Temporary smoke-test shell: play plain Okiya against the AI. Replaced by the real app.
const app = document.getElementById('app')!;
app.innerHTML = `<main style="display:grid;place-items:center;min-height:100dvh;gap:16px;padding:16px">
  <h1>Okiya</h1><div id="board"></div><p id="status"></p></main>`;
const boardEl = document.getElementById('board')!;
const statusEl = document.getElementById('status')!;
let state: GameState = newGame(Date.now() & 0xffff);
let last: number | null = null;

function render() {
  renderBoard(boardEl, state, { human: 1, onMove, lastIndex: last });
  boardEl.classList.toggle('has-legal', state.current === 1 && !state.win);
  statusEl.textContent = state.win ? `Player ${state.win.winner} wins by ${state.win.reason}` : `Player ${state.current} to move`;
  if (!state.win && state.current === 2) {
    setTimeout(() => {
      const r = chooseMove(state, DIFFICULTY.apprentice);
      last = r.index;
      state = applyMove(state, r.index);
      render();
    }, 400);
  }
}
function onMove(i: number) {
  last = i;
  state = applyMove(state, i);
  render();
}
render();
