"""Ask the fine-tuned model what PeterThiel would play in a position.

Runs the exported ONNX model (web/model/thiel-maia2.onnx) with ONNX Runtime,
so it needs neither PyTorch nor a GPU. The board is encoded exactly as in
training: 18 planes of 8x8, mirrored so the side to move is always White.

Examples:
    python training/predict.py                              # starting position
    python training/predict.py --moves e4 c5 Nf3            # after 1.e4 c5 2.Nf3
    python training/predict.py "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"
    python training/predict.py --top 8 --json --moves d4
"""

import argparse
import json
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort

from prepare_data import elo_category, get_all_possible_moves, mirror_move

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL = HERE.parent / "web" / "model" / "thiel-maia2.onnx"
ALL_MOVES = get_all_possible_moves()
MOVE_INDEX = {move: i for i, move in enumerate(ALL_MOVES)}


def encode(board):
    """The 18x8x8 network input for `board`, from the side to move's view.

    Planes 0-11: White then Black pawn, knight, bishop, rook, queen, king.
    Plane 12: side to move (always White after mirroring). Planes 13-16:
    castling rights (White king-, queen-side, Black king-, queen-side).
    Plane 17: the en-passant square. Row = rank, column = file, a1 first.
    """
    if board.turn == chess.BLACK:
        board = board.mirror()
    planes = np.zeros((18, 64), dtype=np.float32)
    for square, piece in board.piece_map().items():
        planes[piece.piece_type - 1 + (0 if piece.color == chess.WHITE else 6), square] = 1
    planes[12] = 1
    rights = [
        board.has_kingside_castling_rights(chess.WHITE), board.has_queenside_castling_rights(chess.WHITE),
        board.has_kingside_castling_rights(chess.BLACK), board.has_queenside_castling_rights(chess.BLACK),
    ]
    for k, has in enumerate(rights):
        if has:
            planes[13 + k] = 1
    if board.ep_square is not None:
        planes[17, board.ep_square] = 1
    return planes.reshape(18, 8, 8), board


class Predictor:
    def __init__(self, model=DEFAULT_MODEL, threads=0):
        options = ort.SessionOptions()
        if threads:
            options.intra_op_num_threads = threads
        self.session = ort.InferenceSession(str(model), options, providers=["CPUExecutionProvider"])

    def predict(self, board, top=5, elo_self=2200, elo_oppo=2200):
        """His most likely moves in `board` as [(san, uci, probability)], and
        the model's estimate of his chance to win from here (0 to 1)."""
        planes, seen = encode(board)
        feeds = {
            "boards": planes[None],
            "elo_self": np.array([elo_category(elo_self)], dtype=np.int64),
            "elo_oppo": np.array([elo_category(elo_oppo)], dtype=np.int64),
        }
        logits, value = self.session.run(None, feeds)
        logits = logits[0].astype(np.float64)
        legal = np.full(len(ALL_MOVES), -np.inf)
        for move in seen.legal_moves:
            legal[MOVE_INDEX[move.uci()]] = 0.0
        logits = logits + legal
        probs = np.exp(logits - logits.max())
        probs /= probs.sum()
        moves = []
        for i in np.argsort(-probs)[:top]:
            if probs[i] <= 0:
                break
            uci = ALL_MOVES[i] if board.turn == chess.WHITE else mirror_move(ALL_MOVES[i])
            move = chess.Move.from_uci(uci)
            moves.append((board.san(move), uci, float(probs[i])))
        win = float(np.clip(value[0] / 2 + 0.5, 0, 1))
        return moves, win


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fen", nargs="?", default=chess.STARTING_FEN, help="position (FEN); default: the start")
    parser.add_argument("--moves", nargs="*", default=[], help="moves to play first, in SAN or UCI")
    parser.add_argument("--top", type=int, default=5, help="how many moves to list")
    parser.add_argument("--elo", type=int, default=2200, help="his rating fed to the model")
    parser.add_argument("--opponent-elo", type=int, default=2200, help="the opponent's rating fed to the model")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = parser.parse_args()

    board = chess.Board(args.fen)
    for text in args.moves:
        try:
            board.push_san(text)
        except ValueError:
            board.push_uci(text)
    if board.is_game_over():
        raise SystemExit(f"The game is over in this position ({board.result()}).")

    moves, win = Predictor(args.model).predict(board, args.top, args.elo, args.opponent_elo)
    if args.json:
        print(json.dumps({"fen": board.fen(), "win": round(win, 4),
                          "moves": [{"san": s, "uci": u, "p": round(p, 4)} for s, u, p in moves]}, indent=2))
        return
    side = "White" if board.turn == chess.WHITE else "Black"
    print(f"{board.fen()}\nPeterThiel to move as {side} - model's win chance for him: {win:.0%}\n")
    for rank, (san, uci, p) in enumerate(moves, 1):
        print(f"  {rank}. {san:<8} {uci:<6} {p:6.1%}  {'#' * round(p * 40)}")


if __name__ == "__main__":
    main()
