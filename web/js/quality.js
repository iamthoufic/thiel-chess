// Game review: every move is judged by Stockfish (js/analyst.js), using the
// same idea as Chess.com's review. A position's evaluation is turned into the
// mover's expected points (0 to 1); a move's cost is how many expected points
// it gave up against the engine's best move. Chess.com's published bands:
//   Best: the engine's top move     Excellent: up to 0.02     Good: up to 0.05
//   Inaccuracy: up to 0.10          Mistake: up to 0.20       Blunder: more
// plus the special cases below (Brilliant, Great, Miss, Book, Forced).
import { Chess } from '../vendor/chess.js';
import { bookKey } from './engine.js';

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const QUALITY = {
  brilliant: { label: 'Brilliant', color: '#26c2a3', glyph: '!!' },
  great: { label: 'Great', color: '#749bbf', glyph: '!' },
  best: { label: 'Best', color: '#81b64c', glyph: 'star' },
  excellent: { label: 'Excellent', color: '#81b64c', glyph: 'thumb' },
  good: { label: 'Good', color: '#95b776', glyph: 'check' },
  book: { label: 'Book', color: '#a88764', glyph: 'book' },
  forced: { label: 'Forced', color: '#97a1ab', glyph: 'arrow' },
  inaccuracy: { label: 'Inaccuracy', color: '#f0c15c', glyph: '?!' },
  mistake: { label: 'Mistake', color: '#e6912c', glyph: '?' },
  miss: { label: 'Miss', color: '#ee6b55', glyph: 'x' },
  blunder: { label: 'Blunder', color: '#ca3431', glyph: '??' },
};
export const ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder'];

// Glyphs drawn on a 24px grid, centred on (12, 12) by eye.
const GLYPHS = {
  star: '<path d="M12 5.6l1.95 4 4.4.6-3.2 3.05.78 4.35L12 15.55 8.07 17.6l.78-4.35-3.2-3.05 4.4-.6z" fill="#fff"/>',
  thumb: '<path d="M7.6 11.2H6v6.4h1.6zm1.4 6.4h5.7c.75 0 1.35-.5 1.52-1.2l.95-4c.22-.92-.48-1.8-1.42-1.8h-2.8l.45-2.3c.13-.7-.28-1.38-.95-1.58l-.4-.12L9 11z" fill="#fff"/>',
  check: '<path d="M7.2 12.4l3.1 3.1 6.5-6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M12 8.4c-1.5-1-3.5-1.3-5.6-.8v8.6c2.1-.5 4.1-.2 5.6.8 1.5-1 3.5-1.3 5.6-.8V7.6c-2.1-.5-4.1-.2-5.6.8z" fill="#fff"/><path d="M12 8.4v8.6" stroke="#a88764" stroke-width="1.1"/>',
  arrow: '<path d="M6.5 12h9M12.5 8l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M8.3 8.3l7.4 7.4M15.7 8.3l-7.4 7.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  '!': '<path d="M10.9 6.5h2.2l-.35 7.2h-1.5zM12 15.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" fill="#fff"/>',
  '!!': '<path d="M8.6 6.5h2.2l-.35 7.2H8.95zM13.2 6.5h2.2l-.35 7.2h-1.5zM9.7 15.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm4.6 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" fill="#fff"/>',
  '?': '<path d="M12 6.2c2.1 0 3.6 1.25 3.6 3.05 0 1.4-.8 2.2-1.9 2.85-.8.47-1.05.8-1.05 1.5v.4h-1.9v-.55c0-1.2.5-1.9 1.55-2.55.8-.5 1.15-.85 1.15-1.55 0-.75-.62-1.25-1.5-1.25-.95 0-1.6.55-1.7 1.45H8.3C8.4 7.6 9.8 6.2 12 6.2zm-.3 9.05a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" fill="#fff"/>',
  '?!': '<path d="M9.8 6.2c1.9 0 3.2 1.15 3.2 2.8 0 1.25-.7 2-1.7 2.6-.7.42-.92.72-.92 1.35v.45H8.65v-.55c0-1.1.44-1.72 1.38-2.3.7-.44 1.02-.76 1.02-1.4 0-.66-.55-1.1-1.3-1.1-.85 0-1.42.48-1.5 1.28H6.4c.1-1.88 1.4-3.13 3.4-3.13zm-.3 8.95a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM14.7 6.5h2.1l-.33 7.2h-1.44zm1.05 8.65a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z" fill="#fff"/>',
  '??': '<path d="M8.9 6.2c1.85 0 3.1 1.1 3.1 2.72 0 1.2-.68 1.93-1.65 2.5-.68.4-.9.7-.9 1.32v.45H7.78v-.55c0-1.06.43-1.66 1.33-2.22.68-.43.98-.74.98-1.36 0-.64-.53-1.06-1.26-1.06-.82 0-1.38.46-1.45 1.24H5.6c.1-1.82 1.35-3.04 3.3-3.04zm-.3 8.95a1.12 1.12 0 1 1 0 2.24 1.12 1.12 0 0 1 0-2.24zM15.1 6.2c1.85 0 3.1 1.1 3.1 2.72 0 1.2-.68 1.93-1.65 2.5-.68.4-.9.7-.9 1.32v.45h-1.67v-.55c0-1.06.43-1.66 1.33-2.22.68-.43.98-.74.98-1.36 0-.64-.53-1.06-1.26-1.06-.82 0-1.38.46-1.45 1.24H11.8c.1-1.82 1.35-3.04 3.3-3.04zm-.3 8.95a1.12 1.12 0 1 1 0 2.24 1.12 1.12 0 0 1 0-2.24z" fill="#fff"/>',
};

