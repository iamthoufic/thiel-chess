"""Fine-tune the pretrained Maia-2 blitz model on PeterThiel's own moves.

The model, loss and input format are Maia-2's; only the data changes. The
original Maia-2 is scored on the held-out test games first, so the report shows
how much the fine-tune moved the model toward this one player.
"""

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from maia2 import model as maia2_model

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
CHECKPOINTS = HERE / "checkpoints"
# fp16 is ~7x slower than fp32 on GPUs without tensor cores (e.g. GTX 1650);
# pass --amp on RTX-class cards.
AMP = False
PHASES = {"opening (ply 1-20)": (1, 20), "middlegame (21-60)": (21, 60), "endgame (61+)": (61, 10_000)}


class Corpus:
    def __init__(self, path, device):
        data = np.load(path)
        self.device = device
        self.codes = torch.from_numpy(data["codes"])
        self.castling = torch.from_numpy(data["castling"])
        self.ep = torch.from_numpy(data["ep"].astype(np.int64))
        self.label = torch.from_numpy(data["label"].astype(np.int64))
        self.elo_self = torch.from_numpy(data["elo_self"].astype(np.int64))
        self.elo_oppo = torch.from_numpy(data["elo_oppo"].astype(np.int64))
        self.value = torch.from_numpy(data["value"].astype(np.float32))
        self.split = data["split"]
        self.ply = data["ply"]
        self.legal_offsets = data["legal_offsets"]
        self.legal_flat = data["legal_flat"].astype(np.int64)

    def indices(self, split):
        return np.flatnonzero(self.split == {"train": 0, "validation": 1, "test": 2}[split])

    def boards(self, idx):
        """Expand piece codes into Maia-2's 18x8x8 input on the device."""
        codes = self.codes[idx].to(self.device, non_blocking=True).long()
        planes = F.one_hot(codes, 13)[:, :, 1:].permute(0, 2, 1).float()  # 12 piece planes
        n = len(idx)
        turn = torch.ones(n, 1, 64, device=self.device)  # side to move is always White after mirroring
        bits = self.castling[idx].to(self.device).long()
        castling = torch.stack([(bits >> k) & 1 for k in range(4)], 1).float()[:, :, None].expand(n, 4, 64)
        ep = self.ep[idx].to(self.device)
        ep_plane = torch.zeros(n, 1, 64, device=self.device)
        has_ep = ep >= 0
        ep_plane[has_ep, 0, ep[has_ep]] = 1.0
        return torch.cat([planes, turn, castling, ep_plane], 1).view(n, 18, 8, 8)

    def legal_mask(self, idx, n_moves):
        mask = torch.zeros(len(idx), n_moves, dtype=torch.bool)
        for row, i in enumerate(idx):
            mask[row, self.legal_flat[self.legal_offsets[i]:self.legal_offsets[i + 1]]] = True
        return mask.to(self.device)

    def batch(self, idx):
        idx_t = torch.from_numpy(idx)
        return (
            self.boards(idx_t),
            self.label[idx_t].to(self.device),
            self.elo_self[idx_t].to(self.device),
            self.elo_oppo[idx_t].to(self.device),
            self.value[idx_t].to(self.device),
        )


