"""Encode the PeterThiel position corpus into compact Maia-2 training arrays.

Each position is stored the way Maia-2 sees it: the board is mirrored when
Black is to move, so the side to move is always "White", and the target move
is mirrored with it. Boards are kept as 64 piece codes instead of the full
18x8x8 float tensor (expanded on the GPU at training time), which keeps the
whole corpus around 130 MB.
"""

import argparse
import gzip
import json
import os
from multiprocessing import Pool
from pathlib import Path

import chess
import numpy as np


HERE = Path(__file__).resolve().parent


# The three helpers below reproduce maia2.utils exactly. They are copied rather
# than imported because maia2.utils imports torch, and loading torch in every
# worker process exhausts memory on an 8 GB machine.
def get_all_possible_moves():
    moves = []
    for rank in range(8):
        for file in range(8):
            square = chess.square(file, rank)
            for piece in (chess.QUEEN, chess.KNIGHT):
                board = chess.Board(None)
                board.set_piece_at(square, chess.Piece(piece, chess.WHITE))
                moves.extend(m.uci() for m in board.legal_moves)
    for file in "abcdefgh":
        targets = [file] + ([chr(ord(file) - 1)] if file != "a" else []) + ([chr(ord(file) + 1)] if file != "h" else [])
        for target in targets:
            moves.extend(f"{file}7{target}8{piece}" for piece in "qrbn")
    return moves


def mirror_move(uci):
    flip = lambda sq: sq[0] + str(9 - int(sq[1]))
    return flip(uci[:2]) + flip(uci[2:4]) + uci[4:]


def elo_category(elo):
    if elo < 1100:
        return 0
    if elo >= 2000:
        return 10
    return (elo - 1100) // 100 + 1
DEFAULT_INPUT = HERE.parent / "data" / "processed" / "peterthiel_positions.jsonl.gz"
DEFAULT_OUTPUT = HERE / "cache"

SPLITS = {"train": 0, "validation": 1, "test": 2}
RESULTS = {"win": 1, "draw": 0, "loss": -1}
ALL_MOVES = get_all_possible_moves()
MOVE_INDEX = {move: i for i, move in enumerate(ALL_MOVES)}


def encode(fen):
    """Return (piece codes, castling bits, ep square) for the side-to-move view."""
    board = chess.Board(fen)
    if board.turn == chess.BLACK:
        board = board.mirror()
    codes = np.zeros(64, dtype=np.uint8)
    for square, piece in board.piece_map().items():
        codes[square] = piece.piece_type + (0 if piece.color == chess.WHITE else 6)
    castling = (
        board.has_kingside_castling_rights(chess.WHITE)
        | board.has_queenside_castling_rights(chess.WHITE) << 1
        | board.has_kingside_castling_rights(chess.BLACK) << 2
        | board.has_queenside_castling_rights(chess.BLACK) << 3
    )
    ep = board.ep_square if board.ep_square is not None else -1
    return board, codes, castling, ep


def process(lines):
    n = len(lines)
    part = {
        "codes": np.zeros((n, 64), dtype=np.uint8),
        "castling": np.zeros(n, dtype=np.uint8),
        "ep": np.zeros(n, dtype=np.int8),
        "label": np.zeros(n, dtype=np.int16),
        "elo_self": np.zeros(n, dtype=np.uint8),
        "elo_oppo": np.zeros(n, dtype=np.uint8),
        "value": np.zeros(n, dtype=np.int8),
        "split": np.zeros(n, dtype=np.uint8),
        "ply": np.zeros(n, dtype=np.uint16),
        "game": np.zeros(n, dtype=np.int64),
        "legal_count": np.zeros(n, dtype=np.int64),
    }
    legal_flat = []
    for i, line in enumerate(lines):
        row = json.loads(line)
        board, codes, castling, ep = encode(row["fen"])
        move = row["move_uci"]
        if row["fen"].split(" ")[1] == "b":
            move = mirror_move(move)
        part["codes"][i] = codes
        part["castling"][i] = castling
        part["ep"][i] = ep
        part["label"][i] = MOVE_INDEX[move]
        part["elo_self"][i] = elo_category(row["player_elo"])
        part["elo_oppo"][i] = elo_category(row["opponent_elo"])
        part["value"][i] = RESULTS[row["result"]]
        part["split"][i] = SPLITS[row["split"]]
        part["ply"][i] = row["ply"]
        part["game"][i] = int(row["game_id"])
        if row["split"] != "train":
            legal = [MOVE_INDEX[m.uci()] for m in board.legal_moves]
            legal_flat.extend(legal)
            part["legal_count"][i] = len(legal)
    part["legal_flat"] = np.array(legal_flat, dtype=np.int16)
    return part


def batches(path, size):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        chunk = []
        for line in f:
            chunk.append(line)
            if len(chunk) == size:
                yield chunk
                chunk = []
        if chunk:
            yield chunk


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    parts = []
    total = 0
    with Pool(args.workers) as pool:
        for i, part in enumerate(pool.imap(process, batches(args.input, 5000))):
            parts.append(part)
            total += len(part["label"])
            if i % 40 == 0:
                print(f"encoded {total:,} positions", flush=True)

    arrays = {key: np.concatenate([p[key] for p in parts]) for key in parts[0]}
    arrays["legal_offsets"] = np.concatenate([[0], np.cumsum(arrays.pop("legal_count"))])
    np.savez(args.output / "positions.npz", **arrays)
    counts = {name: int((arrays["split"] == idx).sum()) for name, idx in SPLITS.items()}
    print(f"saved {total:,} positions {counts} to {args.output / 'positions.npz'}")


if __name__ == "__main__":
    main()