export function badgeSvg(kind) {
  const q = QUALITY[kind];
  return `<svg viewBox="0 0 24 24" role="img" aria-label="${q.label}"><circle cx="12" cy="12" r="11.5" fill="${q.color}"/>${GLYPHS[q.glyph]}</svg>`;
}

const REACTION = {
  brilliant: 'brilliant', great: 'great', best: 'great', excellent: 'good', good: 'good', book: 'book',
  forced: 'neutral', inaccuracy: 'inaccuracy', mistake: 'mistake', miss: 'mistake', blunder: 'blunder',
};
export const reactionImage = (kind) => `img/peter/react-${REACTION[kind]}.webp`;

// Expected points for the side to move. Lichess's fit of centipawns to results.
export function winChance(line) {
  if (!line) return null;
  if (line.mate !== undefined) return line.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-0.00368208 * line.cp));
}

// Expected points of a position for the side to move, also for finished games.
function positionValue(fen, analysis) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 0;
  if (chess.isDraw() || chess.isStalemate()) return 0.5;
  return winChance(analysis?.lines?.[0]);
}

// Lichess's per-move accuracy curve: 100 for no loss, falling off quickly.
const moveAccuracy = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669));

export function gameAccuracy(reviews) {
  const acc = reviews.filter(Boolean).map((r) => r.accuracy);
  if (!acc.length) return null;
  const mean = acc.reduce((s, a) => s + a, 0) / acc.length;
  const harmonic = acc.length / acc.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return (mean + harmonic) / 2;
}

// A piece worth 3 or more left where the opponent can take it for less.
function isSacrifice(fenAfter, move) {
  const chess = new Chess(fenAfter);
  const value = VALUES[move.piece];
  const gained = move.captured ? VALUES[move.captured] : 0;
  if (value < 3 || value <= gained) return false;
  const them = chess.turn();
  const attackers = chess.attackers(move.to, them);
  if (!attackers.length) return false;
  const defended = chess.attackers(move.to, move.color).length > 0;
  const cheapest = Math.min(...attackers.map((sq) => VALUES[chess.get(sq).type] || 100));
  return !defended || cheapest < value;
}

