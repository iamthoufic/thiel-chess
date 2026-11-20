import { Chess } from '../vendor/chess.js';
import { Board, fenPieces } from './board.js';
import { Engine } from './engine.js';
import { Sounds } from './sound.js';
import { hydrateIcons, icon } from './icons.js';
import { Explorer } from './openings.js';
import { renderAbout } from './about.js';
import { renderBlog } from './blog.js';
import { imageUrl, pieceUrl } from './assets.js';
import { Analyst, DEPTH } from './analyst.js';
import { logoSvg, updateFavicon } from './logo.js';
import { COUNTRIES, flagSvg } from './flags.js';
import * as history from './history.js';
import { ORDER, QUALITY, badgeSvg, explain, formatEval, gameAccuracy, isBad, reactionImage, reviewMove } from './quality.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const START_FEN = new Chess().fen();
const STORE = 'thiel-chess:settings';
const DEFAULTS = {
  name: '', rating: '', country: '', showMe: false, ui: 'dark', board: 'lavender', anim: 220, showLegal: true, showLast: true, coords: true,
  queen: false, sound: true, volume: 60, haptics: true, pace: 'human',
  style: 'human', book: true, insight: true, tc: '180+0', color: 'r',
};
export const THEMES = [
  ['lavender', 'Lavender'], ['blue', 'Blue'], ['green', 'Green'], ['walnut', 'Walnut'],
  ['pink', 'Pink'], ['slate', 'Slate'], ['tournament', 'Forest'], ['midnight', 'Night'],
];
// Peter's face follows the game: smiling at rest, thinking while he moves,
// a wink when the network likes his position, and a reaction at the end.
const moodUrl = (mood) => imageUrl(`img/peter/${mood}.webp`);
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const REASONS = {
  checkmate: 'by checkmate', timeout: 'on time', resign: 'by resignation', stalemate: 'by stalemate',
  repetition: 'by repetition', insufficient: 'by insufficient material', fifty: 'by the 50-move rule',
  agreement: 'by agreement', 'timeout-insufficient': 'timeout vs insufficient material',
};

// ---------------------------------------------------------------- settings
const settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return { ...DEFAULTS }; }
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* private mode */ } };
// The player's name is optional: nothing asks for it up front. "You" until they
// set one, from their own player bar (click the name) or in Settings.
const myName = () => (settings.name || '').trim() || 'You';
// your rating and flag, shown beside your name only when switched on in Settings
function myBadges() {
  if (!settings.showMe) return '';
  const rating = Number(settings.rating);
  return (rating ? `<span class="rating">(${rating})</span>` : '') + flagSvg(settings.country);
}
// An optional profile photo, kept apart from the settings because it is larger.
const PHOTO = 'thiel-chess:photo';
// Only a base64 image data URL is ever written here; anything else (an edited or
// foreign value on a shared origin) is ignored, because the photo is placed in an
// <img src> attribute.
const SAFE_PHOTO = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const safePhoto = (value) => (typeof value === 'string' && SAFE_PHOTO.test(value) ? value : '');
let photo = (() => { try { return safePhoto(localStorage.getItem(PHOTO)); } catch { return ''; } })();
// your avatar wherever it appears: the photo, else your initial, else the user icon
function youAvatar(cls) {
  if (photo) return `<img class="${cls} avatar-you" src="${photo}" alt="">`;
  if ((settings.name || '').trim()) return `<span class="${cls} avatar-you avatar-initial">${escapeHtml(myName()[0].toUpperCase())}</span>`;
  return `<span class="${cls} avatar-you"><span data-icon="user"></span></span>`;
}
const escapeHtml = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- services
const sounds = new Sounds();
const toastEl = $('#toast');
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

const engine = new Engine((state, info) => {
  const line = $('#loadLine');
  const status = $('#engineStatus');
  status.className = `engine-status ${state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : ''}`;
  if (state === 'loading') {
    engine.progress = info;
    $('#loadBar').style.width = `${Math.round(info * 100)}%`;
    $('#loadText').textContent = engine.book ? `You can start · his network ${Math.round(info * 100)}%` : `Loading Peter ${Math.round(info * 100)}%`;
    $('#engineLabel').textContent = `Loading ${Math.round(info * 100)}%`;
    if (game.status === 'playing' && game.thinking) setTitle();
  } else if (state === 'ready') {
    line.classList.add('done');
    $('#loadText').textContent = 'Runs entirely on this device';
    $('#engineLabel').textContent = 'In-browser engine';
    $('#playBtn').disabled = false;
    renderSideTiles();
  } else {
    $('#engineLabel').textContent = 'Engine unavailable';
    line.classList.add('done');
    $('#loadText').textContent = 'Peter could not load. Close other tabs and apps, then reload.';
    console.error(info);
  }
});
engine.progress = 0;
// His book covers the first ten moves, so play can begin as soon as it is in,
// long before the 27 MB network has arrived.
engine.bookReady.then(() => {
  if (engine.state === 'error') return;
  $('#playBtn').disabled = false;
  if (engine.state === 'loading') $('#loadText').textContent = `You can start · his network ${Math.round(engine.progress * 100)}%`;
  renderSideTiles();
}, () => {});

// ---------------------------------------------------------------- game state
const game = {
  chess: new Chess(),
  you: 'w',
  status: 'idle', // idle | playing | over
  plies: [],
  view: 0,
  tc: null, // { base, inc } in ms
  clock: { w: 0, b: 0 },
  lastTick: 0,
  token: 0,
  thinking: false,
  result: null,
  doubt: 0, // consecutive Peter moves with a hopeless evaluation
  lastValue: null,
  mood: 'smile',
  id: 0,
  reviewing: false, // Game Review open: ratings, best-move arrows and Peter's comments
  lowAlerts: new Set(),
  historyId: null, // this game's entry in the saved history, once it is over
  reviewSaved: false,
  playedAt: null,
};

// Stockfish reviews every position in the background while the game is played;
// nothing is shown until the game is over.
const analyst = new Analyst();
analyst.onProgress = () => { if (game.status === 'over') refreshReview(); };
// Stockfish (the Game Review engine) waits for the network, so the two big
// downloads do not compete for bandwidth at startup.
analyst.after = engine.ready.catch(() => {});
const peter = () => (game.you === 'w' ? 'b' : 'w');
const live = () => game.view === game.plies.length;
const uciMove = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const fenAt = (n) => (n === 0 ? START_FEN : game.plies[n - 1].fen);

function kingInCheck(chess) {
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  for (const [sq, code] of fenPieces(chess.fen())) if (code === `${turn}K`) return sq;
  return null;
}

// ---------------------------------------------------------------- board
const board = new Board($('#board'), {
  interactive: true,
  canMove: (sq) => game.status === 'playing' && live() && !game.thinking
    && game.chess.turn() === game.you && game.chess.get(sq)?.color === game.you,
  targets: (sq) => game.chess.moves({ square: sq, verbose: true })
    .filter((m, i, all) => all.findIndex((o) => o.to === m.to) === i)
    .map((m) => ({ to: m.to, capture: m.flags.includes('c') || m.flags.includes('e') })),
  onMove: userMove,
  onInteract: () => {
    sounds.unlock();
    if (game.status === 'playing' && !live()) goTo(game.plies.length);
  },
});

