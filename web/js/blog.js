// Blog: a list of articles and an article reader, in the layout of the
// Quantum Chess blog. The rules article carries live mini boards.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { icon } from './icons.js';
import { imageUrl, pieceUrl } from './assets.js';
import { AUTHOR, BUILD_ARTICLES } from './blog-build.js';

const PUBLISHED = '27 October 2026';

const ARTICLES = [
  ...BUILD_ARTICLES,
  {
    slug: 'peter-thiel',
    no: '03',
    tags: 'Biography',
    title: 'Peter Thiel: <em>a life in moves</em>',
    plain: 'Peter Thiel: a life in moves',
    dek: 'A junior chess master who became one of Silicon Valley\'s most influential, and most argued-about, investors.',
    body: () => `
      <h2 id="early-years">A childhood on the move</h2>
      <p>Peter Andreas Thiel was born on <b>11 October 1967 in Frankfurt</b>, in what was then West Germany. His family moved to the United States when he was an infant, then in 1971 to southern Africa, living in South Africa and in South West Africa, today's Namibia. He changed elementary schools seven times, and for two years attended a strict German-language school in Swakopmund, on the Namibian coast.</p>
      <p>In 1977 the family settled in <b>Foster City, California</b>, a planned town on the edge of San Francisco Bay. It is the backdrop for the rest of the story.</p>

      <h2 id="chess">The chess years</h2>
      <p>Thiel learned chess at six and took to it seriously. As a teenager he was <b>one of the strongest junior players in the United States</b>, and he went on to reach master strength: his FIDE rating stands at 2199, a point short of the Candidate Master title. Sources disagree on the exact US Chess title he holds, with some listing National Master and others Life Master. He has not played competitive chess since 2003.</p>
      <div class="callout"><b>A note on this site.</b> Peter, the opponent you play here, is trained on the Chess.com account <b>PeterThiel</b>. That account has not been verified as belonging to Peter Thiel, so treat Peter as a portrait of that account's play, not as a confirmed likeness of the man.</div>

      <h2 id="stanford">Stanford</h2>
      <p>He studied <b>philosophy at Stanford</b>, graduating in 1989, and was drawn to the thinker René Girard, whose idea that people learn what to want by imitating each other would shape how Thiel later talked about competition. In 1987 he co-founded <b>The Stanford Review</b>, a conservative and libertarian student paper, and served as its first editor-in-chief. He stayed on for law school and earned his J.D. in 1992.</p>

      <h2 id="law-and-finance">Law, then finance</h2>
      <p>After law school he clerked for Judge James Larry Edmondson on the U.S. Court of Appeals for the Eleventh Circuit, then joined the New York firm <b>Sullivan &amp; Cromwell</b> as a securities lawyer. He left in under a year. In 1993 he became a derivatives trader in currency options at <b>Credit Suisse</b>, while also writing speeches for former Secretary of Education William Bennett.</p>
      <p>In 1996 he returned to California and, with money from friends and family, started <b>Thiel Capital Management</b>.</p>

      <h2 id="paypal">PayPal</h2>
      <p>In 1998 Luke Nosek introduced him to Max Levchin, who had an idea for a cryptography company. Thiel put in the first $100,000. The venture, first called Fieldlink and then Confinity, became <b>PayPal</b>, with Thiel as chief executive. In 2002 it was sold to <b>eBay for $1.5 billion</b>. Several early PayPal people went on to found or fund other major companies, a group the press nicknamed the "PayPal Mafia".</p>

      <h2 id="investor">The investor</h2>
      <ul class="timeline">
        <li><span class="when">2002</span>Founds <b>Clarium Capital</b>, a global macro hedge fund in San Francisco.</li>
        <li><span class="when">2003</span>Launches <b>Palantir</b>, a data-analysis company, and becomes its chairman.</li>
        <li><span class="when">August 2004</span>Becomes <b>Facebook's first outside investor</b>, paying $500,000 for a 10.2% stake.</li>
        <li><span class="when">2005</span>Starts <b>Founders Fund</b> with PayPal partners Ken Howery and Luke Nosek.</li>
        <li><span class="when">2010 to 2012</span>Co-founds Valar Ventures and Mithril Capital.</li>
      </ul>

      <h2 id="ideas">Ideas: fellowships and Zero to One</h2>
      <p>On 29 September 2010 he created the <b>Thiel Fellowship</b>, which pays young people under 23 to leave college and build something instead: originally $100,000 over two years, raised to $200,000 in 2025.</p>
      <p>In spring 2012 he taught a course on startups at Stanford. A student, Blake Masters, published his notes, which became the book <b>Zero to One</b>, written with Masters and released in September 2014. Its central argument is that the best companies avoid competition by building something genuinely new, rather than fighting over an existing market.</p>

      <h2 id="public-life">Public life</h2>
      <p>Thiel is also a political figure, and a divisive one. He is a major donor to conservative causes, and spoke at the <b>2016 Republican National Convention</b>, where he told the hall he was proud to be gay, a Republican and an American. He financed the lawsuit that led to the collapse of the news site Gawker in 2016, and his New Zealand citizenship, granted in 2011, became controversial when it was made public in 2017. He married Matt Danzeisen in 2017.</p>

      <h2 id="board">What the board leaves behind</h2>
      <p>Chess rewards exactly the habits his career is known for: thinking several moves ahead, preferring positions others overlook, and being willing to stand alone on a judgement. Whether or not the PeterThiel account is his, its games show a consistent player: 1.e4 in almost every game with White, the Sicilian against 1.e4, and a fast, practical blitz style. That is the player you face on the Play page.</p>

      <p class="sources">Sources: <a href="https://en.wikipedia.org/wiki/Peter_Thiel" target="_blank" rel="noreferrer">Wikipedia</a>, <a href="https://www.chessgames.com/player/peter_thiel.html" target="_blank" rel="noreferrer">chessgames.com</a>, <a href="https://en.chessbase.com/post/win-a-che-match-earn-a-1-000-000-for-your-startup/4" target="_blank" rel="noreferrer">ChessBase</a>.</p>`,
  },
  {
    slug: 'history',
    no: '02',
    tags: 'History',
    title: 'From chaturanga to <em>Deep Blue</em>: a short history of chess',
    plain: 'From chaturanga to Deep Blue: a short history of chess',
    dek: 'Fifteen centuries, four continents, and one rule change that turned the queen into the strongest piece on the board.',
    body: () => `
      <h2 id="india">An Indian army in miniature</h2>
      <p>The oldest known ancestor of chess is <b>chaturanga</b>, played in India by around the 6th century. Its name refers to the four divisions of an ancient army, and they are still on your board: infantry became pawns, cavalry became knights, elephants became bishops and chariots became rooks. A king and his counsellor stood in the middle.</p>

      <h2 id="persia">Persia gives us "checkmate"</h2>
      <p>The game travelled west to Persia as <b>shatranj</b>. When a player trapped the opposing king they announced <i>shāh māt</i>, roughly "the king is helpless", and that phrase survives in almost every European language as checkmate. Shatranj was slow by modern standards: the counsellor moved one square diagonally and the elephant hopped exactly two. With the expansion of the Islamic world the game spread across the Middle East and North Africa, where strong players wrote down problems and openings for the first time.</p>

      <h2 id="europe">Into Europe</h2>
      <p>Chess reached Europe through Spain, Sicily and Byzantium, and by the 13th century it was played from Scandinavia to the Mediterranean. In 1283 King Alfonso X of Castile commissioned a richly illustrated book of games in which chess takes pride of place.</p>

      <h2 id="mad-queen">The queen's revolution</h2>
      <p>The biggest change came at the end of the 15th century in Spain and Italy. The counsellor became the <b>queen</b> and could suddenly move any distance in any direction; the bishop gained its long diagonals. Contemporaries called it <i>the chess of the mad queen</i>. Games became faster and sharper, opening theory began in earnest, and printed manuals followed within years. Castling and the pawn's two-square first move settled in over the next century or so, giving us the game played today.</p>

      <h2 id="champions">Coffee houses and world champions</h2>
      <p>For centuries the strongest chess was played in cafés and clubs, such as the Café de la Régence in Paris. The first international tournament was held in London in 1851, and Nathaniel Cook's design for standard pieces, promoted by the English champion Howard Staunton, made them recognisable everywhere. In <b>1886 Wilhelm Steinitz beat Johannes Zukertort</b> in the first match generally recognised as being for the World Championship.</p>
      <p>The world federation, <b>FIDE</b>, was founded in Paris in 1924. In the decades that followed, the Soviet Union dominated, which made Bobby Fischer's victory over Boris Spassky in Reykjavík in 1972 a Cold War event as much as a chess one.</p>

      <h2 id="machines">The machines arrive</h2>
      <p>Alan Turing wrote a chess program around 1950, before there was a computer able to run it, and worked through its moves by hand. Half a century later, in <b>1997, IBM's Deep Blue defeated world champion Garry Kasparov</b> 3½ to 2½ in a six-game match. Since then engines have far surpassed people; in 2017 AlphaZero learned the game from scratch by playing itself.</p>
      <p>A different line of research asks not "what is the best move?" but <b>"what would a person play?"</b> That is the idea behind <b>Maia</b>, from the University of Toronto, trained to predict human moves at each rating level. Peter, your opponent on this site, is a version of Maia-2 trained further on one account's games.</p>

      <h2 id="today">Chess today</h2>
      <p>The game has never been more widely played. Online play, blitz and bullet time controls, streamers, and the success of the 2020 series <i>The Queen's Gambit</i> brought in millions of new players. The rules have barely changed in five hundred years; how, where and how fast we play keeps changing.</p>

      <ul class="timeline">
        <li><span class="when">c. 6th century</span><b>Chaturanga</b> is played in India.</li>
        <li><span class="when">Middle Ages</span><b>Shatranj</b> spreads through Persia and the Islamic world.</li>
        <li><span class="when">1283</span>Alfonso X's illustrated book of games.</li>
        <li><span class="when">Late 1400s</span>The <b>modern queen and bishop</b> appear in Spain and Italy.</li>
        <li><span class="when">1851</span>First international tournament, London.</li>
        <li><span class="when">1886</span><b>Steinitz</b> becomes the first official world champion.</li>
        <li><span class="when">1924</span><b>FIDE</b> is founded in Paris.</li>
        <li><span class="when">1997</span><b>Deep Blue</b> beats Kasparov.</li>
        <li><span class="when">2020 to now</span>Human-style models such as <b>Maia</b>; the online boom.</li>
      </ul>
      <p class="sources">Sources: <a href="https://en.wikipedia.org/wiki/History_of_chess" target="_blank" rel="noreferrer">Wikipedia: History of chess</a>, <a href="https://www.historyhit.com/who-invented-chess-and-when/" target="_blank" rel="noreferrer">History Hit</a>, <a href="https://www.houseofstaunton.com/history-of-chess" target="_blank" rel="noreferrer">House of Staunton</a>, <a href="https://github.com/CSSLab/maia2" target="_blank" rel="noreferrer">Maia-2</a>.</p>`,
  },
  {
    slug: 'how-to-play',
    no: '01',
    tags: 'Rules · Beginners',
    title: 'How to play <em>chess</em>, from the first move to checkmate',
    plain: 'How to play chess, from the first move to checkmate',
    dek: 'Everything you need to play a full game: the board, how each piece moves, the special rules people forget, and how a game ends.',
    body: () => `
      <h2 id="goal">The goal</h2>
      <p>Chess is played by two people, White and Black, on a board of 64 squares. <b>You win by checkmating your opponent's king</b>: attacking it so that it has no way to escape. The king is never actually captured; the game ends the moment it is trapped.</p>

      <h2 id="setup">The board and the setup</h2>
      <p>Turn the board so that each player has a <b>light square in the right-hand corner</b>. The columns are called <b>files</b> (a to h) and the rows are <b>ranks</b> (1 to 8). Pawns fill each player's second rank. Behind them, from the corners in: rooks, knights, bishops, and in the middle the queen and king. The queen starts on her own colour: the white queen on a light square, the black queen on a dark one. <b>White always moves first</b>, and then players alternate, one move each.</p>
      <figure class="figure" data-diagram="setup"><div class="mini"><div class="board"></div></div>
        <figcaption><b>Starting position</b>Light square on the right, queen on her own colour, White to move.</figcaption></figure>

      <h2 id="pieces">How the pieces move</h2>
      <p>Pick a piece to see every square it can reach from the middle of the board. Pieces cannot move through other pieces (except the knight), and they capture by moving onto a square occupied by an opposing piece.</p>
      <figure class="figure" data-diagram="pieces"><div class="mini"><div class="board"></div></div>
        <figcaption><div class="segmented piece-tabs"></div><b class="piece-name"></b><span class="piece-text"></span></figcaption></figure>
      <div class="piece-grid">
        ${[['wK', 'King', 'Priceless'], ['wQ', 'Queen', '9 points'], ['wR', 'Rook', '5 points'], ['wB', 'Bishop', '3 points'], ['wN', 'Knight', '3 points'], ['wP', 'Pawn', '1 point']]
          .map(([c, n, v]) => `<div class="piece-card"><img src="${pieceUrl(c)}" alt=""><div><b>${n}</b><small>${v}</small></div></div>`).join('')}
      </div>
      <p>The point values are a rough guide for trades: giving up a knight (3) to win a rook (5) is usually good business.</p>

      <h2 id="special">Three special moves</h2>
      <h3>Castling</h3>
      <p>Once per game, the king moves two squares toward a rook, and that rook jumps to the square the king crossed. It tucks the king away and brings the rook into play. You may castle only if <b>neither piece has moved</b>, the squares between them are empty, and the king is <b>not in check, does not pass through an attacked square, and does not land on one</b>.</p>
      <figure class="figure" data-diagram="castle"><div class="mini"><div class="board"></div></div>
        <figcaption><b>Castling kingside</b>King from e1 to g1, rook from h1 to f1. Written <span class="mono-label">O-O</span>.<br><button class="btn btn-secondary show-me">Show me</button></figcaption></figure>
      <h3>En passant</h3>
      <p>If a pawn moves two squares and lands beside an enemy pawn, that enemy pawn may capture it <b>as if it had moved only one square</b>, but only on the very next move.</p>
      <figure class="figure" data-diagram="enpassant"><div class="mini"><div class="board"></div></div>
        <figcaption><b>En passant</b>Black has just played d7 to d5. White's pawn on e5 captures it by moving to d6.<br><button class="btn btn-secondary show-me">Show me</button></figcaption></figure>
      <h3>Promotion</h3>
      <p>A pawn that reaches the far side of the board <b>turns into a queen, rook, bishop or knight</b>, whichever you choose. Almost everyone picks a queen.</p>
      <figure class="figure" data-diagram="promote"><div class="mini"><div class="board"></div></div>
        <figcaption><b>Promotion</b>The pawn on b7 steps to b8 and becomes a queen.<br><button class="btn btn-secondary show-me">Show me</button></figcaption></figure>

      <h2 id="check">Check, checkmate and stalemate</h2>
      <p>A king that is attacked is <b>in check</b>, and you must get out of it at once: move the king, block the attack, or capture the attacker. You may never make a move that leaves your own king in check. If there is no way out, it is <b>checkmate</b> and the game is over.</p>
      <figure class="figure" data-diagram="mate"><div class="mini"><div class="board"></div></div>
        <figcaption><b>Back-rank mate</b>Black's king is boxed in by its own pawns. Rook to a8 is check, and there is no escape.<br><button class="btn btn-secondary show-me">Show me</button></figcaption></figure>
      <p>If the player to move is <b>not in check but has no legal move</b>, it is <b>stalemate</b>, and the game is a draw. It is the classic way to throw away a won position, so leave the losing king a square to breathe.</p>

      <h2 id="endings">How games end</h2>
      <ul>
        <li><b>Checkmate</b>: the side delivering it wins.</li>
        <li><b>Resignation</b>: a player gives up, usually in a hopeless position.</li>
        <li><b>Time</b>: with a clock, running out of time loses, unless the opponent has too little material to ever checkmate, which makes it a draw.</li>
        <li><b>Draws</b>: stalemate; agreement between the players; the same position occurring three times; fifty moves by each side with no capture or pawn move; or too little material left to checkmate (such as king against king).</li>
      </ul>

      <h2 id="notation">Reading chess notation</h2>
      <p>Moves are written with the piece's letter and the square it moves to. Pawns have no letter.</p>
      <table class="notation-table">
        <thead><tr><th>Symbol</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>K Q R B N</td><td>King, queen, rook, bishop, knight (N, because K is taken)</td></tr>
          <tr><td>e4</td><td>A pawn moves to e4</td></tr>
          <tr><td>Nf3</td><td>A knight moves to f3</td></tr>
          <tr><td>x</td><td>A capture, as in Bxc6</td></tr>
          <tr><td>+ / #</td><td>Check / checkmate</td></tr>
          <tr><td>O-O / O-O-O</td><td>Castling kingside / queenside</td></tr>
          <tr><td>e8=Q</td><td>A pawn promotes to a queen</td></tr>
        </tbody>
      </table>
      <p>So <span class="mono-label">1.e4 c5 2.Nf3</span> means: White moves a pawn to e4, Black answers with a pawn to c5, and White brings a knight to f3. That is the Sicilian Defence, which Peter plays in thousands of his games.</p>

      <h2 id="habits">Five habits that win games</h2>
      <ol>
        <li><b>Fight for the centre.</b> Pawns and pieces on e4, d4, e5 and d5 control the most of the board.</li>
        <li><b>Develop your pieces.</b> Bring out knights and bishops before moving the queen far.</li>
        <li><b>Castle early.</b> A king in the middle is a target.</li>
        <li><b>Don't waste moves.</b> Move each piece once in the opening unless there is a reason.</li>
        <li><b>Ask "what does my opponent want?"</b> before every move. Most games between beginners are decided by a piece left undefended.</li>
      </ol>

      <h2 id="practice">Practise against Peter</h2>
      <p>The fastest way to learn is to play. Set the clock to <b>Unlimited</b> and the move speed to <b>Relaxed</b> in Settings, use <b>Ask Peter</b> when you're stuck, and step back through the game afterwards to see which moves were rated well.</p>`,
  },
];

