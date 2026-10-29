# Web app

The playable site: a static page with no framework and no build step.

```bash
npm start                       # from the repository root: http://localhost:8080
node web/serve.mjs --port 8080 --open
```

`serve.mjs` is a tiny dependency-free static server that sends the
cross-origin isolation headers ONNX Runtime Web needs for multi-threaded
inference. Any static host works; for Vercel see the root `README.md`
(`vercel.json` sets the same headers).

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | the page and its styles (dark and light themes, eight board themes) |
| `js/app.js` | game flow, clocks, panels, settings, game history |
| `js/engine.js`, `js/engine-worker.js`, `js/encode.js` | Peter's move choice: opening book, the ONNX network in a Web Worker, think time |
| `js/analyst.js`, `js/quality.js` | Game Review with Stockfish |
| `js/board.js` | the chessboard |
| `js/openings.js` | the opening explorer |
| `model/thiel-maia2.onnx` | the fine-tuned network (27.4 MB: int8 linear layers, fp16 convolutions) |
| `model/model.json` | the model's size, for the download progress bar |
| `model/book.json` | his opening statistics, first 10 moves (`tools/build-book.mjs`) |
| `model/timing.json` | how long he thinks per move (`tools/build-timing.py`) |
| `model/metrics.json`, `model/moves.json` | evaluation numbers and the 1,880-move vocabulary |
| `vendor/` | chess.js, ONNX Runtime Web, Stockfish 17.1 lite (see `THIRD_PARTY_NOTICES.md`) |
| `tests/index.html` | in-browser parity test: open `/tests/` on the running server |
| `tests/qa.mjs` | in-browser QA suite: in the console, `const qa = await import('/tests/qa.mjs'); await qa.run()` |
| `tools/build-single.mjs` | `npm run web:single` builds `dist/Thiel Chess.html`, one ~68 MB file that runs offline |

Rebuilding the data files after re-running the pipeline:

```bash
npm run web:book                        # model/book.json from data/processed/
python web/tools/build-timing.py        # model/timing.json from data/raw/
python training/export_onnx.py          # model/thiel-maia2.onnx + tests/vectors.json
```
