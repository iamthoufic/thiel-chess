// In-page QA suite. Load the app, then from the console (or a test driver):
//   const qa = await import('/tests/qa.mjs'); await qa.run('rules')
// Sections: boot, settings, play, rules, endings, controls, result, review, explorer
// Each returns { passed, failed: [...] }. Uses instant pace so games move fast.
const T = () => window.thielChess;
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) {
  const t = performance.now();
  while (performance.now() - t < ms) { if (fn()) return true; await sleep(40); }
  return !!fn();
}

let results;
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) }); }

async function newGame(color = 'w', tc = '180+0') {
  const { settings } = T();
  settings.pace = 'instant';
  $('#closeResult')?.click();
  $(`#timeChips [data-tc="${tc}"]`).click();
  $(`#colorSeg [data-color="${color}"]`).click();
  if (T().game.status !== 'idle') { $('#newGameBtn')?.click(); }
  if (!$('#setup').hidden) $('#playBtn').click();
  else { T().game.status = 'idle'; $('#playBtn').click(); }
  await until(() => T().game.status === 'playing');
  if (color === 'b') await until(() => T().game.plies.length === 1 && !T().game.thinking);
}

// Put the running game into an arbitrary position with `you` to move.
function force(fen) {
  const { game, board } = T();
  game.chess.load(fen);
  const fake = { move: { flags: 'n', piece: 'k' }, san: '—', uci: 'a1a1', from: 'a1', to: 'a1', fen, by: 'peter', source: null };
  game.plies = [{ ...fake, by: 'you' }, fake];
  game.view = 2;
  game.thinking = false;
  game.token += 1;
  board.setPosition(fen, { animate: false });
}
const move = (from, to) => T().board.opts.onMove(from, to);
const plies = () => T().game.plies.length;

