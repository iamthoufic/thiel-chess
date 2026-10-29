# Data

The corpus is every public game of the Chess.com account **`PeterThiel`**:
43,797 games (18 Dec 2016 → 21 Oct 2026) and 1,715,752 of his own moves.

The game records themselves are **not committed** (see `../THIRD_PARTY_NOTICES.md`
and `DATA_CARD.md`). The two scripts in `../pipeline/` rebuild them from the
official API in a few minutes; the manifests in `manifests/` record the exact
counts and SHA-256 checksums of the build the model was trained on, so you can
check you have the same data.

> **Authorization.** Chess.com's User Agreement requires prior written
> authorization to use its content for training models. Obtain it before you
> run the pipeline.

## Rebuild

```bash
npm install            # chess.js, used to replay and validate every game
npm run data:fetch     # download every monthly archive  -> data/raw/
npm run data:build     # validate, split, write JSONL     -> data/processed/
```

`data:fetch` requests one month at a time, retries on rate limits (HTTP 429)
and server errors with a growing back-off, and on later runs fetches only the
months from the newest one it already has. Set `CHESSCOM_USER_AGENT` to a
user agent with your contact details for automated runs, as the API asks.

To target another account: `node pipeline/fetch-games.mjs --username <name>`
and `node pipeline/build-dataset.mjs --username <name>`.

A dependency-free Python alternative to `data:fetch` is
`python pipeline/fetch_games.py PeterThiel data/raw/peterthiel_chesscom_all_games.pgn`.

## Files

| Path | What it holds |
| --- | --- |
| `raw/peterthiel_chesscom_all_games.pgn(.gz)` | Every game as PGN, de-duplicated by game URL, oldest first, with clock comments |
| `processed/peterthiel_games.jsonl.gz` | One record per game: players, ratings, result, time control, ECO, all moves (UCI + SAN), which plies were his, split |
| `processed/peterthiel_positions.jsonl.gz` | One record per move **he** made: the FEN before it, the move, ratings, result, split. This is the training set. |
| `processed/peterthiel_games.clean.pgn.gz` | Comment-free PGN with only the essential headers |
| `manifests/source.json` | Fetch log: archives requested, games added, raw-file checksums |
| `manifests/dataset.json` | Counts per split, results, colours, parse errors (none), artifact checksums |

## Cleaning and splitting

1. Normalise line endings and whitespace.
2. Replay every move with chess.js. An illegal or unparsable game stops the
   build instead of being dropped silently (0 errors in this corpus).
3. Check `PeterThiel` is a player; record his colour, result and both ratings.
4. Strip clock comments and non-essential headers from the clean PGN.
5. Split **chronologically by game**: oldest 90% train, next 5% validation,
   newest 5% test. Every position of a game stays in one split, so no game
   leaks into evaluation, and the test set is his most recent play.

| Split | Games | His positions |
| --- | ---: | ---: |
| train | 39,417 | 1,544,158 |
| validation | 2,190 | 85,179 |
| test | 2,190 | 86,415 |

## Record schemas

**Position** (`peterthiel_positions.jsonl.gz`):

```json
{"schema_version":1,"game_id":"1234567890","played_at_utc":"2024-03-01T12:00:00.000Z",
 "split":"train","ply":1,"player_color":"white","fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
 "move_uci":"e2e4","move_san":"e4","time_control":"180","player_elo":2100,"opponent_elo":2080,"result":"win"}
```

**Game** (`peterthiel_games.jsonl.gz`): `game_id`, `source_url`, `played_at_utc`,
`split`, `player_color`, `opponent`, `player_elo`, `opponent_elo`, `result`,
`pgn_result`, `time_control`, `eco`, `moves_uci[]`, `moves_san[]`,
`player_move_plies[]`.
