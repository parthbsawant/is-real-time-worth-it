import numpy as np
import pandas as pd
import pytest

from src import data_prep as dp
from src import synth
from src.windows import history_index, tick_ceil, tick_floor, window_at


def test_ticks():
    assert tick_floor(1000, 0, 300) == 900 and tick_ceil(1000, 0, 300) == 1200
    assert tick_floor(900, 0, 300) == 900 and tick_ceil(900, 0, 300) == 900
    assert tick_floor(-10, 0, 300) == -300 and tick_ceil(-10, 0, 300) == 0


@pytest.fixture(scope="module")
def data(tmp_path_factory):
    d = tmp_path_factory.mktemp("w")
    synth.make(n_customers=300, months=24).to_csv(d / "raw.csv", index=False)
    dp.run(d / "raw.csv", d)
    p = pd.read_csv(d / "purchases.csv", dtype={"customer_id": str})
    return np.load(d / "test.npz"), history_index(p)


def test_streaming_window_matches_training_arrays(data):
    z, hist = data
    for k in range(0, len(z["y_cat"]), max(1, len(z["y_cat"]) // 60)):
        t = int(z["t_target"][k])
        w = window_at(hist[str(z["customer_id"][k])], t - 1, t)
        assert (w[0] == z["cat"][k]).all() and np.allclose(w[1], z["gap"][k], atol=1e-4)
        assert np.allclose(w[2], z["amt"][k], atol=1e-4) and (w[3] == z["mask"][k]).all()


def test_batch_cutoff_never_sees_later_purchases(data):
    z, hist = data
    for k in range(0, len(z["y_cat"]), 40):
        t, cid = int(z["t_target"][k]), str(z["customer_id"][k])
        cutoff = tick_floor(t, 0, 7 * 86400)
        w = window_at(hist[cid], cutoff, t)
        if w is not None:
            ts = hist[cid][0]
            n = int(w[3].sum())
            used = ts[ts <= min(cutoff, t - 1)]
            assert n <= len(used) and n <= 20


def test_age_matches_training_array(data):
    z, hist = data
    for k in range(0, len(z["y_cat"]), max(1, len(z["y_cat"]) // 60)):
        t = int(z["t_target"][k])
        w = window_at(hist[str(z["customer_id"][k])], t - 1, t)
        assert abs(w[4] - float(z["age"][k])) < 1e-4
