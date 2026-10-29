// Chessboard view. Pieces are long-lived DOM elements positioned with CSS
// transforms; every position change is a diff that slides the matching element
// to its new square, so moves, takebacks and jumps through history all animate.
import { pieceUrl } from './assets.js';

const FILES = 'abcdefgh';
const PIECE_URL = pieceUrl;
const PROMO_ORDER = ['q', 'n', 'r', 'b'];

export const squareName = (file, rank) => FILES[file] + (rank + 1);
const fileOf = (sq) => FILES.indexOf(sq[0]);
const rankOf = (sq) => Number(sq[1]) - 1;

export function fenPieces(fen) {
  const map = new Map();
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { file += Number(ch); continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      map.set(squareName(file, 7 - r), color + ch.toUpperCase());
      file += 1;
    }
  });
  return map;
}

export class Board {
  constructor(el, options = {}) {
    this.el = el;
    this.opts = {
      interactive: false,
      canMove: () => false, // (square) => may the user pick this piece up?
      targets: () => [], // (square) => [{to, capture}]
      onMove: () => {}, // (from, to) => void
      ...options,
    };
    this.orientation = 'w';
    this.pieces = new Map(); // square -> { el, code }
    this.selected = null;
    this.lastMove = null;
    this.check = null;
    this.marks = new Set();
    this.arrows = new Map();
    this.settings = { showLegal: true, showLast: true, coords: true, anim: 200 };
    this.fen = null;

    el.innerHTML = '<div class="squares"></div><div class="pieces"></div><svg class="arrows" viewBox="0 0 8 8" preserveAspectRatio="none"></svg>';
    this.squaresEl = el.querySelector('.squares');
    this.piecesEl = el.querySelector('.pieces');
    this.arrowsEl = el.querySelector('.arrows');
    el.classList.toggle('interactive', this.opts.interactive);
    this.#buildSquares();
    if (this.opts.interactive) this.#bindPointer();
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- geometry ----------
  #display(sq) {
    const f = fileOf(sq);
    const r = rankOf(sq);
    return this.orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  }

