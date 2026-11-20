"""Score every trained model on the TEST split, average over seeds, compare with the baselines,
and pick the model that the two pipelines will serve (lowest validation loss).
    python -m src.evaluate"""
import json

import numpy as np
import torch

from .config import MODEL_DIR, RESULT_DIR
from .metrics import summarise
from .models import SeqModel
from .train import clv_stats, device, load, predict
from .train import PROC_DIR

KEYS = ["top1", "top3", "f1", "clv_mae", "clv_rmse"]


def main():
    meta = json.loads((PROC_DIR / "meta.json").read_text())
    te, mu_sd = load("test", meta), clv_stats()
    mu, sd = mu_sd
    per_model, best = {}, None
    for arch in ("lstm", "transformer"):
        runs = []
        for f in sorted(RESULT_DIR.glob(f"train_{arch}_seed*.json")):
            info = json.loads(f.read_text())
            model = SeqModel(arch)
            model.load_state_dict(torch.load(MODEL_DIR / f"{arch}_seed{info['seed']}.pt", map_location="cpu"))
            s, c = predict(model, te, "cpu")
            m = summarise(s, c * sd + mu, te["y_cat"].numpy(), te["y_clv_raw"].numpy())
            m.update(seed=info["seed"], best_val_loss=min(h["val_loss"] for h in info["history"]))
            runs.append(m)
            if best is None or m["best_val_loss"] < best["val_loss"]:
                best = {"arch": arch, "seed": info["seed"], "val_loss": m["best_val_loss"]}
        per_model[arch] = runs
    base = json.loads((RESULT_DIR / "baselines_test.json").read_text())
    print(f"{'model':<26}" + "".join(f"{k:>11}" for k in KEYS))
    print(f"{'baseline (Markov/ridge)':<26}" + "".join(f"{base[k]:>11.3f}" if 'clv' not in k else f"{base[k]:>11.0f}" for k in KEYS))
    summary = {"baseline": base}
    for arch, runs in per_model.items():
        row = {k: (float(np.mean([r[k] for r in runs])), float(np.std([r[k] for r in runs]))) for k in KEYS}
        summary[arch] = {"mean_std": row, "runs": runs}
        print(f"{arch + f' (mean of {len(runs)})':<26}" + "".join(
            f"{row[k][0]:>11.3f}" if 'clv' not in k else f"{row[k][0]:>11.0f}" for k in KEYS))
        print(f"{'   std over seeds':<26}" + "".join(
            f"{row[k][1]:>11.3f}" if 'clv' not in k else f"{row[k][1]:>11.0f}" for k in KEYS))
    summary["serving_model"] = best
    (RESULT_DIR / "model_comparison.json").write_text(json.dumps(summary, indent=2))
    (RESULT_DIR / "serving_model.json").write_text(json.dumps(best, indent=2))
    print("serving model for the pipelines:", best)


if __name__ == "__main__":
    main()
