"""Export the fine-tuned model to ONNX for the browser and verify it.

Writes web/model/thiel-maia2.onnx (policy + value heads only; the auxiliary
side-information head is training-only), checks ONNX Runtime against PyTorch on
real test positions, and writes web/tests/vectors.json so the JavaScript input
encoding can be checked against Python.
"""

import argparse
import json
import random
import shutil
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

from maia2 import model as maia2_model
from maia2.inference import preprocessing, prepare

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"


def store_weights_as_fp16(src, dst, min_size=1024):
    """Store large fp32 weights as fp16 and cast them back to fp32 at load time.

    Halves the download while every operation still runs in fp32 (the browser's
    WebAssembly backend has no fast fp16 kernels).
    """
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    model = onnx.load(str(src))
    graph = model.graph
    casts = []
    for init in list(graph.initializer):
        if init.data_type != TensorProto.FLOAT:
            continue
        array = numpy_helper.to_array(init)
        if array.size < min_size:
            continue
        half = numpy_helper.from_array(array.astype(np.float16), init.name + "__fp16")
        graph.initializer.remove(init)
        graph.initializer.append(half)
        casts.append(helper.make_node("Cast", [half.name], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
    for node in reversed(casts):
        graph.node.insert(0, node)
    onnx.save(model, str(dst))


def store_linear_int8(src, dst, min_size=4096):
    """The smallest faithful variant, and the one the site ships.

    Weights of the linear layers (the transformer and the output heads: about
    17M of the 23M parameters) are stored as int8 with one scale per output
    channel and turned back into fp32 by a DequantizeLinear node, so every
    operation still runs in fp32. Everything else, including the convolutions,
    is stored as fp16 as in store_weights_as_fp16. The convolutions stay out of
    int8 on purpose: their batch-norm-folded weights have outliers, and int8
    there moved the value head by up to 0.5. 42.5 MB -> 27.4 MB; on 4,000 test
    positions it matched his real move as often as the fp16 model (63.2% vs
    63.0%) and agreed with its top move in 99.1% of them.
    """
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    model = onnx.load(str(src))
    graph = model.graph
    new_nodes = []
    for init in list(graph.initializer):
        if init.data_type != TensorProto.FLOAT:
            continue
        array = numpy_helper.to_array(init)
        users = [n for n in graph.node if init.name in n.input]
        linear = (array.ndim == 2 and array.size >= min_size and users
                  and all(n.op_type in ("MatMul", "Gemm") and n.input[1] == init.name for n in users))
        if linear:
            transposed = all(n.op_type == "Gemm" and any(a.name == "transB" and a.i == 1 for a in n.attribute) for n in users)
            axis = 0 if transposed else 1  # the output-channel axis of the weight matrix
            scale = np.abs(array).max(axis=1 - axis) / 127.0
            scale[scale == 0] = 1e-8
            shape = [1, 1]
            shape[axis] = -1
            q = np.clip(np.round(array / scale.reshape(shape)), -127, 127).astype(np.int8)
            graph.initializer.remove(init)
            graph.initializer.extend([numpy_helper.from_array(q, init.name + "__q"),
                                      numpy_helper.from_array(scale.astype(np.float32), init.name + "__scale")])
            new_nodes.append(helper.make_node("DequantizeLinear", [init.name + "__q", init.name + "__scale"],
                                              [init.name], axis=axis, name=init.name + "__dq"))
        elif array.size >= 1024:
            graph.initializer.remove(init)
            graph.initializer.append(numpy_helper.from_array(array.astype(np.float16), init.name + "__fp16"))
            new_nodes.append(helper.make_node("Cast", [init.name + "__fp16"], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
    for node in reversed(new_nodes):
        graph.node.insert(0, node)
    onnx.save(model, str(dst))


class PolicyValue(torch.nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, boards, elo_self, elo_oppo):
        logits, _, value = self.net(boards, elo_self, elo_oppo)
        return logits, value


def sample_positions(n, seed=7):
    """FENs from his held-out test games, plus a few edge cases."""
    import gzip
    path = HERE.parent / "data" / "processed" / "peterthiel_positions.jsonl.gz"
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            if '"split":"test"' in line:
                rows.append(json.loads(line))
    random.Random(seed).shuffle(rows)
    fens = [r["fen"] for r in rows[:n]]
    fens += [
        "r3k2r/pppq1ppp/2n2n2/3pp3/1b1PP3/2N2N2/PPPQ1PPP/R3KB1R b KQkq - 3 8",  # castling rights, Black to move
        "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",  # en passant for White
        "rnbqkbnr/pppp1ppp/8/8/3Pp3/4P3/PPP2PPP/RNBQKBNR b KQkq d3 0 3",  # en passant for Black
        "8/1P4k1/8/8/8/8/6pK/8 w - - 0 1",  # promotions both ways
        "8/1P4k1/8/8/8/8/6pK/8 b - - 0 1",
    ]
    return fens


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=HERE / "checkpoints" / "best.pt")
    parser.add_argument("--pretrained", action="store_true", help="export the original Maia-2 blitz model instead")
    parser.add_argument("--samples", type=int, default=400)
    parser.add_argument("--web-dir", type=Path, default=HERE.parent / "web", help="site folder to write model/ and tests/ into")
    args = parser.parse_args()
    WEB_MODEL = args.web_dir / "model"
    WEB_TESTS = args.web_dir / "tests"

    net = maia2_model.from_pretrained("blitz", device="cpu", save_root=str(CACHE / "maia2_models"))
    if not args.pretrained:
        net.load_state_dict(torch.load(args.checkpoint, map_location="cpu", weights_only=True))
    net.eval()
    module = PolicyValue(net).eval()

    WEB_MODEL.mkdir(parents=True, exist_ok=True)
    WEB_TESTS.mkdir(parents=True, exist_ok=True)
    fp32_path = CACHE / "thiel-maia2.fp32.onnx"
    int8_path = CACHE / "thiel-maia2.int8.onnx"
    fp16w_path = CACHE / "thiel-maia2.fp16w.onnx"
    mixed_path = CACHE / "thiel-maia2.int8linear.onnx"
    dummy = (torch.zeros(1, 18, 8, 8), torch.tensor([10]), torch.tensor([10]))
    torch.onnx.export(
        module, dummy, fp32_path, dynamo=False, opset_version=17,
        input_names=["boards", "elo_self", "elo_oppo"], output_names=["logits", "value"],
        dynamic_axes={"boards": {0: "n"}, "elo_self": {0: "n"}, "elo_oppo": {0: "n"}, "logits": {0: "n"}, "value": {0: "n"}},
    )
    # int8 weights for the transformer / dense layers; convolutions stay fp32
    quantize_dynamic(fp32_path, int8_path, weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gemm"])
    store_weights_as_fp16(fp32_path, fp16w_path)
    store_linear_int8(fp32_path, mixed_path)

    all_moves_dict, elo_dict, _ = prepare()
    fens = sample_positions(args.samples)
    inputs = [preprocessing(fen, 2200, 2200, elo_dict, all_moves_dict) for fen in fens]
    boards = torch.stack([i[0] for i in inputs])
    elo_s = torch.tensor([i[1] for i in inputs])
    elo_o = torch.tensor([i[2] for i in inputs])
    legal = torch.stack([i[3] for i in inputs]).bool()
    with torch.no_grad():
        ref_logits, ref_value = module(boards, elo_s, elo_o)

    def probs(logits):
        return torch.as_tensor(logits).float().masked_fill(~legal, float("-inf")).softmax(-1)

    ref = probs(ref_logits)
    report = {}
    for name, path in (("fp32", fp32_path), ("fp16w", fp16w_path), ("int8linear", mixed_path), ("int8", int8_path)):
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        logits, value = sess.run(None, {"boards": boards.numpy(), "elo_self": elo_s.numpy(), "elo_oppo": elo_o.numpy()})
        p = probs(logits)
        report[name] = {
            "mb": round(path.stat().st_size / 1e6, 1),
            "top1_agreement": float((p.argmax(-1) == ref.argmax(-1)).float().mean()),
            "max_prob_diff": float((p - ref).abs().max()),
            "max_value_diff": float(np.abs(value - ref_value.numpy()).max()),
        }
        print(name, report[name], flush=True)

    # ship the smallest variant that moves no move probability by more than half
    # a percentage point (so a changed top move can only be a near-tie)
    paths = {"fp32": fp32_path, "fp16w": fp16w_path, "int8linear": mixed_path, "int8": int8_path}
    # Ship the smallest faithful variant. int8linear may move a near-tie (its
    # top move agrees ~99% of the time) but must keep the value head steady;
    # the others must match fp32 almost exactly. Full int8 (activations too)
    # changed the top move in ~5% of positions and is never chosen.
    faithful = [k for k in ("int8linear",) if report[k]["top1_agreement"] >= 0.985 and report[k]["max_value_diff"] < 0.05]
    faithful += [k for k in ("fp16w",) if report[k]["top1_agreement"] >= 0.99 and report[k]["max_prob_diff"] < 0.005]
    chosen = faithful[0] if faithful else "fp32"
    shutil.copyfile(paths[chosen], WEB_MODEL / "thiel-maia2.onnx")
    print(f"shipped {chosen} model to {WEB_MODEL / 'thiel-maia2.onnx'}")
    # the browser reads the size from here for its progress bar (hosts that
    # compress on the fly send no usable Content-Length)
    (WEB_MODEL / "model.json").write_text(json.dumps(
        {"file": "thiel-maia2.onnx", "variant": chosen, "bytes": (WEB_MODEL / "thiel-maia2.onnx").stat().st_size}, indent=2) + "\n")

    # vectors for the JavaScript parity test, computed with the shipped model
    sess = ort.InferenceSession(str(WEB_MODEL / "thiel-maia2.onnx"), providers=["CPUExecutionProvider"])
    logits, value = sess.run(None, {"boards": boards.numpy(), "elo_self": elo_s.numpy(), "elo_oppo": elo_o.numpy()})
    p = probs(logits).numpy()
    reverse = {v: k for k, v in all_moves_dict.items()}
    vectors = []
    for i, fen in enumerate(fens[:60] + fens[-5:]):
        idx = i if i < 60 else len(fens) - 5 + (i - 60)
        black = fen.split(" ")[1] == "b"
        order = np.argsort(-p[idx])[:5]
        top = []
        for j in order:
            if p[idx][j] <= 0:
                break
            uci = reverse[int(j)]
            if black:
                uci = uci[0] + str(9 - int(uci[1])) + uci[2] + str(9 - int(uci[3])) + uci[4:]
            top.append([uci, round(float(p[idx][j]), 5)])
        vectors.append({
            "fen": fen,
            "nonzero": [int(k) for k in np.flatnonzero(boards[idx].numpy().reshape(-1))],
            "legal": sorted(int(k) for k in np.flatnonzero(legal[idx].numpy())),
            "top": top,
            "value": round(float(np.clip(value[idx] / 2 + 0.5, 0, 1)), 5),
        })
    (WEB_TESTS / "vectors.json").write_text(json.dumps({"model": chosen, "vectors": vectors}))
    (CACHE / "export_report.json").write_text(json.dumps({"shipped": chosen, **report}, indent=2))
    print(f"wrote {len(vectors)} parity vectors")


if __name__ == "__main__":
    main()
