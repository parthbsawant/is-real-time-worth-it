"""Step 3: cleaning, categorising, sequence building and the chronological split.

Input  : raw transactions in the Online Retail II layout
         (Invoice, StockCode, Description, Quantity, InvoiceDate, Price, Customer ID).
Output : data/processed/{purchases.csv, customers.csv, train.npz, val.npz, test.npz, meta.json}
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .config import (CATEGORIES, HORIZON_DAYS, MIN_PURCHASES, N_CAT, PROC_DIR, RAW_DIR,
                     SPLIT, WINDOW)

# Keyword rules, checked in order. The first rule that matches the product description wins.
RULES = [
    ("seasonal_christmas", r"CHRISTMAS|XMAS|ADVENT|SANTA|REINDEER|SNOWFLAKE|EASTER"),
    ("party_supplies", r"PARTY|BALLOON|BUNTING|NAPKIN|PAPER PLATE|PAPER CUP|CONFETTI|WRAP"),
    ("lighting_candles", r"CANDLE|LIGHT|LAMP|LANTERN|T-LIGHT|TEALIGHT|HOLDER"),
    ("jewellery", r"NECKLACE|BRACELET|EARRING|RING |JEWEL|BEAD|CHARM"),
    ("bags_accessories", r"BAG|PURSE|WALLET|UMBRELLA|HAT |SCARF|GLOVES|KEYRING|KEY RING"),
    ("toys_games", r"TOY|GAME|PUZZLE|DOLL|PLAY|SKITTLES|SPACEBOY|DOLLY|BLOCKS"),
    ("stationery", r"PEN |PENCIL|NOTEBOOK|NOTEBOOKS|STICKER|RUBBER|ERASER|RULER|PAPER|BOOK|STAMP"),
    ("gifts_cards", r"CARD|GIFT|TAG|RIBBON|VOUCHER"),
    ("kitchen_dining", r"MUG|CUP|TEAPOT|CAKE|KITCHEN|SPOON|BOWL|JAR|PLATE|TEA |BAKING|APRON|TRAY|COASTER"),
    ("storage_organizers", r"BOX|TIN|BASKET|CRATE|STORAGE|DRAWER|HOOK|ORGANI[SZ]ER|SHELF|RACK"),
    ("garden_outdoor", r"GARDEN|PLANT|BIRD|FLOWER|POT |WATERING|OUTDOOR|WINDMILL|FEEDER"),
    ("textiles_linens", r"CUSHION|BLANKET|TOWEL|CURTAIN|COVER|CLOTH|QUILT|PILLOW|RUG|FABRIC"),
    ("home_decor", r"FRAME|MIRROR|CLOCK|SIGN|DECOR|ORNAMENT|HEART|VINTAGE|WALL|DOORMAT|VASE|DOOR"),
]
_COMPILED = [(name, re.compile(p)) for name, p in RULES]


def assign_category(description) -> str:
    text = str(description).upper() + " "
    for name, rx in _COMPILED:
        if rx.search(text):
            return name
    return "other"


# --------------------------------------------------------------------------- loading
def load_raw(path: Path) -> pd.DataFrame:
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xls"):
        sheets = pd.read_excel(path, sheet_name=None)          # Online Retail II has two sheets
        df = pd.concat(sheets.values(), ignore_index=True)
    else:
        df = pd.read_csv(path, encoding="ISO-8859-1")
    df = df.rename(columns={"Customer ID": "customer_id", "CustomerID": "customer_id",
                            "InvoiceNo": "Invoice", "UnitPrice": "Price"})
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Remove rows that are not genuine purchases."""
    df = df.copy()
    df = df.dropna(subset=["customer_id", "Description"])
    df = df[~df["Invoice"].astype(str).str.upper().str.startswith("C")]   # cancellations / returns
    df = df[(df["Quantity"] > 0) & (df["Price"] > 0)]
    df = df[~df["StockCode"].astype(str).str.upper().isin({"POST", "D", "M", "BANK CHARGES", "DOT", "CRUK"})]
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"])
    df["customer_id"] = df["customer_id"].astype(float).astype(int).astype(str)
    df["amount"] = df["Quantity"] * df["Price"]
    return df.drop_duplicates()


def to_purchases(df: pd.DataFrame) -> pd.DataFrame:
    """One row per invoice: its time, total amount and dominant category (by amount)."""
    df = df.copy()
    df["category"] = df["Description"].map(assign_category)
    line = (df.groupby(["customer_id", "Invoice", "category"], as_index=False)
              .agg(amount=("amount", "sum"), ts=("InvoiceDate", "min")))
    line = line.sort_values("amount", ascending=False)
    top = line.drop_duplicates(["customer_id", "Invoice"])[["customer_id", "Invoice", "category"]]
    tot = df.groupby(["customer_id", "Invoice"], as_index=False).agg(
        amount=("amount", "sum"), event_timestamp=("InvoiceDate", "min"))
    out = tot.merge(top, on=["customer_id", "Invoice"])
    out = out.rename(columns={"Invoice": "event_id"})
    out = out[["event_id", "customer_id", "category", "amount", "event_timestamp"]]
    return out.sort_values(["customer_id", "event_timestamp", "event_id"]).reset_index(drop=True)


def drop_light_customers(p: pd.DataFrame) -> pd.DataFrame:
    n = p.groupby("customer_id")["event_id"].transform("count")
    return p[n >= MIN_PURCHASES].reset_index(drop=True)