const SECTIONS = {
  async boot() {
    const { engine, settings } = T();
    check('engine ready', engine.state === 'ready', engine.state);
    check('timing data loaded', !!engine.timing);
    check('opening book loaded', !!engine.book?.mine);
    const broken = [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src.slice(-40));
    check('no broken images', !broken.length, broken.join(', '));
    check('logo renders', $('.logo').naturalWidth > 0);
    check('profile name has a space', $('.profile-name').textContent === 'Peter Thiel', $('.profile-name').textContent);
    check('font is Manrope', getComputedStyle(document.body).fontFamily.includes('Manrope'));
    check('titles use Instrument Serif', getComputedStyle($('.page-title h1')).fontFamily.includes('Instrument Serif') && getComputedStyle($('.wordmark')).fontFamily.includes('Instrument Serif'));
    check('labels use JetBrains Mono', getComputedStyle($('.mono-label')).fontFamily.includes('JetBrains Mono'));
    check('live tiles disabled before a game', $('#askPeter').disabled && $('#resignBtn').disabled && !$('#newTile').disabled);
    const italics = [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).fontStyle === 'italic' && el.textContent.trim());
    check('italics only in the serif display font', italics.every((el) => getComputedStyle(el).fontFamily.includes('Instrument Serif')), italics.map((e) => e.className).join(','));
    check('header has 3 distinct icon buttons', new Set([...document.querySelectorAll('.top-actions .icon-btn svg')].map((s) => s.innerHTML)).size === 3);
    check('play enabled once ready', !$('#playBtn').disabled);
    check('defaults: human pace', settings.pace === 'human' || localStorage.getItem('thiel-chess:settings') !== null, settings.pace);
  },

  async settings() {
    const { settings } = T();
    const key = 'thiel-chess:settings';
    $('#themeToggle').click();
    const ui1 = document.documentElement.dataset.ui;
    $('#themeToggle').click();
    const ui2 = document.documentElement.dataset.ui;
    check('theme toggle flips', ui1 !== ui2, `${ui1} ${ui2}`);
    check('theme saved', JSON.parse(localStorage.getItem(key)).ui === ui2);
    const sound = settings.sound;
    $('#soundToggle').click();
    check('sound toggle flips', settings.sound === !sound);
    check('sound icon shows muted state', $('#soundToggle').classList.contains('off') === !settings.sound);
    $('#soundToggle').click();
    dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    check('T key switches theme', document.documentElement.dataset.ui !== ui2);
    dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    check('M key mutes', settings.sound === !sound);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    for (const b of document.querySelectorAll('#themes .theme')) {
      b.click();
      const ok = document.documentElement.dataset.board === b.dataset.board;
      if (!ok) check(`board theme ${b.dataset.board}`, false);
    }
    check('all 8 board themes apply', document.querySelectorAll('#themes .theme').length === 8);
    document.querySelector('#themes .theme[data-board="green"]').click();
    for (const [id, k] of [['#optLegal', 'showLegal'], ['#optLast', 'showLast'], ['#optCoords', 'coords'], ['#optQueen', 'queen'], ['#optBook', 'book'], ['#optInsight', 'insight'], ['#optHaptics', 'haptics'], ['#optSound', 'sound']]) {
      const el = $(id); const before = settings[k];
      el.click();
      const flipped = settings[k] === !before && JSON.parse(localStorage.getItem(key))[k] === !before;
      el.click();
      check(`toggle ${k} works and saves`, flipped && settings[k] === before);
    }
    for (const seg of ['#paceSeg', '#styleSeg', '#animSeg', '#uiSeg']) {
      const btns = [...document.querySelectorAll(`${seg} button`)];
      btns[btns.length - 1].click();
      const lastActive = btns[btns.length - 1].classList.contains('active');
      btns[0].click();
      check(`segmented ${seg} selects`, lastActive && btns[0].classList.contains('active'));
    }
    $('#paceSeg [data-pace="human"]').click();
    $('#uiSeg [data-ui="dark"]').click();
    $('#animSeg [data-anim="220"]').click();
    $('#styleSeg [data-style="human"]').click();
    $('#coords') ;
    check('coordinates hidden when off', (() => { $('#optCoords').click(); const hidden = $('#board').classList.contains('no-coords'); $('#optCoords').click(); return hidden; })());
  },

  async play() {
    await newGame('w', '180+2');
    const { game } = T();
    check('game starts as white', game.status === 'playing' && game.you === 'w');
    const c0 = { ...game.clock };
    await sleep(600);
    check('clocks wait for the first moves', game.clock.w === c0.w);
    move('e2', 'e4');
    check('your move is recorded', plies() === 1 && game.plies[0].san === 'e4');
    await until(() => plies() === 2 && !game.thinking);
    check('Peter replies', plies() === 2, plies());
    const w1 = game.clock.w;
    await sleep(700);
    check('your clock runs after both moved', game.clock.w < w1, `${w1} -> ${game.clock.w}`);
    const before = game.clock.w;
    move('g1', 'f3');
    check('increment added (3|2)', game.clock.w > before + 1500, `${before} -> ${game.clock.w}`);
    await until(() => plies() === 4 && !game.thinking);
    const n = plies();
    move('a2', 'a5');
    check('illegal move rejected', plies() === n);
    check('Peter book reply marked', game.plies.slice(1).some((p) => p.by === 'peter' && p.source === 'book'));
    await newGame('b');
    check('as black Peter opens', game.plies[0]?.by === 'peter' && game.you === 'b', game.plies.map((p) => p.san).join(' '));
    check('board flipped for black', T().board.orientation === 'b');
  },

  async rules() {
    const { game, settings } = T();
    await newGame('w');
    force('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    move('e1', 'g1');
    check('kingside castling', game.chess.get('g1')?.type === 'k' && game.chess.get('f1')?.type === 'r');
    await newGame('w');
    force('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    move('e1', 'c1');
    check('queenside castling', game.chess.get('c1')?.type === 'k' && game.chess.get('d1')?.type === 'r');
    await newGame('w');
    force('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    move('e5', 'd6');
    check('en passant removes the pawn', game.chess.get('d6')?.type === 'p' && !game.chess.get('d5'));
    await newGame('w');
    settings.queen = false;
    force('8/1P4k1/8/8/8/8/8/K7 w - - 0 1');
    move('b7', 'b8');
    await sleep(120);
    const picker = [...document.querySelectorAll('.promo button')].map((b) => b.dataset.p).join('');
    check('promotion picker offers Q N R B', picker.includes('qnrb') || picker.includes('bnrq') || picker.replace(/[^qnrb]/g, '').length === 4, picker);
    document.querySelector('.promo [data-p="n"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await sleep(120);
    check('under-promotion to knight', game.chess.get('b8')?.type === 'n');
    await newGame('w');
    settings.queen = true;
    force('8/1P4k1/8/8/8/8/8/K7 w - - 0 1');
    move('b7', 'b8');
    check('auto-queen skips the picker', game.chess.get('b8')?.type === 'q' && !document.querySelector('.promo'));
    settings.queen = false;
  },

  async endings() {
    const { game } = T();
    const ends = [
      ['checkmate', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', ['a1', 'a8'], 'You won!', 'by checkmate'],
      ['stalemate', 'k7/8/1Q6/8/8/8/8/7K w - - 0 1', ['h1', 'g1'], 'Draw', 'by stalemate'],
      ['insufficient material', '8/8/4k3/8/8/8/1p6/K7 w - - 0 1', ['a1', 'b2'], 'Draw', 'by insufficient material'],
    ];
    for (const [name, fen, [f, t], title, reason] of ends) {
      await newGame('w');
      force(fen);
      move(f, t);
      await until(() => game.status === 'over');
      await sleep(750);
      check(`${name} ends the game`, game.status === 'over' && $('#resultTitle').textContent === title && $('#resultReason').textContent === reason,
        `${game.status} ${$('#resultTitle').textContent} / ${$('#resultReason').textContent}`);
    }
    // threefold: shuffle knights from the start position, you play the move that repeats it
    await newGame('b');
    const { Chess } = await import('../vendor/chess.js');
    const c = new Chess();
    const seq = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1'];
    game.chess = c;
    game.plies = seq.map((u, i) => {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
      return { move: m, san: m.san, uci: u, from: m.from, to: m.to, fen: c.fen(), by: i % 2 ? 'you' : 'peter', source: null };
    });
    game.view = game.plies.length; game.token += 1; game.thinking = false;
    move('f6', 'g8');
    await until(() => game.status === 'over');
    check('threefold repetition', $('#resultReason').textContent === 'by repetition', $('#resultReason').textContent);
    // flag with mating material left -> loss on time
    await newGame('w');
    force('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    game.clock.w = 150;
    await until(() => game.status === 'over', 3000);
    check('losing on time', $('#resultReason').textContent === 'on time' && $('#resultTitle').textContent === 'Peter won', $('#resultReason').textContent);
    // flag against a bare king -> draw
    await newGame('w');
    force('8/8/4k3/8/8/8/1P6/K7 w - - 0 1');
    game.clock.w = 150;
    await until(() => game.status === 'over', 3000);
    check('timeout vs insufficient material is a draw', $('#resultReason').textContent === 'timeout vs insufficient material', $('#resultReason').textContent);
  },

  async controls() {
    const { game } = T();
    await newGame('w');
    move('e2', 'e4');
    await until(() => plies() === 2 && !game.thinking);
    $('#takebackBtn').click();
    check('takeback undoes your move and his reply', plies() === 0 && game.chess.turn() === 'w', plies());
    T().settings.pace = 'relaxed';
    move('d2', 'd4');
    await sleep(80);
    const thinking = game.thinking;
    $('#takebackBtn').click();
    check('takeback while he thinks undoes only yours', thinking && plies() === 0 && !game.thinking, `${thinking} ${plies()}`);
    T().settings.pace = 'instant';
    $('#drawBtn').click();
    check('early draw offer declined', game.status === 'playing' && /declined/i.test($('#toast').textContent), $('#toast').textContent);
    move('e2', 'e4');
    await until(() => plies() === 2 && !game.thinking);
    $('#askPeter').click();
    await until(() => $('#insightTitle').textContent === 'Peter would play');
    check('Ask Peter shows his choice', $('#insightTitle').textContent === 'Peter would play' && T().board.arrows.size === 1);
    $('#resignBtn').click();
    check('resign asks to confirm', $('#resignBtn .label').textContent === 'Confirm resign' && game.status === 'playing');
    $('#resignBtn').click();
    await sleep(800);
    check('resign ends the game', game.status === 'over' && $('#resultReason').textContent === 'You resigned');
  },

  async result() {
    const { game } = T();
    await newGame('w');
    force('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    move('a1', 'a8');
    await until(() => !$('#resultModal').hidden, 3000);
    check('result card opens', !$('#resultModal').hidden);
    check('winner gets the crown', $('#rpYou').classList.contains('winner') && !$('#rpPeter').classList.contains('winner'));
    check('crown visible', getComputedStyle($('#rpYou .rp-crown')).display !== 'none');
    check('score shown', $('#resultScore').textContent === '1 – 0');
    check('New button names the time control', $('#modalNewLabel').textContent === 'New 3 min', $('#modalNewLabel').textContent);
    let copied = null;
    const orig = navigator.clipboard.writeText;
    navigator.clipboard.writeText = async (t) => { copied = t; };
    $('#modalPgn').click();
    await sleep(80);
    navigator.clipboard.writeText = orig;
    check('Copy PGN copies a valid PGN', copied && copied.includes('[Result "1-0"]') && copied.includes('Ra8#'), copied?.slice(-60));
    check('Copy PGN shows confirmation', $('#modalPgn').textContent.includes('Copied'));
    const youBefore = game.you;
    $('#modalRematch').click();
    await until(() => game.status === 'playing');
    check('rematch swaps colours', game.you !== youBefore && $('#resultModal').hidden, `${youBefore} -> ${game.you}`);
    await until(() => !game.thinking);
    $('#resignBtn').click(); $('#resignBtn').click();
    await until(() => !$('#resultModal').hidden, 3000);
    $('#modalNew').click();
    await until(() => game.status === 'playing');
    check('New game starts immediately', game.status === 'playing' && $('#resultModal').hidden);
  },

  async review() {
    const { game, analyst } = T();
    await newGame('w');
    for (const [f, t] of [['e2', 'e4'], ['g1', 'f3'], ['d2', 'd4'], ['f3', 'd4'], ['b1', 'c3']]) {
      await until(() => game.chess.turn() === 'w' && !game.thinking);
      const m = game.chess.moves({ verbose: true }).find((x) => x.from === f && x.to === t) ?? game.chess.moves({ verbose: true })[0];
      move(m.from, m.to);
      await sleep(250);
    }
    await until(() => game.chess.turn() === 'w' && !game.thinking);
    check('Stockfish analyses while you play', analyst.cache.size >= 3, analyst.cache.size);
    check('no ratings in the move list during play', !document.querySelector('#moves .q'));
    check('no badge on the board during play', !document.querySelector('#board .move-badge'));
    check('no coach card during play', $('#coach').hidden);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await sleep(100);
    check('stepping back mid-game shows no rating', game.view === game.plies.length - 1 && !document.querySelector('#board .move-badge'));
    dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    $('#resignBtn').click(); $('#resignBtn').click();
    await until(() => !$('#resultModal').hidden, 3000);
    await until(() => game.plies.every((p) => p.review), 20000);
    const kinds = game.plies.map((p) => `${p.san}:${p.review?.kind ?? '-'}`).join(' ');
    check('every move is rated once the game ends', game.plies.every((p) => p.review), kinds);
    check('opening moves rated as book', game.plies.some((p) => p.review?.kind === 'book'), kinds);
    check('result card shows three counts', document.querySelectorAll('#tally .tally-chip').length === 3);
    check('result card shows accuracy', /Accuracy \d/.test($('#rpAccYou').textContent), $('#rpAccYou').textContent);
    check('Peter comments on the game', $('#resultSay').textContent.length > 20, $('#resultSay').textContent);
    $('#modalReview').click();
    await sleep(200);
    check('Game Review starts at the first move', game.view === 1 && $('#resultModal').hidden && game.reviewing);
    check('review shows the coach and accuracy', !$('#coach').hidden && !$('#accStrip').hidden && $('#coachLine').textContent.includes(game.plies[0].san));
    check('ratings appear in the move list', document.querySelectorAll('#moves .q').length === game.plies.length);
    check('badge on the board in review', !!document.querySelector('#board .move-badge'));
  },

  async explorer() {
    location.hash = 'openings';
    await until(() => document.querySelectorAll('#explorerList .xrow').length > 0);
    const first = $('#explorerList .xrow');
    check('explorer lists his first moves', first?.dataset.san === 'e4', first?.dataset.san);
    first.click();
    await sleep(100);
    check('clicking a move walks the tree', $('#explorerPath .crumb')?.textContent === 'e4');
    $('#explorerList .xrow')?.click();
    await sleep(100);
    $('#explorerBack').click();
    await sleep(80);
    check('Back steps up one move', document.querySelectorAll('#explorerPath .crumb').length === 1);
    $('#explorerReset').click();
    await sleep(80);
    check('Start resets', !document.querySelector('#explorerPath .crumb'));
    $('#explorerSide [data-side="b"]').click();
    await sleep(100);
    check('As Black shows replies to 1.e4', /Their reply/.test($('#explorerList .xhead')?.textContent ?? ''));
    location.hash = 'about';
    await until(() => !!document.querySelector('.metric-table'), 3000);
    check('About shows accuracy table', /62\.\d%/.test($('.metric-table')?.textContent ?? ''), $('.metric-table')?.textContent.slice(0, 80));
    location.hash = 'play';
    await sleep(100);
  },
};

SECTIONS.blog = async () => {
  location.hash = 'blog';
  await until(() => document.querySelectorAll('.post-card').length === 6);
  check('blog lists six articles', document.querySelectorAll('.post-card').length === 6);
  const series = [...document.querySelectorAll('.post-card')].slice(0, 3).map((c) => c.querySelector('.post-by b').textContent);
  check('build series is by Mohamed Thoufic', series.every((n) => n === 'Mohamed Thoufic'), series.join(', '));
  for (const slug of ['collecting-the-data', 'training-maia', 'building-the-app', 'how-to-play', 'history', 'peter-thiel']) {
    location.hash = `blog/${slug}`;
    await until(() => document.querySelector(`#toc a[href="#blog/${slug}"]`));
    const h2 = document.querySelectorAll('#blogBody .article h2').length;
    const toc = document.querySelectorAll('#toc a').length;
    check(`${slug}: renders with contents`, h2 >= 5 && toc === h2, `${h2} sections, ${toc} links`);
  }
  location.hash = 'blog/training-maia';
  await until(() => document.querySelector('#toc a[href="#blog/training-maia"]'));
  check('training article has its chart and code', !!document.querySelector('#blogBody .chart svg polyline') && document.querySelectorAll('#blogBody .bar.after').length === 5 && !!document.querySelector('#blogBody pre.code'));
  check('series links to all three parts', document.querySelectorAll('#blogBody .series a').length === 3);
  location.hash = 'blog/how-to-play';
  await until(() => document.querySelectorAll('[data-diagram]').length === 6);
  check('six live diagrams', document.querySelectorAll('[data-diagram] .piece').length > 0 && document.querySelectorAll('[data-diagram]').length === 6);
  const counts = {};
  for (const p of ['K', 'Q', 'R', 'B', 'N', 'P']) {
    document.querySelector(`.piece-tabs [data-p="${p}"]`).click();
    counts[p] = document.querySelectorAll('[data-diagram="pieces"] .dot, [data-diagram="pieces"] .ring').length;
  }
  check('piece explorer shows correct move counts from d4/d2', counts.K === 8 && counts.Q === 27 && counts.R === 14 && counts.B === 13 && counts.N === 8 && counts.P === 2, JSON.stringify(counts));
  for (const kind of ['castle', 'enpassant', 'promote', 'mate']) {
    const fig = document.querySelector(`[data-diagram="${kind}"]`);
    const before = [...fig.querySelectorAll('.piece')].length;
    fig.querySelector('.show-me').click();
    await sleep(400);
    const changed = fig.querySelector('.show-me').textContent === 'Reset';
    const after = [...fig.querySelectorAll('.piece')].length;
    fig.querySelector('.show-me').click();
    await sleep(800); // let replaced pieces finish fading out
    check(`${kind}: Show me plays the move and Reset restores it`, changed && fig.querySelectorAll('.piece').length === before, `${before} -> ${after}`);
  }
  location.hash = 'play';
  await sleep(100);
};

export async function run(section) {
  results = [];
  try { await SECTIONS[section](); } catch (e) { check(`${section} crashed`, false, e?.stack ?? e); }
  const failed = results.filter((r) => !r.ok);
  return { section, passed: results.length - failed.length, total: results.length, failed };
}