  #squareAt(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.orientation === 'w' ? squareName(x, 7 - y) : squareName(7 - x, y);
  }

  #place(el, sq) {
    const { x, y } = this.#display(sq);
    el.style.transform = `translate3d(${x * 100}%, ${y * 100}%, 0)`;
  }

  // ---------- squares, coordinates, highlights ----------
  #buildSquares() {
    this.squaresEl.innerHTML = '';
    this.squareEls = new Map();
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const sq = this.orientation === 'w' ? squareName(x, 7 - y) : squareName(7 - x, y);
        const div = document.createElement('div');
        div.className = `sq ${(fileOf(sq) + rankOf(sq)) % 2 === 0 ? 'dark' : 'light'}`;
        div.dataset.sq = sq;
        if (x === 0) div.insertAdjacentHTML('beforeend', `<span class="coord rank">${sq[1]}</span>`);
        if (y === 7) div.insertAdjacentHTML('beforeend', `<span class="coord file">${sq[0]}</span>`);
        this.squaresEl.append(div);
        this.squareEls.set(sq, div);
      }
    }
    this.#paint();
  }

  #paint() {
    for (const [sq, div] of this.squareEls) {
      div.classList.toggle('last', this.settings.showLast && !!this.lastMove && (sq === this.lastMove.from || sq === this.lastMove.to));
      div.classList.toggle('sel', sq === this.selected);
      div.classList.toggle('check', sq === this.check);
      div.classList.toggle('marked', this.marks.has(sq));
      div.querySelector('.dot, .ring')?.remove();
    }
    if (this.selected && this.settings.showLegal) {
      for (const t of this.opts.targets(this.selected)) {
        this.squareEls.get(t.to)?.insertAdjacentHTML('beforeend', t.capture ? '<i class="ring"></i>' : '<i class="dot"></i>');
      }
    }
    this.el.classList.toggle('no-coords', !this.settings.coords);
    this.#drawArrows();
  }

  setSettings(settings) {
    Object.assign(this.settings, settings);
    this.el.style.setProperty('--anim', `${this.settings.anim}ms`);
    this.#paint();
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this.#buildSquares();
    for (const [sq, p] of this.pieces) this.#place(p.el, sq);
  }

  // ---------- position diff ----------
  setPosition(fen, { lastMove = null, check = null, animate = true } = {}) {
    this.fen = fen;
    this.lastMove = lastMove;
    this.check = check;
    this.selected = null;
    const target = fenPieces(fen);
    const old = new Map(this.pieces);
    const next = new Map();

    // 1. pieces that did not move
    for (const [sq, code] of target) {
      const p = old.get(sq);
      if (p && p.code === code) { next.set(sq, p); old.delete(sq); target.delete(sq); }
    }
    // 2. the move itself first (so a capture never steals the mover), then the
    //    nearest piece of the same kind for everything else (castling rook, history jumps)
    const moves = [];
    const order = [...target.keys()].sort((a, b) => (b === lastMove?.to) - (a === lastMove?.to));
    for (const sq of order) {
      const code = target.get(sq);
      let best = null;
      let bestDist = Infinity;
      for (const [from, p] of old) {
        const promoted = lastMove && from === lastMove.from && sq === lastMove.to && p.code[1] === 'P' && p.code[0] === code[0];
        if (p.code !== code && !promoted) continue;
        const d = from === lastMove?.from && sq === lastMove?.to ? -1 : Math.hypot(fileOf(from) - fileOf(sq), rankOf(from) - rankOf(sq));
        if (d < bestDist) { best = from; bestDist = d; }
      }
      if (best) {
        const p = old.get(best);
        old.delete(best);
        if (p.code !== code) { p.code = code; moves.push(() => { p.el.style.backgroundImage = `url(${PIECE_URL(code)})`; }); }
        next.set(sq, p);
        target.delete(sq);
        moves.push(() => this.#slide(p.el, sq, animate));
      }
    }
    // 3. captured / vanished pieces fade out once the mover lands
    for (const p of old.values()) {
      if (animate && this.settings.anim) {
        p.el.style.transitionDelay = `0ms, ${Math.round(this.settings.anim * 0.55)}ms`;
        p.el.classList.add('fading');
        setTimeout(() => p.el.remove(), this.settings.anim * 1.6 + 40);
      } else p.el.remove();
    }
    // 4. new pieces (new game, or a jump that adds material) fade in
    for (const [sq, code] of target) {
      const el = this.#create(code, sq);
      next.set(sq, { el, code });
      if (animate && this.settings.anim) {
        el.classList.add('entering');
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
      }
    }
    for (const run of moves) run();
    this.pieces = next;
    this.#paint();
  }

  #create(code, sq) {
    const el = document.createElement('div');
    el.className = 'piece instant';
    el.style.backgroundImage = `url(${PIECE_URL(code)})`;
    this.#place(el, sq);
    this.piecesEl.append(el);
    requestAnimationFrame(() => el.classList.remove('instant'));
    return el;
  }

  #slide(el, sq, animate) {
    el.style.transitionDelay = '';
    el.classList.remove('dragging');
    if (el === this.dropped) {
      // a dragged piece is already under the cursor: settle it quickly
      el.style.transition = 'transform 70ms ease-out';
      this.#place(el, sq);
      setTimeout(() => { el.style.transition = ''; }, 90);
      this.dropped = null;
      return;
    }
    if (!animate || !this.settings.anim) {
      el.classList.add('instant');
      this.#place(el, sq);
      requestAnimationFrame(() => el.classList.remove('instant'));
      return;
    }
    el.style.zIndex = '3';
    this.#place(el, sq);
    setTimeout(() => { el.style.zIndex = ''; }, this.settings.anim + 30);
  }

  // ---------- user input ----------
  select(sq) {
    this.selected = sq;
    this.#paint();
  }

  #bindPointer() {
    let press = null;
    let rightFrom = null;

    this.el.addEventListener('pointerdown', (e) => {
      const sq = this.#squareAt(e.clientX, e.clientY);
      if (!sq) return;
      if (e.button === 2) { rightFrom = sq; return; }
      if (e.button !== 0) return;
      if (this.marks.size || this.arrows.size) { this.marks.clear(); this.arrows.clear(); this.#paint(); }
      this.opts.onInteract?.();

      const isTarget = this.selected && this.opts.targets(this.selected).some((t) => t.to === sq);
      if (isTarget) { this.opts.onMove(this.selected, sq); return; }
      if (!this.opts.canMove(sq) || !this.pieces.has(sq)) {
        if (this.selected) this.select(null);
        return;
      }
      const wasSelected = this.selected === sq;
      this.select(sq);
      const piece = this.pieces.get(sq);
      const rect = this.el.getBoundingClientRect();
      press = { sq, el: piece.el, x: e.clientX, y: e.clientY, rect, dragging: false, wasSelected, hover: null };
      this.el.setPointerCapture(e.pointerId);
    });

    this.el.addEventListener('pointermove', (e) => {
      if (!press) return;
      if (!press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) return;
      if (!press.dragging) {
        press.dragging = true;
        press.el.classList.add('dragging');
        this.el.classList.add('grabbing');
      }
      const size = press.rect.width / 8;
      const x = e.clientX - press.rect.left - size / 2;
      const y = e.clientY - press.rect.top - size / 2;
      press.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const over = this.#squareAt(e.clientX, e.clientY);
      if (over !== press.hover) {
        this.squareEls.get(press.hover)?.classList.remove('hover');
        if (over && over !== press.sq) this.squareEls.get(over)?.classList.add('hover');
        press.hover = over;
      }
    });

    const finish = (e) => {
      if (e.button === 2 && rightFrom) {
        const to = this.#squareAt(e.clientX, e.clientY);
        if (to === rightFrom) this.marks.has(to) ? this.marks.delete(to) : this.marks.add(to);
        else if (to) {
          const key = rightFrom + to;
          this.arrows.has(key) ? this.arrows.delete(key) : this.arrows.set(key, [rightFrom, to]);
        }
        rightFrom = null;
        this.#paint();
        return;
      }
      if (!press) return;
      const p = press;
      press = null;
      this.squareEls.get(p.hover)?.classList.remove('hover');
      this.el.classList.remove('grabbing');
      if (!p.dragging) {
        if (p.wasSelected) this.select(null); // second click on the same piece deselects
        return;
      }
      const to = this.#squareAt(e.clientX, e.clientY);
      const legal = to && this.opts.targets(p.sq).some((t) => t.to === to);
      if (legal) {
        this.dropped = p.el;
        this.opts.onMove(p.sq, to);
        if (this.dropped === p.el) this.#snapBack(p); // move was refused or is waiting on promotion
      } else {
        this.#snapBack(p);
        if (to && to !== p.sq) this.opts.onIllegal?.();
        else this.select(p.sq);
      }
    };
    this.el.addEventListener('pointerup', finish);
    this.el.addEventListener('pointercancel', (e) => { if (press) this.#snapBack(press); press = null; rightFrom = null; });
  }

  #snapBack(p) {
    this.dropped = null;
    p.el.classList.remove('dragging');
    this.#place(p.el, p.sq);
  }

  // Move a piece that is waiting on the promotion picker back to its square.
  cancelPending() {
    if (!this.dropped) return;
    for (const [sq, p] of this.pieces) if (p.el === this.dropped) this.#snapBack({ el: p.el, sq });
  }

  // ---------- promotion picker ----------
  promote(to, color) {
    return new Promise((resolve) => {
      const { x, y } = this.#display(to);
      const fromTop = y === 0;
      const scrim = document.createElement('div');
      scrim.className = 'promo-scrim';
      const box = document.createElement('div');
      box.className = 'promo';
      box.style.left = `${x * 12.5}%`;
      box.style[fromTop ? 'top' : 'bottom'] = '0';
      const options = fromTop ? PROMO_ORDER : [...PROMO_ORDER].reverse();
      const cancel = '<button class="cancel" data-p="" aria-label="Cancel">✕</button>';
      box.innerHTML = (fromTop ? '' : cancel)
        + options.map((p) => `<button data-p="${p}" aria-label="Promote to ${p}" style="background-image:url(${PIECE_URL(color + p.toUpperCase())})"></button>`).join('')
        + (fromTop ? cancel : '');
      const done = (choice) => { scrim.remove(); box.remove(); resolve(choice || null); };
      box.addEventListener('pointerdown', (e) => { e.stopPropagation(); const b = e.target.closest('button'); if (b) done(b.dataset.p); });
      scrim.addEventListener('pointerdown', (e) => { e.stopPropagation(); done(null); });
      this.el.append(scrim, box);
    });
  }

  // ---------- arrows ----------
  #drawArrows() {
    const parts = [];
    for (const [from, to] of this.arrows.values()) {
      const a = this.#display(from);
      const b = this.#display(to);
      const ax = a.x + 0.5; const ay = a.y + 0.5;
      const bx = b.x + 0.5; const by = b.y + 0.5;
      const dx = Math.abs(a.x - b.x); const dy = Math.abs(a.y - b.y);
      const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
      // knight arrows bend once, along the longer leg first
      const points = knight ? (dy > dx ? [[ax, ay], [ax, by], [bx, by]] : [[ax, ay], [bx, ay], [bx, by]]) : [[ax, ay], [bx, by]];
      const [px, py] = points[points.length - 2];
      const len = Math.hypot(bx - px, by - py);
      const ux = (bx - px) / len; const uy = (by - py) / len;
      const head = 0.42; const width = 0.15;
      const tipBase = [bx - ux * head, by - uy * head];
      const segs = [...points.slice(0, -1), tipBase];
      const start = segs[0];
      const startTrim = [start[0] + (segs[1][0] - start[0]) / Math.hypot(segs[1][0] - start[0], segs[1][1] - start[1]) * 0.25,
        start[1] + (segs[1][1] - start[1]) / Math.hypot(segs[1][0] - start[0], segs[1][1] - start[1]) * 0.25];
      segs[0] = startTrim;
      parts.push(`<polyline points="${segs.map((p) => p.join(',')).join(' ')}" fill="none" stroke-width="${width}" stroke-linejoin="round"/>`);
      const nx = -uy; const ny = ux;
      const tip = [bx - ux * 0.08, by - uy * 0.08];
      parts.push(`<polygon points="${tip.join(',')} ${tipBase[0] + nx * 0.2},${tipBase[1] + ny * 0.2} ${tipBase[0] - nx * 0.2},${tipBase[1] - ny * 0.2}"/>`);
    }
    this.arrowsEl.innerHTML = parts.join('');
  }

  // Draw arrows from code (the "what would he play" overlay).
  showArrows(list) {
    this.arrows = new Map(list.map(([from, to]) => [from + to, [from, to]]));
    this.#paint();
  }
}