# --------------------------------------------------------------------------- sequences
def cutoffs(p: pd.DataFrame):
    """Chronological cut points at 80% and 90% of the observed time span."""
    t0, t1 = p["event_timestamp"].min(), p["event_timestamp"].max()
    span = t1 - t0
    return t0 + span * SPLIT[0], t0 + span * (SPLIT[0] + SPLIT[1]), t1


def encode_window(cat_idx, gaps_days, log_amt):
    """Left-pad a window to WINDOW and return (cat, gap, amt, mask). Category 0 = padding."""
    n = len(cat_idx)
    cat = np.zeros(WINDOW, dtype=np.int64)
    gap = np.zeros(WINDOW, dtype=np.float32)
    amt = np.zeros(WINDOW, dtype=np.float32)
    mask = np.zeros(WINDOW, dtype=np.float32)
    cat[WINDOW - n:], gap[WINDOW - n:], amt[WINDOW - n:], mask[WINDOW - n:] = cat_idx, gaps_days, log_amt, 1.0
    return cat, gap, amt, mask


def build_examples(p: pd.DataFrame):
    """For every customer purchase i >= 1: window = purchases before i (last 20),
    class target = category of purchase i, CLV target = spend in the 90 days after
    purchase i-1 (the prediction point).

    Split rule (no leakage): an example belongs to the split in which BOTH its target
    purchase and the whole 90-day CLV horizon have been observed, i.e. max(t_i, t_{i-1}+90d).
    Examples whose horizon runs past the end of the data are dropped.
    """
    c_train, c_val, t_end = cutoffs(p)
    cat_to_idx = {c: i + 1 for i, c in enumerate(CATEGORIES)}      # 1..14, 0 = pad
    horizon = pd.Timedelta(days=HORIZON_DAYS)
    rows = {"train": [], "val": [], "test": []}
    for cid, g in p.groupby("customer_id", sort=False):
        ts = g["event_timestamp"].to_numpy()
        cats = g["category"].map(cat_to_idx).to_numpy()
        amt = g["amount"].to_numpy(dtype=float)
        cum = np.concatenate([[0.0], np.cumsum(amt)])
        for i in range(1, len(g)):
            t_pred = ts[i - 1]
            h_end = t_pred + np.timedelta64(horizon)
            last_needed = max(ts[i], h_end)
            if last_needed > np.datetime64(t_end):
                continue
            split = "train" if last_needed <= np.datetime64(c_train) else \
                    "val" if last_needed <= np.datetime64(c_val) else "test"
            lo = max(0, i - WINDOW)
            w_ts = ts[lo:i]
            gaps = np.diff(np.concatenate([[w_ts[0]], w_ts])).astype("timedelta64[s]").astype(float) / 86400.0
            # CLV: purchases with t_pred < t <= t_pred + 90d
            j_end = np.searchsorted(ts, h_end, side="right")
            clv = cum[j_end] - cum[i]
            rows[split].append((cid, t_pred, cats[lo:i], np.log1p(gaps), np.log1p(np.maximum(amt[lo:i], 0)),
                                int(cats[i]) - 1, float(np.log1p(max(clv, 0.0)))))
    out = {}
    for name, items in rows.items():
        if not items:
            out[name] = None
            continue
        enc = [encode_window(c, gp, am) for _, _, c, gp, am, _, _ in items]
        out[name] = {
            "customer_id": np.array([r[0] for r in items]),
            "t_pred": np.array([np.datetime64(r[1], "s").astype("int64") for r in items]),
            "cat": np.stack([e[0] for e in enc]), "gap": np.stack([e[1] for e in enc]),
            "amt": np.stack([e[2] for e in enc]), "mask": np.stack([e[3] for e in enc]),
            "y_cat": np.array([r[5] for r in items], dtype=np.int64),
            "y_clv": np.array([r[6] for r in items], dtype=np.float32),
        }
    return out


def customer_segments(p: pd.DataFrame, train_end) -> pd.DataFrame:
    """Purchase-frequency quartiles (1 = rarest, 4 = most frequent) from the training period only."""
    n = p[p["event_timestamp"] <= train_end].groupby("customer_id")["event_id"].count()
    all_ids = p["customer_id"].unique()
    n = n.reindex(all_ids).fillna(0)
    seg = pd.qcut(n.rank(method="first"), 4, labels=[1, 2, 3, 4]).astype(int)
    return pd.DataFrame({"customer_id": n.index, "n_train_purchases": n.values, "segment": seg.values})


# --------------------------------------------------------------------------- main
def run(raw_path: Path, out_dir: Path = PROC_DIR) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    raw = load_raw(raw_path)
    p = drop_light_customers(to_purchases(clean(raw)))
    c_train, c_val, t_end = cutoffs(p)
    ex = build_examples(p)
    seg = customer_segments(p, c_train)
    p.to_csv(out_dir / "purchases.csv", index=False)
    seg.to_csv(out_dir / "customers.csv", index=False)
    for name, d in ex.items():
        if d is not None:
            np.savez_compressed(out_dir / f"{name}.npz", **d)
    all_logamt = np.log1p(p["amount"].clip(lower=0))
    meta = {"categories": CATEGORIES, "window": WINDOW, "horizon_days": HORIZON_DAYS,
            "customers": int(p["customer_id"].nunique()), "transactions": int(len(p)),
            "span_start": str(p["event_timestamp"].min()), "span_end": str(t_end),
            "train_end": str(c_train), "val_end": str(c_val),
            "n_examples": {k: (0 if v is None else int(len(v["y_cat"]))) for k, v in ex.items()},
            "amt_mean": float(all_logamt.mean()), "amt_std": float(all_logamt.std())}
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else next(RAW_DIR.glob("*"))
    print(json.dumps(run(src), indent=2))
