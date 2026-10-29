import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

export function normalizePgn(pgn) {
  return pgn.replace(/\r\n?/g, '\n').trim();
}

export function tagValue(pgn, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return pgn.match(new RegExp(`^\\[${escaped} "([^"]*)"\\]$`, 'm'))?.[1] ?? '';
}

export function gameKey(pgn) {
  const link = tagValue(pgn, 'Link');
  if (link) return link;
  const fallback = [tagValue(pgn, 'UTCDate'), tagValue(pgn, 'UTCTime'), tagValue(pgn, 'White'), tagValue(pgn, 'Black')];
  return fallback.some(Boolean) ? fallback.join('|') : '';
}

export function playedAt(pgn) {
  const date = tagValue(pgn, 'UTCDate') || tagValue(pgn, 'Date');
  const time = tagValue(pgn, 'UTCTime') || '00:00:00';
  const iso = `${date.replaceAll('.', '-')}T${time}Z`;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date(0);
}

export function archiveMonth(pgn) {
  const date = tagValue(pgn, 'UTCDate') || tagValue(pgn, 'Date');
  return /^\d{4}\.\d{2}/.test(date) ? date.slice(0, 7).replace('.', '-') : '';
}

function inputStream(path) {
  // gzip must be read as raw bytes and decoded after decompression
  if (path.endsWith('.gz')) return createReadStream(path).pipe(createGunzip()).setEncoding('utf8');
  return createReadStream(path, { encoding: 'utf8' });
}

export async function* readPgnGames(path) {
  const lines = createInterface({
    input: inputStream(path),
    crlfDelay: Infinity,
  });
  let game = [];

  for await (const line of lines) {
    if (line.startsWith('[Event ') && game.length > 0) {
      const pgn = normalizePgn(game.join('\n'));
      if (pgn) yield pgn;
      game = [];
    }
    game.push(line);
  }

  const pgn = normalizePgn(game.join('\n'));
  if (pgn) yield pgn;
}

export function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}
