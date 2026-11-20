"""Building model inputs from raw purchase history (numpy only).

The same function serves both pipelines; they differ only in the cut-off time they pass in:
  streaming : everything before the target purchase
  batch     : only what had been recorded when the last scheduled run happened
"""
import numpy as np
import pandas as pd

from .config import CATEGORIES, WINDOW
from .data_prep import encode_window


def history_index(purchases: pd.DataFrame) -> dict:
    """customer_id -> (timestamps in seconds, category index 1..14, amounts), time-ordered."""
    cat_to_idx = {c: i + 1 for i, c in enumerate(CATEGORIES)}
    p = purchases.sort_values(["customer_id", "event_timestamp"])
    ts = pd.to_datetime(p["event_timestamp"]).values.astype("datetime64[s]").astype("int64")
    cat = p["category"].map(cat_to_idx).to_numpy()
    amt = p["amount"].to_numpy(dtype=float)
    out, ids = {}, p["customer_id"].astype(str).to_numpy()
    starts = np.flatnonzero(np.r_[True, ids[1:] != ids[:-1]])
    ends = np.r_[starts[1:], len(ids)]
    for a, b in zip(starts, ends):
        out[ids[a]] = (ts[a:b], cat[a:b], amt[a:b])
    return out


def tick_floor(t: int, origin: int, step: int) -> int:
    """Last scheduled run at or before t (runs happen at origin + k*step, k any integer)."""
    return origin + ((t - origin) // step) * step


def tick_ceil(t: int, origin: int, step: int) -> int:
    """First scheduled run at or after t."""
    return origin + (-((origin - t) // step)) * step


def window_at(hist, cutoff_ts: int, target_ts: int):
    """Model input from purchases recorded up to `cutoff_ts` (inclusive) and strictly before
    the target purchase. Returns (cat, gap, amt, mask, age) or None when there is no history."""
    ts, cat, amt = hist
    n = min(np.searchsorted(ts, cutoff_ts, side="right"), np.searchsorted(ts, target_ts, side="left"))
    if n == 0:
        return None
    lo = max(0, n - WINDOW)
    w = ts[lo:n]
    gaps = np.diff(np.concatenate([[w[0]], w])).astype(float) / 86400.0
    age = float(np.log1p(max(target_ts - w[-1], 0) / 86400.0))      # newest purchase seen -> moment of use
    return encode_window(cat[lo:n], np.log1p(gaps), np.log1p(np.maximum(amt[lo:n], 0))) + (age,)
