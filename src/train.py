"""Train one model:  python -m src.train --arch lstm --seed 0 [--epochs 30]"""
import argparse
import json
import time

import numpy as np
import torch
import torch.nn.functional as F

from .config import MODEL_DIR, PROC_DIR, RESULT_DIR
from .metrics import summarise
from .models import SeqModel, n_params

GAP_SCALE = 5.0


def device(choice="cpu"):
    """CPU by default: the models are small, and PyTorch's Apple-GPU (mps) backend crashes on
    some macOS versions. Use --device mps or cuda only if you know it works on your machine."""
    return choice


def clv_stats():
    y = np.load(PROC_DIR / "train.npz")["y_clv"]
    return float(y.mean()), float(y.std())


def load(split, meta):
    mu, sd = clv_stats()          # the CLV head is trained on a standardised target (train-set stats)
    z = np.load(PROC_DIR / f"{split}.npz")
    t = lambda a, dt=torch.float32: torch.as_tensor(a, dtype=dt)
    amt = (z["amt"] - meta["amt_mean"]) / meta["amt_std"] * z["mask"]
    return dict(cat=t(z["cat"], torch.long), gap=t(z["gap"] / GAP_SCALE) * t(z["mask"]), amt=t(amt),
                mask=t(z["mask"]), y_cat=t(z["y_cat"], torch.long), y_clv=t((z["y_clv"] - mu) / sd),
                y_clv_raw=t(z["y_clv"]))


def batches(d, bs, shuffle, dev):
    n = len(d["y_cat"])
    idx = torch.randperm(n) if shuffle else torch.arange(n)
    for i in range(0, n, bs):
        j = idx[i:i + bs]
        yield {k: v[j].to(dev) for k, v in d.items()}


@torch.no_grad()
def predict(model, d, dev, bs=1024):
    model.eval()
    s, c = [], []
    for b in batches(d, bs, False, dev):
        logits, clv = model(b["cat"], b["gap"], b["amt"], b["mask"])
        s.append(logits.cpu()); c.append(clv.cpu())
    return torch.cat(s).numpy(), torch.cat(c).numpy()


def loss_fn(model, b):
    logits, clv = model(b["cat"], b["gap"], b["amt"], b["mask"])
    return F.cross_entropy(logits, b["y_cat"]) + F.mse_loss(clv, b["y_clv"])      # weighting 1 : 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arch", default="lstm", choices=["lstm", "transformer"])
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--device", default="cpu", choices=["cpu", "mps", "cuda"])
    a = ap.parse_args()
    torch.manual_seed(a.seed); np.random.seed(a.seed)
    meta = json.loads((PROC_DIR / "meta.json").read_text())
    dev = device(a.device)
    tr, va = load("train", meta), load("val", meta)
    model = SeqModel(a.arch).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    print(f"{a.arch}  params={n_params(model):,}  device={dev}  train={len(tr['y_cat'])}  val={len(va['y_cat'])}")
    best, bad, hist, t0 = 1e9, 0, [], time.time()
    tag = f"{a.arch}_seed{a.seed}"
    MODEL_DIR.mkdir(exist_ok=True); RESULT_DIR.mkdir(exist_ok=True)
    for ep in range(1, a.epochs + 1):
        model.train(); tot, n = 0.0, 0
        for b in batches(tr, a.batch, True, dev):
            opt.zero_grad(); l = loss_fn(model, b); l.backward(); opt.step()
            tot += l.item() * len(b["y_cat"]); n += len(b["y_cat"])
        model.eval()
        with torch.no_grad():
            vl = sum(loss_fn(model, b).item() * len(b["y_cat"]) for b in batches(va, 1024, False, dev)) / len(va["y_cat"])
        hist.append({"epoch": ep, "train_loss": tot / n, "val_loss": vl})
        mark = ""
        if vl < best:
            best, bad, mark = vl, 0, "  *best"
            torch.save(model.state_dict(), MODEL_DIR / f"{tag}.pt")
        else:
            bad += 1
        print(f"epoch {ep:2d}  train {tot / n:.4f}  val {vl:.4f}{mark}")
        if bad >= a.patience:
            break
    model.load_state_dict(torch.load(MODEL_DIR / f"{tag}.pt", map_location=dev))
    s, c = predict(model, va, dev)
    mu, sd = clv_stats()
    m = summarise(s, c * sd + mu, va["y_cat"].numpy(), va["y_clv_raw"].numpy())
    out = {"arch": a.arch, "seed": a.seed, "params": n_params(model), "epochs_run": len(hist),
           "best_epoch": int(np.argmin([h["val_loss"] for h in hist]) + 1),
           "train_minutes": round((time.time() - t0) / 60, 2), "history": hist, "val": m}
    (RESULT_DIR / f"train_{tag}.json").write_text(json.dumps(out, indent=2))
    print("validation:", {k: round(v, 4) for k, v in m.items()}, f" time {out['train_minutes']} min")


if __name__ == "__main__":
    main()
