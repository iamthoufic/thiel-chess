// Local server for Thiel Chess. Run: node serve.mjs [--port 8080] [--open]
// Sends the cross-origin isolation headers ONNX Runtime needs for multi-threaded
// inference, plus the same security headers as the deployed site (read from
// ../vercel.json so the two never drift apart). No dependencies beyond Node.js.
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
let port = portArg >= 0 ? Number(args[portArg + 1]) : 8080;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node serve.mjs [--port 1-65535] [--open]');
  process.exit(1);
}
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
};

// Headers that apply to every path in vercel.json ("/(.*)").
function siteHeaders() {
  const fallback = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const vercel = JSON.parse(readFileSync(resolve(ROOT, '..', 'vercel.json'), 'utf8'));
    const all = vercel.headers?.find((h) => h.source === '/(.*)')?.headers ?? [];
    return { ...fallback, ...Object.fromEntries(all.map(({ key, value }) => [key, value])) };
  } catch {
    return fallback;
  }
}
const HEADERS = siteHeaders();

function send(res, status, text) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    send(res, 405, 'Method not allowed');
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(res, 400, 'Bad request'); // malformed percent-encoding
    return;
  }
  if (path.includes('\0')) { send(res, 400, 'Bad request'); return; }
  const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
  // Serve only files inside web/, and never the server script or dotfiles.
  if (!file.startsWith(ROOT + sep) || file === resolve(ROOT, 'serve.mjs')
    || file.slice(ROOT.length).split(sep).some((part) => part.startsWith('.'))) {
    send(res, 403, 'Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    send(res, 404, 'Not found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && portArg < 0 && port < 8100) { port += 1; server.listen(port, '127.0.0.1'); return; }
  throw error;
});
server.listen(port, '127.0.0.1', () => {
  // also answer on IPv6 loopback: some browsers resolve "localhost" to ::1 and
  // report "refused to connect" instead of falling back to 127.0.0.1
  createServer((req, res) => server.emit('request', req, res)).on('error', () => {}).listen(port, '::1');
  const url = `http://localhost:${port}/`;
  console.log(`Thiel Chess is running at ${url}  (Ctrl+C to stop)`);
  if (args.includes('--open')) {
    // execFile passes the URL as an argument, never through a shell string.
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url]);
    else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
  }
});
