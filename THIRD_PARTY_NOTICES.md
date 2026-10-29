# Third-party notices

The code written for this project is MIT-licensed (see `LICENSE`). These
components are bundled or used under their own licenses.

| Component | Where | License |
| --- | --- | --- |
| [Maia-2](https://github.com/CSSLab/maia2) (CSSLab, University of Toronto): architecture and pretrained blitz weights that `training/` fine-tunes | `training/`, weights in `web/model/thiel-maia2.onnx` | MIT |
| [Stockfish 17.1](https://stockfishchess.org/) "lite" WebAssembly build (via the `stockfish` npm package by Nathan Rugg), used for Game Review | `web/vendor/stockfish/` | GPL-3.0 (full text in `web/vendor/stockfish/COPYING.txt`) |
| [ONNX Runtime Web](https://onnxruntime.ai/) (Microsoft) | `web/vendor/ort/` | MIT |
| [chess.js](https://github.com/jhlywa/chess.js) (Jeff Hlywa) | `web/vendor/chess.js`, npm dev dependency | BSD-2-Clause |
| "cburnett" chess pieces (Colin M. L. Burnett) | `web/pieces/cburnett/` | CC BY-SA 3.0 / GPL-2.0-or-later |
| [Lucide](https://lucide.dev) icon paths | `web/js/icons.js` | ISC |
| [Manrope](https://fonts.google.com/specimen/Manrope), [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | `web/fonts/` | SIL Open Font License 1.1 |
| [python-chess](https://github.com/niklasf/python-chess), NumPy, PyTorch, ONNX, Matplotlib | Python dependencies (not bundled) | GPL-3.0 / BSD / BSD / Apache-2.0 / PSF-based |

Stockfish runs as a separate program in a Web Worker and is shipped with its
license and source reference, as the GPL requires. If you redistribute the web
app, keep `web/vendor/stockfish/COPYING.txt` with it.

## Data

Game records come from the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
They are **not** included in this repository. Chess.com's
[User Agreement](https://www.chess.com/legal/user-agreement) requires prior
written authorization to use its content to develop engines or training
models; obtain it before running the data pipeline. See `data/DATA_CARD.md`.

The illustrated portraits of Peter Thiel in `web/img/peter/` are original
artwork made for this project. The project is not affiliated with Peter Thiel
or Chess.com.
