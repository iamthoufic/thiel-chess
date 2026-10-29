// "His repertoire": walk the opening tree of PeterThiel's real games.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { bookKey } from './engine.js';

const $ = (s) => document.querySelector(s);
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// Foot of the panel: how often he reached this position, and how he scored from it.
function summary(rows, total, hisTurn) {
  let score = '';
  if (hisTurn) {
    const [w, d] = rows.reduce(([sw, sd], r) => [sw + r[2], sd + r[3]], [0, 0]);
    score = `<div><b>${pct(w + d / 2, total)}%</b><span>his score from here</span></div>`;
  }
  return `<div class="xsummary"><div><b>${total.toLocaleString()}</b><span>of his games reached this position</span></div>${score}</div>`;
}

export class Explorer {
  constructor({ engine, sounds, onReady }) {
    this.engine = engine;
    this.sounds = sounds;
    this.side = 'w';
    this.path = []; // [{ uci, san }]
    this.board = new Board($('#explorerBoard'));
    $('#explorerSide').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.side === this.side) return;
      this.side = b.dataset.side;
      for (const x of document.querySelectorAll('#explorerSide button')) x.classList.toggle('active', x === b);
      this.path = [];
      this.board.setOrientation(this.side);
      this.render(true);
    });
    $('#explorerList').addEventListener('click', (e) => {
      const row = e.target.closest('.xrow');
      if (!row) return;
      this.sounds.unlock();
      this.path.push({ uci: row.dataset.uci, san: row.dataset.san });
      this.render(true, true);
    });
    $('#explorerPath').addEventListener('click', (e) => {
      const crumb = e.target.closest('.crumb');
      if (!crumb) return;
      this.path = this.path.slice(0, Number(crumb.dataset.n));
      this.render(true);
    });
    $('#explorerBack').addEventListener('click', () => { this.path.pop(); this.render(true); });
    $('#explorerReset').addEventListener('click', () => { this.path = []; this.render(true); });
    engine.bookReady.then(() => { onReady?.(); this.render(false); });
  }

  render(animate, forward = false) {
    const chess = new Chess();
    let last = null;
    for (const step of this.path) last = chess.move({ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), promotion: step.uci[4] });
    this.board.setPosition(chess.fen(), { lastMove: last ? { from: last.from, to: last.to } : null, animate });
    if (forward && last) this.sounds.play(this.sounds.forMove(last, chess.inCheck()));

    // breadcrumb
    $('#explorerPath').innerHTML = this.path.length
      ? this.path.map((s, i) => `${i % 2 === 0 ? `<span class="num">${i / 2 + 1}.</span>` : ''}<span class="crumb${i === this.path.length - 1 ? ' cur' : ''}" data-n="${i + 1}">${s.san}</span>`).join('')
      : '<span class="start">Starting position. Choose a move to follow his games.</span>';

    const book = this.engine.book;
    const hisTurn = chess.turn() === this.side;
    const entries = (hisTurn ? book.mine : book.theirs)[bookKey(chess.fen())] ?? [];
    const legal = new Map(chess.moves({ verbose: true }).map((m) => [m.from + m.to + (m.promotion ?? ''), m.san]));
    const rows = entries.filter(([uci]) => legal.has(uci));
    const total = rows.reduce((s, r) => s + r[1], 0);
    const list = $('#explorerList');
    if (!rows.length) {
      list.innerHTML = `<div class="explorer-empty">${this.path.length >= book.maxPly
        ? 'His book ends after ten moves. From here the trained model plays.'
        : 'He did not reach this position often enough to have a pattern.'}</div>`;
    } else {
      list.innerHTML = `<div class="xhead"><span>${hisTurn ? 'His move' : 'Their reply'}</span><span>${hisTurn ? 'His results' : 'How often'}</span><span>Games</span></div>`
        + rows.map(([uci, n, w, d, l]) => {
          const results = hisTurn
            ? `<span class="wdl" title="${w} wins, ${d} draws, ${l} losses">
                <span class="w" style="width:${pct(w, n)}%">${pct(w, n) >= 15 ? `${pct(w, n)}%` : ''}</span>
                <span class="d" style="width:${pct(d, n)}%">${pct(d, n) >= 15 ? `${pct(d, n)}%` : ''}</span>
                <span class="l" style="width:${pct(l, n)}%">${pct(l, n) >= 15 ? `${pct(l, n)}%` : ''}</span></span>`
            : `<span class="share"><i style="width:${pct(n, total)}%"></i></span>`;
          return `<button class="xrow" data-uci="${uci}" data-san="${legal.get(uci)}">
            <span class="san">${legal.get(uci)}</span>${results}<span class="count">${n.toLocaleString()} · ${pct(n, total)}%</span></button>`;
        }).join('')
        + (hisTurn
          ? '<div class="wdl-legend"><span><i class="w"></i>Won</span><span><i class="d"></i>Drawn</span><span><i class="l"></i>Lost</span></div>'
          : '<div class="wdl-legend"><span>Share of the replies he faced</span></div>')
        + summary(rows, total, hisTurn);
    }
  }
}
