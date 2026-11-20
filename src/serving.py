"""Load the chosen model and turn windows into predictions. Used by both pipelines."""
import json

import numpy as np
import torch

from .config import MODEL_DIR, RESULT_DIR
from .models import SeqModel
from .train import GAP_SCALE, clv_stats


def load_serving_model():
    info = json.loads((RESULT_DIR / "serving_model.json").read_text())
    model = SeqModel(info["arch"])
    model.load_state_dict(torch.load(MODEL_DIR / f"{info['arch']}_seed{info['seed']}.pt", map_location="cpu"))
    return model.eval(), info


@torch.no_grad()
def infer(model, wins, meta, bs=512):
    """wins: list of (cat, gap, amt, mask) -> (class scores [N,14], CLV as log1p of pounds [N])."""
    if not wins:
        return np.zeros((0, 14)), np.zeros(0)
    mu, sd = clv_stats()
    cat = torch.as_tensor(np.stack([w[0] for w in wins]), dtype=torch.long)
    mask = torch.as_tensor(np.stack([w[3] for w in wins]), dtype=torch.float32)
    gap = torch.as_tensor(np.stack([w[1] for w in wins]), dtype=torch.float32) / GAP_SCALE * mask
    amt = torch.as_tensor((np.stack([w[2] for w in wins]) - meta["amt_mean"]) / meta["amt_std"], dtype=torch.float32) * mask
    s, c = [], []
    for i in range(0, len(wins), bs):
        lo, cl = model(cat[i:i + bs], gap[i:i + bs], amt[i:i + bs], mask[i:i + bs])
        s.append(lo.numpy()); c.append(cl.numpy())
    return np.concatenate(s), np.concatenate(c) * sd + mu
