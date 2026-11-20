"""Replays the test-period purchases into Kafka in time order, as if they were happening live.
    python -m src.replay_producer --rate 25        # events per second of wall-clock time"""
import argparse
import json
import time

import pandas as pd
from kafka import KafkaProducer

from .config import PROC_DIR
from .seed_redis import test_origin

TOPIC = "purchase-events"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=float, default=25.0, help="events per second (0 = as fast as possible)")
    ap.add_argument("--limit", type=int, default=0, help="only send the first N events (for a quick test)")
    a = ap.parse_args()
    p = pd.read_csv(PROC_DIR / "purchases.csv", dtype={"customer_id": str}, parse_dates=["event_timestamp"])
    p["ts"] = p["event_timestamp"].values.astype("datetime64[s]").astype("int64")
    p = p[p["ts"] > test_origin()].sort_values(["ts", "event_id"])
    if a.limit:
        p = p.head(a.limit)
    prod = KafkaProducer(bootstrap_servers="localhost:9092", key_serializer=str.encode,
                         value_serializer=lambda v: json.dumps(v).encode(), linger_ms=0)
    t0 = time.time()
    for i, row in enumerate(p.itertuples(index=False), 1):
        prod.send(TOPIC, key=row.customer_id, value={
            "event_id": str(row.event_id), "customer_id": row.customer_id, "category": row.category,
            "amount": float(row.amount), "event_ts": int(row.ts), "produced_at": time.time()})
        if a.rate > 0:
            time.sleep(max(0.0, t0 + i / a.rate - time.time()))
    prod.flush()
    print(f"sent {len(p)} events in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
