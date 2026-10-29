// Turn the raw PGN archive into training data: replay and validate every game
// with chess.js, split chronologically by game (90/5/5), and write
//   data/processed/peterthiel_games.jsonl.gz      one record per game
//   data/processed/peterthiel_positions.jsonl.gz  one record per move he made
//   data/processed/peterthiel_games.clean.pgn.gz  comment-free PGN
//   data/manifests/dataset.json                   counts, splits, checksums
//   node pipeline/build-dataset.mjs [--input data/raw/...pgn.gz]
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { createGzip } from 'node:zlib';
import { Chess } from 'chess.js';
import { gameKey, playedAt, readPgnGames, tagValue, uciFromMove } from './pgn-utils.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_INPUT = existsSync(resolve(ROOT, 'data/raw/peterthiel_chesscom_all_games.pgn'))
  ? resolve(ROOT, 'data/raw/peterthiel_chesscom_all_games.pgn')
  : resolve(ROOT, 'data/raw/peterthiel_chesscom_all_games.pgn.gz');
const DEFAULT_OUTPUT_DIR = resolve(ROOT, 'data/processed');
const DEFAULT_MANIFEST = resolve(ROOT, 'data/manifests/dataset.json');

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, outputDir: DEFAULT_OUTPUT_DIR, manifest: DEFAULT_MANIFEST, username: 'PeterThiel', suffix: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option: ${arg}`);
    options[key] = argv[++i];
  }
  options.input = resolve(options.input);
  options.outputDir = resolve(options.outputDir);
  options.manifest = resolve(options.manifest);
  return options;
}

function splitFor(index, total) {
  const trainEnd = Math.floor(total * 0.9);
  const validationEnd = Math.floor(total * 0.95);
  if (index < trainEnd) return 'train';
  if (index < validationEnd) return 'validation';
  return 'test';
}

function playerResult(result, color) {
  if (result === '1/2-1/2') return 'draw';
  if ((result === '1-0' && color === 'white') || (result === '0-1' && color === 'black')) return 'win';
  if (result === '1-0' || result === '0-1') return 'loss';
  return 'unknown';
}

function gameId(pgn) {
  const link = tagValue(pgn, 'Link');
  const linkId = link.match(/\/(\d+)$/)?.[1];
  return linkId || createHash('sha256').update(gameKey(pgn)).digest('hex').slice(0, 20);
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function gzipWriter(finalPath) {
  const temporaryPath = `${finalPath}.tmp-${process.pid}`;
  const file = createWriteStream(temporaryPath);
  const gzip = createGzip({ level: 9 });
  gzip.pipe(file);
  return { finalPath, temporaryPath, gzip, file };
}

async function finalizeWriter(writer) {
  writer.gzip.end();
  await once(writer.file, 'finish');
  if (existsSync(writer.finalPath)) await rm(writer.finalPath);
  await rename(writer.temporaryPath, writer.finalPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.input)) throw new Error(`Input PGN not found: ${options.input}`);
  await mkdir(options.outputDir, { recursive: true });

  let totalGames = 0;
  for await (const pgn of readPgnGames(options.input)) {
    if (pgn) totalGames += 1;
  }
  if (totalGames === 0) throw new Error('The input contains no PGN games.');

  const paths = {
    games: resolve(options.outputDir, `peterthiel_games${options.suffix}.jsonl.gz`),
    positions: resolve(options.outputDir, `peterthiel_positions${options.suffix}.jsonl.gz`),
    cleanPgn: resolve(options.outputDir, `peterthiel_games${options.suffix}.clean.pgn.gz`),
    manifest: options.manifest,
  };
  const writers = {
    games: gzipWriter(paths.games),
    positions: gzipWriter(paths.positions),
    cleanPgn: gzipWriter(paths.cleanPgn),
  };

  const stats = {
    schema_version: 1,
    username: options.username,
    generated_at: new Date().toISOString(),
    split_method: 'chronological_by_game_90_5_5',
    games: { total: 0, train: 0, validation: 0, test: 0 },
    positions: { total: 0, train: 0, validation: 0, test: 0 },
    results: { win: 0, draw: 0, loss: 0, unknown: 0 },
    colors: { white: 0, black: 0 },
    parse_errors: [],
  };

  let index = 0;
  try {
    for await (const pgn of readPgnGames(options.input)) {
      const split = splitFor(index, totalGames);
      const chess = new Chess();
      try {
        chess.loadPgn(pgn, { strict: false });
      } catch (error) {
        stats.parse_errors.push({ key: gameKey(pgn), error: error.message });
        index += 1;
        continue;
      }

      const headers = chess.getHeaders();
      const username = options.username.toLowerCase();
      const isWhite = headers.White?.toLowerCase() === username;
      const isBlack = headers.Black?.toLowerCase() === username;
      if (!isWhite && !isBlack) {
        stats.parse_errors.push({ key: gameKey(pgn), error: `${options.username} is not a player` });
        index += 1;
        continue;
      }

      const color = isWhite ? 'white' : 'black';
      const opponent = isWhite ? headers.Black : headers.White;
      const playerElo = isWhite ? headers.WhiteElo : headers.BlackElo;
      const opponentElo = isWhite ? headers.BlackElo : headers.WhiteElo;
      const result = playerResult(headers.Result, color);
      const moves = chess.history({ verbose: true });
      const movesUci = moves.map(uciFromMove);
      const movesSan = moves.map((move) => move.san);
      const playerMovePlies = [];
      const id = gameId(pgn);
      const timestamp = playedAt(pgn).toISOString();

      for (let plyIndex = 0; plyIndex < moves.length; plyIndex += 1) {
        const moverIsWhite = plyIndex % 2 === 0;
        if ((color === 'white') !== moverIsWhite) continue;
        const move = moves[plyIndex];
        const record = {
          schema_version: 1,
          game_id: id,
          played_at_utc: timestamp,
          split,
          ply: plyIndex + 1,
          player_color: color,
          fen: move.before,
          move_uci: uciFromMove(move),
          move_san: move.san,
          time_control: headers.TimeControl ?? null,
          player_elo: playerElo ? Number(playerElo) : null,
          opponent_elo: opponentElo ? Number(opponentElo) : null,
          result,
        };
        await writeChunk(writers.positions.gzip, `${JSON.stringify(record)}\n`);
        playerMovePlies.push(plyIndex + 1);
        stats.positions.total += 1;
        stats.positions[split] += 1;
      }

      const gameRecord = {
        schema_version: 1,
        game_id: id,
        source_url: headers.Link ?? null,
        played_at_utc: timestamp,
        split,
        player_color: color,
        opponent,
        player_elo: playerElo ? Number(playerElo) : null,
        opponent_elo: opponentElo ? Number(opponentElo) : null,
        result,
        pgn_result: headers.Result ?? null,
        time_control: headers.TimeControl ?? null,
        eco: headers.ECO ?? null,
        moves_uci: movesUci,
        moves_san: movesSan,
        player_move_plies: playerMovePlies,
      };
      await writeChunk(writers.games.gzip, `${JSON.stringify(gameRecord)}\n`);

      const keepHeaders = new Set([
        'Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'UTCDate', 'UTCTime',
        'WhiteElo', 'BlackElo', 'TimeControl', 'Termination', 'ECO', 'Link',
      ]);
      chess.removeComments();
      for (const key of Object.keys(chess.getHeaders())) {
        if (!keepHeaders.has(key)) chess.removeHeader(key);
      }
      await writeChunk(writers.cleanPgn.gzip, `${chess.pgn({ newline: '\n', maxWidth: 0 }).trim()}\n\n`);

      stats.games.total += 1;
      stats.games[split] += 1;
      stats.results[result] += 1;
      stats.colors[color] += 1;
      index += 1;
      if (index % 5000 === 0) process.stdout.write(`Processed ${index}/${totalGames} games\n`);
    }

    await Promise.all(Object.values(writers).map(finalizeWriter));
  } catch (error) {
    for (const writer of Object.values(writers)) {
      writer.gzip.destroy();
      writer.file.destroy();
      await rm(writer.temporaryPath, { force: true });
    }
    throw error;
  }

  const artifactStats = {};
  for (const [name, path] of Object.entries(paths)) {
    if (name === 'manifest') continue;
    const fileStat = await stat(path);
    artifactStats[name] = { path: path.slice(ROOT.length + 1).replaceAll('\\', '/'), bytes: fileStat.size, sha256: await sha256(path) };
  }
  const sourceStat = await stat(options.input);
  stats.source = {
    path: options.input.slice(ROOT.length + 1).replaceAll('\\', '/'),
    bytes: sourceStat.size,
    sha256: await sha256(options.input),
  };
  stats.artifacts = artifactStats;
  await mkdir(dirname(paths.manifest), { recursive: true });
  await writeFile(paths.manifest, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  if (stats.parse_errors.length > 0) {
    throw new Error(`Training data built with ${stats.parse_errors.length} parse errors. See ${paths.manifest}`);
  }
  process.stdout.write(`Built ${stats.games.total} games and ${stats.positions.total} PeterThiel move examples.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