function isBook(book, fenBefore, uci, ply) {
  if (!book || ply > book.maxPly) return false;
  const key = bookKey(fenBefore);
  return (book.theirs[key] ?? []).concat(book.mine[key] ?? []).some(([u]) => u === uci);
}

const uciToSan = (fen, uci) => {
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { return uci; }
};

// Rate the move that leads from fens[i - 1] to fens[i]. analyses[k] is
// Stockfish's verdict on fens[k] (or undefined while it is still working).
// prev: the review of the previous move (the opponent's), for Miss.
export function reviewMove({ i, fens, analyses, move, book, prev }) {
  const before = analyses[i - 1];
  const after = analyses[i];
  const fenBefore = fens[i - 1];
  if (!before || after === undefined) return null;
  const legal = new Chess(fenBefore).moves().length;
  const uci = move.from + move.to + (move.promotion ?? '');
  const bestLine = before.lines[0];
  const bestWin = winChance(bestLine);
  const afterValue = positionValue(fens[i], after);
  if (bestWin === null || afterValue === null) return null;
  const isBest = bestLine.move === uci;
  const playedWin = isBest ? Math.max(bestWin, 1 - afterValue) : 1 - afterValue;
  const loss = Math.max(0, bestWin - playedWin);
  const second = before.lines[1] ? winChance(before.lines[1]) : null;

  let kind;
  if (legal === 1) kind = 'forced';
  else if (loss <= 0.05 && isBook(book, fenBefore, uci, i)) kind = 'book';
  else if (loss <= 0.02 && playedWin >= 0.45 && bestWin < 0.97 && isSacrifice(fens[i], move)) kind = 'brilliant';
  else if (isBest && second !== null && bestWin - second >= 0.15 && bestWin > 0.2 && bestWin < 0.97
    && !(move.captured && prev?.to === move.to)) kind = 'great';
  else if (isBest) kind = 'best';
  else if (loss <= 0.02) kind = 'excellent';
  else if (loss <= 0.05) kind = 'good';
  else if (loss <= 0.10) kind = 'inaccuracy';
  else if (loss <= 0.20) kind = 'mistake';
  else kind = 'blunder';

  // Miss: the opponent had just erred, and this move gave the chance back
  // without making things worse than before their error.
  if ((kind === 'mistake' || kind === 'blunder') && prev && prev.loss >= 0.10 && playedWin >= 1 - prev.bestWin - 0.02) kind = 'miss';

  return {
    kind, loss, bestWin, playedWin, to: move.to,
    accuracy: kind === 'forced' || kind === 'book' ? 100 : moveAccuracy(loss),
    best: bestLine.move, bestSan: uciToSan(fenBefore, bestLine.move),
    evalAfter: after.lines[0] ?? null, // from the opponent's side
  };
}

export const isBad = (kind) => BAD.includes(kind);

// One line for the review panel, about the move on screen.
export function explain(r, san) {
  const best = r.bestSan;
  return {
    brilliant: `${san} is brilliant. A sacrifice that works.`,
    great: `${san} is a great move. Nothing else holds as well.`,
    best: `${san} is the best move.`,
    excellent: `${san} is excellent. ${best} was a touch better.`,
    good: `${san} is good. ${best} was the engine's choice.`,
    book: `${san} is a book move.`,
    forced: `${san} was the only legal move.`,
    inaccuracy: `${san} is an inaccuracy. ${best} was best.`,
    mistake: `${san} is a mistake. ${best} was best.`,
    miss: `${san} misses the chance. ${best} would have punished the last move.`,
    blunder: `${san} is a blunder. ${best} was best.`,
  }[r.kind];
}

// Evaluation in pawns from White's side, for display: "+1.4", "-0.3", "M3".
export function formatEval(line, whiteToMove) {
  if (!line) return '';
  const sign = whiteToMove ? 1 : -1;
  if (line.mate !== undefined) return `${line.mate * sign > 0 ? '' : '-'}M${Math.abs(line.mate)}`;
  const v = (line.cp * sign) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