const minutes = (a) => Math.max(3, Math.round(a.body().replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 220));

// Every article is published under the site owner's name and avatar.
const authorName = () => AUTHOR.name;
const avatar = () => `<img class="author-av" src="${imageUrl('img/me/thoufic.jpg')}" alt="">`;

function byline(a) {
  return `${avatar(a)}<div class="post-by"><b>${authorName(a)}</b><small>${PUBLISHED} · ${minutes(a)} min read</small></div>`;
}

// "Building Thiel Chess" articles link to each other as a three-part series.
function seriesNav(a) {
  if (!a.part) return '';
  const parts = ARTICLES.filter((x) => x.part).sort((x, y) => x.part - y.part);
  return `<div class="series">Series ${parts.map((x) => `<a href="#blog/${x.slug}" class="${x === a ? 'cur' : ''}">Part ${x.part}</a>`).join(' · ')}</div>`;
}

function renderIndex(el) {
  el.innerHTML = `
    <div class="blog-index">
      <header class="blog-head">
        <h1>Notes from the board</h1>
        <div class="eyebrow-it">Blog</div>
        <p>How I built this project, from the raw data to the model in your browser; how to play the game; where it came from; and the story of the player it is built around.</p>
      </header>
      ${ARTICLES.map((a) => `
        <a class="post-card" href="#blog/${a.slug}">
          <div class="post-meta"><span class="post-no">Article ${a.no}</span><span>${PUBLISHED}</span><span>${minutes(a)} min read</span></div>
          <h2 class="post-title">${a.title}</h2>
          <p class="post-dek">${a.dek}</p>
          <div class="post-foot">${byline(a)}<span class="post-read">Read article ${icon('arrow-right')}</span></div>
        </a>`).join('')}
    </div>`;
}