function showView(n, animate = true) {
  game.view = n;
  const chess = new Chess(fenAt(n));
  const ply = game.plies[n - 1];
  board.setPosition(chess.fen(), { lastMove: ply ? { from: ply.from, to: ply.to } : null, check: kingInCheck(chess), animate });
  renderMoves();
  renderPlayers();
  showBadge();
  if (game.reviewing) renderCoach();
}

function goTo(n) {
  n = Math.max(0, Math.min(game.plies.length, n));
  if (n === game.view) return;
  const forward = n === game.view + 1;
  showView(n);
  if (forward) {
    const ply = game.plies[n - 1];
    sounds.play(sounds.forMove(ply.move, ply.san.includes('+') || ply.san.includes('#'), ply.by === 'you'));
  } else sounds.play('moveSelf');
}

// ---------------------------------------------------------------- moves
function userMove(from, to) {
  const options = game.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!options.length) return;
  if (options.some((m) => m.promotion)) {
    if (settings.queen) return play({ from, to, promotion: 'q' }, 'you');
    board.promote(to, game.you).then((promotion) => {
      if (promotion && game.status === 'playing' && game.chess.turn() === game.you) play({ from, to, promotion }, 'you');
      else board.select(null);
    });
    return;
  }
  play({ from, to }, 'you');
}

function syncClock(now = performance.now()) {
  if (!game.tc || game.status !== 'playing' || game.plies.length < 2) { game.lastTick = now; return; }
  const turn = game.chess.turn();
  game.clock[turn] = Math.max(0, game.clock[turn] - (now - game.lastTick));
  game.lastTick = now;
}

function play(input, by, info = {}) {
  syncClock();
  const mover = game.chess.turn();
  const clocksRunning = game.plies.length >= 2;
  const move = game.chess.move(input);
  if (game.tc && clocksRunning) game.clock[mover] += game.tc.inc;
  game.lastTick = performance.now();
  const check = game.chess.inCheck();
  game.plies.push({
    move, san: move.san, uci: move.from + move.to + (move.promotion ?? ''), from: move.from, to: move.to,
    fen: game.chess.fen(), by, source: info.source ?? null, decision: info.decision ?? null,
  });
  analyst.analyse(game.chess.fen());
  showView(game.plies.length);
  sounds.play(sounds.forMove(move, check, by === 'you'));
  if (by === 'you') board.showArrows([]);
  if (checkGameOver()) return;
  setTitle();
  if (game.chess.turn() === peter()) peterMove();
}

function checkGameOver() {
  const c = game.chess;
  if (c.isCheckmate()) return finish(c.turn() === 'w' ? 'b' : 'w', 'checkmate');
  if (c.isStalemate()) return finish(null, 'stalemate');
  if (c.isInsufficientMaterial()) return finish(null, 'insufficient');
  if (c.isThreefoldRepetition()) return finish(null, 'repetition');
  if (c.isDrawByFiftyMoves()) return finish(null, 'fifty');
  return false;
}

// Can `color` still deliver mate? Used to turn a flag into a draw.
function canMate(color) {
  const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const code of fenPieces(game.chess.fen()).values()) {
    if (code[0] === color && code[1] !== 'K') counts[code[1].toLowerCase()] += 1;
  }
  return counts.p + counts.r + counts.q > 0 || counts.n + counts.b > 1;
}

async function peterMove() {
  const token = ++game.token;
  setThinking(true);
  const started = performance.now();
  let decision;
  try {
    decision = await engine.choose(game.chess, {
      style: settings.style,
      useBook: settings.book,
      pace: settings.pace,
      clock: game.tc && game.plies.length >= 2 ? { remaining: game.clock[peter()], increment: game.tc.inc } : null,
    });
  } catch (error) {
    if (token === game.token) { setThinking(false); toast('Peter could not think: the model is not loaded.'); }
    return;
  }
  const wait = decision.thinkMs - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (token !== game.token || game.status !== 'playing') return;
  setThinking(false);

  // He resigned more than half his real games; resign when the network is
  // certain he is lost for three moves running.
  if (decision.value !== null) {
    game.lastValue = decision.value;
    game.doubt = decision.value < 0.04 && game.plies.length > 30 ? game.doubt + 1 : 0;
    if (game.doubt >= 3) return finish(game.you, 'resign', 'Peter resigned');
  }
  renderInsight(decision, decision.uci);
  setMood(moodFor(decision.value));
  play(uciMove(decision.uci), 'peter', { source: decision.source, decision });
}

function setThinking(on) {
  game.thinking = on;
  if (on) setMood('thinking');
  setTitle();
}

function setMood(mood) {
  if (game.mood === mood) return;
  game.mood = mood;
  for (const img of $$('[data-peter]')) {
    img.src = moodUrl(mood);
    img.classList.remove('swap');
    void img.offsetWidth; // restart the small swap animation
    img.classList.add('swap');
  }
}

// After he moves: a wink when the network likes his position, otherwise a smile.
const moodFor = (value) => (value !== null && value > 0.72 ? 'wink' : 'smile');

function setTitle() {
  const t = $('#gameTitle');
  $('#gameMove').textContent = `Move ${Math.floor(game.plies.length / 2) + 1}`;
  renderSideTiles();
  if (game.status === 'over') return;
  if (game.status !== 'playing') { t.textContent = 'Ready'; return; }
  const loading = engine.state === 'loading' ? ` (loading ${Math.round(engine.progress * 100)}%)` : '';
  t.textContent = game.chess.turn() === game.you ? 'Your move' : `Peter is thinking…${loading}`;
}

// Left column tiles follow the game: live actions only while a game is on.
function renderSideTiles() {
  const playing = game.status === 'playing';
  const yourTurn = playing && game.chess.turn() === game.you && !game.thinking;
  $('#askPeter').disabled = !yourTurn;
  $('#takebackBtn').disabled = !playing || !game.plies.some((p) => p.by === 'you');
  $('#drawBtn').disabled = !playing;
  $('#resignBtn').disabled = !playing;
  const idle = game.status === 'idle';
  // a game can start once his opening book is in: the network keeps
  // downloading in the background and takes over after the book
  $('#newTile').disabled = idle && !engine.book && engine.state !== 'ready';
  $('#newTileTitle').textContent = idle ? 'Play' : 'New game';
  $('#newTileSub').textContent = idle ? `${tcLabelFor(settings.tc)} · vs Peter` : 'Choose time and colour';
}

function tcLabelFor(tc) {
  const [base, inc] = tc.split('+').map(Number);
  if (!base) return 'Unlimited';
  return `${base / 60} min${inc ? ` | ${inc}` : ''}`;
}

// ---------------------------------------------------------------- clocks
function fmt(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 20) return `0:${Math.floor(s).toString().padStart(2, '0')}.${Math.floor((s * 10) % 10)}`;
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// Runs every animation frame for smooth clocks, and on a timer as well because
// browsers pause animation frames in background tabs (a flag must still land).
function tick(fromFrame = true) {
  if (game.status === 'playing' && game.tc) {
    syncClock();
    const turn = game.chess.turn();
    if (turn === game.you && game.plies.length >= 2) lowTimeHaptics(game.clock[turn]);
    if (game.clock[turn] <= 0) {
      const other = turn === 'w' ? 'b' : 'w';
      if (canMate(other)) finish(other, 'timeout');
      else finish(null, 'timeout-insufficient');
    }
    renderClocks();
  }
  if (fromFrame) requestAnimationFrame(() => tick());
}
setInterval(() => tick(false), 250);

