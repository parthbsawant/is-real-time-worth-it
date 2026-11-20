"""Shared constants for the whole project."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROC_DIR = ROOT / "data" / "processed"
MODEL_DIR = ROOT / "models"
RESULT_DIR = ROOT / "results"

CATEGORIES = [
    "home_decor", "kitchen_dining", "stationery", "toys_games", "gifts_cards",
    "bags_accessories", "lighting_candles", "garden_outdoor", "seasonal_christmas",
    "storage_organizers", "jewellery", "textiles_linens", "party_supplies", "other",
]
N_CAT = len(CATEGORIES)          # 14 classes; index 0 is reserved for padding in inputs
WINDOW = 20                      # last 20 purchases per customer
MIN_PURCHASES = 5                # customers with fewer purchases are dropped
HORIZON_DAYS = 90                # CLV = spend in the 90 days after the prediction point
SPLIT = (0.80, 0.10, 0.10)       # chronological train / validation / test
SEED = 42