@torch.no_grad()
def evaluate(model, corpus, idx, batch_size, n_moves, by_phase=False):
    model.eval()
    correct = top3 = 0
    nll = 0.0
    phase_hits = {name: [0, 0] for name in PHASES}
    for start in range(0, len(idx), batch_size):
        part = idx[start:start + batch_size]
        boards, labels, elo_self, elo_oppo, _ = corpus.batch(part)
        with torch.autocast("cuda", dtype=torch.float16, enabled=AMP):
            logits, _, _ = model(boards, elo_self, elo_oppo)
        logits = logits.float().masked_fill(~corpus.legal_mask(part, n_moves), float("-inf"))
        log_probs = logits.log_softmax(-1)
        nll += -log_probs.gather(1, labels[:, None]).sum().item()
        hits = (logits.argmax(-1) == labels).cpu().numpy()
        correct += hits.sum()
        top3 += (logits.topk(3, -1).indices == labels[:, None]).any(-1).sum().item()
        if by_phase:
            plies = corpus.ply[part]
            for name, (lo, hi) in PHASES.items():
                sel = (plies >= lo) & (plies <= hi)
                phase_hits[name][0] += int(hits[sel].sum())
                phase_hits[name][1] += int(sel.sum())
    n = len(idx)
    result = {"top1": correct / n, "top3": top3 / n, "nll": nll / n, "positions": n}
    if by_phase:
        result["by_phase"] = {k: (h / t if t else None) for k, (h, t) in phase_hits.items()}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--lr", type=float, default=5e-5)
    parser.add_argument("--weight-decay", type=float, default=1e-5)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--evals-per-epoch", type=int, default=4)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--max-steps", type=int, default=0, help="stop early (smoke tests)")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--amp", action="store_true", help="fp16 mixed precision (only faster on tensor-core GPUs)")
    parser.add_argument("--init", type=Path, help="continue from these weights with a fresh schedule (warm restart); "
                        "keeps the baseline and best score already in metrics.json")
    parser.add_argument("--stage", default="1", help="label stored with each validation result")
    args = parser.parse_args()

    global AMP
    AMP = args.amp
    torch.backends.cudnn.benchmark = True
    torch.manual_seed(42)
    np.random.seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device} {torch.cuda.get_device_name(0) if device.type == 'cuda' else ''}", flush=True)
    corpus = Corpus(CACHE / "positions.npz", device)
    train_idx, val_idx, test_idx = (corpus.indices(s) for s in ("train", "validation", "test"))
    print(f"positions: train {len(train_idx):,} | validation {len(val_idx):,} | test {len(test_idx):,}", flush=True)

    model = maia2_model.from_pretrained("blitz", device=str(device), save_root=str(CACHE / "maia2_models"))
    n_moves = model.fc_1.out_features
    CHECKPOINTS.mkdir(exist_ok=True)
    metrics_path = HERE / "metrics.json"
    keep_metrics = (args.resume or args.init) and metrics_path.exists()
    metrics = json.loads(metrics_path.read_text()) if keep_metrics else {}
    if args.init:
        model.load_state_dict(torch.load(args.init, map_location=device, weights_only=True))
        print(f"warm restart from {args.init} (stage {args.stage})", flush=True)

    if "baseline_test" not in metrics:
        print("scoring original Maia-2 blitz on the test games...", flush=True)
        metrics["baseline_test"] = evaluate(model, corpus, test_idx, 1024, n_moves, by_phase=True)
        metrics["baseline_validation"] = evaluate(model, corpus, val_idx, 1024, n_moves)
        print(f"baseline test: {metrics['baseline_test']}", flush=True)
        metrics_path.write_text(json.dumps(metrics, indent=2))

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scaler = torch.amp.GradScaler(enabled=AMP)
    steps_per_epoch = math.ceil(len(train_idx) / args.batch_size)
    total_steps = int(steps_per_epoch * args.epochs)
    if args.max_steps:
        total_steps = min(total_steps, args.max_steps)
    warmup = min(500, total_steps // 10)
    schedule = torch.optim.lr_scheduler.LambdaLR(
        optimizer,
        lambda s: (s + 1) / warmup if s < warmup else 0.5 * (1 + math.cos(math.pi * (s - warmup) / max(1, total_steps - warmup))),
    )
    eval_every = max(1, steps_per_epoch // args.evals_per_epoch)

    step = 0
    best = metrics.get("best_validation", {"nll": float("inf")})
    history = metrics.setdefault("history", [])
    if args.resume and (CHECKPOINTS / "last.pt").exists():
        state = torch.load(CHECKPOINTS / "last.pt", map_location=device, weights_only=True)
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        schedule.load_state_dict(state["schedule"])
        scaler.load_state_dict(state["scaler"])
        step = state["step"]
        print(f"resumed at step {step}", flush=True)

    rng = np.random.default_rng(42)
    stale = 0
    started = time.time()
    start_step = step
    epoch_order = None
    while step < total_steps:
        epoch, offset = divmod(step, steps_per_epoch)
        if epoch_order is None or offset == 0:
            # a different shuffle per stage, so a warm restart does not replay stage 1's order
            epoch_order = np.random.default_rng(1000 * int(args.stage) + epoch).permutation(train_idx)
        part = epoch_order[offset * args.batch_size:(offset + 1) * args.batch_size]
        model.train()
        # The GPU may be shared with a browser or other apps; a brief memory
        # squeeze should cost a retry, not the whole run.
        for attempt in range(4):
            try:
                boards, labels, elo_self, elo_oppo, value = corpus.batch(part)
                with torch.autocast("cuda", dtype=torch.float16, enabled=AMP):
                    logits, _, value_pred = model(boards, elo_self, elo_oppo)
                    loss_policy = F.cross_entropy(logits.float(), labels)
                    loss_value = F.mse_loss(value_pred.float(), value)
                    loss = loss_policy + args.value_coef * loss_value
                optimizer.zero_grad(set_to_none=True)
                scaler.scale(loss).backward()
                break
            except RuntimeError as error:
                if "out of memory" not in str(error) or attempt == 3:
                    raise
                print(f"GPU out of memory at step {step}; retrying in 10 s", flush=True)
                optimizer.zero_grad(set_to_none=True)
                boards = labels = logits = value_pred = loss = None
                torch.cuda.empty_cache()
                time.sleep(10)
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(optimizer)
        scaler.update()
        schedule.step()
        step += 1

        if step % 100 == 0:
            rate = (step - start_step) / (time.time() - started)
            eta = (total_steps - step) / rate / 60 if rate else 0
            print(f"step {step}/{total_steps} policy {loss_policy.item():.3f} value {loss_value.item():.3f} "
                  f"lr {schedule.get_last_lr()[0]:.2e} eta {eta:.0f} min", flush=True)

        if step % eval_every == 0 or step == total_steps:
            val = evaluate(model, corpus, val_idx, 1024, n_moves)
            val["step"] = step
            val["epoch"] = round(step / steps_per_epoch, 2)
            val["stage"] = args.stage
            history.append(val)
            print(f"validation @ epoch {val['epoch']}: top1 {val['top1']:.4f} top3 {val['top3']:.4f} nll {val['nll']:.4f}", flush=True)
            if val["nll"] < best["nll"]:
                best = val
                stale = 0
                torch.save(model.state_dict(), CHECKPOINTS / "best.pt")
            else:
                stale += 1
            metrics["best_validation"] = best
            torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(), "schedule": schedule.state_dict(),
                        "scaler": scaler.state_dict(), "step": step}, CHECKPOINTS / "last.pt")
            metrics_path.write_text(json.dumps(metrics, indent=2))
            if stale >= args.patience:
                print("validation stopped improving; stopping early", flush=True)
                break

    model.load_state_dict(torch.load(CHECKPOINTS / "best.pt", map_location=device, weights_only=True))
    metrics["finetuned_test"] = evaluate(model, corpus, test_idx, 1024, n_moves, by_phase=True)
    metrics["config"] = vars(args)
    metrics_path.write_text(json.dumps(metrics, indent=2))
    b, f = metrics["baseline_test"], metrics["finetuned_test"]
    print(f"test top-1: original Maia-2 {b['top1']:.4f} -> fine-tuned {f['top1']:.4f}", flush=True)
    print(f"test top-3: original Maia-2 {b['top3']:.4f} -> fine-tuned {f['top3']:.4f}", flush=True)


if __name__ == "__main__":
    main()
