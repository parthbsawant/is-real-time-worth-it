"""Synthetic retail transactions in the Online Retail II layout.

Only for developing and testing the pipeline before the real dataset is downloaded.
Customers have a preferred category, favour a 'next' category after each purchase (so order
matters), and differ widely in how often they buy.
"""
import numpy as np
import pandas as pd

from .config import CATEGORIES, SEED

WORDS = {
    "home_decor": "VINTAGE HEART FRAME", "kitchen_dining": "RETRO MUG", "stationery": "NOTEBOOK PENCIL",
    "toys_games": "WOODEN PUZZLE TOY", "gifts_cards": "GIFT CARD TAG", "bags_accessories": "SHOPPER BAG",
    "lighting_candles": "SCENTED CANDLE", "garden_outdoor": "GARDEN PLANT POT", "seasonal_christmas": "CHRISTMAS DECORATION",
    "storage_organizers": "STORAGE BOX TIN", "jewellery": "BEAD NECKLACE", "textiles_linens": "CUSHION COVER",
    "party_supplies": "PARTY BALLOON", "other": "ASSORTED ITEM",
}


def make(n_customers=1500, months=24, seed=SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    k = len(CATEGORIES)
    trans = rng.dirichlet(np.full(k, 0.15), size=k)            # category -> next category
    start = np.datetime64("2023-01-01")
    days = months * 30
    rows = []
    inv = 500000
    for c in range(n_customers):
        rate = rng.lognormal(mean=-2.6, sigma=0.9)             # purchases per day, heavy-tailed
        pref = rng.dirichlet(np.full(k, 0.3))
        t, cur = rng.uniform(0, days * 0.4), rng.choice(k, p=pref)
        while t < days:
            nxt_p = 0.6 * trans[cur] + 0.4 * pref
            cur = rng.choice(k, p=nxt_p / nxt_p.sum())
            inv += 1
            ts = start + np.timedelta64(int(t * 86400), "s")
            for _ in range(rng.integers(1, 4)):
                rows.append((str(inv), f"S{cur}{rng.integers(100)}", f"{WORDS[CATEGORIES[cur]]} {rng.integers(99)}",
                             int(rng.integers(1, 12)), ts, round(float(rng.lognormal(1.0, 0.6)), 2), 10000 + c, "UK"))
            t += rng.exponential(1.0 / rate)
    return pd.DataFrame(rows, columns=["Invoice", "StockCode", "Description", "Quantity",
                                       "InvoiceDate", "Price", "Customer ID", "Country"])


if __name__ == "__main__":
    from .config import RAW_DIR
    df = make()
    out = RAW_DIR / "synthetic_retail.csv"
    df.to_csv(out, index=False)
    print(len(df), "rows ->", out)
