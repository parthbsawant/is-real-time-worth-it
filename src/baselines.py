"""Two deliberately simple baselines on the test split:
 - single-step Markov chain for the next category
 - ridge regression on aggregated customer statistics for CLV
    python -m src.baselines"""
import json

import numpy as np
from sklearn.linear_model import Ridge

from .config import N_CAT, PROC_DIR, RESULT_DIR
from .metrics import summarise


def last_cat(z):                       # category index (0..13) of the latest purchase in the window
    return z["cat"][:, -1] - 1


def agg_features(z):
    m, n = z["mask"], z["mask"].sum(1)
    amt = np.expm1(z["amt"]) * m
    gap = np.expm1(z["gap"]) * m
    return np.stack([n, amt.sum(1) / n, amt.sum(1), gap.sum(1) / n, np.expm1(z["gap"][:, -1])], 1)


def main():
    tr, va, te = (np.load(PROC_DIR / f"{s}.npz") for s in ("train", "val", "test"))
    counts = np.ones((N_CAT, N_CAT))                                   # add-one smoothing
    np.add.at(counts, (last_cat(tr), tr["y_cat"]), 1)
    trans = counts / counts.sum(1, keepdims=True)
    scores = trans[last_cat(te)]
    X = lambda z: np.log1p(agg_features(z))
    reg = Ridge(alpha=1.0).fit(X(tr), tr["y_clv"])
    res = summarise(scores, reg.predict(X(te)), te["y_cat"], te["y_clv"])
    RESULT_DIR.mkdir(exist_ok=True)
    (RESULT_DIR / "baselines_test.json").write_text(json.dumps(res, indent=2))
    print("baselines (test):", {k: round(v, 4) for k, v in res.items()})


if __name__ == "__main__":
    main()
