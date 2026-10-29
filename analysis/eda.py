"""Exploratory data analysis of the PeterThiel game corpus.

Reads data/processed/peterthiel_games.jsonl.gz (built by pipeline/build-dataset.mjs)
and writes:
    docs/eda/summary.json   every number quoted in docs/eda.md
    docs/eda/*.png          the charts

Usage: python analysis/eda.py [--games data/processed/peterthiel_games.jsonl.gz]
"""

import argparse
import gzip
import json
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GAMES = ROOT / "data" / "processed" / "peterthiel_games.jsonl.gz"
OUT = ROOT / "docs" / "eda"

# chart styling: one quiet surface, recessive axes, a validated categorical order
SURFACE, INK, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e1"
BLUE, ORANGE, NEUTRAL = "#2a78d6", "#eb6834", "#8f8d86"
plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRID,
    "grid.linewidth": 0.8, "axes.axisbelow": True, "font.size": 10.5, "axes.titlesize": 13,
    "axes.titleweight": "bold", "axes.titlecolor": INK, "axes.titlelocation": "left", "axes.titlepad": 12,
})


def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / name, dpi=160)
    plt.close(fig)


def label_bars(ax, bars, fmt="{:,.0f}", inside=False):
    for bar in bars:
        value = bar.get_width() if bar.get_width() > bar.get_height() and inside else bar.get_height()
        ax.annotate(fmt.format(value), (bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    ha="center", va="bottom", fontsize=9, color=MUTED, xytext=(0, 3), textcoords="offset points")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=Path, default=DEFAULT_GAMES)
    args = parser.parse_args()
    if not args.games.exists():
        raise SystemExit(f"{args.games} not found. Run `npm run data` first (see data/README.md).")
    OUT.mkdir(parents=True, exist_ok=True)
    games = load(args.games)
    summary = {"games": len(games)}

    # ---- time controls and years
    summary["time_controls"] = dict(Counter(g["time_control"] for g in games).most_common())
    years = Counter(g["played_at_utc"][:4] for g in games)
    summary["games_per_year"] = dict(sorted(years.items()))
    summary["first_game"] = min(g["played_at_utc"] for g in games)
    summary["last_game"] = max(g["played_at_utc"] for g in games)

    fig, ax = plt.subplots(figsize=(8, 3.6))
    ys = sorted(years)
    bars = ax.bar(ys, [years[y] for y in ys], color=BLUE, width=0.62)
    label_bars(ax, bars)
    ax.set_title("Games per year")
    ax.grid(axis="x", visible=False)
    ax.set_ylabel("games")
    save(fig, "games_per_year.png")

    # ---- rating over time (3-minute games, monthly median)
    monthly = defaultdict(list)
    for g in games:
        if g["time_control"] == "180" and g["player_elo"]:
            monthly[g["played_at_utc"][:7]].append(g["player_elo"])
    months = sorted(monthly)
    med = [st.median(monthly[m]) for m in months]
    by_year = defaultdict(list)
    for m in months:
        by_year[m[:4]].extend(monthly[m])
    summary["rating_3min_mean_by_year"] = {y: round(st.mean(v)) for y, v in sorted(by_year.items())}
    elos = [g["player_elo"] for g in games if g["player_elo"]]
    opp = [g["opponent_elo"] for g in games if g["opponent_elo"]]
    summary["rating"] = {"min": min(elos), "mean": round(st.mean(elos)), "max": max(elos), "opponent_mean": round(st.mean(opp))}

    fig, ax = plt.subplots(figsize=(8, 3.6))
    x = list(range(len(months)))
    ax.plot(x, med, color=BLUE, linewidth=2)
    ticks = [i for i, m in enumerate(months) if m.endswith("-01")]
    ax.set_xticks(ticks, [months[i][:4] for i in ticks])
    ax.set_title("Blitz rating (3 min), monthly median")
    ax.set_ylabel("Chess.com rating")
    peak = max(range(len(med)), key=med.__getitem__)
    ax.annotate(f"{med[peak]:.0f}", (peak, med[peak]), xytext=(0, 6), textcoords="offset points", ha="center", fontsize=9, color=INK)
    save(fig, "rating_over_time.png")

    # ---- results by colour
    results = {}
    for color in ("white", "black"):
        c = Counter(g["result"] for g in games if g["player_color"] == color)
        n = sum(c.values())
        results[color] = {k: round(100 * c[k] / n, 1) for k in ("win", "draw", "loss")}
    total = Counter(g["result"] for g in games)
    summary["results"] = dict(total)
    summary["results_by_colour_pct"] = results

    fig, ax = plt.subplots(figsize=(8, 2.6))
    rows = ["white", "black"]
    left = [0, 0]
    # won and lost take the two categorical hues; a draw is the neutral middle
    for key, color, name in (("win", BLUE, "Won"), ("draw", NEUTRAL, "Drawn"), ("loss", ORANGE, "Lost")):
        widths = [results[r][key] for r in rows]
        bars = ax.barh([f"As {r}" for r in rows], widths, left=left, color=color, height=0.55,
                       edgecolor=SURFACE, linewidth=2, label=name)
        for bar, w in zip(bars, widths):
            if w >= 5:
                ax.text(bar.get_x() + w / 2, bar.get_y() + bar.get_height() / 2, f"{w:.0f}%",
                        ha="center", va="center", color="white", fontsize=9.5, fontweight="bold")
        left = [a + b for a, b in zip(left, widths)]
    ax.set_xlim(0, 100)
    ax.invert_yaxis()
    ax.grid(False)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    ax.set_title("Results by colour")
    ax.legend(ncol=3, frameon=False, loc="upper right", bbox_to_anchor=(1, 1.28), fontsize=9.5)
    save(fig, "results_by_colour.png")

    # ---- openings
    white_first = Counter(g["moves_san"][0] for g in games if g["player_color"] == "white" and g["moves_san"])
    vs_e4 = Counter(g["moves_san"][1] for g in games if g["player_color"] == "black" and len(g["moves_san"]) > 1 and g["moves_san"][0] == "e4")
    vs_d4 = Counter(g["moves_san"][1] for g in games if g["player_color"] == "black" and len(g["moves_san"]) > 1 and g["moves_san"][0] == "d4")
    eco = Counter(g["eco"] for g in games if g["eco"])
    summary["openings"] = {
        "white_first_move": dict(white_first.most_common(5)),
        "black_reply_to_e4": dict(vs_e4.most_common(5)),
        "black_reply_to_d4": dict(vs_d4.most_common(5)),
        "top_eco": dict(eco.most_common(10)),
    }

    fig, axes = plt.subplots(1, 3, figsize=(10, 3.2))
    for ax, (title, counter) in zip(axes, (("As White: first move", white_first), ("As Black vs 1.e4", vs_e4), ("As Black vs 1.d4", vs_d4))):
        top = counter.most_common(4)
        n = sum(counter.values())
        names = [m for m, _ in top][::-1]
        pct = [100 * c / n for _, c in top][::-1]
        bars = ax.barh(names, pct, color=BLUE, height=0.6)
        for bar, p in zip(bars, pct):
            ax.text(bar.get_width() + 1.5, bar.get_y() + bar.get_height() / 2, f"{p:.1f}%", va="center", fontsize=9, color=MUTED)
        ax.set_xlim(0, 115)
        ax.set_xticks([])
        ax.grid(False)
        ax.spines["bottom"].set_visible(False)
        ax.set_title(title, fontsize=11)
    save(fig, "opening_repertoire.png")

    fig, ax = plt.subplots(figsize=(8, 3.8))
    top = eco.most_common(10)[::-1]
    bars = ax.barh([c for c, _ in top], [n for _, n in top], color=BLUE, height=0.6)
    for bar in bars:
        ax.text(bar.get_width() + 15, bar.get_y() + bar.get_height() / 2, f"{bar.get_width():,.0f}", va="center", fontsize=9, color=MUTED)
    ax.grid(axis="y", visible=False)
    ax.set_title("Most common openings (ECO code)")
    ax.set_xlabel("games")
    save(fig, "top_eco.png")

    # ---- game length
    plies = [len(g["moves_san"]) for g in games]
    moves = [(p + 1) // 2 for p in plies]
    summary["length"] = {"median_plies": st.median(plies), "mean_plies": round(st.mean(plies), 1),
                         "median_moves": st.median(moves)}
    fig, ax = plt.subplots(figsize=(8, 3.4))
    # two-move bins on whole-number edges, so no bin straddles a move count
    ax.hist([m for m in moves if m <= 120], bins=range(0, 122, 2), color=BLUE, edgecolor=SURFACE, linewidth=0.6)
    ax.axvline(st.median(moves), color=INK, linewidth=1, linestyle="--")
    ax.text(st.median(moves) + 1.5, ax.get_ylim()[1] * 0.92, f"median {st.median(moves):.0f} moves", fontsize=9, color=INK)
    ax.set_title("Game length")
    ax.set_xlabel("moves (each side), games up to 120 moves")
    ax.set_ylabel("games")
    ax.grid(axis="x", visible=False)
    save(fig, "game_length.png")

    # ---- training examples by split and phase
    splits = Counter()
    phases = Counter()
    for g in games:
        for ply in g["player_move_plies"]:
            splits[g["split"]] += 1
            phases["opening (ply 1-20)" if ply <= 20 else "middlegame (21-60)" if ply <= 60 else "endgame (61+)"] += 1
    summary["positions_by_split"] = dict(splits)
    summary["positions_by_phase"] = dict(phases)

    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"\nwrote {OUT / 'summary.json'} and {len(list(OUT.glob('*.png')))} charts to {OUT}")


if __name__ == "__main__":
    main()
