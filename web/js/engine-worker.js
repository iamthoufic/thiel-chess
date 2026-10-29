// Runs the fine-tuned Maia-2 network off the main thread with ONNX Runtime Web.
import * as ort from '../vendor/ort/ort.wasm.min.mjs';
import { Chess } from '../vendor/chess.js';
import { encodeFen, legalIndices, eloCategory } from './encode.js';

// the page asks for a '-single' worker when multi-threaded loading stalled
ort.env.wasm.numThreads = self.crossOriginIsolated && !self.name.endsWith('-single')
  ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let session = null;
let moveIndex = null;

// In the single-file download the page posts the model and runtime as bytes
// (the worker is named 'inline'); otherwise everything is fetched.
let receiveAssets;
const inlineAssets = self.name.startsWith('inline') ? new Promise((resolve) => { receiveAssets = resolve; }) : null;

// Download with progress. Hosts that compress on the fly (Vercel serves the
// model with Brotli) send no Content-Length, or the compressed one, so the
// expected size comes from model/model.json instead; the bytes are collected
// in chunks and joined at the end, whatever the real size turns out to be.
async function fetchWithProgress(url, expected, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const header = response.headers.get('content-encoding') ? 0 : Number(response.headers.get('content-length')) || 0;
  const total = expected || header;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.min(0.99, received / total));
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  onProgress(1);
  return bytes;
}

async function load() {
  let moves;
  let bytes;
  if (inlineAssets) {
    const assets = await inlineAssets;
    ort.env.wasm.wasmBinary = assets.wasm;
    moves = assets.moves;
    bytes = assets.model;
    postMessage({ type: 'progress', value: 1 });
  } else {
    const runtime = new URL('../vendor/ort/', import.meta.url);
    ort.env.wasm.wasmPaths = runtime.href;
    // Download ONNX Runtime's WebAssembly alongside the model rather than after
    // it: left to itself the runtime only starts that download when the session
    // is created, so on a slow connection the page's "loaded but not ready"
    // watchdog could fire and start everything over. This only warms the HTTP
    // cache (vendor/ is cacheable) for the runtime's own request: handing it the
    // bytes as wasmBinary stalls the multi-threaded build.
    const wasm = fetch(new URL('ort-wasm-simd-threaded.wasm', runtime))
      .then((r) => r.arrayBuffer()).catch(() => null);
    const base = new URL('../model/', import.meta.url);
    const [list, info] = await Promise.all([
      fetch(new URL('moves.json', base)).then((r) => r.json()),
      fetch(new URL('model.json', base)).then((r) => r.json()).catch(() => ({})),
    ]);
    moves = list;
    // progress stops short of 100% until the runtime is in hand as well
    bytes = await fetchWithProgress(new URL('thiel-maia2.onnx', base), info.bytes,
      (p) => postMessage({ type: 'progress', value: Math.min(p, 0.99) }));
    await wasm;
    postMessage({ type: 'progress', value: 1 });
  }
  moveIndex = Object.fromEntries(moves.map((m, i) => [m, i]));
  // Low-memory options: no arena or memory pattern caching. Many laptops have
  // little free RAM, and these caches roughly double the model's footprint.
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all', enableCpuMemArena: false, enableMemPattern: false,
  });
  bytes = null;
  // one warm-up run so the first real move is not slow
  await analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 2200, 2200);
}

async function analyze(fen, eloSelf, eloOppo) {
  const chess = new Chess(fen);
  const legal = legalIndices(chess, moveIndex);
  if (!legal.length) return { moves: [], value: null };
  const feeds = {
    boards: new ort.Tensor('float32', encodeFen(fen), [1, 18, 8, 8]),
    elo_self: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloCategory(eloSelf))]), [1]),
    elo_oppo: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloCategory(eloOppo))]), [1]),
  };
  const out = await session.run(feeds);
  const logits = out.logits.data;
  let max = -Infinity;
  for (const m of legal) max = Math.max(max, logits[m.index]);
  let sum = 0;
  const scored = legal.map((m) => {
    const e = Math.exp(logits[m.index] - max);
    sum += e;
    return { uci: m.uci, san: m.san, p: e };
  });
  for (const m of scored) m.p /= sum;
  scored.sort((a, b) => b.p - a.p);
  // value head: expected score for the side to move, mapped to [0, 1]
  const value = Math.min(1, Math.max(0, out.value.data[0] / 2 + 0.5));
  return { moves: scored, value };
}

const ready = load().then(
  () => postMessage({ type: 'ready', threads: ort.env.wasm.numThreads }),
  (error) => postMessage({ type: 'error', message: String(error?.message ?? error) }),
);

onmessage = async ({ data }) => {
  if (data.type === 'assets') { receiveAssets(data); return; }
  await ready;
  try {
    const result = await analyze(data.fen, data.eloSelf, data.eloOppo);
    postMessage({ type: 'result', id: data.id, ...result });
  } catch (error) {
    postMessage({ type: 'result', id: data.id, error: String(error?.message ?? error) });
  }
};
