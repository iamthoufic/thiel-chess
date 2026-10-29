// Download (or refresh) every public game of a Chess.com account from the
// official Published-Data API, de-duplicate by game URL and write one
// chronological PGN plus a gzip copy and a manifest with SHA-256 checksums.
// Later runs only fetch the months from the newest stored month onward.
//   node pipeline/fetch-games.mjs [--username PeterThiel] [--full-verify]
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { archiveMonth, gameKey, normalizePgn, playedAt, readPgnGames, tagValue } from './pgn-utils.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_RAW = resolve(ROOT, 'data/raw/peterthiel_chesscom_all_games.pgn');
const DEFAULT_GZIP = `${DEFAULT_RAW}.gz`;
const DEFAULT_MANIFEST = resolve(ROOT, 'data/manifests/source.json');

function parseArgs(argv) {
  const options = {
    username: 'PeterThiel',
    input: existsSync(DEFAULT_RAW) ? DEFAULT_RAW : existsSync(DEFAULT_GZIP) ? DEFAULT_GZIP : null,
    output: DEFAULT_RAW,
    gzip: DEFAULT_GZIP,
    manifest: DEFAULT_MANIFEST,
    fullVerify: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--full-verify') options.fullVerify = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!(key in options)) throw new Error(`Unknown option: ${arg}`);
      options[key] = argv[++i];
    }
  }
  for (const key of ['input', 'output', 'gzip', 'manifest']) if (options[key]) options[key] = resolve(options[key]);
  return options;
}

async function fetchJson(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.CHESSCOM_USER_AGENT || 'ThielChessDataset/1.0 (research dataset)',
        },
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500));
    }
  }
  throw new Error(`Could not fetch ${url}: ${lastError?.message ?? 'unknown error'}`);
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function writeCanonical(path, games) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  const output = createWriteStream(temporary, { encoding: 'utf8' });
  try {
    for (const game of games) {
      if (!output.write(`${game.pgn}\n\n\n`)) {
        await new Promise((resolveDrain) => output.once('drain', resolveDrain));
      }
    }
    output.end();
    await new Promise((resolveFinish, rejectFinish) => {
      output.once('finish', resolveFinish);
      output.once('error', rejectFinish);
    });
    if (existsSync(path)) await rm(path);
    await rename(temporary, path);
  } catch (error) {
    output.destroy();
    await rm(temporary, { force: true });
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let previousManifest = null;
  if (existsSync(options.manifest)) {
    try {
      previousManifest = JSON.parse(await readFile(options.manifest, 'utf8'));
    } catch {
      // A malformed old manifest should not prevent rebuilding it from the PGN.
    }
  }

  const gamesByKey = new Map();
  let latestMonth = '';
  // a first run starts from nothing and fetches every month
  for await (const rawPgn of options.input ? readPgnGames(options.input) : []) {
    const pgn = normalizePgn(rawPgn);
    const key = gameKey(pgn);
    if (!key) throw new Error('A source game has neither a Link nor a stable fallback key.');
    if (!gamesByKey.has(key)) gamesByKey.set(key, { key, pgn, playedAt: playedAt(pgn) });
    const month = archiveMonth(pgn);
    if (month > latestMonth) latestMonth = month;
  }

  const beforeCount = gamesByKey.size;
  const archiveIndexUrl = `https://api.chess.com/pub/player/${encodeURIComponent(options.username.toLowerCase())}/games/archives`;
  const archiveIndex = await fetchJson(archiveIndexUrl);
  const archives = archiveIndex.archives ?? [];
  const selected = archives.filter((url) => {
    if (options.fullVerify || !latestMonth) return true;
    const match = url.match(/\/(\d{4})\/(\d{2})$/);
    return match && `${match[1]}-${match[2]}` >= latestMonth;
  });

  const fetched = [];
  for (const url of selected) {
    const payload = await fetchJson(url);
    const apiGames = payload.games ?? [];
    let added = 0;
    for (const apiGame of apiGames) {
      if (!apiGame.pgn) continue;
      const pgn = normalizePgn(apiGame.pgn);
      const white = tagValue(pgn, 'White').toLowerCase();
      const black = tagValue(pgn, 'Black').toLowerCase();
      if (white !== options.username.toLowerCase() && black !== options.username.toLowerCase()) continue;
      const key = apiGame.url || gameKey(pgn);
      if (!gamesByKey.has(key)) {
        gamesByKey.set(key, { key, pgn, playedAt: playedAt(pgn) });
        added += 1;
      }
    }
    fetched.push({ archive: url, returned: apiGames.length, added });
    process.stdout.write(`Fetched ${url}: ${apiGames.length} games, ${added} new\n`);
  }

  const games = [...gamesByKey.values()].sort((a, b) => {
    const timeDifference = a.playedAt - b.playedAt;
    return timeDifference || a.key.localeCompare(b.key);
  });
  await writeCanonical(options.output, games);

  await mkdir(dirname(options.gzip), { recursive: true });
  const gzipTemporary = `${options.gzip}.tmp-${process.pid}`;
  await pipeline(createReadStream(options.output), createGzip({ level: 9 }), createWriteStream(gzipTemporary));
  if (existsSync(options.gzip)) await rm(options.gzip);
  await rename(gzipTemporary, options.gzip);

  const [rawStat, gzipStat] = await Promise.all([stat(options.output), stat(options.gzip)]);
  const baselineGameCount = previousManifest?.baseline_game_count ?? beforeCount;
  const manifest = {
    schema_version: 1,
    username: options.username,
    source: 'Chess.com PubAPI',
    archive_index: archiveIndexUrl,
    generated_at: new Date().toISOString(),
    baseline_game_count: baselineGameCount,
    game_count: games.length,
    new_games_added: games.length - beforeCount,
    games_added_since_baseline: games.length - baselineGameCount,
    earliest_game_utc: games[0]?.playedAt.toISOString() ?? null,
    latest_game_utc: games.at(-1)?.playedAt.toISOString() ?? null,
    raw_file: basename(options.output),
    raw_bytes: rawStat.size,
    raw_sha256: await sha256(options.output),
    gzip_file: basename(options.gzip),
    gzip_bytes: gzipStat.size,
    gzip_sha256: await sha256(options.gzip),
    fetched_archives: fetched,
  };
  await mkdir(dirname(options.manifest), { recursive: true });
  await writeFile(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stdout.write(`Updated ${beforeCount} -> ${games.length} games (${games.length - beforeCount} added).\n`);
  process.stdout.write(`Raw PGN: ${options.output}\nCompressed PGN: ${options.gzip}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
