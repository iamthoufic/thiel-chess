// "Building Thiel Chess", a three-part series by Mohamed Thoufic. Every number
// below comes from the project's own manifests, metrics and logs.
import { DEPTH } from './analyst.js';

export const AUTHOR = { name: 'Mohamed Thoufic', initials: 'MT' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A code block with comment lines dimmed. `label` names the file it comes from.
function code(label, text) {
  const body = esc(text.replace(/^\n/, '').replace(/\s+$/, ''))
    .split('\n')
    .map((line) => line.replace(/^(\s*)(#.*|\/\/.*)$/, '$1<span class="c">$2</span>'))
    .join('\n');
  return `<span class="code-label">${label}</span><pre class="code"><code>${body}</code></pre>`;
}

// Validation accuracy after every quarter epoch of fine-tuning (metrics.json).
const HISTORY = [
  [0.25, 61.27], [0.5, 61.75], [0.75, 62.07], [1.0, 62.22], [1.25, 61.92], [1.5, 62.18], [1.75, 62.14], [2.0, 62.32],
  [2.25, 62.23], [2.5, 62.17], [2.75, 62.12], [3.0, 62.24], [3.25, 61.98], [3.5, 62.04], [3.75, 62.12], [4.0, 62.10],
];

function learningCurve() {
  const W = 640; const H = 240; const L = 46; const R = 16; const T = 16; const B = 34;
  const x = (e) => L + ((e - 0) / 4) * (W - L - R);
  const y = (v) => T + (1 - (v - 61) / 1.6) * (H - T - B);
  const pts = HISTORY.map(([e, v]) => `${x(e).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticksY = [61, 61.5, 62, 62.5].map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const ticksX = [0, 1, 2, 3, 4].map((e) => `<text class="tick" x="${x(e)}" y="${H - 12}" text-anchor="middle">${e}</text>`).join('');
  const dots = HISTORY.map(([e, v]) => `<circle class="pt${e === 3 ? ' best' : ''}" cx="${x(e)}" cy="${y(v)}" r="${e === 3 ? 5 : 3.5}"/>`).join('');
  return `<div class="chart"><div class="chart-title">Validation accuracy while training</div>
    <div class="chart-sub">Share of his moves predicted exactly, checked every quarter epoch. The untrained model scored 53.1% on the same games.</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Validation accuracy rises from 61.3% to a best of 62.2% at epoch 3">
      ${ticksY}${ticksX}<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      <polyline class="line" points="${pts}"/>${dots}
      <text class="note" x="${x(3)}" y="${y(62.24) - 12}" text-anchor="middle">best checkpoint, epoch 3</text>
      <text class="tick" x="${W - R}" y="${H - 12}" text-anchor="end">epochs</text>
    </svg></div>`;
}

function resultBars() {
  const rows = [
    ['Exact move (top-1)', 53.2, 62.5], ['In the top 3', 81.3, 87.6],
    ['Opening, plies 1-20', 47.5, 77.4], ['Middlegame, 21-60', 53.8, 56.9], ['Endgame, 61+', 57.1, 58.2],
  ];
  return `<div class="chart"><div class="chart-title">Accuracy on his newest games</div>
    <div class="chart-sub">86,415 of his moves from the most recent 5% of games, which the model never trained on.</div>
    <div class="bars">${rows.map(([label, before, after]) => `
      <div class="bar-row"><span>${label}</span><div class="bar-pair">
        <div class="bar"><i style="width:${before}%"></i><b>${before}%</b></div>
        <div class="bar after"><i style="width:${after}%"></i><b>${after}%</b></div>
      </div></div>`).join('')}</div>
    <div class="legend"><span><i></i>Original Maia-2</span><span class="g"><i></i>Fine-tuned on his games</span></div></div>`;
}

export const BUILD_ARTICLES = [
  {
    slug: 'building-the-app',
    no: '06',
    part: 3,
    author: AUTHOR,
    tags: 'Building Thiel Chess · Part 3',
    title: 'From an API to a browser: <em>the architecture</em> of Thiel Chess',
    plain: 'From an API to a browser: the architecture of Thiel Chess',
    dek: 'How the data, the model and the website fit together, how Peter decides each move, and how I checked that every layer behaves.',
    body: () => `
      <h2 id="pipeline">The pipeline at a glance</h2>
      <p>The project has two halves. Offline, in <b>Python</b>, I collect the games, turn them into training data and fine-tune the model. Online, in <b>the browser</b>, a JavaScript app runs that model on the player's own computer. A single exported file connects them.</p>
      <div class="pipeline">
        <div class="stage"><b>Collect</b><span>Chess.com Published-Data API, one request per month of games.</span><em>Python · urllib</em></div>
        <div class="stage"><b>Clean</b><span>De-duplicate, replay every move, split by date into train, validation and test.</span><em>PGN → JSONL</em></div>
        <div class="stage"><b>Encode</b><span>Each of his 1.72M moves becomes a board tensor and a target move.</span><em>python-chess · NumPy</em></div>
        <div class="stage"><b>Train</b><span>Fine-tune Maia-2 on a laptop GPU, keep the best validation checkpoint.</span><em>PyTorch</em></div>
        <div class="stage"><b>Export</b><span>Convert to ONNX, store weights at 16-bit, check against PyTorch.</span><em>ONNX · ONNX Runtime</em></div>
        <div class="stage"><b>Play</b><span>Run the model in a Web Worker next to a rules engine and his opening book.</span><em>ONNX Runtime Web · chess.js</em></div>
      </div>
      ${code('project layout', `
pipeline/
  fetch-games.mjs         download from the Chess.com API
  build-dataset.mjs       validate, split, write JSONL and a manifest
data/                     raw PGN, processed JSONL, manifests
analysis/eda.py           the exploratory analysis and its charts
training/
  prepare_data.py         encode positions for the network
  finetune.py             training loop, evaluation, early stopping
  export_onnx.py          ONNX export, 16-bit weights, parity vectors
  predict.py              his likely moves for any position, from Python
web/
  model/                  thiel-maia2.onnx, book.json, timing.json, moves.json
  js/engine-worker.js     inference in a Web Worker
  js/encode.js            the same board encoding as Python, in JavaScript
  js/engine.js            book, network, think time
  js/app.js, board.js     game, clocks, board, panels
  tools/                  book, timing and single-file builders`)}

      <h2 id="browser">Why the model runs in the browser</h2>
      <p>I wanted Peter to cost nothing to host and to work offline, so there is no game server. The browser downloads one <b>42.5 MB</b> model and runs it with <b>ONNX Runtime Web</b>, which compiles the network to WebAssembly. Inference happens in a <b>Web Worker</b>, a background thread, so the board never freezes while Peter thinks. When the page is served with cross-origin isolation headers the worker uses several CPU cores; opened as a plain file it falls back to one, which is still well under a second per move.</p>
      <p>To make it shareable as a download, a build step embeds everything (page, fonts, pieces, opening book, runtime and model) into a <b>single 77.9 MB HTML file</b> that opens straight from disk.</p>

      <h2 id="decision">How Peter chooses a move</h2>
      <ol class="flow">
        <li><b>Is the position in his opening book?</b> For the first ten moves, if he reached this exact position in at least three games, Peter picks a reply in proportion to how often he really played it. The book holds 9,940 of his positions.</li>
        <li><b>Otherwise, ask the network.</b> The JavaScript encoder turns the board into the same 18×8×8 tensor the Python side used, the model scores all 1,880 possible moves, illegal ones are masked out, and a softmax gives probabilities.</li>
        <li><b>Pick like a human.</b> In Human mode Peter samples from moves with at least a 3% chance, mistakes included; in Sharpest mode he plays the top move.</li>
        <li><b>Think for as long as he did.</b> The delay is drawn from his real clock data for that move number, as a share of the time left, and a little longer when the model is unsure.</li>
        <li><b>Resign when it is hopeless.</b> If the value head rates his position below 4% for three moves running, he resigns, as he did in over half of his real games.</li>
      </ol>
      ${code('js/engine-worker.js (abridged)', `
const feeds = {
  boards:   new ort.Tensor('float32', encodeFen(fen), [1, 18, 8, 8]),
  elo_self: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloCategory(2200))]), [1]),
  elo_oppo: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloCategory(2200))]), [1]),
};
const out = await session.run(feeds);
// keep only legal moves, then softmax over them
const scores = legal.map((m) => Math.exp(out.logits.data[m.index] - max));`)}

      <h2 id="ratings">Rating the player's moves</h2>
      <p>Peter predicts human moves; he is not the right judge of whether a move was good. For the game review I run a real engine: <b>Stockfish 17.1</b> (the "lite" single-threaded WebAssembly build, about 7 MB) in its own Web Worker. Every position is queued as the game is played and searched to depth ${DEPTH} with the two best lines, so most of the review is finished by the time the game ends. Nothing is shown while you play.</p>
      <p>Each evaluation becomes the mover's <b>expected points</b> (0 to 1, using Lichess's fit of centipawns to results), and a move is judged by how many points it gave up against the engine's best move. I use the same bands Chess.com publishes:</p>
      <table class="notation-table">
        <thead><tr><th>Points lost</th><th>Label</th></tr></thead>
        <tbody>
          <tr><td>0 (engine's move)</td><td>Best</td></tr>
          <tr><td>up to 0.02</td><td>Excellent</td></tr>
          <tr><td>0.02 to 0.05</td><td>Good</td></tr>
          <tr><td>0.05 to 0.10</td><td>Inaccuracy</td></tr>
          <tr><td>0.10 to 0.20</td><td>Mistake</td></tr>
          <tr><td>over 0.20</td><td>Blunder</td></tr>
        </tbody>
      </table>
      <p>On top of those: <b>Book</b> for opening moves from his games that cost almost nothing, <b>Forced</b> when only one move is legal, <b>Great</b> when the best move is the only one that keeps the evaluation (the second-best line is at least 0.15 worse), <b>Brilliant</b> for a near-best move that leaves a piece en prise, and <b>Miss</b> when the opponent had just erred and the move gave the chance back. Accuracy uses Lichess's published formula. Chess.com's exact rules for Brilliant and Great are not public, so those two are my closest reading of their description.</p>

      <h2 id="checks">How I checked it</h2>
      <ul>
        <li><b>Python against JavaScript.</b> A test page encodes 65 positions in the browser, including castling, en passant and promotion cases, and compares the tensors, the legal moves and the model's probabilities with vectors written by the Python exporter. The largest difference is 0.0000063.</li>
        <li><b>ONNX against PyTorch.</b> The exported model picks the same top move as PyTorch on all 605 check positions; 16-bit weights move no probability by more than 0.35 percentage points.</li>
        <li><b>The app itself.</b> An automated suite of 107 in-browser checks covers settings, clocks, castling, en passant, promotion, every way a game can end, takebacks, the result card, the Stockfish review, the opening explorer and this blog, plus layout checks at five screen widths from phone to desktop.</li>
      </ul>

      <h2 id="stack">The stack</h2>
      <p><b>Python:</b> urllib, python-chess, NumPy, PyTorch, ONNX and ONNX Runtime, with Maia-2 as the base model. <b>Web:</b> plain HTML, CSS and JavaScript modules with no framework, chess.js for the rules, ONNX Runtime Web for inference, Stockfish 17.1 (WebAssembly, GPL-3.0) for the game review, and esbuild to bundle the single-file version. A small Node server, with no dependencies, serves the site locally.</p>
      <p>The biggest lesson was to verify every hand-off between layers. Each time data crossed a boundary, from API to PGN, PGN to tensors, PyTorch to ONNX, or Python to JavaScript, I wrote a check that the two sides agree. Those checks caught real bugs before they could reach the board.</p>`,
  },
  {
    slug: 'training-maia',
    no: '05',
    part: 2,
    author: AUTHOR,
    tags: 'Building Thiel Chess · Part 2',
    title: 'Teaching <em>Maia-2</em> to play like one person',
    plain: 'Teaching Maia-2 to play like one person',
    dek: 'Why I started from a human-move model instead of a chess engine, how I fine-tuned it on 1.5 million of his moves, and what accuracy it reached.',
    body: () => `
      <h2 id="why-maia">Engines play well. I wanted human.</h2>
      <p>A chess engine searches for the best move. That is the wrong target here: I wanted the move <b>this player would most likely choose</b>, including his habits and mistakes. That is exactly the problem <b>Maia</b> was built for. Maia-2, from the University of Toronto's CSSLab (NeurIPS 2024, MIT licence), is trained on millions of online games to predict what a human of a given rating plays next. I used its blitz model as the starting point and specialised it on one player.</p>

      <h2 id="architecture">Inside Maia-2</h2>
      <ul>
        <li><b>Input:</b> the board as 18 planes of 8×8: twelve for the piece types of each colour, one for the side to move, four for castling rights and one for the en passant square. The board is flipped when Black is to move, so the network always reasons from the mover's side.</li>
        <li><b>Board encoder:</b> a residual convolutional network of 5 blocks with 256 channels, ending in 8 feature maps.</li>
        <li><b>Transformer:</b> each feature map becomes a token of 1,024 dimensions; 2 transformer blocks with 16 attention heads mix them. The attention is <b>rating-aware</b>: embeddings for both players' ratings are added to its queries.</li>
        <li><b>Heads:</b> a policy over all 1,880 possible moves, a value head estimating the expected score, and an auxiliary head used during Maia's original training.</li>
      </ul>
      <p>In total the network has <b>23.3 million parameters</b>: 13.1M in the transformer, 6.0M in the convolutional encoder and 1.9M in the policy head.</p>

      <h2 id="baseline">The baseline</h2>
      <p>Before training anything I scored the unmodified Maia-2 blitz model on his test games. It already predicted his exact move <b>53.2%</b> of the time, and had it in its top three <b>81.3%</b> of the time. That is a strong start, and the number to beat.</p>

      <h2 id="setup">Fine-tuning</h2>
      <p>The training loop is plain PyTorch. Each step takes 512 of his positions, asks the model for move probabilities, and nudges the weights toward the move he actually played, plus a smaller nudge toward the game's result for the value head.</p>
      ${code('finetune.py (abridged)', `
model = maia2_model.from_pretrained("blitz")
optimizer = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=1e-5)
# 500 warm-up steps, then cosine decay
for step in range(total_steps):
    boards, moves, elo_self, elo_oppo, result = corpus.batch(next_indices())
    logits, _, value = model(boards, elo_self, elo_oppo)
    loss = F.cross_entropy(logits, moves) + 0.5 * F.mse_loss(value, result)
    optimizer.zero_grad()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    optimizer.step()
    scheduler.step()
    if step % eval_every == 0:          # four times per epoch
        val = evaluate(model, validation)
        if val.log_loss < best.log_loss:
            torch.save(model.state_dict(), "checkpoints/best.pt")`)}
      <ul>
        <li><b>Optimiser:</b> AdamW, learning rate 5×10⁻⁵, weight decay 10⁻⁵, gradient clipping at 1.0.</li>
        <li><b>Selection:</b> validation every quarter epoch; the checkpoint with the lowest validation log-loss is kept, and training stops after four checks without improvement.</li>
        <li><b>Hardware:</b> a laptop GTX 1650 with 4 GB of memory, at about 25 minutes per pass over the data. I trained in full 32-bit precision: mixed precision was roughly seven times slower on this card, which has no tensor cores.</li>
      </ul>
      ${learningCurve()}
      <p>Most of the gain arrived in the first quarter epoch, from 53.1% to 61.3% on validation. The best checkpoint came at <b>epoch 3</b> (62.2% exact, log-loss 1.125, down from 1.450), and training stopped itself after epoch 4 when four more checks failed to improve on it.</p>

      <h2 id="results">Results</h2>
      ${resultBars()}
      <p>On his most recent games the fine-tuned model predicts his <b>exact move 62.5%</b> of the time, up 9.3 points, and has it in its <b>top three 87.6%</b> of the time. Log-loss fell from 1.445 to 1.118. In practice Peter plays the real player's move about five times in every eight.</p>
      <p>The gain is not spread evenly. <b>Openings jumped from 47.5% to 77.4%</b>: his repertoire is narrow and consistent, and the model learned it. Middlegames (53.8% to 56.9%) and endgames (57.1% to 58.2%) moved less, because there the positions are new and even the same player would not always choose the same move twice.</p>

      <h2 id="did-not-work">What did not work</h2>
      <ul>
        <li><b>A second, gentler training stage.</b> Restarting from the best checkpoint at a five-times lower learning rate made validation worse at its first check (log-loss 1.133 against 1.125), so I kept the first stage's model.</li>
        <li><b>8-bit compression.</b> Quantising the weights to 8 bits cut the file to 39 MB but changed the top move in about 5% of positions, which is too much for a model whose whole point is fidelity. Storing weights at 16 bits instead halved the size to 42.5 MB with the same top move on every check position.</li>
      </ul>`,
  },
  {
    slug: 'collecting-the-data',
    no: '04',
    part: 1,
    author: AUTHOR,
    tags: 'Building Thiel Chess · Part 1',
    title: 'Pulling <em>43,797 games</em>: building the dataset',
    plain: 'Pulling 43,797 games: building the dataset',
    dek: 'How I downloaded ten years of blitz from the Chess.com API, cleaned and split it without leaking the future into the past, and turned it into 1.7 million training examples.',
    body: () => `
      <h2 id="source">The source</h2>
      <p>Chess.com publishes every public game through its <b>Published-Data API</b>, with no key required. For a player it returns a list of monthly archives, and each archive returns that month's games as JSON, with the full PGN (moves, ratings, clocks and result) inside each game. The account <code>PeterThiel</code> has <b>116 monthly archives</b>, from December 2016 to October 2026.</p>
      <p>My first full pull used a small Node.js script. The same logic in Python, which I tested against the live API (it returns the identical 27 games for December 2016), looks like this:</p>
      ${code('fetch_games.py', `
import json, time, urllib.request

API = "https://api.chess.com/pub/player/{user}/games/archives"
HEADERS = {"User-Agent": "thiel-chess-dataset/1.0 (research project)"}

def get_json(url, attempts=5):
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(1.5 * attempt)   # back off on rate limits

def fetch(user):
    archives = get_json(API.format(user=user.lower()))["archives"]
    games = {}
    for url in archives:                # one month at a time, as the API asks
        for game in get_json(url)["games"]:
            games.setdefault(game["url"], game)   # de-duplicate by game URL
    return sorted(games.values(), key=lambda g: g["end_time"])`)}
      <p>Requests go out one at a time with a descriptive user agent, and failed calls back off and retry, which keeps the download polite and resumable. Because months are independent, a refresh only needs the newest ones; that incremental update is how the dataset was brought up to date in October.</p>

      <h2 id="what-came-back">What came back</h2>
      <ul>
        <li><b>43,797 games</b> from 18 December 2016 to 21 October 2026: a 120.9 MB PGN file, 25.5 MB compressed.</li>
        <li>Over 99.9% are <b>3-minute blitz</b>, with a handful of 10-minute rapid games.</li>
        <li>He played White in 21,897 games and Black in 21,900, scoring <b>21,566 wins, 3,111 draws and 19,120 losses</b>.</li>
        <li>His blitz rating rose from about 2,050 in 2017 to 2,202 today.</li>
      </ul>

      <h2 id="cleaning">Cleaning and validating</h2>
      <p>Every game was de-duplicated by its Chess.com URL, sorted by start time, and then <b>replayed move by move</b> with a chess library. A game with a single illegal or unreadable move would have stopped the build rather than being dropped silently. None did: <b>zero parse errors</b> in 43,797 games. Each manifest records file sizes and SHA-256 checksums, so the dataset can be rebuilt and verified byte for byte.</p>
      <p>From the clean games I wrote two views as compressed JSON Lines: one record per game (moves in both notations, ratings, result and which half-moves were his), and <b>one record per move he made</b>, holding the position before the move and the move itself. That second file has <b>1,715,752 examples</b>, and it is what the model learns from.</p>

      <h2 id="splits">Splitting by date, not at random</h2>
      <p>The usual random split would be a mistake here, for two reasons: positions from one game would land on both sides of the split, and the model would be tested on his past while training on his future. Instead I sorted games by date and cut them:</p>
      <table class="notation-table">
        <thead><tr><th>Split</th><th>Games</th><th>His moves</th></tr></thead>
        <tbody>
          <tr><td>Train, oldest 90%</td><td>39,417</td><td>1,544,158</td></tr>
          <tr><td>Validation, next 5%</td><td>2,190</td><td>85,179</td></tr>
          <tr><td>Test, newest 5%</td><td>2,190</td><td>86,415</td></tr>
        </tbody>
      </table>
      <p>Every position from a game stays in that game's split. Validation chooses the best model; the test set is scored once, at the end.</p>

      <h2 id="encoding">Encoding positions in Python</h2>
      <p>The network expects each position as 18 planes of 8×8. Storing that directly would take gigabytes, so the encoder keeps just 64 piece codes, the castling rights and the en passant square per position, and the training script expands them on the GPU. With python-chess and four worker processes, all 1.7 million positions fit in a <b>164 MB</b> NumPy file.</p>
      ${code('prepare_data.py (abridged)', `
def encode(fen):
    board = chess.Board(fen)
    if board.turn == chess.BLACK:
        board = board.mirror()          # the mover is always "White"
    codes = np.zeros(64, dtype=np.uint8)
    for square, piece in board.piece_map().items():
        codes[square] = piece.piece_type + (0 if piece.color else 6)
    castling = (board.has_kingside_castling_rights(chess.WHITE)
                | board.has_queenside_castling_rights(chess.WHITE) << 1
                | board.has_kingside_castling_rights(chess.BLACK) << 2
                | board.has_queenside_castling_rights(chess.BLACK) << 3)
    ep = board.ep_square if board.ep_square is not None else -1
    return codes, castling, ep`)}

      <h2 id="extras">Two more things hidden in the PGN</h2>
      <p><b>An opening book.</b> Replaying the first ten moves of every game gives each position he reached and how often he chose each reply, with his results. Keeping moves seen at least three times leaves 9,940 of his positions. It shows a very consistent player: <b>1.e4 in 99.7% of his White games</b>, and the Sicilian (1...c5) as his usual answer to 1.e4.</p>
      <p><b>How long he thinks.</b> Each move in the PGN carries a clock stamp such as <code>[%clk 0:02:57.1]</code>. Reading those across 43,427 three-minute games gives his real thinking time by move number:</p>
      ${code('build-timing.py (abridged)', `
CLK = re.compile(r"\\[%clk (\\d+):(\\d+):(\\d+(?:\\.\\d+)?)\\]")
clocks = [h * 3600 + m * 60 + float(s) for h, m, s in CLK.findall(pgn)]
mine = clocks[0::2] if he_is_white else clocks[1::2]
spent = [max(0.05, before - after) for before, after in zip([180.0] + mine, mine)]`)}
      <table class="notation-table">
        <thead><tr><th>His move</th><th>Median</th><th>90th percentile</th></tr></thead>
        <tbody>
          <tr><td>1 to 5</td><td>1.0 s</td><td>2.0 s</td></tr>
          <tr><td>6 to 10</td><td>1.2 s</td><td>2.8 s</td></tr>
          <tr><td>16 to 20</td><td>2.2 s</td><td>7.2 s</td></tr>
          <tr><td>21 to 30</td><td>2.4 s</td><td>8.2 s</td></tr>
          <tr><td>41 and later</td><td>1.4 s</td><td>4.1 s</td></tr>
        </tbody>
      </table>
      <p>That table is why Peter moves quickly in the opening and takes his time in the middlegame. Part 2 covers the model these 1.7 million examples trained.</p>
      <div class="callout"><b>A note on the source.</b> The dataset is the public game history of the Chess.com account PeterThiel. That the account belongs to Peter Thiel is not verified, so the project models the account's play, not a confirmed person.</div>`,
  },
];
