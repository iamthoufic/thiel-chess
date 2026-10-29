// Local server for Thiel Chess. Run: node serve.mjs [--port 8080] [--open]
// Sends the cross-origin isolation headers ONNX Runtime needs for multi-threaded
// inference. No dependencies beyond Node.js.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
let port = portArg >= 0 ? Number(args[portArg + 1]) : 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403).end(); return; }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
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
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
    exec(cmd);
  }
});
