"""Steps 5 + 7 (offline form): run the batch pipeline at three intervals and the per-event
(streaming) pipeline over the test period, and measure accuracy, staleness and compute.
    python -m src.compare
The Kafka/Redis version of the streaming pipeline (step 6) must reproduce the streaming numbers."""
import json
import time

import numpy as np
import pandas as pd

from .config import PROC_DIR, RESULT_DIR
from .metrics import summarise
from .serving import infer, load_serving_model
from .windows import history_index, tick_ceil, tick_floor, window_at

HOUR = 3600
PIPELINES = [("batch_hourly", HOUR), ("batch_daily", 24 * HOUR), ("batch_weekly", 168 * HOUR), ("streaming", None)]


def example_windows(z, hist, step, origin):
    """Input each pipeline would be using when the customer's target purchase happens."""
    wins = []
    for cid, t in zip(z["customer_id"], z["t_target"]):
        t = int(t)
        cutoff = t - 1 if step is None else tick_floor(t, origin, step)   # streaming sees everything
        wins.append(window_at(hist[str(cid)], cutoff, t))
    return wins


def predict_examples(model, meta, wins, prior, mu):
    ok = [i for i, w in enumerate(wins) if w is not None]
    s, c = infer(model, [wins[i] for i in ok], meta)
    scores = np.tile(prior, (len(wins), 1)); clv = np.full(len(wins), mu)
    scores[ok], clv[ok] = s, c                      # no history yet -> fall back to the overall average
    return scores, clv, len(wins) - len(ok)


def run_cost(model, meta, hist, events, step, origin):
    """Inference work needed to keep predictions up to date over the test period."""
    t0 = time.perf_counter()
    lat = []
    if step is None:                                # one inference per purchase, as it arrives
        for cid, t in events:
            w = window_at(hist[cid], t, t + 1)
            a = time.perf_counter(); infer(model, [w], meta); lat.append((time.perf_counter() - a) * 1000)
        n = len(events)
    else:                                           # one inference per (customer, run) with new purchases
        pairs = sorted({(cid, tick_ceil(t, origin, step)) for cid, t in events})
        wins = [window_at(hist[cid], tk, tk + 1) for cid, tk in pairs]
        for i in range(0, len(wins), 512):
            a = time.perf_counter(); infer(model, wins[i:i + 512], meta)
            lat += [(time.perf_counter() - a) * 1000 / len(wins[i:i + 512])] * len(wins[i:i + 512])
        n = len(pairs)
    return {"inferences": n, "seconds": time.perf_counter() - t0,
            "latency_ms_median": float(np.median(lat)), "latency_ms_p95": float(np.percentile(lat, 95))}


def main():
    meta = json.loads((PROC_DIR / "meta.json").read_text())
    model, info = load_serving_model()
    z = np.load(PROC_DIR / "test.npz")
    p = pd.read_csv(PROC_DIR / "purchases.csv", dtype={"customer_id": str})
    seg = pd.read_csv(PROC_DIR / "customers.csv", dtype={"customer_id": str}).set_index("customer_id")["segment"]
    hist = history_index(p)
    origin = int(pd.Timestamp(meta["val_end"]).normalize().value // 10 ** 9)   # scheduled runs start at midnight
    ytr = np.load(PROC_DIR / "train.npz")
    prior = np.bincount(ytr["y_cat"], minlength=14) / len(ytr["y_cat"]); mu = float(ytr["y_clv"].mean())
    seg_of = np.array([seg[str(c)] for c in z["customer_id"]])
    ts_all = pd.to_datetime(p["event_timestamp"]).values.astype("datetime64[s]").astype("int64")
    sel = ts_all > origin
    events = list(zip(p["customer_id"][sel].astype(str), ts_all[sel].tolist()))
    out = {"serving_model": info, "test_examples": int(len(z["y_cat"])), "test_period_purchases": len(events)}
    for name, step in PIPELINES:
        wins = example_windows(z, hist, step, origin)
        scores, clv, n_cold = predict_examples(model, meta, wins, prior, mu)
        m = summarise(scores, clv, z["y_cat"], z["y_clv"])
        m["top1_by_segment"] = {int(s): float((scores[seg_of == s].argmax(1) == z["y_cat"][seg_of == s]).mean())
                                for s in (1, 2, 3, 4)}
        m["no_history_fallbacks"] = n_cold
        if step is None:
            m["staleness_hours_median"] = 0.0           # replaced by the measured end-to-end delay in step 6
            m["staleness_hours_p95"] = 0.0
        else:
            d = np.array([tick_ceil(t, origin, step) - t for _, t in events]) / 3600.0
            m["staleness_hours_median"], m["staleness_hours_p95"] = float(np.median(d)), float(np.percentile(d, 95))
        m.update(run_cost(model, meta, hist, events, step, origin))
        out[name] = m
    base = out["batch_hourly"]["seconds"]
    for name, _ in PIPELINES:
        out[name]["compute_vs_hourly"] = out[name]["seconds"] / base
    (RESULT_DIR / "pipeline_comparison.json").write_text(json.dumps(out, indent=2))
    print(f"serving model: {info['arch']} seed {info['seed']}   test examples: {out['test_examples']}   "
          f"test-period purchases: {len(events)}")
    print(f"{'pipeline':<14}{'top1':>7}{'top3':>7}{'f1':>7}{'MAE':>8}{'stale_med_h':>13}{'infer':>8}{'sec':>8}{'x hourly':>10}{'lat_ms':>8}")
    for name, _ in PIPELINES:
        m = out[name]
        print(f"{name:<14}{m['top1']:>7.3f}{m['top3']:>7.3f}{m['f1']:>7.3f}{m['clv_mae']:>8.0f}"
              f"{m['staleness_hours_median']:>13.2f}{m['inferences']:>8}{m['seconds']:>8.1f}{m['compute_vs_hourly']:>10.2f}{m['latency_ms_median']:>8.2f}")
    print("top-1 by purchase-frequency segment (1 = rarest ... 4 = most frequent):")
    for name, _ in PIPELINES:
        print(f"  {name:<14}", {k: round(v, 3) for k, v in out[name]["top1_by_segment"].items()})


if __name__ == "__main__":
    main()
