// Decides Peter's moves: his real opening frequencies while the position is in
// his book, then the fine-tuned network. Also decides how long he "thinks".
import { inline, inlineBytes, inlineScriptUrl, loadJson } from './assets.js';

export const bookKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

const PETER_ELO = 2200;
const MIN_SAMPLE_P = 0.03; // ignore the long tail of near-zero moves when sampling

function sample(items, weight) {
  const total = items.reduce((s, it) => s + weight(it), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}


export class Engine {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.state = 'loading';
    this.pending = new Map();
    this.nextId = 1;
    this.book = null;
    this.bookReady = loadJson('model/book.json').then((b) => { this.book = b; return b; });
    this.timing = null; // his real per-move thinking times (tools/build-timing.py)
    loadJson('model/timing.json').then((t) => { this.timing = t; }, () => {});
    this.ready = new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    this.ready.catch(() => {});
    this.#start(false);
  }

  #resolve;
  #reject;
  #watchdog = 0;

  // Multi-threaded loading can stall forever while creating the session when the
  // device is short of memory. If the network is not ready shortly after the
  // download finishes, start again on a single thread, which always loads.
  #start(single) {
    const name = `${inline ? 'inline' : 'fetch'}${single ? '-single' : ''}`;
    this.worker = inline
      // a classic worker: browsers refuse module workers from blob: URLs on file:// pages
      ? new Worker(inlineScriptUrl('worker'), { name })
      : new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module', name });
    if (inline) this.#sendInlineAssets();
    const fallBack = (message) => {
      if (single) { this.state = 'error'; this.onStatus?.('error', message); this.#reject(new Error(message)); return; }
      clearTimeout(this.#watchdog);
      this.worker.terminate();
      this.#start(true);
    };
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        this.onStatus?.('loading', data.value);
        if (data.value >= 1 && !single) this.#watchdog = setTimeout(() => fallBack('timed out'), 10_000);
      } else if (data.type === 'ready') {
        clearTimeout(this.#watchdog);
        this.state = 'ready';
        this.onStatus?.('ready', data.threads);
        this.#resolve();
      } else if (data.type === 'error') fallBack(data.message);
      else if (data.type === 'result') {
        const job = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) job?.reject(new Error(data.error));
        else job?.resolve(data);
      }
    };
    this.worker.onerror = (e) => fallBack(e.message || 'worker failed');
  }

  // Single-file mode: decode the embedded model and runtime and hand them over.
  async #sendInlineAssets() {
    const [moves, model, wasm] = await Promise.all([loadJson('model/moves.json'), inlineBytes('thiel-model'), inlineBytes('thiel-wasm')]);
    this.worker.postMessage({ type: 'assets', moves, model, wasm }, [model.buffer, wasm.buffer]);
  }

  analyze(fen, opponentElo = PETER_ELO) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, fen, eloSelf: PETER_ELO, eloOppo: opponentElo });
    });
  }

  bookMoves(fen) {
    return this.book?.mine[bookKey(fen)] ?? null;
  }

  // Peter's candidate moves in the current position of a chess.js game:
  // his real opening frequencies while in book, otherwise the network.
  async candidates(chess, useBook = true) {
    await this.bookReady;
    const fen = chess.fen();
    const legal = new Map(chess.moves({ verbose: true }).map((m) => [m.from + m.to + (m.promotion ?? ''), m]));
    const book = useBook && chess.history().length < this.book.maxPly
      ? this.bookMoves(fen)?.filter(([uci]) => legal.has(uci)) : null;
    if (book?.length) {
      const total = book.reduce((s, m) => s + m[1], 0);
      const moves = book.map(([uci, n, w, d, l]) => ({ uci, san: legal.get(uci).san, p: n / total, games: n, w, d, l }));
      return { source: 'book', moves, value: null };
    }
    await this.ready;
    const result = await this.analyze(fen);
    return { source: 'model', moves: result.moves, value: result.value };
  }

  async choose(chess, { style = 'human', useBook = true, clock = null, pace = 'human' } = {}) {
    const ply = chess.history().length;
    const { source, moves, value } = await this.candidates(chess, useBook);
    let pick;
    if (source === 'book') pick = style === 'top' ? moves[0] : sample(moves, (c) => c.p);
    else {
      const pool = moves.filter((c) => c.p >= MIN_SAMPLE_P);
      pick = style === 'top' || !pool.length ? moves[0] : sample(pool, (c) => c.p);
    }
    return { uci: pick.uci, san: pick.san, source, candidates: moves, value, thinkMs: this.thinkTime({ source, clock, top: moves[0].p, ply, pace }) };
  }

  // How long Peter takes. "human" samples from how long he really spent on
  // this move number in his 3-minute games: as a share of his remaining clock
  // when there is one (so longer controls get longer thinks), in seconds when
  // there is not. Confident moves come a little faster, torn ones slower.
  thinkTime({ source, clock, top, ply, pace = 'human' }) {
    if (pace === 'instant') return 250 + Math.random() * 350;
    const moveNo = Math.floor(ply / 2) + 1;
    const stage = this.timing?.stages.find((s) => moveNo >= s.from && moveNo <= s.to);
    let ms;
    if (stage) {
      const u = Math.random() * 0.95; // skip the slowest 5%: in his games those are mostly disconnects
      const at = (values) => {
        const q = this.timing.quantiles;
        let i = 1;
        while (i < q.length - 1 && q[i] < u) i += 1;
        const t = (u - q[i - 1]) / (q[i] - q[i - 1]);
        return values[i - 1] + t * (values[i] - values[i - 1]);
      };
      ms = clock ? at(stage.share) * clock.remaining + clock.increment * 0.5 : at(stage.seconds) * 1000;
    } else {
      ms = clock ? clock.remaining / 40 : 2000;
    }
    if (source === 'model') ms *= 0.75 + 0.5 * (1 - top);
    if (pace === 'relaxed') ms *= 2;
    const floor = source === 'book' ? 450 : 800;
    const ceiling = clock ? Math.min(clock.remaining * 0.25, 25_000) : 25_000;
    if (clock && clock.remaining < 8000) return Math.min(Math.max(250, ms), clock.remaining * 0.2);
    return Math.max(floor * (pace === 'relaxed' ? 1.6 : 1), Math.min(ms, ceiling));
  }
}