// Browsers only allow vibration after the user has interacted with the page.
function vibrate(pattern) {
  if (!navigator.vibrate || navigator.userActivation?.hasBeenActive === false) return;
  navigator.vibrate(pattern);
}

// A short buzz at 20 s and 10 s, then a light tap each second from 5 s.
function lowTimeHaptics(ms) {
  if (!settings.haptics) return;
  const secs = Math.ceil(ms / 1000);
  const marks = { 20: [70], 10: [90, 70, 90], 5: [30], 4: [30], 3: [30], 2: [30], 1: [30] };
  if (marks[secs] && !game.lowAlerts.has(secs)) {
    game.lowAlerts.add(secs);
    vibrate(marks[secs]);
  }
}

function renderClocks() {
  const idleBase = Number(settings.tc.split('+')[0]) * 1000;
  for (const el of $$('.clock')) {
    const color = el.dataset.color;
    const idle = game.status === 'idle';
    if (idle ? !idleBase : !game.tc) { el.classList.add('off'); continue; }
    el.classList.remove('off');
    const ms = idle ? idleBase : game.clock[color];
    el.querySelector('.t').textContent = fmt(ms);
    const on = game.status === 'playing' && game.chess.turn() === color;
    el.classList.toggle('on', on);
    el.classList.toggle('low', !idle && ms < Math.max(10_000, game.tc.base * 0.1));
  }
}

// ---------------------------------------------------------------- players
const US_FLAG = flagSvg('US');

function playerHtml(color) {
  const isPeter = game.status !== 'idle' ? color === peter() : color === (board.orientation === 'w' ? 'b' : 'w');
  const named = Boolean((settings.name || '').trim());
  const avatar = isPeter
    ? `<img class="avatar" data-peter src="${moodUrl(game.mood)}" alt="Peter Thiel">`
    : youAvatar('avatar');
  const name = isPeter
    ? `<span class="nm">Peter Thiel</span><span class="rating">(2202)</span>${US_FLAG}`
    : `<button class="nm name-btn${named ? '' : ' unnamed'}" title="Edit your name">${escapeHtml(myName())}<span data-icon="pencil"></span></button>${myBadges()}`;
  return `
    ${avatar}
    <div class="pinfo">
      <div class="pname">${name}</div>
      <div class="captured" data-color="${color}"></div>
    </div>
    <span class="turn-flag">To move</span>
    <div class="clock" data-color="${color}"><span class="t">0:00</span></div>`;
}

function renderPlayers() {
  const bottom = board.orientation;
  const top = bottom === 'w' ? 'b' : 'w';
  const topEl = $('#playerTop');
  const bottomEl = $('#playerBottom');
  const key = `${top}${game.you}${game.status === 'idle'}${myName()}${photo.length}${myBadges()}`;
  if (topEl.dataset.key !== key) {
    topEl.innerHTML = playerHtml(top);
    bottomEl.innerHTML = playerHtml(bottom);
    topEl.dataset.key = key;
    hydrateIcons(topEl); hydrateIcons(bottomEl);
  }
  const toMove = game.status === 'playing' && live() ? game.chess.turn() : null;
  topEl.classList.toggle('turn', toMove === top);
  bottomEl.classList.toggle('turn', toMove === bottom);
  // captured pieces and material balance for the position on screen
  const left = { w: { ...START_COUNT }, b: { ...START_COUNT } };
  let material = 0;
  for (const code of fenPieces(fenAt(game.view)).values()) {
    const c = code[0]; const t = code[1].toLowerCase();
    if (t !== 'k') { left[c][t] -= 1; material += (c === 'w' ? 1 : -1) * VALUES[t]; }
  }
  for (const el of $$('.captured')) {
    const color = el.dataset.color;
    const victim = color === 'w' ? 'b' : 'w';
    const groups = ['p', 'n', 'b', 'r', 'q'].map((t) => {
      const n = Math.max(0, left[victim][t]);
      return n ? `<span class="grp grp-${t}">${`<img class="cap-${victim}" src="${pieceUrl(victim + t.toUpperCase())}" alt="">`.repeat(n)}</span>` : '';
    }).join('');
    const adv = color === 'w' ? material : -material;
    el.innerHTML = groups + (adv > 0 ? `<span class="adv">+${adv}</span>` : '');
    el.title = groups ? 'Pieces captured' : '';
  }
  renderClocks();
}

// ---------------------------------------------------------------- move list
function renderMoves() {
  const el = $('#moves');
  if (!game.plies.length) {
    el.innerHTML = `<div class="empty">${game.you === 'w' ? 'You have White. Make the first move.' : 'Peter has White and moves first.'}</div>`;
    return;
  }
  // Ratings stay hidden while the game is on; the review shows one on every move.
  const rated = game.status === 'over';
  let html = '';
  for (let i = 0; i < game.plies.length; i += 2) {
    const cell = (n) => {
      const ply = game.plies[n - 1];
      if (!ply) return '<span></span>';
      const q = rated && ply.review ? `<span class="q" title="${QUALITY[ply.review.kind].label}">${badgeSvg(ply.review.kind)}</span>` : '';
      const fresh = n === game.plies.length && n === game.view ? ' new' : '';
      return `<span class="mv${n === game.view ? ' cur' : ''}${fresh}" data-ply="${n}">${q}${ply.san}</span>`;
    };
    html += `<div class="mrow"><span class="mnum">${i / 2 + 1}.</span>${cell(i + 1)}${cell(i + 2)}</div>`;
  }
  el.innerHTML = html;
  // Keep the current move visible by scrolling the list itself. scrollIntoView
  // would also scroll the page, which on a phone jumps the board off screen.
  const cur = el.querySelector('.cur');
  if (cur) {
    const box = el.getBoundingClientRect();
    const row = cur.getBoundingClientRect();
    if (row.top < box.top) el.scrollTop += row.top - box.top;
    else if (row.bottom > box.bottom) el.scrollTop += row.bottom - box.bottom;
  }
  for (const btn of $$('[data-nav]')) {
    const back = btn.dataset.nav === 'start' || btn.dataset.nav === 'prev';
    btn.disabled = back ? game.view === 0 : live();
  }
}

$('#moves').addEventListener('click', (e) => {
  const mv = e.target.closest('.mv');
  if (mv) goTo(Number(mv.dataset.ply));
});
for (const btn of $$('[data-nav]')) {
  btn.addEventListener('click', () => {
    const target = { start: 0, prev: game.view - 1, next: game.view + 1, end: game.plies.length }[btn.dataset.nav];
    goTo(target);
  });
}

// ---------------------------------------------------------------- game review
// Every move gets a Stockfish verdict (see quality.js). Ratings fill in as the
// analysis finishes; none of it is shown until the game is over.
function computeReviews() {
  const fens = [START_FEN, ...game.plies.map((p) => p.fen)];
  const analyses = fens.map((f) => analyst.cache.get(f));
  let done = 0;
  for (let i = 1; i <= game.plies.length; i += 1) {
    const ply = game.plies[i - 1];
    const prev = game.plies[i - 2]?.review ?? null;
    if (!ply.review && (i === 1 || prev)) {
      ply.review = reviewMove({ i, fens, analyses, move: ply.move, book: engine.book, prev });
    }
    if (ply.review) done += 1;
  }
  return done;
}

