"""Check the Kafka/Redis pipeline against the offline computation of the same predictions.
    python -m src.stream_eval
(The formal test examples end before the replayed period, so correctness is checked event by event.)"""
import json

import numpy as np
import pandas as pd

from .config import PROC_DIR, RESULT_DIR
from .metrics import macro_f1, topk_accuracy
from .serving import infer, load_serving_model
from .windows import history_index, window_at


def main():
    meta = json.loads((PROC_DIR / "meta.json").read_text())
    model, _ = load_serving_model()
    p = pd.read_csv(PROC_DIR / "purchases.csv", dtype={"customer_id": str})
    hist = history_index(p)
    sp = pd.read_csv(RESULT_DIR / "stream_predictions.csv", dtype={"customer_id": str})
    summ = json.loads((RESULT_DIR / "stream_summary.json").read_text())
    S = np.stack([np.array(s.split(), dtype=float) for s in sp["scores"]])
    C = sp["clv_log"].to_numpy(dtype=float)
    wins = [window_at(hist[c], int(t), int(t) + 1) for c, t in zip(sp["customer_id"], sp["event_ts"])]
    off_s, off_c = infer(model, wins, meta)
    # two purchases by one customer at the same second: offline sees both at once, the live
    # pipeline only learns of the second when it arrives, so those events are not comparable
    tie = np.array([int((hist[c][0] == int(t)).sum()) > 1 for c, t in zip(sp["customer_id"], sp["event_ts"])])
    ok = ~tie
    nxt, keep = [], []
    for i, (c, t) in enumerate(zip(sp["customer_id"], sp["event_ts"])):
        ts, cat, _ = hist[c]
        j = np.searchsorted(ts, int(t), side="right")       # first purchase after this event
        if j < len(ts):
            nxt.append(cat[j] - 1); keep.append(i)
    keep, nxt = np.array(keep), np.array(nxt)
    out = {"events_processed": len(sp),
           "tie_events_excluded_from_check": int(tie.sum()),
           "max_abs_score_diff_vs_offline": float(np.abs(off_s[ok] - S[ok]).max()),
           "max_abs_clv_diff_vs_offline": float(np.abs(off_c[ok] - C[ok]).max()),
           "top1_agreement_with_offline": float((off_s[ok].argmax(1) == S[ok].argmax(1)).mean()),
           "events_with_a_later_purchase": int(len(keep)),
           "live_top1": topk_accuracy(S[keep], nxt, 1), "live_top3": topk_accuracy(S[keep], nxt, 3),
           "live_f1": macro_f1(S[keep].argmax(1), nxt, 14),
           "processing_ms_median": float(sp["proc_ms"].median()), "processing_ms_p95": float(sp["proc_ms"].quantile(0.95)),
           "end_to_end_ms_median": float(sp["e2e_ms"].median()), "end_to_end_ms_p95": float(sp["e2e_ms"].quantile(0.95)),
           "consumer": summ}
    (RESULT_DIR / "stream_eval.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