function renderArticle(el, a) {
  el.innerHTML = `
    <div class="article-wrap">
      <aside class="toc-side"><div class="toc-title">Contents</div><nav class="toc" id="toc"></nav></aside>
      <article class="article">
        <a class="back-link" href="#blog">${icon('arrow-left')}All articles</a>
        <div class="kicker">Article ${a.no} · ${a.tags}</div>
        <h1>${a.title}</h1>
        <p class="dek">${a.dek}</p>
        ${seriesNav(a)}
        <div class="byline">${avatar(a)}<div><span class="mono-label">Published by</span><b>${authorName(a)}</b><small>${PUBLISHED} · ${minutes(a)} min read</small></div></div>
        ${a.body()}
        <div class="article-end">
          ${a.part && a.part < 3 ? `<a class="btn btn-primary" href="#blog/${ARTICLES.find((x) => x.part === a.part + 1).slug}">Read part ${a.part + 1}</a>` : '<a class="btn btn-primary" href="#play">Play Peter</a>'}
          <a class="btn btn-secondary" href="#blog">All articles</a>
        </div>
      </article>
    </div>`;
  const headings = [...el.querySelectorAll('.article h2[id]')];
  // prefix heading ids so they can never collide with the app's own ids (#board, #setup...)
  for (const h of headings) h.id = `a-${h.id}`;
  const toc = el.querySelector('#toc');
  toc.innerHTML = headings.map((h) => `<a href="#blog/${a.slug}" data-target="${h.id}">${h.textContent}</a>`).join('');
  toc.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    document.getElementById(link.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // highlight the section being read
  const links = new Map([...toc.querySelectorAll('a')].map((l) => [l.dataset.target, l]));
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const l of links.values()) l.classList.remove('active');
      links.get(entry.target.id)?.classList.add('active');
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  headings.forEach((h) => spy.observe(h));
  mountDiagrams(el);
}