const reviewsOf = (by) => game.plies.filter((p) => p.by === by && p.review).map((p) => p.review);
const moveNo = (ply) => Math.floor(game.plies.indexOf(ply) / 2) + 1;
const fmtAcc = (a) => (a === null ? '–' : a.toFixed(1));

function refreshReview() {
  if (game.status !== 'over') return;
  const done = computeReviews();
  const total = game.plies.length;
  const complete = done === total;
  const accYou = gameAccuracy(reviewsOf('you'));
  const accPeter = gameAccuracy(reviewsOf('peter'));
  // panel
  $('#reviewProgress').hidden = complete || !total;
  $('#reviewBar').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $('#reviewText').textContent = `Stockfish is reviewing · ${done} of ${total} moves`;
  $('#accStrip').hidden = !game.reviewing;
  $('#accYou').textContent = complete ? fmtAcc(accYou) : '…';
  $('#accPeter').textContent = complete ? fmtAcc(accPeter) : '…';
  // game-over card
  $('#rpAccYou').textContent = complete && accYou !== null ? `Accuracy ${fmtAcc(accYou)}` : '';
  $('#rpAccPeter').textContent = complete && accPeter !== null ? `Accuracy ${fmtAcc(accPeter)}` : '';
  renderTally(complete, done, total);
  if (complete) $('#resultSay').textContent = summaryLine(accYou);
  if (complete && game.historyId && !game.reviewSaved) {
    game.reviewSaved = true;
    history.attachReview(game.historyId, game.plies.map((p) => history.compactReview(p.review)), accYou, accPeter, reviewsOf('you').length);
    renderHistory();
  }
  renderMoves();
  renderCoach();
  showBadge();
}

// Three counts from your game, the way Chess.com's card shows them: your best
// moves, your strongest highlight, and your most serious slip.
function renderTally(complete, done, total) {
  const el = $('#tally');
  if (!total) { el.innerHTML = ''; return; }
  if (!complete) {
    el.innerHTML = `<div class="tally-wait"><span class="load-bar"><i style="width:${Math.round((done / total) * 100)}%"></i></span><span>Stockfish is reviewing · ${done} of ${total}</span></div>`;
    return;
  }
  const counts = {};
  for (const r of reviewsOf('you')) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  // two strengths (a brilliant or great move first, then your most frequent),
  // and the most serious slip
  const good = ['brilliant', 'great', 'best', 'excellent', 'good', 'book'];
  const strengths = [...good.filter((k) => (k === 'brilliant' || k === 'great') && counts[k]),
    ...good.filter((k) => k !== 'brilliant' && k !== 'great').sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))].slice(0, 2);
  const slip = ['blunder', 'miss', 'mistake', 'inaccuracy'].find((k) => counts[k]);
  const shown = slip ? [...strengths, slip] : [...strengths, good.find((k) => !strengths.includes(k) && counts[k]) ?? 'good'];
  el.innerHTML = shown.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((k) => `
    <div class="tally-chip${isBad(k) ? ' bad' : ''}">
      <span class="tally-n"><span class="badge">${badgeSvg(k)}</span>${counts[k] ?? 0}</span>
      <span class="tally-k" style="color:${QUALITY[k].color}">${QUALITY[k].label}</span>
    </div>`).join('');
}

// Peter's one-line read of the game, from the evaluations Stockfish produced.
function summaryLine(acc) {
  const yours = game.plies.filter((p) => p.by === 'you' && p.review);
  if (game.plies.length < 6 || !yours.length) return 'That was over before it really began. Again?';
  const worst = yours.reduce((a, b) => (b.review.loss > a.review.loss ? b : a));
  const peak = yours.find((p) => p.review.playedWin >= 0.7);
  const big = worst.review.loss >= 0.2;
  const slip = `${worst.san} on move ${moveNo(worst)}`;
  const w = game.result?.winner;
  const pct = acc === null ? '' : `${Math.round(acc)}%`;
  if (w === game.you) {
    if (acc >= 85) return `Clean game. ${pct} accuracy, and I never got back into it.`;
    if (big) return `You got there, but ${slip} gave me a way back. ${worst.review.bestSan} was the move.`;
    return `You outplayed me. ${pct} accuracy is hard to argue with.`;
  }
  if (w === null) {
    if (peak) return `You were better around move ${moveNo(peak)}, but I held on. A fair result.`;
    return 'Even all the way through. A fair result.';
  }
  if (peak && game.plies.indexOf(peak) < game.plies.indexOf(worst) && big) {
    return `You had the advantage by move ${moveNo(peak)}. ${slip} turned it; ${worst.review.bestSan} kept you ahead.`;
  }
  if (big) return `The game turned on ${slip}. ${worst.review.bestSan} would have held.`;
  return `Close game. No big mistakes from you, I just squeezed a little more out of it.`;
}

// Review panel: Peter comments on the move on screen.
function renderCoach() {
  const coach = $('#coach');
  if (!game.reviewing) { coach.hidden = true; return; }
  const ply = game.plies[game.view - 1];
  coach.hidden = false;
  const face = $('#coachFace');
  if (!ply) {
    face.src = moodUrl('smile');
    $('#coachBadge').innerHTML = '';
    $('#coachTitle').textContent = 'Game review';
    $('#coachTitle').style.color = '';
    $('#coachEval').textContent = '';
    $('#coachLine').textContent = 'Step through the game with the arrows below or ← and →.';
    board.showArrows([]);
    return;
  }
  const r = ply.review;
  if (!r) {
    face.src = moodUrl('thinking');
    $('#coachBadge').innerHTML = '';
    $('#coachTitle').textContent = 'Reviewing';
    $('#coachTitle').style.color = '';
    $('#coachEval').textContent = '';
    $('#coachLine').textContent = `Stockfish is still looking at ${ply.san}.`;
    return;
  }
  face.src = imageUrl(reactionImage(r.kind));
  $('#coachBadge').innerHTML = badgeSvg(r.kind);
  $('#coachTitle').textContent = QUALITY[r.kind].label;
  $('#coachTitle').style.color = QUALITY[r.kind].color;
  $('#coachEval').textContent = formatEval(r.evalAfter, new Chess(ply.fen).turn() === 'w');
  $('#coachLine').textContent = explain(r, ply.san);
  const showBest = !['best', 'book', 'forced', 'brilliant', 'great'].includes(r.kind) && r.best !== ply.uci;
  $('#board').classList.add('best-arrows');
  board.showArrows(showBest ? [[r.best.slice(0, 2), r.best.slice(2, 4)]] : []);
}

function startReview() {
  $('#resultModal').hidden = true;
  game.reviewing = true;
  $('#gameTitle').textContent = 'Game review';
  $('#overActions').classList.add('reviewing');
  $('#insight').hidden = true;
  refreshReview();
  goTo(game.plies.length ? 1 : 0);
  renderCoach();
}

let badgeEl = null;
function clearBadge() {
  badgeEl?.remove();
  badgeEl = null;
}

