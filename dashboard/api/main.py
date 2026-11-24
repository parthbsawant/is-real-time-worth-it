"""Dashboard API. Serves the measured results and runs the real model for the simulations.
    uvicorn dashboard.api.main:app --port 8000          (from the repo root, venv active)
Interactive docs: http://localhost:8000/docs
All timestamps are Unix seconds in dataset time (the dataset has no time zone) plus an ISO string."""
import csv
import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from src.config import CATEGORIES, PROC_DIR, RESULT_DIR
from src.metrics import summarise
from src.windows import history_index, tick_ceil, tick_floor, window_at

app = FastAPI(title="Freshness vs Cost dashboard API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])

PIPES = ["batch_hourly", "batch_daily", "batch_weekly", "streaming"]
HOUR = 3600


def iso(t: int) -> str:
    return datetime.fromtimestamp(int(t), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def jload(name):
    f = RESULT_DIR / name
    return json.loads(f.read_text()) if f.exists() else None


class State:
    pass


@lru_cache(maxsize=1)
def S():
    s = State()
    s.meta = json.loads((PROC_DIR / "meta.json").read_text())
    s.p = pd.read_csv(PROC_DIR / "purchases.csv", dtype={"customer_id": str, "event_id": str})
    s.p["ts"] = pd.to_datetime(s.p["event_timestamp"]).values.astype("datetime64[s]").astype("int64")
    s.hist = history_index(s.p)
    s.seg = pd.read_csv(PROC_DIR / "customers.csv", dtype={"customer_id": str}).set_index("customer_id")
    s.z = np.load(PROC_DIR / "test.npz")
    s.origin = int(pd.Timestamp(s.meta["val_end"]).normalize().value // 10 ** 9)
    s.t_end = int(pd.Timestamp(s.meta["span_end"]).value // 10 ** 9)
    tr = np.load(PROC_DIR / "train.npz")
    s.prior = np.bincount(tr["y_cat"], minlength=14) / len(tr["y_cat"])
    s.mu = float(tr["y_clv"].mean())
    ev = s.p[s.p["ts"] > s.origin]
    s.events = list(zip(ev["customer_id"], ev["ts"].tolist()))
    s.models = {}
    pc = jload("pipeline_comparison.json") or {}
    sm = jload("stream_summary.json") or {}
    bh = pc.get("batch_hourly", {})
    s.unit = {"batch_s_per_inference": bh.get("seconds", 0) / max(bh.get("inferences", 1), 1),
              "stream_s_per_event_model_only": pc.get("streaming", {}).get("seconds", 0) / max(len(s.events), 1),
              "stream_s_per_event_full": sm.get("cpu_seconds", 0) / max(sm.get("events", 1), 1)}
    return s


def model(variant):
    s = S()
    if variant not in s.models:
        from src.serving import load_serving_model          # imported lazily: needs PyTorch
        s.models[variant] = load_serving_model(variant)
    return s.models[variant]


def check_variant(v):
    if v not in ("base", "age"):
        raise HTTPException(400, "variant must be 'base' or 'age'")


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


# ------------------------------------------------------------------ meta / overview
@app.get("/api/meta")
def meta():
    s = S()
    return {"dataset": {"customers": s.meta["customers"], "purchases": s.meta["transactions"],
                        "span_start": s.meta["span_start"], "span_end": s.meta["span_end"],
                        "train_end": s.meta["train_end"], "val_end": s.meta["val_end"],
                        "test_start_ts": s.origin, "test_start": iso(s.origin), "test_end_ts": s.t_end, "test_end": iso(s.t_end),
                        "examples": s.meta["n_examples"], "test_period_purchases": len(s.events)},
            "categories": CATEGORIES, "variants": ["base", "age"],
            "variant_labels": {"base": "Primary model", "age": "Follow-up: with elapsed-time input"},
            "serving_models": {"base": jload("serving_model.json"), "age": jload("serving_model_age.json")},
            "unit_costs_seconds": s.unit,
            "segments": {str(k): {"label": l} for k, l in
                         {1: "Rarest buyers (quartile 1)", 2: "Quartile 2", 3: "Quartile 3", 4: "Most frequent buyers (quartile 4)"}.items()}}


@app.get("/api/overview")
def overview(variant: str = "base"):
    check_variant(variant)
    sfx = "_age" if variant == "age" else ""
    pc = jload(f"pipeline_comparison{sfx}.json")
    if pc is None:
        raise HTTPException(404, "run  python -m src.compare" + (" --variant age" if sfx else ""))
    return {"variant": variant, "pipelines": {k: pc[k] for k in PIPES}, "baseline": jload("baselines_test.json"),
            "models": (jload(f"model_comparison{sfx}.json") or {}), "significance": (jload("significance.json") or {}).get(variant),
            "kafka_check": jload("stream_eval.json")}


# ------------------------------------------------------------------ interval slider (runs the model)
@lru_cache(maxsize=256)
def _interval(variant: str, hours: float):
    from src.compare import example_windows, predict_examples
    s = S()
    m, info = model(variant)
    step = None if hours == 0 else int(hours * HOUR)
    wins = example_windows(s.z, s.hist, step, s.origin)
    scores, clv, cold = predict_examples(m, s.meta, wins, s.prior, s.mu)
    r = summarise(scores, clv, s.z["y_cat"], s.z["y_clv"])
    seg_of = np.array([s.seg.loc[str(c), "segment"] for c in s.z["customer_id"]])
    r["top1_by_segment"] = {int(k): float((scores[seg_of == k].argmax(1) == s.z["y_cat"][seg_of == k]).mean()) for k in (1, 2, 3, 4)}
    if step is None:
        r.update(staleness_hours_median=0.0, staleness_hours_p95=0.0, inferences=len(s.events),
                 est_cpu_seconds=len(s.events) * s.unit["stream_s_per_event_model_only"],
                 est_cpu_seconds_full=len(s.events) * s.unit["stream_s_per_event_full"])
    else:
        d = np.array([tick_ceil(t, s.origin, step) - t for _, t in s.events]) / HOUR
        pairs = {(c, tick_ceil(t, s.origin, step)) for c, t in s.events}
        r.update(staleness_hours_median=float(np.median(d)), staleness_hours_p95=float(np.percentile(d, 95)),
                 inferences=len(pairs), est_cpu_seconds=len(pairs) * s.unit["batch_s_per_inference"])
    return r


@app.get("/api/interval")
def interval(hours: float = Query(24, ge=0.25, le=336), variant: str = "base"):
    """Accuracy, staleness and compute of a batch pipeline refreshed every `hours`, next to real-time."""
    check_variant(variant)
    hours = round(float(hours), 2)
    return {"variant": variant, "hours": hours, "batch": _interval(variant, hours), "streaming": _interval(variant, 0.0)}


# ------------------------------------------------------------------ customers
@app.get("/api/customers")
def customers(segment: int = 0, q: str = "", limit: int = Query(50, le=500), offset: int = 0):
    s = S()
    ev = pd.Series([c for c, _ in s.events]).value_counts()
    d = s.seg.copy()
    d["n_test_purchases"] = ev.reindex(d.index).fillna(0).astype(int)
    d["n_total_purchases"] = [len(s.hist[c][0]) for c in d.index]
    if segment:
        d = d[d["segment"] == segment]
    if q:
        d = d[d.index.str.contains(q)]
    d = d.sort_values(["n_test_purchases", "n_total_purchases"], ascending=False)
    rows = [{"customer_id": c, "segment": int(r.segment), "n_train_purchases": int(r.n_train_purchases),
             "n_test_purchases": int(r.n_test_purchases), "n_total_purchases": int(r.n_total_purchases)}
            for c, r in d.iloc[offset:offset + limit].iterrows()]
    return {"total": int(len(d)), "rows": rows}


@app.get("/api/customer/{cid}")
def customer(cid: str):
    s = S()
    if cid not in s.hist:
        raise HTTPException(404, "unknown customer")
    ts, cat, amt = s.hist[cid]
    return {"customer_id": cid, "segment": int(s.seg.loc[cid, "segment"]),
            "purchases": [{"ts": int(t), "time": iso(t), "category": CATEGORIES[int(c) - 1], "amount": round(float(a), 2),
                           "in_test_period": bool(t > s.origin)} for t, c, a in zip(ts, cat, amt)]}


def _top(scores, clv, k=3):
    pr = softmax(scores)
    order = np.argsort(-pr)[:k]
    return {"top": [{"category": CATEGORIES[int(i)], "probability": round(float(pr[i]), 4)} for i in order],
            "predicted_clv": round(float(np.expm1(max(clv, 0.0))), 2)}


@app.get("/api/customer/{cid}/at")
def customer_at(cid: str, ts: int, hours: float = Query(24, ge=0.25, le=336), variant: str = "base"):
    """What the batch pipeline (refreshed every `hours`) and the real-time pipeline would each be
    saying about this customer at time `ts`, and what they actually bought next."""
    check_variant(variant)
    from src.serving import infer
    s = S()
    if cid not in s.hist:
        raise HTTPException(404, "unknown customer")
    h = s.hist[cid]
    step = int(hours * HOUR)
    last_run = tick_floor(ts, s.origin, step)
    w_b, w_s = window_at(h, last_run, ts + 1), window_at(h, ts, ts + 1)
    m, _ = model(variant)
    out = {"customer_id": cid, "at": ts, "at_time": iso(ts), "batch_last_run": last_run, "batch_last_run_time": iso(last_run),
           "batch_age_hours": round((ts - last_run) / HOUR, 2), "variant": variant}
    for name, w in (("batch", w_b), ("streaming", w_s)):
        if w is None:
            out[name] = None
            continue
        sc, cl = infer(m, [w], s.meta)
        out[name] = _top(sc[0], cl[0])
    ts_arr, cat_arr, amt_arr = h
    missed = [{"time": iso(t), "category": CATEGORIES[int(c) - 1], "amount": round(float(a), 2)}
              for t, c, a in zip(ts_arr, cat_arr, amt_arr) if last_run < t <= ts]
    out["purchases_missed_by_batch"] = missed
    j = int(np.searchsorted(ts_arr, ts, side="right"))
    if j < len(ts_arr):
        actual = CATEGORIES[int(cat_arr[j]) - 1]
        out["next_purchase"] = {"time": iso(ts_arr[j]), "ts": int(ts_arr[j]), "category": actual, "amount": round(float(amt_arr[j]), 2)}
        for name in ("batch", "streaming"):
            if out[name]:
                cats = [t["category"] for t in out[name]["top"]]
                out[name]["top1_correct"], out[name]["top3_correct"] = cats[0] == actual, actual in cats
    else:
        out["next_purchase"] = None
    return out


# ------------------------------------------------------------------ replay feed (from the real Kafka/Redis run)
@lru_cache(maxsize=1)
def _replay():
    f = RESULT_DIR / "stream_predictions.csv"
    if not f.exists():
        return None
    s = S()
    ev = s.p.set_index("event_id")[["category", "amount"]]
    rows = []
    with open(f) as fh:
        for r in csv.DictReader(fh):
            sc = np.array(r["scores"].split(), dtype=float)
            pr = softmax(sc)
            e = ev.loc[r["event_id"]]
            rows.append({"event_id": r["event_id"], "customer_id": r["customer_id"], "ts": int(r["event_ts"]),
                         "time": iso(int(r["event_ts"])), "bought": e["category"], "amount": round(float(e["amount"]), 2),
                         "segment": int(s.seg.loc[r["customer_id"], "segment"]),
                         "predicted_next": CATEGORIES[int(pr.argmax())], "confidence": round(float(pr.max()), 3),
                         "predicted_clv": round(float(np.expm1(max(float(r["clv_log"]), 0.0))), 2),
                         "processing_ms": float(r["proc_ms"]), "end_to_end_ms": float(r["e2e_ms"])})
    rows.sort(key=lambda x: (x["ts"], x["event_id"]))
    return rows


@app.get("/api/replay")
def replay():
    """Every event of the test period with the prediction the real Kafka+Redis pipeline made for it."""
    r = _replay()
    if r is None:
        raise HTTPException(404, "run the Kafka replay first (see README, step 6)")
    return {"count": len(r), "unit_costs_seconds": S().unit, "events": r}


# ------------------------------------------------------------------ hybrid strategy
@lru_cache(maxsize=1)
def _per_customer(batch_name):
    s = S()
    step = {"batch_hourly": HOUR, "batch_daily": 24 * HOUR, "batch_weekly": 168 * HOUR}[batch_name]
    ev, pairs = {}, {}
    seen = set()
    for c, t in s.events:
        ev[c] = ev.get(c, 0) + 1
        k = (c, tick_ceil(t, s.origin, step))
        if k not in seen:
            seen.add(k)
            pairs[c] = pairs.get(c, 0) + 1
    return ev, pairs


@app.get("/api/hybrid")
def hybrid(top_pct: float = Query(25, ge=0, le=100), batch: str = "batch_daily", variant: str = "base"):
    """Serve the `top_pct`% most frequent buyers in real time and everyone else from a batch pipeline."""
    check_variant(variant)
    if batch not in PIPES[:3]:
        raise HTTPException(400, "batch must be batch_hourly, batch_daily or batch_weekly")
    s = S()
    try:
        ps = np.load(RESULT_DIR / f"preds_{variant}_streaming.npz")
        pb = np.load(RESULT_DIR / f"preds_{variant}_{batch}.npz")
    except FileNotFoundError:
        raise HTTPException(404, "run  python -m src.compare  (both variants) first")
    ranked = s.seg["n_train_purchases"].sort_values(ascending=False).index
    n_rt = int(round(len(ranked) * top_pct / 100))
    rt = set(ranked[:n_rt])
    use_rt = np.array([str(c) in rt for c in s.z["customer_id"]])
    scores = np.where(use_rt[:, None], ps["scores"], pb["scores"])
    clv = np.where(use_rt, ps["clv"], pb["clv"])
    res = summarise(scores, clv, s.z["y_cat"], s.z["y_clv"])
    ev, pairs = _per_customer(batch)
    u = s.unit
    cpu = sum(ev.get(c, 0) for c in rt) * u["stream_s_per_event_full"] + sum(v for c, v in pairs.items() if c not in rt) * u["batch_s_per_inference"]
    all_rt = len(s.events) * u["stream_s_per_event_full"]
    all_batch = sum(pairs.values()) * u["batch_s_per_inference"]
    # model-inference-only view (same basis as the Overview page); the figures above include Kafka + Redis overhead
    ev_rt = sum(ev.get(c, 0) for c in rt)
    cpu_m = ev_rt * u["stream_s_per_event_model_only"] + sum(v for c, v in pairs.items() if c not in rt) * u["batch_s_per_inference"]
    all_rt_m = len(s.events) * u["stream_s_per_event_model_only"]
    return {"top_pct": top_pct, "customers_realtime": n_rt, "batch": batch, "variant": variant,
            "top1": res["top1"], "top3": res["top3"], "f1": res["f1"], "clv_mae": res["clv_mae"],
            "est_cpu_seconds": cpu, "all_realtime_cpu_seconds": all_rt, "all_batch_cpu_seconds": all_batch,
            "share_of_examples_served_realtime": float(use_rt.mean()),
            "share_of_events_served_realtime": ev_rt / max(len(s.events), 1),
            "est_cpu_seconds_model_only": cpu_m, "all_realtime_cpu_seconds_model_only": all_rt_m}
