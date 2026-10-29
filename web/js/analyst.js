// Stockfish for the game review: Stockfish 17.1 "lite", single-threaded WASM
// (vendor/stockfish, GPL-3.0, from the stockfish npm package by Nathan Rugg).
// Positions are queued as the game is played and analysed one at a time in the
// background, so the review is ready, or nearly, by the time the game ends.
import { inline, inlineBytes, inlineScriptUrl } from './assets.js';

export const DEPTH = 14;
const MOVETIME = 2500; // ms; a cap for the rare position that is slow to reach DEPTH

export class Analyst {
  constructor() {
    this.cache = new Map(); // fen -> { lines: [{ move, cp } | { move, mate }], depth }
    this.queue = [];
    this.job = null;
    this.waiter = null;
    this.booted = null;
    this.onProgress = null;
    this.after = null; // a promise to wait for before downloading Stockfish
  }

  // Analyse a position; resolves with the two best lines, scores from the side to move.
  analyse(fen) {
    const done = this.cache.get(fen);
    if (done) return Promise.resolve(done);
    const queued = this.queue.find((j) => j.fen === fen) ?? (this.job?.fen === fen ? this.job : null);
    if (queued) return queued.promise;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    this.queue.push({ fen, resolve, promise, lines: [], depth: 0 });
    this.#next();
    return promise;
  }

  // Drop everything not yet started (a new game); finished results stay cached.
  clear() {
    for (const j of this.queue) j.resolve(null);
    this.queue = [];
  }

  get pending() { return this.queue.length + (this.job ? 1 : 0); }

  #boot() {
    this.booted ??= (async () => {
      await this.after; // set by the app: start only once Peter's network has loaded
      if (inline) {
        // single file: the worker cannot fetch on file://, so it gets the bytes
        // (tools/build-single.mjs adds the small handler that receives them)
        const wasm = await inlineBytes('sf-wasm');
        this.worker = new Worker(inlineScriptUrl('stockfish'));
        this.worker.postMessage({ sfWasm: wasm }, [wasm.buffer]);
      } else {
        // the engine reads its .wasm location from the hash of its own URL
        const base = new URL('../vendor/stockfish/', import.meta.url);
        this.worker = new Worker(`${new URL('stockfish.js', base)}#${encodeURIComponent(new URL('stockfish.wasm', base).href)}`);
      }
      this.worker.onmessage = (e) => this.#line(String(e.data));
      await this.#until('uci', 'uciok');
      this.worker.postMessage('setoption name MultiPV value 2');
      this.worker.postMessage('setoption name Hash value 32');
      await this.#until('isready', 'readyok');
    })();
    return this.booted;
  }

  #until(command, token) {
    return new Promise((resolve) => {
      this.waiter = { token, resolve };
      this.worker.postMessage(command);
    });
  }

  async #next() {
    if (this.job || !this.queue.length) return;
    this.job = this.queue.shift();
    try {
      await this.#boot();
    } catch (error) {
      console.error('Stockfish failed to start', error);
      this.job.resolve(null);
      this.job = null;
      return;
    }
    this.worker.postMessage(`position fen ${this.job.fen}`);
    this.worker.postMessage(`go depth ${DEPTH} movetime ${MOVETIME}`);
  }

  #line(line) {
    if (this.waiter && line.startsWith(this.waiter.token)) {
      const { resolve } = this.waiter;
      this.waiter = null;
      resolve();
      return;
    }
    const job = this.job;
    if (!job) return;
    if (line.startsWith('info ') && line.includes(' pv ') && !/ (upper|lower)bound/.test(line)) {
      const depth = Number(line.match(/ depth (\d+)/)?.[1] ?? 0);
      const k = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1) - 1;
      const score = line.match(/ score (cp|mate) (-?\d+)/);
      if (!score) return;
      job.lines[k] = { move: line.split(' pv ')[1].split(' ')[0], [score[1]]: Number(score[2]), depth };
      if (k === 0) job.depth = depth;
    } else if (line.startsWith('bestmove')) {
      // keep only second lines searched as deep as the first
      const lines = job.lines.filter((l, i) => l && (i === 0 || l.depth >= job.depth - 1));
      const result = { lines, depth: job.depth };
      this.cache.set(job.fen, result);
      job.resolve(result);
      this.job = null;
      this.onProgress?.();
      this.#next();
    }
  }
}
