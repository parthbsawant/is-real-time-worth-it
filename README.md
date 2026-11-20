# Is Real-Time Worth It?

Freshness vs. Cost: batch-updated vs. real-time sequential deep learning for next-purchase and
Customer Lifetime Value (CLV) prediction. Seminar project, FCRCE Mumbai.

## Layout
```
src/            data prep, models, batch + streaming pipelines, evaluation
tests/          pytest unit tests
data/raw/       put the raw dataset here (not committed)
data/processed/ generated sequences and splits (not committed)
models/         trained weights
results/        metrics, tables and charts
scripts/        small run scripts
docker-compose.yml   Kafka + Redis for the real-time pipeline
```

## Setup (macOS)
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Step 3: data
Download *Online Retail II* (UCI) and put the file in `data/raw/`, then:
```bash
python -m src.data_prep data/raw/online_retail_II.xlsx
pytest -q
```
No dataset yet? `python -m src.synth` writes a synthetic file in the same layout to `data/raw/`.