// After the game, the rating sits on the corner of the square the piece moved
// to, as in a game review. During play the board stays clean.
function showBadge() {
  clearBadge();
  const ply = game.plies[game.view - 1];
  if (game.status !== 'over' || !ply?.review) return;
  const file = ply.to.charCodeAt(0) - 97;
  const rank = Number(ply.to[1]) - 1;
  const x = board.orientation === 'w' ? file : 7 - file;
  const y = board.orientation === 'w' ? 7 - rank : rank;
  badgeEl = document.createElement('div');
  badgeEl.className = 'move-badge';
  badgeEl.style.left = `${(x + 1) * 12.5}%`;
  badgeEl.style.top = `${y * 12.5}%`;
  // it hangs off the square's top-right corner; on the right file or the top
  // rank that corner is the board's edge, so tuck it inside instead of clipping
  badgeEl.classList.toggle('edge-right', x === 7);
  badgeEl.classList.toggle('edge-top', y === 0);
  badgeEl.innerHTML = badgeSvg(ply.review.kind);
  $('#board').append(badgeEl);
}

// ---------------------------------------------------------------- Peter's thinking
function renderInsight({ source, candidates, value }, played = null, forYou = false) {
  if (!forYou && !settings.insight) return;
  const chosen = played ?? candidates[0].uci;
  const rows = candidates.slice(0, 3).map((c) => `
    <div class="cand${c.uci === chosen ? ' played' : ''}">
      <span class="san">${c.san}</span>
      <span class="bar"><i style="width:${(c.p * 100).toFixed(1)}%"></i></span>
      <span class="pct">${c.p < 0.01 ? '<1' : Math.round(c.p * 100)}%</span>
    </div>`).join('');
  let note;
  if (source === 'book') {
    const pick = candidates.find((c) => c.uci === chosen);
    note = `${pick.san} in ${pick.games.toLocaleString()} of his games`;
  } else {
    note = value === null ? 'From the trained model' : `${forYou ? 'Your' : 'His'} expected score ${Math.round(value * 100)}%`;
  }
  $('#insightTitle').textContent = forYou ? 'Peter would play' : "Peter's choice";
  $('#insightBody').innerHTML = `${rows}<p class="insight-note">${note}</p>`;
  $('#insight').hidden = false;
}

$('#askPeter').addEventListener('click', async () => {
  if (game.status !== 'playing' || game.chess.turn() !== game.you) return;
  const btn = $('#askPeter');
  btn.disabled = true;
  try {
    const result = await engine.candidates(game.chess, settings.book);
    renderInsight({ ...result, candidates: result.moves }, null, true);
    const best = result.moves[0].uci;
    board.showArrows([[best.slice(0, 2), best.slice(2, 4)]]);
    setMood('talk');
    setTimeout(() => { if (game.mood === 'talk') setMood('smile'); }, 2600);
  } catch {
    toast('The model is still loading.');
  } finally {
    btn.disabled = game.chess.turn() !== game.you;
  }
});

// ---------------------------------------------------------------- game lifecycle
function readSetup(color) {
  const [base, inc] = settings.tc.split('+').map(Number);
  game.tc = base ? { base: base * 1000, inc: inc * 1000 } : null;
  game.you = color ?? (settings.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color);
}

function tcShort() {
  if (!game.tc) return 'game';
  return `${game.tc.base / 60000} min${game.tc.inc ? ` | ${game.tc.inc / 1000}` : ''}`;
}

function tcKind() {
  if (!game.tc) return 'Casual';
  const min = game.tc.base / 60000;
  return min < 3 ? 'Bullet' : min < 10 ? 'Blitz' : 'Rapid';
}

function tcLabel() {
  if (!game.tc) return 'Casual · No clock';
  const min = game.tc.base / 60000;
  const kind = min < 3 ? 'Bullet' : min < 10 ? 'Blitz' : 'Rapid';
  return `${min} min${game.tc.inc ? ` | ${game.tc.inc / 1000}` : ''} · ${kind}`;
}

function startGame(color) {
  sounds.unlock();
  readSetup(typeof color === 'string' ? color : undefined);
  game.token += 1;
  game.chess = new Chess();
  game.plies = [];
  game.view = 0;
  game.result = null;
  game.status = 'playing';
  game.doubt = 0;
  game.lastValue = null;
  game.clock = { w: game.tc?.base ?? 0, b: game.tc?.base ?? 0 };
  game.lastTick = performance.now();
  board.setOrientation(game.you);
  board.showArrows([]);
  $('#playerTop').dataset.key = '';
  showView(0);
  $('#setup').hidden = true;
  $('#game').hidden = false;
  $('#overActions').hidden = true;
  $('#gameMode').textContent = game.tc ? tcLabelFor(settings.tc) : 'No clock';
  $('#gameChip').textContent = tcKind();
  $('#insight').hidden = true;
  $('#coach').hidden = true;
  $('#accStrip').hidden = true;
  $('#reviewProgress').hidden = true;
  game.reviewing = false;
  $('#board').classList.remove('best-arrows');
  game.lowAlerts = new Set();
  game.historyId = null;
  game.reviewSaved = false;
  game.playedAt = new Date();
  game.id += 1;
  analyst.clear();
  analyst.analyse(START_FEN);
  resetResign();
  setMood('smile');
  setThinking(false);
  sounds.play('start');
  if (game.chess.turn() === peter()) peterMove();
}

function finish(winner, reason, label) {
  if (game.status !== 'playing') return true;
  syncClock();
  game.status = 'over';
  game.token += 1;
  setThinking(false);
  game.result = { winner, reason };
  renderClocks();
  setTimeout(() => sounds.play('end'), 140);
  const youWon = winner === game.you;
  const title = winner === null ? 'Draw' : youWon ? 'You won!' : 'Peter won';
  $('#gameTitle').textContent = title;
  $('#overActions').hidden = false;
  renderSideTiles();
  $('#askPeter').disabled = true;
  $('#resultTitle').textContent = title;
  $('#resultReason').textContent = label ?? REASONS[reason];
  $('#resultScore').textContent = winner === null ? '½ – ½' : youWon ? '1 – 0' : '0 – 1';
  const outcome = winner === null ? 'draw' : youWon ? 'win' : 'loss';
  saveToHistory(outcome, label ?? REASONS[reason]);
  const mood = { draw: 'react-neutral', win: 'react-good', loss: 'proud' }[outcome];
  setMood(mood);
  $('#resultPhoto').src = moodUrl(mood);
  $('.modal.result').className = `modal result ${outcome}`;
  $('#rpYou').classList.toggle('winner', youWon);
  $('#rpNameYou').textContent = myName();
  const rpAvatar = $('#rpAvatarYou');
  rpAvatar.outerHTML = youAvatar('rp-avatar').replace('class="', 'id="rpAvatarYou" class="');
  hydrateIcons($('#rpYou'));
  $('#rpPeter').classList.toggle('winner', winner !== null && !youWon);
  $('#modalNewLabel').textContent = `New ${tcShort()}`;
  $('#resultSay').textContent = 'Give me a second to go over that game.';
  $('#insight').hidden = true;
  refreshReview();
  setTimeout(() => { if (game.status === 'over') $('#resultModal').hidden = false; }, 650);
  return true;
}

