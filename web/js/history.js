// Your games against Peter, kept in this browser only.
//
// Two things are stored: the last KEEP finished games in full (moves, result,
// clocks and Stockfish's review, so reopening one needs no new analysis), and
// an all-time record that is only ever incremented, so your score against
// Peter survives old games dropping off the list. A game with its review is
// about 5-15 KB, so the whole store stays well under a megabyte.
const KEY = 'thiel-chess:history';
export const KEEP = 20;

const EMPTY = () => ({ version: 1, games: [], record: { win: 0, draw: 0, loss: 0, best: null } });

// localStorage is shared with every page on this origin (for example anything
// else served from localhost:8080) and can be edited by hand, so the store is
// treated as untrusted: games that do not have exactly the expected shape are
// dropped before any of their fields reach the page.
const KINDS = new Set(['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder']);
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SQUARE = /^[a-h][1-8]$/;
const SAN = /^[A-Za-z0-9+#=-]{1,10}$/;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isNumOrNull = (n) => n === null || n === undefined || isNum(n);
const isShortText = (t, max) => typeof t === 'string' && t.length <= max;

function validReview(r) {
  if (r === null || r === undefined) return true;
  return typeof r === 'object' && KINDS.has(r.kind)
    && ['loss', 'bestWin', 'playedWin', 'accuracy'].every((k) => isNumOrNull(r[k]))
    && (r.to === undefined || r.to === null || SQUARE.test(r.to))
    && (r.best === undefined || r.best === null || UCI.test(r.best))
    && (r.bestSan === undefined || r.bestSan === null || SAN.test(r.bestSan))
    && (r.evalAfter === undefined || r.evalAfter === null || typeof r.evalAfter === 'object');
}

function validGame(g) {
  return g && typeof g === 'object'
    && isNum(g.id)
    && typeof g.date === 'string' && !Number.isNaN(Date.parse(g.date))
    && (g.you === 'w' || g.you === 'b')
    && ['win', 'draw', 'loss'].includes(g.outcome)
    && (g.tc === null || (typeof g.tc === 'string' && /^\d{1,5}\+\d{1,3}$/.test(g.tc)))
    && (g.winner === null || g.winner === undefined || g.winner === 'w' || g.winner === 'b')
    && isShortText(g.reason ?? '', 40) && isShortText(g.label ?? '', 120)
    && Array.isArray(g.moves) && g.moves.length <= 2000 && g.moves.every((m) => typeof m === 'string' && UCI.test(m))
    && g.clock && typeof g.clock === 'object' && isNum(g.clock.w) && isNum(g.clock.b)
    && isNumOrNull(g.accYou) && isNumOrNull(g.accPeter)
    && (g.reviews === null || g.reviews === undefined
      || (Array.isArray(g.reviews) && g.reviews.length <= g.moves.length && g.reviews.every(validReview)));
}

function validRecord(r) {
  const count = (n) => Number.isInteger(n) && n >= 0;
  return r && typeof r === 'object' && count(r.win) && count(r.draw) && count(r.loss) && isNumOrNull(r.best);
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data?.version === 1 && Array.isArray(data.games)) {
      return {
        version: 1,
        games: data.games.filter(validGame).slice(0, KEEP),
        record: validRecord(data.record) ? data.record : EMPTY().record,
      };
    }
  } catch { /* unreadable: start again */ }
  return EMPTY();
}

let data = load();

function persist() {
  // if the browser is full, drop the oldest games until it fits
  while (true) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch {
      if (!data.games.length) return false;
      data.games.pop();
    }
  }
}

export const games = () => data.games;
export const record = () => data.record;
export const find = (id) => data.games.find((g) => g.id === id) ?? null;

// A finished game, newest first. `entry.outcome` is 'win' | 'draw' | 'loss'.
export function add(entry) {
  data.games.unshift(entry);
  data.games.length = Math.min(data.games.length, KEEP);
  data.record[entry.outcome] += 1;
  persist();
}

// Your best accuracy only counts games long enough to mean something.
export const MIN_MOVES_FOR_BEST = 10;

// Stockfish finished reviewing a saved game: keep its ratings and accuracies.
export function attachReview(id, reviews, accYou, accPeter, yourMoves) {
  const entry = find(id);
  if (!entry) return;
  entry.reviews = reviews;
  entry.accYou = accYou;
  entry.accPeter = accPeter;
  const counts = accYou !== null && yourMoves >= MIN_MOVES_FOR_BEST;
  if (counts && (data.record.best === null || accYou > data.record.best)) data.record.best = accYou;
  persist();
}

export function clear() {
  data = EMPTY();
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

// A review object without the decimals nobody needs, to keep the store small.
export function compactReview(r) {
  if (!r) return null;
  const round = (n) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : n);
  return {
    kind: r.kind, loss: round(r.loss), bestWin: round(r.bestWin), playedWin: round(r.playedWin), to: r.to,
    accuracy: round(r.accuracy), best: r.best, bestSan: r.bestSan, evalAfter: r.evalAfter,
  };
}
