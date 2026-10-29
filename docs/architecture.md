# Architecture

Thiel Chess has two halves joined by one file. **Offline**, a data pipeline
collects and cleans the games and a Python training stack fine-tunes a neural
network. **Online**, a static web app runs that network in the visitor's
browser. The exported model, `web/model/thiel-maia2.onnx`, is the hand-off.

```
 Chess.com Published-Data API
            │  pipeline/fetch-games.mjs        one request per monthly archive, retries, de-dup by URL
            ▼
 data/raw/*.pgn.gz  (43,797 games)
            │  pipeline/build-dataset.mjs      replay & validate with chess.js, chronological 90/5/5 split
            ▼
 data/processed/*.jsonl.gz  (1,715,752 of his moves)          analysis/eda.py ──► docs/eda/
            │  training/prepare_data.py        18×8×8 encoding, mirrored to side-to-move
            ▼
 training/cache/positions.npz
            │  training/finetune.py            Maia-2 blitz → fine-tuned on his moves (PyTorch)
            ▼
 training/checkpoints/best.pt
            │  training/export_onnx.py         ONNX, int8/fp16 weights, parity check vs PyTorch
            ▼
 web/model/thiel-maia2.onnx  ──────────────►  training/predict.py (Python, ONNX Runtime)
            │
            ▼
 web/  static site: ONNX Runtime Web in a Web Worker + opening book + Stockfish review
```

## 1. Data collection — `pipeline/fetch-games.mjs`

- Reads the archive index `https://api.chess.com/pub/player/peterthiel/games/archives`,
  then each month's archive, **one request at a time** as the API asks.
- Retries HTTP 429 and 5xx responses up to 5 times with a growing back-off
  (1.5 s, 3 s, 4.5 s, ...), and sends a project User-Agent (override with
  `CHESSCOM_USER_AGENT`).
- Keeps only games where the account is White or Black, de-duplicates by game
  URL, sorts by UTC start time.
- Incremental: later runs fetch only months from the newest stored one.
- Writes the PGN, a gzip copy and `data/manifests/source.json` (archives,
  counts, SHA-256 checksums).

## 2. Cleaning and splitting — `pipeline/build-dataset.mjs`

- Replays **every** move with chess.js; an invalid game fails the build.
- Derives his colour, result, both ratings, time control, ECO, all moves in UCI
  and SAN, and which plies were his.
- Splits **by game, by date**: oldest 90% train, next 5% validation, newest 5%
  test, so no game leaks across splits and the test set is his latest play.
- The build is deterministic: rebuilding from the same raw file reproduces the
  same bytes and checksums (`data/manifests/dataset.json`).

## 3. Exploratory analysis — `analysis/eda.py`

Charts and numbers in [`eda.md`](eda.md). The finding that shapes the design:
his opening repertoire is extremely narrow (1.e4 99.9% as White, 1...c5 99.8%
against 1.e4), and 99.97% of games are 3-minute blitz.

## 4. The model — Maia-2, fine-tuned

[Maia-2](https://github.com/CSSLab/maia2) (CSSLab, University of Toronto,
NeurIPS 2024) predicts the move a **human** of a given rating would play, not
the best move. It was trained on Lichess games; we start from its blitz
checkpoint and fine-tune it on his 1.54M training moves. 23.3M parameters.

```
Board 18×8×8 ──► ResNet: conv 3×3 18→256, 5 residual blocks (256 ch), conv 256→8
                         └─ 8 channels × 64 squares = 8 tokens
                 ──► Linear 64→1024 + LayerNorm + learned position embedding
Elo(self), Elo(opp) ──► Embedding(11 bins, 128) each ──► concat 256
                 ──► Transformer × 2 (16 heads × 64), Elo-aware attention:
                     the rating embedding is projected and ADDED TO THE QUERIES
                 ──► mean-pool tokens + LayerNorm (1024)
                 ├─► policy head   1024 → 1,880 move logits   (illegal moves masked, softmax)
                 ├─► value head    1024 → 128 → 1             (expected result, -1..+1)
                 └─► side-info head (auxiliary in Maia-2; not trained or exported here)
```

**Input planes**: 12 piece planes (White then Black P, N, B, R, Q, K), side to
move, 4 castling rights, en passant. The board is mirrored when Black is to
move so the network always plays "White"; predicted moves are mirrored back.

**Training**: policy cross-entropy + 0.5 × value MSE; AdamW 5e-5, cosine
schedule with 500 warm-up steps, gradient clipping 1.0, batch 512; best
checkpoint by validation log-loss, evaluated 4× per epoch with early stopping;
test split scored once. Details and results in
[`../training/README.md`](../training/README.md).