function takeback() {
  if (game.status !== 'playing' || !game.plies.length) return;
  game.token += 1;
  setThinking(false);
  let undo = game.plies[game.plies.length - 1].by === 'peter' ? 2 : 1;
  if (undo > game.plies.length || (undo === 2 && game.plies.length === 1)) {
    toast('Nothing of yours to take back yet.');
    return;
  }
  while (undo-- > 0) { game.chess.undo(); game.plies.pop(); }
  game.lastTick = performance.now();
  board.showArrows([]);
  showView(game.plies.length);
  sounds.play('moveSelf');
  setTitle();
  if (game.chess.turn() === peter()) peterMove();
}

function offerDraw() {
  if (game.status !== 'playing') return;
  if (game.plies.length < 20) { toast('Peter declined: too early for a draw.'); return; }
  if (game.lastValue !== null && game.lastValue < 0.42) finish(null, 'agreement', 'Peter accepted your draw offer');
  else toast('Peter declined the draw.');
}

let resignTimer;
function resetResign() {
  clearTimeout(resignTimer);
  const btn = $('#resignBtn');
  btn.classList.remove('confirm');
  btn.querySelector('.label').textContent = 'Resign';
  btn.querySelector('.sub').textContent = 'Concede the game';
}
$('#resignBtn').addEventListener('click', () => {
  const btn = $('#resignBtn');
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.querySelector('.label').textContent = 'Confirm resign';
    btn.querySelector('.sub').textContent = 'Click again to resign';
    resignTimer = setTimeout(resetResign, 3000);
    return;
  }
  resetResign();
  finish(peter(), 'resign', 'You resigned');
});

function backToSetup() {
  $('#resultModal').hidden = true;
  game.token += 1;
  game.status = 'idle';
  $('#game').hidden = true;
  $('#setup').hidden = false;
  game.chess = new Chess();
  game.plies = [];
  board.showArrows([]);
  game.reviewing = false;
  $('#coach').hidden = true;
  $('#accStrip').hidden = true;
  $('#reviewProgress').hidden = true;
  setMood('smile');
  $('#playerTop').dataset.key = '';
  showView(0);
  renderSideTiles();
}

// ---------------------------------------------------------------- history
// A finished game goes into the history at once; its review is attached when
// Stockfish finishes (refreshReview). Games aborted before both sides moved are
// not kept and do not count.
function saveToHistory(outcome, label) {
  if (game.plies.length < 2) return;
  const tc = game.tc ? `${game.tc.base / 1000}+${game.tc.inc / 1000}` : '0+0';
  game.historyId = Date.now();
  history.add({
    id: game.historyId, date: (game.playedAt ?? new Date()).toISOString(), you: game.you, tc,
    outcome, winner: game.result.winner, reason: game.result.reason, label,
    moves: game.plies.map((p) => p.uci), clock: { ...game.clock },
    reviews: null, accYou: null, accPeter: null,
  });
  renderHistory();
}

const OUTCOME = { win: ['W', 'Won'], draw: ['D', 'Drawn'], loss: ['L', 'Lost'] };
const fmtAccOrDash = (a) => (a === null || a === undefined ? '–' : a.toFixed(1));
// "Won by checkmate", "Lost · You resigned"
const outcomeLine = (g) => `${OUTCOME[g.outcome][1]}${/^(by|on) /.test(g.label) ? ' ' : ' · '}${g.label}`;

function historyItemHtml(g) {
  const d = new Date(g.date);
  const when = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  const moves = Math.ceil(g.moves.length / 2);
  return `<button class="hist-item" data-game="${g.id}" type="button">
    <span class="hist-res ${g.outcome}">${OUTCOME[g.outcome][0]}</span>
    <span class="hist-main">
      <span class="hist-title"><img src="${pieceUrl(`${g.you}K`)}" alt="${g.you === 'w' ? 'White' : 'Black'}">${escapeHtml(outcomeLine(g))}</span>
      <span class="hist-sub">${when} · ${tcLabelFor(g.tc)} · ${moves} move${moves === 1 ? '' : 's'}</span>
    </span>
    <span class="hist-acc"><b>${fmtAccOrDash(g.accYou)}</b><small>Accuracy</small></span>
  </button>`;
}

function renderHistory() {
  const rec = history.record();
  const list = history.games();
  const played = rec.win + rec.draw + rec.loss;
  $('#historyOpen').hidden = !played;
  $('#recordLine').innerHTML = `<b class="w">${rec.win}</b> W<i>·</i><b>${rec.draw}</b> D<i>·</i><b class="l">${rec.loss}</b> L`;
  const score = played ? Math.round(((rec.win + rec.draw / 2) / played) * 100) : 0;
  $('#historyStats').innerHTML = `
    <div><dt>Played</dt><dd>${played}</dd></div>
    <div><dt>Score</dt><dd>${score}%</dd></div>
    <div><dt>Best acc.</dt><dd>${fmtAccOrDash(rec.best)}</dd></div>`;
  $('#historyLabel').textContent = list.length ? `Recent games · ${list.length}` : 'Recent games';
  $('#historyList').innerHTML = list.length ? list.map(historyItemHtml).join('') : '<p class="caption">No games yet. Finished games appear here.</p>';
  $('#historyClear').disabled = !played;
}

function openHistory(open) {
  if (open) renderHistory();
  $('#historySheet').classList.toggle('open', open);
  $('#historySheet').setAttribute('aria-hidden', String(!open));
  $('#scrim').hidden = !open;
}

// Reopen a saved game in Game Review. Its saved ratings are used as they are;
// a game saved before Stockfish finished is reviewed again now.
function openPastGame(id) {
  const entry = history.find(id);
  if (!entry || game.status === 'playing') return;
  openHistory(false);
  $('#resultModal').hidden = true;
  game.token += 1;
  analyst.clear();
  game.you = entry.you;
  const [base, inc] = entry.tc.split('+').map(Number);
  game.tc = base ? { base: base * 1000, inc: inc * 1000 } : null;
  game.chess = new Chess();
  game.plies = [];
  entry.moves.forEach((uci, i) => {
    const move = game.chess.move(uciMove(uci));
    game.plies.push({
      move, san: move.san, uci, from: move.from, to: move.to, fen: game.chess.fen(),
      by: (i % 2 === 0 ? 'w' : 'b') === entry.you ? 'you' : 'peter', source: null, decision: null,
      review: entry.reviews?.[i] ?? undefined,
    });
  });
  game.clock = { ...entry.clock };
  game.result = { winner: entry.winner, reason: entry.reason };
  game.status = 'over';
  game.historyId = entry.id;
  game.reviewSaved = Boolean(entry.reviews);
  game.playedAt = new Date(entry.date);
  game.reviewing = false;
  board.setOrientation(game.you);
  board.showArrows([]);
  $('#playerTop').dataset.key = '';
  $('#setup').hidden = true;
  $('#game').hidden = false;
  $('#gameMode').textContent = game.tc ? tcLabelFor(entry.tc) : 'No clock';
  $('#gameChip').textContent = tcKind();
  $('#resultReason').textContent = entry.label; // the copied PGN's Termination
  $('#overActions').hidden = false;
  $('#insight').hidden = true;
  setThinking(false);
  setMood({ draw: 'react-neutral', win: 'react-good', loss: 'proud' }[entry.outcome]);
  renderSideTiles();
  if (!game.reviewSaved) {
    analyst.analyse(START_FEN);
    for (const p of game.plies) analyst.analyse(p.fen);
  }
  showView(game.plies.length, false);
  startReview();
}

