"""Real-time pipeline: for every purchase event, update the customer's sequence in Redis,
re-run the model and write the new prediction back (pred:{customer_id}).
Stops by itself after --idle seconds without new events.
    python -m src.stream_consumer"""
import argparse
import csv
import json
import time

import numpy as np
import redis
import torch
from kafka import KafkaConsumer

from .config import CATEGORIES, PROC_DIR, RESULT_DIR, WINDOW
from .serving import infer, load_serving_model
from .windows import window_at

CAT_IDX = {c: i + 1 for i, c in enumerate(CATEGORIES)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--idle", type=int, default=20, help="stop after this many idle seconds")
    a = ap.parse_args()
    torch.set_num_threads(1)
    meta = json.loads((PROC_DIR / "meta.json").read_text())
    model, info = load_serving_model()
    r = redis.Redis(host="localhost", port=6379, decode_responses=True)
    consumer = KafkaConsumer("purchase-events", bootstrap_servers="localhost:9092", group_id="frt-stream",
                             auto_offset_reset="earliest", enable_auto_commit=True,
                             value_deserializer=lambda b: json.loads(b.decode()),
                             consumer_timeout_ms=a.idle * 1000)
    RESULT_DIR.mkdir(exist_ok=True)
    rows, cpu0, wall0 = [], time.process_time(), None
    print(f"consumer ready (model: {info['arch']} seed {info['seed']}), waiting for events ...")
    for msg in consumer:
        t_in = time.time()
        wall0 = wall0 or t_in
        e, key = msg.value, f"seq:{msg.value['customer_id']}"
        pipe = r.pipeline()
        pipe.rpush(key, json.dumps([e["event_ts"], CAT_IDX[e["category"]], e["amount"]]))
        pipe.ltrim(key, -WINDOW, -1)
        pipe.lrange(key, 0, -1)
        items = [json.loads(x) for x in pipe.execute()[2]]
        hist = tuple(np.array(col) for col in zip(*items))
        hist = (hist[0].astype("int64"), hist[1].astype("int64"), hist[2].astype(float))
        scores, clv = infer(model, [window_at(hist, e["event_ts"], e["event_ts"] + 1)], meta)
        r.hset(f"pred:{e['customer_id']}", mapping={
            "event_id": e["event_id"], "predicted_category": CATEGORIES[int(scores[0].argmax())],
            "confidence": float(np.exp(scores[0] - scores[0].max()).max() / np.exp(scores[0] - scores[0].max()).sum()),
            "predicted_clv": float(np.expm1(max(clv[0], 0.0))), "prediction_timestamp": time.time(),
            "pipeline": "streaming"})
        t_out = time.time()
        rows.append([e["event_id"], e["customer_id"], e["event_ts"], " ".join(f"{x:.6f}" for x in scores[0]),
                     f"{clv[0]:.6f}", f"{(t_out - t_in) * 1000:.3f}", f"{(t_out - e['produced_at']) * 1000:.3f}"])
        if len(rows) % 500 == 0:
            print(f"  {len(rows)} events processed")
    with open(RESULT_DIR / "stream_predictions.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["event_id", "customer_id", "event_ts", "scores", "clv_log", "proc_ms", "e2e_ms"])
        w.writerows(rows)
    summary = {"events": len(rows), "cpu_seconds": time.process_time() - cpu0,
               "wall_seconds": (time.time() - wall0) if wall0 else 0.0}
    (RESULT_DIR / "stream_summary.json").write_text(json.dumps(summary, indent=2))
    print("done:", summary)


if __name__ == "__main__":
    main()
