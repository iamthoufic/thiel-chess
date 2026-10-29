"""Download every game of a Chess.com account as PGN, using the public API.

Chess.com's Published-Data API lists one archive URL per month the player was
active; each archive returns that month's games as JSON with the PGN inside.
Games are de-duplicated by URL and written oldest first.

Usage: python fetch_games.py PeterThiel games.pgn [--months 2016/12]
"""

import argparse
import json
import time
import urllib.request

API = "https://api.chess.com/pub/player/{user}/games/archives"
HEADERS = {"User-Agent": "thiel-chess-dataset/1.0 (research project)", "Accept": "application/json"}


def get_json(url, attempts=5):
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(1.5 * attempt)  # back off politely on rate limits and network errors


def fetch(user, only_months=None):
    archives = get_json(API.format(user=user.lower()))["archives"]
    if only_months:
        archives = [a for a in archives if a[-7:] in only_months]
    games = {}
    for url in archives:  # one request at a time, as the API asks
        month = get_json(url)["games"]
        for game in month:
            if game.get("pgn"):
                games.setdefault(game["url"], game)
        print(f"{url[-7:]}: {len(month)} games")
    return sorted(games.values(), key=lambda g: g.get("end_time", 0)), len(archives)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("user")
    parser.add_argument("out")
    parser.add_argument("--months", nargs="*", help="only these archives, e.g. 2016/12")
    args = parser.parse_args()
    games, n = fetch(args.user, args.months)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n\n".join(g["pgn"].strip() for g in games) + "\n")
    print(f"{len(games)} games from {n} monthly archives -> {args.out}")
