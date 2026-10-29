// Builds one self-contained, offline HTML file: page, styles, fonts, pieces,
// scripts, opening book, ONNX Runtime, the model and Stockfish all embedded.
// Run from the web folder: node tools/build-single.mjs [output.html]
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const WEB = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? resolve(WEB, 'dist', 'Thiel Chess.html'));
const read = (p) => readFile(resolve(WEB, p));
const text = async (p) => (await read(p)).toString('utf8');
const b64 = async (p) => (await read(p)).toString('base64');
// keep embedded text from closing the <script> element it lives in
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

async function bundle(entry, options = {}) {
  const result = await build({
    entryPoints: [resolve(WEB, entry)], bundle: true, format: 'esm', minify: true,
    write: false, platform: 'browser', target: 'es2022', logLevel: 'error', ...options,
  });
  return result.outputFiles[0].text;
}

// The engine worker for the single file: a classic script (module workers from
// blob: URLs are refused on file:// pages) using ONNX Runtime's self-contained
// "bundle" build, which needs no second script at runtime.
const ortBundle = {
  name: 'ort-bundle',
  setup(b) {
    b.onResolve({ filter: /ort\.wasm\.min\.mjs$/ }, () => ({ path: resolve(WEB, 'vendor/ort/ort.wasm.bundle.min.mjs') }));
  },
};

// Stockfish in the single file: a blob worker on a file:// page cannot fetch its
// .wasm (it even derives the address from its own blob URL), so the page posts
// the bytes and this prefix answers the engine's one fetch with them. The lite
// build has its network inside the .wasm, so it fetches nothing else. The
// listener runs before Stockfish's own and keeps the bytes from reaching it.
const SF_SHIM = `(() => {
  let give; const bytes = new Promise((r) => { give = r; });
  self.addEventListener('message', (e) => { if (e.data && e.data.sfWasm) { give(e.data.sfWasm); e.stopImmediatePropagation(); } });
  self.fetch = () => bytes.then((b) => new Response(b, { headers: { 'Content-Type': 'application/wasm' } }));
})();
`;

const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
const pieces = Object.fromEntries(await Promise.all(PIECES.map(async (c) => [c, `data:image/svg+xml;base64,${await b64(`pieces/cburnett/${c}.svg`)}`])));

let css = await text('css/style.css');
for (const match of css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
  css = css.replace(match[0], `url("data:font/woff2;base64,${await b64(`fonts/${match[1]}`)}")`);
}

const json = {
  'model/book.json': JSON.parse(await text('model/book.json')),
  'model/moves.json': JSON.parse(await text('model/moves.json')),
  'model/timing.json': JSON.parse(await text('model/timing.json')),
};
try { json['model/metrics.json'] = JSON.parse(await text('model/metrics.json')); } catch { /* optional */ }

const MOODS = ['profile', 'smile', 'thinking', 'talk', 'wink', 'proud',
  ...['brilliant', 'great', 'good', 'book', 'neutral', 'inaccuracy', 'mistake', 'blunder'].map((k) => `react-${k}`)];
const images = Object.fromEntries(await Promise.all(MOODS.map(async (m) => [`img/peter/${m}.webp`, `data:image/webp;base64,${await b64(`img/peter/${m}.webp`)}`])));
images['img/me/thoufic.jpg'] = `data:image/jpeg;base64,${await b64('img/me/thoufic.jpg')}`;

const inline = {
  pieces,
  images,
  json,
  scripts: {
    worker: await bundle('js/engine-worker.js', { format: 'iife', plugins: [ortBundle], define: { 'import.meta.url': 'self.location.href' } }),
    stockfish: SF_SHIM + await text('vendor/stockfish/stockfish.js'),
  },
};
const app = await bundle('js/app.js');

let html = await text('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>${css}</style>`);
html = html.replace(/pieces\/cburnett\/(\w\w)\.svg/g, (_, code) => pieces[code]);
html = html.replace(/img\/peter\/([\w-]+)\.webp/g, (path) => images[path]);
html = html.replaceAll('img/me/thoufic.jpg', images['img/me/thoufic.jpg']);
html = html.replace('href="img/logo.svg"', `href="data:image/svg+xml;base64,${await b64('img/logo.svg')}"`);
const model = await b64('model/thiel-maia2.onnx');
const wasm = await b64('vendor/ort/ort-wasm-simd-threaded.wasm');
const sfWasm = await b64('vendor/stockfish/stockfish.wasm');
const scripts = [
  `<script>window.THIEL_INLINE = ${safe(JSON.stringify(inline))};</script>`,
  `<script type="application/octet-stream" id="thiel-wasm">${wasm}</script>`,
  `<script type="application/octet-stream" id="thiel-model">${model}</script>`,
  `<script type="application/octet-stream" id="sf-wasm">${sfWasm}</script>`,
  `<script type="module">${safe(app)}</script>`,
].join('\n');
html = html.replace('<script type="module" src="js/app.js"></script>', () => scripts);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html);
const { size } = await stat(OUT);
console.log(`${basename(OUT)}: ${(size / 1e6).toFixed(1)} MB -> ${OUT}`);
