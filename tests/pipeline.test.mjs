// Data pipeline: PGN parsing helpers and an end-to-end dataset build on a
// two-game sample (no network, no real data needed).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { gameKey, playedAt, readPgnGames, tagValue, uciFromMove } from '../pipeline/pgn-utils.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SAMPLE = resolve(ROOT, 'tests/fixtures/sample.pgn');

test('splits a PGN file into games and reads tags', async () => {
  const games = [];
  for await (const pgn of readPgnGames(SAMPLE)) games.push(pgn);
  assert.equal(games.length, 2);
  assert.equal(tagValue(games[0], 'White'), 'PeterThiel');
  assert.equal(gameKey(games[0]), 'https://www.chess.com/game/live/1001');
  assert.equal(playedAt(games[1]).toISOString(), '2024-01-01T09:00:00.000Z');
  assert.equal(uciFromMove({ from: 'e7', to: 'e8', promotion: 'q' }), 'e7e8q');
});

test('builds games, positions and a manifest from the sample', () => {
  const out = mkdtempSync(join(tmpdir(), 'thiel-chess-'));
  try {
    execFileSync(process.execPath, [
      resolve(ROOT, 'pipeline/build-dataset.mjs'),
      '--input', SAMPLE, '--output-dir', out, '--manifest', join(out, 'dataset.json'),
    ], { stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(join(out, 'dataset.json'), 'utf8'));
    assert.equal(manifest.games.total, 2);
    assert.deepEqual(manifest.parse_errors, []);
    assert.deepEqual(manifest.results, { win: 2, draw: 0, loss: 0, unknown: 0 });
    // 4 of his moves as White in the mate game, 2 as Black in the other
    assert.equal(manifest.positions.total, 6);

    const lines = (name) => gunzipSync(readFileSync(join(out, name))).toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
    const positions = lines('peterthiel_positions.jsonl.gz');
    // games keep the input order (fetch-games.mjs is what sorts by date)
    assert.equal(positions[0].move_san, 'e4');
    assert.equal(positions[0].fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    assert.equal(positions.at(-1).move_san, 'd6');
    assert.equal(positions.at(-1).player_color, 'black');
    assert.ok(positions.every((p) => p.fen && p.move_uci && p.split));
    const games = lines('peterthiel_games.jsonl.gz');
    assert.deepEqual(games[0].moves_san, ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
    assert.deepEqual(games[0].player_move_plies, [1, 3, 5, 7]);
    assert.deepEqual(games[1].player_move_plies, [2, 4]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the web app ships its model and data files', () => {
  for (const file of ['model/thiel-maia2.onnx', 'model/book.json', 'model/timing.json', 'model/moves.json', 'tests/vectors.json']) {
    assert.ok(readFileSync(resolve(ROOT, 'web', file)).length > 0, file);
  }
  const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.outputDirectory, 'web');
  const headers = vercel.headers.flatMap((h) => h.headers.map((x) => x.key));
  assert.ok(headers.includes('Cross-Origin-Embedder-Policy') && headers.includes('Cross-Origin-Opener-Policy'));
});
