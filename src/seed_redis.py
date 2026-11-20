"""Load every customer's purchase history up to the start of the test period into Redis,
so the streaming pipeline starts from the same state a live system would have.
    python -m src.seed_redis"""
import json

import pandas as pd
import redis

from .config import PROC_DIR, WINDOW
from .windows import history_index


def test_origin():
    meta = json.loads((PROC_DIR / "meta.json").read_text())
    return int(pd.Timestamp(meta["val_end"]).normalize().value // 10 ** 9)


def main():
    r = redis.Redis(host="localhost", port=6379, decode_responses=True)
    r.flushdb()                                              # dedicated local container
    p = pd.read_csv(PROC_DIR / "purchases.csv", dtype={"customer_id": str})
    origin = test_origin()
    pipe, n = r.pipeline(), 0
    for cid, (ts, cat, amt) in history_index(p).items():
        keep = ts <= origin
        for t, c, a in list(zip(ts[keep], cat[keep], amt[keep]))[-WINDOW:]:
            pipe.rpush(f"seq:{cid}", json.dumps([int(t), int(c), float(a)]))
        n += 1
    pipe.execute()
    print(f"seeded {n} customers into Redis (history up to the test period)")


if __name__ == "__main__":
    main()
