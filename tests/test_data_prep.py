import numpy as np
import pandas as pd
import pytest

from src import data_prep as dp
from src.config import HORIZON_DAYS, MIN_PURCHASES, WINDOW


def raw(rows):
    return pd.DataFrame(rows, columns=["Invoice", "StockCode", "Description", "Quantity",
                                       "InvoiceDate", "Price", "customer_id"])


def test_clean_removes_non_purchases():
    df = raw([
        ("1", "A", "MUG", 2, "2024-01-01", 3.0, 1.0),
        ("C2", "A", "MUG", -1, "2024-01-02", 3.0, 1.0),      # cancellation
        ("3", "A", "MUG", 1, "2024-01-03", 3.0, None),       # no customer
        ("4", "A", "MUG", 0, "2024-01-04", 3.0, 1.0),        # zero quantity
        ("5", "POST", "POSTAGE", 1, "2024-01-05", 9.0, 1.0), # not a product
        ("1", "A", "MUG", 2, "2024-01-01", 3.0, 1.0),        # exact duplicate
    ])
    out = dp.clean(df)
    assert list(out["Invoice"]) == ["1"]
    assert out["amount"].iloc[0] == 6.0


def test_category_rules():
    assert dp.assign_category("WHITE HANGING HEART T-LIGHT HOLDER") == "lighting_candles"
    assert dp.assign_category("PAPER CHAIN KIT 50'S CHRISTMAS") == "seasonal_christmas"
    assert dp.assign_category("zzz unknown thing") == "other"


def test_window_padding_and_mask():
    cat, gap, amt, mask = dp.encode_window(np.array([3, 5]), np.array([0.0, 1.2]), np.array([2.0, 3.0]))
    assert cat.shape == (WINDOW,) and list(cat[-2:]) == [3, 5] and cat[:-2].sum() == 0
    assert mask[:-2].sum() == 0 and mask[-2:].sum() == 2


@pytest.fixture(scope="module")
def processed(tmp_path_factory):
    from src import synth
    d = tmp_path_factory.mktemp("proc")
    path = d / "raw.csv"
    synth.make(n_customers=400, months=24).to_csv(path, index=False)
    meta = dp.run(path, d)
    return d, meta


def test_light_customers_dropped(processed):
    d, _ = processed
    p = pd.read_csv(d / "purchases.csv")
    assert p.groupby("customer_id").size().min() >= MIN_PURCHASES


def test_split_is_chronological_and_leak_free(processed):
    d, meta = processed
    t_tr, t_va = pd.Timestamp(meta["train_end"]), pd.Timestamp(meta["val_end"])
    h = pd.Timedelta(days=HORIZON_DAYS)
    for name, lo, hi in (("train", None, t_tr), ("val", t_tr, t_va), ("test", t_va, None)):
        z = np.load(d / f"{name}.npz")
        t_pred = pd.to_datetime(z["t_pred"], unit="s")
        horizon_end = t_pred + h
        if hi is not None:
            assert (horizon_end <= hi).all()        # label never uses data from a later split
        if lo is not None:
            assert (horizon_end > lo).any() or (t_pred > lo).any()


def test_shapes_and_targets(processed):
    d, _ = processed
    z = np.load(d / "train.npz")
    n = len(z["y_cat"])
    assert z["cat"].shape == (n, WINDOW) and z["mask"].shape == (n, WINDOW)
    assert z["y_cat"].min() >= 0 and z["y_cat"].max() <= 13
    assert (z["mask"].sum(axis=1) >= 1).all() and (z["y_clv"] >= 0).all()


def test_segments_cover_all_customers(processed):
    d, _ = processed
    seg = pd.read_csv(d / "customers.csv")
    assert set(seg["segment"]) == {1, 2, 3, 4}
