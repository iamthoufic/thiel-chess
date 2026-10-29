"""Prediction parity: training/predict.py must encode positions and rank moves
exactly as the exported model's reference vectors (web/tests/vectors.json).

Run: python -m unittest discover -s tests
"""

import json
import sys
import unittest
from pathlib import Path

import chess
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "training"))

from predict import Predictor, encode  # noqa: E402

VECTORS = json.loads((ROOT / "web" / "tests" / "vectors.json").read_text(encoding="utf-8"))["vectors"]


class PredictTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.predictor = Predictor()

    def test_encoding_matches_reference(self):
        for vec in VECTORS:
            planes, _ = encode(chess.Board(vec["fen"]))
            self.assertEqual(sorted(np.flatnonzero(planes.reshape(-1)).tolist()), sorted(vec["nonzero"]), vec["fen"])

    def test_top_move_matches_reference(self):
        for vec in VECTORS:
            moves, _ = self.predictor.predict(chess.Board(vec["fen"]), top=1)
            self.assertEqual(moves[0][1], vec["top"][0][0], vec["fen"])

    def test_only_legal_moves_and_probabilities(self):
        board = chess.Board()
        moves, win = self.predictor.predict(board, top=20)
        legal = {m.uci() for m in board.legal_moves}
        self.assertTrue(all(uci in legal for _, uci, _ in moves))
        self.assertLessEqual(sum(p for _, _, p in moves), 1.0 + 1e-6)
        self.assertTrue(0.0 <= win <= 1.0)

    def test_his_repertoire(self):
        board = chess.Board()
        self.assertEqual(self.predictor.predict(board, top=1)[0][0][0], "e4")
        board.push_san("e4")
        self.assertEqual(self.predictor.predict(board, top=1)[0][0][0], "c5")


if __name__ == "__main__":
    unittest.main()