$('#historyOpen').addEventListener('click', () => openHistory(true));
$('#closeHistory').addEventListener('click', () => openHistory(false));
$('#historyList').addEventListener('click', (e) => {
  const item = e.target.closest('.hist-item');
  if (item) openPastGame(Number(item.dataset.game));
});
let clearTimer;
$('#historyClear').addEventListener('click', () => {
  const btn = $('#historyClear');
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.textContent = 'Click again to clear';
    clearTimer = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = 'Clear'; }, 3000);
    return;
  }
  clearTimeout(clearTimer);
  btn.classList.remove('confirm');
  btn.textContent = 'Clear';
  history.clear();
  renderHistory();
  toast('Game history cleared');
});
renderHistory();

function pgn() {
  // Copy the game's own record (it also covers games that began from a set-up position).
  const c = new Chess();
  c.loadPgn(game.chess.pgn());
  const peterName = 'Peter Thiel (Maia-2 fine-tune)';
  const d = game.playedAt ?? new Date();
  c.setHeader('Event', 'Thiel Chess');
  c.setHeader('Site', 'Local');
  c.setHeader('Date', `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`);
  c.setHeader('White', game.you === 'w' ? myName() : peterName);
  c.setHeader('Black', game.you === 'b' ? myName() : peterName);
  const w = game.result?.winner;
  c.setHeader('Result', w === 'w' ? '1-0' : w === 'b' ? '0-1' : game.result ? '1/2-1/2' : '*');
  if (game.tc) c.setHeader('TimeControl', `${game.tc.base / 1000}+${game.tc.inc / 1000}`);
  if (game.result) c.setHeader('Termination', $('#resultReason').textContent);
  return c.pgn();
}

$('#playBtn').addEventListener('click', () => startGame());
$('#newTile').addEventListener('click', () => {
  if (game.status === 'idle') startGame();
  else backToSetup();
});
$('#rematchBtn').addEventListener('click', () => { $('#resultModal').hidden = true; startGame(game.you === 'w' ? 'b' : 'w'); });
$('#modalRematch').addEventListener('click', () => { $('#resultModal').hidden = true; startGame(game.you === 'w' ? 'b' : 'w'); });
$('#modalNew').addEventListener('click', () => { $('#resultModal').hidden = true; startGame(); });
$('#newGameBtn').addEventListener('click', backToSetup);
$('#takebackBtn').addEventListener('click', takeback);
$('#drawBtn').addEventListener('click', offerDraw);
$('#flipBtn').addEventListener('click', flip);
$('#closeResult').addEventListener('click', () => { $('#resultModal').hidden = true; });
$('#modalReview').addEventListener('click', startReview);
$('#reviewBtn').addEventListener('click', startReview);
$('#modalPgn').addEventListener('click', async () => {
  const btn = $('#modalPgn');
  try {
    await navigator.clipboard.writeText(pgn());
    btn.classList.add('done');
    btn.innerHTML = `${icon('check')}<span>Copied</span>`;
  } catch {
    btn.innerHTML = `${icon('x')}<span>Copy failed</span>`;
  }
  clearTimeout(btn.resetTimer);
  btn.resetTimer = setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = `${icon('copy')}<span>Copy PGN</span>`; }, 1800);
});
$('#resultModal').addEventListener('click', (e) => { if (e.target.id === 'resultModal') $('#resultModal').hidden = true; });

function flip() {
  board.setOrientation(board.orientation === 'w' ? 'b' : 'w');
  $('#playerTop').dataset.key = '';
  renderPlayers();
}

// ---------------------------------------------------------------- setup controls
function syncSetup() {
  for (const b of $$('#timeChips .choice')) b.classList.toggle('active', b.dataset.tc === settings.tc);
  for (const b of $$('#colorSeg button')) b.classList.toggle('active', b.dataset.color === settings.color);
  const [base] = settings.tc.split('+').map(Number);
  $('#setupChip').textContent = !base ? 'Casual' : base < 180 ? 'Bullet' : base < 600 ? 'Blitz' : 'Rapid';
}
$('#timeChips').addEventListener('click', (e) => {
  const b = e.target.closest('.choice');
  if (!b) return;
  settings.tc = b.dataset.tc; save(); syncSetup(); renderClocks(); renderSideTiles();
});
$('#colorSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  settings.color = b.dataset.color; save(); syncSetup();
});

// ---------------------------------------------------------------- settings sheet
$('#brandLogo').innerHTML = logoSvg();
const media = matchMedia('(prefers-color-scheme: light)');
function applySettings() {
  const ui = settings.ui === 'system' ? (media.matches ? 'light' : 'dark') : settings.ui;
  document.documentElement.dataset.ui = ui;
  document.documentElement.dataset.board = settings.board;
  updateFavicon();  // the tab icon takes the board theme's colour, like the header mark
  const boardSettings = { showLegal: settings.showLegal, showLast: settings.showLast, coords: settings.coords, anim: settings.anim };
  board.setSettings(boardSettings);
  explorer?.board.setSettings({ ...boardSettings, showLegal: false });
  sounds.enabled = settings.sound;
  sounds.volume = settings.volume / 100;
  renderHeaderToggles(ui);
  for (const b of $$('#uiSeg button')) b.classList.toggle('active', b.dataset.ui === settings.ui);
  for (const b of $$('#animSeg button')) b.classList.toggle('active', Number(b.dataset.anim) === settings.anim);
  for (const b of $$('#styleSeg button')) b.classList.toggle('active', b.dataset.style === settings.style);
  for (const b of $$('#paceSeg button')) b.classList.toggle('active', b.dataset.pace === settings.pace);
  for (const b of $$('.theme')) b.classList.toggle('active', b.dataset.board === settings.board);
  $('#optLegal').checked = settings.showLegal;
  $('#optLast').checked = settings.showLast;
  $('#optCoords').checked = settings.coords;
  $('#optQueen').checked = settings.queen;
  if (document.activeElement !== $('#optName')) $('#optName').value = settings.name || '';
  if (document.activeElement !== $('#optRating')) $('#optRating').value = settings.rating || '';
  $('#optCountry').value = settings.country || '';
  $('#optShowMe').checked = settings.showMe;
  $('#optSound').checked = settings.sound;
  $('#optBook').checked = settings.book;
  $('#optInsight').checked = settings.insight;
  $('#optHaptics').checked = settings.haptics;
  $('#optVolume').value = settings.volume;
  $('#optVolume').disabled = !settings.sound;
  if (!settings.insight) $('#insight').hidden = true;
}
media.addEventListener('change', applySettings);

$('#themes').innerHTML = THEMES.map(([id, name]) => `
  <button class="theme" data-board="${id}"><span class="theme-swatch"><i></i><i></i><i></i><i></i></span>${name}</button>`).join('');

