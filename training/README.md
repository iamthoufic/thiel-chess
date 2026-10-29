# Training: fine-tuning Maia-2 on PeterThiel

These scripts take the pretrained [Maia-2](https://github.com/CSSLab/maia2)
**blitz** model, a network that predicts the move a *human* of a given rating
would play, and fine-tune it on every move `PeterThiel` made, then export it
for the browser.

| Script | Does | Needs |
| --- | --- | --- |
| `prepare_data.py` | Encodes the 1.7M positions into compact arrays (`cache/positions.npz`, ~130 MB) | `requirements.txt` |
| `finetune.py` | Scores the original Maia-2, fine-tunes, keeps the best validation checkpoint, scores the test split once (`metrics.json`) | `requirements-train.txt`, a GPU recommended |
| `export_onnx.py` | Exports policy + value heads to ONNX, checks them against PyTorch, writes `web/model/thiel-maia2.onnx` and `web/tests/vectors.json` | `requirements-train.txt` |
| `predict.py` | His most likely moves for any position, from the exported model | `requirements.txt` only |

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu124   # or the CPU/other build for your machine
pip install -r requirements-train.txt
pip install --no-deps maia2==0.11.0
```

The first run of `finetune.py` downloads the Maia-2 blitz weights (~90 MB) into
`training/cache/maia2_models/`.

## Run

From the repository root, after building the data (`data/README.md`):

```bash
python training/prepare_data.py          # data/processed/...positions.jsonl.gz -> training/cache/positions.npz
python training/finetune.py --epochs 6 --patience 4
python training/export_onnx.py           # -> web/model/thiel-maia2.onnx
python training/predict.py --moves e4    # try it
```

`finetune.py` options: `--epochs`, `--batch-size 512`, `--lr 5e-5`,
`--value-coef 0.5`, `--patience`, `--resume` (continue from
`checkpoints/last.pt`), `--amp` (fp16; only faster on GPUs with tensor cores:
on a GTX 1650 it was about 7x slower than fp32).

The run behind the shipped model took about 25 minutes per epoch on a
GTX 1650 (4 GB).

## Method

- **Input**: Maia-2's encoding, 18 planes of 8x8 (12 piece planes, side to
  move, 4 castling rights, en passant), with the board mirrored when Black is
  to move so the network always plays "White". Both players' ratings are
  bucketed into 11 bins (`<1100`, 100-point bins, `>=2000`); his games all sit
  in the top bin.
- **Targets**: the move he played (one of 1,880 possible moves) and the game
  result (+1 / 0 / -1) for the value head.
- **Loss**: policy cross-entropy + 0.5 x value MSE. Maia-2's auxiliary
  side-information head is not trained and not exported.
- **Optimiser**: AdamW, lr 5e-5, weight decay 1e-5, 500-step warm-up, cosine
  decay, gradient clipping at 1.0, batch 512, seed 42.
- **Selection**: validation log-loss with illegal moves masked, 4 times per
  epoch; the best checkpoint is kept and training stops after `--patience`
  evaluations without improvement. The test split is scored once, at the end.
- **Export**: ONNX opset 17 with fp16-stored weights cast to fp32 at load
  (42.5 MB, same top move as PyTorch in 100% of test positions, largest
  probability change 0.35%). The int8 version changed the top move in 5% of
  positions and is rejected automatically.

## Results (held-out test set: his newest 2,190 games, 86,415 positions)

| | Original Maia-2 | Fine-tuned |
| --- | ---: | ---: |
| Top-1 accuracy | 53.2% | **62.4%** |
| Top-3 accuracy | 81.3% | **87.6%** |
| Log-loss | 1.445 | **1.118** |
| Opening (ply 1-20) | 47.5% | **77.4%** |
| Middlegame (ply 21-60) | 53.8% | **56.9%** |
| Endgame (ply 61+) | 57.0% | **58.2%** |

Best validation checkpoint: epoch 3.0 (step 9,048), log-loss 1.1246. Full
numbers, including every validation evaluation, are in `metrics.json`.

The largest gain is in the opening, where he is very consistent (1.e4 in 99.9%
of his White games, the Sicilian against 1.e4). Later in the game positions
are new, and the model leans on Maia-2's general knowledge of human play,
nudged toward his tendencies.
