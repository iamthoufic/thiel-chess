// Builds model/book.json from PeterThiel's first MAX_PLY plies.
// `mine`: for each position where he was to move, his replies as
//   [uci, games, wins, draws, losses]; the bot samples from these real counts.
// `theirs`: the opponents' replies in positions where they were to move, as
//   [uci, games]; the opening explorer uses them to walk the tree.
// Moves seen fewer than MIN_COUNT times are dropped.
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { Chess } from 'chess.js';

const HERE = import.meta.dirname;
const INPUT = resolve(HERE, '../../data/processed/peterthiel_games.jsonl.gz');
const OUTPUT = resolve(HERE, '../model/book.json');
const MAX_PLY = 20;
const MIN_COUNT = 3;

export const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

const mine = new Map();
const theirs = new Map();
const OUTCOME = { win: 2, draw: 3, loss: 4 };
let games = 0;
const lines = createInterface({ input: createReadStream(INPUT).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const game = JSON.parse(line);
  const his = new Set(game.player_move_plies);
  const chess = new Chess();
  for (let ply = 1; ply <= Math.min(MAX_PLY, game.moves_uci.length); ply += 1) {
    const uci = game.moves_uci[ply - 1];
    const table = his.has(ply) ? mine : theirs;
    const key = positionKey(chess.fen());
    const moves = table.get(key) ?? new Map();
    const entry = moves.get(uci) ?? [uci, 0, 0, 0, 0];
    entry[1] += 1;
    entry[OUTCOME[game.result]] += 1;
    moves.set(uci, entry);
    table.set(key, moves);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  games += 1;
}

function compact(table, width) {
  const out = {};
  for (const [key, moves] of table) {
    const kept = [...moves.values()].filter((m) => m[1] >= MIN_COUNT).sort((a, b) => b[1] - a[1]);
    if (kept.length) out[key] = kept.map((m) => m.slice(0, width));
  }
  return out;
}

const book = { games, maxPly: MAX_PLY, minCount: MIN_COUNT, mine: compact(mine, 5), theirs: compact(theirs, 2) };
await writeFile(OUTPUT, JSON.stringify(book));
console.log(`book: ${Object.keys(book.mine).length} of his positions, ${Object.keys(book.theirs).length} opponent positions from ${games} games`);
