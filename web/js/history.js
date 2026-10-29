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

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data?.version === 1 && Array.isArray(data.games)) return data;
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
