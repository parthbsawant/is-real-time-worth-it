"""Paired bootstrap over the test examples: is real-time really better than each batch interval?
    python -m src.significance            (run after  python -m src.compare  and  --variant age)"""
import json

import numpy as np

from .config import PROC_DIR, RESULT_DIR

B = 2000
rng = np.random.default_rng(0)
z = np.load(PROC_DIR / "test.npz")
y, ylog = z["y_cat"], z["y_clv"]
n = len(y)
true_clv = np.expm1(ylog)
out = {}
for variant in ("base", "age"):
    try:
        P = {k: np.load(RESULT_DIR / f"preds_{variant}_{k}.npz") for k in ("batch_hourly", "batch_daily", "batch_weekly", "streaming")}
    except FileNotFoundError:
        continue
    hit = {k: (v["scores"].argmax(1) == y).astype(float) for k, v in P.items()}
    err = {k: np.abs(np.expm1(np.clip(v["clv"], 0, 20)) - true_clv) for k, v in P.items()}
    idx = rng.integers(0, n, size=(B, n))
    out[variant] = {}
    for b in ("batch_hourly", "batch_daily", "batch_weekly"):
        d_top1 = (hit["streaming"] - hit[b])[idx].mean(1) * 100           # points; > 0 means real-time better
        d_mae = (err[b] - err["streaming"])[idx].mean(1)                  # pounds; > 0 means real-time better
        r = {"top1_gain_points": [float(np.mean(hit["streaming"] - hit[b]) * 100), *np.percentile(d_top1, [2.5, 97.5]).tolist()],
             "mae_gain_pounds": [float(np.mean(err[b] - err["streaming"])), *np.percentile(d_mae, [2.5, 97.5]).tolist()],
             "p_top1_realtime_better": float((d_top1 > 0).mean()), "p_mae_realtime_better": float((d_mae > 0).mean())}
        out[variant][b] = r
        print(f"{variant:<5} real-time vs {b:<13} Top-1 {r['top1_gain_points'][0]:+.2f} pts  95% CI [{r['top1_gain_points'][1]:+.2f}, {r['top1_gain_points'][2]:+.2f}]"
              f"   |  CLV error {r['mae_gain_pounds'][0]:+.0f} GBP  95% CI [{r['mae_gain_pounds'][1]:+.0f}, {r['mae_gain_pounds'][2]:+.0f}]")
(RESULT_DIR / "significance.json").write_text(json.dumps(out, indent=2))
