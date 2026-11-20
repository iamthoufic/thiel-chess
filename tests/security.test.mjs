// Security checks for the static site: the Content-Security-Policy stays in step
// with index.html, and the local server rejects bad requests without crashing.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'));
const siteHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map(({ key, value }) => [key, value]),
);

test('the CSP allows exactly the inline script in index.html', () => {
  const html = readFileSync(resolve(ROOT, 'web/index.html'), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1, 'index.html should have one inline script');
  const hash = `sha256-${createHash('sha256').update(inline[0]).digest('base64')}`;
  const csp = siteHeaders['Content-Security-Policy'];
  assert.ok(csp, 'vercel.json must set a Content-Security-Policy');
  assert.ok(csp.includes(`'${hash}'`),
    `inline script changed: update script-src in vercel.json to '${hash}'`);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(siteHeaders['X-Content-Type-Options'], 'nosniff');
});

// Raw requests, so paths like /../ and %zz reach the server unnormalised.
function get(port, path, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      res.resume();
      res.on('end', () => done({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', fail);
    req.end();
  });
}

test('the local server serves the site safely and survives bad requests', async (t) => {
  const port = 20000 + (process.pid % 20000);
  const server = spawn(process.execPath, [resolve(ROOT, 'web/serve.mjs'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => server.kill());
  await new Promise((ready, fail) => {
    server.stdout.on('data', (chunk) => { if (String(chunk).includes('running at')) ready(); });
    server.on('exit', (code) => fail(new Error(`server exited (${code})`)));
  });

  const home = await get(port, '/');
  assert.equal(home.status, 200);
  assert.equal(home.headers['content-security-policy'], siteHeaders['Content-Security-Policy']);
  assert.equal(home.headers['cross-origin-embedder-policy'], 'require-corp');
  assert.equal(home.headers['x-frame-options'], 'DENY');

  assert.equal((await get(port, '/%zz')).status, 400, 'malformed encoding');
  assert.equal((await get(port, '/%00')).status, 400, 'null byte');
  assert.notEqual((await get(port, '/../package.json')).status, 200, 'path traversal');
  assert.notEqual((await get(port, '/%2e%2e/package.json')).status, 200, 'encoded traversal');
  assert.notEqual((await get(port, '/..%5cpackage.json')).status, 200, 'backslash traversal');
  assert.equal((await get(port, '/serve.mjs')).status, 403, 'server source');
  assert.equal((await get(port, '/', 'POST')).status, 405);

  // still alive after all of the above
  assert.equal((await get(port, '/js/app.js')).status, 200);
});
