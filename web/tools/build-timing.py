"""Measure how long PeterThiel really spends per move, for "human speed" play.

Reads the %clk comments in his 3-minute games and writes model/timing.json:
for each stage of the game, quantiles of the share of his remaining clock he
used on a move (and the absolute seconds, for untimed games). The bot samples
from these, so it thinks as long as he did, not as long as a formula says.

Usage: python tools/build-timing.py [raw.pgn]
"""

import gzip
import json
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[1] / "data" / "raw" / "peterthiel_chesscom_all_games.pgn.gz"
OUT = HERE.parent / "model" / "timing.json"
STAGES = [(1, 5), (6, 10), (11, 15), (16, 20), (21, 30), (31, 40), (41, 999)]  # his move number
QUANTILES = np.linspace(0, 1, 41)
CLK = re.compile(r"\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]")


def seconds(match):
    h, m, s = match
    return int(h) * 3600 + int(m) * 60 + float(s)


def games(path):
    headers, moves = {}, []
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("[Event ") and moves:
                yield headers, " ".join(moves)
                headers, moves = {}, []
            if line.startswith("["):
                key, _, value = line[1:].partition(" ")
                headers[key] = value.strip().rstrip("]").strip('"')
            elif line.strip():
                moves.append(line.strip())
    if moves:
        yield headers, " ".join(moves)


share = {stage: [] for stage in STAGES}
spent_abs = {stage: [] for stage in STAGES}
count = 0
for headers, text in games(RAW):
    if headers.get("TimeControl") != "180":
        continue
    clocks = [seconds(m) for m in CLK.findall(text)]
    if len(clocks) < 10:
        continue
    offset = 0 if headers.get("White", "").lower() == "peterthiel" else 1
    mine = clocks[offset::2]
    before = 180.0
    for n, after in enumerate(mine, start=1):
        spent = max(0.05, before - after)
        stage = next(s for s in STAGES if s[0] <= n <= s[1])
        if before > 0.5:
            share[stage].append(min(1.0, spent / before))
            spent_abs[stage].append(spent)
        before = after
    count += 1

timing = {
    "games": count,
    "quantiles": QUANTILES.round(3).tolist(),
    "stages": [
        {
            "from": a, "to": b, "moves": len(share[(a, b)]),
            "share": np.quantile(share[(a, b)], QUANTILES).round(5).tolist(),
            "seconds": np.quantile(spent_abs[(a, b)], QUANTILES).round(3).tolist(),
        }
        for a, b in STAGES
    ],
}
OUT.write_text(json.dumps(timing))
print(f"{count} games -> {OUT}")
for s in timing["stages"]:
    med = s["seconds"][20]
    p90 = s["seconds"][36]
    print(f"  his moves {s['from']}-{s['to']}: median {med:.1f}s, 90th percentile {p90:.1f}s ({s['moves']:,} moves)")