// ---------------------------------------------------------------- diagrams
const PIECES = {
  K: ['King', 'One square in any direction. It can never move into check, so keep it safe behind its pawns.'],
  Q: ['Queen', 'Any number of squares in a straight line or along a diagonal: a rook and a bishop combined.'],
  R: ['Rook', 'Any number of squares along a file or a rank. Rooks love open files and the seventh rank.'],
  B: ['Bishop', 'Any number of squares diagonally. Each bishop stays on its starting colour all game.'],
  N: ['Knight', 'An L-shape: two squares one way, then one square to the side. The only piece that jumps over others.'],
  P: ['Pawn', 'Forward one square, or two on its first move. It captures one square diagonally forward.'],
};
const DIAGRAMS = {
  setup: { fen: new Chess().fen() },
  castle: { fen: 'r3k2r/pppq1ppp/2npbn2/4p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 0 8', move: { from: 'e1', to: 'g1' } },
  enpassant: { fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', move: { from: 'e5', to: 'd6' } },
  promote: { fen: '6k1/1P6/8/8/8/8/6PP/6K1 w - - 0 1', move: { from: 'b7', to: 'b8', promotion: 'q' } },
  mate: { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', move: { from: 'a1', to: 'a8' } },
};

function pieceFen(type) {
  // the piece alone on d4 (pawns on d2 so their first move shows), both kings parked out of the way
  const board = [...Array(8)].map(() => Array(8).fill(''));
  const [r, f] = type === 'P' ? [6, 3] : [4, 3];
  board[r][f] = type;
  if (type !== 'K') { board[7][7] = 'K'; }
  board[0][0] = 'k';
  const rows = board.map((row) => {
    let s = ''; let empty = 0;
    for (const c of row) { if (c) { if (empty) s += empty; empty = 0; s += c; } else empty += 1; }
    return s + (empty || '');
  });
  return `${rows.join('/')} w - - 0 1`;
}

function mountDiagrams(root) {
  for (const fig of root.querySelectorAll('[data-diagram]')) {
    const kind = fig.dataset.diagram;
    const el = fig.querySelector('.board');
    let chess = new Chess();
    const board = new Board(el, {
      targets: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: m.flags.includes('c') })),
    });
    board.setSettings({ showLegal: true, showLast: true, coords: true, anim: 300 });
    if (kind === 'pieces') {
      const tabs = fig.querySelector('.piece-tabs');
      tabs.innerHTML = Object.keys(PIECES).map((p) => `<button data-p="${p}" title="${PIECES[p][0]}"><img src="${pieceUrl(`w${p}`)}" alt="${PIECES[p][0]}"></button>`).join('');
      const show = (p) => {
        chess = new Chess(pieceFen(p));
        board.setPosition(chess.fen(), { animate: false });
        const sq = p === 'P' ? 'd2' : 'd4';
        board.select(sq);
        fig.querySelector('.piece-name').textContent = PIECES[p][0];
        fig.querySelector('.piece-text').textContent = PIECES[p][1];
        for (const b of tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.p === p);
      };
      tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.p); });
      show('N');
      continue;
    }
    const d = DIAGRAMS[kind];
    chess = new Chess(d.fen);
    board.setPosition(d.fen, { animate: false });
    const btn = fig.querySelector('.show-me');
    if (!btn) continue;
    let played = false;
    btn.addEventListener('click', () => {
      if (!played) {
        const after = new Chess(d.fen);
        const m = after.move(d.move);
        const king = after.inCheck() ? [...after.board().flat()].find((p) => p && p.type === 'k' && p.color === after.turn())?.square : null;
        board.setPosition(after.fen(), { lastMove: { from: m.from, to: m.to }, check: king });
        btn.textContent = 'Reset';
      } else {
        board.setPosition(d.fen);
        btn.textContent = 'Show me';
      }
      played = !played;
    });
  }
}

export function renderBlog(el, slug) {
  const article = ARTICLES.find((a) => a.slug === slug);
  if (article) renderArticle(el, article);
  else renderIndex(el);
  window.scrollTo({ top: 0 });
}