function bindSeg(selector, key, parse = (v) => v) {
  $(selector).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[key] = parse(Object.values(b.dataset)[0]);
    save(); applySettings();
  });
}
bindSeg('#uiSeg', 'ui');
bindSeg('#animSeg', 'anim', Number);
bindSeg('#styleSeg', 'style');
bindSeg('#paceSeg', 'pace');
$('#themes').addEventListener('click', (e) => {
  const b = e.target.closest('.theme');
  if (!b) return;
  settings.board = b.dataset.board; save(); applySettings();
});
for (const [id, key] of [['#optLegal', 'showLegal'], ['#optLast', 'showLast'], ['#optCoords', 'coords'], ['#optQueen', 'queen'], ['#optSound', 'sound'], ['#optBook', 'book'], ['#optInsight', 'insight'], ['#optHaptics', 'haptics']]) {
  $(id).addEventListener('change', (e) => {
    settings[key] = e.target.checked; save(); applySettings();
    if (key === 'sound' && settings.sound) sounds.play('moveSelf');
    if (key === 'haptics' && settings.haptics) vibrate(40);
  });
}
$('#optVolume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); applySettings(); });
$('#optVolume').addEventListener('change', () => { save(); sounds.play('moveSelf'); });

// ---------------------------------------------------------------- your name
function setName(value) {
  settings.name = value.trim().slice(0, 20);
  save();
  if (document.activeElement !== $('#optName')) $('#optName').value = settings.name;
  renderPlayers();
}
$('#optName').addEventListener('input', (e) => setName(e.target.value));

// rating and country: optional, and hidden on the bar unless switched on
$('#optCountry').insertAdjacentHTML('beforeend', COUNTRIES.map(([code, name]) => `<option value="${code}">${name}</option>`).join(''));
$('#optRating').addEventListener('input', (e) => {
  const n = Math.round(Number(e.target.value));
  settings.rating = n >= 100 && n <= 3500 ? String(n) : '';
  save(); renderPlayers();
});
$('#optCountry').addEventListener('change', (e) => { settings.country = e.target.value; save(); renderPlayers(); });
$('#optShowMe').addEventListener('change', (e) => {
  settings.showMe = e.target.checked; save(); renderPlayers();
  if (settings.showMe && !settings.rating && !settings.country) toast('Add your rating or country above');
});

// ---------------------------------------------------------------- your photo
// Any image from the computer, centre-cropped to a square and shrunk to 160 px
// in the browser, then kept in this browser only. Nothing is uploaded anywhere.
function renderPhotoControls() {
  const preview = $('#photoPreview');
  preview.innerHTML = photo ? `<img src="${photo}" alt="">` : '<span data-icon="user"></span>';
  hydrateIcons(preview);
  $('#photoPick').textContent = photo ? 'Change' : 'Upload';
  $('#photoRemove').hidden = !photo;
}
function setPhoto(dataUrl) {
  photo = safePhoto(dataUrl);
  try {
    if (photo) localStorage.setItem(PHOTO, photo); else localStorage.removeItem(PHOTO);
  } catch { toast('Could not save the photo in this browser'); }
  renderPhotoControls();
  renderPlayers();
}
async function squarePhoto(file, size = 160) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86);
}
$('#photoPick').addEventListener('click', () => $('#photoFile').click());
$('#photoRemove').addEventListener('click', () => { setPhoto(''); toast('Photo removed'); });
$('#photoFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Choose an image file'); return; }
  try {
    setPhoto(await squarePhoto(file));
    toast('Photo updated');
  } catch {
    toast('That image could not be read');
  }
});
renderPhotoControls();

// Click your name on the player bar to edit it in place: Enter or leaving the
// field keeps it, Escape cancels.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.name-btn');
  if (!btn) return;
  const input = document.createElement('input');
  input.className = 'text-input name-edit';
  input.maxLength = 20;
  input.placeholder = 'Your name';
  input.value = (settings.name || '').trim();
  input.setAttribute('aria-label', 'Your name');
  btn.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    if (keep) setName(input.value);
    $('#playerTop').dataset.key = '';
    renderPlayers();
    if (keep) toast(settings.name ? `Hi, ${settings.name}` : 'Name cleared');
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
    ev.stopPropagation();  // keep board shortcuts out of the field
  });
  input.addEventListener('blur', () => finish(true));
});

// Header: one-tap theme and sound switches, separate from the settings gear.
function renderHeaderToggles(ui) {
  const theme = $('#themeToggle');
  theme.innerHTML = icon(ui === 'dark' ? 'moon' : 'sun');
  theme.setAttribute('aria-label', ui === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  theme.title = `${ui === 'dark' ? 'Light' : 'Dark'} theme (T)`;
  const sound = $('#soundToggle');
  sound.innerHTML = icon(settings.sound ? 'volume' : 'volume-off');
  sound.classList.toggle('off', !settings.sound);
  sound.setAttribute('aria-label', settings.sound ? 'Mute sounds' : 'Turn sounds on');
  sound.title = `${settings.sound ? 'Mute' : 'Unmute'} (M)`;
}
function toggleTheme() {
  settings.ui = document.documentElement.dataset.ui === 'dark' ? 'light' : 'dark';
  save(); applySettings();
}
function toggleSound() {
  settings.sound = !settings.sound;
  save(); applySettings();
  if (settings.sound) sounds.play('moveSelf');
  toast(settings.sound ? 'Sound on' : 'Sound off');
}
$('#themeToggle').addEventListener('click', toggleTheme);
$('#soundToggle').addEventListener('click', toggleSound);

function openSettings(open) {
  $('#settings').classList.toggle('open', open);
  $('#settings').setAttribute('aria-hidden', String(!open));
  $('#scrim').hidden = !open;
}
$('#openSettings').addEventListener('click', () => openSettings(true));
$('#closeSettings').addEventListener('click', () => openSettings(false));
$('#scrim').addEventListener('click', () => { openSettings(false); openHistory(false); });

// ---------------------------------------------------------------- views
let explorer = null;
function route() {
  const [view, slug] = (location.hash.slice(1) || 'play').split('/');
  const name = ['play', 'openings', 'blog', 'about'].includes(view) ? view : 'play';
  for (const v of $$('.view')) v.hidden = v.id !== `view-${name}`;
  // Play and Openings fit the window on desktop (no page scroll); reading pages scroll.
  document.documentElement.classList.toggle('fit', name === 'play' || name === 'openings');
  if (name !== 'play') $('#resultModal').hidden = true;
  for (const a of $$('.nav a')) a.classList.toggle('active', a.dataset.viewLink === name);
  if (name === 'openings' && !explorer) {
    explorer = new Explorer({ engine, sounds, onReady: () => applySettings() });
  }
  if (name === 'about') renderAbout($('#aboutBody'));
  if (name === 'blog') renderBlog($('#blogBody'), slug);
}
addEventListener('hashchange', route);

// ---------------------------------------------------------------- keyboard
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'Escape') {
    openSettings(false);
    openHistory(false);
    $('#resultModal').hidden = true;
    board.select(null);
    return;
  }
  if (e.key === 't' || e.key === 'T') { toggleTheme(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
  if ($('#view-play').hidden || game.status === 'idle') return;
  const map = { ArrowLeft: game.view - 1, ArrowRight: game.view + 1, Home: 0, End: game.plies.length, ArrowUp: 0, ArrowDown: game.plies.length };
  if (e.key in map) { e.preventDefault(); goTo(map[e.key]); }
  if (e.key === 'f' || e.key === 'F') flip();
});

// ---------------------------------------------------------------- boot
hydrateIcons();
applySettings();
syncSetup();
renderSideTiles();
board.setOrientation(settings.color === 'b' ? 'b' : 'w');
showView(0, false);
route();
requestAnimationFrame(() => tick());
window.thielChess = { game, board, engine, analyst, settings, DEPTH, move: userMove }; // handy for debugging in the console
