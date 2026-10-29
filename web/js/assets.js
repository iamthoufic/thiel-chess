// Where files come from. Served from a folder they are fetched; in the
// single-file download (tools/build-single.mjs) they are embedded in the page
// as window.THIEL_INLINE and read from there instead.
const INLINE = globalThis.THIEL_INLINE ?? null;

export const inline = INLINE !== null;

export const pieceUrl = (code) => INLINE?.pieces[code] ?? `pieces/cburnett/${code}.svg`;

// path is relative to the web folder, e.g. 'img/peter/thinking.webp'
export const imageUrl = (path) => INLINE?.images?.[path] ?? path;

// path is relative to the web folder, e.g. 'model/book.json'
export async function loadJson(path) {
  if (INLINE) {
    if (!(path in INLINE.json)) throw new Error(`${path} is not embedded`);
    return INLINE.json[path];
  }
  const response = await fetch(new URL(`../${path}`, import.meta.url));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// Embedded binaries live in <script type="application/octet-stream" id="…">
// tags as base64; decoding through a data: URL is fast and needs no library.
export async function inlineBytes(id) {
  const el = document.getElementById(id);
  const response = await fetch(`data:application/octet-stream;base64,${el.textContent.trim()}`);
  el.remove(); // drop the base64 text (tens of MB) as soon as it is decoded
  return new Uint8Array(await response.arrayBuffer());
}

export const inlineScriptUrl = (key) => URL.createObjectURL(new Blob([INLINE.scripts[key]], { type: 'text/javascript' }));