| Held-out test (86,415 positions) | Original Maia-2 | Fine-tuned |
| --- | ---: | ---: |
| Top-1 accuracy | 53.2% | **62.4%** |
| Top-3 accuracy | 81.3% | **87.6%** |
| Opening top-1 (ply 1-20) | 47.5% | **77.4%** |

**Export**: ONNX (opset 17), policy and value heads only. The linear layers'
weights are stored as int8 with a scale per output channel, everything else
(including the convolutions) as fp16, and all of it is expanded to fp32 at
load, so the arithmetic is full precision. 27.4 MB instead of 85 MB at fp32;
same top move as PyTorch in 99.75% of check positions, and on 4,000 test
positions it matches his real move as often as the fp16 model did. `export_onnx.py` also writes
`web/tests/vectors.json`, reference inputs and outputs that the JavaScript
encoder and `training/predict.py` are checked against.

## 5. Making predictions

- **Python** — `training/predict.py` runs the ONNX model with ONNX Runtime
  (CPU, no PyTorch) and lists his most likely moves with probabilities and a
  win estimate. It reproduces the browser's encoding exactly (65/65 reference
  positions).
- **Browser** — `web/js/engine-worker.js` runs the same model with ONNX
  Runtime Web (WebAssembly) in a Web Worker, so the page never freezes.
  `web/js/encode.js` is the JavaScript twin of the Python encoder.

## 6. The web app — `web/`

Plain HTML, CSS and JavaScript modules, no framework and no build step. It is
fully static: there is no game server, all computation happens on the
visitor's device.

How Peter picks a move (`web/js/engine.js`):

1. **Opening book** — for his first ten moves, if he reached this exact
   position in at least three games, reply in proportion to how often he
   really played each move (`web/model/book.json`, built by
   `web/tools/build-book.mjs`).
2. **Network** — otherwise score all 1,880 moves, mask illegal ones, softmax.
3. **Pick like a human** — *Human* samples from moves with at least 3%
   probability (mistakes included); *Sharpest* plays the top move.
4. **Think like him** — the delay is drawn from his real clock usage at that
   move number (`web/model/timing.json`, built by `web/tools/build-timing.py`
   from the `%clk` comments).
5. **Resign** — if the value head rates his position below 4% for three moves
   running after move 15, he resigns, as he did in most of his lost games.

Around it:

| Module | Role |
| --- | --- |
| `js/app.js` | game state, clocks, panels, settings, routing |
| `js/board.js` | the board: drag and click moves, animation, arrows, legal-move hints |
| `js/analyst.js` + `js/quality.js` | **Game Review**: Stockfish 17.1 (WebAssembly) analyses every position in the background to depth 14; moves are rated Best/Excellent/Good/Inaccuracy/Mistake/Blunder (+ Book, Forced, Great, Brilliant, Miss) from the expected-points loss; accuracy uses Lichess's published formula |
| `js/openings.js` | the **Openings** explorer over his real game tree |
| `js/history.js` | **Your games**: last 20 finished games with their review, plus an all-time record, in `localStorage` |
| `js/sound.js` | move sounds synthesised with the Web Audio API (no audio files) |
| `js/flags.js`, `js/logo.js` | SVG flags and the pawn logo / theme-coloured favicon |
| `js/blog.js`, `js/about.js` | the Blog and About pages |

**Loading fast.** A first visit downloads about 36 MB (the model 27 MB,
ONNX Runtime 3 MB, Stockfish 5.6 MB, the opening book 0.3 MB, all compressed
by the host). The page does not wait for all of it: **you can start a game as
soon as the opening book is in**, because Peter plays his first ten moves from
the book while the network keeps downloading; if the network is needed before
it arrives, he shows its progress while "thinking". Stockfish, needed only for
Game Review, starts downloading after the network has loaded so the two do not
compete for bandwidth. Static assets are cached by the browser; the model is
revalidated with its ETag so a new deploy is picked up at once.

**Cross-origin isolation.** When served with `Cross-Origin-Opener-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, the browser
allows `SharedArrayBuffer`, and ONNX Runtime Web uses several CPU threads.
`web/serve.mjs` (local) and `vercel.json` (hosted) both send these headers.
Without them the model still runs on one thread, well under a second a move.

**Single-file build.** `npm run web:single` embeds the page, fonts, pieces,
book, runtime, model and Stockfish into one ~68 MB HTML file that opens from
disk with no server.

**Privacy.** Settings, your name, photo, rating, flag and game history are
stored in the browser's `localStorage` only; nothing is sent anywhere.
